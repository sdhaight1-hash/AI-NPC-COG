import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function runtime(){
 const root=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),root);
 return root;
}
const clone=x=>JSON.parse(JSON.stringify(x));

test('every founder and newcomer receives stable bounded personal social traits',()=>{
 const k=runtime(),a=k.Simulation.initial(379210),b=k.Simulation.initial(379210);
 const original=clone(a.npcs.map(n=>n.traits));
 assert.deepEqual(original,clone(b.npcs.map(n=>n.traits)));
 for(const t of original){
  assert.ok(t.socialApproach>=0&&t.socialApproach<=1);
  assert.ok(t.solitudePreference>=0&&t.solitudePreference<=1);
 }
 const at=k.Frontier.DAYS_PER_MONTH*1440;
 a.clock=at;a.world.now=at;
 const newcomer=k.Civilization.addArrival(a,at);
 assert.ok(newcomer);
 assert.ok(newcomer.traits.socialApproach>=0&&newcomer.traits.socialApproach<=1);
 assert.deepEqual(clone(newcomer.traits),
  clone(k.Civilization.person(a.world,6,at,newcomer).traits));
});

test('contact and solitude preferences produce distinct pressures under identical bodies',()=>{
 const k=runtime(),world=k.AgentWorld.newWorld(379210);
 world.now=550;
 const example=k.Civilization.person(world,1,490,{x:14,y:14,z:0});
 const social=clone(example),solitary=clone(example);
 social.traits={socialApproach:1,solitudePreference:0};
 solitary.traits={socialApproach:0,solitudePreference:1};
 social.needs.social=20;solitary.needs.social=20;
 k.AgentWorld.stepNeeds(social,world,60);
 k.AgentWorld.stepNeeds(solitary,world,60);
 assert.ok(social.needs.social>solitary.needs.social+2);
 assert.ok(solitary.needs.social>=20,'Solitary characters are not forbidden from bonding');
 assert.equal(social.needs.thirst,solitary.needs.thirst);
 assert.equal(social.bio.hydrationBudgetMl,solitary.bio.hydrationBudgetMl);
});

test('v3 save restores explicit traits and safely derives deterministic old-save defaults',()=>{
 const k=runtime(),state=k.Simulation.initial(379210);
 state.auto=false;
 state.npcs[0].traits={socialApproach:.03,solitudePreference:.97};
 const saved=clone(k.Persistence.save(state));
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,saved),true);
 assert.deepEqual(clone(restored.npcs[0].traits),{socialApproach:.03,solitudePreference:.97});
 // A previous v3 save had no structured traits; restore from seed/index.
 delete saved.npcs[0].traits;
 saved.npcs[1].traits={socialApproach:3,solitudePreference:NaN};
 const older=k.Simulation.initial(379210);older.auto=false;
 const expected=clone(older.npcs.slice(0,2).map(n=>n.traits));
 assert.equal(k.Persistence.restore(older,saved),true);
 assert.deepEqual(clone(older.npcs.slice(0,2).map(n=>n.traits)),expected);
});
