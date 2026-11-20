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
 const n=s.npcs[0];s.npcs=[n];n.energy=100;n.needs.thirst=10;
 n.inventory.wood=1;n.knowledge.recipes.push('shelter');
 const bp=k.Construction.plan(s.world,'floor',{x:n.x,y:n.y,z:n.z||0},n.id);
 assert.ok(bp);
 assert.equal(k.WorldRuntime.begin(s,n,'build_tile'),true);
 k.Simulation.advance(s,18);
 assert.equal(s.world.construction.tiles.length,1);
 assert.equal(s.world.construction.proofs.length,1);
 const r=s.receipts.find(r=>r.action==='build_tile'&&r.status==='COMPLETED');
 assert.ok(r);
 return {k,s,n,bp,r};
}
function load(k,s){
 const restored=k.Simulation.initial(379210);restored.auto=false;
 assert.equal(k.Persistence.restore(restored,copy(k.Persistence.save(s))),true);
 return restored;
}
test('a finished tile survives more than 4096 subsequent log events without minting a new debit',()=>{
 const {k,s,n,r}=setup();
 const proof=copy(s.world.construction.proofs[0]);
 assert.equal(proof.actorId,n.id);
 assert.equal(proof.commandId,r.commandId);
 assert.ok(proof.delta.inventory.some(d=>d.key==='wood'&&d.delta===-1));
 for(let i=0;i<k.WorldReceipts.MAX+8;i++)
  k.WorldReceipts.decision(s,n,'none','test');
 assert.equal(s.receipts.some(row=>row.id===r.id),false,
  'The original construction event must genuinely leave the rolling log');
 assert.equal(s.world.construction.proofs.length,1,
  'A compact physical proof is retained with the built tile, not the log ring');
 const restored=load(k,s);
 assert.equal(restored.world.construction.tiles.length,1);
 assert.equal(restored.world.construction.proofs.length,1);
 assert.equal(restored.npcs.find(p=>p.id===n.id).inventory.wood,0);
 assert.equal(k.Simulation.canonical(restored.world.construction),
  k.Simulation.canonical(s.world.construction));
 const again=load(k,restored);
 assert.equal(again.world.construction.tiles.length,1);
 assert.equal(again.world.construction.proofs.length,1,
  'Another checkpoint cannot discard or duplicate the old construction');
});

test('invalid archived debit or mismatched tile command never grants a physical floor',()=>{
 const {k,s,n,r}=setup();
 for(let i=0;i<k.WorldReceipts.MAX+2;i++)
  k.WorldReceipts.decision(s,n,'none','test');
 const original=copy(k.Persistence.save(s));
 const badDebit=copy(original);
 badDebit.world.construction.proofs[0].delta.inventory
  .find(d=>d.key==='wood').delta=0;
 const forged=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(forged,badDebit),true);
 assert.equal(forged.world.construction.tiles.length,0);
 const wrongCommand=copy(original);
 wrongCommand.world.construction.tiles[0].commandId='cmd_999';
 const rejected=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(rejected,wrongCommand),true);
 assert.equal(rejected.world.construction.tiles.length,0);
 assert.equal(rejected.world.construction.proofs.length,0);
});

test('older valid v3 saves with live receipts reconstruct their new compact proof archive',()=>{
 const {k,s,n}=setup();
 const legacy=copy(k.Persistence.save(s));
 delete legacy.world.construction.proofs;
 const restored=k.Simulation.initial(379210);
 assert.equal(k.Persistence.restore(restored,legacy),true);
 assert.equal(restored.world.construction.tiles.length,1);
 assert.equal(restored.world.construction.proofs.length,1);
 assert.equal(restored.world.construction.proofs[0].actorId,n.id);
});
