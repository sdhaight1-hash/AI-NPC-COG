import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('sandbox speaks Rein decision and dialogue protocol over HTTP', async t => {
  const calls = [];
  const model = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"status":"ok"}');
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    calls.push({ path: req.url, payload });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/completion') {
      return res.end(JSON.stringify({ completion_probabilities: [{ top_logprobs: [
        { id: 32, token: 'A', logprob: -0.01 },
        { id: 33, token: 'B', logprob: -5 }
      ] }] }));
    }
    if (req.url === '/v1/chat/completions') {
      return res.end(JSON.stringify({ choices: [{ message: { content: 'Hello, traveler!' } }] }));
    }
    res.end('{}');
  });
  model.listen(0, '127.0.0.1');
  await once(model, 'listening');
  t.after(() => new Promise(resolve => model.close(resolve)));

  process.env.REIN_URL = 'http://127.0.0.1:' + model.address().port;
  const { startServer } = await import('../server.mjs?integration-test');
  const app = startServer(0);
  await once(app, 'listening');
  t.after(() => new Promise(resolve => app.close(resolve)));
  const origin = 'http://127.0.0.1:' + app.address().port;

  const health = await (await fetch(origin + '/api/health')).json();
  assert.equal(health.connected, true);

  const decideResponse = await fetch(origin + '/api/decide', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      persona: 'A cautious baker', scene: 'It is raining',
      history: [{ role: 'user', content: 'Hello there' }],
      question: 'How should the baker respond?',
      options: [{ key: 'greet', when: 'Friendly visitor' }, { key: 'none', when: 'Stay quiet' }]
    })
  });
  assert.equal(decideResponse.status, 200);
  const decision = await decideResponse.json();
  assert.equal(decision.action, 'greet');
  assert.ok(decision.confidence > 0.99);
  assert.equal(calls[0].path, '/completion');
  assert.equal(calls[0].payload.n_predict, 1);
  assert.equal(calls[0].payload.n_probs, 60);
  assert.match(calls[0].payload.prompt, /<\|rein_63\|><\|fim_suffix\|>$/);

  const speakResponse = await fetch(origin + '/api/speak', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ persona: 'A cautious baker', scene: 'It is raining',
      history: [], message: 'Hello there', action: decision.action })
  });
  assert.equal(speakResponse.status, 200);
  const speech = await speakResponse.json();
  assert.equal(speech.reply, 'Hello, traveler!');
  assert.equal(calls[1].path, '/v1/chat/completions');
  assert.equal(calls[1].payload.logit_bias['248058'], -100);
  assert.equal(calls[1].payload.chat_template_kwargs.enable_thinking, false);

  const interactResponse = await fetch(origin + '/api/interact', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      persona: 'A cautious baker', scene: 'Morning at the cafe',
      history: [{role:'assistant',content:'Welcome!'}],
      question: 'How should the baker respond to the latest request?',
      options: [{ key:'helpful',when:'Provide assistance' }, {key:'refuse',when:'Decline' }],
      message:'Could you help me find the library?'
    })
  });
  assert.equal(interactResponse.status, 200);
  const interaction = await interactResponse.json();
  assert.equal(interaction.action, 'helpful');
  assert.equal(interaction.reply, 'Hello, traveler!');
  assert.equal(typeof interaction.durationMs, 'number');
  assert.equal(calls[2].path, '/completion');
  assert.match(calls[2].payload.prompt, /Could you help me find the library\?/);
  assert.equal(calls[3].path, '/v1/chat/completions');
  assert.equal(calls[3].payload.messages.at(-1).content, 'Could you help me find the library?');
  assert.match(calls[3].payload.messages[0].content, /helpful/);

  const html = await fetch(origin + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Hearthbrook Village/);
  const js = await fetch(origin + '/app.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /function pathfind/);
});
