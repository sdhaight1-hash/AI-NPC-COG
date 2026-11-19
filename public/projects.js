// Bounded, per-actor goal dependency graphs. An intention is not an effect:
// every node executes only through existing legal world actions and receipts.
(function(root){
 'use strict';
 const TARGETS=Object.freeze({
  stock_food:[['gather_food','food',2,'forage',[]]],
  stock_water:[['gather_water','water',2,'fill_water',[]]],
  stock_wood:[['gather_wood','wood',3,'collect_wood',[]]],
  stock_stone:[['gather_stone','stone',2,'collect_stone',[]]],
  stock_fiber:[['gather_fiber','fiber',3,'collect_fiber',[]]],
  make_campfire:[
   ['wood','wood',2,'collect_wood',[]],
   ['stone','stone',1,'collect_stone',[]],
   ['fire','campfire',1,'build_fire',['wood','stone']]],
  make_shelter:[
   ['wood','wood',4,'collect_wood',[]],
   ['fiber','fiber',3,'collect_fiber',[]],
   ['shelter','shelter',1,'build_shelter',['wood','fiber']]],
  make_workbench:[
   ['fiber','fiber',3,'collect_fiber',[]],
   ['cord','cord',1,'craft_cord',['fiber']],
   ['wood','wood',3,'collect_wood',[]],
   ['stone','stone',1,'collect_stone',[]],
   ['bench','workbench',1,'craft_workbench',['cord','wood','stone']]]
 });
 const known=k=>Object.hasOwn(TARGETS,k);
 function verify(nodes){
  if(!Array.isArray(nodes)||nodes.length<1||nodes.length>24)return false;
  const map=new Map();
  for(const n of nodes){
   if(typeof n.id!=='string'||map.has(n.id)||!Array.isArray(n.requires)||
    typeof n.method!=='string'||n.requires.length>8)return false;
   map.set(n.id,n);
  }
  const visited=new Set(),active=new Set();
  function visit(id){
   if(!map.has(id)||active.has(id))return false;
   if(visited.has(id))return true;
   active.add(id);
   for(const ref of map.get(id).requires)if(!visit(ref))return false;
   active.delete(id);visited.add(id);
   return true;
  }
  return [...map.keys()].every(visit);
 }
 function build(goal,clock){
  if(!known(goal))return null;
  const nodes=TARGETS[goal].map(([id,kind,amount,method,requires])=>({
   id,kind,amount,method,requires:[...requires],state:'PENDING',
   attempts:0,blockedReason:null,completedAt:null
  }));
  if(!verify(nodes))throw Error('Invalid project dependency graph');
  return {version:1,goal,startedAt:clock,status:'ACTIVE',nodes,
   completedOps:0,retries:0,blockedReason:null,lastAttemptAt:clock};
 }
 function predicate(n,world,node){
  if(['workbench','campfire','shelter'].includes(node.kind))
   return world.structures.some(s=>s.type===node.kind&&
    root.Frontier.distance(world,n,s)<5);
  return (n.inventory[node.kind]||0)>=node.amount;
 }
 function goalMet(n,world,project){
  const last=project.nodes.at(-1);
  return !!last&&predicate(n,world,last);
 }
 function choose(n,world,project,available){
  if(!project||project.status!=='ACTIVE')return {status:'blocked',reason:'PROJECT_INACTIVE'};
  if(goalMet(n,world,project)){
   for(const node of project.nodes)node.state='COMPLETE';
   project.status='COMPLETE';project.blockedReason=null;
   return {status:'done'};
  }
  for(const node of project.nodes){
   if(predicate(n,world,node)){
    node.state='COMPLETE';node.blockedReason=null;
    node.completedAt??=world.now;
   }
  }
  // After a dependent good was produced, consumed precursor materials should
  // not reopen already completed nodes.
  const satisfied=id=>project.nodes.find(x=>x.id===id)?.state==='COMPLETE';
  const next=project.nodes.find(node=>node.state!=='COMPLETE'&&
   node.requires.every(satisfied));
  if(!next)return {status:'blocked',reason:'UNMET_DEPENDENCY'};
  let method=next.method;
  if(n.workpiece&&project.goal==='make_workbench')method='craft_stage';
  if(next.kind==='shelter'&&!n.knowledge.recipes.includes('shelter'))
   return {status:'blocked',reason:'UNLEARNED_METHOD:shelter',node:next};
  if(next.kind==='campfire'&&!n.knowledge.recipes.includes('campfire'))
   return {status:'blocked',reason:'UNLEARNED_METHOD:campfire',node:next};
  if(method.startsWith('craft_')&&method!=='craft_stage'&&
   !root.Crafting.getRecipe(method.slice(6)))
   return {status:'blocked',reason:'UNLEARNED_METHOD:'+method,node:next};
  if(n.energy<20&&method!=='rest')method='rest';
  const option=available.find(x=>x.key===method);
  if(!option)return {status:'blocked',reason:'UNAVAILABLE:'+method,node:next};
  next.state='ACTIVE';next.blockedReason=null;
  return {status:'action',option,node:next};
 }
 function update(n,world,project,receipt){
  if(!project||project.status!=='ACTIVE')return;
  if(receipt?.status==='COMPLETED'){
   project.completedOps=Math.min(999,project.completedOps+1);
   project.blockedReason=null;project.retries=0;
   for(const node of project.nodes){
    if(predicate(n,world,node)){
     node.state='COMPLETE';node.completedAt??=world.now;
     node.blockedReason=null;
    }
   }
   if(goalMet(n,world,project)){
    project.status='COMPLETE';for(const node of project.nodes)node.state='COMPLETE';
   }
  }
 }
 function blocked(project,reason,clock,node=null){
  if(!project||project.status!=='ACTIVE')return;
  project.retries=Math.min(1000,project.retries+1);
  project.blockedReason=String(reason).slice(0,96);
  project.lastAttemptAt=clock;
  if(node){node.blockedReason=project.blockedReason;node.attempts++;
   node.state='BLOCKED';}
 }
 function restore(saved,clock){
  if(!saved||saved.version!==1||!known(saved.goal)||
   !Number.isFinite(saved.startedAt)||saved.startedAt>clock)return null;
  const graph=build(saved.goal,saved.startedAt);
  if(!Array.isArray(saved.nodes)||saved.nodes.length!==graph.nodes.length)return null;
  for(let i=0;i<graph.nodes.length;i++){
   const base=graph.nodes[i],old=saved.nodes[i];
   if(old?.id!==base.id||old.method!==base.method||
    JSON.stringify(old.requires)!==JSON.stringify(base.requires))return null;
   if(['PENDING','ACTIVE','COMPLETE','BLOCKED'].includes(old.state))base.state=old.state;
   if(Number.isFinite(old.completedAt)&&old.completedAt<=clock)base.completedAt=old.completedAt;
   if(Number.isInteger(old.attempts)&&old.attempts>=0)base.attempts=Math.min(old.attempts,1000);
   if(typeof old.blockedReason==='string')base.blockedReason=old.blockedReason.slice(0,96);
  }
  if(['ACTIVE','COMPLETE'].includes(saved.status))graph.status=saved.status;
  graph.completedOps=Number.isInteger(saved.completedOps)?Math.max(0,Math.min(999,saved.completedOps)):0;
  graph.retries=Number.isInteger(saved.retries)?Math.max(0,Math.min(1000,saved.retries)):0;
  graph.blockedReason=typeof saved.blockedReason==='string'?saved.blockedReason.slice(0,96):null;
  graph.lastAttemptAt=Number.isFinite(saved.lastAttemptAt)&&saved.lastAttemptAt<=clock?
   saved.lastAttemptAt:clock;
  return graph;
 }
 root.Projects={known,build,verify,predicate,goalMet,choose,update,blocked,restore};
})(globalThis);
