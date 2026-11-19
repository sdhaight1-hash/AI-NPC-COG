import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function runtime(){
 const root=vm.createContext({});
 const names=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(names.map(n=>readFileSync(new URL('../public/'+n+'.js',
  import.meta.url),'utf8')).join('\n'),root);
 return root;
}
const snapshot=x=>JSON.parse(JSON.stringify(x));
function empty(n){
 assert.ok(Object.values(n.inventory).every(count=>count===0),
  'Newly born/arrived residents may not possess free materials');
 assert.equal(n.bio.pantry.length,0,'No hidden edible rations in the body pantry');
 assert.equal(n.craftedItems.length,0);
 assert.ok(n.bio.hydrationBudgetMl>0,'Natural bodily hydration is not inventory');
 assert.ok(n.bio.glycogenKcal+n.bio.longTermKcal>0,
  'Preexisting physiological calories are not carried rations');
}
test('every deterministic founder and newcomer starts empty-handed and without food portions',()=>{
 const k=runtime(),a=k.Simulation.initial(379210),b=k.Simulation.initial(379210);
 assert.equal(a.npcs.length,5);
 for(const n of a.npcs)empty(n);
 assert.deepEqual(snapshot(a.npcs.map(x=>x.inventory)),
  snapshot(b.npcs.map(x=>x.inventory)));
 const at=k.Frontier.DAYS_PER_MONTH*1440;
 const newcomer=k.Civilization.addArrival(a,at);
 assert.ok(newcomer);
 empty(newcomer);
});

test('an empty-handed resident drinks only one real freshwater unit, without acquiring water',()=>{
 const k=runtime(),s=k.Simulation.initial(379210);s.auto=false;
 const actor=s.npcs[0],source=s.world.nodes.find(n=>n.kind==='water'&&n.stock>2);
 assert.ok(source);
 actor.x=source.x;actor.y=source.y;actor.z=0;actor.path=[];
 actor.needs.thirst=95;actor.bio.hydrationBudgetMl=600;
 emptyInventory(actor);
 const start=source.stock;
 assert.equal(k.WorldRuntime.begin(s,actor,'drink_source'),true);
 k.Simulation.advance(s,1);
 assert.equal(source.stock,start-1);
 assert.equal(actor.inventory.water,0);
 assert.equal(actor.inventory.food,0);
 assert.equal(actor.bio.pantry.length,0);
 assert.ok(actor.bio.hydrationBudgetMl>900);
 assert.ok(s.receipts.some(r=>r.action==='drink_source'&&r.status==='COMPLETED'));
});
function emptyInventory(n){
 for(const key of Object.keys(n.inventory))n.inventory[key]=0;
 n.bio.pantry=[];
}

test('previous version-3 saves retain legally acquired resources and real food identity',()=>{
 const k=runtime(),original=k.Simulation.initial(379210);original.auto=false;
 const n=original.npcs[0];
 n.inventory.food=2;n.inventory.water=1;n.inventory.wood=4;
 k.Biology.addForaged(n.bio,'nuts',1);
 k.Biology.addForaged(n.bio,'berries',1);
 const saved=snapshot(k.Persistence.save(original));
 const copy=k.Simulation.initial(379210);copy.auto=false;
 assert.equal(k.Persistence.restore(copy,saved),true);
 const restored=copy.npcs.find(x=>x.id===n.id);
 assert.equal(restored.inventory.food,2);
 assert.equal(restored.inventory.water,1);
 assert.equal(restored.inventory.wood,4);
 assert.deepEqual(snapshot(restored.bio.pantry),['nuts','berries']);
 for(const later of copy.npcs.filter(x=>x.id!==n.id))empty(later);
});
