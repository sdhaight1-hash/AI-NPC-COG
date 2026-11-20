import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','construction','biology','crafting','cognition',
  'agency','emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const n=s.npcs[0],peer=s.npcs[1];
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=4);
 assert.ok(spring);
 s.world.nodes=[spring];n.x=spring.x;n.y=spring.y;n.z=0;n.path=[];
 return {c,s,n,peer,spring};
}
function flask(n,clock,id){
 n.inventory.flask=1;
 n.craftedItems.push({kind:'flask',quality:2,maker:n.id,
  craftedAt:clock,method:'hollow_wood_trial',materialQuality:2,
  vesselId:id,waterUnits:0});
}
const copy=x=>JSON.parse(JSON.stringify(x));
function moveOutsideVision(c,s,n,spring){
 const start={x:n.x,y:n.y,z:0};
 const point=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0})).find(p=>
  c.Frontier.distance(s.world,p,spring)>=5&&
  c.Frontier.distance(s.world,p,spring)<=8&&
  c.Frontier.traversable(s.world,p.x,p.y,0)&&
  c.WorldRuntime.pathfind(s,start,p).length>0);
 assert.ok(point);
 n.x=point.x;n.y=point.y;n.path=[];n.travel=null;
 s.clock=23*60;s.world.now=s.clock;
 assert.equal(c.Perception.canSee(s,n,spring),false);
}
test('seen spring survives a project and a checkpoint without revealing current stock',()=>{
 const {c,s,n,spring}=setup();
 assert.equal(n.knowledge.sightings,undefined);
 assert.ok(c.Projects.create(s,n,'water_vessel'));
 assert.equal(n.knowledge.sightings?.length,1);
 assert.deepEqual(copy(n.knowledge.sightings[0]),
  {id:spring.id,kind:'water',x:spring.x,y:spring.y,z:0,at:490});
 assert.equal(JSON.stringify(n.knowledge.sightings).includes('stock'),false);
 n.project=null;flask(n,s.clock,'vessel_921');
 moveOutsideVision(c,s,n,spring);
 const before=copy(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,before),true);
 const actor=restored.npcs.find(x=>x.id===n.id);
 assert.ok(actor);
 assert.deepEqual(copy(actor.knowledge.sightings),copy(n.knowledge.sightings));
 const source=restored.world.nodes.find(x=>x.id===spring.id);
 assert.equal(c.Perception.canSee(restored,actor,source),false);
 const option=c.WorldRuntime.available(restored,actor).find(o=>o.key==='fill_water');
 assert.equal(option?.ref,spring.id);
 assert.doesNotMatch(option.when,/remaining|stock \d+|\d+ remaining/i);
 const held=source.stock;
 assert.equal(c.WorldRuntime.begin(restored,actor,'fill_water'),true);
 for(let i=0;i<60&&actor.inventory.water<2;i++)c.Simulation.advance(restored,1);
 assert.equal(actor.inventory.water,2);
 assert.equal(actor.craftedItems.find(x=>x.kind==='flask').waterUnits,2);
 assert.equal(restored.receipts.filter(x=>x.action==='fill_water'&&x.status==='COMPLETED').length,1);
 assert.ok(source.stock<=held-1,'Water must come from a physical spring');
});

test('a second person cannot use another resident\'s sighting as knowledge',()=>{
 const {c,s,n,peer,spring}=setup();
 c.Projects.create(s,n,'water_vessel');
 n.project=null;flask(n,s.clock,'vessel_922');
 peer.x=n.x;peer.y=n.y;peer.z=0;flask(peer,s.clock,'vessel_923');
 moveOutsideVision(c,s,n,spring);
 peer.x=n.x;peer.y=n.y;peer.z=0;
 s.npcs=[n,peer];
 assert.ok(c.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'));
 assert.ok(!c.WorldRuntime.available(s,peer).some(o=>o.key==='fill_water'));
 assert.equal(peer.knowledge.sightings,undefined);
});

test('a stale firsthand sighting prompts a physical check but cannot create water',()=>{
 const {c,s,n,spring}=setup();
 c.Projects.create(s,n,'water_vessel');
 n.project=null;flask(n,s.clock,'vessel_924');
 moveOutsideVision(c,s,n,spring);
 spring.stock=0;spring.regrow=0;
 const option=c.WorldRuntime.available(s,n).find(o=>o.key==='fill_water');
 assert.equal(option?.ref,spring.id);
 assert.doesNotMatch(option.when,/depleted|0 remaining|0\/\d+/);
 assert.equal(c.WorldRuntime.begin(s,n,'fill_water'),true);
 for(let i=0;i<60&&!s.receipts.some(x=>x.action==='fill_water'&&x.status==='FAILED');i++)
  c.Simulation.advance(s,1);
 assert.equal(s.receipts.filter(x=>x.action==='fill_water'&&x.status==='FAILED').length,1);
 assert.equal(n.inventory.water,0);
 assert.equal(n.craftedItems.find(x=>x.kind==='flask').waterUnits,0);
 assert.equal(n.agency.beliefs.find(x=>x.ref===spring.id)?.status,'depleted');
 assert.equal(c.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'),false,
  'Recent direct evidence of depletion must supersede a stale sighting');
 s.clock+=60;s.world.now=s.clock;
 assert.ok(c.WorldRuntime.available(s,n).some(o=>o.key==='fill_water'),
  'Later replenishment can justify rechecking an old freshwater source');
});
