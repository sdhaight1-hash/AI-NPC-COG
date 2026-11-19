import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 const names=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','world-runtime',
  'simulation','persistence'];
 vm.runInContext(names.map(name=>readFileSync(
  new URL('../public/'+name+'.js',import.meta.url),'utf8')).join('\n'),c);
 const state=c.Simulation.initial(379210);
 state.auto=false;
 return {c,state,n:state.npcs[0],other:state.npcs[1]};
}
const copy=x=>JSON.parse(JSON.stringify(x));
test('two actors cannot overclaim a finite two-plank lot',()=>{
 const {c,state,n,other}=setup();
 state.world.structures.push({id:'crate_test',type:'crate',
  x:n.x,y:n.y,contents:{plank:2},capacity:16});
 const lot={type:'structure',id:'crate_test',kind:'plank',quantity:2};
 const first=c.Reservations.claim(state,n.id,'cmd_10',[lot]);
 assert.equal(first.ok,true);
 const repeat=c.Reservations.claim(state,n.id,'cmd_10',[lot]);
 assert.equal(repeat.ok,true);
 assert.equal(repeat.existing,true);
 assert.equal(c.Reservations.active(state).length,1);
 const second=c.Reservations.claim(state,other.id,'cmd_11',[{...lot,quantity:1}]);
 assert.equal(second.ok,false);
 assert.equal(second.reason,'RESERVATION_CONFLICT');
 assert.equal(c.Reservations.physical(state,lot),2);
 assert.equal(c.Reservations.available(state,lot),0);
 assert.equal(c.Reservations.releaseCommand(state,'cmd_10'),1);
 assert.equal(c.Reservations.releaseCommand(state,'cmd_10'),0);
 assert.equal(c.Reservations.claim(state,other.id,'cmd_11',[lot]).ok,true);
 assert.equal(c.Reservations.physical(state,lot),2);
});
test('atomic multi-material claims never partially reserve on failure',()=>{
 const {c,state,n}=setup();
 n.inventory.wood=3;n.inventory.stone=0;
 const result=c.Reservations.claim(state,n.id,'cmd_20',[
  {type:'npc',id:n.id,kind:'wood',quantity:3},
  {type:'npc',id:n.id,kind:'stone',quantity:1}
 ]);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'RESERVATION_CONFLICT');
 assert.equal(c.Reservations.active(state).length,0);
 assert.equal(n.inventory.wood,3);
});
test('two founders competing for same finite deposit cannot double gather',()=>{
 const {c,state,n,other}=setup();
 const node=state.world.nodes.find(x=>x.kind==='wood'&&x.stock>=2);
 assert.ok(node);
 node.stock=2;
 for(const actor of [n,other]){
  actor.x=node.x;actor.y=node.y;actor.z=0;actor.energy=100;
  actor.task=null;actor.path=[];actor.plan=null;
 }
 assert.equal(c.WorldRuntime.begin(state,n,'collect_wood'),true);
 assert.equal(c.WorldRuntime.begin(state,other,'collect_wood'),false);
 assert.equal(state.world.nodes.find(x=>x.id===node.id).stock,2);
 for(let i=0;i<5;i++)c.Simulation.advance(state,1);
 const received=n.inventory.wood+other.inventory.wood;
 assert.equal(received,2);
 assert.equal(node.stock,0);
 assert.equal(c.Reservations.active(state).length,0);
 assert.equal(state.receipts.filter(r=>r.status==='COMPLETED'&&
  r.action==='collect_wood').length,1);
});
test('save/reload maintains pending reservations without minting supplies',()=>{
 const {c,state,n}=setup();
 n.inventory.wood=2;n.inventory.stone=1;n.energy=100;
 n.knowledge.recipes.push('campfire');
 assert.equal(c.WorldRuntime.begin(state,n,'build_fire'),true);
 const commandId=n.task.commandId;
 const before=c.Reservations.active(state);
 assert.equal(before.length,2);
 const packet=copy(c.Persistence.save(state));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,packet),true);
 const m=restored.npcs.find(x=>x.id===n.id);
 assert.equal(m.task.commandId,commandId);
 assert.equal(c.Reservations.active(restored).length,2);
 for(let i=0;i<20;i++){
  c.Simulation.advance(state,1);
  c.Simulation.advance(restored,1);
 }
 assert.equal(c.Simulation.canonical(c.Persistence.save(restored)),
  c.Simulation.canonical(c.Persistence.save(state)));
 assert.equal(restored.world.structures.filter(x=>x.type==='campfire').length,1);
 assert.equal(restored.npcs.find(x=>x.id===n.id).inventory.wood,0);
});
test('abandoned claims expire and actor death clears them',()=>{
 const {c,state,n,other}=setup();
 n.inventory.wood=1;other.inventory.stone=1;
 assert.equal(c.Reservations.claim(state,n.id,'cmd_30',[
  {type:'npc',id:n.id,kind:'wood',quantity:1}],3).ok,true);
 assert.equal(c.Reservations.claim(state,other.id,'cmd_31',[
  {type:'npc',id:other.id,kind:'stone',quantity:1}],180).ok,true);
 for(let i=0;i<3;i++)c.Simulation.advance(state,1);
 assert.equal(c.Reservations.active(state).some(x=>x.actorId===n.id),false);
 assert.equal(c.Reservations.releaseActor(state,other.id),1);
 assert.equal(c.Reservations.active(state).length,0);
 assert.equal(n.inventory.wood,1);
 assert.equal(other.inventory.stone,1);
});
test('physical crate hauling is a real timed inventory/structure transfer',()=>{
 const {c,state,n}=setup();
 n.energy=100;n.inventory.wood=1;
 state.world.structures.push({id:'crate_h',type:'crate',x:n.x,y:n.y,
  capacity:10,contents:{wood:0,stone:0,fiber:0}});
 assert.equal(c.WorldRuntime.begin(state,n,'stash_wood'),true);
 c.Simulation.advance(state,1);
 assert.equal(n.inventory.wood,1,'no early transfer');
 c.Simulation.advance(state,1);
 assert.equal(n.inventory.wood,0);
 assert.equal(state.world.structures.at(-1).contents.wood,1);
 assert.equal(c.WorldRuntime.begin(state,n,'withdraw_wood'),true);
 c.Simulation.advance(state,2);
 assert.equal(n.inventory.wood,1);
 assert.equal(state.world.structures.at(-1).contents.wood,0);
 assert.equal(c.Reservations.active(state).length,0);
});
