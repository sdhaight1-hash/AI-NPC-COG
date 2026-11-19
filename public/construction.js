// Versioned declarations for future tile-by-tile construction.
// A blueprint is NOT a physical structure: it grants no shelter, blocking,
// inventory, ownership, finished tile, or other simulation effect.
(function(root){
 'use strict';
 const LAYERS=Object.freeze({floor:'floor',wall:'barrier',door:'barrier',roof:'roof'});
 const MAX_PLANS=512;
 const fresh=()=>({version:1,nextId:1,blueprints:[],tiles:[]});
 const validPoint=(world,p)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&
  Number.isInteger(p.z)&&p.x>=0&&p.x<world.width&&p.y>=0&&p.y<world.height&&
  p.z>=root.Frontier.MIN_Z&&p.z<=root.Frontier.MAX_Z&&
  root.Frontier.traversable(world,p.x,p.y,p.z);
 const slot=(kind,p)=>p.z+':'+p.x+':'+p.y+':'+LAYERS[kind];
 const validOwner=id=>typeof id==='string'&&/^person_[1-9]\d*$/.test(id);
 function plan(world,kind,p,actorId,clock=world.now){
  if(!Object.hasOwn(LAYERS,kind)||!validPoint(world,p)||!validOwner(actorId)||
   !Number.isFinite(clock)||clock<0||clock>world.now)return null;
  const state=world.construction;
  if(!state||state.version!==1||state.blueprints.length>=MAX_PLANS)return null;
  const position={x:p.x,y:p.y,z:p.z},key=slot(kind,position);
  if(state.blueprints.some(b=>slot(b.kind,b)===key)||
   state.tiles.some(t=>slot(t.kind,t)===key))return null;
  // The actor only declares an intention. Resource reservation and physical
  // work belong to the next milestone's authoritative receipt executor.
  const id='bp_'+state.nextId++;
  const record={id,kind,...position,actorId,plannedAt:clock,status:'PLANNED'};
  state.blueprints.push(record);
  return record;
 }
 function cancel(world,id,actorId){
  const state=world.construction,b=state?.blueprints.find(v=>v.id===id);
  if(!b||b.actorId!==actorId||b.status!=='PLANNED')return false;
  state.blueprints=state.blueprints.filter(v=>v!==b);
  return true;
 }
 function restore(world,saved){
  const next=fresh();
  // Until physical tile receipts exist, untrusted saved finished tiles
  // are intentionally NOT loaded: no save file can mint completed walls.
  if(saved?.version!==1||!Array.isArray(saved.blueprints)){
   world.construction=next;return;
  }
  const ids=new Set(),sites=new Set();
  for(const b of saved.blueprints.slice(0,MAX_PLANS)){
   if(!b||!/^bp_[1-9]\d*$/.test(b.id)||ids.has(b.id)||
    !Object.hasOwn(LAYERS,b.kind)||b.status!=='PLANNED'||
    !validPoint(world,b)||!validOwner(b.actorId)||
    !Number.isFinite(b.plannedAt)||b.plannedAt<0||b.plannedAt>world.now)continue;
   const key=slot(b.kind,b);
   if(sites.has(key))continue;
   ids.add(b.id);sites.add(key);
   next.blueprints.push({id:b.id,kind:b.kind,x:b.x,y:b.y,z:b.z,
    actorId:b.actorId,plannedAt:b.plannedAt,status:'PLANNED'});
  }
  next.nextId=Math.max(1,...next.blueprints.map(b=>Number(b.id.slice(3))+1));
  if(Number.isSafeInteger(saved.nextId)&&saved.nextId>next.nextId)
   next.nextId=Math.min(saved.nextId,Number.MAX_SAFE_INTEGER-1);
  world.construction=next;
 }
 root.Construction={LAYERS,MAX_PLANS,fresh,plan,cancel,restore};
})(globalThis);
