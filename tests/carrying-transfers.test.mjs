import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const k=vm.createContext({});
 const names=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(names.map(n=>readFileSync(new URL('../public/'+n+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 return {k,s,n:s.npcs[0]};
}
const snapshot=x=>JSON.parse(JSON.stringify(x));

test('mass-limited gathering reserves and takes only what can be carried',()=>{
 const {k,s,n}=fixture(),node=s.world.nodes.find(v=>v.kind==='wood'&&v.stock>=4);
 assert.ok(node);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 n.inventory.stone=13; // Dense load leaves room for one wood but not two.
 assert.equal(k.AgentWorld.roomFor(n,'wood'),1);
 assert.equal(k.WorldRuntime.begin(s,n,'collect_wood'),true);
 const claims=k.Reservations.active(s).filter(x=>x.commandId===n.task.commandId);
 assert.equal(claims.length,1);
 assert.equal(claims[0].quantity,1,'Only physically feasible stock can be reserved');
 const stock=node.stock;
 k.Simulation.advance(s,5);
 assert.equal(node.stock,stock-1);
 assert.equal(n.inventory.wood,1);
 const receipt=s.receipts.find(x=>x.action==='collect_wood'&&x.status==='COMPLETED');
 assert.equal(receipt.delta.nodeStock.find(x=>x.key===node.id).delta,-1);
 assert.ok(k.AgentWorld.carrying(n).massKg<=32);
});

test('a full bulky armload cannot forage until some material is actually dropped',()=>{
 const {k,s,n}=fixture(),source=s.world.nodes.find(v=>v.kind==='food'&&v.stock>=2);
 assert.ok(source);
 n.x=source.x;n.y=source.y;n.z=0;n.path=[];
 n.inventory.fiber=30; // 45 L of loose fiber but only 6 kg.
 assert.equal(k.AgentWorld.roomFor(n,'food'),0);
 assert.ok(!k.WorldRuntime.available(s,n).some(o=>o.key==='forage'));
 assert.ok(k.WorldRuntime.available(s,n).some(o=>o.key==='drop_fiber'));
 const stock=source.stock;
 assert.equal(k.WorldRuntime.begin(s,n,'drop_fiber'),true);
 k.Simulation.advance(s,2);
 assert.equal(n.inventory.fiber,29);
 assert.equal(s.world.items.filter(item=>item.kind==='fiber').length,1);
 assert.ok(k.AgentWorld.roomFor(n,'food')>=1);
 assert.equal(k.WorldRuntime.begin(s,n,'forage'),true);
 k.Simulation.advance(s,3);
 assert.ok(source.stock<stock);
 assert.ok(n.inventory.food>=1);
 assert.equal(n.bio.pantry.length,n.inventory.food);
 assert.ok(k.AgentWorld.carrying(n).volumeL<=45);
});

test('late load increase causes a failed harvest with zero material or pantry changes',()=>{
 const {k,s,n}=fixture(),node=s.world.nodes.find(v=>v.kind==='food'&&v.stock>=4);
 assert.ok(node);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 assert.equal(k.WorldRuntime.begin(s,n,'forage'),true);
 const commandId=n.task.commandId;
 n.inventory.fiber=30; // Another authorized effect consumed capacity mid-job.
 const stock=node.stock,pantry=n.bio.pantry.length;
 k.Simulation.advance(s,3);
 assert.equal(node.stock,stock,'Source must remain untouched when output cannot fit');
 assert.equal(n.inventory.food,0);
 assert.equal(n.bio.pantry.length,pantry);
 const failed=s.receipts.find(x=>x.commandId===commandId&&x.status==='FAILED');
 assert.match(failed.reason,/CARRYING_CAPACITY/);
});

test('a recipient with no remaining bulk cannot be gifted more food',()=>{
 const {k,s,n}=fixture(),other=s.npcs[1];
 other.x=n.x;other.y=n.y;other.z=0;
 other.inventory.fiber=30;
 n.inventory.food=1;
 assert.equal(k.Biology.addForaged(n.bio,'nuts',1),true);
 assert.equal(k.AgentWorld.roomFor(other,'food'),0);
 const sourceCount=n.bio.pantry.length;
 assert.ok(!k.WorldRuntime.available(s,n).some(o=>o.key==='share_food'));
 assert.equal(k.WorldRuntime.begin(s,n,'share_food'),false);
 assert.equal(n.inventory.food,1);
 assert.equal(n.bio.pantry.length,sourceCount);
 assert.equal(other.inventory.food,0);
});

test('crate withdrawal refuses over-capacity actors without deleting stored stock',()=>{
 const {k,s,n}=fixture();
 n.inventory.stone=14;
 const crate={id:'crate_42',type:'crate',x:n.x,y:n.y,capacity:12,
  contents:{wood:0,stone:1,fiber:0}};
 s.world.structures.push(crate);
 const before=snapshot(crate.contents);
 assert.equal(k.AgentWorld.roomFor(n,'stone'),0);
 assert.ok(!k.Crafting.options(n,s.world).some(o=>o.key==='withdraw_stone'));
 const result=k.Crafting.interact(n,s.world,'withdraw_stone',crate.id);
 assert.equal(result.ok,false);
 assert.deepEqual(snapshot(crate.contents),before);
 assert.equal(n.inventory.stone,14);
});

test('dropped fiber keeps one ground identity across save and later pickup',()=>{
 const {k,s,n}=fixture();
 n.inventory.fiber=30;
 assert.equal(k.WorldRuntime.begin(s,n,'drop_fiber'),true);
 k.Simulation.advance(s,2);
 const item=s.world.items.find(x=>x.kind==='fiber');
 assert.ok(item);
 const saved=snapshot(k.Persistence.save(s));
 const loaded=k.Simulation.initial(379210);loaded.auto=false;
 assert.equal(k.Persistence.restore(loaded,saved),true);
 const actor=loaded.npcs.find(x=>x.id===n.id),ground=loaded.world.items;
 assert.equal(ground.length,1);
 assert.equal(ground[0].id,item.id);
 assert.equal(ground[0].kind,'fiber');
 assert.equal(actor.inventory.fiber,29);
 assert.equal(k.WorldRuntime.begin(loaded,actor,'pickup_item'),true);
 k.Simulation.advance(loaded,2);
 assert.equal(actor.inventory.fiber,30);
 assert.equal(loaded.world.items.length,0);
 const receipt=loaded.receipts.find(x=>x.action==='pickup_item'&&x.status==='COMPLETED');
 assert.ok(receipt);
 assert.equal(receipt.delta.collections.items.removed[0].id,item.id);
});

test('final crafting stage waits for actual carrying space without losing its workpiece',()=>{
 const {k,s,n}=fixture();
 n.inventory.fiber=3;
 assert.equal(k.Crafting.begin(n,s.world,'cord').ok,true);
 assert.equal(n.inventory.fiber,0);
 for(let i=0;i<2;i++)assert.equal(k.Crafting.advance(n,s.world).ok,true);
 assert.equal(n.workpiece.stage,2);
 n.inventory.fiber=30;
 const before=snapshot(n.workpiece);
 const refused=k.Crafting.advance(n,s.world);
 assert.equal(refused.ok,false);
 assert.match(refused.message,/CARRYING_CAPACITY/);
 assert.deepEqual(snapshot(n.workpiece),before);
 assert.equal(n.inventory.cord,0);
 n.inventory.fiber=29;
 assert.equal(k.Crafting.advance(n,s.world).ok,true);
 assert.equal(n.workpiece,null);
 assert.equal(n.inventory.cord,1);
 assert.ok(k.AgentWorld.carrying(n).volumeL<=45);
});

test('a distant personally built workbench remains actionable without exposing foreign unseen workshops',()=>{
 const {k,s,n}=fixture();
 n.inventory.wood=2;n.inventory.hatchet=1;
 const reachable=k.WorldRuntime.reachability(s,n);
 const site=s.world.nodes.find(x=>x.kind==='wood'&&
  k.Frontier.distance(s.world,n,x)>12&&reachable(x));
 assert.ok(site);
 const bench={id:'workbench_99',type:'workbench',x:site.x,y:site.y,
  craftQuality:2,maker:s.npcs[1].id};
 s.world.structures.push(bench);
 assert.ok(!k.Crafting.options(n,s.world).some(o=>o.key==='craft_planks'),
  'Unseen distant foreign workshop is not an affordance');
 bench.maker=n.id;
 assert.equal(k.Crafting.options(n,s.world).find(o=>o.key==='craft_planks')?.ref,
  bench.id);
 assert.equal(k.WorldRuntime.available(s,n).find(o=>o.key==='craft_planks')?.ref,
  bench.id,'The maker remembers their own physical station');
 assert.equal(k.WorldRuntime.begin(s,n,'craft_planks'),true);
 assert.ok(n.path.length>0,'The maker must travel instead of crafting remotely');
 assert.equal(n.workpiece,null,'No free item or work from choosing the trip');
});
