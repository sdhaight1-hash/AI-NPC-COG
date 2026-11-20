// Civilization lifecycle, not a faction generator. People appear independently.
// No beds, laws, communities, claims, friendships, or governments are created here.
(function(root){
'use strict';
const EPOCH=Date.UTC(2000,0,1);
const YEAR_MINUTES=root.Frontier.DAYS_PER_YEAR*1440;
const GIVEN=['Asha','Mara','Jonas','Rowan','Lina','Nico','Iris','Edda','Tarin','Mina',
 'Kiran','Sel','Orin','Nara','Luca','Vera','Emil','Iona','Pia','Dara'];
const FAMILY=['Vale','Fern','Moss','Stone','Reed','Ash','River','Briar','Hale','Wren',
 'Dawn','Oak','Mere','Thorn','Pine','Grey'];
const PALETTE=['#e9aa85','#9bc3cc','#bc9add','#a1d6aa','#d9cb79',
 '#e693ad','#c4b38e','#83a9cf','#e5a971','#d4b8c4'];
const seedValue=(world,index,salt)=>root.Frontier.hash(index*31,salt,world.seed+salt);
const TRAIT_GROUPS=Object.freeze({
 'Exploration':Object.freeze(['noveltySeeking','inquisitiveness','openMindedness','imagination','riskTolerance']),
 'Work habits':Object.freeze(['persistence','orderliness','foresight','patience','adaptability']),
 'Social style':Object.freeze(['socialApproach','solitudePreference','expressiveness','assertiveness','playfulness']),
 'Cooperation':Object.freeze(['empathy','generosity','trustInclination','cooperativeness','forgiveness']),
 'Emotional regulation':Object.freeze(['emotionalReactivity','composure','optimism','threatSensitivity','recovery','frustrationTolerance']),
 'Learning':Object.freeze(['evidenceSkepticism','attentionalFocus','teachingInclination','practicalOrientation']),
 'Priorities':Object.freeze(['socialOrientation','exploratoryOrientation','securityOrientation',
  'workOrientation','fieldInitiative'])
});
const FACETS=Object.values(TRAIT_GROUPS).flat();
const APPEARANCE_FIELDS=Object.freeze({skin:9,hair:8,eyes:6,hairStyle:7,face:3,
 build:3,garment:4,outfit:10,detail:5});
const round=value=>Math.round(value*100)/100;
const bounded=(value,max=1)=>Math.max(0,Math.min(max,value));
function trait(n,key){
 const value=n.traits?.[key];
 return Number.isFinite(value)?bounded(value):.5;
}
function temperament(world,index,labels){
 const tones=Object.fromEntries(FACETS.map((key,i)=>[key,round(
  (seedValue(world,index,1700+i*13)+seedValue(world,index,2100+i*17))/2)]));
 const has=(...values)=>values.some(label=>labels.includes(label));
 // Keep established founder tendencies on the seed while replacing prose
 // parsing with numeric dispositions. Facets refine choices within them.
 Object.assign(tones,{
  socialApproach:round(seedValue(world,index,119)),
  solitudePreference:round(seedValue(world,index,129)),
  socialOrientation:has('expressive','gentle')?.9:has('reserved','independent')?.25:.5,
  exploratoryOrientation:has('curious','adventurous')?1:has('cautious','reserved')?9/34:.5,
  securityOrientation:has('cautious','patient','pragmatic')?1:has('adventurous')?8/26:.5,
  workOrientation:has('patient','pragmatic','independent')?1:.5,
  fieldInitiative:has('curious','adventurous','expressive')?.9:tones.fieldInitiative*.7
 });
 return tones;
}
function emotionalBaseline(n){
 return {
  joy:round(30+40*trait(n,'optimism')+10*trait(n,'playfulness')),
  calm:round(32+32*trait(n,'composure')+12*trait(n,'patience')),
  concern:round(12+30*trait(n,'threatSensitivity')+10*trait(n,'foresight')),
  frustration:round(8+25*(1-trait(n,'frustrationTolerance'))+14*trait(n,'emotionalReactivity'))
 };
}
function restoreProfile(n,old){
 for(const key of FACETS){
  const value=old.traits?.[key];
  if(Number.isFinite(value)&&value>=0&&value<=1)n.traits[key]=value;
 }
 if(old.appearance?.version===1)
  for(const [key,count] of Object.entries(APPEARANCE_FIELDS)){
   const value=old.appearance[key];
   if(Number.isInteger(value)&&value>=0&&value<count)n.appearance[key]=value;
  }
 n.color=PALETTE[n.appearance.outfit];
 n.affectBaseline=emotionalBaseline(n);
 n.affect=Object.fromEntries(Object.entries(n.affectBaseline).map(([key,value])=>{
  const saved=old.affect?.[key];
  return [key,Number.isFinite(saved)&&saved>=0&&saved<=100?saved:value];
 }));
}
function updateAffect(n,minutes){
 if(!n.affect||!n.affectBaseline)return;
 const strain=bounded(Math.max(n.needs.hunger-55,n.needs.thirst-55,38-n.energy)/45);
 const sensitivity=.7+.6*trait(n,'emotionalReactivity');
 const target={joy:-20,calm:-28,concern:30,frustration:24};
 const recovery=1-Math.exp(-minutes/(110-65*trait(n,'recovery')));
 for(const key of Object.keys(target)){
  const settled=bounded(n.affectBaseline[key]+target[key]*strain*sensitivity,100);
  n.affect[key]+=recovery*(settled-n.affect[key]);
 }
}
function socialAffect(n,helped){
 if(!n.affect)return;
 const response=.7+.6*trait(n,'emotionalReactivity');
 if(helped){
  n.affect.joy=bounded(n.affect.joy+5*response,100);
  n.affect.frustration=bounded(n.affect.frustration-4*trait(n,'forgiveness'),100);
 }else{
  n.affect.frustration=bounded(n.affect.frustration+6*response,100);
  n.affect.calm=bounded(n.affect.calm-3*response,100);
 }
}
function traitLabel(key){return key.replace(/[A-Z]/g,letter=>' '+letter.toLowerCase());}
function traitSummary(n){
 return FACETS.filter(key=>!TRAIT_GROUPS.Priorities.includes(key))
  .map(key=>[key,trait(n,key)])
  .sort(([,a],[,b])=>Math.abs(b-.5)-Math.abs(a-.5)).slice(0,5)
  .map(([key,value])=>traitLabel(key)+' '+Math.round(value*100)).join(', ');
}
function dateAt(clock){return new Date(EPOCH+Math.floor(clock)*60000);}
function age(n,clock){return Math.max(0,(clock-n.birthAt)/YEAR_MINUTES);}
function suitable(world,p){
 return root.Frontier.traversable(world,p.x,p.y,0)&&
  !(world.structures||[]).some(s=>s.type==='shelter'&&s.x===p.x&&s.y===p.y);
}
function empty(world,residents,p){return suitable(world,p)&&!residents.some(n=>
 n.alive!==false&&n.x===p.x&&n.y===p.y&&(n.z||0)===0);}
function spawnPosition(world,residents,index,origin=null){
 const positions=[];
 if(origin){
  // Nearby means nearby on the torus, including across its wrapping seam.
  for(let radius=0;radius<=4;radius++)for(let dy=-radius;dy<=radius;dy++)
  for(let dx=-radius;dx<=radius;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const p={x:root.Frontier.wrap(origin.x+dx,world.width),
    y:root.Frontier.wrap(origin.y+dy,world.height),z:0};
   if(empty(world,residents,p))positions.push(p);
  }
 }else{
  for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
   const p={x,y,z:0};if(empty(world,residents,p))positions.push(p);
  }
 }
 if(!positions.length)return null;
 const selection=Math.floor(seedValue(world,index,1173)*positions.length);
 return positions[selection];
}
function person(world,index,clock,position){
 const a=seedValue(world,index,21),b=seedValue(world,index,31);
 const name=GIVEN[Math.floor(a*GIVEN.length)]+' '+FAMILY[Math.floor(b*FAMILY.length)];
 const years=18+Math.floor(seedValue(world,index,81)*37);
 const values=['reserved','curious','patient','independent','cautious','adventurous',
  'pragmatic','expressive','gentle','skeptical'];
 const trait1=values[Math.floor(seedValue(world,index,99)*values.length)];
 const trait2=values[Math.floor(seedValue(world,index,109)*values.length)];
 const traits=temperament(world,index,[trait1,trait2]);
 const appearance={version:1,...Object.fromEntries(Object.entries(APPEARANCE_FIELDS)
  .map(([key,count],i)=>[key,Math.floor(seedValue(world,index,2800+i*43)*count)]))};
 const npc=root.AgentWorld.newAgent({
  id:'person_'+index,name,x:position.x,y:position.y,z:0,mood:55+Math.floor(a*30),
  energy:75,trust:50,color:PALETTE[appearance.outfit],traits,appearance,
  personality:name+' is an adult individual, '+trait1+' and '+trait2+
   '. No profession, group membership or relationship is assigned.',
  goal:'Assessing an unfamiliar environment',action:'none',source:'simulation',
  scores:null,memories:[],chat:[],relationships:{},path:[],travel:0,
  thoughtAt:clock+2+index%7,lastSeen:0
 },index);
 npc.alive=true;
 npc.health=100;
 npc.affectBaseline=emotionalBaseline(npc);
 npc.affect={...npc.affectBaseline};
 npc.birthAt=clock-years*YEAR_MINUTES;
 npc.knowledge={recipes:[],observations:[]};
 npc.lineage={biologicalParents:[],caregivers:[]};
 npc.spawnAt=clock;
 npc.spawnKind=index<=5?'founder':'arrival';
 root.Agency.state(npc);
 return npc;
}
function founders(world,clock=490){
 const candidates=[];
 for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
  const p={x,y,z:0};
  if(!suitable(world,p))continue;
  const food=world.nodes.some(n=>n.kind==='food'&&root.Frontier.distance(world,p,n)<=12);
  const water=world.nodes.some(n=>n.kind==='water'&&root.Frontier.distance(world,p,n)<=16);
  const wood=world.nodes.some(n=>n.kind==='wood'&&root.Frontier.distance(world,p,n)<=12);
  if(food&&water&&wood){
   let capacity=0;
   for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)
    if(suitable(world,{x:root.Frontier.wrap(x+dx,world.width),
      y:root.Frontier.wrap(y+dy,world.height)}))capacity++;
   if(capacity>=6)candidates.push(p);
  }
 }
 if(!candidates.length)throw Error('World generation produced no viable founder region');
 const origin=candidates[Math.floor(seedValue(world,0,177)*candidates.length)];
 const residents=[];
 for(let i=1;i<=5;i++){
  const pos=spawnPosition(world,residents,i,origin);
  if(!pos)throw Error('Insufficient nearby habitable tiles for founders');
  residents.push(person(world,i,clock,pos));
 }
 return residents;
}
function addArrival(state,atClock){
 const id=state.nextPersonId;
 const point=spawnPosition(state.world,state.npcs,id);
 if(!point)return null;
 const npc=person(state.world,id,atClock,point);
 state.npcs.push(npc);
 state.nextPersonId++;
 return npc;
}
function advanceArrivals(state,before,after){
 if(after<=before)return [];
 const newcomers=[];
 const monthMinutes=root.Frontier.DAYS_PER_MONTH*1440;
 // Each elapsed compact-month boundary creates one independent arrival.
 const first=Math.floor(before/monthMinutes)+1;
 const last=Math.floor(after/monthMinutes);
 for(let month=first;month<=last&&month<2400;month++){
  const arrival=addArrival(state,month*monthMinutes);
  if(arrival)newcomers.push(arrival);
 }
 return newcomers;
}

const MAX_REMAINS=10000;
const personId=id=>typeof id==='string'&&/^person_[1-9]\d{0,15}$/.test(id)&&
 Number.isSafeInteger(Number(id.slice(7)));
const between=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const boundedText=(value,max)=>typeof value==='string'&&value.length<=max;
function copyWorkpiece(p,world,at){
 const spec=root.Crafting.RECIPES;
 if(typeof p?.recipe!=='string'||!Object.hasOwn(spec,p.recipe))return null;
 const recipeSpec=spec[p.recipe];
 if(!spec||!Number.isInteger(p.stage)||!between(p.stage,0,recipeSpec.stages.length-1)||
  !between(p.workmanship,0,1000)||!between(p.materialQuality,1,5)||
  !between(p.startedAt,0,at)||!Number.isInteger(p.x)||!between(p.x,0,world.width-1)||
  !Number.isInteger(p.y)||!between(p.y,0,world.height-1)||
  (p.station!==null&&!boundedText(p.station,100)))return null;
 const {recipe,stage,workmanship,materialQuality,station,x,y,startedAt}=p;
 return {recipe,stage,workmanship,materialQuality,station,x,y,startedAt};
}
function restoreRemains(world,records,archive,seenVessels=new Set()){
 world.remains=[];
 if(!Array.isArray(records))return;
 const deaths=new Map(archive.slice(-MAX_REMAINS).filter(a=>personId(a?.id)).map(a=>[a.id,a]));
 const seen=new Set(),kinds=root.AgentWorld.INVENTORY_KINDS,craftedKinds=root.Crafting.KINDS;
 for(const r of records.slice(0,MAX_REMAINS)){
  if(!r||!personId(r.actorId)||r.id!=='remains_'+r.actorId||seen.has(r.actorId)||
   r.kind!=='remains'||!between(r.deathAt,0,world.now)||
   deaths.get(r.actorId)?.deathAt!==r.deathAt||
   !Number.isInteger(r.x)||!between(r.x,0,world.width-1)||
   !Number.isInteger(r.y)||!between(r.y,0,world.height-1)||
   !Number.isInteger(r.z)||!between(r.z,world.zMin,world.zMax)||
   !r.inventory||Object.keys(r.inventory).length!==kinds.length||
   !kinds.every(k=>Object.hasOwn(r.inventory,k)&&Number.isInteger(r.inventory[k])&&
     between(r.inventory[k],0,1000))||
   !Array.isArray(r.pantry)||r.pantry.length!==r.inventory.food||
   !r.pantry.every(food=>typeof food==='string'&&Object.hasOwn(root.Biology.FOOD,food))||
   !Array.isArray(r.craftedItems)||r.craftedItems.length>1000)continue;
  const inventory=Object.fromEntries(kinds.map(k=>[k,r.inventory[k]]));
  const counts=Object.fromEntries(craftedKinds.map(k=>[k,0]));
  const craftedItems=[],vessels=new Set();
  for(const item of r.craftedItems){
   if(!item||typeof item.kind!=='string'||!Object.hasOwn(counts,item.kind)||!Number.isInteger(item.quality)||
    !between(item.quality,1,5)||!boundedText(item.maker,80)||
    !boundedText(item.method,32)||!between(item.materialQuality,1,5)||
    !between(item.craftedAt,0,r.deathAt))break;
   const {kind,quality,maker,method,materialQuality,craftedAt}=item;
   const row={kind,quality,maker,craftedAt,method,materialQuality};
   if(kind==='flask'&&(Object.hasOwn(r,'looseWater')||item.vesselId!==undefined)){
    const fields=root.Crafting.flaskFields(item,r.actorId,craftedItems.length);
    if(!fields||seenVessels.has(fields.vesselId)||vessels.has(fields.vesselId))break;
    vessels.add(fields.vesselId);
    Object.assign(row,fields);
   }
   craftedItems.push(row);
   counts[kind]++;
  }
  // A legacy hatchet may have arrived in an older save as a counted tool.
  if(craftedItems.length!==r.craftedItems.length||craftedKinds.some(k=>
    k==='hatchet'?counts[k]>inventory[k]:counts[k]!==inventory[k]))continue;
  const splitWater=Object.hasOwn(r,'looseWater');
  if(splitWater&&(!Number.isSafeInteger(r.looseWater)||r.looseWater<0||
   r.looseWater+craftedItems.reduce((sum,item)=>sum+(item.waterUnits??0),0)!==inventory.water))continue;
  const workpiece=copyWorkpiece(r.workpiece,world,r.deathAt);
  if(r.workpiece!==null&&!workpiece)continue;
  const {id,kind,actorId,x,y,z,deathAt}=r;
  world.remains.push({id,kind,actorId,x,y,z,deathAt,inventory,
   pantry:r.pantry.slice(),craftedItems,workpiece,...(splitWater?{looseWater:r.looseWater}:{})});
  for(const vessel of vessels)seenVessels.add(vessel);
  seen.add(actorId);
 }
}
function die(state,npc,cause='unknown'){
 if(!npc||npc.alive===false||!state.npcs.includes(npc))return false;
 const world=state.world;
 const remains={id:'remains_'+npc.id,kind:'remains',actorId:npc.id,
  x:root.Frontier.wrap(npc.x,world.width),y:root.Frontier.wrap(npc.y,world.height),
  z:npc.z||0,deathAt:state.clock,inventory:npc.inventory,
  pantry:npc.bio.pantry,craftedItems:npc.craftedItems,workpiece:npc.workpiece,
  ...(npc.looseWater===undefined?{}:{looseWater:npc.looseWater})};
 root.Reservations?.releaseActor(state,npc.id);
 root.Activities?.finish(state,npc,false,'ACTOR_DEAD');
 (world.remains ||= []).push(remains);
 npc.inventory=Object.fromEntries(Object.keys(remains.inventory).map(k=>[k,0]));
 npc.bio.pantry=[];npc.craftedItems=[];npc.workpiece=null;
 npc.alive=false;
 state.dead.push({id:npc.id,name:npc.name,birthAt:npc.birthAt,
  deathAt:state.clock,cause,parents:[...(npc.lineage?.biologicalParents||[])],
  knowledgeRecords:npc.knowledge?.recipes?.length||0});
 state.npcs=state.npcs.filter(n=>n.id!==npc.id);
 return true;
}
function updateHealth(state,npc,elapsed){
 if(elapsed<=0)return null;
 const dehydrated=npc.bio.hydrationBudgetMl<=20&&npc.needs.thirst>=90;
 const starving=npc.bio.glycogenKcal<10&&npc.bio.longTermKcal<50&&npc.needs.hunger>=90;
 // Survival pressures start degrading stamina before they become lethal.
 // These are game rates per simulated minute, not medical predictions.
 const thirst=npc.needs.thirst,hunger=npc.needs.hunger;
 if(thirst>=65)npc.energy=Math.max(0,npc.energy-elapsed*(thirst>=90?.14:.055));
 if(hunger>=70)npc.energy=Math.max(0,npc.energy-elapsed*(hunger>=90?.08:.035));
 if(thirst>=85&&npc.bio.hydrationBudgetMl<600)
  npc.health-=elapsed*(dehydrated?.12:.028);
 if(hunger>=90&&npc.bio.longTermKcal<250)
  npc.health-=elapsed*(starving?.018:.006);
 // A conservative age-related gameplay hazard; not a clinical mortality model.
 const years=age(npc,state.clock);
 if(years>80)npc.health-=elapsed*(years-80)*.000004;
 npc.health=Math.max(0,Math.min(100,npc.health));
 if(npc.health<=0){
  const cause=thirst>=85&&npc.bio.hydrationBudgetMl<600?
   'dehydration':hunger>=90&&npc.bio.longTermKcal<250?
   'starvation':'age-related decline';
  die(state,npc,cause);
  return cause;
 }
 return null;
}
function stamp(clock){
 const d=root.Frontier.calendar(clock),minutes=((Math.floor(clock)%1440)+1440)%1440;
 return {year:d.year,month:d.month,day:d.dayOfMonth,season:d.season,
  dayOfYear:d.dayOfYear,hour:Math.floor(minutes/60),minute:minutes%60};
}
root.Civilization={founders,person,addArrival,advanceArrivals,die,updateHealth,
 spawnPosition,stamp,dateAt,age,YEAR_MINUTES,restoreRemains,
 TRAIT_GROUPS,trait,traitLabel,traitSummary,restoreProfile,updateAffect,socialAffect};
})(globalThis);
