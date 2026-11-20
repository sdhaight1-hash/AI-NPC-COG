import test from 'node:test';
import {createHash} from 'node:crypto';
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

test('checkpoint preserves separate memories and an intentionally dormant workpiece',()=>{
 const k=kernels(),original=k.Simulation.initial(379210),actor=original.npcs[0];
 original.auto=false;
 const previousX=(actor.x+1)%original.world.width;
 actor.workpiece={recipe:'crate',stage:0,workmanship:1,materialQuality:2,
  station:null,x:previousX,y:actor.y,startedAt:original.clock-20};
 actor.plan=null;actor.nextPlanAt=original.clock+2;actor.lastPeerAt=original.clock-10;
 const shelter={id:'shelter_1',type:'shelter',x:actor.x,y:actor.y,
  craftQuality:2,maker:actor.id};
 original.world.structures.push(shelter);
 // A bounded history can become adjacent when the intervening episode expires.
 actor.memories=[{text:'Interrupted work',at:original.clock-3,kind:'need',
  action:'',ref:'',x:actor.x,y:actor.y,salience:4},
  {text:'Interrupted work',at:original.clock-1,kind:'need',
   action:'',ref:'',x:previousX,y:actor.y,salience:4}];
 const reopened=k.Simulation.initial(379210);reopened.auto=false;
 assert.equal(k.Persistence.restore(reopened,clone(k.Persistence.save(original))),true);
 const resident=reopened.npcs[0];
 assert.deepEqual(clone(resident.memories),clone(actor.memories));
 assert.deepEqual(clone(resident.workpiece),clone(actor.workpiece));
 assert.deepEqual(clone(reopened.world.structures[0]),clone(shelter));
 assert.equal(resident.nextPlanAt,actor.nextPlanAt);
 assert.equal(resident.lastPeerAt,actor.lastPeerAt);
 assert.equal(resident.plan,null);
 k.Simulation.advance(reopened,5);
 assert.equal(resident.task,null);
 assert.equal(resident.plan,null);
});

test('time partition: 720 minute advance integrates every body and world minute',()=>{
 const k=kernels();
 const {batched}=compareSchedules(k,720);
 assert.equal(batched.clock,490+720);
 assert.equal(batched.npcs[0].bio.lastClock,batched.clock);
 assert.ok(batched.npcs[0].bio.hydrationBudgetMl<1950,
  '720 minutes must not silently use the 360-minute biology clamp');
});

function equipFlask(n,clock){
 n.inventory.flask=1;
 n.craftedItems ||= [];
 n.craftedItems.push({kind:'flask',quality:2,maker:n.id,
  craftedAt:clock,method:'flask',materialQuality:2});
}

test('time partition: a due physical action commits at its actual minute',()=>{
 const k=kernels();
 const {batched,a}=compareSchedules(k,7,state=>{
  const n=state.npcs[0],water=state.world.nodes.find(s=>s.kind==='water'&&s.stock>=3);
  assert.ok(water);
  n.x=water.x;n.y=water.y;n.z=0;n.path=[];
  equipFlask(n,state.clock);
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

test('initial and restored clocks and weather agree before the next step',()=>{
 const k=kernels(),s=k.Simulation.initial(379210);
 assert.equal(s.world.now,s.clock);
 assert.deepEqual(clone(s.world.weather),clone(k.Frontier.weather(s.world,s.clock)));
 s.clock=81*1440+65;s.day=k.Frontier.calendar(s.clock).totalDay;
 s.world.now=s.clock;s.world.weather=k.Frontier.weather(s.world,s.clock);
 const packet=clone(k.Persistence.save(s));
 // Weather and the derived day come from the validated clock and seed.
 packet.world.now=100;packet.world.weather={kind:'invalid'};
 const resumed=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(resumed,packet),true);
 assert.equal(resumed.clock,s.clock);
 assert.equal(resumed.day,s.day);
 assert.equal(resumed.world.now,s.clock);
 assert.deepEqual(clone(resumed.world.weather),clone(s.world.weather));
});

test('month crossing keeps arrival, mortality, work, and save/replay ordering',()=>{
 const k=kernels();
 function start(){
  const s=k.Simulation.initial(379210);s.auto=false;
  s.clock=k.Frontier.DAYS_PER_MONTH*1440-1;s.world.now=s.clock;
  s.day=k.Frontier.calendar(s.clock).totalDay;
  s.world.weather=k.Frontier.weather(s.world,s.clock);
  const [dying,working]=s.npcs;
  dying.health=.01;dying.needs.thirst=100;dying.bio.hydrationBudgetMl=0;
  const source=s.world.nodes.find(n=>n.kind==='water'&&n.stock>3);
  working.x=source.x;working.y=source.y;
  working.needs.thirst=80;working.bio.hydrationBudgetMl=300;
  assert.equal(k.WorldRuntime.begin(s,working,'drink_source'),true);
  return s;
 }
 const ones=start(),tens=start(),whole=start(),split=start();
 for(let i=0;i<360;i++)k.Simulation.advance(ones,1);
 for(let i=0;i<36;i++)k.Simulation.advance(tens,10);
 k.Simulation.advance(whole,360);
 k.Simulation.advance(split,180);
 const resumed=k.Simulation.initial(379210);resumed.auto=false;
 assert.equal(k.Persistence.restore(resumed,clone(k.Persistence.save(split))),true);
 k.Simulation.advance(resumed,180);
 const canonical=s=>createHash('sha256').update(k.Simulation.canonical(k.Persistence.save(s))).digest('hex');
 assert.equal(canonical(tens),canonical(ones));
 assert.equal(canonical(whole),canonical(ones));
 assert.equal(canonical(resumed),canonical(ones));
 assert.equal(ones.dead.length,1);
 assert.equal(ones.dead[0].id,'person_1');
 assert.equal(ones.dead[0].deathAt,k.Frontier.DAYS_PER_MONTH*1440);
 assert.equal(ones.npcs.find(n=>n.id==='person_6').spawnAt,ones.dead[0].deathAt);
 const drinks=ones.receipts.filter(r=>r.actorId==='person_2'&&r.action==='drink_source'&&r.status==='COMPLETED');
 assert.equal(drinks.length,1);
 assert.equal(drinks[0].clock,ones.dead[0].deathAt);
});
