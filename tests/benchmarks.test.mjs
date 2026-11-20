import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenarios,runSoak,assertCraftConservation} from '../scripts/benchmarks.mjs';

test('seven grounded scenarios satisfy authoritative postconditions',()=>{
 const results=runScenarios(379210);
 assert.equal(results.length,7);
 const failures=results.filter(x=>!x.pass);
 assert.deepEqual(failures,[],JSON.stringify(failures,null,2));
 assert.ok(results.every(x=>x.modelCalls===0));
 assert.ok(results.some(x=>x.scenario==='twelve_operation_hatchet'));
 assert.ok(results.some(x=>x.scenario==='interrupted_shelter_resumes'));
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
 assert.equal(result.deaths,0,'Five founders must survive the first week; death evidence: '+
  JSON.stringify(result.deathDetails));
 assert.equal(result.founderSurvivors,5,'No original founder dies before a viable survival routine develops');
 assert.ok(result.completed>0);
 assert.equal(result.modelCalls,0);
});

test('benchmark profiles exercise the same physical runtime and count mocked decisions',()=>{
 const profiles=['no-llm','no-memory','no-planner','mock-model'];
 const reports=profiles.map(profile=>runSoak(379210,0.125,profile));
 assert.deepEqual(reports.map(report=>report.profile),profiles);
 assert.ok(reports.every(report=>report.pass&&report.elapsedTicks===180&&report.completed>0));
 assert.ok(reports.slice(0,3).every(report=>report.modelCalls===0));
 assert.ok(reports[3].modelCalls>0,'The mock-model run must use its private action menu');
 assert.notEqual(reports[0].worldHash,reports[2].worldHash);
});
