import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenarios,runSoak,assertCraftConservation} from '../scripts/benchmarks.mjs';

test('eight grounded scenarios satisfy authoritative postconditions',()=>{
 const results=runScenarios(379210);
 assert.equal(results.length,8);
 const failures=results.filter(x=>!x.pass);
 assert.deepEqual(failures,[],JSON.stringify(failures,null,2));
 assert.ok(results.every(x=>x.modelCalls===0));
 assert.ok(results.some(x=>x.scenario==='twelve_operation_hatchet'));
 assert.ok(results.some(x=>x.scenario==='interrupted_shelter_resumes'));
 const vessel=results.find(x=>x.scenario==='empty_hand_autonomous_water_vessel');
 assert.ok(vessel?.pass);
 assert.equal(vessel.learnedMethodReceipts,1);
 assert.equal(vessel.finalVessels,1);
 assert.ok(vessel.completedStages>=9);
 assert.ok(vessel.liveActivityCounters.completed>0);
 for(const key of ['started','completed','failed','blocked','abandoned'])
  assert.ok(Number.isInteger(vessel.liveActivityCounters[key])&&
   vessel.liveActivityCounters[key]>=0,'Malformed '+key+' activity count');
 for(const kind of ['fiber','stone','wood'])
  assert.ok(vessel.sourceDebits[kind]>0,kind+' stock must be physically consumed');
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
 assert.ok(result.liveActivityCounters.completed>=0);
 for(const key of ['blocked','abandoned'])
  assert.ok(Number.isInteger(result.liveActivityCounters[key])&&
   result.liveActivityCounters[key]>=0,key+' must be reported even when zero');
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

test('winter exhaustion seed keeps all founders alive through the second day',()=>{
 const result=runSoak(431117,2,'no-llm',82);
 assert.equal(result.startSeason,'Winter');
 assert.equal(result.deaths,0,'Winter death evidence: '+JSON.stringify(result.deathDetails));
 assert.equal(result.founderSurvivors,5);
});

test('winter-start survival fixture crosses freezing temperatures with all founders retained',()=>{
 const result=runSoak(379210,1,'no-llm',82);
 assert.equal(result.startSeason,'Winter');
 assert.ok(result.minimumTemperature<0);
 assert.equal(result.founderSurvivors,5);
 assert.ok(result.completed>0);
});
