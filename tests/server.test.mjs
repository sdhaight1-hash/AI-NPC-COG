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
