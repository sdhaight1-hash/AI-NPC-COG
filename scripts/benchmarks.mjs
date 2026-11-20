// G0.3 — state-predicate benchmarks. No browser, network or LLM required.
// Usage: node scripts/benchmarks.mjs [--soak-days=30] [--seed=379210] [--profile=no-llm | --compare] [--start-day=1]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
for(const name of ['frontier','construction','biology','crafting','cognition','agency',
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
 for(let elapsed=0;elapsed<=budget;elapsed++){
  if(predicate())return elapsed;
  if(elapsed<budget)tick(state);
 }
 throw Error('Unmet authoritative predicate after '+budget+' minutes');
}
function liveActivityCounters(state){
 const keys=['started','completed','failed','blocked','abandoned'];
 return Object.fromEntries(keys.map(key=>[key,state.npcs.reduce((total,n)=>
  total+(Number.isInteger(n.activityStats?.[key])?n.activityStats[key]:0),0)]));
}
function end(name,state,elapsed,goal){
 assert.equal(goal(),true,name+' goal predicate failed');
 return {scenario:name,pass:true,elapsedTicks:elapsed,worldHash:hash(state),
  modelCalls:0,goalsCompleted:1,receiptSequence:state.receiptSeq,
  committed:state.receipts.filter(r=>r.status==='COMPLETED').length,
  rejected:state.receipts.filter(r=>r.status==='FAILED'||r.status==='REJECTED').length,
  noops:state.receipts.filter(r=>r.action==='none').length,
  liveActivityCounters:liveActivityCounters(state)};
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
 assertCraftConservation(3,n.inventory.fiber,n.inventory.cord);
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
function interruptedShelter(seed){
 const s=setup(seed),n=s.npcs[0];
 Object.assign(n.inventory,{wood:4,fiber:3,water:2});
 n.knowledge.recipes.push('shelter');
 n.energy=100;
 assert.equal(WorldRuntime.begin(s,n,'craft_shelter'),true);
 tick(s,2);
 assert.equal(n.workpiece?.recipe,'shelter');
 assert.equal(WorldRuntime.begin(s,n,'craft_stage'),true);
 const command=n.task.commandId;
 tick(s,2);
 const retained=n.currentActivity.workDone;
 assert.ok(retained>0);
 n.needs.thirst=96;n.bio.hydrationBudgetMl=120;
 assert.equal(WorldRuntime.survival(s,n),true);
 assert.equal(n.suspendedActivities.at(-1).workDone,retained);
 assert.ok(!s.world.structures.some(site=>site.type==='shelter'));
 tick(s,1);
 assert.equal(WorldRuntime.begin(s,n,'craft_stage','resume'),true);
 assert.equal(n.task.commandId,command);
 const elapsed=until(s,()=>s.world.structures.some(site=>site.type==='shelter'),180)+5;
 const events=s.receipts.filter(r=>r.commandId===command);
 assert.ok(events.some(r=>r.status==='INTERRUPTED')&&events.some(r=>r.status==='RESUMED'));
 assert.equal(events.filter(r=>r.status==='COMPLETED').length,1);
 return end('interrupted_shelter_resumes',s,elapsed,()=>n.workpiece===null&&
  n.inventory.wood===0&&n.inventory.fiber===0&&s.world.structures.length===1);
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

function autonomousVesselFromEmptyHands(seed){
 const s=setup(seed),n=s.npcs[0],{Projects,Frontier}=globalThis;
 // Controlled geography, not granted inventory: move existing finite deposits
 // onto four visible, traversable tiles to isolate the physical supply chain.
 s.npcs=[n];
 n.needs.thirst=50;n.bio.hydrationBudgetMl=2100;n.energy=100;
 assert.ok(Object.values(n.inventory).every(count=>count===0),
  'A benchmark founder must own no starting supplies');
 const kinds=['water','fiber','stone','wood'];
 const nodes=kinds.map(kind=>{
  const stockRequired=kind==='fiber'?3:kind==='stone'?2:1;
  const node=s.world.nodes.find(x=>x.kind===kind&&x.stock>=stockRequired);
  assert.ok(node,'Finite world deposit required for '+kind);
  return node;
 });
 const tiles=[{x:n.x,y:n.y,z:0},...Frontier.neighbors(s.world,n)
  .filter(p=>Frontier.traversable(s.world,p.x,p.y,p.z||0))].slice(0,4);
 assert.equal(tiles.length,4,'Benchmark terrain must have three safe neighboring tiles');
 for(let i=0;i<nodes.length;i++){
  nodes[i].x=tiles[i].x;nodes[i].y=tiles[i].y;nodes[i].z=0;
 }
 s.world.nodes=nodes;
 const initialStocks=Object.fromEntries(nodes.map(x=>[x.kind,x.stock]));
 assert.equal(Projects.maybeStart(s,n)?.kind,'water_vessel',
  'A personal sighting and portable-water need must choose the project');
 const elapsed=until(s,()=>n.project?.status==='COMPLETED',700);
 const receipts=s.receipts.filter(r=>r.status==='COMPLETED');
 const expectedActions=['collect_fiber','collect_stone','collect_wood',
  'craft_cord','craft_blade','craft_hollow_wood_trial'];
 for(const action of expectedActions)
  assert.ok(receipts.some(r=>r.action===action),'Missing real operation '+action);
 const debited={};
 for(const receipt of receipts)for(const stock of receipt.delta?.nodeStock||[])
  if(stock.delta<0)debited[stock.key]=(debited[stock.key]||0)-stock.delta;
 for(const node of nodes.filter(x=>x.kind!=='water'))
  assert.ok((debited[node.id]||0)>0,'Resource '+node.kind+' was not physically debited');
 assert.ok(n.craftedItems.filter(x=>x.kind==='flask').length===1);
 assert.equal(n.inventory.flask,1);
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 const learning=receipts.filter(r=>r.delta?.knowledge?.learnedMethods?.includes('flask'));
 assert.equal(learning.length,1,'Discovery must be receipt-backed exactly once');
 assert.ok(n.evidenceMemory.methods.some(m=>m.method==='flask'&&
  m.receiptId===learning[0].id),'Private evidence must trace to the committed trial');
 const completedStages=receipts.filter(r=>r.action==='craft_stage').length;
 assert.ok(completedStages>=9,'Cord, blade and trial each require multiple work stages');
 return {...end('empty_hand_autonomous_water_vessel',s,elapsed,
  ()=>n.inventory.flask===1&&n.project.status==='COMPLETED'),
  initialStocks,sourceDebits:Object.fromEntries(nodes.map(x=>[x.kind,debited[x.id]||0])),
  completedStages,learnedMethodReceipts:learning.length,
  finalVessels:n.craftedItems.filter(x=>x.kind==='flask').length};
}

export const scenarios={
 critical_thirst_response:waterEmergency,
 four_operation_cord:cordProduction,
 twelve_operation_hatchet:toolChain,
 interrupted_craft_resumes:interruptedCraft,
 interrupted_shelter_resumes:interruptedShelter,
 mistaken_resource_belief_revised:falseBelief,
 two_actor_finite_transfer:twoActorTrade,
 empty_hand_autonomous_water_vessel:autonomousVesselFromEmptyHands
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
export const SOAK_PROFILES=Object.freeze(['no-llm','no-memory','no-planner','mock-model']);
export function runSoak(seed=379210,days=30,profile='no-llm',startDay=1){
 assert.ok(SOAK_PROFILES.includes(profile),'Unknown benchmark profile');
 let modelCalls=0;
 const policy={projects:profile!=='no-planner'&&profile!=='mock-model'};
 if(profile==='mock-model')policy.choose=(state,n)=>{
  // A deterministic test double scores the same privacy-filtered menu used
  // for model requests and still submits through ordinary physical commands.
  const privateMenu=globalThis.Perception.filterAffordances(state,n,WorldRuntime.available(state,n));
  const proposed=WorldRuntime.chooseOffline(state,n);
  const accepted=privateMenu.some(option=>option.key===proposed)?proposed:'none';
  modelCalls++;
  WorldReceipts.decision(state,n,accepted,'mock-model');
  return accepted;
 };
 const state=setup(seed);state.auto=true;
 const {Frontier}=globalThis;
 assert.ok(Number.isInteger(startDay)&&startDay>=1&&startDay<=Frontier.DAYS_PER_YEAR,
  'Start day must be in the first compact year');
 state.clock+=(startDay-1)*1440;
 state.day=startDay;state.world.now=state.clock;
 state.world.weather=Frontier.weather(state.world,state.clock);
 const startSeason=state.world.weather.season;
 let minimumTemperature=state.world.weather.temperature;
 const ticks=days*1440,deathDetails=[],criticalWindows=new Map();
 assert.ok(Number.isInteger(ticks)&&ticks>0&&ticks<=1440*120);
 for(let i=0;i<ticks;i++){
  // Keep only a small terminal window for actors approaching physiological death.
  // This is a diagnostic snapshot, not a new gameplay source of knowledge.
  for(const actor of state.npcs){
   if(actor.health>=25||actor.bio?.hydrationBudgetMl>=220)continue;
   const previous=criticalWindows.get(actor.id)||[];
   previous.push({clock:state.clock,health:actor.health,energy:actor.energy,
    hydration:actor.bio.hydrationBudgetMl,action:actor.action,
    task:actor.task?.key||null,plan:actor.plan?.key||null,
    pathLength:actor.path?.length||0,source:actor.source,
    thoughtAt:actor.thoughtAt,notes:actor.activityStats?.last||null,
    visibleWater:WorldRuntime.available(state,actor)
     .filter(o=>o.key==='drink_source').map(o=>o.ref),
    reservedWater:(state.reservations||[])
     .filter(x=>x.actorId===actor.id&&x.kind==='water'&&x.status==='ACTIVE')
     .map(x=>x.commandId)});
   if(previous.length>28)previous.shift();
   criticalWindows.set(actor.id,previous);
  }
  // Check cheaply every hour; action-specific receipts are checked separately.
  Simulation.advance(state,1,{schedule:()=>{
   if(profile==='no-memory')for(const actor of state.npcs){
    actor.memories=[];actor.knowledge.observations=[];actor.agency.beliefs=[];
    const memory=actor.evidenceMemory;
    memory.episodes=[];memory.facts=[];memory.claims=[];memory.summaries=[];
    memory.methods=[];memory.social=[];
   }
   WorldRuntime.scheduleOffline(state,{},policy);
  },onDeath:(actor,cause)=>{
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
    inventory:{...(state.world.remains?.find(r=>r.actorId===actor.id)?.inventory||actor.inventory)},
    nearestWater:nearest,
    recentActions:state.receipts.filter(r=>r.actorId===actor.id)
     .slice(-12).map(r=>({clock:r.clock,action:r.action,status:r.status,reason:r.reason})),
    lastCriticalSnapshots:criticalWindows.get(actor.id)||[]});
  }});
  minimumTemperature=Math.min(minimumTemperature,state.world.weather.temperature);
  if(i%60===0)invariant(state);
 }
 invariant(state);
 const completed=state.receipts.filter(r=>r.status==='COMPLETED').length;
 assert.ok(completed>0,'Autonomous residents must finish physical work');
 const deathCauses={};
 for(const d of state.dead)deathCauses[d.cause]=(deathCauses[d.cause]||0)+1;
 const firstDeathAt=state.dead.length?Math.min(...state.dead.map(d=>d.deathAt)):null;
 const rejected=state.receipts.filter(r=>r.status==='REJECTED'||r.status==='FAILED').length;
 return {scenario:'autonomous_'+days+'_day_soak',seed,profile,pass:true,elapsedTicks:ticks,
  startDay,startSeason,minimumTemperature,
  initialFounders:5,alive:state.npcs.length,deaths:state.dead.length,
  founderSurvivors:state.npcs.filter(n=>n.spawnKind==='founder').length,
  deathCauses,firstDeathDay:firstDeathAt===null?null:1+Math.floor(firstDeathAt/1440),
  arrivals:Math.max(0,state.nextPersonId-6),worldHash:hash(state),
  retainedReceipts:state.receipts.length,completed,rejected,
  noops:state.receipts.filter(r=>r.status==='DECIDED'&&r.action==='none').length,
  rejectionRate:completed+rejected>0?rejected/(completed+rejected):0,
  retainedProjectCompletions:state.npcs.reduce((sum,n)=>sum+(n.completedProjects?.length||0),0),
  liveActivityCounters:liveActivityCounters(state),
  deathDetails,modelCalls};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/benchmarks.mjs')){
 const option=process.argv.find(v=>v.startsWith('--seed='));
 const seed=option?Number(option.slice(7)):379210;
 const daysArg=process.argv.find(v=>v.startsWith('--soak-days='));
 const days=daysArg?Number(daysArg.slice(12)):0;
 const reports=runScenarios(seed);
 const profileArg=process.argv.find(v=>v.startsWith('--profile='));
 const profile=profileArg?.slice(10)||'no-llm';
 if(days){
  const profiles=process.argv.includes('--compare')?SOAK_PROFILES:[profile];
  const startArg=process.argv.find(v=>v.startsWith('--start-day='));
  const startDay=startArg?Number(startArg.slice(12)):1;
  for(const mode of profiles)reports.push(runSoak(seed,days,mode,startDay));
 }
 console.log(JSON.stringify(reports,null,2));
 if(reports.some(r=>!r.pass))process.exitCode=1;
}
