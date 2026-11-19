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

test('old inspected water location guides a real return trip outside visual range',()=>{
 const {c,s,n}=setup();
 s.npcs=[n];n.energy=100;
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>0);
 assert.ok(spring);
 s.world.nodes=[spring];
 n.x=spring.x;n.y=spring.y;n.z=0;n.path=[];
 const inspect=c.WorldRuntime.available(s,n).find(x=>x.key==='inspect');
 assert.equal(inspect?.ref,spring.id);
 assert.equal(c.WorldRuntime.begin(s,n,'inspect'),true);
 c.Simulation.advance(s,2);
 assert.equal(n.evidenceMemory.episodes[0].type,'inspection');
 // Choose a real reachable location beyond the night vision radius.
 const point=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0})).find(p=>{
   const d=c.Frontier.distance(s.world,p,spring);
   return d>=5&&d<=8&&c.Frontier.traversable(s.world,p.x,p.y,0)&&
    c.WorldRuntime.pathfind(s,spring,p).length>0;
 });
 assert.ok(point);
 n.x=point.x;n.y=point.y;n.path=[];n.travel=null;
 s.clock=23*60;s.world.now=s.clock;
 assert.equal(c.Perception.canSee(s,n,spring),false);
 const recalled=c.EvidenceMemory.recall(n,'water source',s.clock,1);
 assert.equal(recalled[0].ref,spring.id);
 const option=c.WorldRuntime.available(s,n).find(x=>
  x.key==='fill_water'&&x.ref===spring.id);
 assert.ok(option,'Previously inspected source should be available as a remembered goal');
 assert.equal(option.when.includes(String(spring.stock)+' remaining'),false);
 n.inventory.water=0;
 const stock=spring.stock;
 assert.equal(c.WorldRuntime.begin(s,n,'fill_water','memory'),true);
 let completed=false;
 for(let i=0;i<40;i++){
  c.Simulation.advance(s,1);
  if(s.receipts.some(r=>r.action==='fill_water'&&r.status==='COMPLETED')){
   completed=true;break;
  }
 }
 assert.equal(completed,true);
 assert.ok(spring.stock<stock);
 assert.ok(n.inventory.water>0);
});

test('cited hearsay leads to physical travel, finite gathering, then firsthand verification',()=>{
 const {c,s,n}=setup();
 const listener=s.npcs[1];
 s.npcs=[n,listener];s.auto=false;
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>0);
 assert.ok(spring);
 s.world.nodes=[spring];
 for(const a of [n,listener]){
  a.x=spring.x;a.y=spring.y;a.z=0;a.path=[];a.travel=null;
  a.energy=100;
 }
 assert.equal(c.WorldRuntime.begin(s,n,'inspect','test'),true);
 c.Simulation.advance(s,2);
 const observation=n.evidenceMemory.episodes.find(e=>
  e.type==='inspection'&&e.ref===spring.id);
 assert.ok(observation);
 n.task={key:'socialize',ref:listener.id,approved:true,
  commandId:'cmd_'+(++s.commandSeq)};
 const spoken=c.WorldReceipts.execute(s,n,n.task,()=>
  c.AgentWorld.complete(n,s.world,s.npcs));
 assert.equal(spoken.ok,true);
 n.task=null;
 const words='The spring is at [source:'+spring.id+']';
 c.EvidenceMemory.fromDialogue(s,n,listener,spoken.receipt,words,'I will investigate.');
 assert.equal(listener.evidenceMemory.claims.length,1);
 assert.equal(listener.evidenceMemory.facts.length,0);
 const point=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0})).find(p=>{
   const d=c.Frontier.distance(s.world,p,spring);
   return d>=5&&d<=8&&c.Frontier.traversable(s.world,p.x,p.y,0)&&
    c.WorldRuntime.pathfind(s,spring,p).length>0;
 });
 assert.ok(point);
 listener.x=point.x;listener.y=point.y;listener.path=[];listener.travel=null;
 // The speaker must leave the destination clear: NPC collisions are real.
 const away=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0})).find(p=>
   c.Frontier.distance(s.world,p,spring)>20&&
   c.Frontier.traversable(s.world,p.x,p.y,0));
 assert.ok(away);
 n.x=away.x;n.y=away.y;n.path=[];n.travel=null;
 s.clock=23*60;s.world.now=s.clock;
 assert.equal(c.Perception.canSee(s,listener,spring),false);
 const option=c.WorldRuntime.available(s,listener).find(x=>
  x.key==='fill_water'&&x.ref===spring.id);
 assert.ok(option,'A cited source should motivate a real verification journey');
 assert.match(option.when,/unverified/);
 assert.equal(option.when.includes(String(spring.stock)+' remaining'),false);
 listener.inventory.water=0;
 const before=spring.stock;
 assert.equal(c.WorldRuntime.begin(s,listener,'fill_water','reported claim'),true);
 let gathered=false;
 for(let i=0;i<45;i++){
  c.Simulation.advance(s,1);
  if(s.receipts.some(r=>r.actorId===listener.id&&r.action==='fill_water'&&
   r.status==='COMPLETED')){gathered=true;break;}
 }
 assert.equal(gathered,true);
 assert.ok(listener.inventory.water>0&&spring.stock<before);
 assert.equal(listener.evidenceMemory.claims[0].status,'unverified',
  'Successful gathering does not silently rewrite hearsay as an inspected fact');
 assert.equal(c.WorldRuntime.begin(s,listener,'inspect','verify'),true);
 c.Simulation.advance(s,2);
 assert.equal(listener.evidenceMemory.claims[0].status,'supported');
 assert.ok(listener.evidenceMemory.claims[0].verificationReceiptId);
});

test('depleted reported source produces one stale claim and stops futile return attempts',()=>{
 const {c,s,n}=setup();
 const listener=s.npcs[1];s.npcs=[n,listener];s.auto=false;
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>0);
 assert.ok(spring);s.world.nodes=[spring];
 n.x=spring.x;n.y=spring.y;listener.x=spring.x;listener.y=spring.y;
 n.z=0;listener.z=0;n.path=[];listener.path=[];
 assert.equal(c.WorldRuntime.begin(s,n,'inspect','test'),true);
 c.Simulation.advance(s,2);
 n.task={key:'socialize',ref:listener.id,approved:true,
  commandId:'cmd_'+(++s.commandSeq)};
 const spoken=c.WorldReceipts.execute(s,n,n.task,()=>
  c.AgentWorld.complete(n,s.world,s.npcs));
 assert.equal(spoken.ok,true);n.task=null;
 c.EvidenceMemory.fromDialogue(s,n,listener,spoken.receipt,
  'Check this place [source:'+spring.id+']','I will.');
 assert.equal(listener.evidenceMemory.claims[0].status,'unverified');
 // The original witness moves away; depletion does not mean the old witness lied.
 const away=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0})).find(p=>
   c.Frontier.distance(s.world,p,spring)>20&&
   c.Frontier.traversable(s.world,p.x,p.y,0));
 assert.ok(away);n.x=away.x;n.y=away.y;
 spring.stock=1;spring.regrow=0;
 listener.inventory.water=0;listener.energy=100;
 assert.equal(c.WorldRuntime.begin(s,listener,'fill_water','reported claim'),true);
 // The claim was actionable when work began; the finite source is emptied
 // before commitment by competing consumption or environmental depletion.
 spring.stock=0;
 for(let i=0;i<15&&listener.task;i++)c.Simulation.advance(s,1);
 const failure=s.receipts.find(r=>r.actorId===listener.id&&
  r.action==='fill_water'&&r.status==='FAILED');
 assert.ok(failure,'Physical depletion must yield a failed world receipt');
 const claim=listener.evidenceMemory.claims[0];
 assert.equal(claim.status,'stale');
 assert.equal(claim.failureReceiptId,failure.id);
 assert.equal(listener.evidenceMemory.facts.length,0);
 assert.equal(n.evidenceMemory.claims.length,0);
 assert.equal(c.EvidenceMemory.fromFailedReceipt(s,listener,failure),0);
 assert.equal(c.WorldRuntime.available(s,listener).some(x=>
  x.ref===spring.id&&x.key==='fill_water'),false,
  'A stale rumor should not trigger another reported-source journey');
 const copy=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,copy),true);
 const saved=restored.npcs.find(x=>x.id===listener.id).evidenceMemory.claims[0];
 assert.equal(saved.status,'stale');
 assert.equal(saved.failureReceiptId,failure.id);
 // Replenishment and an actual inspection provide fresh firsthand evidence.
 spring.stock=3;
 assert.equal(c.WorldRuntime.begin(s,listener,'inspect','verify'),true);
 c.Simulation.advance(s,2);
 assert.equal(listener.evidenceMemory.claims[0].status,'supported');
 assert.ok(listener.evidenceMemory.claims[0].verificationReceiptId);
});
