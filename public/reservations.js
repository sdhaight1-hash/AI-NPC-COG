// Finite material claims. This ledger reserves existing lots; it NEVER mints,
// consumes or refunds inventory. World action kernels remain the effect authority.
(function(root){
 'use strict';
 const TYPES=new Set(['node','npc','structure','item','blueprint']);
 const MAX_ACTIVE=5000;
 const key=s=>s.type+':'+s.id+':'+s.kind;
 const clean=s=>s&&TYPES.has(s.type)&&typeof s.id==='string'&&s.id.length<=100&&
  typeof s.kind==='string'&&/^[a-z_]{2,40}$/.test(s.kind)&&
  Number.isInteger(s.quantity)&&s.quantity>0&&s.quantity<=1000;
 function physical(state,s){
  const w=state.world;
  if(s.type==='node'){
   const node=w.nodes.find(n=>n.id===s.id);
   return node?.kind===s.kind?node.stock:0;
  }
  if(s.type==='npc'){
   const actor=state.npcs.find(n=>n.id===s.id);
   return actor?.inventory?.[s.kind]||0;
  }
  if(s.type==='structure'){
   const site=w.structures.find(n=>n.id===s.id);
   return site?.contents?.[s.kind]||0;
  }
  if(s.type==='blueprint')
   return s.kind==='tile'&&w.construction?.blueprints.some(b=>
    b.id===s.id&&b.status==='PLANNED')?1:0;
  const item=w.items.find(i=>i.id===s.id);
  return item?.kind===s.kind?item.count:0;
 }
 function active(state){return (state.reservations||[]).filter(x=>x.status==='ACTIVE');}
 function available(state,s){
  const held=active(state).filter(x=>key(x)===key(s)).reduce((n,x)=>n+x.quantity,0);
  return Math.max(0,physical(state,s)-held);
 }
 function harvestBudget(state,actorId,commandId,id,kind){
  const lot={type:'node',id,kind},lotKey=key(lot);
  let owned=0,rival=0;
  for(const hold of active(state)){
   if(key(hold)!==lotKey)continue;
   if(hold.actorId===actorId&&hold.commandId===commandId)owned+=hold.quantity;
   else rival+=hold.quantity;
  }
  const free=Math.max(0,physical(state,lot)-rival);
  // Older tasks can lack a token. They may only take unclaimed stock.
  return owned?Math.min(owned,free):free;
 }
 function specsFor(state,n,action,ref){
  const npc=(kind,quantity)=>({type:'npc',id:n.id,kind,quantity});
  const node=(kind,quantity)=>({type:'node',id:ref,kind,quantity});
  const site=(kind,quantity)=>({type:'structure',id:ref,kind,quantity});
  if(action==='build_tile'){
   const b=state.world.construction?.blueprints.find(x=>x.id===ref);
   const input=root.Construction?.cost(b?.kind);
   return b&&input?[npc(input.kind,input.quantity),
    {type:'blueprint',id:ref,kind:'tile',quantity:1}]:[];
  }
  // Final wet seal trial claims exactly one existing physical freshwater unit.
  if(action==='craft_stage'&&root.Crafting?.wetSealPending(n))
   return typeof ref==='string'?[node('water',1)]:[];
  const harvestKind=root.AgentWorld?.HARVEST_KINDS?.[action];
  if(action==='drink_source'){
   const spring=state.world.nodes.find(x=>x.id===ref&&x.kind==='water');
   return spring?.stock>0?[node('water',1)]:[];
  }
  if(harvestKind){
   const kind=harvestKind;
   const target=state.world.nodes.find(x=>x.id===ref&&x.kind===kind);
   if(!target)return [];
   const intended=root.AgentWorld.harvestAmount(n,target,action);
   return intended>0?[node(kind,intended)]:[];
  }
  const recipe=action.startsWith('craft_')?
   root.Crafting.getRecipe(action.slice(6)):null;
  if(recipe)return Object.entries(recipe.inputs).map(([kind,q])=>npc(kind,q));
  if(action==='build_fire')return [npc('wood',2),npc('stone',1)];
  if(action==='build_shelter')return [npc('wood',4),npc('fiber',3)];
  if(action==='build_cache')return [npc('wood',2),npc('fiber',1)];
  if(action==='craft_hatchet')return [npc('wood',1),npc('stone',1),npc('fiber',1)];
  if(action==='experiment_wood_stone')return [npc('wood',2),npc('stone',1)];
  if(action==='experiment_wood_fiber')return [npc('wood',4),npc('fiber',3)];
  if(action==='experiment_wood_stone_fiber')
   return [npc('wood',1),npc('stone',1),npc('fiber',1)];
  if(action==='eat'||action==='share_food')return [npc('food',1)];
  if(action==='give_wood')return [npc('wood',1)];
  if(action==='give_fiber')return [npc('fiber',1)];
  if(action==='drink')return [npc('water',1)];
  if(action==='place_crate')return [npc('crate',1)];
  if(action==='store_wood')return [npc('wood',1)];
  const drop=/^drop_(wood|stone|fiber|flask)$/.exec(action);
  if(drop)return [npc(drop[1],1)];
  const stash=/^stash_(wood|stone|fiber)$/.exec(action);
  if(stash)return [npc(stash[1],1)];
  const withdraw=/^withdraw_(wood|stone|fiber)$/.exec(action);
  if(withdraw)return [site(withdraw[1],1)];
  if(action==='retrieve_wood')return [site('wood',1)];
  if(action==='pickup_item'){
   const item=state.world.items.find(x=>x.id===ref&&root.AgentWorld.GROUND_KINDS.includes(x.kind));
   return item?[{type:'item',id:ref,kind:item.kind,quantity:1}]:[];
  }
  return [];
 }
 function claim(state,actorId,commandId,specs,ttl=180){
  if(typeof actorId!=='string'||!/^cmd_[1-9]\d*$/.test(commandId))
   return {ok:false,reason:'INVALID_COMMAND'};
  if(!Array.isArray(specs)||specs.some(s=>!clean(s)))
   return {ok:false,reason:'INVALID_LOT'};
  if(!Number.isFinite(ttl))return {ok:false,reason:'INVALID_LIFETIME'};
  // Group repeated lot requirements before committing any token.
  const grouped=new Map();
  for(const spec of specs){
   const id=key(spec),old=grouped.get(id);
   if(old)old.quantity+=spec.quantity;else grouped.set(id,{...spec});
  }
  for(const spec of grouped.values()){
   if(!clean(spec))return {ok:false,reason:'INVALID_LOT'};
   if(spec.type==='npc'&&spec.id!==actorId)
    return {ok:false,reason:'PRIVATE_INVENTORY'};
  }
  const existing=(state.reservations||[]).filter(x=>x.commandId===commandId);
  if(existing.length){
   if(existing.some(x=>x.status!=='ACTIVE'||x.expiresAt<=state.clock))
    return {ok:false,reason:'RESERVATION_CLOSED'};
   if(existing.length!==grouped.size||existing.some(x=>x.actorId!==actorId)||
    [...grouped].some(([lot,spec])=>!existing.some(x=>
     key(x)===lot&&x.quantity===spec.quantity)))
    return {ok:false,reason:'COMMAND_CONFLICT'};
   return {ok:true,claims:existing,existing:true};
  }
  for(const spec of grouped.values()){
   if(available(state,spec)<spec.quantity)
    return {ok:false,reason:'RESERVATION_CONFLICT',lot:key(spec),
     remaining:available(state,spec)};
  }
  state.reservations ||= [];
  if(active(state).length+grouped.size>MAX_ACTIVE)
   return {ok:false,reason:'CLAIM_LIMIT'};
  const claims=[...grouped.values()].map(spec=>({
   ...spec,idTag:'res_'+(state.reservationSeq=(state.reservationSeq||0)+1),
   actorId,commandId,acquiredAt:state.clock,
   expiresAt:state.clock+Math.max(1,Math.min(1440,ttl)),
   status:'ACTIVE'
  }));
  state.reservations.push(...claims);
  return {ok:true,claims,existing:false};
 }
 function validCommand(state,commandId,expected=0){
  const all=(state.reservations||[]).filter(x=>x.commandId===commandId);
  const live=all.filter(x=>x.status==='ACTIVE'&&x.expiresAt>state.clock);
  return live.length>=expected&&all.length===live.length;
 }
 function releaseCommand(state,commandId,reason='RELEASED'){
  let count=0;
  for(const x of state.reservations||[])
   if(x.commandId===commandId&&x.status==='ACTIVE'){
    x.status=reason;x.closedAt=state.clock;count++;
   }
  state.reservations=(state.reservations||[]).filter(x=>x.status==='ACTIVE')
   .concat((state.reservations||[]).filter(x=>x.status!=='ACTIVE').slice(-500));
  return count;
 }
 function releaseActor(state,id,reason='ACTOR_DEAD'){
  const commands=new Set(active(state).filter(x=>x.actorId===id).map(x=>x.commandId));
  for(const command of commands)releaseCommand(state,command,reason);
  return commands.size;
 }
 function expire(state){
  const expired=new Set(active(state).filter(x=>x.expiresAt<=state.clock)
   .map(x=>x.commandId));
  for(const cmd of expired)releaseCommand(state,cmd,'EXPIRED');
  return expired.size;
 }
 function restore(state,saved){
  state.reservations=[];state.reservationSeq=Number.isSafeInteger(saved?.reservationSeq)&&
   saved.reservationSeq>=0?saved.reservationSeq:0;
  const actors=new Map(state.npcs.filter(n=>n.alive!==false).map(n=>[n.id,n]));
  const ids=new Set();
  for(const row of (Array.isArray(saved?.reservations)?saved.reservations:[]).slice(-MAX_ACTIVE)){
   if(!clean(row)||row.status!=='ACTIVE'||typeof row.actorId!=='string'||
    !actors.has(row.actorId)||typeof row.commandId!=='string'||
    !/^cmd_[1-9]\d*$/.test(row.commandId)||
    !/^res_[1-9]\d*$/.test(row.idTag||'')||ids.has(row.idTag)||
    !Number.isFinite(row.acquiredAt)||row.acquiredAt>state.clock||
    !Number.isFinite(row.expiresAt)||row.expiresAt<=state.clock||
    row.expiresAt-row.acquiredAt>1440||row.expiresAt<=row.acquiredAt)continue;
   const actor=actors.get(row.actorId);
   const matching=[actor.task,...(actor.suspendedActivities||[])].find(a=>
    a?.commandId===row.commandId&&a.reservationIds?.includes(row.idTag));
   // A saved lot is authoritative only for a genuinely live or interrupted
   // command that owns its exact claim token. No ghost reservation survives.
   if(!matching||(row.type==='npc'&&row.id!==row.actorId)||
    (row.type!=='npc'&&matching.ref!==row.id)||
    available(state,row)<row.quantity)continue;
   const id=Number(row.idTag.slice(4));
   if(!Number.isSafeInteger(id)||id<=0)continue;
   ids.add(row.idTag);
   state.reservationSeq=Math.max(state.reservationSeq,id);
   state.reservations.push({...row,status:'ACTIVE'});
  }
 }
 root.Reservations={available,physical,harvestBudget,specsFor,claim,validCommand,
  releaseCommand,releaseActor,expire,restore,active};
})(globalThis);
