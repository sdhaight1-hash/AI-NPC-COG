// Seeded wilderness expansion. No Wayward code or assets.
(function(root){
'use strict';
const WIDTH=80,HEIGHT=52,DEFAULT_SEED=379210;
const COLORS={meadow:'#708e50',forest:'#315e43',marsh:'#647f55',ridge:'#89867a',sand:'#c7b184',water:'#3c8297',stone:'#737c78'};
const hash=(x,y,seed=DEFAULT_SEED)=>{
 let n=Math.imul(x+911,374761393)^Math.imul(y+137,668265263)^Math.imul(seed|0,1442695041);
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967296;
};
const noise=(x,y,seed,scale)=>{
 const ax=Math.floor(x/scale),ay=Math.floor(y/scale);
 const fx=x/scale-ax,fy=y/scale-ay;
 const tx=fx*fx*(3-2*fx),ty=fy*fy*(3-2*fy);
 const a=hash(ax,ay,seed),b=hash(ax+1,ay,seed),c=hash(ax,ay+1,seed),d=hash(ax+1,ay+1,seed);
 return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
};
function terrainAt(map,x,y){
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.width||y>=map.height)return 'water';
 return map.terrain[y*map.width+x];
}
function generate(seed=DEFAULT_SEED){
 seed=Number.isInteger(seed)?seed:DEFAULT_SEED;
 const terrain=new Array(WIDTH*HEIGHT);
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  // Preserve the existing starting clearing and its collision layout while
  // replacing the rest with a geographically coherent explorable island.
  if(x<40&&y<26){terrain[y*WIDTH+x]='meadow';continue;}
  const normalizedX=(x-39)/45,normalizedY=(y-24)/33;
  const oceanFalloff=Math.max(0,(normalizedX**2+normalizedY**2)*.29);
  const hills=noise(x,y,seed,15)*.58+noise(x,y,seed+13,6)*.28+
    noise(x,y,seed+37,3)*.14;
  const height=hills-oceanFalloff;
  const humidity=noise(x+60,y+20,seed+202,14);
  let biome='meadow';
  if(height<.27)biome='water';
  else if(height<.325)biome='sand';
  else if(height>.66)biome='ridge';
  else if(humidity>.74&&height<.43)biome='marsh';
  else if(humidity>.45||height>.52)biome='forest';
  terrain[y*WIDTH+x]=biome;
 }
 // Guarantee a walkable corridor from the original village to the wilderness.
 for(let x=37;x<60;x++)for(let y=20;y<=23;y++)
  if(terrain[y*WIDTH+x]==='water')terrain[y*WIDTH+x]='sand';
 for(let y=22;y<38;y++)for(let x=38;x<=41;x++)
  if(terrain[y*WIDTH+x]==='water')terrain[y*WIDTH+x]='sand';
 const resources=[];
 const added=new Set();
 function add(kind,x,y,max){
  if(x<2||y<2||x>=WIDTH-2||y>=HEIGHT-2)return;
  const biome=terrain[y*WIDTH+x];
  if(biome==='water'||(x<40&&y<26)||added.has(x+':'+y))return;
  added.add(x+':'+y);
  resources.push({id:'wild_'+kind+'_'+x+'_'+y,kind,x,y,stock:max,max,regrow:0});
 }
 for(let y=3;y<HEIGHT-3;y+=2)for(let x=40;x<WIDTH-3;x+=2){
  const biome=terrain[y*WIDTH+x],r=hash(x,y,seed+59);
  if(biome==='forest'){
   if(r<.28)add('wood',x,y,5+Math.floor(r*10));
   else if(r<.47)add('food',x,y,4);
   else if(r<.63)add('fiber',x,y,5);
  }else if(biome==='meadow'||biome==='marsh'){
   if(r<.18)add('food',x,y,4);
   else if(r<.35)add('fiber',x,y,5);
   else if(r<.45)add('wood',x,y,4);
  }else if(biome==='ridge'){
   if(r<.6)add('stone',x,y,7);
   else if(r<.71)add('fiber',x,y,3);
  }else if(biome==='sand'&&r<.28)add('water',x,y,9);
 }
 // Guaranteed freshwater source and useful local materials in reachable
 // wilderness; water also exists near the old center for early survival.
 for(const [kind,x,y,max] of [['water',41,22,12],['fiber',40,22,8],
  ['wood',42,23,8],['stone',41,26,8],['food',45,20,7]])add(kind,x,y,max);
 return {width:WIDTH,height:HEIGHT,seed,terrain,resources};
}
const DAYS_PER_MONTH=9,DAYS_PER_YEAR=108,SEASONS=['Spring','Summer','Autumn','Winter'];
function calendar(clock){
 const totalDay=Math.max(0,Math.floor(clock/1440)),dayOfYear=totalDay%DAYS_PER_YEAR;
 const month=Math.floor(dayOfYear/DAYS_PER_MONTH);
 return {year:Math.floor(totalDay/DAYS_PER_YEAR)+1,month:month+1,
  dayOfMonth:dayOfYear%DAYS_PER_MONTH+1,dayOfYear:dayOfYear+1,
  season:SEASONS[Math.floor(month/3)],seasonDay:dayOfYear%27+1,totalDay:totalDay+1};
}
function weather(map,clock){
 const date=calendar(clock),day=date.totalDay-1;
 const hour=((clock%1440)+1440)%1440/60,roll=hash(day,42,map.seed);
 const seasonalWarmth=Math.cos(2*Math.PI*(date.dayOfYear-41)/DAYS_PER_YEAR);
 const base=9+12*seasonalWarmth;
 const wetChance=date.season==='Spring'?.48:date.season==='Autumn'?.47:
  date.season==='Winter'?.43:.25;
 const precipitation=roll>1-wetChance,storm=precipitation&&roll>.94;
 const temperature=Math.round(base+6*Math.cos((hour-14)*Math.PI/12)
  +(hash(day,30,map.seed)-.5)*6-(precipitation?2:0));
 const snow=precipitation&&temperature<=0;
 const kind=snow?'snow':storm?'storm':precipitation?'rain':roll<.12?'fog':'clear';
 return {kind,temperature,rain:precipitation&&!snow,snow,day,
  season:date.season,year:date.year};
}
function reveal(map,x,y,radius=6){
 const discovered=map.discovered||(map.discovered={});
 let gained=0;
 for(let yy=Math.max(0,y-radius);yy<=Math.min(map.height-1,y+radius);yy++)
 for(let xx=Math.max(0,x-radius);xx<=Math.min(map.width-1,x+radius);xx++){
  if((xx-x)**2+(yy-y)**2>radius*radius)continue;
  const key=yy*map.width+xx;
  if(!discovered[key]){discovered[key]=1;gained++;}
 }
 return gained;
}
function revealed(map,x,y){return !!map.discovered?.[y*map.width+x];}
function restore(map,data){
 if(!data||data.seed!==map.seed||data.width!==map.width||data.height!==map.height)return false;
 if(data.discovered&&typeof data.discovered==='object'){
  for(const key of Object.keys(data.discovered).slice(0,WIDTH*HEIGHT)){
   const i=Number(key);
   if(Number.isInteger(i)&&i>=0&&i<WIDTH*HEIGHT&&data.discovered[key]===1)
    map.discovered[i]=1;
  }
 }
 return true;
}
root.Frontier={WIDTH,HEIGHT,DEFAULT_SEED,COLORS,DAYS_PER_MONTH,DAYS_PER_YEAR,calendar,generate,terrainAt,weather,reveal,revealed,restore,hash};
})(globalThis);
