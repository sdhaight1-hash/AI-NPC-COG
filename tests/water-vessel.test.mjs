import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function setup(){
 const k=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],water=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=8);
 assert.ok(water);
 n.x=water.x;n.y=water.y;n.z=0;n.path=[];
 n.needs.thirst=90;n.bio.hydrationBudgetMl=500;
 return {k,s,n,water};
}
const clone=x=>JSON.parse(JSON.stringify(x));
function fabricate(k,s,n){
 n.inventory.wood=1;n.inventory.cord=1;n.inventory.blade=1;
 n.craftedItems=[{kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:2},{kind:'blade',quality:2,maker:n.id,
  craftedAt:s.clock,method:'blade',materialQuality:2}];
 const before=clone(n.inventory);
 n.knowledge.recipes.push('flask'); // Physical-custody fixture: method learned beforehand.
 const recipe=k.Crafting.getRecipe('flask');
 assert.ok(recipe);
 assert.equal(recipe.tool,'blade');
 assert.equal(k.Crafting.begin(n,s.world,'flask').ok,true);
 assert.equal(n.inventory.blade,before.blade,'Blade is a tool, not a consumed ingredient');
 const spring=s.world.nodes.find(x=>x.kind==='water'&&
  x.x===n.x&&x.y===n.y&&(x.z||0)===(n.z||0));
 assert.ok(spring);
 for(let i=0;i<recipe.stages.length;i++)
  assert.equal(k.Crafting.advance(n,s.world,spring.id).ok,true);
 assert.equal(n.inventory.flask,1);
 assert.ok(n.craftedItems.some(x=>x.kind==='flask'));
 assert.equal(n.inventory.water,0,'Crafting a flask cannot create water');
}
test('no vessel: water collection is not a legal affordance, but source drinking is',()=>{
 const {k,s,n,water}=setup(),stock=water.stock;
 assert.equal(n.inventory.flask,0);
 assert.ok(!k.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'));
 assert.ok(!k.WorldRuntime.available(s,n).some(o=>o.key==='stock_water'));
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),false);
 assert.equal(water.stock,stock);
 assert.equal(n.inventory.water,0);
 assert.equal(k.WorldRuntime.begin(s,n,'drink_source'),true);
 k.Simulation.advance(s,1);
 assert.equal(water.stock,stock-1);
 assert.equal(n.inventory.water,0);
 assert.ok(n.bio.hydrationBudgetMl>800);
});

test('physical flask requires wood and cord and a blade; carry water only in its finite capacity',()=>{
 const {k,s,n,water}=setup();
 fabricate(k,s,n);
 const stock=water.stock;
 assert.ok(k.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'));
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
 const command=n.task.commandId;
 assert.equal(k.Reservations.active(s).find(x=>x.commandId===command)?.quantity,2);
 k.Simulation.advance(s,1);
 assert.equal(water.stock,stock-2);
 assert.equal(n.inventory.water,2);
 assert.ok(!k.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'),
  'A full flask cannot be refilled');
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),false);
 assert.equal(water.stock,stock-2);
 assert.equal(k.WorldRuntime.begin(s,n,'drink'),true);
 k.Simulation.advance(s,1);
 assert.equal(n.inventory.water,1);
 assert.equal(n.inventory.flask,1);
 assert.ok(k.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'));
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
 assert.equal(k.Reservations.active(s).find(x=>x.commandId===n.task.commandId)?.quantity,1);
 k.Simulation.advance(s,1);
 assert.equal(water.stock,stock-3);
 assert.equal(n.inventory.water,2);
 assert.ok(k.AgentWorld.carrying(n).massKg<=32);
});

test('losing the vessel during a pending fill cannot create carried water or debit source',()=>{
 const {k,s,n,water}=setup();fabricate(k,s,n);
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
 const command=n.task.commandId,stock=water.stock;
 n.inventory.flask=0;n.craftedItems=n.craftedItems.filter(x=>x.kind!=='flask');
 k.Simulation.advance(s,1);
 const failure=s.receipts.find(x=>x.commandId===command&&x.status==='FAILED');
 assert.ok(failure);
 assert.match(failure.reason,/NO_LIQUID_CONTAINER/);
 assert.equal(n.inventory.water,0);
 assert.equal(water.stock,stock);
});

test('save and restore preserves a crafted vessel and its contained water without duplication',()=>{
 const {k,s,n}=setup();fabricate(k,s,n);
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
 k.Simulation.advance(s,1);
 const saved=clone(k.Persistence.save(s));
 const copy=k.Simulation.initial(379210);copy.auto=false;
 assert.equal(k.Persistence.restore(copy,saved),true);
 const loaded=copy.npcs.find(x=>x.id===n.id);
 assert.equal(loaded.inventory.flask,1);
 assert.equal(loaded.inventory.water,2);
 assert.equal(loaded.craftedItems.filter(x=>x.kind==='flask').length,1);
 assert.equal(k.AgentWorld.carrying(loaded).valid,true);
 const repeat=k.Simulation.initial(379210);repeat.auto=false;
 assert.equal(k.Persistence.restore(repeat,clone(k.Persistence.save(copy))),true);
 assert.equal(repeat.npcs[0].inventory.flask,1);
 assert.equal(repeat.npcs[0].inventory.water,2);
});

test('legacy version-three portable water remains drinkable but cannot be renewed without a vessel',()=>{
 const {k,s,n,water}=setup();
 n.inventory.water=2;
 const saved=clone(k.Persistence.save(s));
 const copy=k.Simulation.initial(379210);copy.auto=false;
 assert.equal(k.Persistence.restore(copy,saved),true);
 const old=copy.npcs[0];
 assert.equal(old.inventory.flask,0);
 assert.equal(old.inventory.water,2);
 assert.ok(!k.WorldRuntime.available(copy,old).some(o=>o.key==='fill_water'));
 assert.equal(k.WorldRuntime.begin(copy,old,'drink'),true);
 k.Simulation.advance(copy,1);
 assert.equal(old.inventory.water,1);
 assert.equal(copy.world.nodes.find(x=>x.id===water.id).stock,water.stock);
});

test('individual flasks fill independently and transfer their contents through the ground',()=>{
 const {k,s,n,water}=setup();fabricate(k,s,n);
 n.inventory.wood=1;n.inventory.cord=1;
 n.craftedItems.push({kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:2});
 assert.equal(k.Crafting.begin(n,s.world,'flask').ok,true);
 while(n.workpiece)assert.equal(k.Crafting.advance(n,s.world,water.id).ok,true);
 const ids=n.craftedItems.filter(x=>x.kind==='flask').map(x=>x.vesselId);
 assert.equal(new Set(ids).size,2);
 const stock=water.stock;
 for(let i=0;i<2;i++){
  assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
  k.Simulation.advance(s,1);
 }
 assert.equal(water.stock,stock-4);
 assert.deepEqual(Array.from(n.craftedItems.filter(x=>x.kind==='flask'),x=>x.waterUnits),[2,2]);
 assert.equal(n.inventory.water,4);
 assert.equal(k.WorldRuntime.begin(s,n,'drop_flask'),true);
 k.Simulation.advance(s,1);
 assert.equal(n.inventory.water,4);
 k.Simulation.advance(s,1);
 assert.equal(n.inventory.water,2);
 const dropped=s.world.items.find(x=>x.kind==='flask');
 assert.equal(dropped.vessel.vesselId,ids[0]);
 assert.equal(dropped.vessel.waterUnits,2);
 const saved=clone(k.Persistence.save(s));
 saved.world.items.push({...clone(dropped),id:'item_99'});
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,saved),true);
 assert.equal(restored.world.items.length,1);
 const receiver=restored.npcs[1];
 Object.assign(receiver,k.Frontier.neighbors(restored.world,dropped)[0]);
 // This bulk leaves room for the empty flask, but not for its carried water.
 Object.assign(receiver.inventory,{wood:8,fiber:2,food:1});
 assert.ok(k.AgentWorld.roomFor(receiver,'flask')>0);
 assert.equal(k.WorldRuntime.begin(restored,receiver,'pickup_item'),false);
 assert.equal(restored.world.items[0].vessel.waterUnits,2);
 Object.assign(receiver.inventory,{wood:0,fiber:0,food:0});
 assert.equal(k.WorldRuntime.begin(restored,receiver,'pickup_item'),true);
 k.Simulation.advance(restored,2);
 assert.equal(restored.world.items.length,0);
 assert.equal(receiver.inventory.water,2);
 assert.equal(receiver.craftedItems.find(x=>x.kind==='flask').vesselId,ids[0]);
 receiver.needs.thirst=90;receiver.bio.hydrationBudgetMl=500;
 assert.equal(k.WorldRuntime.begin(restored,receiver,'drink'),true);
 k.Simulation.advance(restored,1);
 assert.equal(receiver.inventory.water,1);
 assert.equal(receiver.craftedItems.find(x=>x.kind==='flask').waterUnits,1);
});
test('death preserves a filled vessel and restore rejects a second owner of its identity',()=>{
 const {k,s,n}=setup();fabricate(k,s,n);
 assert.equal(k.WorldRuntime.begin(s,n,'fill_water'),true);
 k.Simulation.advance(s,1);
 const vessel=clone(n.craftedItems.find(x=>x.kind==='flask'));
 assert.equal(k.Civilization.die(s,n,'test'),true);
 const saved=clone(k.Persistence.save(s));
 saved.npcs[0].craftedItems.push(vessel);
 Object.assign(saved.npcs[0].inventory,{flask:1,water:2});
 saved.npcs[0].looseWater=0;
 const restored=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(restored,saved),true);
 assert.deepEqual(clone(restored.world.remains[0].craftedItems.find(x=>x.kind==='flask')),vessel);
 assert.equal(restored.world.remains[0].inventory.water,2);
 assert.equal(restored.npcs[0].inventory.flask,0);
 assert.equal(restored.npcs[0].inventory.water,0);
});

test('legacy aggregated water migrates into real flasks and preserves excess separately',()=>{
 const {k,s,n}=setup();fabricate(k,s,n);
 n.inventory.water=4;
 const old=clone(k.Persistence.save(s)),oldFlask=old.npcs[0].craftedItems.find(x=>x.kind==='flask');
 delete oldFlask.vesselId;delete oldFlask.waterUnits;
 const current=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(current,old),true);
 const actor=current.npcs[0],flask=actor.craftedItems.find(x=>x.kind==='flask');
 assert.equal(flask.waterUnits,2);
 assert.equal(actor.looseWater,2);
 assert.equal(actor.inventory.water,4);
 const repeat=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(repeat,clone(k.Persistence.save(current))),true);
 assert.equal(repeat.npcs[0].craftedItems.find(x=>x.kind==='flask').vesselId,flask.vesselId);
 assert.equal(repeat.npcs[0].inventory.water,4);
});
