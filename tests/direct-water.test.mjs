import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function load(){
 const context=vm.createContext({});
 const names=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(names.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),context);
 const state=context.Simulation.initial(379210);
 state.auto=false;
 const actor=state.npcs[0],source=state.world.nodes.find(n=>n.kind==='water'&&n.stock>2);
 assert.ok(source);
 actor.x=source.x;actor.y=source.y;actor.z=0;actor.path=[];
 actor.inventory.water=0;
 actor.needs.thirst=90;
 actor.bio.hydrationBudgetMl=600;
 return {context,state,actor,source};
}

test('an empty-handed person drinks directly from a finite reachable spring',()=>{
 const {context:k,state,actor,source}=load(),beforeStock=source.stock;
 const hydration=actor.bio.hydrationBudgetMl;
 assert.ok(k.WorldRuntime.available(state,actor).some(o=>o.key==='drink_source'));
 assert.equal(k.Cognition.instinct(actor,k.WorldRuntime.available(state,actor)),
  'drink_source','Immediate thirst should prefer water at source over imaginary reserves');
 assert.equal(k.WorldRuntime.begin(state,actor,'drink_source'),true);
 assert.equal(source.stock,beforeStock,'Work start cannot consume water');
 assert.equal(actor.inventory.water,0);
 k.Simulation.advance(state,1);
 assert.equal(source.stock,beforeStock-1);
 assert.equal(actor.inventory.water,0,'Direct consumption never creates carried water');
 assert.ok(actor.bio.hydrationBudgetMl>hydration+350);
 assert.ok(actor.needs.thirst<90);
 assert.ok(state.receipts.some(r=>r.status==='COMPLETED'&&r.action==='drink_source'&&
  r.delta.nodeStock.some(x=>x.key===source.id&&x.delta===-1)));
});

test('spring emptied during the drinking activity cannot provide free hydration',()=>{
 const {context:k,state,actor,source}=load();
 assert.equal(k.WorldRuntime.begin(state,actor,'drink_source'),true);
 source.stock=0;
 const start=actor.bio.hydrationBudgetMl;
 k.Simulation.advance(state,1);
 assert.equal(source.stock,0);
 assert.equal(actor.inventory.water,0);
 assert.ok(actor.bio.hydrationBudgetMl<=start,'Dry sources must not replenish the body');
 assert.ok(state.receipts.some(r=>r.action==='drink_source'&&r.status==='FAILED'));
});

test('physical source drinking survives a pending version-3 save and restore',()=>{
 const {context:k,state,actor,source}=load();
 assert.equal(k.WorldRuntime.begin(state,actor,'drink_source'),true);
 const saved=JSON.parse(JSON.stringify(k.Persistence.save(state)));
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,saved),true);
 const copy=restored.npcs.find(n=>n.id===actor.id);
 assert.equal(copy.task?.key,'drink_source');
 k.Simulation.advance(restored,1);
 assert.equal(restored.world.nodes.find(n=>n.id===source.id).stock,source.stock-1);
 assert.equal(copy.inventory.water,0);
 assert.ok(restored.receipts.some(r=>r.action==='drink_source'&&r.status==='COMPLETED'));
});
