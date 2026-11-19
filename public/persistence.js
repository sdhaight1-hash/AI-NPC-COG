// Version-3 browser save codec shared with headless Node.
// Keep original v3 schema and guarded NPC migration behavior.
(function(root){
 'use strict';
 const {AgentWorld,Frontier,Civilization,Biology,Crafting,Cognition,Agency}=root;
 const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
 const key=p=>(p.z||0)+':'+p.x+':'+p.y;
 function validSavedPath(state,path,start){
  if(!Array.isArray(path)||path.length>state.world.width*state.world.height*8)return false;
  let prev={x:start.x,y:start.y,z:start.z||0};
  for(const tile of path){
   if(!tile||!Frontier.neighbors(state.world,prev).some(p=>key(p)===key(tile)))return false;
   prev=tile;
  }
  return true;
 }
 function serializePerson(n){
  const {motion,blockedFor,peerPending,peerReservedFor,peerRetryAt,...stored}=n;
  return stored;
 }
 function save(state){
  return {version:3,seed:state.world.seed,clock:state.clock,
   nextPersonId:state.nextPersonId,npcs:state.npcs.map(serializePerson),
   dead:state.dead,world:state.world,events:state.events,
   selected:state.selected,viewZ:state.viewZ,
   commandSeq:state.commandSeq||0,receiptSeq:state.receiptSeq||0,
   effectRevision:state.effectRevision||0,receipts:(state.receipts||[]).slice(-4096),
   reservations:(state.reservations||[]).slice(0,4096)};
 }

function restore(state,saved){
 try{
  if(!saved||saved.version!==3||saved.seed!==state.world.seed||
    !Number.isFinite(saved.clock)||saved.clock<490||
    !Number.isInteger(saved.nextPersonId)||saved.nextPersonId<6||
    !Array.isArray(saved.npcs)||!Array.isArray(saved.dead))return;
  AgentWorld.restoreWorld(state.world,saved.world);
  Frontier.restore(state.world,saved.world);
  root.WorldRuntime.invalidateNavigation(state.world);
  state.clock=saved.clock;state.world.now=saved.clock;
  state.commandSeq=Number.isSafeInteger(saved.commandSeq)&&saved.commandSeq>=0?saved.commandSeq:0;
  state.receiptSeq=Number.isSafeInteger(saved.receiptSeq)&&saved.receiptSeq>=0?saved.receiptSeq:0;
  state.effectRevision=Number.isSafeInteger(saved.effectRevision)&&saved.effectRevision>=0?saved.effectRevision:0;
  state.receipts=Array.isArray(saved.receipts)?saved.receipts.filter(x=>
   x&&typeof x.id==='string'&&Number.isSafeInteger(x.sequence)&&
   typeof x.actorId==='string'&&
   (typeof x.commandId==='string'||
    (x.commandId===null&&['DECIDED','REJECTED'].includes(x.status)))&&
   ['ACCEPTED','DECIDED','REJECTED','COMPLETED','FAILED','INTERRUPTED','RESUMED'].includes(x.status)).slice(-4096):[];
  state.receiptSeq=Math.max(state.receiptSeq,0,...state.receipts.map(x=>x.sequence));
  const seen=new Set();
  const archived=new Set(saved.dead.filter(v=>v&&typeof v.id==='string').map(v=>v.id));
  state.npcs=[];
  for(const old of saved.npcs.slice(0,5000)){
   if(!old||typeof old.id!=='string'||!/^person_[1-9]\d*$/.test(old.id)||
     seen.has(old.id)||archived.has(old.id)||!Number.isInteger(old.x)||!Number.isInteger(old.y)||
     !Number.isInteger(old.z)||!Frontier.traversable(state.world,old.x,old.y,old.z))continue;
   if(!Number.isFinite(old.birthAt)||old.birthAt>state.clock||
     !Number.isFinite(old.health)||old.health<=0)continue;
   seen.add(old.id);
   const n=Civilization.person(state.world,Number(old.id.slice(7)),
    Number.isFinite(old.spawnAt)?old.spawnAt:490,old);
   n.x=old.x;n.y=old.y;n.z=old.z;
   n.name=String(old.name||n.name).slice(0,80);
   n.birthAt=old.birthAt;n.health=clamp(old.health);n.alive=true;
   for(const k of ['mood','energy','trust'])if(Number.isFinite(old[k]))n[k]=clamp(old[k]);
   for(const k of ['goal','source','personality','facing'])
    if(typeof old[k]==='string')n[k]=old[k].slice(0,300);
   for(const k of Object.keys(n.needs))
    if(Number.isFinite(old.needs?.[k]))n.needs[k]=clamp(old.needs[k]);
   for(const k of Object.keys(n.inventory))
    if(Number.isInteger(old.inventory?.[k])&&old.inventory[k]>=0)
     n.inventory[k]=Math.min(old.inventory[k],1000);
   for(const k of Object.keys(n.skills))
    if(Number.isInteger(old.skills?.[k])&&old.skills[k]>=0)
     n.skills[k]=Math.min(old.skills[k],100000);
   n.bio=Biology.restore(old.bio,n.inventory.food);
   if(old.activityStats&&typeof old.activityStats==='object'){
    const a=root.WorldRuntime.stats(n);
    for(const k of ['decisions','none','rejected','started','completed','failed','blocked','errors'])
     if(Number.isInteger(old.activityStats[k])&&old.activityStats[k]>=0)
      a[k]=Math.min(old.activityStats[k],10000000);
    if(typeof old.activityStats.last==='string')
     a.last=old.activityStats.last.slice(0,110);
   }
   Crafting.restore(n,old);
   n.knowledge={recipes:Array.isArray(old.knowledge?.recipes)?
    [...new Set(old.knowledge.recipes.filter(v=>
      ['hatchet','campfire','shelter'].includes(v)))]:[],observations:[]};
   if(Array.isArray(old.knowledge?.observations))
    n.knowledge.observations=old.knowledge.observations.filter(o=>o&&
     typeof o.id==='string'&&AgentWorld.objectById(state.world,o.id)&&
     typeof o.text==='string'&&Number.isFinite(o.at))
     .slice(-40).map(o=>({id:o.id,kind:String(o.kind||'').slice(0,30),
      at:o.at,text:o.text.slice(0,240)}));
   Cognition.restore(n,old.memories);
   Agency.restore(n,old.agency,state.clock);
   if(Array.isArray(old.peerLog))n.peerLog=old.peerLog.slice(-12);
   if(old.relationships&&typeof old.relationships==='object')n.relationships=old.relationships;
   if(Array.isArray(old.visited))n.visited=old.visited.slice(-32);
   if(validSavedPath(state,old.path,n))n.path=old.path;
   if(old.travel===null)n.travel=null;
   if(n.path?.length&&old.travel&&typeof old.travel==='object'&&
     Number.isFinite(old.travel.total)&&old.travel.total>0&&old.travel.total<=1&&
     Number.isFinite(old.travel.remaining)&&old.travel.remaining>0&&
     old.travel.remaining<=old.travel.total)
    n.travel={total:old.travel.total,remaining:old.travel.remaining};
   if(AgentWorld.KEYS.includes(old.task?.key)&&
     (old.task.ref===null||typeof old.task.ref==='string')){
    n.task={key:old.task.key,ref:old.task.ref,
     commandId:typeof old.task.commandId==='string'&&/^cmd_[1-9]\d*$/.test(old.task.commandId)?old.task.commandId:null,
     readyAt:Number.isFinite(old.task.readyAt)?Math.max(old.task.readyAt,state.clock):null};
   }
   root.Activities.restore(n,old,state.clock);
   n.plan=AgentWorld.validatePlan(old.plan);
   if(n.task&&!n.task.commandId)n.task.commandId='cmd_'+(++state.commandSeq);
   if(n.task?.commandId){
    const seq=Number(n.task.commandId.slice(4));
    if(Number.isSafeInteger(seq))state.commandSeq=Math.max(state.commandSeq,seq);
   }
   if(n.workpiece&&(!n.plan||n.plan.key!=='craft_project'||
    n.plan.recipe!==n.workpiece.recipe))
    n.plan={key:'craft_project',recipe:n.workpiece.recipe,steps:0};
   if(!n.workpiece&&n.plan?.key==='craft_project')n.plan=null;
   if(n.plan&&(!n.agency.goal||n.agency.goal.key!==n.plan.key))
    n.agency.goal={key:n.plan.key,source:'restored project',
     reason:'security',startedAt:state.clock,progress:n.plan.steps};
   n.action=AgentWorld.KEYS.includes(old.action)?old.action:'none';
   n.thoughtAt=Number.isFinite(old.thoughtAt)&&old.thoughtAt>=0?
    old.thoughtAt:state.clock+3+state.npcs.length*2;
   state.npcs.push(n);
  }
  root.Reservations?.restore(state,saved.reservations);
  state.dead=saved.dead.filter(v=>v&&typeof v.id==='string'&&!seen.has(v.id)).slice(-10000);
  const maxId=Math.max(5,...state.npcs.map(n=>Number(n.id.slice(7))),
   ...state.dead.filter(v=>/^person_[1-9]\d*$/.test(v.id))
    .map(v=>Number(v.id.slice(7))));
  state.nextPersonId=Math.max(saved.nextPersonId,maxId+1);
  state.events=Array.isArray(saved.events)?saved.events.slice(0,100):[];
  state.selected=state.npcs.some(n=>n.id===saved.selected)
   ?saved.selected:state.npcs[0]?.id||null;
  if(Number.isInteger(saved.viewZ)&&saved.viewZ>=Frontier.MIN_Z&&
   saved.viewZ<=Frontier.MAX_Z)state.viewZ=saved.viewZ;
  return true;
 }catch{ return false; }
}
 root.Persistence={save,restore,validSavedPath};
})(globalThis);
