import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
 const context={};
 for(const path of ['frontier.js','biology.js','crafting.js','cognition.js','agency.js','emergence.js','civilization.js'])
  vm.runInNewContext(readFileSync(new URL('../public/'+path,import.meta.url),'utf8'),context);
 const world=context.AgentWorld.newWorld(379210);
 const npc=context.Civilization.founders(world)[0];
 npc.energy=100;
 world.now=500;
 return {world,npc,C:context.Crafting,A:context.AgentWorld};
}
function finish(C,npc,world){
 const stages=C.getRecipe(npc.workpiece.recipe).stages;
 const messages=[];
 for(let i=0;i<stages.length;i++){
  const result=C.advance(npc,world);
  assert.equal(result.ok,true,result.message);
  messages.push(result.message);
 }
 return messages;
}
test('cord requires a real 3-stage workpiece and finite fiber',()=>{
 const {world,npc,C}=setup();
 npc.inventory.fiber=4;
 assert.ok(C.options(npc,world).some(o=>o.key==='craft_cord'));
 assert.equal(C.begin(npc,world,'cord').ok,true);
 assert.equal(npc.inventory.fiber,1);
 assert.equal(npc.inventory.cord,0);
 assert.equal(npc.workpiece.stage,0);
 assert.equal(C.begin(npc,world,'blade').ok,false,'Only one workpiece may exist');
 const first=C.advance(npc,world);
 assert.equal(first.ok,true);
 assert.equal(npc.workpiece.stage,1);
 assert.equal(npc.inventory.cord,0,'Incomplete work never yields a finished item');
 finishRemaining(C,npc,world);
 assert.equal(npc.inventory.cord,1);
 assert.equal(npc.workpiece,null);
 assert.equal(npc.craftedItems[0].kind,'cord');
 assert.ok(npc.craftedItems[0].quality>=1&&npc.craftedItems[0].quality<=5);
 assert.equal(npc.craftedItems[0].maker,npc.id);
});
function finishRemaining(C,npc,world){
 while(npc.workpiece){
  npc.energy=100;
  assert.equal(C.advance(npc,world).ok,true);
 }
}
test('stone knapping, cord and hafting form a nonduplicating dependency chain',()=>{
 const {world,npc,C}=setup();
 npc.inventory.fiber=3;npc.inventory.stone=2;npc.inventory.wood=1;
 assert.equal(C.options(npc,world).some(o=>o.key==='craft_hafted_hatchet'),false);
 assert.equal(C.begin(npc,world,'cord').ok,true);finishRemaining(C,npc,world);
 assert.equal(C.begin(npc,world,'blade').ok,true);finishRemaining(C,npc,world);
 assert.equal(npc.inventory.blade,1);assert.equal(npc.inventory.cord,1);
 const inputs=npc.craftedItems.length;
 assert.equal(C.begin(npc,world,'hafted_hatchet').ok,true);
 assert.equal(npc.inventory.blade,0);
 assert.equal(npc.inventory.cord,0);
 assert.equal(npc.inventory.wood,0);
 assert.equal(npc.craftedItems.length,inputs-2,'Components are truly consumed');
 finishRemaining(C,npc,world);
 assert.equal(npc.inventory.hatchet,1);
 assert.equal(npc.craftedItems.length,1);
 assert.equal(npc.craftedItems[0].method,'hafted_hatchet');
 assert.equal(C.begin(npc,world,'hafted_hatchet').ok,false);
});
test('workbench is a physical prerequisite for producing planks and crates',()=>{
 const {world,npc,C}=setup();
 npc.inventory.wood=9;npc.inventory.stone=1;npc.inventory.fiber=6;
 assert.equal(C.begin(npc,world,'cord').ok,true);finishRemaining(C,npc,world);
 assert.equal(C.begin(npc,world,'cord').ok,true);finishRemaining(C,npc,world);
 assert.equal(C.begin(npc,world,'workbench').ok,true);finishRemaining(C,npc,world);
 const bench=world.structures.find(x=>x.type==='workbench');
 assert.ok(bench);
 assert.equal(bench.x,npc.x);
 assert.equal(bench.y,npc.y);
 assert.equal(npc.inventory.wood,6);
 npc.inventory.hatchet=1; // legitimate legacy tool
 assert.equal(C.options(npc,world).some(o=>o.key==='craft_planks'),true);
 assert.equal(C.begin(npc,world,'planks',bench.id).ok,true);
 assert.equal(npc.inventory.wood,4);
 finishRemaining(C,npc,world);
 assert.equal(npc.inventory.plank,3);
 assert.equal(C.begin(npc,world,'crate',bench.id).ok,true);
 finishRemaining(C,npc,world);
 assert.equal(npc.inventory.crate,1);
 assert.equal(npc.inventory.plank,0);
 assert.equal(npc.inventory.cord,0);
 assert.equal(npc.craftedItems.filter(x=>x.kind==='plank').length,0);
 assert.equal(world.structures.filter(x=>x.type==='workbench').length,1);
});
test('lost stations and absent tools block work without minting output',()=>{
 const {world,npc,C}=setup();
 npc.inventory.wood=5;npc.inventory.stone=1;npc.inventory.fiber=3;
 C.begin(npc,world,'cord');finishRemaining(C,npc,world);
 C.begin(npc,world,'workbench');finishRemaining(C,npc,world);
 const bench=world.structures.find(x=>x.type==='workbench');
 assert.equal(C.begin(npc,world,'planks',bench.id).ok,false,'Hatchet required');
 npc.inventory.hatchet=1;
 assert.equal(C.begin(npc,world,'planks','nonexistent').ok,false,'Real station ID required');
 assert.equal(C.begin(npc,world,'planks',bench.id).ok,true);
 const wood=npc.inventory.wood;
 world.structures.splice(world.structures.indexOf(bench),1);
 assert.equal(C.advance(npc,world).ok,false);
 assert.equal(npc.inventory.plank,0);
 assert.equal(npc.inventory.wood,wood);
 assert.ok(npc.workpiece,'Unfinished work remains, not refunded or completed');
});
test('restored jobs and item-quality records survive without duplicating resources',()=>{
 const {world,npc,C}=setup();
 npc.inventory.fiber=3;
 assert.equal(C.begin(npc,world,'cord').ok,true);
 C.advance(npc,world);
 const interrupted=JSON.parse(JSON.stringify(npc));
 const replica=setup().npc;
 replica.inventory={...interrupted.inventory};
 C.restore(replica,interrupted);
 assert.equal(replica.workpiece.stage,1);
 assert.equal(replica.inventory.fiber,0);
 finishRemaining(C,replica,world);
 const saved=JSON.parse(JSON.stringify(replica));
 const restored=setup().npc;
 restored.inventory={...saved.inventory};
 C.restore(restored,saved);
 assert.equal(restored.inventory.cord,1);
 assert.equal(restored.craftedItems.length,1);
 assert.equal(restored.craftedItems[0].quality,saved.craftedItems[0].quality);
 assert.equal(C.begin(restored,world,'cord').ok,false);
});
test('v3 legacy hatchets retain their quantity when new manufacturing records are absent',()=>{
 const {world,npc,C}=setup();
 npc.inventory.hatchet=1;
 C.restore(npc,{inventory:npc.inventory});
 assert.equal(npc.inventory.hatchet,1);
 assert.equal(npc.craftedItems.filter(x=>x.kind==='hatchet').length,1);
});

test('a finished crate becomes a finite, quality-sensitive persistent storage object',()=>{
 const {world,npc,C,A}=setup();
 npc.craftedItems.push({kind:'crate',quality:4,maker:npc.id,
  craftedAt:world.now,method:'crate',materialQuality:3});
 npc.inventory.crate=1;
 npc.inventory.wood=25;
 const count=npc.craftedItems.length;
 const placement=C.interact(npc,world,'place_crate',null);
 assert.equal(placement.ok,true,placement.message);
 assert.equal(npc.inventory.crate,0);
 assert.equal(npc.craftedItems.length,count-1);
 const crate=world.structures.find(s=>s.type==='crate');
 assert.ok(crate);
 assert.equal(crate.capacity,24);
 assert.equal(crate.craftQuality,4);
 for(let i=0;i<24;i++)
  assert.equal(C.interact(npc,world,'stash_wood',crate.id).ok,true);
 assert.equal(crate.contents.wood,24);
 assert.equal(npc.inventory.wood,1);
 assert.equal(C.interact(npc,world,'stash_wood',crate.id).ok,false,
  'A full container cannot accept more material');
 const copy=A.newWorld(world.seed);
 A.restoreWorld(copy,JSON.parse(JSON.stringify(world)));
 assert.equal(copy.structures.find(s=>s.id===crate.id).contents.wood,24);
 assert.equal(C.interact(npc,world,'withdraw_wood',crate.id).ok,true);
 assert.equal(npc.inventory.wood,2);
 assert.equal(crate.contents.wood,23);
 assert.equal(C.interact(npc,world,'place_crate',null).ok,false,
  'Placed crate is not still carried');
});
test('better craftsmanship yields objectively better goods',()=>{
 const novice=setup(),expert=setup();
 novice.npc.inventory.fiber=3;expert.npc.inventory.fiber=3;
 expert.npc.skills.crafting=24;
 assert.equal(novice.C.begin(novice.npc,novice.world,'cord').ok,true);
 assert.equal(expert.C.begin(expert.npc,expert.world,'cord').ok,true);
 finishRemaining(novice.C,novice.npc,novice.world);
 finishRemaining(expert.C,expert.npc,expert.world);
 const low=novice.npc.craftedItems[0],high=expert.npc.craftedItems[0];
 assert.ok(high.quality>low.quality,
  'Skill must change the actual quality stored on the resulting item');
});

test('learned shelter project requires eight separate physical production stages',()=>{
 const {world,npc,C}=setup();
 npc.inventory.wood=4;npc.inventory.fiber=3;
 assert.equal(C.options(npc,world).some(x=>x.key==='craft_shelter'),false,
  'An NPC must not know the shelter procedure before discovery');
 assert.equal(C.begin(npc,world,'shelter').ok,false);
 npc.knowledge.recipes.push('shelter');
 assert.equal(C.begin(npc,world,'shelter').ok,true);
 assert.equal(npc.inventory.wood,0);
 assert.equal(npc.inventory.fiber,0);
 assert.equal(world.structures.some(x=>x.type==='shelter'),false);
 const steps=C.getRecipe('shelter').stages;
 assert.equal(steps.length,8);
 for(let i=0;i<steps.length;i++){
  npc.energy=100;
  assert.equal(C.advance(npc,world).ok,true);
  assert.equal(world.structures.some(x=>x.type==='shelter'),i===steps.length-1);
 }
 assert.equal(world.structures.filter(x=>x.type==='shelter').length,1);
 assert.equal(npc.workpiece,null);
 assert.equal(C.advance(npc,world).ok,false,
  'Finalizing an already finished shelter cannot mint a second structure');
});
