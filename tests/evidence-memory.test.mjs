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
 return {E:c.EvidenceMemory,P:c.Perception,c,sim,a,b,world};
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
 const genuine=committed(sim,a,'explore',null,'evt_100');
 const injected=E.record(sim,a,{type:'action',
  text:'Invented a gold mine, learned the best recipe',
  receiptId:genuine.id,fact:{key:'stock',value:999}});
 assert.equal(injected.text,'Completed explore');
 assert.equal(E.state(a).facts.length,0,
  'Real receipt must not authenticate arbitrary generated stock claims');
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
 const belief=E.belief(a,'spring_1','stock',sim.clock);
 assert.equal(belief.contradictory,true);
 assert.equal(belief.certainty,'inferred');
 assert.equal(belief.value,'2');
 assert.equal(belief.sourceEpisodeIds.length,2);
 assert.ok(belief.confidence<0.9);
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

test('legacy v3 recollections migrate without counterfeit physical provenance',()=>{
 const {E,sim,a}=setup();
 const legacy=[{text:'I remember a river in the west',at:930,
  ref:'river_2',x:4,y:6,salience:3}];
 E.restore(a,undefined,sim.clock,legacy);
 const migrated=E.recall(a,'river west',sim.clock,2);
 assert.equal(migrated.length,1);
 assert.equal(migrated[0].certainty,'reported');
 assert.equal(migrated[0].receiptId,null);
 assert.equal(E.state(a).facts.length,0);
 assert.equal(E.state(a).summaries.length,0);
});

test('procedural and relationship recollections follow verified effects, never grant them',()=>{
 const {E,sim,a,b}=setup();
 a.knowledge={recipes:['shelter']};
 const discovery=committed(sim,a,'experiment_wood_fiber',null,'evt_301');
 discovery.delta={knowledge:{learnedMethods:['shelter']}};
 E.fromReceipt(sim,a,discovery);
 assert.equal(E.state(a).methods.length,1);
 assert.equal(E.state(a).methods[0].method,'shelter');
 assert.equal(E.state(a).methods[0].receiptId,'evt_301');
 const social=committed(sim,a,'share_food',b.id,'evt_302');
 E.fromReceipt(sim,a,social);
 assert.equal(E.state(a).social[0].actorId,b.id);
 assert.equal(E.state(a).social[0].sourceEpisodeId,'ev_2');
 assert.equal(a.relationships,undefined,
  'Remembering exchange must not create friendship');
 assert.equal(E.state(b).social.length,0);
 const clone={id:a.id,x:a.x,y:a.y,z:0};
 E.restore(clone,JSON.parse(JSON.stringify(E.state(a))),sim.clock);
 assert.equal(JSON.stringify(E.state(clone)),JSON.stringify(E.state(a)));
});
test('working memory is a view of actual task progress, not a made-up activity',()=>{
 const {E,a}=setup();
 a.project={goal:'Finish a shelter'};
 a.task={key:'craft_stage',commandId:'cmd_32'};
 a.currentActivity={workRequired:20,workDone:9};
 assert.equal(E.working(a).goal,'Finish a shelter');
 assert.equal(E.working(a).task,'craft_stage');
 assert.equal(E.working(a).remainingMinutes,11);
 assert.equal(E.state(a).episodes.length,0);
});

test('physical evidence receipts are single-use and cannot be replayed later',()=>{
 const {E,sim,a,world}=setup();
 const receipt=committed(sim,a,'inspect','spring_1','evt_500');
 const original=E.fromReceipt(sim,a,receipt);
 assert.ok(original);
 assert.equal(E.record(sim,a,{type:'inspection',text:'new stock',
  ref:'spring_1',receiptId:receipt.id}),null,
  'Direct recording cannot duplicate a receipt already committed');
 assert.equal(E.state(a).facts.length,1);
 sim.clock+=10;world.nodes[0].stock=0;
 assert.equal(E.record(sim,a,{type:'inspection',text:'now empty',
  ref:'spring_1',receiptId:receipt.id}),null,
  'An old receipt cannot certify an observation at a later clock');
 assert.equal(E.state(a).facts[0].value,'7');
 const other=committed(sim,a,'inspect','spring_1','evt_501');
 const observed=E.record(sim,a,{type:'inspection',text:'observe again',
  ref:'spring_1',receiptId:other.id});
 assert.ok(observed);
 assert.equal(E.state(a).facts[1].value,'0');
});
test('an unused old receipt cannot certify a later changed world state',()=>{
 const {E,sim,a,world}=setup();
 const receipt=committed(sim,a,'inspect','spring_1','evt_600');
 sim.clock+=20;world.nodes[0].stock=0;
 assert.equal(E.record(sim,a,{type:'inspection',text:'stale',
  ref:'spring_1',receiptId:receipt.id}),null);
 assert.equal(E.state(a).episodes.length,0);
 assert.equal(E.state(a).facts.length,0);
});

test('verified exchange records private attributed reported speech for both actors',()=>{
 const {E,sim,a,b}=setup();
 a.name='Asha';b.name='Mara';
 const receipt=committed(sim,a,'socialize',b.id,'evt_700');
 const beforeA=JSON.stringify(a.inventory),beforeB=JSON.stringify(b.inventory);
 const result=E.fromDialogue(sim,a,b,receipt,
  'There is a hidden gold mine by the river',
  'I know an impossible shelter recipe');
 assert.equal(result.length,2);
 for(const [n,peer] of [[a,b],[b,a]]){
  const e=E.state(n).episodes[0];
  assert.equal(e.receiptId,receipt.id);
  assert.equal(e.certainty,'reported');
  assert.equal(e.type,'interaction');
  assert.equal(e.ref,peer.id);
  assert.deepEqual(Array.from(e.utterances.map(u=>u.actorId)),[a.id,b.id]);
  assert.equal(E.state(n).facts.length,0);
  assert.equal(E.state(n).methods.length,0);
 }
 assert.notEqual(E.state(a).episodes[0],E.state(b).episodes[0]);
 E.state(a).episodes[0].utterances[0].text='Changed privately';
 assert.notEqual(E.state(b).episodes[0].utterances[0].text,'Changed privately');
 assert.equal(JSON.stringify(a.inventory),beforeA);
 assert.equal(JSON.stringify(b.inventory),beforeB);
 assert.equal(E.fromDialogue(sim,a,b,receipt,'again','again'),null,
  'Replayed completed receipt must never create duplicate speech memory');
});
test('dialogue memory rejects forged, stale, failed, and nonparticipant receipts',()=>{
 const {E,sim,a,b}=setup();
 const stranger={id:'person_3',x:2,y:3,z:0,name:'Stranger'};
 sim.npcs.push(stranger);
 const receipt=committed(sim,a,'socialize',b.id,'evt_701');
 assert.equal(E.fromDialogue(sim,stranger,b,receipt,'forged','words'),null);
 assert.equal(E.fromDialogue(sim,a,stranger,receipt,'forged','words'),null);
 assert.equal(E.fromDialogue(sim,a,b,{...receipt,status:'FAILED'},'no','no'),null);
 assert.equal(E.fromDialogue(sim,a,b,{...receipt,action:'inspect'},'no','no'),null);
 assert.equal(E.fromDialogue(sim,a,b,receipt,'','no'),null);
 sim.clock+=1;
 assert.equal(E.fromDialogue(sim,a,b,receipt,'old','old'),null);
 assert.equal(E.state(a).episodes.length,0);
 assert.equal(E.state(b).episodes.length,0);
});
test('dialogue attribution survives save/restore as reported, never witnessed',()=>{
 const {E,sim,a,b}=setup();
 a.name='Asha';b.name='Mara';
 const receipt=committed(sim,a,'socialize',b.id,'evt_702');
 E.fromDialogue(sim,a,b,receipt,'I found a stream','Maybe it is dry');
 const copy=JSON.parse(JSON.stringify(E.state(b)));
 const restored={id:b.id,x:b.x,y:b.y,z:b.z};
 E.restore(restored,copy,sim.clock);
 assert.equal(JSON.stringify(E.state(restored)),JSON.stringify(E.state(b)));
 assert.equal(E.state(restored).episodes[0].certainty,'reported');
 assert.equal(E.state(restored).facts.length,0);
});

test('explicit personally observed source citation becomes private hearsay, not world truth',()=>{
 const {E,sim,a,b}=setup();a.name='Asha';b.name='Mara';
 const inspect=committed(sim,a,'inspect','spring_1','evt_801');
 assert.ok(E.fromReceipt(sim,a,inspect));
 sim.clock++;
 const exchange=committed(sim,a,'socialize',b.id,'evt_802');
 E.fromDialogue(sim,a,b,exchange,'Fresh water at [source:spring_1]','I will look.');
 assert.equal(E.state(a).claims.length,0);
 assert.equal(E.state(b).claims.length,1);
 const claim=E.state(b).claims[0];
 assert.equal(claim.status,'unverified');
 assert.equal(claim.kind,'water');
 assert.equal(claim.sourceId,'spring_1');
 assert.equal(claim.sourceEpisodeId,'ev_1');
 assert.equal(claim.speechReceiptId,'evt_802');
 assert.equal(E.state(b).facts.length,0);
 assert.equal(b.inventory.water,0);
 const saved=JSON.parse(JSON.stringify(E.state(b)));
 const clone={id:b.id,x:b.x,y:b.y,z:b.z};
 E.restore(clone,saved,sim.clock);
 assert.equal(JSON.stringify(E.state(clone)),JSON.stringify(E.state(b)));
 sim.clock++;
 const observed=committed(sim,b,'inspect','spring_1','evt_803');
 E.fromReceipt(sim,b,observed);
 assert.equal(E.state(b).claims[0].status,'supported');
 assert.equal(E.state(b).claims[0].verificationReceiptId,'evt_803');
 assert.equal(E.state(a).claims.length,0);
});
test('fabricated, unspoken or unsupported source tags never become transmitted claims',()=>{
 const {E,sim,a,b}=setup();a.name='Asha';b.name='Mara';
 const exchange=committed(sim,a,'socialize',b.id,'evt_804');
 E.fromDialogue(sim,a,b,exchange,'I saw [source:spring_1]','Okay');
 assert.equal(E.state(b).claims.length,0,'Invented reference must not gain provenance');
 sim.clock++;
 const proof=committed(sim,a,'inspect','spring_1','evt_805');
 E.fromReceipt(sim,a,proof);
 sim.clock++;
 const next=committed(sim,a,'socialize',b.id,'evt_806');
 E.fromDialogue(sim,a,b,next,'Water is somewhere near us','Perhaps');
 assert.equal(E.state(b).claims.length,0,'Unspoken source tag cannot transfer data');
 const forged=JSON.parse(JSON.stringify(E.state(b)));
 forged.claims.push({id:'fake',speakerId:a.id,sourceId:'spring_1',kind:'water',
  x:2,y:4,z:0,at:sim.clock,sourceEpisodeId:'ev_1',
  speechEpisodeId:E.state(b).episodes.at(-1).id,
  speechReceiptId:'evt_806',status:'unverified',verificationReceiptId:null});
 const clone={id:b.id,x:b.x,y:b.y,z:b.z};
 E.restore(clone,forged,sim.clock);
 assert.equal(E.state(clone).claims.length,0,'Tampered save without spoken tag is rejected');
});

test('historical failed gather cannot be replayed after later depletion',()=>{
 const {E,sim,a,b,world}=setup();
 a.name='Asha';b.name='Mara';
 const inspection=committed(sim,a,'inspect','spring_1','evt_910');
 E.fromReceipt(sim,a,inspection);
 sim.clock++;
 const speech=committed(sim,a,'socialize',b.id,'evt_911');
 E.fromDialogue(sim,a,b,speech,'Visit [source:spring_1]','Thanks');
 assert.equal(E.state(b).claims[0].status,'unverified');
 const failed=committed(sim,b,'fill_water','spring_1','evt_912');
 failed.status='FAILED';
 sim.clock+=10;
 world.nodes[0].stock=0;
 assert.equal(E.fromFailedReceipt(sim,b,failed),0);
 assert.equal(E.state(b).claims[0].status,'unverified');
});

test('verified resource reports calibrate speaker reliability without creating friendship',()=>{
 const {E,sim,a,b,world}=setup();
 a.name='Asha';b.name='Mara';
 world.nodes.push({id:'stone_2',kind:'stone',stock:5,max:8,x:3,y:3});
 const initial=E.speakerReliability(b,a.id);
 assert.equal(initial.score,.5);
 assert.equal(initial.samples,0);
 const first=committed(sim,a,'inspect','spring_1','evt_920');
 E.fromReceipt(sim,a,first);
 const second=committed(sim,a,'inspect','stone_2','evt_921');
 E.fromReceipt(sim,a,second);
 sim.clock++;
 const speech=committed(sim,a,'socialize',b.id,'evt_922');
 E.fromDialogue(sim,a,b,speech,
  'Water [source:spring_1], stone [source:stone_2]','I will check.');
 const prior=E.speakerReliability(b,a.id);
 assert.equal(prior.samples,0);
 assert.equal(prior.unverified,2);
 assert.equal(prior.score,.5);
 sim.clock++;
 const observed=committed(sim,b,'inspect','spring_1','evt_923');
 E.fromReceipt(sim,b,observed);
 const positive=E.speakerReliability(b,a.id);
 assert.equal(positive.samples,1);
 assert.equal(positive.supported,1);
 assert.equal(positive.score,2/3);
 assert.equal(E.speakerReliability(a,b.id).samples,0);
 // Simulated resource reclassification tests a real contradictory inspection.
 world.nodes[1].kind='water';
 sim.clock++;
 const contrary=committed(sim,b,'inspect','stone_2','evt_924');
 E.fromReceipt(sim,b,contrary);
 const mixed=E.speakerReliability(b,a.id);
 assert.equal(mixed.samples,2);
 assert.equal(mixed.supported,1);
 assert.equal(mixed.contradicted,1);
 assert.equal(mixed.score,.5);
 assert.equal(b.relationships,undefined);
 assert.equal(b.trust,undefined);
 assert.equal(E.fromReceipt(sim,b,contrary),null);
 assert.equal(E.speakerReliability(b,a.id).samples,2);
 const clone={id:b.id,x:b.x,y:b.y,z:0};
 E.restore(clone,JSON.parse(JSON.stringify(E.state(b))),sim.clock);
 assert.deepEqual(E.speakerReliability(clone,a.id),mixed);
});
test('stale source or unsupported claimed verification does not affect reliability',()=>{
 const {E,sim,a,b}=setup();a.name='Asha';b.name='Mara';
 const inspection=committed(sim,a,'inspect','spring_1','evt_930');
 E.fromReceipt(sim,a,inspection);
 sim.clock++;
 const speech=committed(sim,a,'socialize',b.id,'evt_931');
 E.fromDialogue(sim,a,b,speech,'Try [source:spring_1]','Okay');
 const claim=E.state(b).claims[0];
 claim.status='stale';claim.failureReceiptId='evt_932';
 assert.equal(E.speakerReliability(b,a.id).score,.5);
 assert.equal(E.speakerReliability(b,a.id).stale,1);
 claim.status='supported';claim.verificationReceiptId='made_up';
 assert.equal(E.speakerReliability(b,a.id).samples,0,
  'A claim status without an actual firsthand inspection cannot boost a speaker');
});
