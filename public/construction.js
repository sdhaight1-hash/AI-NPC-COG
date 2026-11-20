// Versioned plans and receipt-backed physical building tiles.
// Blueprints have no benefits. Only a completed timed world action builds a tile.
(function(root){
 'use strict';
 const LAYERS=Object.freeze({floor:'floor',wall:'barrier',door:'barrier',roof:'roof'});
 const MATERIALS=Object.freeze({floor:'wood',wall:'wood',door:'wood',roof:'thatch'});
 const MAX_PLANS=512,MAX_TILES=512;
 const fresh=()=>({version:1,nextId:1,blueprints:[],tiles:[]});
 const validPoint=(world,p)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&
  Number.isInteger(p.z)&&p.x>=0&&p.x<world.width&&p.y>=0&&p.y<world.height&&
  p.z>=root.Frontier.MIN_Z&&p.z<=root.Frontier.MAX_Z&&
  root.Frontier.terrainTraversable(world,p.x,p.y,p.z);
 const slot=(kind,p)=>p.z+':'+p.x+':'+p.y+':'+LAYERS[kind];
 const validId=(id,prefix)=>typeof id==='string'&&id.startsWith(prefix)&&
  /^[1-9]\d{0,15}$/.test(id.slice(prefix.length))&&
  Number.isSafeInteger(Number(id.slice(prefix.length)));
 const validOwner=id=>validId(id,'person_');
 const cost=kind=>kind==='roof'?{kind:'fiber',quantity:1}:
  Object.hasOwn(LAYERS,kind)?{kind:'wood',quantity:1}:null;
 function supported(world,roof,records){
  return records.some(b=>LAYERS[b.kind]==='barrier'&&b.z===roof.z&&
   root.Frontier.distance(world,roof,b)<=1);
 }
 function plan(world,kind,p,actorId,clock=world.now){
  if(typeof kind!=='string'||!Object.hasOwn(LAYERS,kind)||!validPoint(world,p)||
   !validOwner(actorId)||!Number.isFinite(clock)||clock<0||clock>world.now)return null;
  const state=world.construction;
  if(!state||state.version!==1||state.blueprints.length>=MAX_PLANS||
   state.tiles.length>=MAX_TILES||!Number.isSafeInteger(state.nextId)||
   state.nextId<1||state.nextId>=Number.MAX_SAFE_INTEGER)return null;
  const position={x:p.x,y:p.y,z:p.z},key=slot(kind,position);
  if(state.blueprints.some(b=>slot(b.kind,b)===key)||
   state.tiles.some(t=>slot(t.kind,t)===key))return null;
  // A plan is only an intention. Built support is validated again at work time.
  if(kind==='roof'&&!supported(world,position,[...state.blueprints,...state.tiles]))return null;
  const id='bp_'+state.nextId++;
  const record={id,kind,material:MATERIALS[kind],...position,
   actorId,plannedAt:clock,status:'PLANNED'};
  state.blueprints.push(record);
  return record;
 }
 function cancel(world,id,actorId){
  const state=world.construction,b=state?.blueprints.find(v=>v.id===id);
  if(!b||b.actorId!==actorId||b.status!=='PLANNED')return false;
  const remaining=state.blueprints.filter(v=>v!==b);
  if(LAYERS[b.kind]==='barrier'&&remaining.some(v=>v.kind==='roof'&&
   !supported(world,v,[...remaining,...state.tiles])))return false;
  state.blueprints=remaining;
  return true;
 }
 function canBuild(world,n,b,residents=[]){
  if(!b||b.status!=='PLANNED'||b.actorId!==n.id||
   !world.construction?.blueprints.includes(b))
   return {ok:false,reason:'NOT_OWNED_BLUEPRINT'};
  if(!validPoint(world,b)||!Object.hasOwn(LAYERS,b.kind)||
   world.construction.tiles.length>=MAX_TILES||
   world.construction.tiles.some(t=>slot(t.kind,t)===slot(b.kind,b)))
   return {ok:false,reason:'CONSTRUCTION_SITE_INVALID'};
  if(!n.knowledge?.recipes?.includes('shelter'))
   return {ok:false,reason:'CONSTRUCTION_METHOD_UNKNOWN'};
  if(n.energy<12)return {ok:false,reason:'TOO_EXHAUSTED'};
  const input=cost(b.kind);
  if((n.inventory?.[input.kind]||0)<input.quantity)
   return {ok:false,reason:'CONSTRUCTION_MATERIAL_MISSING'};
  if(b.kind==='roof'&&!supported(world,b,world.construction.tiles))
   return {ok:false,reason:'PHYSICAL_ROOF_SUPPORT_MISSING'};
  if(b.kind==='wall'&&residents.some(p=>p.alive!==false&&
   p.x===b.x&&p.y===b.y&&(p.z||0)===b.z))
   return {ok:false,reason:'BARRIER_OCCUPIED'};
  if(root.Frontier.distance(world,n,b)>1||(n.z||0)!==b.z)
   return {ok:false,reason:'CONSTRUCTION_SITE_OUT_OF_REACH'};
  return {ok:true,input};
 }
 function options(world,n,residents=[],canReach=()=>true){
  const plans=world.construction?.blueprints||[];
  if(!n.knowledge?.recipes?.includes('shelter')||n.energy<12)return [];
  return plans.filter(b=>b.actorId===n.id&&b.status==='PLANNED'&&
   (n.inventory?.[cost(b.kind).kind]||0)>=cost(b.kind).quantity&&
   (b.kind!=='roof'||supported(world,b,world.construction.tiles))&&
   (b.kind!=='wall'||!residents.some(p=>p.alive!==false&&
    p.x===b.x&&p.y===b.y&&(p.z||0)===b.z))&&
   root.Frontier.distance(world,n,b)<=8&&
   (canReach(b)||root.Frontier.neighbors(world,b).some(canReach)))
   .sort((a,b)=>root.Frontier.distance(world,n,a)-
    root.Frontier.distance(world,n,b)||a.id.localeCompare(b.id))
   .slice(0,1).map(b=>({key:'build_tile',ref:b.id,target:b,
    when:'Build planned '+b.kind+' tile using one '+
     cost(b.kind).kind+' after timed physical work'}));
 }
 function build(world,n,id,residents=[],commandId=null){
  const b=world.construction?.blueprints.find(x=>x.id===id);
  const checked=canBuild(world,n,b,residents);
  if(!checked.ok)return {ok:false,message:checked.reason};
  if(!validId(commandId,'cmd_'))return {ok:false,message:'INVALID_BUILD_COMMAND'};
  n.inventory[checked.input.kind]-=checked.input.quantity;
  n.energy=Math.max(0,n.energy-8);
  const tile={id:'tile_'+b.id.slice(3),blueprintId:b.id,
   kind:b.kind,material:b.material,x:b.x,y:b.y,z:b.z,
   actorId:n.id,builtAt:world.now,status:'BUILT',commandId};
  world.construction.blueprints=world.construction.blueprints.filter(x=>x!==b);
  world.construction.tiles.push(tile);
  root.WorldRuntime?.invalidateNavigation(world);
  return {ok:true,message:'Constructed one '+b.kind+' tile at '+b.x+','+b.y+
   ' from one '+checked.input.kind};
 }
 function validTile(world,t){
  return t&&validId(t.id,'tile_')&&validId(t.blueprintId,'bp_')&&
   t.id.slice(5)===t.blueprintId.slice(3)&&validId(t.commandId,'cmd_')&&
   t.status==='BUILT'&&Object.hasOwn(LAYERS,t.kind)&&
   t.material===MATERIALS[t.kind]&&validPoint(world,t)&&
   validOwner(t.actorId)&&Number.isFinite(t.builtAt)&&
   t.builtAt>=0&&t.builtAt<=world.now;
 }
 function restore(world,saved,receipts=[]){
  const next=fresh();
  if(saved?.version!==1||!Array.isArray(saved.blueprints)){
   world.construction=next;return;
  }
  // A completed tile must match its original physical receipt, including
  // its command, actor, work location and actual inventory consumption.
  const proofs=new Map((Array.isArray(receipts)?receipts:[]).filter(r=>
   r?.status==='COMPLETED'&&r.action==='build_tile'&&
   typeof r.commandId==='string').map(r=>[r.commandId,r]));
  const sites=new Set(),ids=new Set();
  const candidates=(Array.isArray(saved.tiles)?saved.tiles:[])
   .slice(0,MAX_TILES).filter(t=>{
    if(!validTile(world,t)||ids.has(t.id)||sites.has(slot(t.kind,t)))return false;
    const receipt=proofs.get(t.commandId),input=cost(t.kind);
    const added=receipt?.delta?.collections?.constructionTiles?.added||[];
    const consumed=receipt?.delta?.inventory||[];
    if(receipt?.actorId!==t.actorId||receipt?.targetId!==t.blueprintId||
     receipt?.clock!==t.builtAt||
     !added.some(row=>row.id===t.id&&row.commandId===t.commandId&&
      row.kind===t.kind&&row.x===t.x&&row.y===t.y&&row.z===t.z)||
     !consumed.some(row=>row.key===input.kind&&row.delta===-input.quantity))
     return false;
    ids.add(t.id);sites.add(slot(t.kind,t));return true;
   });
  const barriers=candidates.filter(t=>LAYERS[t.kind]==='barrier');
  next.tiles=candidates.filter(t=>t.kind!=='roof'||supported(world,t,barriers))
   .map(t=>({id:t.id,blueprintId:t.blueprintId,kind:t.kind,material:t.material,
    x:t.x,y:t.y,z:t.z,actorId:t.actorId,builtAt:t.builtAt,
    status:'BUILT',commandId:t.commandId}));
  const planIds=new Set(),occupied=new Set(next.tiles.map(t=>slot(t.kind,t)));
  for(const b of saved.blueprints.slice(0,MAX_PLANS)){
   if(!b||!validId(b.id,'bp_')||planIds.has(b.id)||ids.has('tile_'+b.id.slice(3))||
    typeof b.kind!=='string'||!Object.hasOwn(LAYERS,b.kind)||
    (b.material!==undefined&&b.material!==MATERIALS[b.kind])||
    b.status!=='PLANNED'||!validPoint(world,b)||!validOwner(b.actorId)||
    !Number.isFinite(b.plannedAt)||b.plannedAt<0||b.plannedAt>world.now)continue;
   const key=slot(b.kind,b);
   if(occupied.has(key))continue;
   planIds.add(b.id);occupied.add(key);
   next.blueprints.push({id:b.id,kind:b.kind,material:MATERIALS[b.kind],
    x:b.x,y:b.y,z:b.z,actorId:b.actorId,plannedAt:b.plannedAt,status:'PLANNED'});
  }
  const support=[...next.tiles,...next.blueprints.filter(b=>LAYERS[b.kind]==='barrier')];
  next.blueprints=next.blueprints.filter(b=>b.kind!=='roof'||supported(world,b,support));
  next.nextId=Math.max(1,...next.blueprints.map(b=>Number(b.id.slice(3))+1),
   ...next.tiles.map(t=>Number(t.id.slice(5))+1));
  if(Number.isSafeInteger(saved.nextId)&&saved.nextId>next.nextId)
   next.nextId=saved.nextId;
  world.construction=next;
 }
 root.Construction={LAYERS,MAX_PLANS,MAX_TILES,fresh,plan,cancel,cost,
  canBuild,options,build,restore};
})(globalThis);
