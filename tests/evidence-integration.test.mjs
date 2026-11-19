import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 const modules=['frontier','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'];
 for(const name of modules)
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 return {c,s,n:s.npcs[0]};
}
test('executed drink creates one actor-private witnessed event without minting water',()=>{
 const {c,s,n}=setup();
 n.inventory.water=2;n.needs.thirst=80;
 assert.equal(c.WorldRuntime.begin(s,n,'drink'),true);
 c.Simulation.advance(s,1);
 assert.equal(n.inventory.water,1);
 const completed=s.receipts.find(r=>r.action==='drink'&&r.status==='COMPLETED');
 assert.ok(completed);
 const records=c.EvidenceMemory.state(n).episodes;
 assert.equal(records.length,1);
 assert.equal(records[0].receiptId,completed.id);
 assert.equal(records[0].certainty,'observed');
 assert.equal(s.npcs[1].evidenceMemory.episodes.length,0);
 assert.equal(c.EvidenceMemory.fromReceipt(s,n,completed),null);
 assert.equal(records.length,1);
});
test('real checkpoint with completed physical evidence matches uninterrupted world',()=>{
 const a=setup(),b=setup();
 for(const run of [a,b]){
  run.n.inventory.water=2;run.n.needs.thirst=80;
  assert.equal(run.c.WorldRuntime.begin(run.s,run.n,'drink'),true);
  run.c.Simulation.advance(run.s,1);
 }
 const checkpoint=JSON.parse(JSON.stringify(b.c.Persistence.save(b.s)));
 const fresh=b.c.Simulation.initial(379210);fresh.auto=false;
 assert.equal(b.c.Persistence.restore(fresh,checkpoint),true);
 assert.equal(a.c.Simulation.canonical(a.c.Persistence.save(a.s)),
  b.c.Simulation.canonical(b.c.Persistence.save(fresh)));
 const saved=fresh.npcs.find(n=>n.id===b.n.id);
 assert.equal(saved.evidenceMemory.episodes.length,1);
 assert.equal(saved.evidenceMemory.episodes[0].certainty,'observed');
});
