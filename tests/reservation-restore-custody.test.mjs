import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const k=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];n.energy=100;n.inventory.wood=2;n.inventory.stone=1;
 n.knowledge.recipes.push('campfire');
 assert.equal(k.WorldRuntime.begin(s,n,'build_fire'),true);
 assert.equal(k.Reservations.active(s).length,2);
 return {k,s,n};
}
function restore(k,saved){
 const fresh=k.Simulation.initial(379210);fresh.auto=false;
 assert.equal(k.Persistence.restore(fresh,copy(saved)),true);
 return fresh;
}
test('valid active claims survive but forged live-looking and orphaned claim tokens do not',()=>{
 const {k,s,n}=setup(),saved=copy(k.Persistence.save(s));
 const original=copy(saved.reservations),task=saved.npcs[0].task;
 assert.equal(original.length,2);
 assert.equal(task.reservationIds.length,2);
 saved.reservations.push({
  ...original[0],commandId:'cmd_990',idTag:'res_991',
  actorId:n.id,quantity:1
 },{
  ...original[1],idTag:'res_992',quantity:1
 },{
  ...original[1],idTag:original[0].idTag,quantity:1
 });
 const fresh=restore(k,saved),claims=k.Reservations.active(fresh);
 assert.equal(claims.length,2,'Only tokens owned by the live task are valid');
 assert.deepEqual(copy(claims.map(x=>x.idTag)),copy(original.map(x=>x.idTag)));
 assert.ok(claims.every(x=>x.commandId===task.commandId));
 assert.equal(fresh.npcs[0].inventory.wood,2);
 assert.equal(fresh.npcs[0].inventory.stone,1);
 k.Simulation.advance(fresh,20);
 assert.equal(fresh.world.structures.filter(x=>x.type==='campfire').length,1);
 assert.equal(fresh.npcs[0].inventory.wood,0);
 assert.equal(k.Reservations.active(fresh).length,0);
});
test('a saved claim without its owning task or suspended activity never survives',()=>{
 const {k,s,n}=setup(),saved=copy(k.Persistence.save(s));
 saved.npcs[0].task=null;saved.npcs[0].currentActivity=null;
 const loaded=restore(k,saved);
 assert.equal(k.Reservations.active(loaded).length,0);
 assert.equal(loaded.npcs[0].inventory.wood,2);
 assert.equal(loaded.npcs[0].inventory.stone,1);
});
test('an interrupted legitimate building activity retains its exclusive materials and exact resume',()=>{
 const {k,s,n}=setup();
 k.Simulation.advance(s,9);
 assert.equal(n.currentActivity.workDone,9);
 assert.ok(k.Activities.interrupt(s,n,'CRITICAL_NEED'));
 n.task=null;n.action='none';n.path=[];
 const saved=copy(k.Persistence.save(s));
 const loaded=restore(k,saved),actor=loaded.npcs.find(x=>x.id===n.id);
 assert.equal(actor.suspendedActivities.length,1);
 assert.equal(actor.suspendedActivities[0].workDone,9);
 assert.equal(k.Reservations.active(loaded).length,2);
 assert.equal(k.WorldRuntime.begin(loaded,actor,'build_fire','resume'),true);
 assert.equal(actor.task.commandId,n.suspendedActivities[0].commandId);
 k.Simulation.advance(loaded,11);
 assert.equal(loaded.world.structures.filter(x=>x.type==='campfire').length,1);
 assert.equal(k.Reservations.active(loaded).length,0);
 assert.equal(actor.inventory.wood,0);
 assert.equal(actor.inventory.stone,0);
 assert.equal(loaded.receipts.filter(r=>r.action==='build_fire'&&r.status==='COMPLETED').length,1);
});
test('a valid claim token cannot be redirected to a physically stocked foreign target',()=>{
 const {k,s}=setup(),saved=copy(k.Persistence.save(s));
 const node=s.world.nodes.find(x=>x.kind==='wood'&&x.stock>=2);
 assert.ok(node);
 saved.reservations[0].type='node';
 saved.reservations[0].id=node.id;
 saved.reservations[0].kind='wood';
 const fresh=restore(k,saved);
 assert.equal(k.Reservations.active(fresh).length,1,
  'A command with no source ref cannot suddenly reserve a foreign node');
 assert.equal(k.Reservations.physical(fresh,{type:'node',id:node.id,kind:'wood'}),node.stock);
});
