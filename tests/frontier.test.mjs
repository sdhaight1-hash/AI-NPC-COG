import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function modules(){
 const c={};
 for(const name of ['frontier.js','biology.js','crafting.js','cognition.js','agency.js','emergence.js'])
  vm.runInNewContext(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),c);
 return c;
}
test('natural seed is repeatable and has multiple biomes and finite resources',()=>{
 const {AgentWorld:A,Frontier:F}=modules(),w=A.newWorld(379210);
 const same=A.newWorld(379210),different=A.newWorld(71934);
 assert.equal(w.width,80);assert.equal(w.height,52);
 assert.equal(JSON.stringify(w.terrain),JSON.stringify(same.terrain));
 assert.notEqual(JSON.stringify(w.terrain),JSON.stringify(different.terrain));
 const biomes=new Set(w.terrain);
 for(const type of ['meadow','forest','sand','water'])assert.ok(biomes.has(type));
 assert.equal(w.structures.length,0);
 assert.ok(w.nodes.length>20);
 assert.ok(w.nodes.some(n=>n.kind==='water'));
 for(const n of w.nodes){
  assert.notEqual(F.terrainAt(w,n.x,n.y),'water');
  assert.ok(n.stock>0&&n.stock<=n.max);
 }
});
test('revision 1 preserves the terrain and resource layout of historical worlds',()=>{
 const {Frontier:F}=modules();
 for(const [seed,expected] of [
  [379210,'c42a7b572296fc5cafa0061d6efc989bac264959f5e54601752f4dcdb985dc57'],
  [71934,'101f320e0aab626021556c79addc7a5614c771820904ae222b8a4a8bac4d8d5b'],
  [2147483646,'49de40fbab559b8a41a29cd46d61e243117fc5e1c31260f91cce324c112ed93b']
 ]){
  const world=F.generate(seed);
  assert.equal(createHash('sha256').update(JSON.stringify([world.terrain,world.resources])).digest('hex'),expected);
 }
});
test('absolute regions restore the same base regardless of order or seam crossings',()=>{
 const {Frontier:F,AgentWorld:A}=modules();
 for(const seed of [379210,71934])for(const side of [16,32]){
  const world=A.newWorld(seed),regions=[];
  for(let y=0;y<world.height;y+=side)for(let x=0;x<world.width;x+=side)
   regions.push({x,y,width:Math.min(side,world.width-x),height:Math.min(side,world.height-y)});
  const assembled=[];
  for(const r of regions.reverse()){
   const data=F.baseRegion(world.generator,r);
   for(let row=0;row<r.height;row++)for(let col=0;col<r.width;col++)
    assembled[(r.y+row)*world.width+r.x+col]=data[row*r.width+col];
  }
  assert.deepEqual(assembled,Array.from(world.terrain));
  for(const z of [-3,0,2]){
   const r={x:-2,y:-1,width:4,height:3,z};
   const sample=F.baseRegion(world.generator,r);
   const shifted=F.baseRegion(world.generator,{...r,x:r.x+2*world.width,y:r.y-world.height});
   assert.deepEqual(Array.from(sample),Array.from(shifted));
   for(let dy=0;dy<r.height;dy++)for(let dx=0;dx<r.width;dx++)
    assert.equal(sample[dy*r.width+dx],F.materialAt(world,r.x+dx,r.y+dy,z));
  }
  world.edits['0:0:-1']='bedrock';
  assert.equal(F.materialAt(world,0,0,-1),'bedrock');
  assert.notEqual(F.baseRegion(world.generator,{x:0,y:0,width:1,height:1,z:-1})[0],'bedrock');
  assert.throws(()=>F.baseRegion({...world.generator,revision:2},{x:0,y:0,width:1,height:1}),
   {message:'Unsupported world generator descriptor'});
 }
});
test('time-dependent weather repeats for a seed',()=>{
 const {Frontier:F}=modules(),w=F.generate();
 const noon=F.weather(w,720),night=F.weather(w,0);
 assert.equal(noon.kind,F.weather(w,720).kind);
 assert.ok(noon.temperature>night.temperature);
});
test('foraging consumes a real stock and is traced to a nutritional food',()=>{
 const {AgentWorld:A}=modules(),w=A.newWorld();
 const n=A.newAgent({id:'gatherer',x:0,y:0,energy:90,
  action:'none',relationships:{}});
 const node=w.nodes.find(v=>v.kind==='food');assert.ok(node);
 n.x=node.x;n.y=node.y;
 const stock=node.stock,food=n.inventory.food;
 n.task={key:'forage',ref:node.id};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.ok(node.stock<stock);
 assert.ok(n.inventory.food>food);
 assert.equal(n.inventory.food,n.bio.pantry.length);
});
test('water collection and drinking consume real inventory and hydration',()=>{
 const {AgentWorld:A}=modules(),w=A.newWorld(),n=A.newAgent({
  id:'person',x:0,y:0,energy:90,action:'none',relationships:{}});
 const water=w.nodes.find(v=>v.kind==='water');assert.ok(water);
 n.x=water.x;n.y=water.y;
 const stock=water.stock,amount=n.inventory.water;
 n.task={key:'fill_water',ref:water.id};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.equal(water.stock,stock-2);
 assert.equal(n.inventory.water,amount+2);
 n.needs.thirst=88;n.task={key:'drink',ref:null};
 const hydration=n.bio.hydrationBudgetMl;
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.ok(n.bio.hydrationBudgetMl>hydration);
});
test('construction uses actual earned materials and never creates starter structures',()=>{
 const {AgentWorld:A}=modules(),w=A.newWorld(),n=A.newAgent({
  id:'builder',x:5,y:5,energy:95,action:'none',relationships:{}});
 assert.equal(w.structures.length,0);
 n.inventory.wood=5;n.inventory.fiber=4;
 n.task={key:'experiment_wood_fiber',ref:null};
 assert.equal(A.complete(n,w,[n]).ok,true);
 n.task={key:'build_shelter',ref:null};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.equal(w.structures.length,1);
 assert.equal(n.inventory.wood,1);assert.equal(n.inventory.fiber,0);
 assert.equal(n.skills.building,1);
 const copy=A.newWorld();
 A.restoreWorld(copy,JSON.parse(JSON.stringify(w)));
 assert.equal(copy.structures.length,1);
});
test('practice increases gathering output without imposing occupational roles',()=>{
 const {AgentWorld:A}=modules(),w=A.newWorld(),n=A.newAgent({
  id:'practitioner',x:0,y:0,energy:90,action:'none',relationships:{}});
 assert.equal(n.role,undefined);assert.equal(n.home,undefined);
 const node=w.nodes.find(v=>v.kind==='wood'&&v.stock>=5);
 assert.ok(node);
 n.x=node.x;n.y=node.y;
 const start=node.stock;
 n.task={key:'collect_wood',ref:node.id};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.equal(start-node.stock,2);
 n.skills.gathering=9;
 node.stock=8;node.max=Math.max(node.max,8);
 n.task={key:'collect_wood',ref:node.id};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.equal(node.stock,4);
});

test('compact year transitions across months, seasons and years',()=>{
 const {Frontier:F}=modules();
 assert.equal(F.DAYS_PER_YEAR,108);
 assert.equal(F.calendar(8*1440).dayOfMonth,9);
 assert.equal(F.calendar(9*1440).month,2);
 assert.equal(F.calendar(27*1440).season,'Summer');
 assert.equal(F.calendar(54*1440).season,'Autumn');
 assert.equal(F.calendar(81*1440).season,'Winter');
 assert.equal(F.calendar(108*1440).year,2);
});
test('winter cools weather and limits plant regrowth',()=>{
 const {AgentWorld:A,Frontier:F}=modules(),map=F.generate(379210);
 assert.ok(F.weather(map,40*1440+720).temperature>
  F.weather(map,94*1440+720).temperature+12);
 const summer=A.newWorld(),winter=A.newWorld();
 const a=summer.nodes.find(n=>n.kind==='food');
 const b=winter.nodes.find(n=>n.id===a.id);
 a.stock=0;b.stock=0;
 summer.weather={kind:'clear',season:'Summer'};
 winter.weather={kind:'clear',season:'Winter'};
 A.regenerate(summer,100);A.regenerate(winter,100);
 assert.ok(a.stock>b.stock);
});
