import test from 'node:test';
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
 // Real filled water must have physical container capacity.
 n.inventory.flask=1;
 n.craftedItems.push({kind:'flask',quality:2,maker:n.id,craftedAt:0,
  method:'flask',materialQuality:2});
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
