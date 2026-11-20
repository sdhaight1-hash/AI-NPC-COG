import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Frontier, Persistence, Simulation, WorldRuntime } from './simulation-runtime.mjs';

const SPEEDS = [1, 60, 120, 240, 3600];
const SLOTS = ['world-a.json', 'world-b.json'];
const digest = text => createHash('sha256').update(text).digest('hex');

function readCheckpoint(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const { payload, sha256 } = JSON.parse(raw);
  if (typeof payload !== 'string' || digest(payload) !== sha256)
    throw new Error('Checkpoint checksum does not match');
  const { revision, controls, snapshot } = JSON.parse(payload);
  if (!Number.isSafeInteger(revision) || revision < 1 ||
      !Number.isInteger(snapshot?.seed) || snapshot.seed < 1 || snapshot.seed > 2147483646 ||
      typeof controls?.auto !== 'boolean' || typeof controls.paused !== 'boolean' ||
      !SPEEDS.includes(controls.speed))
    throw new Error('Invalid checkpoint metadata');
  return { revision, controls, snapshot };
}

function writeCheckpoint(file, data) {
  const payload = JSON.stringify(data);
  // Only the inactive slot is overwritten. A torn write fails its checksum
  // and cannot damage the previous committed slot.
  const fd = openSync(file, 'w');
  try {
    writeFileSync(fd, JSON.stringify({ payload, sha256: digest(payload) }), 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function openWorld(directory, { seed = Frontier.DEFAULT_SEED, importFile } = {}) {
  mkdirSync(directory, { recursive: true });
  const candidates = [];
  let damaged = false;
  for (const [slot, name] of SLOTS.entries()) {
    try {
      const checkpoint = readCheckpoint(join(directory, name));
      if (checkpoint) candidates.push({ ...checkpoint, slot });
    } catch {
      damaged = true;
    }
  }

  let state;
  let speed = 240;
  let revision = 0;
  let slot = 1;
  for (const checkpoint of candidates.sort((a, b) => b.revision - a.revision)) {
    const restored = Simulation.initial(checkpoint.snapshot.seed);
    if (!Persistence.restore(restored, checkpoint.snapshot)) {
      damaged = true;
      continue;
    }
    state = restored;
    state.paused = checkpoint.controls.paused;
    state.auto = checkpoint.controls.auto;
    speed = checkpoint.controls.speed;
    revision = checkpoint.revision;
    slot = checkpoint.slot;
    break;
  }
  if (!state && (damaged || candidates.length))
    throw new Error('No readable world checkpoint. Both checkpoint files were preserved.');
  if (!state && importFile) {
    const checkpoint = JSON.parse(readFileSync(importFile, 'utf8'));
    if (!Number.isInteger(checkpoint?.seed) || checkpoint.seed < 1 || checkpoint.seed > 2147483646)
      throw new Error('Import requires a compatible v3 browser checkpoint');
    const imported = Simulation.initial(checkpoint.seed);
    if (!Persistence.restore(imported, checkpoint))
      throw new Error('Import requires a compatible v3 browser checkpoint');
    imported.paused = true;
    state = imported;
  }
  if (!state) {
    state = Simulation.initial(seed);
    for (const n of state.npcs) Frontier.reveal(state.world, n.x, n.y, 7);
  }

  const recoveryNotice = damaged ? 'Recovered from the last readable checkpoint.' : null;
  let saveError = null;
  let simulationError = null;
  let dirty = !revision || damaged;

  function save() {
    if (!dirty || simulationError) return;
    const nextSlot = 1 - slot;
    try {
      writeCheckpoint(join(directory, SLOTS[nextSlot]), {
        revision: revision + 1,
        controls: { auto: state.auto, paused: state.paused, speed },
        snapshot: Persistence.save(state)
      });
      revision++;
      slot = nextSlot;
      dirty = false;
      saveError = null;
    } catch (error) {
      saveError = 'Checkpoint write failed (' + (error.code || 'I/O error') + ').';
    }
  }

  function advance(minutes) {
    if (state.paused || simulationError) return;
    try {
      Simulation.advance(state, minutes, {
        onArrival: n => WorldRuntime.log(state, n.name + ' arrived in the wilderness.', 'social'),
        onDeath: (n, cause) => WorldRuntime.log(state, n.name + ' died of ' + cause + '.', 'warning')
      });
      dirty = true;
    } catch (error) {
      state.paused = true;
      simulationError = 'Simulation stopped: ' + error.message;
    }
  }

  function control(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
        !Object.keys(patch).length ||
        Object.keys(patch).some(key => !['paused', 'auto', 'speed'].includes(key)) ||
        ('paused' in patch && typeof patch.paused !== 'boolean') ||
        ('auto' in patch && typeof patch.auto !== 'boolean') ||
        ('speed' in patch && !SPEEDS.includes(patch.speed)))
      throw new TypeError('Expected paused, auto, or a supported speed');
    if (simulationError) return;
    if ('paused' in patch) state.paused = patch.paused;
    if ('auto' in patch) state.auto = patch.auto;
    if ('speed' in patch) speed = patch.speed;
    dirty = true;
    save();
  }

  save();
  return {
    advance, control, save,
    tick: () => advance(speed / 1200), // 50 ms, in simulated minutes.
    view: () => ({
      snapshot: Persistence.save(state), day: state.day,
      paused: state.paused, auto: state.auto, speed,
      warning: simulationError || saveError || recoveryNotice
    })
  };
}
