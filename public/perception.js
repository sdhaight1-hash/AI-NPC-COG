// G2.1: deterministic, actor-private sensory records. No global debugger data,
// knowledge transfer, or model access. All returned nested objects are copies.
(function(root){
 'use strict';
 const F=root.Frontier;
 const wrap=(n,size)=>F.wrap(n,size);
 const signed=(from,to,size)=>{
  const positive=wrap(to-from,size);
  return positive>size/2?positive-size:positive;
 };
 const distance=(world,a,b)=>F.distance(world,a,b);
 const opaque=new Set(['wall','stone','bedrock','wood','timber','brick']);
 function line(world,a,b){
  if((a.z||0)!==(b.z||0))return false;
  const dx=signed(a.x,b.x,world.width),dy=signed(a.y,b.y,world.height);
  let x=0,y=0;
  const ax=Math.abs(dx),ay=Math.abs(dy),sx=Math.sign(dx),sy=Math.sign(dy);
  let err=ax-ay;
  while(x!==dx||y!==dy){
   const twice=2*err;
   if(twice>-ay){err-=ay;x+=sx;}
   if(twice<ax){err+=ax;y+=sy;}
   if(x===dx&&y===dy)break;
   const cx=wrap(a.x+x,world.width),cy=wrap(a.y+y,world.height);
   if(opaque.has(F.materialAt(world,cx,cy,a.z||0)))return false;
   if(world.structures.some(s=>s.x===cx&&s.y===cy&&
    (s.z||0)===(a.z||0)&&['wall','closed_door'].includes(s.type)))return false;
   if(world.construction?.tiles.some(t=>t.kind==='wall'&&
    t.x===cx&&t.y===cy&&t.z===(a.z||0)))return false;
  }
  return true;
 }
 function visionRange(state,n){
  const hour=((state.clock%1440)+1440)%1440/60;
  const daylight=hour>=6&&hour<18;
  let radius=daylight?8:2;
  const weather=state.world.weather?.kind;
  if(weather==='fog')radius=Math.min(radius,4);
  if(weather==='storm'||weather==='snow')radius=Math.min(radius,5);
  if(!daylight&&state.world.structures.some(s=>s.type==='campfire'&&
   distance(state.world,n,s)<=3))radius=6;
  return radius;
 }
 function canSee(state,n,target){
  const range=visionRange(state,n);
  return (n.z||0)===(target.z||0)&&distance(state.world,n,target)<=range&&
   line(state.world,n,target);
 }
 function direction(state,from,to){
  const dx=signed(from.x,to.x,state.world.width);
  const dy=signed(from.y,to.y,state.world.height);
  if(!dx&&!dy)return 'here';
  if(Math.abs(dx)>Math.abs(dy))return dx>0?'east':'west';
  return dy>0?'south':'north';
 }
 function sound(state,n,event){
  if(!event||!Number.isInteger(event.x)||!Number.isInteger(event.y)||
   (n.z||0)!==(event.z||0))return null;
  const loudness=event.loudness==='loud'?'loud':'quiet';
  const d=distance(state.world,n,event);
  const max=(loudness==='loud'?10:3)-(line(state.world,n,event)?0:2);
  if(d>max||d===0&&event.actorId===n.id)return null;
  const kind=['speech','footsteps','impact','construction','cry'].includes(event.kind)?
   event.kind:'unfamiliar sound';
  // Hearing alone never proves the speaker identity or their inventory.
  return {sense:'hearing',kind,loudness,direction:direction(state,n,event),
   proximity:d<=2?'close':d<=5?'near':'distant',at:state.clock};
 }
 function inspect(state,n,id){
  const world=state.world;
  const target=[...world.nodes,...world.items,...world.structures,
   ...(world.construction?.tiles||[]),...(world.remains||[])]
   .find(o=>o.id===id);
  if(!target||(n.z||0)!==(target.z||0)||distance(world,n,target)>1||
   (target.kind==='remains'&&!canSee(state,n,target)))return null;
  const kind=String(target.kind||target.type||'unknown').slice(0,32);
  const result={sense:'inspection',id:target.id,kind,x:target.x,y:target.y,
   at:state.clock};
  if(Number.isInteger(target.stock))result.stock=target.stock;
  if(Number.isInteger(target.max))result.maximum=target.max;
  if(target.type==='crate'){
   result.capacity=target.capacity;
   result.contents=Object.fromEntries(Object.entries(target.contents||{})
    .filter(([,amount])=>Number.isInteger(amount)).map(([key,amount])=>[key,amount]));
  }
  return freeze(result);
 }
 function freeze(v){
  if(v&&typeof v==='object'){
   for(const child of Object.values(v))freeze(child);
   Object.freeze(v);
  }
  return v;
 }
 function verifiedSounds(state){
  const source=state.receipts||[];
  return source.filter(r=>r.status==='COMPLETED'&&
   Number.isFinite(r.clock)&&state.clock-r.clock>=0&&
   state.clock-r.clock<=2).slice(-32).flatMap(r=>{
    const position=r.context?.position||state.npcs.find(n=>n.id===r.actorId);
    if(!position)return [];
    const action=String(r.action||'');
    let kind=null,loudness='quiet';
    if(action==='socialize'&&r.context?.speech===true)kind='speech';
    else if(action==='drop_wood'){kind='impact';loudness='loud';}
    else if(action.startsWith('build_')||action.startsWith('craft_')||
     action==='place_crate'){kind='construction';loudness='loud';}
    else if(action.startsWith('collect_')||action==='forage'||
     action==='explore')kind='footsteps';
    if(!kind)return [];
    return [{kind,loudness,x:position.x,y:position.y,z:position.z||0,
     actorId:r.actorId}];
   });
 }
 function snapshot(state,n,events=null){
  const world=state.world,range=visionRange(state,n);
  const people=state.npcs.filter(p=>p!==n&&canSee(state,n,p))
   .map(p=>({sense:'vision',kind:'resident',id:p.id,name:p.name,
    x:p.x,y:p.y,z:p.z||0,activity:String(p.action||'none').slice(0,40),
    at:state.clock})).sort((a,b)=>a.id.localeCompare(b.id));
  const objects=[...world.nodes,...world.items,...world.structures,
   ...(world.construction?.tiles||[]),...(world.remains||[])]
   .filter(o=>canSee(state,n,o))
   .map(o=>({sense:'vision',id:o.id,kind:String(o.kind||o.type||'object'),
    x:o.x,y:o.y,z:o.z||0,at:state.clock}))
   .sort((a,b)=>a.id.localeCompare(b.id));
  const heard=(Array.isArray(events)?events:verifiedSounds(state))
   .map(e=>sound(state,n,e)).filter(Boolean);
  const bodily={hunger:Math.round(n.needs?.hunger||0),
   thirst:Math.round(n.needs?.thirst||0),
   energy:Math.round(n.energy||0)};
  return freeze({actorId:n.id,at:state.clock,visionRange:range,
   people,objects,heard,bodily});
 }
 function filterAffordances(state,n,options){
  const packet=snapshot(state,n);
  const visible=new Set([...packet.people,...packet.objects].map(o=>o.id));
  const witnessed=new Set([
   ...(n.knowledge?.observations||[]).map(o=>o.id),
   ...(n.knowledge?.sightings||[]).map(o=>o.id),
   ...(n.agency?.beliefs||[]).map(o=>o.ref)
  ]);
  // The actor can recall the existence of infrastructure they themselves
  // constructed; this grants no knowledge of unobserved foreign structures.
  const built=new Set(state.world.structures.filter(s=>s.maker===n.id).map(s=>s.id));
  for(const b of state.world.construction?.blueprints||[])
   if(b.actorId===n.id)built.add(b.id);
  const known=id=>visible.has(id)||witnessed.has(id)||built.has(id);
  const visibleKinds=new Set(packet.objects.map(o=>o.kind));
  const rememberedKinds=new Set((n.agency?.beliefs||[])
   .filter(b=>b.status!=='failed').map(b=>b.kind));
  const map={stock_water:'water',stock_food:'food',stock_wood:'wood',
   stock_stone:'stone',stock_fiber:'fiber'};
  return options.filter(o=>{
   if(o.ref&&!known(o.ref))return false;
   if(map[o.key]&&!visibleKinds.has(map[o.key])&&
    !rememberedKinds.has(map[o.key]))return false;
   return true;
  }).map(o=>({...o,
   when:String(o.when||'').replace(/\(\d+ remaining, \d+ tiles away\)/g,
    '(source visually identified)')}));
 }
 function rememberWater(state,n){
  const history=n.knowledge.sightings||[];
  const seen=state.world.nodes.filter(o=>o.kind==='water'&&canSee(state,n,o));
  if(!seen.length)return;
  const ids=new Set(seen.map(o=>o.id));
  n.knowledge.sightings=[...history.filter(o=>!ids.has(o.id)),
   ...seen.map(o=>({id:o.id,kind:'water',x:o.x,y:o.y,z:o.z||0,at:state.clock}))]
   .slice(-12);
 }
 root.Perception={line,visionRange,canSee,sound,inspect,snapshot,filterAffordances,rememberWater};
})(globalThis);
