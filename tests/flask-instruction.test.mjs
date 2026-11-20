import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','construction','biology','crafting','cognition',
  'agency','emergence','civilization','receipts','activities','reservations',
  'projects','perception','evidence-memory','world-runtime','simulation','persistence'])
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 const s=c.Simulation.initial(379210);s.auto=false;
 const [teacher,learner]=s.npcs;s.npcs=[teacher,learner];
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=3&&
  c.Frontier.traversable(s.world,x.x,x.y,x.z||0));
 assert.ok(spring);
 teacher.x=spring.x;teacher.y=spring.y;teacher.z=spring.z||0;teacher.path=[];
 const nearby=c.Frontier.neighbors(s.world,teacher).find(p=>
  c.Frontier.traversable(s.world,p.x,p.y,p.z||0));
 assert.ok(nearby);
 learner.x=nearby.x;learner.y=nearby.y;learner.z=nearby.z||0;
 learner.path=[];learner.travel=null;learner.energy=100;
 learner.needs.curiosity=80;learner.needs.social=80;
 teacher.energy=100;teacher.needs.social=80;
 Object.assign(teacher.inventory,{wood:1,cord:1,blade:1});
 teacher.craftedItems=[
  {kind:'cord',quality:2,maker:teacher.id,craftedAt:s.clock,method:'cord',materialQuality:2},
  {kind:'blade',quality:2,maker:teacher.id,craftedAt:s.clock,method:'blade',materialQuality:2}
 ];
 return {c,s,teacher,learner};
}
function earnFirsthandMethod({c,s,teacher}){
 assert.equal(c.WorldRuntime.begin(s,teacher,'craft_hollow_wood_trial'),true);
 c.Simulation.advance(s,56);
 assert.equal(teacher.inventory.flask,1);
 assert.equal(teacher.knowledge.recipes.includes('flask'),true);
 assert.ok(teacher.evidenceMemory.methods.some(m=>m.method==='flask'));
 assert.equal(teacher.plan,null);
 teacher.energy=100;
}
function teachReceipt(s,teacher){
 return s.receipts.find(r=>r.actorId===teacher.id&&r.action==='teach_flask'&&
  r.status==='COMPLETED');
}

test('a flask, a recipe flag, or ordinary talk alone cannot teach production',()=>{
 const {c,s,teacher,learner}=setup();
 teacher.knowledge.recipes.push('flask');
 teacher.inventory.flask=1;
 teacher.craftedItems.push({kind:'flask',quality:3,maker:teacher.id,
  craftedAt:s.clock,method:'flask',materialQuality:2,vesselId:'vessel_920',waterUnits:0});
 assert.ok(!c.WorldRuntime.available(s,teacher).some(o=>o.key==='teach_flask'),
  'A recipe flag and product without firsthand method evidence cannot authorize teaching');
 assert.equal(c.WorldRuntime.begin(s,teacher,'teach_flask'),false);
 assert.ok(!learner.knowledge.recipes.includes('flask'));
 // Generic social contact must not grant manufacturing knowledge.
 assert.equal(c.WorldRuntime.begin(s,teacher,'socialize','offline routine'),true);
 c.Simulation.advance(s,3);
 assert.ok(!learner.knowledge.recipes.includes('flask'));
});

test('eight minutes of explicit artifact-backed instruction transfers one taught method',()=>{
 const run=setup(),{c,s,teacher,learner}=run;
 earnFirsthandMethod(run);
 const options=c.WorldRuntime.available(s,teacher);
 assert.ok(options.some(o=>o.key==='teach_flask'&&o.ref===learner.id));
 const prior=copy({teacher:teacher.inventory,learner:learner.inventory,
  sources:s.world.nodes.map(x=>({id:x.id,stock:x.stock}))});
 assert.equal(c.WorldRuntime.begin(s,teacher,'teach_flask'),true);
 assert.ok(!learner.knowledge.recipes.includes('flask'));
 c.Simulation.advance(s,7);
 assert.ok(!learner.knowledge.recipes.includes('flask'),'No lesson is committed before work finishes');
 c.Simulation.advance(s,1);
 assert.equal(learner.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.equal(teacher.inventory.flask,1,'Instructor retains custody of the example vessel');
 assert.deepEqual(copy(teacher.inventory),prior.teacher);
 assert.deepEqual(copy(learner.inventory),prior.learner);
 assert.deepEqual(copy(s.world.nodes.map(x=>({id:x.id,stock:x.stock}))),prior.sources);
 const receipt=teachReceipt(s,teacher);
 assert.ok(receipt);
 assert.equal(receipt.targetId,learner.id);
 const change=receipt.delta.otherActors.find(x=>x.actorId===learner.id);
 assert.deepEqual(copy(change.knowledge.learnedMethods),['flask']);
 const methods=learner.evidenceMemory.methods.filter(x=>x.method==='flask');
 assert.equal(methods.length,1);
 assert.equal(methods[0].receiptId,receipt.id);
 assert.equal(methods[0].taughtBy,teacher.id);
 assert.equal(methods[0].provenance,'instruction');
 const episode=learner.evidenceMemory.episodes.find(x=>x.receiptId===receipt.id);
 assert.equal(episode.certainty,'reported','Instruction is not firsthand proof of making a flask');
 assert.equal(episode.ref,teacher.id);
 assert.equal(c.EvidenceMemory.fromInstruction(s,teacher,learner,receipt),null);
 assert.ok(!c.WorldRuntime.available(s,teacher).some(o=>o.key==='teach_flask'),
  'Already taught resident cannot receive duplicate lessons');
 const checkpoint=copy(c.Persistence.save(s));
 const restored=c.Simulation.initial(379210);restored.auto=false;
 assert.equal(c.Persistence.restore(restored,checkpoint),true);
 const student=restored.npcs.find(x=>x.id===learner.id);
 assert.equal(student.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.equal(student.evidenceMemory.methods.find(x=>x.method==='flask')?.taughtBy,teacher.id);
 assert.equal(student.evidenceMemory.methods.find(x=>x.method==='flask')?.provenance,'instruction');
 assert.ok(student.evidenceMemory.episodes.some(x=>x.receiptId===receipt.id));
});

test('teaching requires the learner to remain present and available through completion',()=>{
 const run=setup(),{c,s,teacher,learner}=run;
 earnFirsthandMethod(run);
 assert.equal(c.WorldRuntime.begin(s,teacher,'teach_flask'),true);
 c.Simulation.advance(s,3);
 const far=Array.from({length:s.world.width*s.world.height},(_,i)=>({
  x:i%s.world.width,y:Math.floor(i/s.world.width),z:0
 })).find(p=>c.Frontier.distance(s.world,teacher,p)>10&&
  c.Frontier.traversable(s.world,p.x,p.y,0));
 assert.ok(far);
 learner.x=far.x;learner.y=far.y;learner.z=0;
 c.Simulation.advance(s,5);
 assert.ok(!learner.knowledge.recipes.includes('flask'));
 assert.equal(teachReceipt(s,teacher),undefined);
 assert.equal(s.receipts.filter(r=>r.action==='teach_flask'&&r.status==='FAILED').length,1);
 assert.equal(learner.evidenceMemory.methods.some(m=>m.method==='flask'),false);
});

test('a knowledgeable instructor does not teach a disinterested or busy resident',()=>{
 const run=setup(),{c,s,teacher,learner}=run;
 earnFirsthandMethod(run);
 learner.needs.curiosity=10;
 assert.equal(c.WorldRuntime.available(s,teacher).some(x=>x.key==='teach_flask'),false);
 learner.needs.curiosity=80;
 learner.task={key:'rest',ref:null,commandId:'cmd_930',reservationIds:[],readyAt:s.clock+10};
 assert.equal(c.WorldRuntime.available(s,teacher).some(x=>x.key==='teach_flask'),false);
});

test('an idle, socially motivated maker autonomously chooses an eligible lesson',()=>{
 const run=setup(),{c,s,teacher,learner}=run;
 earnFirsthandMethod(run);
 teacher.needs.social=86;teacher.needs.thirst=12;teacher.needs.hunger=12;
 teacher.energy=100;teacher.bio.hydrationBudgetMl=2400;
 learner.needs.social=80;learner.needs.curiosity=82;
 learner.thoughtAt=s.clock+90;teacher.thoughtAt=s.clock;
 s.auto=true;
 c.WorldRuntime.scheduleOffline(s);
 assert.equal(teacher.task?.key,'teach_flask',
  'Grounded instruction should be selected before unrelated building projects');
 assert.equal(learner.knowledge.recipes.includes('flask'),false);
 c.Simulation.advance(s,8);
 assert.equal(learner.knowledge.recipes.filter(x=>x==='flask').length,1);
 assert.ok(teachReceipt(s,teacher));
});
