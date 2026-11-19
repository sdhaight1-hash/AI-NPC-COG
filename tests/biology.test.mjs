import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function biology(){
 const context={};
 vm.runInNewContext(readFileSync(new URL('../public/biology.js',import.meta.url),'utf8'),context);
 return context.Biology;
}
function round(value){return Math.round(value*100)/100;}
test('food calories derive from carbohydrates, protein and fat (4/4/9)',()=>{
 const B=biology();
 for(const food of Object.values(B.FOOD)){
  assert.equal(food.kcal,food.carbsG*4+food.proteinG*4+food.fatG*9);
  assert.ok(food.kcal>0);
  assert.ok(food.waterMl>=0);
 }
 assert.ok(B.FOOD.nuts.fatG>B.FOOD.berries.fatG);
 assert.ok(B.FOOD.berries.vitaminCMg>B.FOOD.nuts.vitaminCMg);
});
test('berry, nut and root food types are distinct and inherited from habitats',()=>{
 const B=biology();
 assert.equal(B.foodForBiome('forest'),'nuts');
 assert.equal(B.foodForBiome('marsh'),'roots');
 assert.equal(B.foodForBiome('meadow'),'berries');
 const person=B.create(0,0);
 assert.equal(B.addForaged(person,'nuts',2),true);
 assert.equal(B.addForaged(person,'roots',1),true);
 assert.equal(B.countFood(person),3);
 assert.equal(person.pantry.join(','),'nuts,nuts,roots');
});
test('eating removes one owned portion and creates a digestible calorie entry',()=>{
 const B=biology(),body=B.create(0,0);
 B.addForaged(body,'berries',1);
 const total=body.glycogenKcal+body.longTermKcal;
 const meal=B.ingest(body,520);
 assert.equal(meal.id,'berries');
 assert.equal(B.countFood(body),0);
 assert.equal(body.stomach.length,1);
 const nutrition=B.nutrition(body,520);
 assert.equal(nutrition.meals,1);
 assert.equal(nutrition.kcal,Math.round(B.FOOD.berries.kcal));
 assert.equal(nutrition.totals.vitaminCMg,B.FOOD.berries.vitaminCMg);
 B.advance(body,60,{clock:580,temperatureC:20});
 assert.ok(body.stomach[0].remaining<1,'Food must be digested');
 assert.ok(body.stomach[0].remaining>0,'Digestion is gradual');
 assert.ok(body.glycogenKcal+body.longTermKcal<total+meal.kcal,
  'Energy expenditure must consume part of the meal');
});
test('fasting cannot produce calories or water from nowhere',()=>{
 const B=biology(),body=B.create(0,0);
 const before=body.glycogenKcal+body.longTermKcal;
 const water=body.hydrationBudgetMl;
 B.advance(body,120,{clock:620,temperatureC:21,moving:true});
 assert.ok(body.glycogenKcal+body.longTermKcal<before);
 assert.ok(body.hydrationBudgetMl<water);
 assert.equal(B.ingest(body,620),null);
 assert.equal(B.drink(body,-1),false);
 assert.equal(B.drink(body,NaN),false);
});
test('drinking replenishes hydration and exposed exertion consumes it faster',()=>{
 const B=biology(),a=B.create(),b=B.create();
 assert.equal(B.drink(a,400),true);
 assert.equal(a.hydrationBudgetMl,2800);
 B.advance(a,120,{clock:700,temperatureC:20});
 B.advance(b,120,{clock:700,temperatureC:34,moving:true});
 assert.ok(a.hydrationBudgetMl>b.hydrationBudgetMl);
 assert.equal(B.drink(b,2000),false,'Reject unrealistic single water event');
});
test('ghrelin, insulin and melatonin are bounded GAME signals, not clinical hormone concentrations',()=>{
 const B=biology(),fed=B.create(),fasted=B.create();
 B.addForaged(fed,'roots',1);
 const initialGhrelin=fed.hormones.ghrelin;
 assert.ok(B.ingest(fed,600));
 assert.ok(fed.hormones.ghrelin<initialGhrelin);
 B.advance(fed,50,{clock:650});
 B.advance(fasted,50,{clock:650});
 assert.ok(fed.hormones.insulin>fasted.hormones.insulin,
  'Digesting carbohydrates creates a stronger modeled insulin response');
 assert.ok(fed.hormones.ghrelin<fasted.hormones.ghrelin,
  'Recent eating suppresses modeled hunger signal');
 const night=B.create(),noon=B.create();
 B.advance(night,80,{clock:120});
 B.advance(noon,80,{clock:720});
 assert.ok(night.hormones.melatonin>noon.hormones.melatonin);
 for(const body of [night,noon,fed,fasted])
  for(const value of Object.values(body.hormones))
   assert.ok(value>=0&&value<=100,'Game proxy stays bounded');
});
test('rain and inadequate shelter affect stress signal; rest reduces sleep pressure',()=>{
 const B=biology(),exposed=B.create(),sheltered=B.create();
 B.advance(exposed,180,{clock:700,weather:'storm',sheltered:false});
 B.advance(sheltered,180,{clock:700,weather:'storm',sheltered:true});
 assert.ok(exposed.stress>sheltered.stress);
 const prior=exposed.sleepDebt;
 B.advance(exposed,120,{clock:820,resting:true,sheltered:true});
 assert.ok(exposed.sleepDebt<prior);
});
test('nutrition coverage compares independent categories, not four equal Eco values',()=>{
 const B=biology(),body=B.create(0,0);
 B.addForaged(body,'nuts',2);
 B.addForaged(body,'berries',1);
 for(let i=0;i<3;i++)B.ingest(body,300+i*60);
 const report=B.nutrition(body,600);
 assert.equal(report.meals,3);
 assert.equal(report.diversity,2);
 assert.ok(report.coverage.proteinG>=0);
 assert.ok(report.coverage.vitaminCMg>=0);
 assert.ok(report.coverage.ironMg>=0);
 assert.ok(report.adequacy>=0&&report.adequacy<=100);
 assert.equal(B.nutrition(body,2400).meals,0,'Old meals expire after 24 simulated hours');
});
test('food transfer is an atomic item move, including its food identity',()=>{
 const B=biology(),from=B.create(0,0),to=B.create(0,0);
 B.addForaged(from,'nuts',1);
 const beforeFrom=from.pantry.length,beforeTo=to.pantry.length;
 assert.equal(B.transferFood(from,to),true);
 assert.equal(from.pantry.length,beforeFrom-1);
 assert.equal(to.pantry.length,beforeTo+1);
 assert.equal(to.pantry.at(-1),'nuts');
});
test('load rejects invalid biology data and reconciles older numeric food stacks',()=>{
 const B=biology(),base=B.create(1,0);
 B.addForaged(base,'nuts',1);
 base.hormones.cortisol=99;
 base.sleepDebt=50;
 const save=JSON.parse(JSON.stringify(base));
 save.hormones.insulin=999;
 save.hydrationBudgetMl=-999;
 save.pantry.push('unrecognized');
 const restored=B.restore(save,3);
 assert.equal(restored.hormones.insulin,100);
 assert.equal(restored.hydrationBudgetMl,0);
 assert.equal(restored.pantry.length,3);
 assert.equal(restored.pantry[0],'nuts');
 assert.equal(restored.pantry[1],'ration');
 assert.equal(B.restore(null,2).pantry.length,2);
});

test('appetite drive reflects opposing energy reserve and post-meal endocrine signals',()=>{
 const B=biology(),base=B.create(),hungry=B.create();
 base.hormones={ghrelin:20,leptin:75,insulin:65,cortisol:20,melatonin:30};
 hungry.hormones={ghrelin:80,leptin:20,insulin:12,cortisol:70,melatonin:20};
 assert.ok(B.appetiteDrive(hungry)>B.appetiteDrive(base));
 assert.ok(B.appetiteDrive(hungry)<=100);
 assert.ok(B.appetiteDrive(base)>=0);
});
