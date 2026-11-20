// Periodic seeded natural world. All horizontal spatial operations wrap on a finite torus.
// Z is bounded, not wrapped; materialAt provides a deterministic subterranean substrate.
(function(root){
'use strict';
const WIDTH=80,HEIGHT=52,MIN_Z=-4,MAX_Z=3,DEFAULT_SEED=379210;
const GENERATOR_REVISION=1;
const COLORS={meadow:'#708e50',forest:'#315e43',marsh:'#647f55',ridge:'#89867a',sand:'#c7b184',water:'#3c8297',stone:'#737c78'};
const wrap=(v,size)=>((v%size)+size)%size;
const hash=(x,y,seed=DEFAULT_SEED)=>{
 let n=Math.imul(x+911,374761393)^Math.imul(y+137,668265263)^Math.imul(seed|0,1442695041);
 n=Math.imul(n^(n>>>13),1274126177);
 return ((n^(n>>>16))>>>0)/4294967296;
};
function noise(x,y,seed,nx=5,ny=4){
 const fx=wrap(x,WIDTH)/WIDTH*nx,fy=wrap(y,HEIGHT)/HEIGHT*ny;
 const ax=Math.floor(fx),ay=Math.floor(fy),tx=(fx-ax)**2*(3-2*(fx-ax));
 const ty=(fy-ay)**2*(3-2*(fy-ay));
 const a=hash(wrap(ax,nx),wrap(ay,ny),seed);
 const b=hash(wrap(ax+1,nx),wrap(ay,ny),seed);
 const c=hash(wrap(ax,nx),wrap(ay+1,ny),seed);
 const d=hash(wrap(ax+1,nx),wrap(ay+1,ny),seed);
 return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}
function descriptor(seed=DEFAULT_SEED){
 seed=Number.isInteger(seed)?seed:DEFAULT_SEED;
 return Object.freeze({seed,revision:GENERATOR_REVISION,topology:'torus',
  width:WIDTH,height:HEIGHT,zMin:MIN_Z,zMax:MAX_Z});
}
function surface(seed,x,y){
 const elevation=noise(x,y,seed,5,4)*.65+noise(x,y,seed+13,16,13)*.35;
 const humidity=noise(x+17,y-21,seed+202,5,4);
 return elevation<.33?'water':
  elevation<.39?'sand':elevation>.69?'ridge':
  humidity>.73&&elevation<.48?'marsh':
  humidity>.44||elevation>.54?'forest':'meadow';
}
function underground(seed,x,y,z){
 return noise(x+z*11,y-z*7,seed+z*173,16,13)>.71?'cave':'stone';
}
function baseRegion(spec,{x,y,width,height,z=0}){
 if(!spec||!Number.isInteger(spec.seed)||!sameDescriptor(spec,descriptor(spec.seed)))
  throw new RangeError('Unsupported world generator descriptor');
 if(![x,y,width,height,z].every(Number.isSafeInteger)||
  width<1||width>WIDTH||height<1||height>HEIGHT||z<MIN_Z||z>MAX_Z)
  throw new RangeError('Invalid base region');
 const startX=wrap(x,WIDTH),startY=wrap(y,HEIGHT),tiles=[];
 for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++){
  const xx=wrap(startX+dx,WIDTH),yy=wrap(startY+dy,HEIGHT);
  tiles.push(z===0?surface(spec.seed,xx,yy):z>0?'air':underground(spec.seed,xx,yy,z));
 }
 return tiles;
}
function sameDescriptor(a,b){
 return Object.keys(b).every(key=>a?.[key]===b[key]);
}
function matchesSave(map,data){
 if(!data||data.seed!==map.seed||data.width!==map.width||data.height!==map.height||
  (data.zMin!==undefined&&data.zMin!==MIN_Z)||(data.zMax!==undefined&&data.zMax!==MAX_Z))
  return false;
 const expected=map.generator||descriptor(map.seed);
 // Untagged v3 checkpoints were written by revision 1.
 if(!Object.hasOwn(data,'generator'))return expected.revision===1;
 return sameDescriptor(data.generator,expected);
}
function terrainAt(map,x,y){
 if(!Number.isInteger(x)||!Number.isInteger(y))return 'water';
 return map.terrain[wrap(y,map.height)*map.width+wrap(x,map.width)];
}
function distance(map,a,b){
 const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
 return Math.min(dx,map.width-dx%map.width,dx%map.width)+
  Math.min(dy,map.height-dy%map.height,dy%map.height)+
  Math.abs((a.z||0)-(b.z||0));
}
function materialAt(world,x,y,z=0){
 if(!Number.isInteger(z)||z<MIN_Z||z>MAX_Z)return 'bedrock';
 x=wrap(x,world.width);y=wrap(y,world.height);
 const key=x+':'+y+':'+z;
 if(Object.hasOwn(world.edits||{},key))return world.edits[key];
 if(z>0)return 'air';
 if(z===0)return terrainAt(world,x,y);
 return underground(world.seed,x,y,z);
}
function terrainTraversable(world,x,y,z=0){
 const material=materialAt(world,x,y,z);
 if(z===0)return material!=='water'&&material!=='bedrock'&&material!=='stone'&&material!=='wall';
 if(material==='cave')return true;
 if(material!=='air')return false;
 const support=materialAt(world,x,y,z-1);
 return support!=='air'&&support!=='cave'&&support!=='water';
}
function traversable(world,x,y,z=0){
 if(!terrainTraversable(world,x,y,z))return false;
 x=wrap(x,world.width);y=wrap(y,world.height);
 return !(world.construction?.tiles||[]).some(t=>t.kind==='wall'&&
  t.x===x&&t.y===y&&t.z===z&&t.status==='BUILT');
}
function neighbors(world,position){
 const z=position.z||0,x=wrap(position.x,world.width),y=wrap(position.y,world.height);
 const result=[];
 for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
  const next={x:wrap(x+dx,world.width),y:wrap(y+dy,world.height),z};
  if(traversable(world,next.x,next.y,z))result.push(next);
 }
 // Vertical travel needs a physical staircase/ladder on the origin or target tile.
 for(const delta of [-1,1]){
  const nz=z+delta;
  if(nz<MIN_Z||nz>MAX_Z)continue;
  const linked=(world.structures||[]).some(s=>
    s.type==='stairs'&&s.x===x&&s.y===y&&
    Math.min(s.z,s.toZ)===Math.min(z,nz)&&Math.max(s.z,s.toZ)===Math.max(z,nz));
  if(linked&&traversable(world,x,y,nz))result.push({x,y,z:nz});
 }
 return result;
}
function generate(seed=DEFAULT_SEED){
 const generator=descriptor(seed);
 seed=generator.seed;
 const terrain=baseRegion(generator,{x:0,y:0,width:WIDTH,height:HEIGHT});
 const resources=[];
 const used=new Set();
 function add(kind,x,y,max){
  x=wrap(x,WIDTH);y=wrap(y,HEIGHT);
  const biome=terrainAt({width:WIDTH,height:HEIGHT,terrain},x,y);
  if(biome==='water'||used.has(x+':'+y))return;
  used.add(x+':'+y);
  resources.push({id:'wild_'+kind+'_'+x+'_'+y,kind,x,y,max,stock:max,regrow:0,
   // Groundwater is a finite initially stocked physical reservoir. The
   // spring's surface stock cannot replenish without transferring from it.
   ...(kind==='water'?{groundwater:max*12,rainAdmitted:0}:{})});
 }
 for(let y=0;y<HEIGHT;y+=2)for(let x=0;x<WIDTH;x+=2){
  const biome=terrain[y*WIDTH+x],r=hash(x,y,seed+59);
  if(biome==='forest'){
   if(r<.30)add('wood',x,y,5+Math.floor(r*10));
   else if(r<.52)add('food',x,y,4);
   else if(r<.70)add('fiber',x,y,5);
  }else if(biome==='meadow'||biome==='marsh'){
   if(r<.26)add('food',x,y,4);
   else if(r<.47)add('fiber',x,y,5);
   else if(r<.59)add('wood',x,y,4);
  }else if(biome==='ridge'){
   if(r<.67)add('stone',x,y,7);
   else if(r<.75)add('fiber',x,y,3);
  }else if(biome==='sand'&&r<.45)add('water',x,y,9);
 }
 // Freshwater is a separate finite stock; not every surface-water tile is drinkable.
 for(let y=0;y<HEIGHT;y+=3)for(let x=0;x<WIDTH;x+=3){
  if(terrainAt({width:WIDTH,height:HEIGHT,terrain},x,y)==='marsh'&&
     hash(x,y,seed+91)<.32)add('water',x,y,8);
 }
 // Ensure each generated world has accessible freshwater even with unusual seeds.
 if(!resources.some(n=>n.kind==='water')){
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)
   if(terrain[y*WIDTH+x]==='meadow'&&resources.every(r=>r.x!==x||r.y!==y)){
    add('water',x,y,12);return {width:WIDTH,height:HEIGHT,seed,generator,terrain,resources};
   }
 }
 return {width:WIDTH,height:HEIGHT,seed,generator,terrain,resources};
}
// Twelve 9-day months, four 27-day seasons, 108 days per game year.
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
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
  if(dx*dx+dy*dy>radius*radius)continue;
  const xx=wrap(x+dx,map.width),yy=wrap(y+dy,map.height);
  const key=yy*map.width+xx;
  if(!discovered[key]){discovered[key]=1;gained++;}
 }
 return gained;
}
function revealed(map,x,y){return !!map.discovered?.[wrap(y,map.height)*map.width+wrap(x,map.width)];}
function restore(map,data){
 if(!matchesSave(map,data))return false;
 const discovered=map.discovered||(map.discovered={});
 if(data.discovered&&typeof data.discovered==='object'){
  for(const key of Object.keys(data.discovered).slice(0,WIDTH*HEIGHT)){
   const i=Number(key);
   if(Number.isInteger(i)&&i>=0&&i<WIDTH*HEIGHT&&data.discovered[key]===1)
    discovered[i]=1;
  }
 }
 const edits={};
 const materials=new Set([...Object.keys(COLORS),'air','bedrock','cave','wall']);
 if(data.edits&&typeof data.edits==='object'){
  for(const [key,material] of Object.entries(data.edits)){
   const [x,y,z]=key.split(':').map(Number);
   if(!materials.has(material)||![x,y,z].every(Number.isInteger)||
    key!==x+':'+y+':'+z||x<0||x>=WIDTH||y<0||y>=HEIGHT||z<MIN_Z||z>MAX_Z)
    continue;
   edits[key]=material;
  }
 }
 map.edits=edits;
 return true;
}
root.Frontier={WIDTH,HEIGHT,MIN_Z,MAX_Z,DEFAULT_SEED,COLORS,generate,baseRegion,matchesSave,terrainAt,
 wrap,hash,distance,materialAt,terrainTraversable,traversable,neighbors,calendar,DAYS_PER_MONTH,DAYS_PER_YEAR,weather,reveal,revealed,restore};
})(globalThis);
