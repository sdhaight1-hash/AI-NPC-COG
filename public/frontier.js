// Periodic seeded natural world. All horizontal spatial operations wrap on a finite torus.
// Z is bounded, not wrapped; materialAt provides a deterministic subterranean substrate.
(function(root){
'use strict';
const WIDTH=80,HEIGHT=52,MIN_Z=-4,MAX_Z=3,DEFAULT_SEED=379210;
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
 const cavity=noise(x+z*11,y-z*7,world.seed+z*173,16,13);
 return cavity>.71?'cave':'stone';
}
function traversable(world,x,y,z=0){
 const material=materialAt(world,x,y,z);
 if(z===0)return material!=='water'&&material!=='bedrock'&&material!=='stone';
 return material==='cave'||(material==='air'&&
  materialAt(world,x,y,z-1)!=='air'&&materialAt(world,x,y,z-1)!=='cave');
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
 seed=Number.isInteger(seed)?seed:DEFAULT_SEED;
 const terrain=new Array(WIDTH*HEIGHT);
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  const elevation=noise(x,y,seed,5,4)*.65+noise(x,y,seed+13,16,13)*.35;
  const humidity=noise(x+17,y-21,seed+202,5,4);
  terrain[y*WIDTH+x]=elevation<.33?'water':
   elevation<.39?'sand':elevation>.69?'ridge':
   humidity>.73&&elevation<.48?'marsh':
   humidity>.44||elevation>.54?'forest':'meadow';
 }
 const resources=[];
 const used=new Set();
 function add(kind,x,y,max){
  x=wrap(x,WIDTH);y=wrap(y,HEIGHT);
  const biome=terrainAt({width:WIDTH,height:HEIGHT,terrain},x,y);
  if(biome==='water'||used.has(x+':'+y))return;
  used.add(x+':'+y);
  resources.push({id:'wild_'+kind+'_'+x+'_'+y,kind,x,y,max,stock:max,regrow:0});
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
    add('water',x,y,12);return {width:WIDTH,height:HEIGHT,seed,terrain,resources};
   }
 }
 return {width:WIDTH,height:HEIGHT,seed,terrain,resources};
}
function weather(map,clock){
 const day=Math.floor(clock/1440);
 const hour=((clock%1440)+1440)%1440/60;
 const roll=hash(day,42,map.seed);
 const rain=roll>.60,storm=roll>.91;
 const kind=storm?'storm':rain?'rain':roll<.13?'fog':'clear';
 const temperature=Math.round(15+9*Math.cos((hour-14)*Math.PI/12)
  +(hash(day,30,map.seed)-.5)*8-(rain?3:0));
 return {kind,temperature,rain,day};
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
root.Frontier={WIDTH,HEIGHT,MIN_Z,MAX_Z,DEFAULT_SEED,COLORS,generate,terrainAt,
 wrap,hash,distance,materialAt,traversable,neighbors,weather,reveal,revealed,restore};
})(globalThis);
