// Browser-free physical movement, legal commands, and offline task execution.
// No renderer, wall clock, storage, HTTP or model access. Browser UI may attach
// logging / conversation hooks without granting them authority over world rules.
(function(root){
 'use strict';
 const DURATION={forage:2,collect_wood:4,collect_stone:5,collect_fiber:2,
  fill_water:1,eat:3,drink:1,drink_source:1,craft_hatchet:12,
  experiment_wood_stone:15,experiment_wood_fiber:15,experiment_wood_stone_fiber:15,
  build_fire:20,build_shelter:75,share_food:2,socialize:3,inspect:2,
  drop_wood:2,drop_stone:2,drop_fiber:2,pickup_item:2,place_crate:6,stash_wood:2,stash_stone:2,
  stash_fiber:2,withdraw_wood:2,withdraw_stone:2,withdraw_fiber:2,
  build_cache:18,store_wood:2,retrieve_wood:2,explore:1,none:1};
 const GOALS=new Set(['stock_food','stock_water','stock_wood','stock_stone',
  'stock_fiber','make_campfire','make_shelter']);
 const pointKey=p=>(p.z||0)+':'+p.x+':'+p.y;
 const distance=(state,a,b)=>root.Frontier.distance(state.world,a,b);
 const wrap=(v,extent)=>root.Frontier.wrap(v,extent);
 function blocked(state,p){
  return !root.Frontier.traversable(state.world,
   wrap(p.x,state.world.width),wrap(p.y,state.world.height),p.z||0);
 }
 function pathfind(state,start,end){
  const w=state.world;
  const a={x:wrap(start.x,w.width),y:wrap(start.y,w.height),z:start.z||0};
  const b={x:wrap(end.x,w.width),y:wrap(end.y,w.height),z:end.z||0};
  // Moving residents are real obstacles. Dynamic occupancy is assessed at
  // planning time and still rechecked by move() before each tile transition.
  const occupied=new Set(state.npcs.filter(other=>
   other!==start&&other.alive!==false).map(pointKey));
  if(blocked(state,b)||occupied.has(pointKey(b)))return [];
  const queue=[a],back=new Map([[pointKey(a),null]]);
  for(let i=0;i<queue.length;i++){
   const p=queue[i];
   if(pointKey(p)===pointKey(b))break;
   for(const next of root.Frontier.neighbors(w,p)){
    if(back.has(pointKey(next))||occupied.has(pointKey(next)))continue;
    back.set(pointKey(next),p);queue.push(next);
   }
  }
  if(!back.has(pointKey(b)))return [];
  const path=[];
  for(let p=b;p&&pointKey(p)!==pointKey(a);p=back.get(pointKey(p)))path.push(p);
  return path.reverse();
 }
 const navCache=new WeakMap();
 function reachability(state,n){
  const world=state.world;
  const stairs=world.structures.filter(s=>s.type==='stairs')
   .map(s=>[s.x,s.y,s.z,s.toZ]).join(';');
  const signature=JSON.stringify(world.edits||{})+'|'+stairs;
  let cache=navCache.get(world);
  if(!cache||cache.signature!==signature){
   cache={signature,components:new Map()};navCache.set(world,cache);
  }
  const origin={x:n.x,y:n.y,z:n.z||0};
  const originKey=pointKey(origin);
  let seen=cache.components.get(originKey);
  if(!seen){
   const queue=[origin];seen=new Set([originKey]);
   for(let i=0;i<queue.length;i++){
    for(const next of root.Frontier.neighbors(world,queue[i])){
     if(!seen.has(pointKey(next))){seen.add(pointKey(next));queue.push(next);}
    }
   }
   for(const tileKey of seen)cache.components.set(tileKey,seen);
  }
  return target=>seen.has(pointKey({x:wrap(target.x,world.width),
   y:wrap(target.y,world.height),z:target.z||0}));
 }
 function invalidateNavigation(world){navCache.delete(world);}

 function available(state,n){
  const options=root.AgentWorld.available(n,state.world,state.npcs,reachability(state,n));
  const scoped=root.Perception?root.Perception.filterAffordances(state,n,options):options;
  // Past firsthand inspection is actionable knowledge, not live omniscience.
  // Resource counts are deliberately omitted: a once-known source can fail.
  if(root.EvidenceMemory&&n.energy>=12){
   const known=(n.evidenceMemory?.episodes||[]).filter(e=>
    e.certainty==='observed'&&e.type==='inspection'&&e.ref);
   const pairs=[['food','forage'],['water','fill_water'],
    ['wood','collect_wood'],['stone','collect_stone'],['fiber','collect_fiber']];
   for(const [kind,key] of pairs){
    if(scoped.some(o=>o.key===key))continue;
    const visits=known.filter(e=>e.text.startsWith('Inspected '+kind+' '));
    for(const previous of visits.slice().reverse()){
     const target=state.world.nodes.find(node=>node.id===previous.ref&&node.kind===kind);
     if(!target||distance(state,n,target)>18||
      !reachability(state,n)(target))continue;
     scoped.push({key,when:'Return to personally inspected '+kind+' source',
      target,ref:target.id});
     break;
    }
   }
   // Hearsay can motivate checking a destination, but not reveal live stock.
   const reports=(n.evidenceMemory?.claims||[])
    .filter(c=>c.status==='unverified').slice().sort((a,b)=>{
     const confidence=c=>root.EvidenceMemory.speakerReliability(n,c.speakerId).score;
     return confidence(b)-confidence(a)||
      distance(state,n,a)-distance(state,n,b)||
      b.at-a.at||a.id.localeCompare(b.id);
    });
   for(const claim of reports){
    const key=Object.fromEntries(pairs)[claim.kind];
    if(!key||scoped.some(o=>o.key===key&&o.ref===claim.sourceId)||
     scoped.some(o=>o.key===key))continue;
    const target=state.world.nodes.find(x=>
     x.id===claim.sourceId&&x.kind===claim.kind);
    if(!target||distance(state,n,target)>18||
     !reachability(state,n)(target))continue;
    scoped.push({key,when:'Investigate unverified '+claim.kind+' source reported by another resident',
     target,ref:target.id});
   }
  }
  return scoped;
 }
 function moveTo(state,n,target){
  const path=pathfind(state,n,target);
  if(!path.length&&distance(state,n,target)>0)return false;
  n.path=path;n.travel=null;
  if(path.length){
   const next=path[0],dx=next.x-n.x,dy=next.y-n.y,w=state.world.width,h=state.world.height;
   const hx=Math.abs(dx)>w/2?(dx>0?dx-w:dx+w):dx;
   const hy=Math.abs(dy)>h/2?(dy>0?dy-h:dy+h):dy;
   n.facing=Math.abs(hx)>Math.abs(hy)?(hx>0?'right':'left'):(hy>0?'down':'up');
  }
  return true;
 }
 function approach(state,n,target){
  const routes=root.Frontier.neighbors(state.world,target).map(p=>({p,path:pathfind(state,n,p)}))
   .filter(v=>v.path.length||distance(state,n,v.p)===0)
   .sort((a,b)=>a.path.length-b.path.length);
  return !!routes.length&&moveTo(state,n,routes[0].p);
 }
 function actionDuration(n,key){
  if(key==='craft_stage'&&n.workpiece){
   const spec=root.Crafting.getRecipe(n.workpiece.recipe);
   return spec?.stages[n.workpiece.stage]?.minutes||3;
  }
  return DURATION[key]||2;
 }
 function stats(n){
  return n.activityStats ||= {decisions:0,none:0,rejected:0,started:0,
   completed:0,failed:0,blocked:0,errors:0,last:'No decisions yet'};
 }
 function note(n,text){stats(n).last=String(text).slice(0,110);}
 function move(state,n,elapsed){
  if(!n.path?.length)return;
  let budget=elapsed;
  for(let moves=0;moves<100&&budget>0&&n.path.length;moves++){
   const next=n.path[0];
   if(blocked(state,next)){
    root.Activities.interrupt(state,n,'ROUTE_BLOCKED');
    n.path=[];n.travel=null;n.task=null;n.goal='Route invalidated';
    stats(n).blocked++;note(n,'Movement: destination became blocked');
    n.thoughtAt=state.clock+3;break;
   }
   if(!n.travel){
    const terrain=root.Frontier.terrainAt(state.world,next.x,next.y);
    const minutes=terrain==='ridge'?0.14:terrain==='marsh'?0.12:0.07;
    n.travel={remaining:minutes,total:minutes};
   }
   if(budget<n.travel.remaining){n.travel.remaining-=budget;break;}
   budget-=n.travel.remaining;
   if(state.npcs.some(other=>other!==n&&other.x===next.x&&other.y===next.y&&
    (other.z||0)===(next.z||0))){
    n.blockedFor=(n.blockedFor||0)+elapsed;n.travel=null;
    if(n.blockedFor>5){
     root.Activities.interrupt(state,n,'ROUTE_BLOCKED');
     n.path=[];n.task=null;n.goal='Route blocked by another inhabitant';
     stats(n).blocked++;note(n,'Movement: another inhabitant blocked passage');
     n.thoughtAt=state.clock+3;n.blockedFor=0;
    }
    break;
   }
   n.x=next.x;n.y=next.y;n.z=next.z||0;
   n.path.shift();n.travel=null;n.blockedFor=0;
   root.Frontier.reveal(state.world,n.x,n.y,7);
  }
  n.motion=n.path.length?1:0;
  if(n.task&&!n.path.length&&n.task.readyAt===null)
   n.task.readyAt=state.clock+(n.currentActivity?
    n.currentActivity.workRequired-n.currentActivity.workDone:actionDuration(n,n.task.key));
 }
 function remember(state,n,text,meta={}){
  const memory=root.Cognition.record(n,text,state.clock,meta);
  const stamp=root.Civilization.stamp(state.clock);
  memory.time='Y'+stamp.year+' '+String(stamp.hour).padStart(2,'0')+':'+
   String(stamp.minute).padStart(2,'0');
  return memory;
 }
 function log(state,message,type='routine',hooks={}){
  const stamp=root.Civilization.stamp(state.clock);
  const time='Y'+stamp.year+' '+String(stamp.hour).padStart(2,'0')+':'+
   String(stamp.minute).padStart(2,'0');
  state.events.unshift({time,text:String(message).slice(0,250),type});
  state.events=state.events.slice(0,100);
  hooks.onRecord?.();
 }
 function begin(state,n,action,source='offline routine',scores=null,hooks={}){
  if(!state.npcs.includes(n)||n.task||n.peerReservedFor){
   stats(n).rejected++;note(n,'Cannot start '+action+': already occupied');return false;
  }
  const option=available(state,n).find(v=>v.key===action);
  if(!option){
   stats(n).rejected++;note(n,'Action '+action+' no longer available');return false;
  }
  if(action==='socialize'&&source==='offline routine'&&
   (n.needs.social<50||n.energy<25||!option.target||
    option.target.needs.social<45||option.target.energy<20)){
   stats(n).rejected++;note(n,'Offline companion not mutually willing');return false;
  }
  let resumed=!GOALS.has(action)&&root.Activities.eligible(n,action,option.ref);
  let resumeCandidate=resumed?(n.suspendedActivities||[]).findLast(a=>
   a.key===action&&a.ref===(option.ref??null)&&
   (action!=='craft_stage'||(a.workpieceRecipe===n.workpiece?.recipe&&
    a.workpieceStage===n.workpiece?.stage))):null;
  if(resumeCandidate&&!root.Reservations.validCommand(state,
    resumeCandidate.commandId,resumeCandidate.reservationIds?.length||0)){
   // A lapsed material claim must not shadow a fresh legal action forever.
   // Discard only this suspended activity, never its separate workpiece.
   root.Reservations.releaseCommand(state,resumeCandidate.commandId,
    'RESERVATION_EXPIRED');
   n.suspendedActivities=n.suspendedActivities.filter(a=>a!==resumeCandidate);
   resumed=false;resumeCandidate=null;
  }
  const commandId=resumeCandidate?.commandId||
   'cmd_'+(state.commandSeq=(state.commandSeq||0)+1);
  const request=root.Reservations.specsFor(state,n,action,option.ref);
  const hold=resumed?{ok:true,claims:root.Reservations.active(state)
    .filter(x=>x.commandId===commandId)}:
   root.Reservations.claim(state,n.id,commandId,request);
  if(!hold.ok){
   stats(n).rejected++;note(n,'Material blocked: '+hold.reason);
   root.WorldReceipts.decision(state,n,action,'world','REJECTED',hold.reason);
   return false;
  }
  if(GOALS.has(action)){
   if(n.plan)return false;
   n.plan={key:action,steps:0,commandId};n.nextPlanAt=state.clock;
   n.goal='Pursuing '+action;n.action='none';n.source=source;n.scores=scores;
  }else if(action==='none'){
   n.action='none';n.task=null;n.source=source;n.scores=scores;
  }else if(action==='rest'){
   n.action='rest';n.task=null;n.path=[];n.travel=null;
   n.source=source;n.scores=scores;n.goal='Resting';
  }else{
   const target=option.target;
   if(target&&distance(state,n,target)>1){
    // World interactions only need an adjacent free tile. Exploration alone
    // requires entering its destination; an occupied spring must stay usable.
    const good=action==='explore'?moveTo(state,n,target):
     approach(state,n,target);
    if(!good){
     root.Reservations.releaseCommand(state,commandId,'ROUTE_REJECTED');
     stats(n).rejected++;note(n,'No reachable path for '+action);
     remember(state,n,'Failed to reach a destination for '+action,
      {kind:'failure',action,ref:option.ref,salience:3});
     return false;
    }
   }
   n.action=action;n.source=source;n.scores=scores;
   const active=resumed?root.Activities.resume(state,n,action,option.ref):null;
   const duration=actionDuration(n,action);
   const remaining=active?active.workRequired-active.workDone:duration;
   n.task={key:action,ref:option.ref||null,commandId,
    reservationIds:hold.claims.map(x=>x.idTag),readyAt:n.path.length?null:
    state.clock+remaining};
   if(active)active.reservationIds=[...n.task.reservationIds];
   if(!active){
    const activity=root.Activities.start(state,n,n.task,duration);
    activity.reservationIds=[...n.task.reservationIds];
   }
   if(action==='socialize'&&option.target)option.target.peerReservedFor=n.id;
   n.goal=action.replaceAll('_',' ')+' (self-chosen)';
  }
  root.Agency.begin(n,action,state.clock,source);
  if(source==='project'&&n.project)n.goal='Pursuing '+n.project.goal;
  if(!resumed)root.WorldReceipts.accept(state,n,action,commandId,option.ref,source);
  if(action!=='none'&&source==='plan'&&n.plan)
   n.goal='Pursuing '+n.plan.key+' · '+action.replaceAll('_',' ');
  if(action==='none'){
   stats(n).none++;note(n,'Selected none ['+source+']');
  }else{
   stats(n).started++;note(n,'Started '+action+' ['+source+']');
  }
  log(state,n.name+' chose '+action.replaceAll('_',' ')+' ['+source+']',
   ['rein','hivemind'].includes(source)?'ai':'routine',hooks);
  if(['rein','hivemind'].includes(source))
   remember(state,n,'Chose '+action+' from perceived options');
  return true;
 }
 function finishPlan(state,n,reason,hooks={}){
  if(!n.plan)return;
  const success=reason==='Plan completed';
  root.Agency.finish(n,success,state.clock);
  remember(state,n,'Plan '+n.plan.key+': '+reason,
   {kind:success?'success':'failure',action:n.plan.key,salience:success?4:3});
  log(state,n.name+': '+reason,success?'social':'warning',hooks);
  n.plan=null;n.action='none';n.task=null;
  n.goal='Reconsidering my next action';n.thoughtAt=state.clock+3;
 }
 function complete(state,n,hooks={}){
  if(!n.task||n.path.length||n.task.readyAt===null||state.clock<n.task.readyAt)return;
  if(n.task.key==='socialize'){
   if(hooks.social)return hooks.social(n);
   const other=state.npcs.find(v=>v.id===n.task.ref);
   const willing=n.source==='offline routine'&&other&&
    other.peerReservedFor===n.id&&other.alive!==false&&
    other.needs.social>=45&&other.energy>=20&&
    !other.task&&!other.path?.length&&!other.peerPending&&
    root.Frontier.distance(state.world,n,other)<=2;
   if(!willing){
    if(other?.peerReservedFor===n.id)delete other.peerReservedFor;
    root.Activities.finish(state,n,false,'Offline companionship interrupted');
    n.task=null;n.action='none';n.thoughtAt=state.clock+15;return;
   }
   // Physical co-presence and mutual willingness allow time together.
   // No invented speech, transcript, or social affinity is awarded.
   n.task.approved=true;
  }
  root.Activities.progress(state,n);
  const finished={key:n.task.key,ref:n.task.ref,commandId:n.task.commandId,
   source:n.source};
  const expected=n.task.reservationIds?.length||0;
  const outcome=root.WorldReceipts.execute(state,n,finished,()=>(
   root.Reservations.validCommand(state,finished.commandId,expected)?
    root.AgentWorld.complete(n,state.world,state.npcs):
    {ok:false,message:'RESERVATION_EXPIRED: required materials unavailable'}
  ));
  root.Reservations.releaseCommand(state,finished.commandId,
   outcome.ok?'CONSUMED_OR_RELEASED':'ACTION_FAILED');
  if(finished.key==='socialize'&&finished.source==='offline routine'){
   const peer=state.npcs.find(v=>v.id===finished.ref);
   if(peer?.peerReservedFor===n.id)delete peer.peerReservedFor;
  }
  root.Activities.finish(state,n,outcome.ok,outcome.ok?null:outcome.message);
  if(finished.source==='project'||(n.project&&finished.source==='plan'&&
    finished.key==='craft_stage'&&n.plan?.key==='craft_project'))
   root.Projects?.onOutcome(state,n,finished.key,outcome.ok);
  root.Agency.outcome(n,state.world,finished.key,finished.ref,outcome.ok,state.clock);
  if(outcome.ok){
   stats(n).completed++;note(n,'Completed: '+outcome.message);
   remember(state,n,outcome.message,
    {kind:'success',action:finished.key,ref:finished.ref,
     salience:finished.key==='inspect'?3:2});
   log(state,n.name+': '+outcome.message,'social',hooks);
   if(n.plan){
    n.plan.steps++;n.nextPlanAt=state.clock+1;
    if(n.plan.steps>=24)finishPlan(state,n,'Plan step limit reached',hooks);
   }else{
    root.Agency.finish(n,true,state.clock);n.thoughtAt=state.clock+2;
   }
  }else{
   stats(n).failed++;note(n,'Task failed: '+outcome.message);
   remember(state,n,'Could not finish '+finished.key+': '+outcome.message,
    {kind:'failure',action:finished.key,ref:finished.ref,salience:3});
   log(state,n.name+': '+outcome.message+' [rejected]','warning',hooks);
   if(n.plan)finishPlan(state,n,'Plan blocked: '+outcome.message,hooks);
   else root.Agency.finish(n,false,state.clock);
   n.thoughtAt=state.clock+4;
  }
  n.action='none';
  return outcome;
 }
 function advancePlan(state,n,hooks={}){
  if(!n.plan||n.task||n.path.length||n.action==='rest'||
   state.clock<(n.nextPlanAt||0))return;
  const result=root.AgentWorld.nextPlanAction(n,state.world,state.npcs,reachability(state,n));
  if(result.status==='done')return finishPlan(state,n,'Plan completed',hooks);
  if(result.status==='blocked')return finishPlan(state,n,result.reason,hooks);
  if(!begin(state,n,result.option.key,'plan',null,hooks))
   finishPlan(state,n,'Subaction unavailable',hooks);
 }
 function advanceProject(state,n,hooks={}){
  if(!root.Projects||!n.project||n.task||n.plan||n.path?.length)return false;
  const result=root.Projects.next(state,n,available(state,n));
  if(result.status!=='action')return false;
  const ok=begin(state,n,result.action,'project',null,hooks);
  if(!ok){
   n.project.status='BLOCKED';
   n.project.blockedReason='ACTION_START_REJECTED:'+result.action;
   n.project.nextAt=state.clock+5;
  }
  return ok;
 }
 function survival(state,n,hooks={}){
  if(n.peerPending||n.peerReservedFor)return false;
  const critical=n.needs.thirst>=90||n.needs.hunger>=95||
   n.bio?.hydrationBudgetMl<200;
  // Do not perform expensive affordance searches during ongoing physical work
  // unless the body is in immediate danger.
  if((n.task||n.path.length||n.action==='rest')&&!critical)return false;
  const hydration=n.bio?.hydrationBudgetMl??2400;
  // An emergency-interrupted craft may resume once the immediate threat has
  // been relieved. A 450 ml buffer outlasts ordinary bounded work stages.
  if((n.suspendedActivities?.length||n.plan?.key==='craft_project')&&
   hydration>=450&&
   n.needs.thirst<85&&n.needs.hunger<90&&n.energy>18)return false;
  const waterSafe=n.needs.thirst<62&&hydration>=1200&&
   (n.inventory.water>=2||hydration>=1600);
  if(waterSafe&&n.needs.hunger<85&&n.bio?.longTermKcal>=150&&
   n.energy>18)return false;
  const urgent=root.Cognition.instinct(n,available(state,n));
  if(!urgent)return false;
  if(n.task?.key===urgent)return false;
  if(n.task||n.path.length||n.action==='rest'){
   root.Activities.interrupt(state,n,'CRITICAL_NEED');
   n.task=null;n.path=[];n.travel=null;n.action='none';
   if(n.plan)n.nextPlanAt=state.clock+2;
   remember(state,n,'Interrupted work to address immediate bodily danger',
    {kind:'need',salience:4});
  }
  return begin(state,n,urgent,'survival instinct',null,hooks);
 }
 function chooseOffline(state,n){
  const options=available(state,n).filter(o=>o.key!=='socialize'||
   (n.needs.social>=50&&n.energy>=25&&
    o.target?.needs.social>=45&&o.target?.energy>=20));
  const selected=root.Agency.choose(n,options,state.world,state.clock);
  if(selected)return selected.key;
  return root.AgentWorld.fallback(n,options);
 }
 function scheduleOffline(state,hooks={}){
  if(!state.auto||state.paused)return;
  for(const n of state.npcs)survival(state,n,hooks);
  const due=state.npcs.filter(n=>!n.task&&!n.plan&&!n.path.length&&
   (!n.project||n.project.status==='COMPLETED')&&
   !n.peerPending&&!n.peerReservedFor&&n.action!=='rest'&&
   state.clock>=n.thoughtAt).sort((a,b)=>a.thoughtAt-b.thoughtAt);
  for(const n of due){
   if(n.needs.social>=80){
    const partner=available(state,n).find(o=>o.key==='socialize'&&
     o.target?.needs.social>=45&&o.target?.energy>=20&&n.energy>=25);
    if(partner&&begin(state,n,'socialize','offline routine',null,hooks)){
     n.thoughtAt=state.clock+18;continue;
    }
   }
   if(root.Projects?.maybeStart(state,n)){
    advanceProject(state,n,hooks);continue;
   }
   const suspended=n.suspendedActivities?.at(-1);
   const canResume=suspended&&available(state,n).some(o=>o.key===suspended.key&&
    (o.ref??null)===suspended.ref);
   const action=canResume?suspended.key:chooseOffline(state,n);
   const ok=begin(state,n,action,canResume?'resume':'offline routine',null,hooks);
   n.thoughtAt=state.clock+(ok?18:3);
  }
 }
 root.WorldRuntime={DURATION,stats,note,pathfind,reachability,available,moveTo,
  approach,move,actionDuration,begin,complete,advancePlan,advanceProject,survival,chooseOffline,scheduleOffline,
  invalidateNavigation,
  finishPlan,remember,log};
})(globalThis);
