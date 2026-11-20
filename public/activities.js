// Shared, bounded lifecycle for timed physical work. The authoritative effect
// still commits through WorldRuntime/WorldReceipts exactly once at completion.
(function(root){
 'use strict';
 const MAX_SUSPENDED=4;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function valid(a){
  return a&&typeof a.commandId==='string'&&/^cmd_[1-9]\d*$/.test(a.commandId)&&
   typeof a.key==='string'&&root.AgentWorld.KEYS.includes(a.key)&&
   Number.isFinite(a.workRequired)&&a.workRequired>0&&a.workRequired<=1440&&
   Number.isFinite(a.workDone)&&a.workDone>=0&&a.workDone<=a.workRequired&&
   ['RUNNING','INTERRUPTED','BLOCKED'].includes(a.state);
 }
 function progress(state,n){
  const a=n.currentActivity;
  if(!a||!valid(a))return null;
  if(n.task?.readyAt!==null&&Number.isFinite(n.task?.readyAt)){
   a.workDone=clamp(a.workRequired-(n.task.readyAt-state.clock),0,a.workRequired);
   a.lastTick=state.clock;
  }
  return a;
 }
 function start(state,n,task,minutes){
  const a={id:'act_'+task.commandId,commandId:task.commandId,key:task.key,
   ref:task.ref??null,state:'RUNNING',workRequired:minutes,workDone:0,
   startedAt:state.clock,lastTick:state.clock,reason:null,
   workpieceRecipe:n.workpiece?.recipe??null,
   workpieceStage:n.workpiece?.stage??null,reservationIds:[]};
  n.currentActivity=a;
  return a;
 }
 function matches(n,a,key,ref){
  return valid(a)&&a.key===key&&a.ref===(ref??null)&&
   (key!=='craft_stage'||(a.workpieceRecipe===n.workpiece?.recipe&&
    a.workpieceStage===n.workpiece?.stage));
 }
 function eligible(n,key,ref){
  return (n.suspendedActivities||[]).some(a=>matches(n,a,key,ref));
 }
 function resume(state,n,key,ref){
  const stack=n.suspendedActivities||[];
  const index=stack.findLastIndex(a=>matches(n,a,key,ref));
  if(index<0)return null;
  const [a]=stack.splice(index,1);
  a.state='RUNNING';a.lastTick=state.clock;a.reason=null;
  n.currentActivity=a;
  root.WorldReceipts.lifecycle(state,n,a,'RESUMED');
  return a;
 }
 function abandon(state,n,activity,reason){
  const stats=root.WorldRuntime?.stats(n);
  if(stats)stats.abandoned=(stats.abandoned||0)+1;
  root.WorldReceipts.lifecycle(state,n,activity,'ABANDONED',reason);
 }
 function interrupt(state,n,reason='INTERRUPTED'){
  const a=progress(state,n);
  if(!a)return null;
  a.state=reason==='ROUTE_BLOCKED'?'BLOCKED':'INTERRUPTED';
  a.reason=String(reason).slice(0,48);
  a.lastTick=state.clock;
  const stack=n.suspendedActivities||=[];
  stack.push(a);
  if(stack.length>MAX_SUSPENDED){
   const expired=stack.shift();
   root.Reservations?.releaseCommand(state,expired.commandId,'ACTIVITY_EVICTED');
   abandon(state,n,expired,'ACTIVITY_EVICTED');
  }
  n.currentActivity=null;
  root.WorldReceipts.lifecycle(state,n,a,'INTERRUPTED',a.reason);
  return a;
 }
 function finish(state,n,success=true,reason=null){
  const a=progress(state,n);
  if(!a)return null;
  a.state=success?'COMPLETED':'CANCELLED';
  a.reason=reason===null?null:String(reason).slice(0,48);
  a.workDone=success?a.workRequired:a.workDone;
  a.lastTick=state.clock;
  n.lastActivity={id:a.id,key:a.key,state:a.state,workDone:a.workDone,
   workRequired:a.workRequired,reason:a.reason};
  n.currentActivity=null;
  if(!success&&!root.WorldReceipts.committed(state,a.commandId))
   abandon(state,n,a,a.reason);
  return a;
 }
 function restore(n,source,clock){
  if(source?.lastActivity&&typeof source.lastActivity.id==='string'&&
   /^act_cmd_[1-9]\d*$/.test(source.lastActivity.id)&&
   typeof source.lastActivity.key==='string'&&
   root.AgentWorld.KEYS.includes(source.lastActivity.key)&&
   ['COMPLETED','CANCELLED'].includes(source.lastActivity.state)&&
   Number.isFinite(source.lastActivity.workRequired)&&
   source.lastActivity.workRequired>0&&source.lastActivity.workRequired<=1440&&
   Number.isFinite(source.lastActivity.workDone)&&
   source.lastActivity.workDone>=0&&
   source.lastActivity.workDone<=source.lastActivity.workRequired)
   n.lastActivity={id:source.lastActivity.id,key:source.lastActivity.key,
    state:source.lastActivity.state,workDone:source.lastActivity.workDone,
    workRequired:source.lastActivity.workRequired,
    reason:typeof source.lastActivity.reason==='string'?
     source.lastActivity.reason.slice(0,48):null};
  const copy=a=>({
   id:'act_'+a.commandId,commandId:a.commandId,key:a.key,
   ref:typeof a.ref==='string'?a.ref:null,state:a.state,
   workRequired:a.workRequired,workDone:a.workDone,
   startedAt:Number.isFinite(a.startedAt)&&a.startedAt<=clock?a.startedAt:clock,
   lastTick:clock,reason:typeof a.reason==='string'?a.reason.slice(0,48):null,
   workpieceRecipe:typeof a.workpieceRecipe==='string'?a.workpieceRecipe:null,
   workpieceStage:Number.isInteger(a.workpieceStage)?a.workpieceStage:null,
   reservationIds:Array.isArray(a.reservationIds)?a.reservationIds.filter(x=>
    typeof x==='string'&&/^res_[1-9]\d*$/.test(x)).slice(0,40):[]
  });
  if(Array.isArray(source?.suspendedActivities)){
   n.suspendedActivities=source.suspendedActivities.filter(valid).slice(-MAX_SUSPENDED).map(copy);
  }
  if(valid(source?.currentActivity)&&source.currentActivity.state==='RUNNING'&&
   n.task?.key===source.currentActivity.key&&
   n.task.commandId===source.currentActivity.commandId)
   n.currentActivity=copy(source.currentActivity);
 }
 root.Activities={start,progress,eligible,resume,interrupt,finish,restore};
})(globalThis);
