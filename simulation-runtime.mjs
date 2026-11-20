// Load the same browser-free simulation kernel for Node entry points.
for (const name of ['frontier', 'construction', 'biology', 'crafting',
  'cognition', 'agency', 'emergence', 'civilization', 'receipts', 'activities',
  'reservations', 'projects', 'perception', 'evidence-memory', 'world-runtime',
  'simulation', 'persistence']) {
  await import('./public/' + name + '.js');
}

export const { Simulation, Persistence, Frontier, WorldRuntime } = globalThis;
