// Shared, bounded lifecycle for timed physical work. The authoritative effect
// still commits through WorldRuntime/WorldReceipts exactly once at completion.
(function(root){
 'use strict';
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
   workpieceStage:n.workpiece?.stage??null};
  n.currentActivity=a;
  return a;
 }
 function eligible(n,key,ref){
  return (n.suspendedActivities||[]).some(a=>valid(a)&&
   a.key===key&&a.ref===(ref??null)&&
   (key!=='craft_stage'||(a.workpieceRecipe===n.workpiece?.recipe&&
    a.workpieceStage===n.workpiece?.stage)));
 }
 function resume(state,n,key,ref){
  const stack=n.suspendedActivities||[];
  const index=stack.findLastIndex(a=>valid(a)&&a.key===key&&
   a.ref===(ref??null)&&(key!=='craft_stage'||
    (a.workpieceRecipe===n.workpiece?.recipe&&a.workpieceStage===n.workpiece?.stage)));
  if(index<0)return null;
  const [a]=stack.splice(index,1);
  a.state='RUNNING';a.lastTick=state.clock;a.reason=null;
  n.currentActivity=a;
  root.WorldReceipts.lifecycle(state,n,a,'RESUMED');
  return a;
 }
 function interrupt(state,n,reason='INTERRUPTED'){
  const a=progress(state,n);
  if(!a)return null;
  a.state=reason==='ROUTE_BLOCKED'?'BLOCKED':'INTERRUPTED';
  a.reason=String(reason).slice(0,48);
  a.lastTick=state.clock;
  (n.suspendedActivities ||= []).push(a);
  n.suspendedActivities=n.suspendedActivities.slice(-4);
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
  return a;
 }
 function restore(n,source,clock){
  const copy=a=>({
   id:'act_'+a.commandId,commandId:a.commandId,key:a.key,
   ref:typeof a.ref==='string'?a.ref:null,state:a.state,
   workRequired:a.workRequired,workDone:a.workDone,
   startedAt:Number.isFinite(a.startedAt)&&a.startedAt<=clock?a.startedAt:clock,
   lastTick:clock,reason:typeof a.reason==='string'?a.reason.slice(0,48):null,
   workpieceRecipe:typeof a.workpieceRecipe==='string'?a.workpieceRecipe:null,
   workpieceStage:Number.isInteger(a.workpieceStage)?a.workpieceStage:null
  });
  if(Array.isArray(source?.suspendedActivities)){
   n.suspendedActivities=source.suspendedActivities.filter(valid).slice(-4).map(copy);
  }
  if(valid(source?.currentActivity)&&source.currentActivity.state==='RUNNING'&&
   n.task?.key===source.currentActivity.key&&
   n.task.commandId===source.currentActivity.commandId)
   n.currentActivity=copy(source.currentActivity);
 }
 root.Activities={start,progress,eligible,resume,interrupt,finish,restore};
})(globalThis);
