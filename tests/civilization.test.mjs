import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function modules(){
 const context={};
 for(const path of ['frontier.js','biology.js','emergence.js','civilization.js']){
  vm.runInNewContext(readFileSync(new URL('../public/'+path,import.meta.url),'utf8'),context);
 }
 return context;
}
test('seeded generation has no fixed settlement or village resources',()=>{
 const {AgentWorld:A,Frontier:F}=modules();
 const one=A.newWorld(379210),again=A.newWorld(379210),other=A.newWorld(71934);
 assert.equal(one.width,80);assert.equal(one.height,52);
 assert.equal(one.terrain.length,4160);
 assert.equal(one.structures.length,0);
 assert.equal(one.version,3);
 assert.equal(JSON.stringify(one.terrain),JSON.stringify(again.terrain));
 assert.notEqual(JSON.stringify(one.terrain),JSON.stringify(other.terrain));
 const types=new Set(one.terrain);
 for(const t of ['water','meadow','forest','sand'])assert.ok(types.has(t),t);
 for(const r of one.nodes)assert.notEqual(F.terrainAt(one,r.x,r.y),'water');
});
test('finite world has continuous wrapped neighbors and paths on every edge',()=>{
 const {AgentWorld:A,Frontier:F}=modules(),world=A.newWorld();
 for(const [x,y] of [[0,0],[79,51],[-1,-1],[80,52]])
  assert.equal(F.terrainAt(world,x,y),
   F.terrainAt(world,F.wrap(x,world.width),F.wrap(y,world.height)));
 for(let y=0;y<world.height;y++){
  const neighbors=F.neighbors(world,{x:0,y,z:0});
  if(F.traversable(world,world.width-1,y))
   assert.ok(neighbors.some(p=>p.x===world.width-1&&p.y===y));
 }
 const a={x:0,y:25},b={x:79,y:25};
 assert.equal(F.distance(world,a,b),1);
 const c={x:30,y:0},d={x:30,y:51};
 assert.equal(F.distance(world,c,d),1);
});
test('discovery radius wraps across both seams without leaking other regions',()=>{
 const {Frontier:F}=modules(),world=F.generate();
 world.discovered={};
 assert.equal(F.reveal(world,0,0,1),5);
 assert.equal(F.revealed(world,79,0),true);
 assert.equal(F.revealed(world,0,51),true);
 assert.equal(F.revealed(world,40,25),false);
 const saved={seed:world.seed,width:world.width,height:world.height,discovered:world.discovered};
 const restored={...F.generate(),discovered:{}};
 assert.equal(F.restore(restored,saved),true);
 assert.equal(F.revealed(restored,79,0),true);
 assert.equal(F.restore(restored,{...saved,seed:123}),false);
});
test('z levels have finite geology and no imaginary free vertical connections',()=>{
 const {AgentWorld:A,Frontier:F}=modules(),w=A.newWorld();
 assert.equal(F.materialAt(w,12,6,F.MIN_Z-1),'bedrock');
 assert.equal(F.materialAt(w,12,6,F.MAX_Z+1),'bedrock');
 assert.equal(F.materialAt(w,12,6,1),'air');
 const start={x:12,y:6,z:0};
 assert.ok(F.neighbors(w,start).every(v=>v.z===0));
 w.edits['12:6:-1']='cave';
 w.structures.push({type:'stairs',x:12,y:6,z:0,toZ:-1});
 assert.ok(F.neighbors(w,start).some(v=>v.z===-1),'Vertical movement needs a physical connector');
});
test('five generated founders are independent and arrive near each other',()=>{
 const {AgentWorld:A,Civilization:C,Frontier:F}=modules(),w=A.newWorld();
 const founders=C.founders(w);
 assert.equal(founders.length,5);
 assert.equal(new Set(founders.map(n=>n.id)).size,5);
 assert.equal(new Set(founders.map(n=>n.x+':'+n.y)).size,5);
 for(const n of founders){
  assert.equal(n.alive,true);
  assert.equal(n.z,0);
  assert.equal(n.skills.crafting,0);
  assert.equal(n.knowledge.recipes.length,0);
  assert.equal(n.role,undefined);
  assert.equal(n.home,undefined);
  assert.ok(F.traversable(w,n.x,n.y));
  assert.ok(C.age(n,490)>=18&&C.age(n,490)<=55);
 }
 const first=founders[0];
 for(const n of founders)assert.ok(F.distance(w,first,n)<=16);
});
test('each monthly boundary creates exactly one independent newcomer, even with skipped dates',()=>{
 const {AgentWorld:A,Civilization:C}=modules(),w=A.newWorld(),state={
  world:w,npcs:C.founders(w),dead:[],nextPersonId:6,clock:490
 };
 const jan30=29*1440, feb1=31*1440,mar1=60*1440;
 assert.equal(C.advanceArrivals(state,490,jan30).length,0);
 assert.equal(C.advanceArrivals(state,jan30,feb1-1).length,0);
 const first=C.advanceArrivals(state,feb1-1,feb1);
 assert.equal(first.length,1);
 assert.equal(first[0].id,'person_6');
 assert.equal(C.advanceArrivals(state,feb1,feb1).length,0);
 assert.equal(C.advanceArrivals(state,feb1,mar1).length,1);
 assert.equal(state.npcs.length,7);
 assert.equal(state.npcs.at(-1).knowledge.recipes.length,0);
});
test('death is permanent and extinction does not trigger a reset',()=>{
 const {AgentWorld:A,Civilization:C}=modules(),w=A.newWorld();
 const state={world:w,npcs:C.founders(w),dead:[],nextPersonId:6,clock:500};
 const originalTerrain=JSON.stringify(w.terrain);
 w.structures.push({id:'legacy',x:1,y:2,type:'campfire'});
 for(const n of [...state.npcs])assert.equal(C.die(state,n,'test'),true);
 assert.equal(state.npcs.length,0);assert.equal(state.dead.length,5);
 assert.equal(C.die(state,{id:'person_1'},'test'),false);
 assert.equal(w.structures.length,1);
 assert.equal(JSON.stringify(w.terrain),originalTerrain);
 const arrivals=C.advanceArrivals(state,500,31*1440);
 assert.equal(arrivals.length,1);
 assert.equal(arrivals[0].id,'person_6');
 assert.equal(arrivals[0].knowledge.recipes.length,0);
});
test('crafting knowledge is not granted by materials or skill automatically',()=>{
 const {AgentWorld:A,Civilization:C}=modules(),w=A.newWorld(),n=C.founders(w)[0];
 n.inventory.wood=3;n.inventory.stone=2;n.inventory.fiber=3;
 const canReach=()=>true;
 const actions=A.available(n,w,[n],canReach);
 assert.ok(actions.some(a=>a.key==='experiment_tool'));
 assert.ok(!actions.some(a=>a.key==='craft_hatchet'));
 n.task={key:'craft_hatchet',ref:null};
 assert.equal(A.complete(n,w,[n]).ok,false,'A direct guessed recipe must fail');
 n.task={key:'experiment_tool',ref:null};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.ok(n.knowledge.recipes.includes('hatchet'));
 assert.ok(A.available(n,w,[n],canReach).some(a=>a.key==='craft_hatchet'));
 n.task={key:'craft_hatchet',ref:null};
 assert.equal(A.complete(n,w,[n]).ok,true);
 assert.equal(n.inventory.hatchet,1);
});
