import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);
 s.auto=false;
 const n=s.npcs[0];s.npcs=[n];n.energy=100;
 n.needs.thirst=20;n.needs.hunger=25;n.bio.hydrationBudgetMl=2400;
 c.Projects.create(s,n,'water_vessel');
 return {c,s,n,p:n.project};
}

test('unavailable water-vessel work retains a bounded, replayable blocked reason',()=>{
 const {c,s,n,p}=setup();
 const first=c.Projects.next(s,n,[]);
 assert.equal(first.status,'blocked');
 assert.match(p.blockedReason,/fiber:LEGAL_ACTION_UNAVAILABLE:collect_fiber/);
 const firstDelay=p.nextAt-s.clock;
 assert.ok(firstDelay>=15,'Do not immediately retry the same unavailable action');
 assert.equal(p.nodes.find(x=>x.id==='fiber').status,'BLOCKED');
 s.clock=p.nextAt;s.world.now=s.clock;
 const second=c.Projects.next(s,n,[]);
 assert.equal(second.status,'blocked');
 assert.ok(p.nextAt-s.clock>firstDelay,'Repeated absence should lengthen the deferment');
 const saved=copy(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,saved),true);
 const n2=restored.npcs.find(x=>x.id===n.id);
 assert.equal(n2.project.kind,'water_vessel');
 assert.equal(n2.project.status,'BLOCKED');
 assert.equal(n2.project.nextAt,p.nextAt);
 assert.equal(n2.project.blockedReason,p.blockedReason);
 assert.equal(n2.project.nodes.find(x=>x.id==='fiber').failures,2);
});

test('a blocked water-vessel project can attend to ordinary needs without losing its plan',()=>{
 const {c,s,n,p}=setup();
 c.Projects.next(s,n,[]);
 const nextAt=p.nextAt;
 s.auto=true;n.thoughtAt=s.clock;
 const prior=copy(n.inventory);
 c.WorldRuntime.scheduleOffline(s);
 assert.equal(n.project,p,'The committed project remains persisted');
 assert.equal(p.status,'BLOCKED');
 assert.equal(p.nextAt,nextAt);
 assert.ok(n.task||n.action==='rest'||n.source==='offline routine',
  'The actor is allowed a grounded fallback while its project cannot progress');
 if(n.task)assert.ok(new Set(['drink','drink_source','eat','forage','rest',
  'explore','inspect','socialize','share_food']).has(n.task.key),
  'Waiting should not consume unfinished-project inputs in unrelated crafting');
 assert.deepEqual(copy(n.inventory),prior,'Choosing a fallback cannot mint supplies');
});

test('repeated unrewarded exploration is bounded and a new reachable source can reopen work',()=>{
 const {c,s,n,p}=setup();
 const scout={key:'explore',when:'Explore a reachable location'};
 for(let attempt=0;attempt<4;attempt++){
  const next=c.Projects.next(s,n,[scout]);
  assert.equal(next.status,'action');
  assert.equal(next.action,'explore');
  c.Projects.onOutcome(s,n,'explore',true);
  s.clock=p.nextAt;s.world.now=s.clock;
 }
 const stopped=c.Projects.next(s,n,[scout]);
 assert.equal(stopped.status,'blocked');
 assert.match(p.blockedReason,/SCOUT_LIMIT:collect_fiber/);
 const saved=copy(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,saved),true);
 const remembered=restored.npcs.find(x=>x.id===n.id).project;
 assert.equal(remembered.nodes.find(x=>x.id==='fiber').scouts,4);
 s.clock=p.nextAt;s.world.now=s.clock;
 const fresh={key:'collect_fiber',when:'Collect personally reached fiber source'};
 const recovered=c.Projects.next(s,n,[fresh]);
 assert.equal(recovered.action,'collect_fiber');
 assert.equal(p.status,'ACTIVE');
 assert.equal(p.nodes.find(x=>x.id==='fiber').scouts,0);
});
