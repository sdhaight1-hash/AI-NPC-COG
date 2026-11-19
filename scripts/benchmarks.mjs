// G0.3 — state-predicate benchmarks. No browser, network or LLM required.
// Usage: node scripts/benchmarks.mjs [--soak-days=30] [--seed=379210]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
for(const name of ['frontier','biology','crafting','cognition','agency',
 'emergence','civilization','receipts','activities','reservations','projects','perception','evidence-memory','world-runtime','simulation','persistence'])
 await import('../public/'+name+'.js');
const {Simulation,WorldRuntime,Biology,WorldReceipts}=globalThis;
const hash=state=>createHash('sha256').update(Simulation.canonical(state)).digest('hex');
function invariant(state){
 assert.equal(state.world.now,state.clock,'World clock must match simulation');
 assert.ok(state.receipts.length<=WorldReceipts.MAX,'Receipt history must be bounded');
 assert.ok(state.receiptSeq>=state.receipts.at(-1)?.sequence||!state.receipts.length);
 for(const node of state.world.nodes){
  assert.ok(Number.isFinite(node.stock)&&node.stock>=0&&node.stock<=node.max,
   'Finite world stock invalid '+node.id);
 }
 for(const n of state.npcs){
  assert.ok(n.health>0&&n.health<=100,'Dead people must not remain alive');
  for(const [kind,value] of Object.entries(n.inventory))
   assert.ok(Number.isInteger(value)&&value>=0&&value<=1000,
    n.id+' invalid '+kind+' inventory');
  assert.ok((n.memories||[]).length<=160,'Memory growth is unbounded');
  assert.ok(n.workpiece===null||n.workpiece.stage>=0,'Invalid workpiece');
 }
}
function setup(seed=379210){
 const state=Simulation.initial(seed);
 state.auto=false;
 return state;
}
function tick(state,minutes=1){
 for(let i=0;i<minutes;i++){
  Simulation.advance(state,1);
  invariant(state);
 }
}
function until(state,predicate,budget=100){
 for(let i=0;i<budget;i++){
  if(predicate())return i;
  tick(state);
 }
 throw Error('Unmet authoritative predicate after '+budget+' minutes');
}
function end(name,state,elapsed,goal){
 assert.equal(goal(),true,name+' goal predicate failed');
 return {scenario:name,pass:true,elapsedTicks:elapsed,worldHash:hash(state),
  modelCalls:0,receiptSequence:state.receiptSeq,
  committed:state.receipts.filter(r=>r.status==='COMPLETED').length,
  rejected:state.receipts.filter(r=>r.status==='FAILED'||r.status==='REJECTED').length,
  noops:state.receipts.filter(r=>r.action==='none').length};
}
function waterEmergency(seed){
 const s=setup(seed),n=s.npcs[0];s.auto=true;
 n.inventory.water=2;n.needs.thirst=96;n.bio.hydrationBudgetMl=180;
 const elapsed=until(s,()=>s.receipts.some(r=>r.action==='drink'&&r.status==='COMPLETED'),12);
 return end('critical_thirst_response',s,elapsed,()=>n.needs.thirst<65&&n.inventory.water<2);
}
function cordProduction(seed){
 const s=setup(seed),n=s.npcs[0];
 n.inventory.fiber=3;n.energy=100;
 assert.equal(WorldRuntime.begin(s,n,'craft_cord'),true);
 const elapsed=until(s,()=>n.inventory.cord===1&&n.workpiece===null,55);
 const inputs=s.receipts.filter(r=>r.action==='craft_cord'&&r.status==='COMPLETED')
  .flatMap(r=>r.delta.inventory).find(d=>d.key==='fiber');
 assert.equal(inputs?.delta,-3);
 return end('four_operation_cord',s,elapsed,()=>n.inventory.cord===1&&n.inventory.fiber===0);
}
function toolChain(seed){
 const s=setup(seed),n=s.npcs[0];
 n.inventory.fiber=3;n.inventory.stone=2;n.inventory.wood=1;n.energy=100;
 let elapsed=0;
 for(const [action,product] of [['craft_cord','cord'],['craft_blade','blade'],
  ['craft_hafted_hatchet','hatchet']]){
  if(n.plan)elapsed+=until(s,()=>!n.plan,10);
  assert.equal(WorldRuntime.begin(s,n,action),true,action+' must be legal');
  elapsed+=until(s,()=>n.inventory[product]>=1&&n.workpiece===null,100);
 }
 const finishes=s.receipts.filter(r=>r.status==='COMPLETED'&&r.action==='craft_stage');
 assert.ok(finishes.length>=9,'Three 3-stage recipes must execute physically');
 assert.equal(n.inventory.fiber,0);
 assert.equal(n.inventory.stone,0);
 return end('twelve_operation_hatchet',s,elapsed,
  ()=>n.inventory.hatchet===1&&n.craftedItems.some(x=>x.kind==='hatchet'));
}
function interruptedCraft(seed){
 const s=setup(seed),n=s.npcs[0];
 n.inventory.fiber=3;n.inventory.water=2;n.energy=100;
 assert.equal(WorldRuntime.begin(s,n,'craft_cord'),true);
 tick(s,2);assert.ok(n.workpiece);
 assert.equal(WorldRuntime.begin(s,n,'craft_stage'),true);
 const stageBefore=n.workpiece.stage;
 n.needs.thirst=96;n.bio.hydrationBudgetMl=120;s.auto=true;
 tick(s);
 assert.equal(n.workpiece.stage,stageBefore);
 assert.ok(n.task?.key==='drink'||n.action==='drink','Emergency did not preempt ongoing work');
 const elapsed=until(s,()=>n.inventory.cord>=1&&n.workpiece===null,100)+3;
 return end('interrupted_craft_resumes',s,elapsed,()=>n.inventory.cord>=1);
}
function falseBelief(seed){
 const s=setup(seed),n=s.npcs[0];
 const node=s.world.nodes.find(v=>v.kind==='wood'&&v.stock>0);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 const option=WorldRuntime.available(s,n).find(o=>o.key==='inspect');
 assert.ok(option?.ref,'Physical inspection target required');
 const entity=s.world.nodes.find(v=>v.id===option.ref)||
  s.world.structures.find(v=>v.id===option.ref);
 n.agency.beliefs.push({ref:option.ref,kind:entity?.kind||'unknown',x:n.x,y:n.y,
  at:s.clock,confidence:1,status:'depleted',stock:0});
 assert.equal(WorldRuntime.begin(s,n,'inspect'),true);
 const elapsed=until(s,()=>s.receipts.some(r=>r.action==='inspect'&&r.status==='COMPLETED'),8);
 const observed=n.agency.beliefs.find(b=>b.ref===option.ref);
 return end('mistaken_resource_belief_revised',s,elapsed,
  ()=>!!observed&&observed.status!=='depleted'&&
   n.knowledge.observations.some(x=>x.id===option.ref));
}
function twoActorTrade(seed){
 const s=setup(seed),[n,other]=s.npcs;
 other.x=n.x;other.y=n.y;
 n.inventory.food=2;n.bio=Biology.restore(n.bio,2);
 other.inventory.food=0;other.bio=Biology.restore(other.bio,0);
 assert.equal(WorldRuntime.begin(s,n,'share_food'),true);
 const elapsed=until(s,()=>s.receipts.some(r=>r.action==='share_food'&&r.status==='COMPLETED'),10);
 const receipt=s.receipts.find(r=>r.action==='share_food'&&r.status==='COMPLETED');
 assert.ok(receipt.delta.otherActors?.some(x=>x.actorId===other.id&&
  x.inventory.some(d=>d.key==='food'&&d.delta===1)));
 return end('two_actor_finite_transfer',s,elapsed,
  ()=>n.inventory.food===1&&other.inventory.food===1);
}
export const scenarios={
 critical_thirst_response:waterEmergency,
 four_operation_cord:cordProduction,
 twelve_operation_hatchet:toolChain,
 interrupted_craft_resumes:interruptedCraft,
 mistaken_resource_belief_revised:falseBelief,
 two_actor_finite_transfer:twoActorTrade
};
export function runScenarios(seed=379210){
 return Object.entries(scenarios).map(([name,fn])=>{
  try{return fn(seed);}
  catch(e){return {scenario:name,pass:false,error:String(e.stack||e)};}
 });
}
export function assertCraftConservation(initialFiber,finalFiber,producedCord){
 assert.equal(initialFiber-finalFiber,producedCord*3,
  'Manufacturing must consume exactly three plant fibers per cord');
}
export function runSoak(seed=379210,days=30){
 const state=setup(seed);state.auto=true;
 const ticks=days*1440,deathDetails=[];
 assert.ok(Number.isInteger(ticks)&&ticks>0&&ticks<=1440*120);
 for(let i=0;i<ticks;i++){
  // Check cheaply every hour; action-specific receipts are checked separately.
  Simulation.advance(state,1,{onDeath:(actor,cause)=>{
   const nearest=state.world.nodes.filter(s=>s.kind==='water')
    .map(s=>({id:s.id,stock:s.stock,
     distance:globalThis.Frontier.distance(state.world,actor,s)}))
    .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0]||null;
   const waterPath=nearest?.id?WorldRuntime.pathfind(state,actor,
    state.world.nodes.find(x=>x.id===nearest.id)):null;
   let possibleActions=[];
   try{possibleActions=WorldRuntime.available(state,actor).map(o=>o.key);}catch{}
   deathDetails.push({actorId:actor.id,clock:state.clock,cause,
    position:{x:actor.x,y:actor.y,z:actor.z},
    action:actor.action,task:actor.task?.key||null,
    plan:actor.plan?.key||null,peerPending:!!actor.peerPending,
    peerReservedFor:actor.peerReservedFor||null,possibleActions,
    nearestWaterPath:waterPath?.length??null,
    needs:{...actor.needs},energy:actor.energy,
    hydrationMl:actor.bio?.hydrationBudgetMl??null,
    inventory:{...actor.inventory},nearestWater:nearest,
    recentActions:state.receipts.filter(r=>r.actorId===actor.id)
     .slice(-12).map(r=>({clock:r.clock,action:r.action,status:r.status,reason:r.reason}))});
  }});
  if(i%60===0)invariant(state);
 }
 invariant(state);
 const completed=state.receipts.filter(r=>r.status==='COMPLETED').length;
 assert.ok(completed>0,'Autonomous residents must finish physical work');
 const deathCauses={};
 for(const d of state.dead)deathCauses[d.cause]=(deathCauses[d.cause]||0)+1;
 const firstDeathAt=state.dead.length?Math.min(...state.dead.map(d=>d.deathAt)):null;
 return {scenario:'autonomous_'+days+'_day_soak',pass:true,elapsedTicks:ticks,
  initialFounders:5,alive:state.npcs.length,deaths:state.dead.length,
  founderSurvivors:state.npcs.filter(n=>n.spawnKind==='founder').length,
  deathCauses,firstDeathDay:firstDeathAt===null?null:1+Math.floor(firstDeathAt/1440),
  arrivals:Math.max(0,state.nextPersonId-6),worldHash:hash(state),
  retainedReceipts:state.receipts.length,completed,
  deathDetails,modelCalls:0};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/benchmarks.mjs')){
 const option=process.argv.find(v=>v.startsWith('--seed='));
 const seed=option?Number(option.slice(7)):379210;
 const daysArg=process.argv.find(v=>v.startsWith('--soak-days='));
 const days=daysArg?Number(daysArg.slice(12)):0;
 const reports=runScenarios(seed);
 if(days)reports.push(runSoak(seed,days));
 console.log(JSON.stringify(reports,null,2));
 if(reports.some(r=>!r.pass))process.exitCode=1;
}
