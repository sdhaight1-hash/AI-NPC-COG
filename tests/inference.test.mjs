import test from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceLane, BusyError } from '../server.mjs';

test('foreground takes priority and cancels an in-flight background inference', async () => {
  const lane = createInferenceLane();
  let started;
  const didStart = new Promise(resolve => { started = resolve; });
  const background = lane.run('background', signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    started();
  }));
  await didStart;
  const foreground = lane.run('foreground', async signal => {
    assert.equal(signal.aborted, false);
    return 'player dialogue';
  });
  await assert.rejects(background, BusyError);
  assert.equal(await foreground, 'player dialogue');
  assert.equal(lane.stats().active, null);
});

test('simultaneous background requests are discarded instead of queued', async () => {
  const lane = createInferenceLane();
  let release;
  const first = lane.run('background', () => new Promise(resolve => { release=resolve; }));
  await Promise.resolve();
  await assert.rejects(
    lane.run('background', () => Promise.resolve('stale background action')), BusyError
  );
  release('first finished');
  assert.equal(await first, 'first finished');
});

test('background inference does not jump ahead of a pending player conversation', async () => {
  const lane = createInferenceLane();
  let release;
  const first = lane.run('foreground', () => new Promise(resolve=>{release=resolve;}));
  const second = lane.run('foreground', async()=> 'second');
  await assert.rejects(lane.run('background', async()=> 'background'), BusyError);
  await Promise.resolve();
  release('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
});

test('inference lane recovers after a failed model call', async () => {
  const lane=createInferenceLane();
  await assert.rejects(lane.run('foreground', async()=>{throw new Error('bad model');}), /bad model/);
  const res=await lane.run('background', async()=>42);
  assert.equal(res,42);
});
