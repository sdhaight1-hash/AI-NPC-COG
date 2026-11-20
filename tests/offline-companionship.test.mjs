import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',
   import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const [a,b]=s.npcs;
 s.npcs=[a,b];
 b.x=a.x;b.y=a.y;b.z=a.z;
 a.needs.social=90;b.needs.social=90;
 a.energy=95;b.energy=95;
 a.path=[];b.path=[];a.task=null;b.task=null;
 return {c,s,a,b};
}
test('offline companionship spends physical time, changes both needs once and invents no dialogue',()=>{
 const {c,s,a,b}=setup();
 assert.equal(c.WorldRuntime.begin(s,a,'socialize','offline routine'),true);
 assert.equal(b.peerReservedFor,a.id);
 assert.equal(a.task.key,'socialize');
 const beforeA=a.needs.social,beforeB=b.needs.social;
 c.Simulation.advance(s,2);
 assert.ok(a.task,'No early companionship completion');
 assert.equal(s.receipts.filter(r=>r.action==='socialize'&&r.status==='COMPLETED').length,0);
 c.Simulation.advance(s,1);
 const completed=s.receipts.filter(r=>r.action==='socialize'&&r.status==='COMPLETED');
 assert.equal(completed.length,1);
 assert.equal(completed[0].targetId,b.id);
 assert.ok(a.needs.social<beforeA&&b.needs.social<beforeB);
 assert.ok(completed[0].delta.otherActors?.some(x=>x.actorId===b.id));
 assert.equal(a.task,null);
 assert.equal(b.peerReservedFor,undefined);
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(b.relationships[a.id],undefined);
 assert.equal(c.EvidenceMemory.state(a).episodes.some(e=>
  e.type==='interaction'&&e.utterances),false);
 assert.equal(c.WorldReceipts.execute(s,a,{key:'socialize',
  ref:b.id,commandId:completed[0].commandId},()=>({ok:true})).duplicate,true);
 assert.equal(s.receipts.filter(r=>r.action==='socialize'&&r.status==='COMPLETED').length,1);
});
test('unwilling partner cannot be committed to offline companionship',()=>{
 const {c,s,a,b}=setup();
 b.needs.social=3;
 const socialBefore=a.needs.social,peerBefore=b.needs.social;
 assert.equal(c.WorldRuntime.begin(s,a,'socialize','offline routine'),false);
 assert.equal(a.task,null);
 assert.equal(b.peerReservedFor,undefined);
 assert.equal(a.needs.social,socialBefore);
 assert.equal(b.needs.social,peerBefore);
});
test('different levels cannot create companionship, even at matching coordinates',()=>{
 const {c,s,a,b}=setup();
 b.z=a.z-1;
 assert.equal(c.WorldRuntime.begin(s,a,'socialize','offline routine'),false);
 assert.equal(a.task,null);
 assert.equal(b.peerReservedFor,undefined);
});

test('an actual food transfer updates only the receiving resident and survives reload',()=>{
 const {c,s,a,b}=setup();
 a.inventory.food=1;
 const mood=b.mood;
 assert.equal(c.WorldRuntime.begin(s,a,'share_food','offline routine'),true);
 c.Simulation.advance(s,5);
 assert.equal(a.inventory.food,0);
 assert.equal(b.inventory.food,1);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(b.relationships[a.id].cooperation,1);
 assert.equal(b.mood,mood+2);
 const receipt=s.receipts.find(r=>r.action==='share_food'&&r.status==='COMPLETED');
 assert.equal(receipt.delta.otherActors.find(row=>row.actorId===b.id)
  .relationship.after.cooperation,1);
 const restored=c.Simulation.initial(379210);
 assert.equal(c.Persistence.restore(restored,JSON.parse(JSON.stringify(c.Persistence.save(s)))),true);
 const partner=restored.npcs.find(n=>n.id===b.id);
 assert.equal(partner.relationships[a.id].cooperation,1);
 assert.equal(partner.mood,mood+2);
});

test('visible material competition creates private tension once and can cool off',()=>{
 const {c,s,a,b}=setup();
 const wood=s.world.nodes.find(node=>node.kind==='wood'&&node.stock>=2);
 s.world.nodes=[wood];wood.stock=2;
 for(const n of [a,b])Object.assign(n,{x:wood.x,y:wood.y,z:wood.z||0});
 assert.equal(c.WorldRuntime.begin(s,a,'collect_wood'),true);
 const mood=b.mood;
 for(let i=0;i<3;i++)assert.equal(c.WorldRuntime.begin(s,b,'collect_wood'),false);
 assert.equal(b.relationships[a.id].tension,1);
 assert.equal(b.mood,mood-1);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(c.Agency.relationship(b,a.id,s.clock+360).tension,0);
 for(let i=0;i<2;i++){
  s.clock+=60;s.world.now=s.clock;
  assert.equal(c.WorldRuntime.begin(s,b,'collect_wood'),false);
 }
 c.Simulation.advance(s,1);
 assert.equal(b.relationships[a.id].tension,3);
 assert.equal(c.WorldRuntime.begin(s,a,'socialize','offline routine'),false);
 s.clock+=360;s.world.now=s.clock;
 assert.equal(c.WorldRuntime.begin(s,a,'socialize','offline routine'),true);
});

test('headless autonomous urgency initiates one bounded offline social activity',()=>{
 const {c,s,a,b}=setup();s.auto=true;
 a.thoughtAt=s.clock;b.thoughtAt=s.clock+200;
 c.WorldRuntime.scheduleOffline(s);
 assert.equal(a.task?.key,'socialize');
 assert.equal(a.source,'offline routine');
 assert.equal(b.peerReservedFor,a.id);
 for(let i=0;i<5;i++)c.Simulation.advance(s,1);
 assert.equal(s.receipts.filter(r=>r.action==='socialize'&&r.status==='COMPLETED').length,1);
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
});
test('mid-activity v3 checkpoint restores partner occupancy and exact final effect',()=>{
 const left=setup(),right=setup();
 for(const run of [left,right]){
  assert.equal(run.c.WorldRuntime.begin(run.s,run.a,'socialize','offline routine'),true);
  run.c.Simulation.advance(run.s,1);
 }
 const save=JSON.parse(JSON.stringify(right.c.Persistence.save(right.s)));
 const restored=right.c.Simulation.initial(379210);restored.auto=false;
 assert.equal(right.c.Persistence.restore(restored,save),true);
 const speaker=restored.npcs.find(n=>n.id===right.a.id);
 const partner=restored.npcs.find(n=>n.id===right.b.id);
 assert.equal(partner.peerReservedFor,speaker.id);
 assert.equal(speaker.currentActivity.workDone,right.a.currentActivity.workDone);
 left.c.Simulation.advance(left.s,2);
 right.c.Simulation.advance(restored,2);
 assert.equal(left.c.Simulation.canonical(left.c.Persistence.save(left.s)),
  right.c.Simulation.canonical(right.c.Persistence.save(restored)));
});
