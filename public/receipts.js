// Bounded, deterministic receipts for committed physical world operations.
// No narration, private memory, persona, model prompts, or secrets are serialized.
(function(root){
 'use strict';
 const MAX=4096;
 const plain=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
 const nums=(oldObj={},newObj={})=>{
  const out=[];
  for(const key of [...new Set([...Object.keys(oldObj),...Object.keys(newObj)])].sort()){
   const a=oldObj[key]??0,b=newObj[key]??0;
   if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b)
    out.push({key,before:a,after:b,delta:b-a});
  }
  return out;
 };
 const asMap=rows=>Object.fromEntries(rows.map(x=>[x.id,plain(x)]));
 function snapshot(state,n){
  return {
   inventory:{...n.inventory},skills:{...n.skills},
   needs:{...n.needs},energy:n.energy,health:n.health,
   foodPantry:n.bio?.pantry?.length??0,hydrationMl:n.bio?.hydrationBudgetMl??0,
   nodes:Object.fromEntries(state.world.nodes.map(x=>[x.id,x.stock])),
   structures:asMap(state.world.structures),items:asMap(state.world.items),
   observedCount:n.knowledge?.observations?.length||0,
   learnedRecipes:[...(n.knowledge?.recipes||[])],visitedCount:n.visited?.length||0,
   others:Object.fromEntries(state.npcs.filter(a=>a!==n).map(a=>[a.id,{
    inventory:{...a.inventory},needs:{...a.needs},
    foodPantry:a.bio?.pantry?.length||0,lastPeerAt:a.lastPeerAt??null
   }])),
   workpiece:plain(n.workpiece),craftedItems:plain(n.craftedItems||[])
  };
 }
 function change(before,after){
  const collections={};
  for(const kind of ['structures','items']){
   const a=before[kind],b=after[kind],added=[],removed=[],updated=[];
   for(const id of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
    if(!(id in a))added.push(b[id]);
    else if(!(id in b))removed.push(a[id]);
    else if(JSON.stringify(a[id])!==JSON.stringify(b[id]))
     updated.push({id,before:a[id],after:b[id]});
   }
   if(added.length||removed.length||updated.length)
    collections[kind]={added,removed,updated};
  }
  const delta={
   inventory:nums(before.inventory,after.inventory),
   skills:nums(before.skills,after.skills),
   needs:nums(before.needs,after.needs),
   nodeStock:nums(before.nodes,after.nodes),
   body:nums({energy:before.energy,health:before.health,
    foodPantry:before.foodPantry,hydrationMl:before.hydrationMl},
    {energy:after.energy,health:after.health,
     foodPantry:after.foodPantry,hydrationMl:after.hydrationMl})
  };
  for(const id of [...new Set([...Object.keys(before.others),...Object.keys(after.others)])].sort()){
   const a=before.others[id],b=after.others[id];
   if(!a||!b)continue;
   const inventory=nums(a.inventory,b.inventory),needs=nums(a.needs,b.needs);
   const personal=nums({foodPantry:a.foodPantry,lastPeerAt:a.lastPeerAt||0},
    {foodPantry:b.foodPantry,lastPeerAt:b.lastPeerAt||0});
   if(inventory.length||needs.length||personal.length)
    (delta.otherActors ||= []).push({actorId:id,inventory,needs,personal});
  }
  const knowledge={
   observations:after.observedCount-before.observedCount,
   visited:after.visitedCount-before.visitedCount,
   learnedMethods:after.learnedRecipes.filter(x=>!before.learnedRecipes.includes(x))
  };
  if(knowledge.observations||knowledge.visited||knowledge.learnedMethods.length)
   delta.knowledge=knowledge;
  if(Object.keys(collections).length)delta.collections=collections;
  if(JSON.stringify(before.workpiece)!==JSON.stringify(after.workpiece))
   delta.workpiece={before:before.workpiece,after:after.workpiece};
  if(JSON.stringify(before.craftedItems)!==JSON.stringify(after.craftedItems))
   delta.craftedItems={before:before.craftedItems,after:after.craftedItems};
  return delta;
 }
 function hasDelta(delta){return Object.values(delta).some(v=>
  Array.isArray(v)?v.length>0:v!==undefined);}
 function append(state,input){
  state.receipts ||= [];
  state.receiptSeq=(state.receiptSeq||0)+1;
  const receipt={id:'evt_'+state.receiptSeq,sequence:state.receiptSeq,
   clock:state.clock,actorId:input.actorId,commandId:input.commandId,
   action:input.action,targetId:input.targetId??null,
   status:input.status,reason:input.reason??null,
   source:input.source??null,
   inferenceMs:Number.isFinite(input.inferenceMs)&&input.inferenceMs>=0?
    Math.min(60000,input.inferenceMs):null,
   effectRevision:state.effectRevision||0,delta:input.delta||{}};
  state.receipts.push(receipt);
  if(state.receipts.length>MAX)state.receipts.splice(0,state.receipts.length-MAX);
  return receipt;
 }
 function accept(state,n,action,commandId,ref=null,source='simulation'){
  return append(state,{actorId:n.id,commandId,action,targetId:ref,
   status:'ACCEPTED',source:String(source).slice(0,32)});
 }
 function decision(state,n,action,source,status='DECIDED',reason=null,inferenceMs=null){
  return append(state,{actorId:n.id,commandId:null,action,
   source:String(source).slice(0,32),status,reason,inferenceMs});
 }
 function committed(state,commandId){
  return state.receipts?.find(r=>r.commandId===commandId&&
   (r.status==='COMPLETED'||r.status==='FAILED'))||null;
 }
 function execute(state,n,task,apply){
  if(typeof apply!=='function')throw Error('World effect callback is required');
  if(!task)throw Error('Authoritative operation requires a task');
  if(!task.commandId)task.commandId='cmd_'+(state.commandSeq=(state.commandSeq||0)+1);
  const previous=committed(state,task.commandId);
  if(previous)return {ok:false,message:'Duplicate command; already resolved',
   duplicate:true,receipt:previous};
  const before=snapshot(state,n),revision=state.effectRevision||0;
  const outcome=apply();
  if(!outcome||typeof outcome.ok!=='boolean')throw Error('Invalid world result');
  const delta=change(before,snapshot(state,n)),changed=hasDelta(delta);
  if(!outcome.ok&&changed)
   throw Error('Rejected operation mutated authoritative state');
  if(changed)state.effectRevision=revision+1;
  const receipt=append(state,{actorId:n.id,commandId:task.commandId,
   action:task.key,targetId:task.ref,status:outcome.ok?'COMPLETED':'FAILED',
   reason:outcome.ok?null:String(outcome.message||'Action rejected').slice(0,160),
   delta});
  return {...outcome,receipt};
 }
 root.WorldReceipts={MAX,accept,decision,execute,snapshot,change,committed};
})(globalThis);
