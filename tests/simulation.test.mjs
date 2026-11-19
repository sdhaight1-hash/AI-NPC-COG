import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

// Execute production browser-independent kernels in a clean Node VM.
// No document, localStorage, fetch, wall clock, or model process is supplied.
function kernels(){
 const source=['frontier.js','biology.js','crafting.js','cognition.js',
  'agency.js','emergence.js','civilization.js','simulation.js']
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
