// Finite material claims. Reservations never move or mint stock; all effects
// must still run through authoritative physical commands and world receipts.
(function(root){
 'use strict';
 const KINDS=new Set(['wood','stone','fiber','cord','blade','plank','crate','hatchet']);
 const validCount=n=>Number.isSafeInteger(n)&&n>0&&n<=1000;
 const validId=s=>typeof s==='string'&&s.length>0&&s.length<=128;
 const ledger=state=>state.reservations ||= [];
 function source(state,sourceId){
  if(!validId(sourceId))return null;
  if(sourceId.startsWith('person_')){
   const actor=state.npcs.find(n=>n.id===sourceId);
   return actor?{type:'person',stock:actor.inventory,actor}:null;
  }
  const crate=state.world.structures.find(s=>s.id===sourceId&&s.type==='crate');
  return crate?{type:'crate',stock:crate.contents,crate}:null;
 }
 function active(state,sourceId,kind,exclude=null){
  return ledger(state).filter(r=>r.sourceId===sourceId&&r.kind===kind&&
   r.commandId!==exclude).reduce((sum,r)=>sum+r.quantity,0);
 }
 function available(state,sourceId,kind){
  const src=source(state,sourceId);
  if(!src||!KINDS.has(kind))return 0;
  return Math.max(0,(src.stock?.[kind]||0)-active(state,sourceId,kind));
 }
 function reserve(state,{commandId,actorId,sourceId,kind,quantity,expiresAt}){
  if(!validId(commandId)||!validId(actorId)||!validId(sourceId)||
   !KINDS.has(kind)||!validCount(quantity)||!Number.isFinite(expiresAt)||
   expiresAt<=state.clock)
   return {ok:false,reason:'INVALID_RESERVATION'};
  const owner=state.npcs.find(n=>n.id===actorId);
  if(!owner)return {ok:false,reason:'ACTOR_MISSING'};
  const existing=ledger(state).find(r=>r.commandId===commandId);
  if(existing)return existing.actorId===actorId&&existing.sourceId===sourceId&&
   existing.kind===kind&&existing.quantity===quantity?
   {ok:true,reservation:existing,replayed:true}:
   {ok:false,reason:'COMMAND_CONFLICT'};
  const src=source(state,sourceId);
  if(!src)return {ok:false,reason:'SOURCE_MISSING'};
  if(available(state,sourceId,kind)<quantity)
   return {ok:false,reason:'INSUFFICIENT_UNRESERVED_STOCK'};
  const record={commandId,actorId,sourceId,kind,quantity,expiresAt};
  ledger(state).push(record);
  return {ok:true,reservation:record,replayed:false};
 }
 function release(state,commandId){
  const list=ledger(state),i=list.findIndex(r=>r.commandId===commandId);
  if(i<0)return false;
  list.splice(i,1);return true;
 }
 // Eliminate orphaned, expired or stock-overcommitting claims deterministically.
 // Keep earliest claims when a source's stock shrinks unexpectedly.
 function reconcile(state){
  const previous=ledger(state),keep=[],used=new Map();
  for(const r of previous){
   if(!r||!validId(r.commandId)||!validId(r.actorId)||
    !validId(r.sourceId)||!KINDS.has(r.kind)||!validCount(r.quantity)||
    !Number.isFinite(r.expiresAt)||r.expiresAt<=state.clock||
    !state.npcs.some(n=>n.id===r.actorId))continue;
   const src=source(state,r.sourceId);
   if(!src)continue;
   const key=r.sourceId+':'+r.kind;
   const count=used.get(key)||0;
   if(count+r.quantity>(src.stock?.[r.kind]||0)||
    keep.some(x=>x.commandId===r.commandId))continue;
   keep.push(r);used.set(key,count+r.quantity);
  }
  state.reservations=keep;
  return previous.length-keep.length;
 }
 // Atomic move from crate to the reservation holder; the runtime must first
 // travel to the crate and complete a timed haul action.
 function collect(state,commandId){
  const r=ledger(state).find(x=>x.commandId===commandId);
  if(!r)return {ok:false,reason:'RESERVATION_MISSING'};
  const src=source(state,r.sourceId);
  const actor=state.npcs.find(n=>n.id===r.actorId);
  if(!src||!actor)return {ok:false,reason:'SOURCE_OR_ACTOR_MISSING'};
  if(src.type!=='crate')return {ok:false,reason:'NOT_A_CRATE_HAUL'};
  if(root.Frontier.distance(state.world,actor,src.crate)>1)
   return {ok:false,reason:'SOURCE_OUT_OF_REACH'};
  if((src.stock[r.kind]||0)<r.quantity)
   return {ok:false,reason:'SOURCE_DEPLETED'};
  if((actor.inventory[r.kind]||0)+r.quantity>1000)
   return {ok:false,reason:'CARRY_CAPACITY_EXCEEDED'};
  src.stock[r.kind]-=r.quantity;
  actor.inventory[r.kind]=(actor.inventory[r.kind]||0)+r.quantity;
  release(state,commandId);
  return {ok:true,quantity:r.quantity,kind:r.kind,from:r.sourceId,to:actor.id};
 }
 function restore(state,saved){
  state.reservations=Array.isArray(saved)?saved.slice(0,4096).map(r=>({
   commandId:r?.commandId,actorId:r?.actorId,sourceId:r?.sourceId,
   kind:r?.kind,quantity:r?.quantity,expiresAt:r?.expiresAt
  })):[];
  reconcile(state);
 }
 root.ResourceReservations={available,reserve,release,reconcile,collect,restore};
})(globalThis);
