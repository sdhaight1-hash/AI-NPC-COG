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
     action:'build_shelter'}
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
   root.Frontier.distance(state.world,n,s)<5);
 }
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
  if(kind==='campfire'){
   if(id==='wood')return have('wood',2)||knows('campfire');
   if(id==='stone')return have('stone',1);
   if(id==='learn')return knows('campfire');
   if(id==='fuel')return have('wood',2);
   if(id==='build')return isNear(state,n,'campfire');
  }
  return false;
 }
 function create(state,n,kind){
  if(!DEFINITIONS[kind]||n.project)return null;
  const def=DEFINITIONS[kind];
  if(!validateGraph(def.nodes))throw Error('Invalid project dependency graph');
  n.project={kind,goal:def.goal,startedAt:state.clock,status:'ACTIVE',
   nodes:def.nodes.map(x=>({id:x.id,requires:[...x.requires],
    produces:x.produces,action:x.action,status:'PENDING',
    attempts:0,blockedBy:null})),
   completedActions:0,blockedReason:null,nextAt:state.clock,
   history:[]};
  return n.project;
 }
 function history(p,clock,status,n){
  p.history.push({clock,status,node:n?.id||null});
  p.history=p.history.slice(-48);
 }
 function chooseKind(state,n){
  if(n.project||n.plan||n.task)return null;
  if(isNear(state,n,'shelter'))return null;
  const trait=String(n.personality||'').toLowerCase();
  // Temperament influences priority, never bypasses physical constraints.
  if(/cautious|patient|pragmatic/.test(trait))return 'shelter';
  if(/curious|adventurous|expressive/.test(trait)&&
   !isNear(state,n,'campfire'))return 'campfire';
  return 'shelter';
 }
 function maybeStart(state,n){
  const kind=chooseKind(state,n);
  return kind?create(state,n,kind):null;
 }
 function sync(state,n){
  const p=n.project;
  if(!p||p.status==='ABANDONED')return p;
  if(p.status==='COMPLETED'&&!predicate(state,n,p.kind,'build'))
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
  const finish=byId.get('build');
  if(finish?.status==='DONE'){
   p.status='COMPLETED';p.blockedReason=null;
   history(p,state.clock,'COMPLETED',finish);
   return p;
  }
  return p;
 }
 function next(state,n,options=[]){
  const p=sync(state,n);
  if(!p||p.status==='COMPLETED'||p.status==='ABANDONED')
   return {status:'done'};
  if(state.clock<(p.nextAt||0))return {status:'deferred'};
  if(n.task||n.plan||n.path?.length)return {status:'busy'};
  const done=new Set(p.nodes.filter(x=>x.status==='DONE').map(x=>x.id));
  let node=p.nodes.find(x=>x.status!=='DONE'&&x.requires.every(id=>done.has(id)));
  if(!node){
   p.status='BLOCKED';p.blockedReason='DEPENDENCY_CYCLE_OR_MISSING_NODE';
   return {status:'blocked',reason:p.blockedReason};
  }
  let action=node.action;
  if(n.energy<20){
   // A project never forbids bodily recovery.
   if(options.some(o=>o.key==='rest'))action='rest';
   else {p.nextAt=state.clock+5;return {status:'deferred'};}
  }
  const option=options.find(o=>o.key===action);
  if(!option){
   node.status='BLOCKED';node.blockedBy='LEGAL_ACTION_UNAVAILABLE:'+action;
   p.status='BLOCKED';p.blockedReason=node.id+':'+node.blockedBy;
   p.nextAt=state.clock+5;
   history(p,state.clock,'BLOCKED',node);
   return {status:'blocked',reason:p.blockedReason};
  }
  p.status='ACTIVE';p.blockedReason=null;
  node.status='RUNNING';node.blockedBy=null;node.attempts++;
  p.nextAt=state.clock+1;
  return {status:'action',action,option,nodeId:node.id};
 }
 function onOutcome(state,n,key,ok){
  const p=n.project;
  if(!p||p.status==='COMPLETED'||p.status==='ABANDONED')return;
  if(ok&&key!=='rest')p.completedActions++;
  if(!ok){
   const node=p.nodes.find(x=>x.status==='RUNNING'&&x.action===key);
   if(node){node.status='BLOCKED';node.blockedBy='WORLD_ACTION_FAILED:'+key;
    history(p,state.clock,'FAILED',node);}
   p.status='BLOCKED';p.blockedReason=node?.blockedBy||'WORLD_ACTION_FAILED';
   p.nextAt=state.clock+5;
  }
  else p.nextAt=state.clock+1;
  sync(state,n);
 }
 function restore(state,n,old){
  const kind=old?.kind,definition=DEFINITIONS[kind];
  if(!definition||!validateGraph(definition.nodes)||
   !Number.isFinite(old.startedAt)||old.startedAt>state.clock)return null;
  if(!['ACTIVE','BLOCKED','COMPLETED'].includes(old.status))return null;
  const p=create(state,n,kind);
  p.startedAt=old.startedAt;p.status=old.status;
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
  }
  // World predicates win over persisted claims of completed work.
  sync(state,n);
  return p;
 }
 root.Projects={DEFINITIONS,validateGraph,predicate,create,maybeStart,
  sync,next,onOutcome,restore};
})(globalThis);
