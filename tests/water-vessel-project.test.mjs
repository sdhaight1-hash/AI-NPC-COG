import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const c=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0];
 s.npcs=[n];n.energy=100;n.needs.thirst=50;n.bio.hydrationBudgetMl=2100;
 const sources=['water','fiber','stone','wood'].map(kind=>{
  const node=s.world.nodes.find(x=>x.kind===kind&&x.stock>=3);
  assert.ok(node,kind+' finite source is required');
  return node;
 });
 // Relocate actual finite source objects to walkable, observed ground for
 // this controlled end-to-end fixture; never grant supplies to inventory.
 const locations=[{x:n.x,y:n.y,z:0},...c.Frontier.neighbors(s.world,n)
  .filter(p=>c.Frontier.traversable(s.world,p.x,p.y,p.z||0))].slice(0,4);
 for(let i=0;i<sources.length;i++){
  const p=locations[i%locations.length];sources[i].x=p.x;sources[i].y=p.y;sources[i].z=0;
  sources[i].stock=Math.max(6,sources[i].stock);
  sources[i].max=Math.max(sources[i].stock,sources[i].max);
 }
 s.world.nodes=sources;
 return {c,s,n,sources};
}

test('portable-water need activates only from actor-private evidence and safe enough body',()=>{
 const {c,s,n}=setup();
 assert.equal(n.inventory.flask,0);
 assert.equal(c.Projects.maybeStart(s,n).kind,'water_vessel');
 assert.equal(n.project.goal.includes('flask'),false,'Goal must describe a need, not a secret recipe');
 const newNpc=s.npcs[0];
 newNpc.project=null;newNpc.needs.thirst=95;
 assert.notEqual(c.Projects.maybeStart(s,newNpc)?.kind,'water_vessel',
  'Immediate thirst must not initiate lengthy experimentation');
});

test('the project offers physical experiment only until the maker knows the method',()=>{
 const {c,s,n}=setup();
 n.inventory.fiber=3;n.inventory.stone=2;n.inventory.wood=1;
 n.inventory.blade=1;n.inventory.cord=1;
 n.craftedItems.push({kind:'blade',quality:2,maker:n.id,craftedAt:s.clock,
  method:'blade',materialQuality:2},
 {kind:'cord',quality:2,maker:n.id,craftedAt:s.clock,
  method:'cord',materialQuality:2});
 c.Projects.create(s,n,'water_vessel');
 let choice=c.Projects.next(s,n,c.WorldRuntime.available(s,n));
 assert.equal(choice.action,'craft_hollow_wood_trial');
 assert.equal(n.knowledge.recipes.includes('flask'),false);
 n.knowledge.recipes.push('flask');
 s.clock++;s.world.now=s.clock; // Respect the existing project-action cooldown.
 choice=c.Projects.next(s,n,c.WorldRuntime.available(s,n));
 assert.equal(choice.action,'craft_flask',
  'Known procedure uses direct production, not a compulsory rediscovery');
});

test('empty-hand project acquires finite inputs, makes tools, then tests a vessel',()=>{
 const {c,s,n,sources}=setup();
 assert.equal(Object.values(n.inventory).reduce((a,b)=>a+b,0),0);
 const before=copy(sources.map(x=>({id:x.id,kind:x.kind,stock:x.stock})));
 assert.equal(c.Projects.maybeStart(s,n).kind,'water_vessel');
 let completed=false;
 for(let minute=0;minute<700;minute++){
  c.Simulation.advance(s,1);
  if(n.project?.status==='COMPLETED'){completed=true;break;}
 }
 assert.equal(completed,true,n.project?.blockedReason||'Project did not complete');
 assert.equal(n.inventory.flask,1);
 assert.equal(n.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.equal(n.craftedItems.filter(x=>x.kind==='flask').length,1);
 for(const source of before.filter(x=>x.kind!=='water')){
  const current=sources.find(x=>x.id===source.id);
  assert.ok(current.stock<source.stock,source.kind+' must physically deplete');
 }
 const complete=s.receipts.filter(x=>x.status==='COMPLETED').map(x=>x.action);
 for(const action of ['collect_fiber','collect_stone','collect_wood','craft_cord',
  'craft_blade','craft_hollow_wood_trial'])
  assert.ok(complete.includes(action),action+' needs an actual successful receipt');
 assert.ok(s.receipts.some(x=>x.delta?.knowledge?.learnedMethods?.includes('flask')));
 assert.equal(s.receipts.filter(x=>x.action==='craft_flask'&&x.status==='COMPLETED').length,0,
  'The novice could not manufacture from a method it did not yet know');
});
