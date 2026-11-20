import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function equipFlask(n,clock){
 n.inventory.flask=1;
 n.craftedItems ||= [];
 n.craftedItems.push({kind:'flask',quality:2,maker:n.id,
  craftedAt:clock,method:'flask',materialQuality:2});
}
function load(){
 const c=vm.createContext({});
 const names=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','world-runtime','simulation','persistence'];
 vm.runInContext(names.map(n=>readFileSync(new URL('../public/'+n+'.js',import.meta.url),'utf8')).join('\n'),c);
 return c;
}
test('finite harvest yields exact world-node and carried-inventory deltas',()=>{
 const c=load(),s=c.Simulation.initial(379210);
 s.auto=false;
 const n=s.npcs[0],node=s.world.nodes.find(x=>x.kind==='wood'&&x.stock>4);
 assert.ok(node);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];n.task=null;
 const before=node.stock,inv=n.inventory.wood;
 assert.equal(c.WorldRuntime.begin(s,n,'collect_wood','offline routine'),true);
 const id=n.task.commandId;
 const accepted=s.receipts.at(-1);
 assert.equal(accepted.status,'ACCEPTED');
 assert.equal(accepted.commandId,id);
 assert.equal(accepted.context.activityId,'act_'+id);
 assert.ok(accepted.context.reservationIds.length>0);
 assert.equal(accepted.context.position.z,0);
 c.Simulation.advance(s,5);
 const receipt=s.receipts.find(x=>x.commandId===id&&x.status==='COMPLETED');
 assert.ok(receipt);
 assert.equal(receipt.delta.nodeStock.find(x=>x.key===node.id).delta,node.stock-before);
 assert.equal(receipt.delta.inventory.find(x=>x.key==='wood').delta,n.inventory.wood-inv);
 assert.equal(node.stock-before,-(n.inventory.wood-inv));
 assert.equal(receipt.reason,null);
 assert.equal(receipt.effectRevision,1);
 assert.equal(receipt.id,'evt_2');
});
test('failed out-of-reach gather is rejected with no stock or inventory change',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],node=s.world.nodes.find(x=>x.kind==='stone'&&x.stock);
 assert.ok(node);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 assert.equal(c.WorldRuntime.begin(s,n,'collect_stone'),true);
 const task={...n.task};
 n.x=(node.x+30)%s.world.width;n.y=(node.y+20)%s.world.height;
 const stock=node.stock,inv=n.inventory.stone;
 c.Simulation.advance(s,6);
 const receipt=s.receipts.find(x=>x.commandId===task.commandId&&x.status==='FAILED');
 assert.ok(receipt);
 assert.match(receipt.reason,/Resource no longer available/);
 assert.deepEqual(JSON.parse(JSON.stringify(receipt.delta.inventory)),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(receipt.delta.nodeStock)),[]);
 assert.equal(node.stock,stock);assert.equal(n.inventory.stone,inv);
});
test('duplicate effect commit cannot award output or deduct input a second time',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],node=s.world.nodes.find(x=>x.kind==='water'&&x.stock>3);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 equipFlask(n,s.clock);
 c.WorldRuntime.begin(s,n,'fill_water');
 const task={...n.task};
 c.Simulation.advance(s,2);
 const stock=node.stock,water=n.inventory.water,seq=s.receiptSeq;
 let calls=0;
 const duplicate=c.WorldReceipts.execute(s,n,task,()=>{calls++;return {ok:true,message:'Bad duplicate'};});
 assert.equal(duplicate.duplicate,true);
 assert.equal(calls,0);
 assert.equal(node.stock,stock);assert.equal(n.inventory.water,water);
 assert.equal(s.receiptSeq,seq);
});
test('three-stage crafting receipts capture consumption, workpiece and produced quality',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];
 n.inventory.fiber=3;n.energy=100;
 assert.equal(c.WorldRuntime.begin(s,n,'craft_cord'),true);
 let id=n.task.commandId;
 c.Simulation.advance(s,2);
 let first=s.receipts.find(r=>r.commandId===id&&r.status==='COMPLETED');
 assert.ok(first);assert.equal(first.delta.inventory.find(x=>x.key==='fiber').delta,-3);
 assert.ok(first.delta.workpiece.after);
 // Canonical minute slices can advance the plan automatically between stages.
 // The external caller must not reissue an already-running craft command.
 c.Simulation.advance(s,45);
 assert.equal(n.inventory.cord,1);
 const produced=s.receipts.find(r=>r.action==='craft_stage'&&
  r.status==='COMPLETED'&&r.delta.inventory.some(x=>x.key==='cord'));
 assert.ok(produced.delta.inventory.some(x=>x.key==='cord'&&x.delta===1));
 assert.ok(produced.delta.craftedItems.after.some(x=>x.kind==='cord'));
});
test('receipt sequence survives version-3 checkpoint and contains no private NPC memories',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],node=s.world.nodes.find(x=>x.kind==='water'&&x.stock);
 n.x=node.x;n.y=node.y;n.z=0;n.path=[];
 n.memories=[{text:'SECRET_PRIVATE_MEMORY_DO_NOT_LOG',at:s.clock}];
 equipFlask(n,s.clock);
 c.WorldRuntime.begin(s,n,'fill_water');
 c.Simulation.advance(s,2);
 const pack=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 assert.doesNotMatch(JSON.stringify(pack.receipts),/SECRET_PRIVATE_MEMORY_DO_NOT_LOG/);
 const restored=c.Simulation.initial(379210);
 assert.equal(c.Persistence.restore(restored,pack),true);
 const oldSeq=restored.receiptSeq;
 const m=restored.npcs.find(x=>x.id===n.id);
 c.WorldRuntime.begin(restored,m,'none');
 assert.equal(restored.receiptSeq,oldSeq+1);
 assert.equal(restored.receipts.at(-1).sequence,oldSeq+1);
});

test('shared food transfer captures recipient changes without private cognitive state',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const [n,other]=s.npcs;
 other.x=n.x;other.y=n.y; // World kernel checks interaction proximity.
 n.inventory.food=2;n.bio=c.Biology.restore(n.bio,2);
 other.inventory.food=0;other.bio=c.Biology.restore(other.bio,0);
 n.task={key:'share_food',ref:other.id,readyAt:s.clock,commandId:'cmd_77'};
 const result=c.WorldReceipts.execute(s,n,n.task,()=>
  c.AgentWorld.complete(n,s.world,s.npcs));
 assert.equal(result.ok,true);
 const receipt=result.receipt;
 const peer=receipt.delta.otherActors.find(x=>x.actorId===other.id);
 assert.ok(peer);
 assert.ok(peer.inventory.some(x=>x.key==='food'&&x.delta===1));
 assert.ok(receipt.delta.inventory.some(x=>x.key==='food'&&x.delta===-1));
 assert.ok(!JSON.stringify(receipt).includes(other.personality));
});
test('receipt append retains bounded history with monotonic sequence',()=>{
 const c=load(),s=c.Simulation.initial(379210),n=s.npcs[0];
 for(let i=0;i<c.WorldReceipts.MAX+10;i++)
  c.WorldReceipts.decision(s,n,'none','simulation');
 assert.equal(s.receipts.length,c.WorldReceipts.MAX);
 assert.equal(s.receiptSeq,c.WorldReceipts.MAX+10);
 assert.equal(s.receipts.at(0).sequence,11);
});

test('non-physical model choices and inference duration survive checkpoint without prompts',()=>{
 const c=load(),s=c.Simulation.initial(379210),n=s.npcs[0];
 c.WorldReceipts.decision(s,n,'inspect','rein','DECIDED',null,12.5);
 c.WorldReceipts.decision(s,n,'craft_fantasy','model','REJECTED','Invalid option');
 const other=c.Simulation.initial(379210);
 const pack=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 assert.equal(c.Persistence.restore(other,pack),true);
 assert.equal(other.receipts.length,2);
 assert.equal(other.receipts[0].inferenceMs,12.5);
 assert.equal(other.receipts[1].reason,'Invalid option');
 assert.equal(other.receipts[1].commandId,null);
});

test('truncated receipt history cannot authorize a completed task to mutate again',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],water=s.world.nodes.find(x=>x.kind==='water'&&x.stock>4);
 n.x=water.x;n.y=water.y;n.z=0;n.path=[];
 equipFlask(n,s.clock);
 assert.equal(c.WorldRuntime.begin(s,n,'fill_water'),true);
 const old={...n.task};
 c.Simulation.advance(s,2);
 const inventory=n.inventory.water,stock=water.stock;
 for(let i=0;i<c.WorldReceipts.MAX+5;i++)
  c.WorldReceipts.decision(s,n,'none','test');
 assert.equal(s.receipts.some(r=>r.commandId===old.commandId),false,
  'Deliberately evict the old physical receipt');
 let called=false;
 const result=c.WorldReceipts.execute(s,n,old,()=>{
  called=true;water.stock--;n.inventory.water++;return {ok:true};
 });
 assert.equal(result.duplicate,true);
 assert.equal(called,false,'No stale callback may run after the log rolls over');
 assert.equal(water.stock,stock);
 assert.equal(n.inventory.water,inventory);
});

test('a valid still-running command can finish despite an evicted ACCEPTED receipt',()=>{
 const c=load(),s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],water=s.world.nodes.find(x=>x.kind==='water'&&x.stock>3);
 n.x=water.x;n.y=water.y;n.z=0;n.path=[];
 equipFlask(n,s.clock);
 assert.equal(c.WorldRuntime.begin(s,n,'fill_water'),true);
 const id=n.task.commandId;
 for(let i=0;i<c.WorldReceipts.MAX+5;i++)
  c.WorldReceipts.decision(s,n,'none','test');
 assert.equal(s.receipts.some(r=>r.commandId===id),false);
 const stock=water.stock,inventory=n.inventory.water;
 c.Simulation.advance(s,2);
 assert.equal(water.stock<stock,true);
 assert.equal(n.inventory.water>inventory,true);
 assert.ok(s.receipts.some(r=>r.commandId===id&&r.status==='COMPLETED'));
});

test('revalidated harvest cannot turn a stale wrong-kind target into an effect',()=>{
 const c=load(),s=c.Simulation.initial(379210),n=s.npcs[0];
 const target=s.world.nodes.find(node=>node.kind==='stone');
 n.x=target.x;n.y=target.y;n.z=0;n.path=[];
 const before=target.stock;
 n.task={key:'forage',ref:target.id,commandId:'cmd_1',readyAt:s.clock};
 c.WorldRuntime.complete(s,n);
 const receipt=s.receipts.at(-1);
 assert.equal(receipt.status,'FAILED');
 assert.match(receipt.reason,/RESOURCE_KIND_MISMATCH/);
 assert.equal(target.stock,before);
 assert.equal(n.inventory.stone,0);
 assert.equal(n.inventory.food,0);
 assert.equal(s.effectRevision,0);
});

test('freshwater and raw goods cannot be reached through another z level',()=>{
 const c=load(),s=c.Simulation.initial(379210),n=s.npcs[0];
 const spring=s.world.nodes.find(node=>node.kind==='water');
 n.x=spring.x;n.y=spring.y;n.z=-1;
 const before=spring.stock;
 const hydration=n.bio.hydrationBudgetMl;
 n.task={key:'drink_source',ref:spring.id,commandId:'cmd_1',readyAt:s.clock};
 c.WorldRuntime.complete(s,n);
 assert.equal(s.receipts.at(-1).status,'FAILED');
 assert.equal(spring.stock,before);
 assert.equal(n.bio.hydrationBudgetMl,hydration);
});

test('an abandoned timed command has one terminal receipt and survives a checkpoint',()=>{
 const c=load(),s=c.Simulation.initial(379210),n=s.npcs[0];
 n.inventory.wood=2;n.inventory.stone=1;n.knowledge.recipes.push('campfire');
 assert.equal(c.WorldRuntime.begin(s,n,'build_fire'),true);
 const commandId=n.task.commandId;
 assert.equal(c.Civilization.die(s,n,'test'),true);
 const terminal=s.receipts.filter(r=>r.commandId===commandId&&r.status==='ABANDONED');
 assert.equal(terminal.length,1);
 assert.equal(terminal[0].reason,'ACTOR_DEAD');
 assert.equal(s.world.remains[0].inventory.wood,2);
 assert.equal(c.Activities.finish(s,n,false,'retry'),null);
 const restored=c.Simulation.initial(379210);
 assert.equal(c.Persistence.restore(restored,JSON.parse(JSON.stringify(c.Persistence.save(s)))),true);
 assert.equal(c.WorldReceipts.committed(restored,commandId).status,'ABANDONED');
});
