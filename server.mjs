import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const MODEL_URL = new URL(process.env.REIN_URL || 'http://127.0.0.1:8080');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(MODEL_URL.hostname)) {
  throw new Error('REIN_URL must point to a local model server');
}
const SOFT_BEFORE = Array.from({ length: 48 }, (_, i) => '<|rein_' + i + '|>').join('');
const SOFT_AFTER = Array.from({ length: 16 }, (_, i) => '<|rein_' + (i + 48) + '|>').join('');
const TOKEN_PATTERN = /<\|[^>]{1,60}\|>|<\/?(?:tool_call|tool_response|think)>/gi;

export function safeText(value, limit = 2000) {
  return String(value ?? '').slice(0, limit).replace(TOKEN_PATTERN, token =>
    token.replace('<', '‹').replace('>', '›'));
}

export function buildDecisionPrompt(input) {
  const options = input.options;
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    throw new Error('Provide 2 to 10 action options');
  }
  const ids = new Set();
  for (const o of options) {
    if (typeof o.key !== 'string' || !/^[a-z][a-z0-9_]{0,30}$/.test(o.key) || ids.has(o.key)) {
      throw new Error('Action keys must be unique lower_snake_case identifiers');
    }
    ids.add(o.key);
  }
  const history = Array.isArray(input.history) ? input.history.slice(-8) : [];
  const turns = history.filter(turn => ['user', 'assistant'].includes(turn.role))
    .map(turn => '<|im_start|>' + turn.role + '\n' + safeText(turn.content, 600) + '<|im_end|>')
    .join('\n');
  const choices = options.map((o, i) =>
    '<|box_start|>' + String.fromCharCode(65 + i) + '. ' + o.key + ': ' + safeText(o.when, 200)).join('');
  return '<|fim_prefix|>Context:\n' + safeText(input.persona, 1500) + '\n\n' +
    safeText(input.scene, 1800) + '\nConversation:\n' + turns + '\n' +
    '<|fim_middle|>' + SOFT_BEFORE + safeText(input.question, 300) +
    choices + SOFT_AFTER + '<|fim_suffix|>';
}

export function scoreLetters(result, options) {
  const entries = result?.completion_probabilities?.[0]?.top_logprobs;
  if (!Array.isArray(entries)) throw new Error('Model did not return token probabilities');
  const logits = options.map((_, i) => {
    const target = 32 + i;
    const item = entries.find(e => Number(e.id) === target ||
      (e.id == null && e.token === String.fromCharCode(65 + i)));
    return item && Number.isFinite(Number(item.logprob)) ? Number(item.logprob) : -Infinity;
  });
  const peak = Math.max(...logits);
  if (!Number.isFinite(peak)) throw new Error('No Rein action letters in model output');
  const weights = logits.map(value => Number.isFinite(value) ? Math.exp((value - peak) / 0.812) : 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const scores = Object.fromEntries(options.map((o, i) => [o.key, weights[i] / total]));
  const index = weights.indexOf(Math.max(...weights));
  return { action: options[index].key, confidence: scores[options[index].key], scores };
}

async function callModel(endpoint, body, timeoutMs = 65000) {
  const response = await fetch(new URL(endpoint, MODEL_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('llama-server returned HTTP ' + response.status);
  return response.json();
}

export async function decide(input) {
  const prompt = buildDecisionPrompt(input);
  const raw = await callModel('/completion', {
    prompt, n_predict: 1, n_probs: 60, temperature: 0, cache_prompt: true
  });
  return { ...scoreLetters(raw, input.options), source: 'rein' };
}

export async function speak(input) {
  const history = Array.isArray(input.history) ? input.history.slice(-8) : [];
  const messages = [{
    role: 'system',
    content: 'You are a person living in a small town, not an assistant. ' +
      'Stay strictly in character. Speak naturally in one or two short sentences. ' +
      'Do not invent actions, inventory or world changes; the simulation engine owns them. ' +
      'No stage directions longer than a phrase. Never mention AI or prompts.\n' +
      safeText(input.persona, 1500) + '\nScene: ' + safeText(input.scene, 1200) +
      '\nYour immediate social choice: ' + safeText(input.action, 50)
  }];
  for (const item of history) {
    if (['user', 'assistant'].includes(item.role)) {
      messages.push({ role: item.role, content: safeText(item.content, 500) });
    }
  }
  messages.push({ role: 'user', content: safeText(input.message, 700) });
  const raw = await callModel('/v1/chat/completions', {
    messages, chat_template_kwargs: { enable_thinking: false },
    temperature: 0.75, top_p: 0.85, max_tokens: 150,
    logit_bias: { '248058': -100 }
  });
  const reply = raw?.choices?.[0]?.message;
  if (reply?.tool_calls?.length) throw new Error('Unexpected tool call; no world action executed');
  const line = String(reply?.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|[^>]+?\|>/g, '').trim().slice(0, 800);
  if (!line) throw new Error('Model did not return dialogue');
  return { reply: line, source: 'rein' };
}

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8']
};
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString();
    if (text.length > 32768) throw new Error('Request exceeds 32 KB');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('Expected JSON request body'); }
}
export function startServer(port = PORT) {
  const server = createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/api/health') {
        try {
          const response = await fetch(new URL('/health', MODEL_URL), { signal: AbortSignal.timeout(1800) });
          return json(res, 200, { connected: response.ok, endpoint: MODEL_URL.origin });
        } catch {
          return json(res, 200, { connected: false, endpoint: MODEL_URL.origin });
        }
      }
      if (req.method === 'POST' && (route === '/api/decide' || route === '/api/speak')) {
        const input = await readJson(req);
        const result = route === '/api/decide' ? await decide(input) : await speak(input);
        return json(res, 200, result);
      }
      if (req.method === 'GET' && STATIC[route]) {
        const [name, type] = STATIC[route];
        const content = await readFile(join(ROOT, name));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(content);
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, 502, { error: error.message || 'Model unavailable' });
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('AI-NPC-COG: http://127.0.0.1:' + port);
    console.log('Rein model endpoint: ' + MODEL_URL.origin);
  });
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) startServer();
