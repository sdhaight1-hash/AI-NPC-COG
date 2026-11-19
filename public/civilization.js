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
 const npc=root.AgentWorld.newAgent({
  id:'person_'+index,name,x:position.x,y:position.y,z:0,mood:55+Math.floor(a*30),
  energy:75,trust:50,color:PALETTE[index%PALETTE.length],
  personality:name+' is an adult individual, '+trait1+' and '+trait2+
   '. No profession, group membership or relationship is assigned.',
  goal:'Assessing an unfamiliar environment',action:'none',source:'simulation',
  scores:null,memories:[],chat:[],relationships:{},path:[],travel:0,
  thoughtAt:clock+2+index%7,lastSeen:0
 },index);
 npc.alive=true;
 npc.health=100;
 npc.birthAt=clock-years*YEAR_MINUTES;
 npc.knowledge={recipes:[],observations:[]};
 npc.lineage={biologicalParents:[],caregivers:[]};
 npc.spawnAt=clock;
 npc.spawnKind=index<=5?'founder':'arrival';
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
function die(state,npc,cause='unknown'){
 if(!npc||npc.alive===false||!state.npcs.some(n=>n.id===npc.id))return false;
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
 if(dehydrated)npc.health-=elapsed*.12;
 if(starving)npc.health-=elapsed*.018;
 // A conservative age-related gameplay hazard; not a clinical mortality model.
 const years=age(npc,state.clock);
 if(years>80)npc.health-=elapsed*(years-80)*.000004;
 npc.health=Math.max(0,Math.min(100,npc.health));
 if(npc.health<=0){
  const cause=dehydrated?'dehydration':starving?'starvation':'age-related decline';
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
 spawnPosition,stamp,dateAt,age,YEAR_MINUTES};
})(globalThis);
