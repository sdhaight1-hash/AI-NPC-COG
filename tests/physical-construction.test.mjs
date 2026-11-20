import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=v=>JSON.parse(JSON.stringify(v));
function setup(){
 const k=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];s.npcs=[n];n.energy=100;n.needs.thirst=10;
 n.needs.hunger=10;n.bio.hydrationBudgetMl=2400;
 n.knowledge.recipes.push('shelter');
 const neighbors=k.Frontier.neighbors(s.world,n)
  .filter(p=>p.z===(n.z||0));
 assert.ok(neighbors.length>=2,'Need walkable adjacent sites');
 return {k,s,n,sites:neighbors};
}
function build(k,s,n,b){
 assert.equal(k.WorldRuntime.available(s,n).some(o=>
  o.key==='build_tile'&&o.ref===b.id),true,'Must have a legal physical tile affordance');
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 assert.equal(n.task.key,'build_tile');
 assert.equal(n.task.ref,b.id);
 const command=n.task.commandId;
 assert.ok(k.Reservations.active(s).some(x=>
  x.commandId===command&&x.type==='blueprint'&&x.id===b.id));
 k.Simulation.advance(s,18);
 const receipt=s.receipts.find(r=>r.commandId===command&&r.status==='COMPLETED');
 assert.ok(receipt,'Each tile must have a committed authoritative receipt');
 return receipt;
}

test('a blueprint is not a house; a finite time-costed floor yields one exact tile receipt',()=>{
 const {k,s,n,sites}=setup(),p=sites[0];
 n.inventory.wood=1;
 const before=k.Simulation.canonical(s.world.construction);
 const b=k.Construction.plan(s.world,'floor',p,n.id);
 assert.ok(b);
 assert.notEqual(k.Simulation.canonical(s.world.construction),before);
 assert.equal(s.world.construction.tiles.length,0);
 assert.equal(k.Frontier.traversable(s.world,p.x,p.y,p.z),true);
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 assert.equal(n.inventory.wood,1,'Reservation does not prematurely consume goods');
 assert.equal(s.world.construction.tiles.length,0);
 const command=n.task.commandId;
 k.Simulation.advance(s,10);
 assert.equal(s.world.construction.tiles.length,0,'Unfinished floor is not a finished tile');
 assert.equal(n.inventory.wood,1);
 k.Simulation.advance(s,8);
 assert.equal(n.inventory.wood,0);
 assert.equal(s.world.construction.tiles.length,1);
 assert.equal(s.world.construction.blueprints.length,0);
 const tile=s.world.construction.tiles[0];
 assert.equal(tile.kind,'floor');
 assert.equal(tile.actorId,n.id);
 assert.equal(tile.blueprintId,b.id);
 assert.equal(tile.commandId,command);
 const receipt=s.receipts.find(x=>x.commandId===command&&x.status==='COMPLETED');
 assert.ok(receipt);
 assert.ok(receipt.delta.inventory.some(x=>x.key==='wood'&&x.delta===-1));
 assert.ok(receipt.delta.collections.constructionTiles.added.some(x=>x.id===tile.id));
 assert.equal(k.Reservations.active(s).filter(x=>x.commandId===command).length,0);
 k.WorldRuntime.complete(s,n);
 assert.equal(s.world.construction.tiles.length,1,'A completed command cannot duplicate a tile');
});

test('finished walls obstruct navigation; doors and floors remain passable',()=>{
 const {k,s,n,sites}=setup();n.inventory.wood=3;
 const wall=k.Construction.plan(s.world,'wall',sites[0],n.id);
 assert.ok(wall);
 assert.equal(k.Frontier.traversable(s.world,wall.x,wall.y,wall.z),true,
  'Planned wall is never collision');
 build(k,s,n,wall);
 assert.equal(k.Frontier.traversable(s.world,wall.x,wall.y,wall.z),false);
 assert.equal(k.WorldRuntime.pathfind(s,n,wall).length,0);
 assert.equal(k.WorldRuntime.reachability(s,n)(wall),false,
  'Pathfinding cache must be invalidated by building');
 const door=k.Construction.plan(s.world,'door',sites[1],n.id);
 assert.ok(door);
 build(k,s,n,door);
 assert.equal(k.Frontier.traversable(s.world,door.x,door.y,door.z),true,
  'An open door is a physical passage, not a wall');
 assert.ok(s.world.construction.tiles.some(t=>t.kind==='wall'));
 assert.ok(s.world.construction.tiles.some(t=>t.kind==='door'));
});

test('a roof needs completed physical support and actual thatch fiber',()=>{
 const {k,s,n,sites}=setup();n.inventory.wood=1;n.inventory.fiber=1;
 const location=sites[0];
 const wall=k.Construction.plan(s.world,'wall',location,n.id);
 const roof=k.Construction.plan(s.world,'roof',location,n.id);
 assert.ok(roof,'A roof blueprint may reference planned future wall support');
 assert.equal(k.Construction.canBuild(s.world,n,roof,s.npcs).reason,
  'PHYSICAL_ROOF_SUPPORT_MISSING');
 build(k,s,n,wall);
 assert.equal(s.world.construction.tiles.length,1);
 assert.equal(k.Construction.canBuild(s.world,n,roof,s.npcs).ok,true);
 const receipt=build(k,s,n,roof);
 assert.equal(n.inventory.fiber,0);
 assert.ok(receipt.delta.inventory.some(x=>x.key==='fiber'&&x.delta===-1));
 assert.equal(s.world.construction.tiles.length,2);
 assert.ok(s.world.construction.tiles.some(t=>t.kind==='roof'));
});

test('two workers cannot reserve the same planned tile or reuse committed inventory',()=>{
 const {k,s,n,sites}=setup();const p=sites[0];
 n.inventory.wood=1;
 const b=k.Construction.plan(s.world,'floor',p,n.id);
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 const rival=k.Reservations.claim(s,'person_2','cmd_900',
  [{type:'blueprint',id:b.id,kind:'tile',quantity:1}]);
 assert.equal(rival.ok,false);
 assert.equal(rival.reason,'RESERVATION_CONFLICT');
 k.Simulation.advance(s,18);
 assert.equal(n.inventory.wood,0);
 const retry=k.Reservations.claim(s,'person_2','cmd_901',
  [{type:'blueprint',id:b.id,kind:'tile',quantity:1}]);
 assert.equal(retry.ok,false,'A finished blueprint is no longer a physical lot');
 assert.equal(s.world.construction.tiles.length,1);
});

test('mid-tile checkpoint restores exact work and later validates the built tile receipt',()=>{
 const a=setup(),b=setup(),p=a.sites[0];
 for(const f of [a,b]){
  f.n.inventory.wood=1;
  assert.ok(f.k.Construction.plan(f.s.world,'floor',p,f.n.id));
  assert.equal(f.k.WorldRuntime.begin(f.s,f.n,'build_tile'),true);
  f.k.Simulation.advance(f.s,7);
  assert.ok(f.n.task&&f.n.currentActivity);
  assert.equal(f.s.world.construction.tiles.length,0);
 }
 const save=copy(b.k.Persistence.save(b.s));
 const restored=b.k.Simulation.initial(379210);restored.auto=false;
 assert.equal(b.k.Persistence.restore(restored,save),true);
 const actor=restored.npcs.find(x=>x.id===b.n.id);
 assert.equal(actor.currentActivity.workDone,b.n.currentActivity.workDone);
 assert.equal(actor.task.commandId,b.n.task.commandId);
 a.k.Simulation.advance(a.s,11);
 b.k.Simulation.advance(restored,11);
 assert.equal(a.s.world.construction.tiles.length,1);
 assert.equal(restored.world.construction.tiles.length,1);
 assert.equal(a.k.Simulation.canonical(a.s.world.construction),
  b.k.Simulation.canonical(restored.world.construction));
 assert.equal(actor.inventory.wood,0);
 assert.equal(restored.world.construction.tiles[0].commandId,actor.lastActivity.id.slice(4));
 const savedAgain=copy(b.k.Persistence.save(restored));
 const second=b.k.Simulation.initial(379210);second.auto=false;
 assert.equal(b.k.Persistence.restore(second,savedAgain),true);
 assert.equal(second.world.construction.tiles.length,1,
  'A validated receipt-backed built tile survives a second checkpoint');
 assert.equal(b.k.Simulation.canonical(second.world.construction),
  b.k.Simulation.canonical(restored.world.construction));
});

test('a forged finished tile or unearned roof cannot be loaded from a v3 save',()=>{
 const {k,s,n,sites}=setup(),p=sites[0];
 const b=k.Construction.plan(s.world,'wall',p,n.id);
 const untrusted=copy(k.Persistence.save(s));
 untrusted.world.construction.tiles.push({
  id:'tile_'+b.id.slice(3),blueprintId:b.id,kind:'wall',
  material:'wood',...p,actorId:n.id,builtAt:s.clock,
  commandId:'cmd_987',status:'BUILT'});
 const restored=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(restored,untrusted),true);
 assert.equal(restored.world.construction.tiles.length,0);
 assert.ok(restored.world.construction.blueprints.some(x=>x.id===b.id));
});
