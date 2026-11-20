import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','construction','biology','crafting','cognition',
  'agency','emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],peer=s.npcs[1];s.npcs=[n,peer];
 n.energy=100;
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=3&&
  c.Frontier.traversable(s.world,x.x,x.y,x.z||0));
 assert.ok(spring);
 n.x=spring.x;n.y=spring.y;n.z=spring.z||0;n.path=[];
 n.inventory.blade=1;
 n.craftedItems.push({kind:'blade',quality:2,maker:n.id,
  craftedAt:s.clock,method:'blade',materialQuality:2});
 return {c,s,n,peer};
}
function furnish(n,clock,grade){
 n.energy=100;
 n.inventory.wood=1;n.inventory.cord=1;
 n.craftedItems=n.craftedItems.filter(x=>x.kind!=='cord');
 n.craftedItems.push({kind:'cord',quality:grade,maker:n.id,
  craftedAt:clock,method:'cord',materialQuality:grade});
}
function trial(c,s,n,grade){
 furnish(n,s.clock,grade);
 assert.equal(c.WorldRuntime.begin(s,n,'craft_hollow_wood_trial'),true);
 c.Simulation.advance(s,56);
 assert.equal(n.workpiece,null);
 assert.equal(n.plan,null);
 return s.receipts.findLast(x=>x.actorId===n.id&&x.status==='COMPLETED'&&
  x.action==='craft_stage'&&x.delta?.workpiece?.before?.recipe==='hollow_wood_trial'&&
  x.delta.workpiece.after===null);
}
test('a completed weak-binding leak records partial evidence without invention',()=>{
 const {c,s,n,peer}=setup();
 const failed=trial(c,s,n,1);
 assert.ok(failed);
 assert.equal(n.inventory.flask,0);
 assert.equal(n.knowledge.recipes.includes('flask'),false);
 assert.equal(n.evidenceMemory.trials.length,1);
 assert.equal(n.evidenceMemory.comparisons.length,0);
 const record=n.evidenceMemory.trials[0];
 assert.equal(record.receiptId,failed.id);
 assert.equal(record.method,'flask');
 assert.equal(record.materialQuality,1);
 assert.equal(record.heldWater,false);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.cord,0);
 assert.equal(n.inventory.blade,1);
 assert.equal(peer.evidenceMemory.trials.length,0);
});

test('contrasting firsthand trials infer a tentative quality comparison and guide the next material',()=>{
 const {c,s,n,peer}=setup();
 const leaked=trial(c,s,n,1);
 const held=trial(c,s,n,2);
 assert.ok(leaked&&held);
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.equal(n.evidenceMemory.trials.length,2);
 const [comparison]=n.evidenceMemory.comparisons;
 assert.ok(comparison);
 assert.equal(comparison.certainty,'inferred');
 assert.equal(comparison.method,'flask');
 assert.equal(comparison.failedQuality,1);
 assert.equal(comparison.passedQuality,2);
 assert.deepEqual(copy(comparison.sourceReceiptIds),[leaked.id,held.id]);
 assert.equal(peer.evidenceMemory.comparisons.length,0);
 // The learned association is *not* transferable by proximity.
 furnish(n,s.clock,1);
 const before=copy(n.inventory);
 assert.equal(c.WorldRuntime.available(s,n).some(x=>x.key==='craft_flask'),false);
 const denied=c.Crafting.begin(n,s.world,'flask');
 assert.equal(denied.ok,false);
 assert.match(denied.message,/tested.*leak/i);
 assert.deepEqual(copy(n.inventory),before,'Rejecting a known-bad binding spends nothing');
 assert.equal(n.workpiece,null);
 // When both grades are physically carried, evidence chooses the stronger
 // one; the weak cord remains in inventory instead of being silently upgraded.
 n.inventory.cord++;
 n.craftedItems.push({kind:'cord',quality:2,maker:n.id,
  craftedAt:s.clock,method:'cord',materialQuality:2});
 assert.ok(c.WorldRuntime.available(s,n).some(x=>x.key==='craft_flask'));
 assert.equal(c.WorldRuntime.begin(s,n,'craft_flask'),true);
 // The initial physical action starts a workpiece after its own timed
 // commitment, not synchronously when the intention is selected.
 c.Simulation.advance(s,3);
 assert.equal(n.workpiece?.materialQuality,2);
 assert.equal(n.inventory.cord,1);
 assert.equal(n.craftedItems.find(x=>x.kind==='cord').quality,1);
 c.Simulation.advance(s,53);
 assert.equal(n.inventory.flask,2);
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 const manufactured=s.receipts.filter(x=>x.action==='craft_stage'&&
  x.delta?.craftedItems&&x.status==='COMPLETED');
 assert.ok(manufactured.length>=2);
 const checkpoint=copy(c.Persistence.save(s));
 const fresh=c.Simulation.initial(379210);fresh.auto=false;
 assert.equal(c.Persistence.restore(fresh,checkpoint),true);
 const actor=fresh.npcs.find(x=>x.id===n.id);
 assert.deepEqual(copy(actor.evidenceMemory.trials),copy(n.evidenceMemory.trials));
 assert.deepEqual(copy(actor.evidenceMemory.comparisons),copy(n.evidenceMemory.comparisons));
 assert.equal(actor.knowledge.recipes.includes('flask'),true);
});

test('repeated failures at the same quality do not invent a causal comparison',()=>{
 const {c,s,n}=setup();
 const first=trial(c,s,n,1);
 const second=trial(c,s,n,1);
 assert.notEqual(first.id,second.id);
 assert.equal(n.evidenceMemory.trials.length,2);
 assert.equal(n.evidenceMemory.comparisons.length,0);
 assert.ok(!n.knowledge.recipes.includes('flask'));
 assert.equal(n.inventory.blade,1);
 assert.equal(n.inventory.flask,0);
});

test('external or stale receipt references cannot fabricate comparative evidence',()=>{
 const {c,s,n}=setup();
 const first=trial(c,s,n,1);
 const before=copy(n.evidenceMemory.trials);
 assert.equal(c.EvidenceMemory.fromReceipt(s,n,{
  ...first,id:'evt_999999',delta:{...first.delta,
   workpiece:{before:{recipe:'hollow_wood_trial',materialQuality:2},after:null},
   knowledge:{learnedMethods:['flask']}}
 }),null);
 assert.deepEqual(copy(n.evidenceMemory.trials),before);
 assert.equal(n.evidenceMemory.comparisons.length,0);
});

test('an uninformed taught maker can still leak a poor seal, without counting the goal as achieved',()=>{
 const {c,s,n}=setup();
 n.knowledge.recipes.push('flask'); // Prior oral instruction, without personal trials.
 furnish(n,s.clock,1);
 const failures=n.agency.failedGoals;
 assert.ok(c.WorldRuntime.available(s,n).some(o=>o.key==='craft_flask'));
 assert.equal(c.WorldRuntime.begin(s,n,'craft_flask'),true);
 c.Simulation.advance(s,56);
 assert.equal(n.inventory.flask,0);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.cord,0);
 assert.equal(n.inventory.blade,1);
 assert.equal(n.workpiece,null);
 assert.equal(n.plan,null);
 assert.equal(n.evidenceMemory.comparisons.length,0);
 assert.ok(n.agency.failedGoals>failures,
  'Completing physical labor with no working flask is not completing the goal');
 assert.ok(n.memories.some(m=>m.kind==='failure'&&/seal leaked/i.test(m.text)));
 const final=s.receipts.findLast(x=>x.action==='craft_stage'&&
  x.status==='COMPLETED'&&x.delta?.workpiece?.before?.recipe==='flask'&&
  x.delta.workpiece.after===null);
 assert.ok(final);
 assert.equal(final.delta.inventory.some(x=>x.key==='flask'&&x.delta>0),false);
});

test('comparative flask trials preserve custody and provenance at 1x, 60x and 240x',()=>{
 const results=[1,60,240].map(step=>{
  const {c,s,n}=setup();
  const blade=copy(n.craftedItems.find(x=>x.kind==='blade'));
  for(const grade of [1,2]){
   furnish(n,s.clock,grade);
   assert.equal(c.WorldRuntime.begin(s,n,'craft_hollow_wood_trial'),true);
   for(let elapsed=0;elapsed<240;elapsed+=step)c.Simulation.advance(s,step);
   assert.equal(n.inventory.wood,0);
   assert.equal(n.inventory.cord,0);
   assert.equal(n.inventory.flask,grade===2?1:0);
  }
  assert.deepEqual(copy(n.craftedItems.find(x=>x.kind==='blade')),blade);
  assert.equal(n.evidenceMemory.comparisons.length,1);
  const wet=s.receipts.filter(x=>x.action==='craft_stage'&&x.status==='COMPLETED'&&
   x.delta.nodeStock?.some(d=>d.delta===-1));
  assert.equal(wet.length,2);
  assert.deepEqual(copy(n.evidenceMemory.comparisons[0].sourceReceiptIds),copy(wet.map(x=>x.id)));
  assert.deepEqual(copy(wet.flatMap(x=>x.delta.nodeStock.map(d=>d.delta))),[-1,-1]);
  return c.Simulation.canonical(c.Persistence.save(s));
 });
 assert.equal(results[1],results[0]);
 assert.equal(results[2],results[0]);
});

test('a replacement vessel project defers weak bindings and resumes with a real stronger one',()=>{
 const {c,s,n}=setup();
 assert.ok(trial(c,s,n,1));
 assert.ok(trial(c,s,n,2));
 assert.equal(c.WorldRuntime.begin(s,n,'drop_flask'),true);
 c.Simulation.advance(s,2);
 assert.equal(n.inventory.flask,0);
 assert.equal(s.world.items.filter(x=>x.kind==='flask').length,1);
 furnish(n,s.clock,1);
 const p=c.Projects.create(s,n,'water_vessel');
 const supplied=copy(n.inventory);
 c.Simulation.advance(s,1);
 assert.equal(p.status,'BLOCKED');
 assert.equal(p.blockedReason,'build:TESTED_SEAL_RISK');
 assert.ok(p.nextAt>s.clock);
 assert.deepEqual(copy(n.inventory),supplied);
 assert.equal(n.workpiece,null);
 const blockedUntil=p.nextAt;
 c.Simulation.advance(s,5);
 assert.equal(p.nextAt,blockedUntil);
 assert.equal(n.task,null);
 assert.deepEqual(copy(n.inventory),supplied);
 n.inventory.cord++;
 n.craftedItems.push({kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:2});
 c.Simulation.advance(s,blockedUntil-s.clock+3);
 assert.equal(n.workpiece?.materialQuality,2);
 assert.equal(n.inventory.cord,1,'The rejected grade remains an unchanged physical item');
 assert.equal(n.craftedItems.find(x=>x.kind==='cord').quality,1);
 c.Simulation.advance(s,53);
 assert.equal(p.status,'COMPLETED');
 assert.equal(n.inventory.flask,1);
 assert.equal(s.world.items.filter(x=>x.kind==='flask').length,1);
});
