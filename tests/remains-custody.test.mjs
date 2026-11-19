import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function runtime(){
 const c=vm.createContext({});
 const modules=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(modules.map(m=>readFileSync(new URL('../public/'+m+'.js',
  import.meta.url),'utf8')).join('\n'),c);
 const state=c.Simulation.initial(379210);state.auto=false;
 return {c,state,actor:state.npcs[0]};
}
const snapshot=x=>JSON.parse(JSON.stringify(x));
const craft=(n,kind,at)=>({kind,quality:3,maker:n.id,craftedAt:at,
 method:kind,materialQuality:2});
function stock(n,clock){
 n.inventory.food=2;n.inventory.water=2;n.inventory.wood=3;
 n.inventory.stone=1;n.inventory.flask=1;
 n.craftedItems=[craft(n,'flask',clock)];
 assert.equal(n.bio.pantry.length,0);
 n.bio.pantry=['nuts','berries'];
}

test('death physically transfers all counted goods, edible identities and crafted quality to one placed remains',()=>{
 const {c,state:s,actor:n}=runtime();stock(n,s.clock);
 const claim=c.Reservations.claim(s,n.id,'cmd_1',
  [{type:'npc',id:n.id,kind:'wood',quantity:2}]);
 assert.equal(claim.ok,true);
 const original=snapshot(n.inventory),pantry=snapshot(n.bio.pantry);
 const created=c.Civilization.die(s,n,'dehydration');
 assert.equal(created,true);
 assert.equal(s.npcs.some(x=>x.id===n.id),false);
 assert.equal(s.dead.filter(x=>x.id===n.id).length,1);
 assert.equal(s.world.remains.length,1);
 const corpse=s.world.remains[0];
 assert.equal(corpse.id,'remains_'+n.id);
 assert.equal(corpse.actorId,n.id);
 assert.deepEqual({x:corpse.x,y:corpse.y,z:corpse.z},{x:n.x,y:n.y,z:n.z});
 assert.deepEqual(snapshot(corpse.inventory),original);
 assert.deepEqual(snapshot(corpse.pantry),pantry);
 assert.equal(corpse.craftedItems[0].kind,'flask');
 assert.equal(corpse.craftedItems[0].quality,3);
 assert.equal(corpse.deathAt,s.clock);
 assert.equal(c.Reservations.active(s).filter(x=>x.actorId===n.id).length,0);
 assert.equal(c.Civilization.die(s,n,'duplicate'),false);
 assert.equal(s.world.remains.length,1);
 assert.equal(s.dead.length,1);
});

test('remains survive version-three save/restore with identical physical custody and no resurrection',()=>{
 const {c,state:s,actor:n}=runtime();stock(n,s.clock);
 assert.equal(c.Civilization.die(s,n,'starvation'),true);
 const expected=snapshot(s.world.remains);
 const saved=snapshot(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,saved),true);
 assert.deepEqual(snapshot(restored.world.remains),expected);
 assert.ok(!restored.npcs.some(p=>p.id===n.id));
 assert.equal(restored.dead.filter(p=>p.id===n.id).length,1);
 const once=snapshot(c.Persistence.save(restored));
 const again=c.Simulation.initial(379210);again.auto=false;
 assert.equal(c.Persistence.restore(again,once),true);
 assert.deepEqual(snapshot(again.world.remains),expected);
});

test('a living witness sees ground remains without learning private contents or memories',()=>{
 const {c,state:s,actor:n}=runtime();stock(n,s.clock);
 n.memories=[{text:'PRIVATE_DEAD_PERSON_MEMORY',at:s.clock}];
 c.Civilization.die(s,n,'dehydration');
 const observer=s.npcs[0];
 observer.x=n.x;observer.y=n.y;observer.z=n.z;
 const packet=c.Perception.snapshot(s,observer);
 assert.ok(packet.objects.some(x=>x.kind==='remains'&&x.id==='remains_'+n.id));
 assert.doesNotMatch(JSON.stringify(packet),/PRIVATE_DEAD_PERSON_MEMORY/);
 assert.doesNotMatch(JSON.stringify(packet),/"nuts"|"berries"|"flask"/,
  'Visible physical presence does not expose contents to an omniscient prompt');
 const info=c.AgentWorld.describeObject(s.world,s.world.remains[0]);
 assert.equal(info.kind,'remains');
});

test('malformed persisted remains cannot mint contents or duplicate identity',()=>{
 const {c,state:s,actor:n}=runtime();stock(n,s.clock);
 c.Civilization.die(s,n,'dehydration');
 const valid=snapshot(c.Persistence.save(s));
 const wrong=snapshot(valid.world.remains[0]);
 wrong.inventory.wood=-1;
 valid.world.remains=[wrong];
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,valid),true);
 assert.equal(restored.world.remains.length,0,'Invalid inventories are not imported');
});

test('an unfinished craft remains physically unfinished, with no refunded raw materials or duplicate death drop',()=>{
 const {c,state:s,actor:n}=runtime();
 n.inventory.fiber=3;
 assert.equal(c.Crafting.begin(n,s.world,'cord').ok,true);
 assert.equal(n.inventory.fiber,0);
 assert.ok(n.workpiece);
 const task=snapshot(n.workpiece);
 assert.equal(c.Civilization.die(s,n,'dehydration'),true);
 assert.equal(s.world.remains.length,1);
 const remains=s.world.remains[0];
 assert.equal(remains.inventory.fiber,0,'Consumed workpiece inputs cannot reappear as raw material');
 assert.deepEqual(snapshot(remains.workpiece),task);
 assert.equal(c.Civilization.die(s,n,'again'),false);
 assert.equal(s.world.remains.length,1);
});
