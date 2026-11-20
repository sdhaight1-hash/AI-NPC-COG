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

test('depleted source at physical completion produces a failed receipt and deferred project',()=>{
 const {c,s,n,p}=setup();
 const fiber=s.world.nodes.find(x=>x.kind==='fiber'&&x.stock>=3);
 assert.ok(fiber);
 fiber.x=n.x;fiber.y=n.y;fiber.z=n.z||0;
 assert.equal(c.WorldRuntime.advanceProject(s,n),true);
 assert.equal(n.task.key,'collect_fiber');
 const command=n.task.commandId;
 fiber.stock=0; // External depletion between reservation and physical commitment.
 const stock=copy(n.inventory);
 for(let i=0;i<5&&n.task;i++)c.Simulation.advance(s,1);
 const failure=s.receipts.find(x=>x.commandId===command&&x.status==='FAILED');
 assert.ok(failure,'The contested physical action must fail authoritatively');
 assert.equal(p.status,'BLOCKED');
 assert.equal(p.nodes.find(x=>x.id==='fiber').failures,1);
 assert.ok(p.nextAt>s.clock,'A failed attempt must not immediately repeat');
 assert.deepEqual(copy(n.inventory),stock,'Failed physical work never mints materials');
});

function setupSupply(){
 const {c,s,n}=setup();
 n.project=null;
 n.inventory.flask=1;
 n.craftedItems.push({kind:'flask',quality:2,maker:n.id,craftedAt:s.clock,
  method:'hollow_wood_trial',materialQuality:2,vesselId:'vessel_901',waterUnits:0});
 const p=c.Projects.create(s,n,'water_supply');
 return {c,s,n,p};
}

test('empty flask and unavailable freshwater defer a durable water-supply project',()=>{
 const {c,s,n,p}=setupSupply();
 const first=c.Projects.next(s,n,[]);
 assert.equal(first.status,'blocked');
 assert.match(p.blockedReason,/fill:LEGAL_ACTION_UNAVAILABLE:fill_water/);
 const delay=p.nextAt-s.clock;
 assert.ok(delay>=15,'Supply failures must not repeat every tick');
 s.clock=p.nextAt;s.world.now=s.clock;
 assert.equal(c.Projects.next(s,n,[]).status,'blocked');
 assert.ok(p.nextAt-s.clock>delay);
 const checkpoint=copy(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,checkpoint),true);
 const restoredNpc=restored.npcs.find(x=>x.id===n.id);
 assert.equal(restoredNpc.project.kind,'water_supply');
 assert.equal(restoredNpc.project.status,'BLOCKED');
 assert.equal(restoredNpc.project.nextAt,p.nextAt);
 assert.equal(restoredNpc.project.blockedReason,p.blockedReason);
 assert.equal(restoredNpc.project.nodes[0].failures,2);
 assert.equal(restoredNpc.inventory.flask,1);
 assert.equal(restoredNpc.craftedItems.find(x=>x.kind==='flask').waterUnits,0);
});

test('water-supply scouting counts completed trips only and stops after four',()=>{
 const {c,s,n,p}=setupSupply(),scout={key:'explore',when:'Reach another vantage point'};
 let choice=c.Projects.next(s,n,[scout]);
 assert.equal(choice.action,'explore');
 assert.equal(p.nodes[0].scouts,0,'Merely choosing movement proves nothing');
 c.Projects.onOutcome(s,n,'explore',false);
 assert.equal(p.nodes[0].scouts,0,'A failed exploratory action must not count');
 assert.ok(p.nextAt>s.clock);
 s.clock=p.nextAt;s.world.now=s.clock;
 for(let i=0;i<4;i++){
  choice=c.Projects.next(s,n,[scout]);
  assert.equal(choice.action,'explore');
  c.Projects.onOutcome(s,n,'explore',true);
  assert.equal(p.nodes[0].scouts,i+1);
  s.clock=p.nextAt;s.world.now=s.clock;
 }
 const blocked=c.Projects.next(s,n,[scout]);
 assert.equal(blocked.status,'blocked');
 assert.match(p.blockedReason,/SCOUT_LIMIT:fill_water/);
 assert.equal(p.nodes[0].scouts,4);
});

test('a blocked water-supply goal permits survival choices but no phantom water',()=>{
 const {c,s,n,p}=setupSupply();
 c.Projects.next(s,n,[]);
 const nextAt=p.nextAt,inventory=copy(n.inventory);
 s.auto=true;n.thoughtAt=s.clock;
 c.WorldRuntime.scheduleOffline(s);
 assert.equal(n.project,p);
 assert.equal(p.status,'BLOCKED');
 assert.equal(p.nextAt,nextAt);
 if(n.task)assert.ok(new Set(['drink','drink_source','eat','forage','rest',
  'explore','inspect','socialize','share_food','none']).has(n.task.key),
  'An unrelated craft must not consume project supplies while waiting');
 assert.deepEqual(copy(n.inventory),inventory);
 assert.equal(n.craftedItems.find(x=>x.kind==='flask').waterUnits,0);
});

test('a newly available spring reopens refill and debits its real stock',()=>{
 const {c,s,n,p}=setupSupply();
 assert.equal(c.Projects.next(s,n,[]).status,'blocked');
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=2);
 assert.ok(spring);
 spring.x=n.x;spring.y=n.y;spring.z=0;
 const before=spring.stock;
 s.clock=p.nextAt;s.world.now=s.clock;
 assert.equal(c.WorldRuntime.available(s,n).some(x=>x.key==='fill_water'),true);
 assert.equal(c.WorldRuntime.advanceProject(s,n),true);
 assert.equal(n.task.key,'fill_water');
 c.Simulation.advance(s,1);
 assert.equal(p.status,'COMPLETED');
 assert.equal(spring.stock,before-2);
 assert.equal(n.inventory.water,2);
 assert.equal(n.craftedItems.find(x=>x.kind==='flask').waterUnits,2);
 assert.equal(s.receipts.filter(x=>x.action==='fill_water'&&x.status==='COMPLETED').length,1);
 assert.equal(p.nodes[0].failures,0);
 assert.equal(p.nodes[0].scouts,0);
});

test('a contested spring reservation backs off refill without creating water',()=>{
 const {c,s,n}=setupSupply();
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=2);
 spring.x=n.x;spring.y=n.y;spring.z=0;spring.stock=2;spring.max=2;
 const peer=c.Civilization.person(s.world,2,s.clock,{x:n.x,y:n.y,z:0});
 peer.energy=100;
 peer.inventory.flask=1;
 peer.craftedItems.push({kind:'flask',quality:2,maker:peer.id,craftedAt:s.clock,
  method:'hollow_wood_trial',materialQuality:2,vesselId:'vessel_902',waterUnits:0});
 c.Projects.create(s,peer,'water_supply');
 s.npcs=[n,peer];
 assert.equal(c.WorldRuntime.begin(s,n,'fill_water'),true);
 assert.equal(c.WorldRuntime.advanceProject(s,peer),false,
  'Second resident must not consume already-reserved spring water');
 assert.equal(peer.project.status,'BLOCKED');
 assert.equal(peer.project.nodes[0].failures,1);
 assert.ok(peer.project.nextAt-s.clock>=15);
 assert.equal(peer.inventory.water,0);
 assert.equal(peer.craftedItems.find(x=>x.kind==='flask').waterUnits,0);
 assert.equal(spring.stock,2,'An uncommitted reservation does not deplete stock');
 c.Simulation.advance(s,1);
 assert.equal(spring.stock,0);
 assert.equal(n.inventory.water,2);
 assert.equal(peer.inventory.water,0);
});
