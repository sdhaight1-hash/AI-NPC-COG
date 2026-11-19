import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 const c=vm.createContext({});
 for(const file of ['frontier','perception','evidence-memory'])
  vm.runInContext(readFileSync(new URL('../public/'+file+'.js',import.meta.url),'utf8'),c);
 const actor=id=>({id,x:2,y:3,z:0,needs:{hunger:20,thirst:30},
  inventory:{water:0},energy:80});
 const a=actor('person_1'),b=actor('person_2');
 const world={width:20,height:20,seed:4,terrain:Array(400).fill('meadow'),
  edits:{},nodes:[{id:'spring_1',kind:'water',stock:7,max:9,x:2,y:4}],
  items:[],structures:[],weather:{kind:'clear'}};
 const sim={clock:10000,npcs:[a,b],world,receipts:[]};
 c.EvidenceMemory.state(a);c.EvidenceMemory.state(b);
 return {E:c.EvidenceMemory,P:c.Perception,c,sim,a,b};
}
function committed(sim,actor,action,ref,id){
 const receipt={id,clock:sim.clock,actorId:actor.id,action,targetId:ref,
  status:'COMPLETED'};
 sim.receipts.push(receipt);return receipt;
}
test('old useful water observation ranks over twenty unrelated recent events',()=>{
 const {E,sim,a}=setup();
 sim.clock=1440;
 const old=committed(sim,a,'inspect','spring_1','evt_1');
 E.record(sim,a,{type:'inspection',text:'Fresh water spring location near meadow',
  ref:'spring_1',receiptId:old.id,salience:4,fact:{key:'stock',value:7}});
 sim.clock=10000;
 for(let i=0;i<20;i++){
  const event=committed(sim,a,'explore',null,'evt_'+(i+2));
  E.record(sim,a,{type:'action',text:'Walked across an unfamiliar hillside',
   receiptId:event.id});
 }
 const recalled=E.recall(a,'find fresh water spring',sim.clock,3);
 assert.equal(recalled[0].ref,'spring_1');
 assert.equal(recalled[0].certainty,'observed');
 assert.equal(E.state(a).facts.length,1);
});
test('unsupported generated claims cannot become observed facts or a craft method',()=>{
 const {E,sim,a}=setup();
 assert.equal(E.record(sim,a,{type:'inspection',text:'I saw a gold mine',
  receiptId:'fake_1',ref:'mine',fact:{key:'stock',value:99}}),null);
 assert.equal(E.record(sim,a,{type:'action',text:'I invented a recipe',
  receiptId:'fake_1'}),null);
 const report=E.record(sim,a,{type:'personal',text:'Someone claimed a rich deposit'});
 assert.equal(report.certainty,'reported');
 assert.equal(E.state(a).facts.length,0);
 assert.equal(a.inventory.water,0);
 assert.equal(a.knowledge,undefined);
});
test('conflicting observations preserve sources and time instead of overwriting',()=>{
 const {E,sim,a,world}=setup();
 const first=committed(sim,a,'inspect','spring_1','evt_1');
 E.fromReceipt(sim,a,first);
 sim.clock+=50;world.nodes[0].stock=2;
 const second=committed(sim,a,'inspect','spring_1','evt_2');
 E.fromReceipt(sim,a,second);
 assert.deepEqual(Array.from(E.state(a).facts.map(x=>x.value)),['7','2']);
 assert.equal(E.state(a).facts[0].receiptId,'evt_1');
 assert.equal(E.state(a).facts[1].receiptId,'evt_2');
 assert.equal(E.fromReceipt(sim,a,second),null,'Receipt cannot duplicate evidence');
});
test('two inhabitants cannot share evidence or private physiology by reference',()=>{
 const {E,sim,a,b}=setup();
 const receipt=committed(sim,a,'inspect','spring_1','evt_1');
 E.fromReceipt(sim,a,receipt);
 assert.equal(E.recall(b,'spring',sim.clock).length,0);
 assert.notEqual(E.state(a),E.state(b));
 assert.equal(E.state(b).facts.length,0);
 assert.equal(E.record(sim,b,{type:'inspection',text:'saw the spring',
  receiptId:receipt.id}),null,'Actor cannot appropriate another actor receipt');
});
test('daily summaries contain only verified episodes and remain bounded',()=>{
 const {E,sim,a}=setup();
 sim.clock=1440;
 for(let i=0;i<70;i++){
  sim.clock=i*1440+10;
  const receipt=committed(sim,a,'explore',null,'evt_'+(i+1));
  E.fromReceipt(sim,a,receipt);
  sim.clock=(i+1)*1440;
  E.consolidate(sim,a);
 }
 assert.ok(E.state(a).summaries.length<=E.MAX_SUMMARIES);
 assert.ok(E.state(a).episodes.length<=E.MAX_EPISODES);
 assert.ok(E.state(a).summaries.every(x=>x.certainty==='inferred'&&
  x.sourceEpisodeIds.length>0));
 const saved=JSON.parse(JSON.stringify(E.state(a)));
 const restored={id:a.id,x:a.x,y:a.y,z:0};
 E.restore(restored,saved,sim.clock);
 assert.equal(JSON.stringify(E.state(restored)),JSON.stringify(E.state(a)));
});
