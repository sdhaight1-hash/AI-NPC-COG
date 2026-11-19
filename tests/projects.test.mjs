import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 const files=['frontier','biology','crafting','cognition','agency','emergence',
  'civilization','receipts','activities','reservations','projects','perception',
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
 assert.ok(s.receipts.some(x=>x.status==='COMPLETED'&&x.action==='craft_shelter'));
 assert.ok(n.project.completedActions>=10,
  'One discovery, one initiation and eight staged physical operations are required');
 assert.ok(s.receipts.filter(x=>x.action==='craft_stage'&&x.status==='COMPLETED').length>=8);
});

test('critical thirst interrupts a physical project task and resumes remaining work',()=>{
 const {c,s,n}=setup();
 n.inventory.wood=4;n.inventory.fiber=4;n.inventory.water=3;
 c.Projects.create(s,n,'shelter');
 assert.equal(c.WorldRuntime.advanceProject(s,n),true);
 assert.equal(n.task.key,'experiment_wood_fiber');
 const initialCommand=n.task.commandId;
 tick(c,s,6);
 const progress=n.currentActivity.workDone;
 assert.ok(progress>=6);
 n.needs.thirst=96;n.bio.hydrationBudgetMl=100;s.auto=true;
 assert.equal(c.WorldRuntime.survival(s,n),true);
 assert.equal(n.task.key,'drink');
 assert.equal(n.suspendedActivities.at(-1).commandId,initialCommand);
 for(let i=0;i<50&&!(n.knowledge.recipes.includes('shelter'));i++){
  n.energy=100;tick(c,s);
 }
 assert.equal(n.knowledge.recipes.includes('shelter'),true);
 const completed=s.receipts.filter(r=>r.commandId===initialCommand&&r.status==='COMPLETED');
 assert.equal(completed.length,1,'Interrupted experiment must commit at most once');
 assert.equal(n.inventory.fiber,3,'Learning consumes its actual ingredient once');
 assert.ok(s.receipts.some(r=>r.commandId===initialCommand&&r.status==='RESUMED'));
 assert.equal(n.project.nodes.find(x=>x.id==='learn').status,'DONE');
});

test('workbench project completes from finite raw ingredients and staged crafting',()=>{
 const {c,s,n}=setup();
 n.inventory.wood=3;n.inventory.stone=1;n.inventory.fiber=3;
 c.Projects.create(s,n,'workbench');
 let done=false;
 for(let i=0;i<180;i++){
  n.energy=100;tick(c,s);
  if(n.project.status==='COMPLETED'){done=true;break;}
 }
 assert.equal(done,true,n.project.blockedReason||'Workbench dependency graph stalled');
 assert.equal(s.world.structures.filter(x=>x.type==='workbench').length,1);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.stone,0);
 assert.equal(n.inventory.fiber,0);
 assert.equal(n.inventory.cord,0);
 assert.ok(s.receipts.filter(x=>x.action==='craft_stage'&&
  x.status==='COMPLETED').length>=6);
});
test('storage project has an acyclic real production chain with tool repair',()=>{
 const {c,s,n}=setup();
 const project=c.Projects.create(s,n,'storage');
 assert.ok(project);
 assert.equal(c.Projects.validateGraph(project.nodes),true);
 const tool=project.nodes.find(x=>x.id==='hatchet');
 assert.ok(tool.requires.includes('blade')&&tool.requires.includes('cord_hatchet'));
 assert.ok(project.nodes.find(x=>x.id==='planks').requires.includes('hatchet'));
 assert.equal(c.Projects.predicate(s,n,'storage','hatchet'),false);
 n.inventory.hatchet=1;
 c.Projects.sync(s,n);
 assert.equal(tool.status,'DONE');
 n.inventory.hatchet=0;
 c.Projects.sync(s,n);
 assert.equal(tool.status,'PENDING','Lost tool must reopen its prerequisite');
 assert.ok(project.nodes.some(x=>x.status!=='DONE'));
});

test('storage production actually builds and places a crate through verified stages',()=>{
 const {c,s,n}=setup();
 s.npcs=[n]; // Isolate production from unrelated traffic; keep the real terrain.
 n.inventory.wood=9;n.inventory.stone=4;n.inventory.fiber=12;
 c.Projects.create(s,n,'storage');
 let achieved=false;
 for(let i=0;i<500;i++){
  n.energy=100;
  tick(c,s);
  if(n.project.status==='COMPLETED'){achieved=true;break;}
 }
 assert.equal(achieved,true,n.project.blockedReason||'Storage supply chain stalled');
 const crate=s.world.structures.find(x=>x.type==='crate');
 assert.ok(crate,'A physical storage object must exist');
 assert.equal(n.inventory.crate,0,'Placed crate cannot remain carried');
 assert.ok(crate.capacity>=12,'Crate retains real finite capacity');
 const results=s.receipts.filter(x=>x.status==='COMPLETED');
 assert.ok(results.filter(x=>x.action==='craft_stage').length>=18,
  'Six staged recipes must complete in physical time');
 assert.ok(results.some(x=>x.action==='place_crate'));
 assert.equal(s.receipts.filter(x=>x.action==='place_crate'&&
  x.status==='COMPLETED').length,1);
});

test('a lost manufactured tool is replaced and the earlier workbench is preserved',()=>{
 const {c,s,n}=setup();
 s.npcs=[n];
 n.inventory.wood=14;n.inventory.stone=8;n.inventory.fiber=18;
 c.Projects.create(s,n,'storage');
 let toolProduced=false;
 for(let i=0;i<280;i++){
  n.energy=100;tick(c,s);
  if(n.inventory.hatchet>0){toolProduced=true;break;}
 }
 assert.equal(toolProduced,true,n.project.blockedReason||'Hatchet was never produced');
 assert.equal(s.world.structures.filter(x=>x.type==='workbench').length,1);
 n.inventory.hatchet=0;
 n.craftedItems=n.craftedItems.filter(item=>item.kind!=='hatchet');
 let recovered=false;
 for(let i=0;i<450;i++){
  n.energy=100;tick(c,s);
  if(n.project.status==='COMPLETED'){recovered=true;break;}
 }
 assert.equal(recovered,true,n.project.blockedReason||'Tool repair never finished');
 assert.equal(s.world.structures.filter(x=>x.type==='workbench').length,1,
  'A repaired dependency must not reset the completed workbench');
 assert.equal(s.world.structures.filter(x=>x.type==='crate').length,1);
 const starts=s.receipts.filter(x=>x.status==='COMPLETED'&&
  x.action==='craft_hafted_hatchet');
 assert.equal(starts.length,2,'An actual second hatchet must be physically made');
});

test('completed projects are archived before an NPC chooses a different ambition',()=>{
 const {c,s,n}=setup();
 n.personality='curious and adventurous';
 assert.equal(c.Projects.maybeStart(s,n).kind,'campfire');
 s.world.structures.push({id:'test_fire',type:'campfire',maker:n.id,x:n.x,y:n.y});
 c.Projects.sync(s,n);
 assert.equal(n.project.status,'COMPLETED');
 const next=c.Projects.maybeStart(s,n);
 assert.equal(next.kind,'shelter','Curiosity does not replace the need for shelter');
 assert.equal(n.completedProjects.length,1);
 assert.equal(n.completedProjects[0].kind,'campfire');
 const pack=JSON.parse(JSON.stringify(c.Persistence.save(s)));
 const replica=c.Simulation.initial(379210);replica.auto=false;
 assert.equal(c.Persistence.restore(replica,pack),true);
 const saved=replica.npcs.find(x=>x.id===n.id);
 assert.equal(saved.project.kind,'shelter');
 assert.equal(saved.completedProjects[0].kind,'campfire');
});
