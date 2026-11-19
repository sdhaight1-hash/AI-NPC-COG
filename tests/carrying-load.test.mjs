import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function kernels(){
 const root=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),root);
 return root;
}
const copy=value=>JSON.parse(JSON.stringify(value));

test('empty founders have genuinely zero carried physical load',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 const actor=state.npcs[0],original=copy(actor.inventory);
 const carried=k.AgentWorld.carrying(actor);
 assert.equal(carried.valid,true);
 assert.equal(carried.massKg,0);
 assert.equal(carried.volumeL,0);
 assert.equal(k.AgentWorld.roomFor(actor,'wood')>0,true);
 assert.deepEqual(copy(actor.inventory),original,'Reading capacity cannot create or alter items');
});

test('dense stone exceeds mass before volume and bulky fiber exceeds volume before mass',()=>{
 const k=kernels(),stone=k.Simulation.initial(379210).npcs[0];
 stone.inventory.stone=15;
 const dense=k.AgentWorld.carrying(stone);
 assert.equal(dense.valid,true);
 assert.ok(dense.massKg>dense.maxMassKg);
 assert.ok(dense.volumeL<dense.maxVolumeL);
 assert.equal(k.AgentWorld.roomFor(stone,'stone'),0);
 const fibers=k.Simulation.initial(379210).npcs[0];
 fibers.inventory.fiber=31;
 const bulky=k.AgentWorld.carrying(fibers);
 assert.ok(bulky.massKg<bulky.maxMassKg);
 assert.ok(bulky.volumeL>bulky.maxVolumeL);
 assert.equal(k.AgentWorld.roomFor(fibers,'fiber'),0);
});

test('legal early construction components fit without an invisible backpack',()=>{
 const k=kernels(),n=k.Simulation.initial(379210).npcs[0];
 n.inventory.wood=4;n.inventory.fiber=3;n.inventory.hatchet=1;
 const load=k.AgentWorld.carrying(n);
 assert.ok(load.massKg<load.maxMassKg);
 assert.ok(load.volumeL<load.maxVolumeL);
 const size=k.AgentWorld.roomFor(n,'stone');
 assert.ok(size>=1);
 assert.equal(k.AgentWorld.roomFor(n,'unknown_kind'),0);
});

test('invalid counts and unrecognized kinds cannot be interpreted as weightless loot',()=>{
 const k=kernels(),n=k.Simulation.initial(379210).npcs[0];
 n.inventory.wood=-1;
 assert.equal(k.AgentWorld.carrying(n).valid,false);
 assert.equal(k.AgentWorld.roomFor(n,'food'),0);
 n.inventory.wood=0;n.inventory.mystery=1;
 assert.equal(k.AgentWorld.carrying(n).valid,false);
});

test('carrying totals reproduce after restoring legitimate version-three inventory',()=>{
 const k=kernels(),s=k.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];
 n.inventory.wood=3;n.inventory.stone=2;n.inventory.fiber=4;
 const expected=copy(k.AgentWorld.carrying(n));
 const saved=copy(k.Persistence.save(s));
 const recovered=k.Simulation.initial(379210);recovered.auto=false;
 assert.equal(k.Persistence.restore(recovered,saved),true);
 assert.deepEqual(copy(k.AgentWorld.carrying(recovered.npcs[0])),expected);
});
