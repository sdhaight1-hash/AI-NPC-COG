import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const context={};
 for(const name of ['frontier.js','biology.js','crafting.js','cognition.js',
  'agency.js','emergence.js','civilization.js']){
  vm.runInNewContext(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),context);
 }
 const world=context.AgentWorld.newWorld(379210);
 const [npc,other]=context.Civilization.founders(world);
 world.now=490;
 return {...context,world,npc,other};
}
test('personal trait differences rank the same legal options differently',()=>{
 const {Agency:A,world,npc,other}=setup();
 const options=[{key:'inspect'},{key:'socialize'}];
 Object.assign(npc.traits,{exploratoryOrientation:1,socialOrientation:.25});
 Object.assign(other.traits,{exploratoryOrientation:.25,socialOrientation:.9});
 npc.personality='A gentle expressive companion';
 other.personality='A curious adventurous explorer';
 npc.needs.curiosity=65;npc.needs.social=65;
 other.needs.curiosity=65;other.needs.social=65;
 const curious=A.ranked(npc,options,world,490);
 const social=A.ranked(other,options,world,490);
 assert.equal(curious[0].key,'inspect');
 assert.equal(social[0].key,'socialize');
});
test('physiological needs and personal projects change relative action utility',()=>{
 const {Agency:A,world,npc}=setup();
 const options=[{key:'explore'},{key:'drink'},{key:'stock_water'}];
 npc.needs.thirst=15;npc.inventory.water=2;npc.needs.curiosity=90;
 assert.equal(A.choose(npc,options,world,490).key,'explore');
 npc.needs.thirst=95;npc.inventory.water=1;
 assert.equal(A.choose(npc,options,world,500).key,'drink');
 A.begin(npc,'stock_water',500,'self-directed goal');
 assert.equal(A.state(npc).goal.key,'stock_water');
 const ongoing=A.score(npc,{key:'stock_water'},world,501);
 const fresh=A.score(npc,{key:'stock_water'},world,502);
 assert.equal(ongoing,fresh,'Goals are stable without new evidence');
 A.finish(npc,true,503);
 assert.equal(A.state(npc).completedGoals,1);
 assert.equal(A.state(npc).goal,null);
});
test('believed resources must be physically witnessed, remain private, and can be revised',()=>{
 const {Agency:A,world,npc,other}=setup();
 const stone=world.nodes.find(n=>n.kind==='stone');
 assert.ok(stone);
 assert.equal(A.state(npc).beliefs.length,0);
 A.outcome(npc,world,'collect_stone',stone.id,true,500);
 assert.equal(A.state(npc).beliefs.length,1);
 assert.equal(A.state(other).beliefs.length,0);
 let b=A.state(npc).beliefs[0];
 assert.equal(b.ref,stone.id);
 assert.equal(b.stock,stone.stock);
 assert.equal(b.status,'available');
 assert.equal(A.score(npc,{key:'collect_stone',ref:stone.id},world,501)>
  A.score(other,{key:'collect_stone',ref:stone.id},world,501),true);
 stone.stock=0;
 assert.equal(A.state(npc).beliefs[0].status,'available',
  'An unseen world change must not telepathically rewrite the belief');
 A.outcome(npc,world,'inspect',stone.id,true,510);
 b=A.state(npc).beliefs[0];
 assert.equal(b.status,'depleted','New evidence revises the prior belief');
 assert.equal(b.stock,0);
 A.outcome(npc,world,'collect_stone',stone.id,false,520);
 assert.equal(b.status,'failed','Failure records uncertainty rather than inventing stock');
});
test('experienced failures, practice and current intention feed back into future choices',()=>{
 const {Agency:A,Cognition:C,world,npc}=setup();
 const options=[{key:'inspect'},{key:'explore'}];
 npc.needs.curiosity=70;
 const baseline=A.score(npc,options[0],world,500);
 A.begin(npc,'inspect',500,'rein');
 assert.equal(A.score(npc,options[0],world,501)>baseline,true);
 A.outcome(npc,world,'inspect',null,true,502);
 assert.ok(A.state(npc).goal.progress>0);
 A.finish(npc,true,503);
 const learned=A.score(npc,options[0],world,504);
 assert.ok(learned>baseline);
 C.record(npc,'Inspected the site but access failed',505,
  {kind:'failure',action:'inspect',salience:3});
 assert.ok(A.score(npc,options[0],world,506)<learned-30);
});
test('agency save migration preserves only bounded believable data',()=>{
 const {Agency:A,npc,world}=setup();
 A.begin(npc,'stock_fiber',500,'rein');
 const fiber=world.nodes.find(o=>o.kind==='fiber');
 A.outcome(npc,world,'collect_fiber',fiber.id,true,510);
 const saved=JSON.parse(JSON.stringify(npc.agency));
 const {npc:copy}=setup();
 A.restore(copy,saved,520);
 assert.equal(A.state(copy).goal.key,'stock_fiber');
 assert.equal(A.state(copy).beliefs[0].ref,fiber.id);
 const bad={goal:{key:'x'.repeat(300),startedAt:800,progress:-5},
  beliefs:[{ref:'evil',kind:'stone',x:0,y:0,confidence:-50,at:9999}],
  practice:{curiosity:1000},completedGoals:Infinity};
 A.restore(copy,bad,520);
 assert.equal(A.state(copy).goal,null);
 assert.equal(A.state(copy).beliefs.length,0);
 assert.equal(A.state(copy).practice.curiosity,5);
 assert.equal(A.state(copy).completedGoals,0);
});
