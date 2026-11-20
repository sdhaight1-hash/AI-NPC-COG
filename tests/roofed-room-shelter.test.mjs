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
 let location=null;
 for(let y=0;y<s.world.height&&!location;y++)
  for(let x=0;x<s.world.width&&!location;x++){
   const c={x,y,z:0};
   if(k.Frontier.traversable(s.world,x,y,0)&&
    k.Frontier.neighbors(s.world,c).filter(p=>p.z===0).length===4)
    location=c;
  }
 assert.ok(location,'A flat walkable room footprint is needed');
 Object.assign(n,location);n.path=[];n.task=null;n.plan=null;
 n.energy=100;n.needs.thirst=10;n.needs.hunger=10;n.bio.hydrationBudgetMl=2800;
 n.inventory.wood=5;n.inventory.fiber=1;n.knowledge.recipes.push('shelter');
 const edges=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({
  x:k.Frontier.wrap(n.x+dx,s.world.width),
  y:k.Frontier.wrap(n.y+dy,s.world.height),z:n.z}));
 return {k,s,n,edges,center:{...location}};
}
function commit(run,kind,position){
 const {k,s,n}=run;
 const planned=k.Construction.plan(s.world,kind,position,n.id);
 assert.ok(planned,'Cannot plan '+kind);
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 assert.equal(n.task.ref,planned.id);
 const commandId=n.task.commandId;
 assert.ok(k.Reservations.active(s).some(r=>
  r.type==='blueprint'&&r.id===planned.id&&r.commandId===commandId));
 k.Simulation.advance(s,18);
 const proof=s.receipts.find(r=>r.commandId===commandId&&r.status==='COMPLETED');
 assert.ok(proof,'Built '+kind+' must be in the authoritative receipt log');
 assert.ok(proof.delta.collections.constructionTiles.added.some(t=>
  t.blueprintId===planned.id&&t.kind===kind));
 return proof;
}
function house(run){
 const {k,s,n,center,edges}=run;
 commit(run,'floor',center);
 for(let i=0;i<edges.length;i++){
  commit(run,i===3?'door':'wall',edges[i]);
  assert.equal(k.Construction.sheltered(s.world,n),false,
   'Walls and a door without a real roof do not grant shelter');
 }
 const roof=k.Construction.plan(s.world,'roof',center,n.id);
 assert.ok(roof);
 assert.equal(k.Construction.sheltered(s.world,n),false,
  'Even a complete roof BLUEPRINT has no weather effect');
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 const commandId=n.task.commandId;
 assert.equal(n.task.ref,roof.id);
 k.Simulation.advance(s,18);
 assert.ok(s.receipts.some(r=>r.commandId===commandId&&r.status==='COMPLETED'));
 assert.equal(k.Construction.sheltered(s.world,n),true);
 assert.equal(n.inventory.wood,0);
 assert.equal(n.inventory.fiber,0);
 assert.equal(s.receipts.filter(r=>r.action==='build_tile'&&r.status==='COMPLETED').length,6);
 return run;
}
test('only an enclosed roofed floor with real walls and a door grants rest/weather shelter',()=>{
 const run=house(setup()),{k,s,n,center,edges}=run;
 const saved=copy(n);
 s.world.weather={...s.world.weather,kind:'storm',temperature:4};
 const indoor=copy(saved),outside=copy(saved);
 indoor.energy=60;outside.energy=60;
 indoor.action='rest';outside.action='rest';
 k.AgentWorld.stepNeeds(indoor,s.world,1);
 const wall=s.world.construction.tiles.find(t=>t.kind==='wall'&&
  t.x===edges[0].x&&t.y===edges[0].y);
 assert.ok(wall);
 s.world.construction.tiles=s.world.construction.tiles.filter(t=>t!==wall);
 assert.equal(k.Construction.sheltered(s.world,n),false,'A new hole removes enclosure');
 k.AgentWorld.stepNeeds(outside,s.world,1);
 assert.ok(indoor.energy>outside.energy,
  'Physical enclosure must improve actual storm rest recovery');
 assert.ok(indoor.energy-outside.energy>0.1);
 assert.equal(k.Frontier.traversable(s.world,center.x,center.y,0),true);
});
test('receipt-backed finished enclosure and its benefit survive a valid v3 checkpoint',()=>{
 const {k,s,n}=house(setup());
 const checkpoint=copy(k.Persistence.save(s));
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,checkpoint),true);
 const actor=restored.npcs.find(p=>p.id===n.id);
 assert.ok(actor);
 assert.equal(restored.world.construction.tiles.length,6);
 assert.equal(k.Construction.sheltered(restored.world,actor),true);
 assert.equal(k.Simulation.canonical(restored.world.construction),
  k.Simulation.canonical(s.world.construction));
 assert.equal(restored.receipts.filter(r=>r.action==='build_tile'&&r.status==='COMPLETED').length,6);
 const cheated=copy(checkpoint);
 cheated.world.construction.tiles.find(t=>t.kind==='roof').commandId='cmd_999';
 const rejected=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(rejected,cheated),true);
 assert.equal(k.Construction.sheltered(rejected.world,
  rejected.npcs.find(p=>p.id===n.id)),false,
  'A roof with no matching consumed-material receipt cannot become physical shelter');
});
