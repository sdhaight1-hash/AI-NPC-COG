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
 const [builder,helper]=s.npcs;s.npcs=[builder,helper];
 const near=k.Frontier.neighbors(s.world,builder).find(x=>x.z===0&&
  k.Frontier.traversable(s.world,x.x,x.y,x.z));
 assert.ok(near);
 Object.assign(helper,{x:builder.x,y:builder.y,z:0,energy:100});
 for(const n of [builder,helper]){
  n.needs.hunger=10;n.needs.thirst=10;n.energy=100;
  n.bio.hydrationBudgetMl=2800;n.path=[];n.plan=null;n.task=null;
 }
 builder.knowledge.recipes.push('shelter');
 builder.inventory.wood=1;
 const floor=k.Construction.plan(s.world,'floor',
  {x:builder.x,y:builder.y,z:0},builder.id);
 assert.ok(floor);
 assert.equal(k.WorldRuntime.begin(s,builder,'build_tile'),true);
 k.Simulation.advance(s,18);
 assert.equal(s.world.construction.tiles.length,1);
 const wall=k.Construction.plan(s.world,'wall',near,builder.id);
 assert.ok(wall);
 builder.project=k.Projects.create(s,builder,'home');
 assert.equal(builder.project?.kind,'home');
 builder.project.homeSite={x:floor.x,y:floor.y,z:floor.z};
 builder.project.status='BLOCKED';builder.project.nextAt=s.clock+90;
 builder.inventory.wood=0;
 return {k,s,builder,helper,wall};
}

test('no private construction plan can induce a donation absent witnessed physical building work',()=>{
 const {k,s,builder,helper}=setup();
 helper.inventory.wood=1;
 assert.ok(k.WorldRuntime.available(s,helper).some(o=>
  o.key==='give_wood'&&o.ref===builder.id));
 const floor=s.world.construction.tiles.splice(0,1)[0];
 assert.equal(k.WorldRuntime.available(s,helper).some(o=>o.key==='give_wood'),false,
  'A private blueprint and unseen household goal cannot leak as donation affordance');
 s.world.construction.tiles.push(floor);
 builder.project=null;
 assert.equal(k.WorldRuntime.available(s,helper).some(o=>o.key==='give_wood'),false,
  'A completed unrelated building is not permission to transfer into a private plan');
});

test('donor voluntarily spends one timed wood lot; builder receives it and builds one tile',()=>{
 const {k,s,builder,helper,wall}=setup();
 helper.inventory.wood=1;
 assert.equal(k.WorldRuntime.begin(s,helper,'give_wood','offline routine'),true);
 const command=helper.task.commandId;
 assert.ok(k.Reservations.active(s).some(x=>
  x.commandId===command&&x.type==='npc'&&x.id===helper.id&&
  x.kind==='wood'&&x.quantity===1));
 k.Simulation.advance(s,1);
 assert.equal(helper.inventory.wood,1,'No early gifts or material consumption');
 assert.equal(builder.inventory.wood,0);
 k.Simulation.advance(s,1);
 assert.equal(helper.inventory.wood,0);
 assert.equal(builder.inventory.wood,1);
 const gift=s.receipts.find(r=>r.commandId===command&&r.status==='COMPLETED');
 assert.ok(gift);
 assert.ok(gift.delta.inventory.some(d=>d.key==='wood'&&d.delta===-1));
 assert.ok(gift.delta.otherActors.some(a=>a.actorId===builder.id&&
  a.inventory.some(d=>d.key==='wood'&&d.delta===1)));
 assert.equal(k.Reservations.active(s).some(r=>r.commandId===command),false);
 assert.equal(k.WorldRuntime.begin(s,builder,'build_tile'),true);
 const builtCommand=builder.task.commandId;
 assert.equal(builder.task.ref,wall.id);
 k.Simulation.advance(s,18);
 assert.equal(builder.inventory.wood,0);
 assert.equal(s.world.construction.tiles.length,2);
 assert.equal(s.world.construction.tiles.find(t=>t.blueprintId===wall.id)?.commandId,
  builtCommand);
 assert.ok(s.receipts.some(r=>r.commandId===builtCommand&&
  r.status==='COMPLETED'&&r.delta.inventory.some(d=>
   d.key==='wood'&&d.delta===-1)));
 assert.equal(helper.inventory.wood+builder.inventory.wood,0,
  'The transferred and built unit is not copied or refunded');
});

test('pending donation and its private material reservation replay from a v3 checkpoint',()=>{
 const a=setup(),b=setup();
 for(const run of [a,b]){
  run.helper.inventory.fiber=1;
  assert.equal(run.k.WorldRuntime.begin(run.s,run.helper,'give_fiber'),true);
  run.k.Simulation.advance(run.s,1);
  assert.ok(run.helper.task);
  assert.equal(run.helper.currentActivity.workDone,1);
  assert.equal(run.builder.inventory.fiber,0);
 }
 const saved=copy(b.k.Persistence.save(b.s));
 const fresh=b.k.Simulation.initial(379210);fresh.auto=false;
 assert.equal(b.k.Persistence.restore(fresh,saved),true);
 const builder=fresh.npcs.find(x=>x.id===b.builder.id);
 const helper=fresh.npcs.find(x=>x.id===b.helper.id);
 assert.ok(helper?.task&&helper.currentActivity);
 assert.equal(b.k.Reservations.active(fresh).filter(r=>
  r.commandId===helper.task.commandId).length,1);
 a.k.Simulation.advance(a.s,1);
 b.k.Simulation.advance(fresh,1);
 assert.equal(builder.inventory.fiber,1);
 assert.equal(helper.inventory.fiber,0);
 assert.equal(a.builder.inventory.fiber,1);
 assert.equal(a.helper.inventory.fiber,0);
 assert.deepEqual(copy(fresh.world.construction.tiles),copy(a.s.world.construction.tiles));
 assert.equal(fresh.receipts.filter(r=>r.action==='give_fiber'&&
  r.status==='COMPLETED').length,1);
 assert.equal(b.k.Reservations.active(fresh).length,0);
});

test('a visible old floor cannot expose a different home project or authorize an in-flight gift',()=>{
 const {k,s,builder,helper}=setup();
 helper.inventory.wood=1;
 assert.equal(k.WorldRuntime.begin(s,helper,'give_wood'),true);
 const command=helper.task.commandId,site=builder.project.homeSite;
 builder.project.homeSite={...site,x:(site.x+15)%s.world.width};
 assert.equal(k.WorldRuntime.available(s,helper).some(x=>x.key==='give_wood'),false);
 k.Simulation.advance(s,2);
 assert.equal(helper.inventory.wood,1);
 assert.equal(builder.inventory.wood,0);
 assert.ok(s.receipts.some(r=>r.commandId===command&&r.status==='FAILED'));
 assert.equal(k.Reservations.active(s).some(x=>x.commandId===command),false);
});

test('an idle resident can choose a physical gift through normal offline deliberation',()=>{
 const {k,s,builder,helper}=setup();
 Object.assign(helper.inventory,{wood:4,stone:2,food:3});
 assert.equal(k.Biology.addForaged(helper.bio,'nuts',3),true);
 helper.personality='expressive';
 helper.needs.social=78;
 builder.needs.social=20;
 helper.thoughtAt=s.clock;
 s.auto=true;
 const run=()=>k.WorldRuntime.scheduleOffline(s,{}, {projects:false});
 run();
 assert.equal(helper.task?.key,'give_wood');
 assert.equal(helper.source,'offline routine');
 k.Simulation.advance(s,2,{schedule:run});
 assert.equal(builder.inventory.wood,1);
 assert.equal(helper.inventory.wood,3);
 assert.ok(s.receipts.some(r=>r.action==='give_wood'&&r.status==='COMPLETED'&&
  r.actorId===helper.id&&r.targetId===builder.id));
});
