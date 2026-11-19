import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 const files=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','projects',
  'world-runtime','simulation','persistence'];
 vm.runInContext(files.map(x=>readFileSync(new URL('../public/'+x+'.js',
  import.meta.url),'utf8')).join('\n'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];n.energy=100;n.inventory.water=3;n.inventory.food=3;
 return {c,s,n};
}
function tick(c,s,count=1){for(let i=0;i<count;i++)c.Simulation.advance(s,1);}
test('rejects cyclic, missing and self-referential prerequisites',()=>{
 const {c}=setup();
 assert.equal(c.Projects.validateGraph([{id:'a',requires:['b']},
  {id:'b',requires:['a']}]),false);
 assert.equal(c.Projects.validateGraph([{id:'a',requires:['missing']}]),false);
 assert.equal(c.Projects.validateGraph([{id:'a',requires:['a']}]),false);
 assert.equal(c.Projects.validateGraph([{id:'a',requires:[]},
  {id:'b',requires:['a']}]),true);
});
test('personality changes durable long-term intentions',()=>{
 const {c,s,n}=setup();
 n.personality='patient and cautious';
 assert.equal(c.Projects.maybeStart(s,n).kind,'shelter');
 const other=s.npcs[1];
 other.personality='curious and adventurous';
 assert.equal(c.Projects.maybeStart(s,other).kind,'campfire');
 assert.notEqual(n.project.kind,other.project.kind);
});
test('unknown shelter method cannot be executed before real experimentation',()=>{
 const {c,s,n}=setup();
 c.Projects.create(s,n,'shelter');
 n.inventory.wood=4;n.inventory.fiber=4;
 let choice=c.Projects.next(s,n,c.WorldRuntime.available(s,n));
 assert.equal(choice.action,'experiment_wood_fiber');
 assert.equal(n.knowledge.recipes.includes('shelter'),false);
 assert.equal(c.WorldRuntime.begin(s,n,'build_shelter','project'),false);
 assert.equal(n.inventory.wood,4);
 assert.equal(n.inventory.fiber,4);
});
test('lost finite stock reopens a specific dependency without resetting learned method',()=>{
 const {c,s,n}=setup();
 c.Projects.create(s,n,'shelter');
 n.inventory.wood=4;n.inventory.fiber=4;
 n.knowledge.recipes.push('shelter');
 c.Projects.sync(s,n);
 assert.equal(n.project.nodes.find(x=>x.id==='learn').status,'DONE');
 n.inventory.wood=0;
 c.Projects.sync(s,n);
 assert.equal(n.project.nodes.find(x=>x.id==='wood').status,'PENDING');
 assert.equal(n.project.nodes.find(x=>x.id==='learn').status,'DONE');
 assert.equal(c.Projects.next(s,n,c.WorldRuntime.available(s,n)).action,'collect_wood');
});
test('project and learned dependencies survive a real v3 checkpoint',()=>{
 const {c,s,n}=setup();
 c.Projects.create(s,n,'shelter');
 n.inventory.wood=4;n.inventory.fiber=4;
 n.knowledge.recipes.push('shelter');
 c.Projects.sync(s,n);
 const before=n.project.nodes.find(x=>x.id==='learn').status;
 const copy=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,copy),true);
 const m=restored.npcs.find(x=>x.id===n.id);
 assert.equal(m.project.kind,'shelter');
 assert.equal(m.project.nodes.find(x=>x.id==='learn').status,before);
 assert.equal(m.project.completedActions,0);
 assert.equal(m.project.startedAt,n.project.startedAt);
});
test('world simulation advances a legal shelter project without granting resources',()=>{
 const {c,s,n}=setup();
 c.Projects.create(s,n,'shelter');
 n.inventory.wood=4;n.inventory.fiber=4;
 // Move reachable resource deposits near the actor to exercise real world rules.
 const build=c.WorldRuntime.available(s,n).find(x=>x.key==='experiment_wood_fiber');
 assert.ok(build,'Experiment is a legal physical action only with its real ingredients');
 let completed=false;
 for(let i=0;i<180;i++){
  n.energy=100;
  tick(c,s);
  if(n.project.status==='COMPLETED'){completed=true;break;}
 }
 assert.equal(completed,true,n.project.blockedReason||'No structure completed');
 assert.ok(s.world.structures.some(x=>x.type==='shelter'));
 assert.equal(n.inventory.wood,0);
 assert.ok(s.receipts.some(x=>x.status==='COMPLETED'&&x.action==='build_shelter'));
 assert.ok(n.project.completedActions>=2);
});
