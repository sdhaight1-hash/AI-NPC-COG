import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenarios,runSoak,assertCraftConservation} from '../scripts/benchmarks.mjs';

test('six grounded scenarios satisfy authoritative postconditions',()=>{
 const results=runScenarios(379210);
 assert.equal(results.length,6);
 const failures=results.filter(x=>!x.pass);
 assert.deepEqual(failures,[],JSON.stringify(failures,null,2));
 assert.ok(results.every(x=>x.modelCalls===0));
 assert.ok(results.some(x=>x.scenario==='twelve_operation_hatchet'));
});

test('fixed seed produces identical completion traces and canonical state hashes',()=>{
 const a=runScenarios(379210),b=runScenarios(379210);
 assert.deepEqual(a,b);
});

test('detector rejects deliberately minted output without consumed inputs',()=>{
 assert.doesNotThrow(()=>assertCraftConservation(3,0,1));
 assert.throws(()=>assertCraftConservation(3,3,1),/Manufacturing/);
 assert.throws(()=>assertCraftConservation(3,0,2),/Manufacturing/);
});

test('five-founder autonomy survives a model-free multi-day soak',()=>{
 const result=runSoak(379210,2);
 assert.equal(result.pass,true);
 assert.equal(result.elapsedTicks,2880);
 assert.ok(result.completed>0);
 assert.equal(result.modelCalls,0);
});

test('finite-source survival prevents early deaths on the baseline first-week seed',()=>{
 const result=runSoak(379210,7);
 assert.equal(result.deaths,0,'Five founders must be able to survive the first week with lawful water procurement');
 assert.equal(result.founderSurvivors,5,'No original founder dies before a viable survival routine develops');
 assert.ok(result.completed>0);
 assert.equal(result.modelCalls,0);
});
