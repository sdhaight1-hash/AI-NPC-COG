// Bounded hierarchical projects, built exclusively from observed state and
// executable AgentWorld affordances. This module cannot mutate world resources.
(function(root){
 'use strict';
 const DEFINITIONS=Object.freeze({
  shelter:{
   goal:'A shelter within five tiles',
   nodes:[
    {id:'wood',requires:[],produces:'wood >= 4',action:'collect_wood'},
    {id:'fiber',requires:[],produces:'fiber >= 4',action:'collect_fiber'},
    {id:'learn',requires:['wood','fiber'],produces:'known shelter method',
     action:'experiment_wood_fiber'},
    {id:'binding',requires:['learn'],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'build',requires:['wood','learn','binding'],produces:'nearby shelter',
     action:'craft_shelter'}
   ]},
  workbench:{
   goal:'A usable woodworking bench within eight tiles',
   nodes:[
    {id:'fiber',requires:[],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'cord',requires:['fiber'],produces:'cord >= 1',action:'craft_cord'},
    {id:'wood',requires:[],produces:'wood >= 3',action:'collect_wood'},
    {id:'stone',requires:[],produces:'stone >= 1',action:'collect_stone'},
    {id:'build',requires:['cord','wood','stone'],produces:'nearby workbench',
     action:'craft_workbench'}
   ]},
  storage:{
   goal:'A placed storage crate, made from finite components',
   nodes:[
    {id:'fiber_bench',requires:[],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'cord_bench',requires:['fiber_bench'],produces:'cord >= 1',action:'craft_cord'},
    {id:'wood_bench',requires:[],produces:'wood >= 3',action:'collect_wood'},
    {id:'stone_bench',requires:[],produces:'stone >= 1',action:'collect_stone'},
    {id:'bench',requires:['cord_bench','wood_bench','stone_bench'],
     produces:'nearby workbench',action:'craft_workbench'},
    {id:'stone_blade',requires:[],produces:'stone >= 2',action:'collect_stone'},
    {id:'blade',requires:['stone_blade'],produces:'blade >= 1',action:'craft_blade'},
    {id:'fiber_hatchet',requires:[],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'cord_hatchet',requires:['fiber_hatchet'],
     produces:'cord >= 1',action:'craft_cord'},
    {id:'wood_hatchet',requires:[],produces:'wood >= 1',action:'collect_wood'},
    {id:'hatchet',requires:['blade','cord_hatchet','wood_hatchet'],
     produces:'hatchet >= 1',action:'craft_hafted_hatchet'},
    {id:'wood_planks',requires:['bench','hatchet'],
     produces:'wood >= 2',action:'collect_wood'},
    {id:'planks',requires:['wood_planks','hatchet','bench'],
     produces:'plank >= 3',action:'craft_planks'},
    {id:'fiber_crate',requires:['planks'],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'cord_crate',requires:['fiber_crate'],
     produces:'cord >= 1',action:'craft_cord'},
    {id:'crate',requires:['planks','cord_crate'],
     produces:'crate >= 1',action:'craft_crate'},
    {id:'clear_site',requires:['crate'],produces:'space clear of structures',
     action:'explore'},
    {id:'build',requires:['clear_site','crate'],
     produces:'placed crate nearby',action:'place_crate'}
   ]},
  water_vessel:{
   goal:'A portable way to store freshwater away from a spring',
   nodes:[
    {id:'fiber',requires:[],produces:'fiber >= 3',action:'collect_fiber'},
    {id:'cord',requires:['fiber'],produces:'cord >= 1',action:'craft_cord'},
    {id:'stone',requires:['cord'],produces:'stone >= 2',action:'collect_stone'},
    {id:'blade',requires:['stone'],produces:'blade >= 1',action:'craft_blade'},
    {id:'wood',requires:['blade'],produces:'wood >= 1',action:'collect_wood'},
    {id:'build',requires:['cord','blade','wood'],
     produces:'a physically crafted portable vessel',action:'craft_hollow_wood_trial'}
   ]},
  water_supply:{
   goal:'Carry a usable freshwater reserve in a real vessel',
   nodes:[
    {id:'fill',requires:[],produces:'two units of carried vessel water',
     action:'fill_water'}
   ]},
  home:{
   goal:'A physically enclosed roofed room with a passable doorway',
   nodes:[
    {id:'survey',requires:[],produces:'time-costed six-tile local design',
     action:'design_home'},
    {id:'thatch',requires:['survey'],produces:'roof binding before walls hide local plants',
     action:'collect_fiber'},
    {id:'build',requires:['thatch'],produces:'completed enclosed floor and roof',
     action:'build_tile'}
   ]},
  campfire:{
   goal:'A campfire within five tiles',
   nodes:[
    {id:'wood',requires:[],produces:'wood >= 2',action:'collect_wood'},
    {id:'stone',requires:[],produces:'stone >= 1',action:'collect_stone'},
    {id:'learn',requires:['wood','stone'],produces:'known campfire method',
     action:'experiment_wood_stone'},
    {id:'fuel',requires:['learn'],produces:'wood >= 2',action:'collect_wood'},
    {id:'build',requires:['wood','stone','learn','fuel'],
     produces:'nearby campfire',action:'build_fire'}
   ]}
 });
 const states=new Set(['PENDING','DONE','BLOCKED','RUNNING']);
 function validateGraph(nodes){
  if(!Array.isArray(nodes)||nodes.length>32||!nodes.length)return false;
  const byId=new Map(nodes.map(n=>[n?.id,n]));
  if(byId.size!==nodes.length||nodes.some(n=>typeof n?.id!=='string'||
   n.id.length>40||!Array.isArray(n.requires)||n.requires.length>16))return false;
  const visiting=new Set(),visited=new Set();
  function visit(id){
   if(visiting.has(id))return false;
   if(visited.has(id))return true;
   const node=byId.get(id);
   if(!node)return false;
   visiting.add(id);
   for(const dep of node.requires)if(!visit(dep))return false;
   visiting.delete(id);visited.add(id);return true;
  }
  return nodes.every(n=>visit(n.id));
 }
 function isNear(state,n,type){
  return state.world.structures.some(s=>s.type===type&&
   (s.maker===n.id||root.Frontier.distance(state.world,n,s)<5));
 }
 const vesselWorkpiece=n=>['hollow_wood_trial','flask'].includes(n.workpiece?.recipe);
 function predicate(state,n,kind,id){
  const have=(k,q)=>(n.inventory?.[k]||0)>=q;
  const knows=k=>n.knowledge?.recipes?.includes(k)===true;
  if(kind==='shelter'){
   if(id==='wood')return have('wood',4);
   if(id==='fiber')return have('fiber',4)||knows('shelter');
   if(id==='learn')return knows('shelter');
   if(id==='binding')return have('fiber',3);
   if(id==='build')return isNear(state,n,'shelter');
  }
  if(kind==='workbench'){
   if(id==='fiber')return have('fiber',3)||have('cord',1);
   if(id==='cord')return have('cord',1)||isNear(state,n,'workbench');
   if(id==='wood')return have('wood',3)||isNear(state,n,'workbench');
   if(id==='stone')return have('stone',1)||isNear(state,n,'workbench');
   if(id==='build')return isNear(state,n,'workbench');
  }
  if(kind==='storage'){
   const bench=isNear(state,n,'workbench');
   if(id==='fiber_bench')return have('fiber',3)||have('cord',1)||bench;
   if(id==='cord_bench')return have('cord',1)||bench;
   if(id==='wood_bench')return have('wood',3)||bench;
   if(id==='stone_bench')return have('stone',1)||bench;
   if(id==='bench')return bench;
   if(id==='stone_blade')return have('stone',2)||have('blade',1)||have('hatchet',1);
   if(id==='blade')return have('blade',1)||have('hatchet',1);
   if(id==='fiber_hatchet')return have('fiber',3)||have('cord',1)||have('hatchet',1);
   if(id==='cord_hatchet')return have('cord',1)||have('hatchet',1);
   if(id==='wood_hatchet')return have('wood',1)||have('hatchet',1);
   if(id==='hatchet')return have('hatchet',1);
   if(id==='wood_planks')return have('wood',2)||have('plank',3)||have('crate',1);
   if(id==='planks')return have('plank',3)||have('crate',1);
   if(id==='fiber_crate')return have('fiber',3)||have('cord',1)||have('crate',1);
   if(id==='cord_crate')return have('cord',1)||have('crate',1);
   if(id==='crate')return have('crate',1)||isNear(state,n,'crate');
   if(id==='clear_site')return !state.world.structures.some(s=>
    root.Frontier.distance(state.world,n,s)<2);
   if(id==='build')return isNear(state,n,'crate');
  }
  if(kind==='home'){
   const site=n.project?.homeSite;
   if(!site)return false;
   if(id==='survey')return [...(state.world.construction?.blueprints||[]),
    ...(state.world.construction?.tiles||[])].some(t=>
     t.actorId===n.id&&t.kind==='floor'&&
     t.x===site.x&&t.y===site.y&&t.z===site.z);
   if(id==='thatch')return (n.inventory.fiber||0)>=1||
    (state.world.construction?.tiles||[]).some(t=>t.actorId===n.id&&
     t.kind==='roof'&&t.x===site.x&&t.y===site.y&&t.z===site.z);
   if(id==='build')return root.Construction?.sheltered(state.world,site)===true;
  }
  if(kind==='water_vessel'){
   // Consumed intermediate inputs still count as completed dependencies
   // while the subsequent physical assembly is underway.
   const done=have('flask',1),assembly=vesselWorkpiece(n);
   if(id==='fiber')return have('fiber',3)||have('cord',1)||assembly||done;
   if(id==='cord')return have('cord',1)||assembly||done;
   if(id==='stone')return have('stone',2)||have('blade',1)||assembly||done;
   if(id==='blade')return have('blade',1)||assembly||done;
   if(id==='wood')return have('wood',1)||assembly||done;
   if(id==='build')return done;
  }
  if(kind==='water_supply'){
   // The goal is portable liquid, not legacy loose-water counts or a
   // world-source stock that the actor might never have visited.
   const filled=(n.craftedItems||[]).filter(item=>item.kind==='flask')
    .reduce((sum,item)=>sum+(Number.isInteger(item.waterUnits)?item.waterUnits:0),0);
   if(id==='fill')return have('flask',1)&&filled>=2;
  }
  if(kind==='campfire'){
   if(id==='wood')return have('wood',2)||knows('campfire');
   if(id==='stone')return have('stone',1);
   if(id==='learn')return knows('campfire');
   if(id==='fuel')return have('wood',2);
   if(id==='build')return isNear(state,n,'campfire');
  }
  return false;
 }
 function create(state,n,kind,rememberVisible=true){
  if(!DEFINITIONS[kind]||n.project)return null;
  // Loading a checkpoint reconstructs a project; it must not invent a fresh
  // visual observation or rewrite the original sighting timestamp.
  if(kind==='water_vessel'&&rememberVisible){
   // Record the actual visual evidence for a future return trip, not the
   // deposit stock or a complete technology recipe from world data.
   const seen=root.Perception?.snapshot(state,n).objects.filter(o=>o.kind==='water')||[];
   if(seen.length){
    const history=n.knowledge.sightings||[];
    const ids=new Set(seen.map(o=>o.id));
    n.knowledge.sightings=[...history.filter(o=>!ids.has(o.id)),
     ...seen.map(o=>({id:o.id,kind:'water',x:o.x,y:o.y,z:o.z,at:state.clock}))]
     .slice(-12);
   }
  }
  const def=DEFINITIONS[kind];
  if(!validateGraph(def.nodes))throw Error('Invalid project dependency graph');
  n.project={kind,goal:def.goal,startedAt:state.clock,status:'ACTIVE',
   nodes:def.nodes.map(x=>({id:x.id,requires:[...x.requires],
    produces:x.produces,action:x.action,status:'PENDING',
    attempts:0,scouts:0,failures:0,blockedBy:null})),
   completedActions:0,blockedReason:null,nextAt:state.clock,
   history:[]};
  if(kind==='home')n.project.homeSite=null;
  return n.project;
 }
 function history(p,clock,status,n){
  p.history.push({clock,status,node:n?.id||null});
  p.history=p.history.slice(-48);
 }
 function chooseKind(state,n){
  if(n.project||n.plan||n.task)return null;
  const trait=String(n.personality||'').toLowerCase();
  // A remembered or currently visible spring motivates portable water security.
  // Neither hidden world deposits nor the existence of a recipe is evidence.
  const hasWaterEvidence=root.Perception?.snapshot(state,n).objects.some(o=>
   o.kind==='water')||(n.knowledge?.observations||[]).some(o=>o.kind==='water')||
   (n.knowledge?.sightings||[]).some(o=>o.kind==='water'&&o.at<=state.clock);
  if((n.inventory.flask||0)===0&&n.needs.thirst>=45&&n.needs.thirst<85&&
   (n.bio?.hydrationBudgetMl||0)>=1400&&n.energy>=25&&
   n.needs.hunger<85&&hasWaterEvidence)return 'water_vessel';
  // An empty vessel is useful only after water is physically collected.
  // Personal sight or inspection, not hidden stock, gives a destination.
  if((n.inventory.flask||0)>0&&root.Crafting.vesselRoom(n)>0&&
   (n.inventory.water||0)<2&&hasWaterEvidence)return 'water_supply';
  // Needs and temperament choose priority, not permission to bypass the world.
  if(!isNear(state,n,'shelter')){
   if(/curious|adventurous|expressive/.test(trait)&&
    !isNear(state,n,'campfire'))return 'campfire';
   return 'shelter';
  }
  if(!isNear(state,n,'campfire'))return 'campfire';
  const roomNearby=(state.world.construction?.tiles||[]).some(t=>
   t.kind==='floor'&&root.Frontier.distance(state.world,n,t)<=5&&
   root.Construction?.sheltered(state.world,t));
  if(n.knowledge?.recipes?.includes('shelter')&&n.energy>=40&&
   n.needs.hunger<75&&n.needs.thirst<75&&!roomNearby&&
   !(n.completedProjects||[]).some(x=>x.kind==='home')&&
   root.Construction?.compactSite(state.world,n,state.npcs))return 'home';
  if(!isNear(state,n,'workbench'))return 'workbench';
  if(!isNear(state,n,'crate'))return 'storage';
  return null;
 }
 function maybeStart(state,n){
  if(n.project?.status==='COMPLETED'){
   (n.completedProjects ||= []).push({kind:n.project.kind,
    startedAt:n.project.startedAt,finishedAt:state.clock,
    actions:n.project.completedActions});
   n.completedProjects=n.completedProjects.slice(-12);
   n.project=null;
  }
  const kind=chooseKind(state,n);
  return kind?create(state,n,kind):null;
 }
 function sync(state,n){
  const p=n.project;
  if(!p||p.status==='ABANDONED')return p;
  const terminal=p.kind==='water_supply'?'fill':'build';
  if(p.status==='COMPLETED'&&!predicate(state,n,p.kind,terminal))
   p.status='ACTIVE';
  const byId=new Map(p.nodes.map(x=>[x.id,x]));
  for(const node of p.nodes){
   if(predicate(state,n,p.kind,node.id)){
    if(node.status!=='DONE')history(p,state.clock,'DONE',node);
    node.status='DONE';node.blockedBy=null;
   }else if(node.status==='DONE'){
    // Physical inventory can be consumed or lost. Reopen only the
    // unmet predicate, preserving other completed dependencies.
    node.status='PENDING';
   }
  }
  const finish=byId.get(terminal);
  if(finish?.status==='DONE'){
   p.status='COMPLETED';p.blockedReason=null;
   history(p,state.clock,'COMPLETED',finish);
   return p;
  }
  return p;
 }
 // Manufacturing and refilling share bounded recovery; neither should
 // keep guessing at a spring the actor has not actually reached.
 const RECOVERABLE_PROJECTS=new Set(['water_vessel','water_supply','home']);
 const waitMinutes=node=>Math.min(360,15*2**Math.min(5,Math.max(0,node.failures-1)));
 function next(state,n,affordances=[]){
  const p=sync(state,n);
  if(!p||p.status==='COMPLETED'||p.status==='ABANDONED')
   return {status:'done'};
  const recoverable=RECOVERABLE_PROJECTS.has(p.kind);
  if(state.clock<(p.nextAt||0))return {status:'deferred'};
  if(n.task||n.plan||n.path?.length)return {status:'busy'};
  const done=new Set(p.nodes.filter(x=>x.status==='DONE').map(x=>x.id));
  let node=p.nodes.find(x=>x.status!=='DONE'&&x.requires.every(id=>done.has(id)));
  if(!node){
   p.status='BLOCKED';p.blockedReason='DEPENDENCY_CYCLE_OR_MISSING_NODE';
   return {status:'blocked',reason:p.blockedReason};
  }
  const options=typeof affordances==='function'?affordances():affordances;
  let action=node.action;
  if(p.kind==='water_vessel'&&node.id==='build'){
   if(vesselWorkpiece(n))action='craft_stage';
   else if(n.knowledge?.recipes?.includes('flask'))action='craft_flask';
  }
  if(p.kind==='home'&&node.id==='build'){
   const pending=(state.world.construction?.blueprints||[]).filter(b=>
    b.actorId===n.id&&p.homeSite&&
    root.Frontier.distance(state.world,p.homeSite,b)<=1);
   if(options.some(o=>o.key==='build_tile'&&pending.some(b=>b.id===o.ref)))
    action='build_tile';
   else if(pending.some(b=>b.kind!=='roof'))action='collect_wood';
   else if(pending.some(b=>b.kind==='roof'))action='collect_fiber';
  }
  if(n.energy<20){
   // A project never forbids bodily recovery.
   if(options.some(o=>o.key==='rest'))action='rest';
   else {p.nextAt=state.clock+5;return {status:'deferred'};}
  }
  let option=options.find(o=>o.key===action);
  const seekWater=action==='craft_stage'&&root.Crafting.wetSealPending(n);
  const scoutable=seekWater||['collect_wood','collect_stone','collect_fiber',
   'forage','fill_water','build_tile'].includes(action);
  if(!option&&scoutable){
   // Unknown resource locations prompt bounded physical exploration, not an
   // omniscient search query or fictitious harvest.
   const scout=options.find(o=>o.key==='explore');
   if(scout&&(!recoverable||node.scouts<4)){
    action='explore';option=scout;
   }
  }
  if(!option){
   if(recoverable)node.failures=Math.min(100,node.failures+1);
   node.status='BLOCKED';
   const prerequisite=seekWater?'seal_test_water':action;
   if(action==='craft_flask'&&root.Crafting.knowinglyWeakBinding(n,'flask'))
    node.blockedBy='TESTED_SEAL_RISK';
   else node.blockedBy=recoverable&&node.scouts>=4&&scoutable?
    'SCOUT_LIMIT:'+prerequisite:'LEGAL_ACTION_UNAVAILABLE:'+prerequisite;
   p.status='BLOCKED';p.blockedReason=node.id+':'+node.blockedBy;
   p.nextAt=state.clock+(recoverable?waitMinutes(node):5);
   history(p,state.clock,'BLOCKED',node);
   return {status:'blocked',reason:p.blockedReason};
  }
  p.status='ACTIVE';p.blockedReason=null;
  node.status='RUNNING';node.blockedBy=null;node.attempts++;
  // Selecting a route is not evidence of successful exploration.
  // Count completed trips in onOutcome(), not proposals or rejected starts.
  p.nextAt=state.clock+1;
  return {status:'action',action,option,nodeId:node.id};
 }
 function onOutcome(state,n,key,ok,receipt=null){
  const p=n.project;
  if(!p||p.status==='COMPLETED'||p.status==='ABANDONED')return;
  const recoverable=RECOVERABLE_PROJECTS.has(p.kind);
  if(ok&&key!=='rest')p.completedActions++;
  if(p.kind==='home'&&ok&&key==='design_home'&&
   receipt?.actorId===n.id&&receipt.status==='COMPLETED'){
   const floor=receipt.delta?.collections?.constructionBlueprints?.added
    ?.find(t=>t.actorId===n.id&&t.kind==='floor');
   if(floor)p.homeSite={x:floor.x,y:floor.y,z:floor.z};
  }
  const node=p.nodes.find(x=>x.status==='RUNNING'&&
   (x.action===key||recoverable&&key==='explore'||
    p.kind==='home'&&x.id==='build'&&
     ['collect_wood','collect_fiber'].includes(key)||
    p.kind==='water_vessel'&&x.id==='build'&&['craft_flask','craft_stage'].includes(key)));
  // An experiment can complete physically yet fail to make a watertight
  // object. Its receipt records the consumed workpiece with no learned method.
  const leaked=p.kind==='water_vessel'&&key==='craft_stage'&&
   receipt?.actorId===n.id&&receipt.status==='COMPLETED'&&
   ['hollow_wood_trial','flask'].includes(receipt.delta?.workpiece?.before?.recipe)&&
   receipt.delta.workpiece.after===null&&
   !receipt.delta?.inventory?.some(item=>item.key==='flask'&&item.delta>0);
  if(leaked){
   const trial=p.nodes.find(x=>x.id==='build');
   if(trial){
    trial.failures=Math.min(100,(trial.failures||0)+1);
    trial.status='BLOCKED';trial.blockedBy='TRIAL_LEAKED';
    history(p,state.clock,'LEAK_OBSERVED',trial);
   }
   p.status='BLOCKED';p.blockedReason='TRIAL_LEAKED';
   p.nextAt=state.clock+60;
  }else if(!ok){
   if(node){
    if(recoverable)node.failures=Math.min(100,node.failures+1);
    node.status='BLOCKED';node.blockedBy='WORLD_ACTION_FAILED:'+key;
    history(p,state.clock,'FAILED',node);
   }
   p.status='BLOCKED';p.blockedReason=node?.blockedBy||'WORLD_ACTION_FAILED';
   p.nextAt=state.clock+(recoverable&&node?waitMinutes(node):5);
  }
  else {
   if(node&&recoverable){
    if(key==='explore')node.scouts=Math.min(4,node.scouts+1);
    else {node.scouts=0;node.failures=0;}
   }
   p.nextAt=state.clock+1;
  }
  sync(state,n);
 }
 function restore(state,n,old){
  const kind=old?.kind,definition=DEFINITIONS[kind];
  if(!definition||!validateGraph(definition.nodes)||
   !Number.isFinite(old.startedAt)||old.startedAt>state.clock)return null;
  if(!['ACTIVE','BLOCKED','COMPLETED'].includes(old.status))return null;
  const p=create(state,n,kind,false);
  if(kind==='home'&&old.homeSite&&
   [old.homeSite.x,old.homeSite.y,old.homeSite.z].every(Number.isInteger)&&
   old.homeSite.x>=0&&old.homeSite.x<state.world.width&&
   old.homeSite.y>=0&&old.homeSite.y<state.world.height&&
   old.homeSite.z>=root.Frontier.MIN_Z&&old.homeSite.z<=root.Frontier.MAX_Z&&
   [...(state.world.construction?.tiles||[]),
    ...(state.world.construction?.blueprints||[])].some(t=>
     t.actorId===n.id&&t.kind==='floor'&&
     t.x===old.homeSite.x&&t.y===old.homeSite.y&&t.z===old.homeSite.z))
   p.homeSite={x:old.homeSite.x,y:old.homeSite.y,z:old.homeSite.z};
  p.startedAt=old.startedAt;p.status=old.status;
  p.blockedReason=typeof old.blockedReason==='string'?
   old.blockedReason.slice(0,140):null;
  p.completedActions=Number.isInteger(old.completedActions)?
   Math.max(0,Math.min(100000,old.completedActions)):0;
  p.nextAt=Number.isFinite(old.nextAt)?Math.max(state.clock,old.nextAt):state.clock;
  p.history=Array.isArray(old.history)?old.history.filter(x=>x&&
   Number.isFinite(x.clock)&&x.clock<=state.clock&&
   typeof x.status==='string').slice(-48).map(x=>({
    clock:x.clock,status:x.status.slice(0,32),
    node:typeof x.node==='string'?x.node.slice(0,40):null})):[];
  for(const node of p.nodes){
   const previous=old.nodes?.find(x=>x?.id===node.id);
   if(!previous)continue;
   node.attempts=Number.isInteger(previous.attempts)?
    Math.min(100000,Math.max(0,previous.attempts)):0;
   node.scouts=Number.isInteger(previous.scouts)?
    Math.min(4,Math.max(0,previous.scouts)):0;
   node.failures=Number.isInteger(previous.failures)?
    Math.min(100,Math.max(0,previous.failures)):0;
   if(states.has(previous.status))node.status=previous.status;
   node.blockedBy=typeof previous.blockedBy==='string'?
    previous.blockedBy.slice(0,120):null;
  }
  // World predicates win over persisted claims of completed work.
  sync(state,n);
  return p;
 }
 root.Projects={DEFINITIONS,validateGraph,predicate,create,maybeStart,
  sync,next,onOutcome,restore};
})(globalThis);
