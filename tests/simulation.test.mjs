import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

// Execute production browser-independent kernels in a clean Node VM.
// No document, localStorage, fetch, wall clock, or model process is supplied.
function kernels(){
 const source=['frontier.js','biology.js','crafting.js','cognition.js',
  'agency.js','emergence.js','civilization.js','world-runtime.js','simulation.js','persistence.js']
  .map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8')).join('\n');
 const context=vm.createContext({});
 vm.runInContext(source,context);
 return context;
}
const digest=(runtime,state)=>createHash('sha256')
 .update(runtime.Simulation.canonical(state)).digest('hex');
function fixture(k){
 const state=k.Simulation.initial(379210);
 state.auto=false;
 // A committed, physically reachable task exercises the genuine action kernel.
 const n=state.npcs[0],source=state.world.nodes.find(x=>x.kind==='water'&&x.stock>=1);
 assert.ok(source,'Seed has a water node');
 n.x=source.x;n.y=source.y;n.z=0;n.path=[];
 n.task={key:'fill_water',ref:source.id,readyAt:state.clock+1};
 n.action='fill_water';n.inventory.water=0;
 return {state,sourceId:source.id};
}
function run(k,state,ticks,receipts=[]){
 for(let i=0;i<ticks;i++){
  const result=k.Simulation.advance(state,1,{
   complete:n=>{
    if(n.task?.readyAt>state.clock)return;
    const key=n.task.key;
    const outcome=k.AgentWorld.complete(n,state.world,state.npcs);
    receipts.push({clock:state.clock,actor:n.id,key,ok:outcome.ok,
     message:outcome.message});
   }
  });
  assert.equal(result.advanced,true);
 }
 return receipts;
}
test('browser-free 10,000-minute replay has identical world and event hash',()=>{
 const k=kernels(),a=fixture(k),b=fixture(k);
 const eventsA=run(k,a.state,10000),eventsB=run(k,b.state,10000);
 assert.ok(eventsA.some(e=>e.key==='fill_water'&&e.ok));
 assert.equal(k.Simulation.canonical(eventsA),k.Simulation.canonical(eventsB));
 assert.equal(digest(k,a.state),digest(k,b.state));
 assert.equal(a.state.clock,10490);
});
test('mid-run JSON checkpoint restores to the same authoritative state',()=>{
 const k=kernels(),continuous=fixture(k).state,split=fixture(k).state;
 const before=run(k,continuous,10000);
 const first=run(k,split,4567);
 const snapshot=JSON.parse(JSON.stringify(split));
 const rest=run(k,snapshot,5433);
 assert.equal(digest(k,continuous),digest(k,snapshot));
 assert.equal(k.Simulation.canonical(before),k.Simulation.canonical([...first,...rest]));
});
test('paused and invalid intervals do not advance authority',()=>{
 const k=kernels(),state=k.Simulation.initial(379210),before=digest(k,state);
 state.paused=true;
 assert.equal(k.Simulation.advance(state,1).advanced,false);
 state.paused=false;
 assert.equal(k.Simulation.advance(state,Number.NaN).advanced,false);
 assert.equal(digest(k,state),before);
});
test('canonical serialization is stable under key insertion order',()=>{
 const k=kernels();
 assert.equal(k.Simulation.canonical({b:1,a:{z:2,y:3}}),
  k.Simulation.canonical({a:{y:3,z:2},b:1}));
 assert.throws(()=>k.Simulation.canonical({bad:Infinity}),/Nonfinite/);
});

function firstDiff(a,b,path='state'){
 if(JSON.stringify(a)===JSON.stringify(b))return null;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')
  return path+': '+JSON.stringify(a)+' != '+JSON.stringify(b);
 for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
  const diff=firstDiff(a[key],b[key],path+'.'+key);
  if(diff)return diff;
 }
 return path+': unequal values';
}
test('real version-3 save codec preserves a pending physical job and exact output',()=>{
 const k=kernels();
 const base=k.Simulation.initial(379210);base.auto=false;
 const n=base.npcs[0];
 const resource=base.world.nodes.find(x=>x.kind==='water'&&x.stock>=3);
 assert.ok(resource);
 n.x=resource.x;n.y=resource.y;n.z=0;
 n.task={key:'fill_water',ref:resource.id,readyAt:base.clock+5};
 n.action='fill_water';
 const before=resource.stock,startingWater=n.inventory.water;
 k.Simulation.advance(base,2);
 const packed=JSON.parse(JSON.stringify(k.Persistence.save(base)));
 assert.equal(packed.version,3);
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,packed),true);
 assert.equal(restored.npcs[0].task.readyAt,base.npcs[0].task.readyAt);
 for(let i=0;i<5;i++){
  k.Simulation.advance(base,1);
  k.Simulation.advance(restored,1);
 }
 assert.equal(digest(k,base),digest(k,restored),firstDiff(base,restored));
 assert.equal(base.world.nodes.find(x=>x.id===resource.id).stock,before-2);
 assert.equal(base.npcs[0].inventory.water,startingWater+2);
});
test('version-3 save codec retains fractional progress through an in-flight movement',()=>{
 const k=kernels(),original=k.Simulation.initial(379210);
 original.auto=false;
 const actor=original.npcs[0],target=k.Frontier.neighbors(original.world,actor)[0];
 assert.ok(target);
 assert.equal(k.WorldRuntime.moveTo(original,actor,target),true);
 k.Simulation.advance(original,.02);
 assert.ok(actor.travel?.remaining>0);
 const packed=JSON.parse(JSON.stringify(k.Persistence.save(original)));
 const resumed=k.Simulation.initial(379210);resumed.auto=false;
 assert.equal(k.Persistence.restore(resumed,packed),true);
 assert.equal(resumed.npcs[0].travel.remaining,actor.travel.remaining);
 k.Simulation.advance(original,.06);
 k.Simulation.advance(resumed,.06);
 assert.equal(digest(k,original),digest(k,resumed),firstDiff(original,resumed));
});
test('headless actors perform actual tasks without model calls or browser ports',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 state.auto=true;
 const n=state.npcs[0],origin={x:n.x,y:n.y};
 let completed=false;
 for(let i=0;i<200;i++){
  k.Simulation.advance(state,1);
  if(state.npcs.some(a=>a.activityStats?.completed>0)){completed=true;break;}
 }
 assert.ok(completed,'The offline runtime must physically complete at least one action');
 assert.ok(state.npcs.some(a=>a.x!==origin.x||a.y!==origin.y||
  a.activityStats?.completed>0));
});
