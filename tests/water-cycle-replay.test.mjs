import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const clone=x=>JSON.parse(JSON.stringify(x));
function setup(relocate=true){
 const c=vm.createContext({});
 const modules=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(modules.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];s.npcs=[n];
 n.energy=100;n.needs.thirst=50;n.bio.hydrationBudgetMl=2100;
 assert.ok(Object.values(n.inventory).every(quantity=>quantity===0));
 if(!relocate){
  // The generated map is immutable. For checkpoint replay use a real
  // spring at its seeded coordinates, with physical components on hand.
  const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=2&&
   c.Frontier.traversable(s.world,x.x,x.y,x.z||0));
  assert.ok(spring,'Reachable native spring required for replay');
  n.x=spring.x;n.y=spring.y;n.z=spring.z||0;n.path=[];
  Object.assign(n.inventory,{wood:1,cord:1,blade:1});
  for(const kind of ['cord','blade'])
   n.craftedItems.push({kind,quality:2,maker:n.id,craftedAt:s.clock,
    method:kind,materialQuality:2});
  assert.equal(c.Projects.maybeStart(s,n)?.kind,'water_vessel');
  return {c,s,n};
 }
 // Reposition the already-existing finite nodes; do not mint any stock.
 const kinds=['water','fiber','stone','wood'];
 const nodes=kinds.map(kind=>{
  const min=kind==='fiber'?3:kind==='stone'||kind==='water'?2:1;
  const node=s.world.nodes.find(x=>x.kind===kind&&x.stock>=min);
  assert.ok(node,'Missing actual source: '+kind);
  return node;
 });
 const locations=[{x:n.x,y:n.y,z:0},...c.Frontier.neighbors(s.world,n)
  .filter(p=>c.Frontier.traversable(s.world,p.x,p.y,p.z||0))].slice(0,4);
 assert.equal(locations.length,4);
 for(let i=0;i<nodes.length;i++){
  nodes[i].x=locations[i].x;nodes[i].y=locations[i].y;nodes[i].z=0;
 }
 s.world.nodes=nodes;
 assert.equal(c.Projects.maybeStart(s,n)?.kind,'water_vessel');
 return {c,s,n,initial:clone(nodes.map(x=>({id:x.id,stock:x.stock})))};
}
function advance(c,s,elapsed,rate){
 const schedule=state=>{
  const actor=state.npcs[0];
  if(actor?.project?.kind==='water_vessel'&&
   actor.project.status==='COMPLETED'&&!actor.plan&&!actor.task)
   c.Projects.maybeStart(state,actor);
 };
 // The UI may run at 3600x but the authoritative API deliberately caps
 // direct intervals at 1440 minutes, then slices into one-minute commits.
 let left=elapsed;
 while(left>0){
  const span=Math.min(left,rate,1440);
  c.Simulation.advance(s,span,{schedule});
  left-=span;
 }
}
function verify(c,s){
 const n=s.npcs[0];
 assert.equal(n.project?.kind,'water_supply');
 assert.equal(n.project?.status,'COMPLETED');
 assert.equal(n.inventory.flask,1);
 assert.equal(n.inventory.water,2);
 assert.equal(n.craftedItems.filter(x=>x.kind==='flask').length,1);
 assert.equal(n.craftedItems.find(x=>x.kind==='flask').waterUnits,2);
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 const completed=s.receipts.filter(x=>x.status==='COMPLETED');
 const methods=completed.filter(x=>x.delta?.knowledge?.learnedMethods?.includes('flask'));
 assert.equal(methods.length,1);
 assert.ok(n.evidenceMemory.methods.some(x=>x.receiptId===methods[0].id));
 const fills=completed.filter(x=>x.action==='fill_water');
 assert.equal(fills.length,1);
 assert.equal(fills[0].delta.nodeStock.find(x=>x.key===s.world.nodes.find(x=>x.kind==='water').id).delta,-2);
 for(const kind of ['fiber','stone','wood']){
  const node=s.world.nodes.find(x=>x.kind===kind);
  assert.ok(completed.some(r=>r.delta?.nodeStock?.some(d=>d.key===node.id&&d.delta<0)),
   'Missing stock debit for '+kind);
 }
}
function effects(s){
 const n=s.npcs[0];
 return clone({
  clock:s.clock,
  nodes:s.world.nodes.map(x=>({id:x.id,stock:x.stock})),
  inventory:n.inventory,craftedItems:n.craftedItems,
  knowledge:n.knowledge.recipes,methods:n.evidenceMemory.methods,
  workpiece:n.workpiece,project:{kind:n.project?.kind,status:n.project?.status},
  completedProjects:n.completedProjects,
  operations:s.receipts.filter(x=>x.status==='COMPLETED'&&
   ['collect_fiber','collect_stone','collect_wood','craft_cord','craft_blade',
    'craft_hollow_wood_trial','craft_stage','fill_water'].includes(x.action))
   .map(x=>({action:x.action,commandId:x.commandId,clock:x.clock,
    inventory:x.delta.inventory,stock:x.delta.nodeStock,
    knowledge:x.delta.knowledge?.learnedMethods||[]}))
 });
}

test('the same 720-minute material-to-water cycle is identical at 1x/60x/240x/3600x',()=>{
 const rates=[1,60,240,3600],results=[];
 for(const rate of rates){
  const {c,s}=setup();
  advance(c,s,720,rate);
  verify(c,s);
  results.push(c.Simulation.canonical(c.Persistence.save(s)));
 }
 assert.equal(new Set(results).size,1,'Speed is a scheduling choice, not different physics');
});

test('mid-manufacturing checkpoint preserves water, method and source receipts at 240x',()=>{
 const continuous=setup(false),interrupted=setup(false);
 advance(continuous.c,continuous.s,10,1);
 advance(interrupted.c,interrupted.s,10,1);
 const before=interrupted.n.project;
 assert.equal(before.kind,'water_vessel');
 assert.notEqual(before.status,'COMPLETED','Checkpoint occurs before final product');
 assert.equal(interrupted.n.workpiece?.recipe,'hollow_wood_trial',
  'Checkpoint must interrupt real unfinished manufacture');
 const saved=clone(interrupted.c.Persistence.save(interrupted.s));
 const fresh=interrupted.c.Simulation.initial(379210);fresh.auto=false;
 assert.equal(interrupted.c.Persistence.restore(fresh,saved),true);
 advance(continuous.c,continuous.s,180,1);
 advance(interrupted.c,fresh,180,240);
 verify(continuous.c,continuous.s);
 verify(interrupted.c,fresh);
 assert.deepEqual(effects(fresh),effects(continuous.s),
  'Replay must conserve finished goods, personal technique and authoritative physical receipts');
});
