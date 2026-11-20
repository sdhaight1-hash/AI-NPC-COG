import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(quality=2){
 const k=vm.createContext({});
 for(const file of ['frontier','construction','biology','crafting','cognition',
  'agency','emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+file+'.js',import.meta.url),'utf8'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const [n,peer]=s.npcs;s.npcs=[n,peer];
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=4&&
  k.Frontier.traversable(s.world,x.x,x.y,x.z||0));
 assert.ok(spring,'Existing finite spring required, not created by test');
 n.x=spring.x;n.y=spring.y;n.z=spring.z||0;n.path=[];
 n.energy=100;n.needs.thirst=10;n.needs.hunger=10;
 n.bio.hydrationBudgetMl=2400;
 n.inventory.wood=1;n.inventory.cord=1;n.inventory.blade=1;
 n.craftedItems=[{kind:'cord',quality,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:quality},
  {kind:'blade',quality:2,maker:n.id,craftedAt:s.clock,
   method:'blade',materialQuality:2}];
 return {k,s,n,peer,spring};
}
function finalStage(run){
 const {k,s,n}=run;
 assert.equal(k.WorldRuntime.begin(s,n,'craft_hollow_wood_trial'),true);
 for(let tick=0;tick<80&&n.workpiece?.stage!==2;tick++)
  k.Simulation.advance(s,1);
 assert.equal(n.workpiece?.stage,2,'Physical carving must precede the seal proof');
 assert.equal(n.inventory.flask,0);
 assert.ok(!n.task,'The last stage has not yet begun');
}
test('a successful wet seal requires one exclusive spring unit and produces an empty flask',()=>{
 const run=setup(),{k,s,n,spring}=run,initial=spring.stock;
 finalStage(run);
 const option=k.WorldRuntime.available(s,n).find(x=>x.key==='craft_stage');
 assert.equal(option?.ref,spring.id);
 assert.doesNotMatch(option.when,/remaining|stock \d+/i,
  'Model action cannot reveal hidden live spring stock');
 assert.equal(k.WorldRuntime.begin(s,n,'craft_stage'),true);
 const command=n.task.commandId,claims=k.Reservations.active(s)
  .filter(x=>x.commandId===command&&x.type==='node');
 assert.equal(claims.length,1);assert.equal(claims[0].id,spring.id);
 assert.equal(claims[0].quantity,1);
 k.Simulation.advance(s,7);
 assert.equal(spring.stock,initial,'Unfinished wet labor must not charge the spring');
 assert.equal(n.inventory.flask,0);
 k.Simulation.advance(s,1);
 assert.equal(spring.stock,initial-1);
 assert.equal(n.inventory.flask,1);
 const flask=n.craftedItems.find(x=>x.kind==='flask');
 assert.equal(flask.waterUnits,0,'Test water is consumed, not gifted to transport');
 assert.equal(n.inventory.water,0);
 const receipt=s.receipts.find(x=>x.commandId===command&&x.status==='COMPLETED');
 assert.ok(receipt);
 assert.equal(receipt.targetId,spring.id);
 assert.deepEqual(copy(receipt.delta.nodeStock.filter(x=>x.key===spring.id)
  .map(x=>x.delta)),[-1]);
 assert.ok(receipt.delta.knowledge?.learnedMethods?.includes('flask'));
 assert.equal(k.Reservations.active(s).some(x=>x.commandId===command),false);
 k.WorldRuntime.complete(s,n);
 assert.equal(spring.stock,initial-1,'A command cannot be committed twice');
});

test('a real leaking trial consumes its wet probe but unlocks no recipe or carried liquid',()=>{
 const run=setup(1),{k,s,n,spring}=run,initial=spring.stock;
 finalStage(run);
 assert.equal(k.WorldRuntime.begin(s,n,'craft_stage'),true);
 const command=n.task.commandId;
 k.Simulation.advance(s,8);
 assert.equal(spring.stock,initial-1);
 assert.equal(n.inventory.flask,0);
 assert.equal(n.inventory.water,0);
 assert.equal(n.knowledge.recipes.includes('flask'),false);
 const receipt=s.receipts.find(r=>r.commandId===command&&r.status==='COMPLETED');
 assert.ok(receipt);
 assert.equal(receipt.delta.nodeStock.find(x=>x.key===spring.id).delta,-1);
 assert.ok(n.evidenceMemory.trials.some(x=>x.receiptId===receipt.id&&
  x.heldWater===false));
});

test('a dry or unvisited spring cannot complete a wet stage or modify its workpiece',()=>{
 const run=setup(),{k,s,n,spring}=run;
 finalStage(run);
 const original=copy(n.workpiece),skill=n.skills.crafting;
 spring.stock=0; // External drought before the reservation is made.
 const before=s.receipts.length;
 assert.equal(k.WorldRuntime.begin(s,n,'craft_stage'),false);
 assert.deepEqual(copy(n.workpiece),original);
 assert.equal(n.skills.crafting,skill);
 assert.equal(n.inventory.flask,0);
 assert.equal(s.receipts.filter(x=>x.action==='craft_stage'&&x.status==='COMPLETED').length,2,
  'Earlier dry carving stages remain valid, not a fabricated wet proof');
 assert.ok(s.receipts.slice(before).some(x=>x.status==='REJECTED'));
 // After the source is unknown and not even perceptible, no wet stage affordance.
 spring.stock=4;
 n.x=k.Frontier.wrap(spring.x+25,s.world.width);
 n.y=spring.y;n.path=[];n.knowledge.sightings=[];
 n.knowledge.observations=[];
 assert.equal(k.WorldRuntime.available(s,n).some(x=>x.key==='craft_stage'),false);
 assert.deepEqual(copy(n.workpiece),original);
});

test('two residents cannot claim the same last seal-test water unit',()=>{
 const run=setup(),{k,s,n,peer,spring}=run;
 finalStage(run);
 peer.x=n.x;peer.y=n.y;peer.z=n.z;peer.energy=100;
 peer.inventory.blade=1;
 peer.workpiece={recipe:'hollow_wood_trial',stage:2,workmanship:2,
  materialQuality:2,station:null,x:peer.x,y:peer.y,startedAt:s.clock-30};
 spring.stock=1;spring.max=Math.max(spring.max,1);
 assert.equal(k.WorldRuntime.begin(s,n,'craft_stage'),true);
 const owner=n.task.commandId;
 const rivalStock=peer.inventory.flask;
 assert.equal(k.WorldRuntime.begin(s,peer,'craft_stage'),false,
  'Contender cannot reserve the unit already claimed by first resident');
 assert.equal(peer.task,null);
 assert.equal(peer.workpiece.stage,2);
 assert.equal(peer.inventory.flask,rivalStock||0);
 assert.equal(spring.stock,1);
 k.Simulation.advance(s,8);
 assert.equal(spring.stock,0);
 assert.equal(n.inventory.flask,1);
 assert.equal(peer.inventory.flask,0);
 assert.equal(s.receipts.filter(x=>x.commandId===owner&&x.status==='COMPLETED').length,1);
});

test('uncommitted reserved water survives a checkpoint and debits once on resumed work',()=>{
 const a=setup(),b=setup();
 for(const run of [a,b]){
  finalStage(run);
  assert.equal(run.k.WorldRuntime.begin(run.s,run.n,'craft_stage'),true);
  run.k.Simulation.advance(run.s,3);
  assert.equal(run.n.workpiece?.stage,2);
  assert.equal(run.k.Reservations.active(run.s).filter(x=>
   x.commandId===run.n.task.commandId&&x.kind==='water').length,1);
 }
 const waterBefore=b.spring.stock,checkpoint=copy(b.k.Persistence.save(b.s));
 const restored=b.k.Simulation.initial(379210);restored.auto=false;
 assert.equal(b.k.Persistence.restore(restored,checkpoint),true);
 const person=restored.npcs.find(x=>x.id===b.n.id);
 const spring=restored.world.nodes.find(x=>x.id===b.spring.id);
 assert.equal(spring.stock,waterBefore);
 assert.equal(person.task.ref,spring.id);
 assert.equal(b.k.Reservations.active(restored).filter(x=>
  x.commandId===person.task.commandId&&x.kind==='water').length,1);
 a.k.Simulation.advance(a.s,5);
 b.k.Simulation.advance(restored,5);
 assert.equal(a.spring.stock,waterBefore-1);
 assert.equal(spring.stock,waterBefore-1);
 assert.equal(person.inventory.flask,1);
 assert.deepEqual(copy(person.inventory),copy(a.n.inventory));
 assert.deepEqual(copy(person.craftedItems),copy(a.n.craftedItems));
 assert.deepEqual(copy(person.evidenceMemory.methods),
  copy(a.n.evidenceMemory.methods));
 assert.equal(restored.receipts.filter(x=>x.action==='craft_stage'&&
  x.delta?.nodeStock?.some(y=>y.key===spring.id&&y.delta===-1)).length,1);
});

test('seal water debits remain identical under one-minute versus batched simulation',()=>{
 const fine=setup(),batch=setup();
 for(const run of [fine,batch]){
  finalStage(run);
  assert.equal(run.k.WorldRuntime.begin(run.s,run.n,'craft_stage'),true);
 }
 for(let minute=0;minute<30;minute++)fine.k.Simulation.advance(fine.s,1);
 batch.k.Simulation.advance(batch.s,30);
 assert.equal(fine.spring.stock,batch.spring.stock);
 assert.equal(fine.n.inventory.flask,1);
 assert.equal(fine.k.Simulation.canonical(fine.k.Persistence.save(fine.s)),
  batch.k.Simulation.canonical(batch.k.Persistence.save(batch.s)));
});
