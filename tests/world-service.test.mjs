import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Simulation, Persistence, WorldRuntime } from '../simulation-runtime.mjs';
import { openWorld } from '../world-service.mjs';
import { startServer } from '../server.mjs';

function temporaryWorld(t) {
  const directory = mkdtempSync(join(tmpdir(), 'npc-world-'));
  t.after(() => {
    for (const file of ['world-a.json', 'world-b.json', 'browser-export.json']) rmSync(join(directory, file), { force: true });
    rmdirSync(directory);
  });
  return directory;
}

function seedCheckpoint(directory, state) {
  const payload = JSON.stringify({
    revision: 1, controls: { paused: false, auto: false, speed: 240 },
    snapshot: Persistence.save(state)
  });
  const sha256 = createHash('sha256').update(payload).digest('hex');
  writeFileSync(join(directory, 'world-a.json'), JSON.stringify({ payload, sha256 }));
}

test('a timed harvest resumes after restart with one debit and the same canonical checkpoint', t => {
  const directory = temporaryWorld(t);
  const state = Simulation.initial(379210);
  state.auto = false;
  const n = state.npcs[0];
  const wood = state.world.nodes.find(x => x.kind === 'wood' && x.stock >= 2);
  Object.assign(n, { x: wood.x, y: wood.y, z: wood.z || 0, energy: 100, path: [] });
  assert.equal(WorldRuntime.begin(state, n, 'collect_wood'), true);
  const command = n.task.commandId;
  seedCheckpoint(directory, state);
  const continuous = openWorld(directory);
  const interrupted = openWorld(directory);
  continuous.advance(4);
  interrupted.advance(2);
  interrupted.save();
  const resumed = openWorld(directory);
  assert.equal(resumed.view().snapshot.npcs[0].task.commandId, command);
  assert.equal(resumed.view().snapshot.npcs[0].inventory.wood, 0);
  resumed.advance(2);
  const snapshot = resumed.view().snapshot;
  const commits = snapshot.receipts.filter(x => x.commandId === command && x.status === 'COMPLETED');
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].delta.nodeStock.map(x => x.delta), [-2]);
  assert.equal(snapshot.reservations.some(x => x.commandId === command), false);
  assert.equal(Simulation.canonical(snapshot), Simulation.canonical(continuous.view().snapshot));
});

test('a corrupt newest checkpoint recovers the previous saved world and fails closed if both are damaged', t => {
  const directory = temporaryWorld(t);
  const world = openWorld(directory);
  world.control({ paused: true, auto: false, speed: 120 });
  world.control({ speed: 60 });
  const corrupt = join(directory, 'world-a.json');
  writeFileSync(corrupt, '{"truncated":');
  const restored = openWorld(directory);
  assert.equal(restored.view().paused, true);
  assert.equal(restored.view().auto, false);
  assert.equal(restored.view().speed, 120);
  assert.match(restored.view().warning, /Recovered/);
  for (const name of ['world-a.json', 'world-b.json'])
    writeFileSync(join(directory, name), 'damaged');
  assert.throws(() => openWorld(directory), /No readable world checkpoint/);
  for (const name of ['world-a.json', 'world-b.json'])
    assert.equal(readFileSync(join(directory, name), 'utf8'), 'damaged');
});

test('a failed checkpoint freezes ticks and preserves the committed slot until retry', t => {
  const directory = temporaryWorld(t);
  const world = openWorld(directory);
  const committed = join(directory, 'world-a.json');
  const blockedSlot = join(directory, 'world-b.json');
  const original = readFileSync(committed, 'utf8');
  mkdirSync(blockedSlot);
  try {
    world.tick();
    const clock = world.view().snapshot.clock;
    world.save();
    assert.equal(world.view().paused, true);
    assert.match(world.view().warning, /Checkpoint write failed/);
    for (let i = 0; i < 50; i++) world.tick();
    assert.equal(world.view().snapshot.clock, clock);
    assert.equal(readFileSync(committed, 'utf8'), original);
  } finally {
    rmdirSync(blockedSlot);
  }
  const frozen = world.view().snapshot.clock;
  world.save();
  assert.equal(world.view().warning, null);
  assert.equal(world.view().paused, false);
  assert.equal(openWorld(directory).view().snapshot.clock, frozen);
  world.tick();
  assert.ok(world.view().snapshot.clock > frozen);
});

test('observer snapshots leave the clock alone and only the process tick advances it', t => {
  const world = openWorld(temporaryWorld(t));
  const before = world.view().snapshot.clock;
  for (let i = 0; i < 50; i++) assert.equal(world.view().snapshot.clock, before);
  world.tick();
  assert.equal(world.view().snapshot.clock, before + 240 / 1200);
  world.control({ paused: true });
  world.tick();
  assert.equal(world.view().snapshot.clock, before + 240 / 1200);
});

test('local HTTP observers share pause and speed without controlling tick progression', async t => {
  const directory = temporaryWorld(t);
  const server = startServer(0, { worldDirectory: directory });
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const entry = await fetch(base, { redirect: 'manual' });
    assert.equal(entry.headers.get('location'), '/?world=server');
    await entry.text();
    const control = (patch, headers = {}) => fetch(base + '/api/world/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(patch)
    });
    const paused = await control({ paused: true, speed: 120 });
    assert.equal(paused.status, 200);
    const clock = (await paused.json()).snapshot.clock;
    const [a, b] = await Promise.all([fetch(base + '/api/world'), fetch(base + '/api/world')]);
    for (const response of [a, b]) {
      const view = await response.json();
      assert.equal(view.snapshot.clock, clock);
      assert.equal(view.speed, 120);
      assert.equal(view.paused, true);
    }
    const wrongOrigin = await control({ paused: false }, { Origin: 'http://localhost:1' });
    assert.equal(wrongOrigin.status, 403);
    await wrongOrigin.text();
    const unsupported = await control({ clock: 1000 });
    assert.equal(unsupported.status, 400);
    await unsupported.text();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('imports a browser export once, opens paused, and retains the original export', t => {
  const directory = temporaryWorld(t);
  const importFile = join(directory, 'browser-export.json');
  const original = Simulation.initial(431117);
  original.auto = false;
  Simulation.advance(original, 25);
  const raw = JSON.stringify(Persistence.save(original));
  writeFileSync(importFile, raw);
  const imported = openWorld(directory, { importFile });
  assert.equal(imported.view().snapshot.clock, original.clock);
  assert.equal(imported.view().snapshot.seed, 431117);
  assert.equal(imported.view().paused, true);
  assert.equal(readFileSync(importFile, 'utf8'), raw);
  imported.control({ paused: false });
  imported.advance(2);
  imported.save();
  const restarted = openWorld(directory, { importFile });
  assert.equal(restarted.view().snapshot.clock, original.clock + 2);
  assert.equal(restarted.view().paused, false);
  assert.equal(readFileSync(importFile, 'utf8'), raw);
});

test('an incompatible browser export leaves the world directory without replacement checkpoints', t => {
  const directory = temporaryWorld(t);
  const importFile = join(directory, 'browser-export.json');
  writeFileSync(importFile, '{"seed":379210,"version":2}');
  assert.throws(() => openWorld(directory, { importFile }), /compatible v3/);
  for (const name of ['world-a.json', 'world-b.json'])
    assert.throws(() => readFileSync(join(directory, name)), { code: 'ENOENT' });
});
