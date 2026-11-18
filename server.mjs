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

export class BusyError extends Error {
  constructor(message = 'Model busy; background action deferred') {
    super(message);
    this.status = 429;
  }
}

// Exactly one inference lane for llama-server --parallel 1. Foreground conversations
// preempt disposable background work, and idle background requests never build a backlog.
export function createInferenceLane() {
  let tail = Promise.resolve();
  let active = null;
  let foregroundWaiting = 0;
  let backgroundQueued = false;
  return {
    run(kind, work) {
      if (kind === 'background') {
        if (active || backgroundQueued || foregroundWaiting) {
          return Promise.reject(new BusyError());
        }
        backgroundQueued = true;
      } else if (kind === 'foreground') {
        if (foregroundWaiting >= 2) {
          return Promise.reject(new BusyError('Too many pending conversations'));
        }
        foregroundWaiting++;
        if (active?.kind === 'background') {
          active.controller.abort(new BusyError('Background inference yielded to player'));
        }
      } else {
        throw new Error('Unknown inference priority');
      }
      const job = tail.then(async () => {
        if (kind === 'background') {
          backgroundQueued = false;
          if (foregroundWaiting) throw new BusyError();
        } else {
          foregroundWaiting--;
        }
        const controller = new AbortController();
        active = { kind, controller };
        try {
          return await work(controller.signal);
        } finally {
          active = null;
        }
      });
      tail = job.then(() => {}, () => {});
      return job;
    },
    stats() {
      return { active: active?.kind ?? null, foregroundWaiting, backgroundQueued };
    }
  };
}

async function callModel(endpoint, body, signal, timeoutMs = 45000) {
  const response = await fetch(new URL(endpoint, MODEL_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal ?? new AbortController().signal])
  });
  if (!response.ok) throw new Error('llama-server returned HTTP ' + response.status);
  return response.json();
}

export async function decide(input, signal) {
  const prompt = buildDecisionPrompt(input);
  const raw = await callModel('/completion', {
    prompt, n_predict: 1, n_probs: 60, temperature: 0, cache_prompt: true
  }, signal, 24000);
  return { ...scoreLetters(raw, input.options), source: 'rein' };
}

export async function speak(input, signal) {
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
    temperature: 0.75, top_p: 0.85, max_tokens: input.short ? 56 : 120,
    logit_bias: { '248058': -100 }
  }, signal, 60000);
  const reply = raw?.choices?.[0]?.message;
  if (reply?.tool_calls?.length) throw new Error('Unexpected tool call; no world action executed');
  const line = String(reply?.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|[^>]+?\|>/g, '').trim().slice(0, 800);
  if (!line) throw new Error('Model did not return dialogue');
  return { reply: line, source: 'rein' };
}

// A two-turn NPC-to-NPC exchange is one disposable background job. Both
// utterances must succeed before the client commits either to world memory.
export async function peerExchange(input, signal) {
  const a=input?.speaker, b=input?.listener;
  if(!a || !b || typeof a.name!=='string'||typeof b.name!=='string' ||
     !a.persona || !b.persona || a.name===b.name)
    throw Object.assign(new Error('Two different participants with personas are required'),{status:400});
  const scene=safeText(input.scene,1000);
  const first=await speak({
    persona:a.persona,scene,action:'start a voluntary conversation',
    short:true,history:[],
    message:'You are speaking to '+safeText(b.name,60)+'. Begin a brief, natural '+
      'conversation about your present situation, needs, or recent experiences. '+
      'Speak only as yourself in one sentence.'
  },signal);
  const second=await speak({
    persona:b.persona,scene,action:'respond in character to a nearby resident',
    short:true,history:[],
    message:safeText(a.name,60)+' has just said: '+first.reply+
      '\nReply naturally as yourself, in one sentence. Do not invent world actions.'
  },signal);
  return {first:first.reply,second:second.reply,source:'rein'};
}

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/pixel-art.js': ['public/pixel-art.js', 'text/javascript; charset=utf-8'],
  '/emergence.js': ['public/emergence.js', 'text/javascript; charset=utf-8'],
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
  const lane = createInferenceLane();
  let lastHealthyAt = 0;
  const server = createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/api/health') {
        try {
          const response = await fetch(new URL('/health', MODEL_URL), { signal: AbortSignal.timeout(1800) });
          if (response.ok) lastHealthyAt = Date.now();
        } catch { /* Busy inference may delay /health; preserve recently confirmed status. */ }
        return json(res, 200, {
          connected: Date.now() - lastHealthyAt < 90000,
          endpoint: MODEL_URL.origin, inference: lane.stats()
        });
      }
      if (req.method === 'POST' && (route === '/api/decide' || route === '/api/speak' || route === '/api/interact' || route === '/api/peer-exchange')) {
        const input = await readJson(req);
        const started = performance.now();
        let result;
        if (route === '/api/decide') {
          result = await lane.run('background', signal => decide(input, signal));
        } else if (route === '/api/peer-exchange') {
          result = await lane.run('background', signal => peerExchange(input, signal));
        } else if (route === '/api/speak') {
          result = await lane.run('foreground', signal => speak(input, signal));
        } else {
          result = await lane.run('foreground', async signal => {
            // Rein must see the player's latest utterance during decision scoring,
            // not only during generation of the follow-up dialogue.
            const history = Array.isArray(input.history) ? input.history : [];
            const decision = await decide({
              ...input, history: [...history, { role: 'user', content: input.message }]
            }, signal);
            const speech = await speak({ ...input, action: decision.action }, signal);
            return { ...decision, reply: speech.reply };
          });
        }
        return json(res, 200, { ...result, durationMs: Math.round(performance.now() - started) });
      }
      if (req.method === 'GET' && STATIC[route]) {
        const [name, type] = STATIC[route];
        const content = await readFile(join(ROOT, name));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(content);
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, error.status || 502, { error: error.message || 'Model unavailable' });
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log('AI-NPC-COG: http://127.0.0.1:' + port);
    console.log('Rein model endpoint: ' + MODEL_URL.origin);
  });
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) startServer();
