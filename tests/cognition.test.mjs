import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const context={};
 for(const path of ['frontier.js','biology.js','crafting.js','cognition.js','agency.js','emergence.js','civilization.js']){
  vm.runInNewContext(readFileSync(new URL('../public/'+path,import.meta.url),'utf8'),context);
 }
 const world=context.AgentWorld.newWorld(379210);
 const npc=context.Civilization.founders(world)[0];world.now=500;
 return {world,npc,...context};
}
test('episodic recall retrieves relevant old experiences rather than only recent messages',()=>{
 const {npc,Cognition:C}=setup();
 C.record(npc,'The wetland spring provides potable fresh water',200,
  {kind:'observation',ref:'spring_1',salience:4});
 for(let i=0;i<70;i++)C.record(npc,'Knapped stone flake trial '+i,220+i,
  {kind:'success',action:'craft_blade',salience:1});
 const found=C.recall(npc,'Where is fresh water near the spring?',510,4);
 assert.ok(found.some(m=>m.ref==='spring_1'),
  'Useful earlier observation must survive recent unrelated events');
 assert.ok(npc.memories.length>24);
 assert.equal(C.recall(npc,'water',510,3).length,3);
});
test('memories are personal and restored with action evidence and bounded size',()=>{
 const {npc,Cognition:C}=setup(),other=setup().npc;
 C.record(npc,'Could not reach stone outcrop',500,
  {kind:'failure',action:'collect_stone',ref:'stone_7',salience:4});
 assert.equal(C.recentFailure(npc,'collect_stone',510),true);
 assert.equal(C.recentFailure(other,'collect_stone',510),false);
 assert.equal(C.recentFailure(npc,'collect_stone',541),false);
 const copy=JSON.parse(JSON.stringify(npc.memories));
 C.restore(other,copy);
 assert.equal(C.recentFailure(other,'collect_stone',510),true);
 assert.equal(other.memories[0].ref,'stone_7');
 for(let i=0;i<250;i++)C.record(npc,'Observed fact '+i,520+i);
 assert.ok(npc.memories.length<=160);
});
test('innate emergency responses prefer real available survival actions',()=>{
 const {npc,Cognition:C}=setup();
 npc.needs.thirst=91;npc.needs.hunger=91;npc.inventory.water=1;
 assert.equal(C.instinct(npc,[{key:'drink'},{key:'eat'},{key:'forage'}]),'drink');
 npc.inventory.water=0;
 assert.equal(C.instinct(npc,[{key:'fill_water'},{key:'eat'}]),'fill_water');
 npc.needs.thirst=10;npc.inventory.food=1; // Deliberately stocked test actor.
 assert.equal(C.instinct(npc,[{key:'eat'},{key:'forage'}]),'eat');
 npc.needs.hunger=10;npc.energy=8;
 assert.equal(C.instinct(npc,[{key:'rest'}]),'rest');
 assert.equal(C.instinct(npc,[{key:'forage'}]),null);
});
test('hunger and dehydration gradually reduce stamina and eventually health',()=>{
 const {npc,world,Civilization:C}=setup();
 const state={clock:500,world,npcs:[npc],dead:[]};
 npc.needs.thirst=75;npc.needs.hunger=75;
 npc.bio.hydrationBudgetMl=350;
 npc.bio.longTermKcal=500;
 const e=npc.energy,h=npc.health;
 C.updateHealth(state,npc,10);
 assert.ok(npc.energy<e,'Significant unmet needs must cost stamina');
 assert.equal(npc.health,h,'Moderate needs should not immediately harm health');
 npc.needs.thirst=95;npc.bio.hydrationBudgetMl=250;
 C.updateHealth(state,npc,10);
 assert.ok(npc.health<h,'Severe dehydration must cause gradual damage');
 const after=npc.health;
 npc.needs.thirst=0;npc.bio.hydrationBudgetMl=2000;
 npc.needs.hunger=95;npc.bio.longTermKcal=100;
 C.updateHealth(state,npc,10);
 assert.ok(npc.health<after,'Severe food shortage must cause gradual damage');
});
test('constrained supply plans persist and collect finite physical materials',()=>{
 const {npc,world,AgentWorld:A}=setup();
 const resources=['water','wood','stone','fiber'];
 for(const kind of resources){
  npc.plan={key:'stock_'+kind,steps:1};
  npc.inventory[kind]=0;npc.energy=100;
  if(kind==='water'){
   // This planning test deliberately supplies an already crafted vessel.
   npc.inventory.flask=1;
   npc.craftedItems=[{kind:'flask',quality:2,maker:npc.id,craftedAt:0,
    method:'flask',materialQuality:2}];
  }
  const target=world.nodes.find(x=>x.kind===kind&&x.stock>0);
  assert.ok(target,'Physical resource required: '+kind);
  npc.x=target.x;npc.y=target.y;
  const plan=A.nextPlanAction(npc,world,[npc],()=>true);
  assert.equal(plan.status,'action',kind);
  npc.task={key:plan.option.key,ref:plan.option.ref};
  assert.equal(A.complete(npc,world,[npc]).ok,true,kind);
  assert.ok(npc.inventory[kind]>0,kind+' must be physically gathered');
  assert.equal(A.validatePlan({key:'stock_'+kind,steps:1}).key,'stock_'+kind);
 }
});

test('hydration instinct scouts, stocks and drinks before dehydration is lethal',()=>{
 const {npc,Cognition:C}=setup();
 const options=['drink','fill_water','explore','eat','rest'].map(key=>({key}));
 npc.inventory.water=1;npc.bio.hydrationBudgetMl=1500;
 npc.needs.thirst=35;
 assert.equal(C.instinct(npc,options),'fill_water',
  'Low reserve should seek finite source while body has time to travel');
 npc.bio.hydrationBudgetMl=1050;
 assert.equal(C.instinct(npc,options),'drink','Drink carried water before critical damage');
 npc.inventory.water=0;
 assert.equal(C.instinct(npc,[{key:'explore'},{key:'rest'}]),'explore',
  'Unfamiliar sources require a legal scouting action, never invented water');
 npc.energy=10;
 assert.equal(C.instinct(npc,[{key:'explore'},{key:'rest'}]),'rest',
  'Exhausted scouting cannot fabricate energy');
 npc.energy=75;npc.inventory.water=2;npc.bio.hydrationBudgetMl=2400;
 npc.needs.thirst=20;
 assert.equal(C.instinct(npc,options),null,'Healthy hydrated actors are not compulsively interrupted');
});

test('episodic locality ranks personally remembered places across both toroidal seams',()=>{
 const {npc,Cognition:C,Frontier:F}=setup();
 npc.x=0;npc.y=0;
 npc.memories=[
  {text:'far inland',at:500,x:20,y:20,salience:1,kind:'observation'},
  {text:'adjacent across eastern seam',at:500,x:F.WIDTH-1,y:0,
   salience:1,kind:'observation'},
  {text:'adjacent across southern seam',at:500,x:0,y:F.HEIGHT-1,
   salience:1,kind:'observation'}
 ];
 const found=C.recall(npc,'',500,3);
 assert.ok(found.findIndex(m=>m.text==='far inland')>0);
 assert.ok(found.findIndex(m=>m.text==='far inland')>
  found.findIndex(m=>m.text==='adjacent across eastern seam'));
 assert.ok(found.findIndex(m=>m.text==='far inland')>
  found.findIndex(m=>m.text==='adjacent across southern seam'));
});
