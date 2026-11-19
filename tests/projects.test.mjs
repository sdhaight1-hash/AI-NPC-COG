import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 const names=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','projects',
  'world-runtime','simulation','persistence'];
 vm.runInContext(names.map(n=>readFileSync(new URL('../public/'+n+'.js',import.meta.url),'utf8')).join('\n'),c);
 const state=c.Simulation.initial(379210);state.auto=false;
 const n=state.npcs[0];n.energy=100;n.bio.hydrationBudgetMl=3500;
 for(const kind of ['wood','fiber','stone']){
  state.world.nodes.push({id:'scenario_'+kind,kind,x:n.x,y:n.y,stock:30,max:30,regrow:0});
 }
 return {c,state,n};
}
function advance(c,state,ticks){
 for(let i=0;i<ticks;i++)c.Simulation.advance(state,1);
}
test('workbench goal executes 10+ finite physical operations and verifies built structure',()=>{
 const {c,state,n}=setup();
 assert.equal(c.WorldRuntime.begin(state,n,'make_workbench'),true);
 assert.ok(c.Projects.verify(n.project.nodes));
 for(let i=0;i<600&&!state.world.structures.some(s=>s.type==='workbench');i++)
  c.Simulation.advance(state,1);
 const bench=state.world.structures.find(s=>s.type==='workbench');
 assert.ok(bench,'A primitive workbench should physically exist');
 assert.ok(n.project.completedOps>=10,'Long-horizon manufacturing must actually work');
 assert.ok(state.receipts.filter(r=>r.status==='COMPLETED').length>=10);
 assert.equal(n.inventory.cord,0,'Cord must be consumed by workbench input');
 assert.equal(n.workpiece,null,'No virtual uncommitted workpiece remains');
 advance(c,state,3);
 assert.equal(n.project.status,'COMPLETE');
 assert.equal(n.plan,null);
});
test('goal graph and unfinished crafting stage survive a version-3 checkpoint',()=>{
 const {c,state,n}=setup();
 assert.equal(c.WorldRuntime.begin(state,n,'make_workbench'),true);
 for(let i=0;i<150&&!n.workpiece;i++)c.Simulation.advance(state,1);
 assert.ok(n.workpiece,'Project should have begun manufacturing its cord component');
 const saved=JSON.parse(JSON.stringify(c.Persistence.save(state)));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,saved),true);
 const actor=restored.npcs.find(x=>x.id===n.id);
 assert.equal(actor.project.goal,'make_workbench');
 assert.equal(actor.project.nodes.length,n.project.nodes.length);
 assert.equal(actor.workpiece.recipe,n.workpiece.recipe);
 for(let i=0;i<300;i++){
  c.Simulation.advance(state,1);
  c.Simulation.advance(restored,1);
  if(state.world.structures.some(x=>x.type==='workbench'))break;
 }
 assert.ok(state.world.structures.some(x=>x.type==='workbench'));
 assert.equal(c.Simulation.canonical(c.Persistence.save(state)),
  c.Simulation.canonical(c.Persistence.save(restored)));
});
test('a graph with a dependency cycle or missing dependency is rejected',()=>{
 const {c}=setup();
 assert.equal(c.Projects.verify([
  {id:'a',requires:['b'],method:'inspect'},
  {id:'b',requires:['a'],method:'inspect'}]),false);
 assert.equal(c.Projects.verify([
  {id:'a',requires:['missing'],method:'inspect'}]),false);
 assert.equal(c.Projects.verify([
  {id:'a',requires:[],method:'inspect'},
  {id:'b',requires:['a'],method:'inspect'}]),true);
});
test('unlearned shelter method blocks execution rather than granting a free building',()=>{
 const {c,state,n}=setup();
 n.inventory.wood=4;n.inventory.fiber=3;
 n.knowledge.recipes=[];
 const goal=c.Projects.build('make_shelter',state.clock);
 const proposed=c.Projects.choose(n,state.world,goal,
  c.WorldRuntime.available(state,n));
 assert.equal(proposed.status,'blocked');
 assert.match(proposed.reason,/UNLEARNED_METHOD:shelter/);
 assert.equal(state.world.structures.length,0);
});
test('blocked dependencies remain attached to their goal and can be repaired',()=>{
 const {c,state,n}=setup();
 state.world.nodes=state.world.nodes.filter(x=>x.kind!=='fiber');
 n.inventory.fiber=0;
 c.WorldRuntime.begin(state,n,'make_workbench');
 c.Simulation.advance(state,1);
 assert.equal(n.project.status,'ACTIVE');
 assert.match(n.project.blockedReason,/UNAVAILABLE:collect_fiber/);
 const previouslyStarted=n.project.startedAt;
 state.world.nodes.push({id:'new_fiber',kind:'fiber',x:n.x,y:n.y,
  stock:8,max:8,regrow:0});
 advance(c,state,10);
 assert.equal(n.project.startedAt,previouslyStarted);
 assert.ok(n.project.completedOps>0||n.task?.key==='collect_fiber');
});
test('actor temperaments produce different valid construction priorities',()=>{
 const {c,state,n}=setup(),other=state.npcs[1];
 const options=[{key:'make_workbench'},{key:'make_shelter'},{key:'explore'}];
 n.personality='curious adventurous independent';
 other.personality='cautious patient pragmatic';
 n.needs.curiosity=85;other.needs.curiosity=15;
 const a=c.Agency.ranked(n,options,state.world,state.clock);
 const b=c.Agency.ranked(other,options,state.world,state.clock);
 assert.notEqual(a[0].key,b[0].key,'Traits should change durable goal selection');
});
