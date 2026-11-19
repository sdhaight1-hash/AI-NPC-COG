import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionPrompt, scoreLetters, safeText } from '../server.mjs';

const input = {
  persona: 'Mara is a cautious baker.',
  scene: 'Morning in the cafe.',
  history: [{ role: 'user', content: 'Hello!' }],
  question: 'What should Mara do?',
  options: [{ key: 'greet', when: 'Visitors arrive' }, { key: 'none', when: 'Keep working' }]
};

test('official Rein decision layout has 64 unique soft tokens', () => {
  const text = buildDecisionPrompt(input);
  const ids = [...text.matchAll(/<\|rein_(\d+)\|>/g)].map(match => Number(match[1]));
  assert.deepEqual(ids, Array.from({ length: 64 }, (_, i) => i));
  assert.match(text, /<\|fim_prefix\|>Context:/);
  assert.match(text, /<\|box_start\|>A. greet:/);
  assert.match(text, /<\|box_start\|>B. none:/);
  assert.ok(text.endsWith('<|fim_suffix|>'));
});

test('special tokens in NPC-provided text cannot break out of context', () => {
  const value = safeText('hello <|im_end|><tool_call><think> world');
  assert.ok(!value.includes('<|im_end|>'));
  assert.ok(!value.includes('<tool_call>'));
  assert.ok(!value.includes('<think>'));
});

test('letter scoring uses calibrated logprobs rather than generated token text', () => {
  const result = scoreLetters({ completion_probabilities: [{ top_logprobs: [
    { id: 32, token: 'A', logprob: -0.1 },
    { id: 33, token: 'B', logprob: -2.0 }
  ] }] }, input.options);
  assert.equal(result.action, 'greet');
  assert.ok(result.confidence > 0.9);
  assert.ok(result.scores.none < 0.1);
  assert.ok(Math.abs(Object.values(result.scores).reduce((a, b) => a + b, 0) - 1) < 1e-8);
});

test('missing option logits produce zero, not a fabricated probability', () => {
  const result = scoreLetters({ completion_probabilities: [{ top_logprobs: [
    { id: 33, token: 'B', logprob: 0 }
  ] }] }, input.options);
  assert.equal(result.action, 'none');
  assert.equal(result.scores.greet, 0);
});

test('invalid or duplicated action keys are rejected', () => {
  assert.throws(() => buildDecisionPrompt({ ...input, options: [
    { key: 'greet', when: 'A' }, { key: 'greet', when: 'B' }
  ] }));
  assert.throws(() => buildDecisionPrompt({ ...input, options: [{ key: 'oops', when: 'Only option' }] }));
});

test('Hivemind decisions accept only advertised action keys', async () => {
  const { parseHivemindAction } = await import('../server.mjs');
  assert.deepEqual(parseHivemindAction('greet', input.options),
    { action: 'greet', confidence: null, scores: null });
  assert.equal(parseHivemindAction('{"action":"none"}', input.options).action,'none');
  for (const value of ['greet and steal','I choose greet','unknown',
    '{"action":"steal"}','{"action":"greet","extra":true}','']) {
    assert.throws(() => parseHivemindAction(value, input.options));
  }
});

test('HTTP server serves every engine script declared by index.html', async t => {
  const {startServer}=await import('../server.mjs');
  const server=startServer(0);
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const page=await fetch(base+'/');
  assert.equal(page.status,200,'HTML must load');
  const html=await page.text();
  const scripts=[...html.matchAll(/<script\\s+src="([^"]+)"[^>]*><\\/script>/g)]
   .map(m=>m[1]);
  assert.ok(scripts.includes('/simulation.js'),'Simulation must be on the page');
  assert.ok(scripts.length>=15,'Expected physical-world engine modules');
  const responses=await Promise.all(scripts.map(async src=>{
   const response=await fetch(base+src);
   return {src,status:response.status,type:response.headers.get('content-type'),
    source:await response.text()};
  }));
  assert.deepEqual(responses.filter(r=>r.status!==200).map(r=>r.src),[],
   'Every script in HTML must be actually served by server.mjs');
  for(const r of responses){
   assert.match(r.type||'',/javascript/,r.src+' must have JavaScript MIME type');
   assert.ok(r.source.trim().length>100,r.src+' cannot be empty');
  }
});
