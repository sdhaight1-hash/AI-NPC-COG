// Dependency-free headless simulation and deterministic state fingerprint.
// Usage: node scripts/headless.mjs [ticks=10000] [seed=379210] [--auto] [--trace=trace.jsonl]
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
for(const name of ['frontier','biology','crafting','cognition','agency',
 'emergence','civilization','receipts','activities','resource-reservations','world-runtime','simulation','persistence']){
 await import('../public/'+name+'.js');
}
const ticks=Number(process.argv[2]??10000);
const seed=Number(process.argv[3]??379210);
if(!Number.isInteger(ticks)||ticks<0||ticks>1000000||
 !Number.isInteger(seed)||seed<1||seed>2147483646)
 throw Error('ticks must be 0..1000000 and seed 1..2147483646');
const state=globalThis.Simulation.initial(seed);
state.auto=process.argv.includes('--auto'); // Model-free autonomous work is optional.
const initialPopulation=state.npcs.length;
const deaths=[];
let arrivals=0;
for(let i=0;i<ticks;i++){
 const result=globalThis.Simulation.advance(state,1);
 arrivals+=result.arrivals.length;
 deaths.push(...result.deaths);
}
const traceArg=process.argv.find(a=>a.startsWith('--trace='));
if(traceArg)writeFileSync(traceArg.slice('--trace='.length),
 state.receipts.map(r=>JSON.stringify(r)).join('\n')+'\n');
const outcomes=Object.fromEntries(['ACCEPTED','DECIDED','REJECTED','COMPLETED','FAILED']
 .map(status=>[status,state.receipts.filter(r=>r.status===status).length]));
const sha256=createHash('sha256')
 .update(globalThis.Simulation.canonical(state)).digest('hex');
console.log(JSON.stringify({
 seed,ticks,simulatedMinutes:state.clock-490,clock:state.clock,
 initialPopulation,alive:state.npcs.length,arrivals,deaths:deaths.length,
 worldHash:sha256,modelCalls:0,recordedReceipts:state.receipts.length,
 effectsCommitted:state.effectRevision,outcomes
},null,2));
