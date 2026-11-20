import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const k=vm.createContext({});
 for(const name of ['frontier','construction','biology','crafting','cognition',
  'agency','emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const [n,peer]=s.npcs;
 s.npcs=[n,peer];
 n.energy=100;
 n.inventory.wood=1;n.inventory.cord=1;n.inventory.blade=1;
 n.craftedItems=[
  {kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,method:'cord',materialQuality:2},
  {kind:'blade',quality:2,maker:n.id,craftedAt:s.clock,method:'blade',materialQuality:2}
 ];
 return {k,s,n,peer};
}
const copy=x=>JSON.parse(JSON.stringify(x));

test('equal materials do not reveal a private flask manufacturing method',()=>{
 const {k,s,n,peer}=setup();
 Object.assign(peer.inventory,{wood:1,cord:1,blade:1});
 peer.craftedItems=copy(n.craftedItems).map(item=>({...item,maker:peer.id}));
 peer.knowledge.recipes.push('flask'); // Prior instruction: different personal evidence.
 assert.ok(k.WorldRuntime.available(s,n).some(x=>x.key==='craft_hollow_wood_trial'));
 assert.ok(!k.WorldRuntime.available(s,n).some(x=>x.key==='craft_flask'));
 assert.ok(k.WorldRuntime.available(s,peer).some(x=>x.key==='craft_flask'));
 const before=copy(n.inventory);
 assert.equal(k.Crafting.begin(n,s.world,'flask').ok,false);
 assert.deepEqual(copy(n.inventory),before,'A rejected craft consumes nothing');
 assert.ok(!n.knowledge.recipes.includes('flask'));
});

test('actual hollow-wood trial consumes supplies and teaches only the maker',()=>{
 const {k,s,n,peer}=setup();
 const start=copy(n.inventory),startGoods=n.craftedItems.length;
 assert.equal(k.WorldRuntime.begin(s,n,'craft_hollow_wood_trial'),true);
 k.Simulation.advance(s,52);
 assert.equal(n.workpiece,null,'Trial must finish its time-costed stages');
 assert.equal(n.inventory.wood,start.wood-1);
 assert.equal(n.inventory.cord,start.cord-1);
 assert.equal(n.inventory.blade,start.blade,'The cutting tool is reusable');
 assert.equal(n.inventory.flask,1);
 assert.equal(n.craftedItems.length,startGoods,'One consumed cord, one new flask');
 assert.equal(n.craftedItems.filter(x=>x.kind==='flask').length,1);
 assert.equal(n.craftedItems.find(x=>x.kind==='flask').method,'hollow_wood_trial');
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.ok(!peer.knowledge.recipes.includes('flask'),'Nobody learns from an unseen catalog entry');
 const earned=s.receipts.filter(x=>x.status==='COMPLETED'&&
  x.delta?.knowledge?.learnedMethods?.includes('flask'));
 assert.equal(earned.length,1,'Method learning is an authoritative, once-only receipt delta');
 assert.equal(earned[0].actorId,n.id);
 assert.ok(n.evidenceMemory.methods.some(x=>x.method==='flask'&&x.receiptId===earned[0].id));
 assert.equal(k.WorldRuntime.available(s,n).some(x=>x.key==='craft_hollow_wood_trial'),false);
 n.inventory.wood=1;n.inventory.cord=1;
 n.craftedItems.push({kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:2});
 assert.ok(k.WorldRuntime.available(s,n).some(x=>x.key==='craft_flask'),
  'A learned method grants production only when real inputs and tools exist');
});

test('interrupted trial and learned method survive checkpoint replay',()=>{
 const a=setup(),b=setup();
 for(const run of [a,b]){
  assert.equal(run.k.WorldRuntime.begin(run.s, run.n,
   'craft_hollow_wood_trial'),true);
  run.k.Simulation.advance(run.s,5);
  assert.ok(run.n.workpiece,'Trial still has unfinished labor');
 }
 const checkpoint=copy(b.k.Persistence.save(b.s));
 const fresh=b.k.Simulation.initial(379210);fresh.auto=false;
 assert.equal(b.k.Persistence.restore(fresh,checkpoint),true);
 const maker=fresh.npcs.find(x=>x.id===b.n.id);
 assert.equal(maker.workpiece.recipe,'hollow_wood_trial');
 a.k.Simulation.advance(a.s,47);
 b.k.Simulation.advance(fresh,47);
 assert.equal(a.n.inventory.flask,1);
 assert.equal(maker.inventory.flask,1);
 assert.equal(maker.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.equal(fresh.receipts.filter(x=>x.delta?.knowledge?.learnedMethods?.includes('flask')).length,1);
 // Compare authoritative effects rather than unrelated restored goal metadata.
 // This fixture intentionally interrupted a live craft_project mid-stage.
 assert.deepEqual(copy(maker.inventory),copy(a.n.inventory));
 assert.deepEqual(copy(maker.craftedItems),copy(a.n.craftedItems));
 assert.equal(maker.workpiece,null);
 assert.equal(maker.plan,null);
 assert.deepEqual(copy(maker.knowledge),copy(a.n.knowledge));
 assert.deepEqual(copy(maker.evidenceMemory.methods),
  copy(a.n.evidenceMemory.methods));
 assert.deepEqual(copy(fresh.world.nodes.map(x=>({id:x.id,stock:x.stock}))),
  copy(a.s.world.nodes.map(x=>({id:x.id,stock:x.stock}))));
 const terminal=state=>state.receipts.filter(x=>x.status==='COMPLETED' &&
  ['craft_hollow_wood_trial','craft_stage'].includes(x.action))
  .map(x=>({commandId:x.commandId,action:x.action,
   inputChanges:x.delta.inventory||[],
   learned:x.delta.knowledge?.learnedMethods||[]}));
 assert.deepEqual(copy(terminal(fresh)),copy(terminal(a.s)));
 assert.equal(fresh.receipts.filter(x=>x.delta?.knowledge?.learnedMethods?.includes('flask')).length,1);
});
