import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const k=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];s.npcs=[n];
 let home=null;
 for(let y=0;y<s.world.height&&!home;y++)for(let x=0;x<s.world.width&&!home;x++){
  const p={x,y,z:0},ring=[[1,0],[-1,0],[0,1],[0,-1]]
   .map(([dx,dy])=>({x:k.Frontier.wrap(x+dx,s.world.width),
    y:k.Frontier.wrap(y+dy,s.world.height),z:0}));
  const wood={x:k.Frontier.wrap(x+2,s.world.width),y,z:0};
  const fiber={x,y:k.Frontier.wrap(y+2,s.world.height),z:0};
  const open=[p,...ring,wood,fiber].every(q=>
   k.Frontier.traversable(s.world,q.x,q.y,q.z));
  const clear=[p,...ring].every(q=>!s.world.nodes.some(v=>
   v.x===q.x&&v.y===q.y&&(v.z||0)===q.z));
  if(open&&clear)home={p,wood,fiber};
 }
 assert.ok(home,'A visible clear ground footprint exists on the seeded world');
 Object.assign(n,home.p);n.path=[];n.task=null;n.plan=null;
 n.energy=100;n.needs.thirst=10;n.needs.hunger=10;
 n.bio.hydrationBudgetMl=3000;n.knowledge.recipes.push('shelter');
 return {k,s,n,home};
}
function elapse(run,minutes){
 for(let i=0;i<minutes;i++)run.k.Simulation.advance(run.s,1);
}
function receiptCounts(s){
 return s.receipts.filter(r=>r.status==='COMPLETED'&&r.action==='build_tile');
}
test('only an actor with learned shelter method can commit a time-costed six-plan survey',()=>{
 const {k,s,n,home}=setup();
 const peer=k.Civilization.person(s.world,2,s.clock,{});
 peer.x=n.x;peer.y=n.y;peer.z=n.z;peer.energy=100;
 assert.ok(!k.AgentWorld.available(peer,s.world,[n,peer],()=>true)
  .some(o=>o.key==='design_home'));
 assert.equal(k.Projects.create(s,n,'home')?.kind,'home');
 assert.equal(k.WorldRuntime.advanceProject(s,n),true);
 assert.equal(n.task.key,'design_home');
 assert.equal(s.world.construction.blueprints.length,0,
  'The eight-minute planning action must actually finish');
 elapse({k,s},7);
 assert.equal(s.world.construction.blueprints.length,0);
 elapse({k,s},1);
 assert.equal(s.world.construction.blueprints.length,6);
 assert.equal(n.project.nodes.find(x=>x.id==='survey').status,'DONE');
 assert.deepEqual(copy(n.project.homeSite),home.p);
 const receipt=s.receipts.find(r=>r.action==='design_home'&&r.status==='COMPLETED');
 assert.ok(receipt);
 assert.equal(receipt.delta.collections.constructionBlueprints.added.length,6);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.fiber,0,'Survey is not a free resource delivery');
 assert.equal(k.Construction.sheltered(s.world,n),false,
  'A six-piece design grants no physical shelter');
});

test('resident autonomously obtains real wood and fiber and builds an enclosed roofed house',()=>{
 const run=setup(),{k,s,n,home}=run;
 const sources=['wood','fiber'].map(kind=>{
  const source=s.world.nodes.find(v=>v.kind===kind&&v.stock>=5);
  assert.ok(source,'Real finite '+kind+' stock is needed');
  const destination=home[kind];
  Object.assign(source,destination);
  return source;
 });
 assert.ok(Object.values(n.inventory).every(q=>q===0),
  'The resident starts with literally no possessions');
 const baseline=copy(sources.map(x=>({id:x.id,stock:x.stock})));
 // Existing shelter and campfire remove the earlier survival-infrastructure
 // project priority; this is a housing test, not a claim they built themselves.
 s.world.structures.push({id:'shelter_900',type:'shelter',x:n.x,y:n.y},
  {id:'fire_900',type:'campfire',x:n.x,y:n.y});
 assert.equal(k.Projects.maybeStart(s,n)?.kind,'home');
 let finished=false;
 for(let minute=0;minute<1600;minute++){
  k.Simulation.advance(s,1);
  if(n.project?.status==='COMPLETED'){finished=true;break;}
 }
 assert.equal(finished,true,n.project?.blockedReason||'Autonomous home did not complete');
 assert.equal(s.world.construction.tiles.length,6);
 assert.equal(k.Construction.sheltered(s.world,n.project.homeSite),true);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.fiber,0);
 assert.equal(receiptCounts(s).length,6);
 const design=s.receipts.find(r=>r.action==='design_home'&&r.status==='COMPLETED');
 assert.ok(design);
 assert.equal(design.delta.collections.constructionBlueprints.added.length,6);
 for(const kind of ['wood','fiber']){
  const debits=s.receipts.filter(r=>r.status==='COMPLETED'&&
   r.delta?.nodeStock?.some(d=>d.key===sources.find(x=>x.kind===kind).id&&d.delta<0));
  assert.ok(debits.length>0,'No real '+kind+' extraction receipt');
 }
 const cost=s.receipts.filter(r=>r.action==='build_tile'&&r.status==='COMPLETED')
  .flatMap(r=>r.delta.inventory||[]);
 assert.equal(cost.filter(d=>d.key==='wood'&&d.delta===-1).length,5);
 assert.equal(cost.filter(d=>d.key==='fiber'&&d.delta===-1).length,1);
 assert.ok(n.project.completedActions>=13);
 assert.equal(baseline.length,2);
});

test('partially constructed autonomous home remembers its site and exact plans after checkpoint',()=>{
 const a=setup(),b=setup();
 for(const run of [a,b]){
  run.n.inventory.wood=5;run.n.inventory.fiber=1;
  assert.ok(run.k.Projects.create(run.s,run.n,'home'));
  elapse(run,35);
  assert.ok(run.n.project.homeSite);
  assert.ok(receiptCounts(run.s).length>=1);
  assert.ok(run.s.world.construction.blueprints.length>0);
 }
 const save=copy(b.k.Persistence.save(b.s));
 const restored=b.k.Simulation.initial(379210);restored.auto=false;
 assert.equal(b.k.Persistence.restore(restored,save),true);
 const actor=restored.npcs.find(x=>x.id===b.n.id);
 assert.deepEqual(copy(actor.project.homeSite),copy(b.n.project.homeSite));
 assert.equal(restored.world.construction.blueprints.length,
  b.s.world.construction.blueprints.length);
 assert.equal(restored.world.construction.tiles.length,b.s.world.construction.tiles.length);
 elapse(a,200);
 for(let i=0;i<200;i++)b.k.Simulation.advance(restored,1);
 assert.equal(a.n.project.status,'COMPLETED');
 assert.equal(actor.project.status,'COMPLETED');
 assert.equal(b.k.Simulation.canonical(restored.world.construction),
  a.k.Simulation.canonical(a.s.world.construction));
 assert.equal(b.k.Simulation.canonical(receiptCounts(restored)),
  a.k.Simulation.canonical(receiptCounts(a.s)));
 const later=copy(b.k.Persistence.save(restored));
 const again=b.k.Simulation.initial(379210);again.auto=false;
 assert.equal(b.k.Persistence.restore(again,later),true);
 assert.equal(again.world.construction.tiles.length,6);
 assert.equal(b.k.Construction.sheltered(again.world,actor.project.homeSite),true);
});
