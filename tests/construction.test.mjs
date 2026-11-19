import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function kernels(){
 const files=['frontier.js','construction.js','biology.js','crafting.js',
  'cognition.js','agency.js','emergence.js','civilization.js','receipts.js',
  'activities.js','reservations.js','projects.js','perception.js',
  'evidence-memory.js','world-runtime.js','simulation.js','persistence.js'];
 const context=vm.createContext({});
 vm.runInContext(files.map(file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8'))
  .join('\n'),context);
 return context;
}
function terrainCell(state,k){
 for(let y=0;y<state.world.height;y++)for(let x=0;x<state.world.width;x++){
  const p={x,y,z:0};
  if(k.Frontier.traversable(state.world,x,y,0))return p;
 }
 throw Error('No traversable ground on seed');
}
test('construction blueprints use layer-specific slots without spawning buildings',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 state.world.now=state.clock;
 const p=terrainCell(state,k),world=state.world,n=state.npcs[0];
 const before=JSON.stringify({structures:world.structures,items:world.items});
 const floor=k.Construction.plan(world,'floor',p,n.id);
 assert.equal(floor?.kind,'floor');
 assert.equal(floor?.status,'PLANNED');
 assert.equal(k.Construction.plan(world,'floor',p,n.id),null,'Duplicate floor slot');
 assert.equal(k.Construction.plan(world,'wall',p,n.id)?.kind,'wall',
  'Floor and wall occupy distinct construction layers');
 assert.equal(k.Construction.plan(world,'door',p,n.id),null,
  'Doors and walls conflict on a single barrier slot');
 assert.equal(k.Construction.plan(world,'roof',p,n.id)?.kind,'roof');
 assert.equal(world.construction.tiles.length,0,'Blueprints are not finished tiles');
 assert.equal(JSON.stringify({structures:world.structures,items:world.items}),before,
  'Planning grants zero physical materials or shelter');
 assert.equal(k.Construction.cancel(world,floor.id,'person_99'),false);
 assert.equal(k.Construction.cancel(world,floor.id,n.id),true);
 assert.equal(k.Construction.plan(world,'floor',p,n.id)?.kind,'floor',
  'A cancelled plan frees its coordinate');
});
test('partial blueprints roundtrip through existing v3 world saves with identical state',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 state.world.now=state.clock;
 const p=terrainCell(state,k),n=state.npcs[0];
 k.Construction.plan(state.world,'floor',p,n.id);
 k.Construction.plan(state.world,'wall',p,n.id);
 const encoded=JSON.parse(JSON.stringify(k.Persistence.save(state)));
 const restored=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(restored,encoded),true);
 assert.equal(k.Simulation.canonical(restored.world.construction),
  k.Simulation.canonical(state.world.construction));
 assert.equal(restored.world.construction.blueprints.length,2);
 const older=JSON.parse(JSON.stringify(encoded));
 delete older.world.construction;
 const backward=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(backward,older),true);
 assert.equal(backward.world.construction.blueprints.length,0,
  'Old version-3 saves are valid and empty by default');
});
test('malicious or stale saves cannot mint finished tiles or overlapping plans',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 state.world.now=state.clock;
 const p=terrainCell(state,k),n=state.npcs[0];
 const good=k.Construction.plan(state.world,'floor',p,n.id);
 const save=JSON.parse(JSON.stringify(k.Persistence.save(state)));
 save.world.construction.blueprints.push(
  {...good,id:'bp_7'},
  {...good,id:'bp_8',kind:'wall',x:-1},
  {...good,id:'bp_9',kind:'wall',actorId:'god'},
  {...good,id:'bp_10',kind:'wall',plannedAt:state.clock+100},
  {...good,id:'bp_11',kind:'unknown'},
  {...good,id:'bp_12',kind:'roof',z:k.Frontier.MAX_Z+1}
 );
 save.world.construction.tiles=[{kind:'wall',...p,built:true}];
 const restored=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(restored,save),true);
 assert.equal(restored.world.construction.tiles.length,0,
  'Unreceipted completed tiles from saves have no authority');
 assert.equal(restored.world.construction.blueprints.length,1);
 assert.equal(restored.world.construction.blueprints[0].id,good.id);
 assert.ok(restored.world.construction.nextId>Number(good.id.slice(3)));
});
