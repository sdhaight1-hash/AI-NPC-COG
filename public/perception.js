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
  const target=[...world.nodes,...world.items,...world.structures].find(o=>o.id===id);
  if(!target||(n.z||0)!==(target.z||0)||distance(world,n,target)>1)return null;
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
 function snapshot(state,n,events=[]){
  const world=state.world,range=visionRange(state,n);
  const people=state.npcs.filter(p=>p!==n&&canSee(state,n,p))
   .map(p=>({sense:'vision',kind:'resident',id:p.id,name:p.name,
    x:p.x,y:p.y,z:p.z||0,activity:String(p.action||'none').slice(0,40),
    at:state.clock})).sort((a,b)=>a.id.localeCompare(b.id));
  const objects=[...world.nodes,...world.items,...world.structures]
   .filter(o=>canSee(state,n,o))
   .map(o=>({sense:'vision',id:o.id,kind:String(o.kind||o.type||'object'),
    x:o.x,y:o.y,z:o.z||0,at:state.clock}))
   .sort((a,b)=>a.id.localeCompare(b.id));
  const heard=events.map(e=>sound(state,n,e)).filter(Boolean);
  const bodily={hunger:Math.round(n.needs?.hunger||0),
   thirst:Math.round(n.needs?.thirst||0),
   energy:Math.round(n.energy||0)};
  return freeze({actorId:n.id,at:state.clock,visionRange:range,
   people,objects,heard,bodily});
 }
 root.Perception={line,visionRange,canSee,sound,inspect,snapshot};
})(globalThis);
