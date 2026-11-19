import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function modules(){
 const context={};
 const base=new URL('../public/',import.meta.url);
 vm.runInNewContext(readFileSync(new URL('frontier.js',base),'utf8')+'\n'+
  readFileSync(new URL('biology.js',base),'utf8')+'\n'+
  readFileSync(new URL('emergence.js',base),'utf8'),context);
 return {F:context.Frontier,A:context.AgentWorld};
}
test('a seeded 80x52 wilderness is deterministic and contains distinct habitats',()=>{
 const {F}=modules();
 const first=F.generate(379210),same=F.generate(379210),different=F.generate(71934);
 assert.equal(first.width,80);
 assert.equal(first.height,52);
 assert.equal(first.terrain.length,4160);
 assert.equal(first.terrain.join(','),same.terrain.join(','));
 assert.notEqual(first.terrain.join(','),different.terrain.join(','));
 assert.equal(first.terrain[12*80+21],'meadow','Starting clearing stays accessible');
 const habitats=new Set(first.terrain);
 for(const kind of ['meadow','forest','sand','water'])assert.ok(habitats.has(kind),kind);
 assert.ok(first.resources.length>20,'Substantial independent wilderness resource sites');
 const occupied=new Set();
 for(const node of first.resources){
  assert.notEqual(F.terrainAt(first,node.x,node.y),'water');
  assert.ok(node.stock>0&&node.max>=node.stock);
  assert.ok(node.x>=40||node.y>=26);
  const id=node.x+':'+node.y;assert.ok(!occupied.has(id),'No duplicate resource tile');
  occupied.add(id);
 }
});
test('exploration is limited to a radius, persisted, and cannot reveal other tiles magically',()=>{
 const {F}=modules(),map=F.generate(379210);
 map.discovered={};
 const gained=F.reveal(map,21,12,5);
 assert.ok(gained>50&&gained<100);
 assert.equal(F.revealed(map,21,12),true);
 assert.equal(F.revealed(map,60,38),false);
 assert.equal(F.reveal(map,21,12,5),0);
 const save={seed:map.seed,width:map.width,height:map.height,discovered:map.discovered};
 const loaded={...F.generate(379210),discovered:{}};
 assert.equal(F.restore(loaded,save),true);
 assert.equal(F.revealed(loaded,21,12),true);
 assert.equal(F.revealed(loaded,60,38),false);
 assert.equal(F.restore(loaded,{...save,seed:144}),false,'Cannot import map knowledge from a different island');
});
test('survival weather is deterministic and daytime temperature differs from midnight',()=>{
 const {F}=modules(),world=F.generate(379210);
 const noon=F.weather(world,12*60),night=F.weather(world,0);
 assert.equal(noon.kind,F.weather(world,12*60).kind);
 assert.ok(noon.temperature>night.temperature);
 assert.ok(['clear','rain','storm','fog'].includes(noon.kind));
});
test('shared water is finite and drinking changes only the consuming agent',()=>{
 const {A}=modules(),world=A.newWorld(),me={id:'t',x:40,y:25,energy:85,
  action:'none',relationships:{}};
 A.newAgent(me);
 const water=world.nodes.find(n=>n.kind==='water');
 assert.ok(water,'Wilderness must contain freshwater');
 me.x=water.x;me.y=water.y;me.task={key:'fill_water',ref:water.id};
 const before=water.stock,start=me.inventory.water;
 assert.equal(A.complete(me,world,[]).ok,true);
 assert.equal(water.stock,before-2);
 assert.equal(me.inventory.water,start+2);
 me.needs.thirst=88;me.task={key:'drink',ref:null};
 assert.equal(A.complete(me,world,[]).ok,true);
 assert.equal(me.needs.thirst,40);
 assert.equal(me.inventory.water,start+1);
});
test('crafting and shelter construction spend actual materials and award earned experience',()=>{
 const {A}=modules(),world=A.newWorld(),agent=A.newAgent({
  id:'builder',x:21,y:12,energy:95,relationships:{},action:'none'},0);
 agent.inventory.wood=5;agent.inventory.stone=2;agent.inventory.fiber=4;
 agent.task={key:'craft_hatchet',ref:null};
 assert.equal(A.complete(agent,world,[]).ok,true);
 assert.equal(agent.inventory.hatchet,1);
 assert.equal(agent.inventory.wood,4);
 assert.equal(agent.inventory.stone,1);
 assert.equal(agent.skills.crafting,1);
 agent.task={key:'build_shelter',ref:null};
 assert.equal(A.complete(agent,world,[]).ok,true);
 assert.equal(world.structures.length,1);
 assert.equal(world.structures[0].type,'shelter');
 assert.equal(agent.inventory.wood,0);
 assert.equal(agent.inventory.fiber,0);
 assert.equal(agent.skills.building,1);
 const save=JSON.parse(JSON.stringify(world));
 const copied=A.newWorld();
 A.restoreWorld(copied,save);
 assert.equal(copied.structures[0].type,'shelter');
});
test('rain exposure and shelter change energy depletion, without assigning character jobs',()=>{
 const {A}=modules(),world=A.newWorld();
 const exposed=A.newAgent({id:'a',x:21,y:12,energy:60,action:'none',relationships:{}},0);
 const protectedAgent=A.newAgent({id:'b',x:30,y:12,energy:60,action:'none',relationships:{}},0);
 world.weather={kind:'storm',temperature:5};
 world.structures.push({id:'camp',type:'shelter',x:protectedAgent.x,y:protectedAgent.y});
 A.stepNeeds(exposed,world,60);
 A.stepNeeds(protectedAgent,world,60);
 assert.ok(exposed.energy<protectedAgent.energy);
 assert.equal(exposed.role,undefined);
 assert.equal(protectedAgent.work,undefined);
});
