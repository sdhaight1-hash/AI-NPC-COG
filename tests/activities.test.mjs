import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function create(){
 const c=vm.createContext({});
 const names=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','projects','world-runtime','simulation','persistence'];
 vm.runInContext(names.map(n=>readFileSync(new URL('../public/'+n+'.js',import.meta.url),'utf8')).join('\n'),c);
 const state=c.Simulation.initial(379210);
 state.auto=false;
 const n=state.npcs[0];
 n.energy=100;n.inventory.wood=2;n.inventory.stone=1;
 n.inventory.water=2;n.knowledge.recipes.push('campfire');
 return {c,state,n};
}
function steps(c,s,count){
 for(let i=0;i<count;i++)c.Simulation.advance(s,1);
}
test('20-minute physical job interrupted after nine minutes resumes remaining eleven',()=>{
 const {c,state:s,n}=create();
 assert.equal(c.WorldRuntime.begin(s,n,'build_fire'),true);
 const commandId=n.task.commandId;
 steps(c,s,9);
 assert.equal(n.currentActivity.workDone,9);
 n.needs.thirst=96;n.bio.hydrationBudgetMl=100;
 assert.equal(c.WorldRuntime.survival(s,n),true);
 assert.equal(n.task.key,'drink');
 assert.equal(n.suspendedActivities.length,1);
 assert.equal(n.suspendedActivities[0].commandId,commandId);
 assert.equal(n.suspendedActivities[0].workDone,9);
 steps(c,s,1);
 assert.equal(c.WorldRuntime.begin(s,n,'build_fire','resume'),true);
 assert.equal(n.task.commandId,commandId,'Resumed work keeps the same command identity');
 assert.equal(n.task.readyAt-s.clock,11);
 steps(c,s,10);
 assert.equal(s.world.structures.some(x=>x.type==='campfire'),false);
 steps(c,s,1);
 assert.equal(s.world.structures.filter(x=>x.type==='campfire').length,1);
 assert.equal(n.currentActivity,null);
 assert.equal(n.lastActivity.workDone,20);
 assert.ok(s.receipts.some(r=>r.commandId===commandId&&r.status==='INTERRUPTED'));
 assert.ok(s.receipts.some(r=>r.commandId===commandId&&r.status==='RESUMED'));
 assert.equal(s.receipts.filter(r=>r.commandId===commandId&&r.status==='COMPLETED').length,1);
});
test('checkpoint while interrupted preserves work and reaches identical final world',()=>{
 const a=create(),b=create();
 for(const v of [a,b]){
  cStart(v);
 }
 function cStart(v){
  assert.equal(v.c.WorldRuntime.begin(v.state,v.n,'build_fire'),true);
  steps(v.c,v.state,9);
  v.n.needs.thirst=96;v.n.bio.hydrationBudgetMl=100;
  assert.equal(v.c.WorldRuntime.survival(v.state,v.n),true);
 }
 const pack=JSON.parse(JSON.stringify(b.c.Persistence.save(b.state)));
 const fresh=b.c.Simulation.initial(379210);fresh.auto=false;
 assert.equal(b.c.Persistence.restore(fresh,pack),true);
 const resumed=fresh.npcs.find(x=>x.id===b.n.id);
 assert.equal(resumed.suspendedActivities[0].workDone,9);
 for(const v of [{c:a.c,state:a.state,n:a.n},{c:b.c,state:fresh,n:resumed}]){
  steps(v.c,v.state,1);
  assert.equal(v.c.WorldRuntime.begin(v.state,v.n,'build_fire','resume'),true);
  steps(v.c,v.state,11);
 }
 assert.equal(a.c.Simulation.canonical(a.c.Persistence.save(a.state)),
  b.c.Simulation.canonical(b.c.Persistence.save(fresh)));
 assert.equal(fresh.world.structures.filter(x=>x.type==='campfire').length,1);
});
test('completed activity cannot be finished again or produce a duplicate structure',()=>{
 const {c,state:s,n}=create();
 c.WorldRuntime.begin(s,n,'build_fire');
 steps(c,s,20);
 const before=s.world.structures.length,seq=s.receiptSeq;
 assert.equal(c.Activities.finish(s,n,true),null);
 assert.equal(s.world.structures.length,before);
 assert.equal(s.receiptSeq,seq);
});
test('legacy version-3 actor without lifecycle fields still restores a timed task',()=>{
 const {c,state:s,n}=create();
 c.WorldRuntime.begin(s,n,'build_fire');
 const pack=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 delete pack.npcs[0].currentActivity;
 delete pack.npcs[0].suspendedActivities;
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,pack),true);
 const m=restored.npcs[0];
 assert.equal(m.task.key,'build_fire');
 steps(c,restored,20);
 assert.equal(restored.world.structures.filter(x=>x.type==='campfire').length,1);
});
