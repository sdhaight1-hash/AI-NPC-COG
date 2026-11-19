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
