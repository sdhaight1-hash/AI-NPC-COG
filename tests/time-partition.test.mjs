import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function kernels(){
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 const root=vm.createContext({});
 vm.runInContext(files.map(name=>readFileSync(
  new URL('../public/'+name+'.js',import.meta.url),'utf8')).join('\n'),root);
 return root;
}
const clone=value=>JSON.parse(JSON.stringify(value));

function compareSchedules(k,minutes,configure=()=>{},ports=()=>({})){
 const batched=k.Simulation.initial(379210);
 batched.auto=false;
 configure(batched);
 const stepped=clone(batched);
 const aEvents=[],bEvents=[];
 const a=k.Simulation.advance(batched,minutes,ports(batched,aEvents));
 for(let i=0;i<minutes;i++)
  k.Simulation.advance(stepped,1,ports(stepped,bEvents));
 assert.equal(k.Simulation.canonical(batched),k.Simulation.canonical(stepped),
  'Identical elapsed game-time must produce identical authoritative state');
 assert.deepEqual(clone(aEvents),clone(bEvents),
  'Observers of the actual completed physical events must agree');
 return {batched,stepped,a};
}

test('time partition: 720 minute advance integrates every body and world minute',()=>{
 const k=kernels();
 const {batched}=compareSchedules(k,720);
 assert.equal(batched.clock,490+720);
 assert.equal(batched.npcs[0].bio.lastClock,batched.clock);
 assert.ok(batched.npcs[0].bio.hydrationBudgetMl<1950,
  '720 minutes must not silently use the 360-minute biology clamp');
});

test('time partition: a due physical action commits at its actual minute',()=>{
 const k=kernels();
 const {batched,a}=compareSchedules(k,7,state=>{
  const n=state.npcs[0],water=state.world.nodes.find(s=>s.kind==='water'&&s.stock>=3);
  assert.ok(water);
  n.x=water.x;n.y=water.y;n.z=0;n.path=[];
  n.task={key:'fill_water',ref:water.id,readyAt:state.clock+3};
  n.action='fill_water';n.inventory.water=0;
 },(state,events)=>({
  complete:n=>{
   if(!n.task||n.task.readyAt>state.clock)return;
   const key=n.task.key,result=k.AgentWorld.complete(n,state.world,state.npcs);
   events.push({clock:state.clock,key,ok:result.ok});
  }
 }));
 assert.equal(batched.npcs[0].inventory.water,2);
 assert.equal(a.advanced,true);
});

test('time partition: seasonal/day/month boundary updates and arrivals are identical',()=>{
 const k=kernels(),t=k.Frontier.DAYS_PER_MONTH*1440;
 const {batched,a}=compareSchedules(k,5,state=>{
  state.clock=t-2;
  state.world.now=state.clock;
  state.day=Math.floor(state.clock/1440)+1;
  state.world.weather=k.Frontier.weather(state.world,state.clock);
 });
 assert.equal(batched.clock,t+3);
 assert.equal(a.arrivals.length,1);
 assert.equal(batched.nextPersonId,7);
});

test('time partition: fractional game-minute advance keeps one physical slice',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 state.auto=false;
 let callbacks=0;
 const oldClock=state.clock;
 k.Simulation.advance(state,.02,{afterActors:()=>callbacks++});
 assert.equal(state.clock,oldClock+.02);
 assert.equal(callbacks,1);
});

test('time partition: unreasonably large catch-up rejects without partial mutation',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 const old=k.Simulation.canonical(state);
 assert.throws(()=>k.Simulation.advance(state,1441),
  {name:'RangeError',message:'Simulation interval exceeds one simulated day'});
 assert.equal(k.Simulation.canonical(state),old);
});

test('v3 world identity migration preserves edits, harvest, structures and actors',()=>{
 const k=kernels(),state=k.Simulation.initial(379210);
 const node=state.world.nodes[0],tile=state.npcs[0];
 node.stock-=1;
 state.world.edits['79:51:-1']='bedrock';
 state.world.structures.push({id:'shelter_1',type:'shelter',x:tile.x,y:tile.y});
 const old=clone(k.Persistence.save(state));
 delete old.world.generator;
 old.world.edits['-1:51:-1']='air';
 old.world.edits['1:1:200']='air';
 old.world.edits['1:1:-1']='invalid';
 const loaded=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(loaded,old),true);
 assert.deepEqual(clone(loaded.world.generator),clone(state.world.generator));
 assert.deepEqual(clone(loaded.world.edits),{'79:51:-1':'bedrock'});
 assert.equal(loaded.world.nodes[0].stock,node.stock);
 assert.equal(loaded.world.structures[0].id,'shelter_1');
 assert.deepEqual(clone(loaded.npcs.map(n=>n.id)),clone(state.npcs.map(n=>n.id)));
 const current=clone(k.Persistence.save(loaded));
 for(const mismatch of [{revision:2},{topology:'plane'},{seed:71934},{width:81},{zMin:-5}]){
  const fresh=k.Simulation.initial(379210),before=k.Simulation.canonical(fresh);
  const bad=clone(current);
  Object.assign(bad.world.generator,mismatch);
  assert.equal(k.Persistence.restore(fresh,bad),false);
  assert.equal(k.Simulation.canonical(fresh),before);
 }
});
