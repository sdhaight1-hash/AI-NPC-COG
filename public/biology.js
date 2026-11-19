// Biology / nutrition kernel for the emergent survival simulation.
//
// IMPORTANT: This is a deterministic GAME MODEL, not a clinical physiology
// simulator. Hormone values are normalized behavioral signals (0..100), NOT
// serum concentrations, diagnostic biomarkers or personal health estimates.
// The LLM can observe sensations but cannot mutate this state.
(function(root){
'use strict';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const smooth=(current,target,dt,tau)=>current+(target-current)*(1-Math.exp(-dt/tau));
const number=(value,fallback,a,b)=>Number.isFinite(value)?clamp(value,a,b):fallback;
const NUTRIENTS=['carbsG','proteinG','fatG','fiberG','vitaminCMg','ironMg','potassiumMg','sodiumMg'];
const FOOD={
 ration:{name:'mixed travel ration',carbsG:36,proteinG:12,fatG:11,fiberG:5,
   vitaminCMg:9,ironMg:2.4,potassiumMg:440,sodiumMg:420,waterMl:65},
 berries:{name:'wild berries',carbsG:23,proteinG:1.5,fatG:.5,fiberG:7,
   vitaminCMg:35,ironMg:.6,potassiumMg:185,sodiumMg:4,waterMl:125},
 nuts:{name:'forest nuts',carbsG:13,proteinG:9,fatG:24,fiberG:6,
   vitaminCMg:2,ironMg:2.2,potassiumMg:470,sodiumMg:4,waterMl:15},
 roots:{name:'edible roots',carbsG:42,proteinG:3,fatG:.5,fiberG:5,
   vitaminCMg:20,ironMg:1.5,potassiumMg:600,sodiumMg:28,waterMl:105}
};
for(const food of Object.values(FOOD))
 food.kcal=food.carbsG*4+food.proteinG*4+food.fatG*9;
// Reference units are conservative GAMEPLAY TARGETS, not dietary guidance.
// Human nutritional requirements vary with many characteristics.
const TARGET={carbsG:170,proteinG:55,fatG:45,fiberG:22,
  vitaminCMg:55,ironMg:8,potassiumMg:2300};
function create(index=0,foodCount=1){
 const count=clamp(Math.floor(foodCount),0,1000);
 return {
  version:1,
  glycogenKcal:1500,
  longTermKcal:36000,
  hydrationBudgetMl:2400,
  stomach:[],
  intake:[],
  pantry:Array.from({length:count},()=> 'ration'),
  sleepDebt:clamp(12+(index%7)*6),
  stress:clamp(16+(index%5)*4),
  hormones:{ghrelin:40,leptin:55,insulin:25,cortisol:28,melatonin:20},
  lastMealAt:-240,
  lastClock:0
 };
}
function foodForBiome(biome){
 return biome==='forest'?'nuts':biome==='marsh'||biome==='ridge'?'roots':'berries';
}
function countFood(body){
 return Array.isArray(body?.pantry)?body.pantry.length:0;
}
function addForaged(body,kind,amount){
 if(!body||!Number.isInteger(amount)||amount<0||amount>1000)return false;
 const id=FOOD[kind]?kind:'ration';
 if(body.pantry.length+amount>1000)return false;
 for(let i=0;i<amount;i++)body.pantry.push(id);
 return true;
}
function transferFood(from,to){
 if(!from?.pantry?.length||!to?.pantry||to.pantry.length>=1000)return false;
 to.pantry.push(from.pantry.shift());
 return true;
}
function ingest(body,clock){
 if(!body?.pantry?.length)return null;
 const id=body.pantry.shift();
 const food=FOOD[id]||FOOD.ration;
 const time=Number.isFinite(clock)?clock:body.lastClock;
 body.stomach.push({foodId:id,remaining:1});
 body.intake.push({clock:time,foodId:id});
 body.intake=body.intake.filter(row=>Number.isFinite(row.clock)&&
   row.clock>time-1440).slice(-80);
 body.hydrationBudgetMl=clamp(body.hydrationBudgetMl+food.waterMl,0,3600);
 body.hormones.ghrelin=clamp(body.hormones.ghrelin-25);
 body.hormones.insulin=clamp(body.hormones.insulin+8);
 body.lastMealAt=time;
 return {id,name:food.name,kcal:food.kcal};
}
function drink(body,ml=400){
 if(!body||!Number.isFinite(ml)||ml<0||ml>1000)return false;
 body.hydrationBudgetMl=clamp(body.hydrationBudgetMl+ml,0,3600);
 return true;
}
function nutrition(body,clock){
 const time=Number.isFinite(clock)?clock:body.lastClock;
 const totals=Object.fromEntries(NUTRIENTS.map(key=>[key,0]));
 let kcal=0,meals=0;
 for(const row of body.intake){
  if(!row||row.clock<=time-1440||row.clock>time||!FOOD[row.foodId])continue;
  const food=FOOD[row.foodId];meals++;kcal+=food.kcal;
  for(const key of NUTRIENTS)totals[key]+=food[key];
 }
 // Avoid Eco's fictitious requirement to make four unrelated nutrients equal.
 // Report adequacy of separate nutrients without claiming to diagnose deficits.
 const coverage=Object.fromEntries(Object.entries(TARGET).map(([k,v])=>
  [k,Math.round(clamp(totals[k]/v,0,2)*100)]));
 const average=Object.values(coverage).reduce((a,b)=>a+Math.min(100,b),0)/
   Object.keys(coverage).length;
 return {kcal:Math.round(kcal),meals,totals,coverage,
   diversity:new Set(body.intake.filter(x=>x.clock>time-1440).map(x=>x.foodId)).size,
   adequacy:Math.round(average)};
}
function advance(body,dt,context={}){
 if(!body||!Number.isFinite(dt)||dt<=0)return;
 // Clamp a single update to avoid instability after a suspended tab resumes.
 dt=Math.min(dt,360);
 const clock=Number.isFinite(context.clock)?context.clock:body.lastClock+dt;
 const hour=((clock%1440)+1440)%1440/60;
 const moving=!!context.moving,resting=!!context.resting;
 const sheltered=!!context.sheltered;
 const temperature=number(context.temperatureC,20,-40,60);
 const weather=context.weather;
 // Closed-form meal absorption is stable for variable-length ticks.
 // Every ingested calorie enters an available energy store once.
 let absorbedKcal=0,absorbedCarbs=0;
 for(const meal of body.stomach){
  const food=FOOD[meal.foodId]||FOOD.ration;
  const amount=meal.remaining*(1-Math.exp(-dt/95));
  meal.remaining=Math.max(0,meal.remaining-amount);
  absorbedKcal+=food.kcal*amount;absorbedCarbs+=food.carbsG*amount;
 }
 body.stomach=body.stomach.filter(m=>m.remaining>.002).slice(-40);
 const storeBefore=body.glycogenKcal;
 body.glycogenKcal=clamp(storeBefore+absorbedKcal,0,1800);
 const excess=Math.max(0,storeBefore+absorbedKcal-1800);
 body.longTermKcal=clamp(body.longTermKcal+excess,0,65000);
 const thermalPenalty=temperature<8&&!sheltered?0.30:temperature>30?0.18:0;
 const kcalPerMinute=1.05+(moving?.60:0)+thermalPenalty;
 let expenditure=kcalPerMinute*dt;
 const glycogenUsed=Math.min(body.glycogenKcal,expenditure);
 body.glycogenKcal-=glycogenUsed;expenditure-=glycogenUsed;
 const reserveUsed=Math.min(body.longTermKcal,expenditure);
 body.longTermKcal-=reserveUsed;expenditure-=reserveUsed;
 const hydrationLoss=(1.15+(moving?.55:0)+(temperature>27?.4:0))*dt;
 body.hydrationBudgetMl=clamp(body.hydrationBudgetMl-hydrationLoss,0,3600);
 const pressure=(resting?-1.5:1)*dt/60;
 body.sleepDebt=clamp(body.sleepDebt+pressure*(resting?18:6));
 const exposure=(weather==='storm'||weather==='rain')&&!sheltered?12:0;
 const deprivation=(body.hydrationBudgetMl<400?22:0)+
   (body.glycogenKcal<100&&body.longTermKcal<100?30:0);
 const targetStress=16+exposure+deprivation+body.sleepDebt*.35;
 body.stress=smooth(body.stress,clamp(targetStress),dt,180);
 const fasting=clamp((clock-body.lastMealAt)/270,0,1);
 const stomachLoad=body.stomach.reduce((acc,m)=>acc+m.remaining,0);
 const ghrelinTarget=clamp(20+50*fasting-15*Math.min(1,stomachLoad)+
   body.sleepDebt*.08);
 const reserveFraction=clamp(body.longTermKcal/36000,0,1.8);
 const leptinTarget=clamp(20+38*reserveFraction);
 // Insulin is a carbohydrate-response PROXY; no glucose diagnostic model.
 const insulinTarget=clamp(16+Math.min(65,absorbedCarbs/Math.max(1,dt)*55));
 const cortisolTarget=clamp(15+body.stress*.52+
   19*Math.max(0,Math.cos((hour-7)*Math.PI/12)));
 const night=(Math.cos((hour-2)*Math.PI/12)+1)/2;
 const melatoninTarget=clamp(8+night*70-(moving?8:0));
 body.hormones.ghrelin=smooth(body.hormones.ghrelin,ghrelinTarget,dt,48);
 body.hormones.leptin=smooth(body.hormones.leptin,leptinTarget,dt,800);
 body.hormones.insulin=smooth(body.hormones.insulin,insulinTarget,dt,28);
 body.hormones.cortisol=smooth(body.hormones.cortisol,cortisolTarget,dt,90);
 body.hormones.melatonin=smooth(body.hormones.melatonin,melatoninTarget,dt,70);
 body.lastClock=clock;
 return {energyShortfallKcal:expenditure,hydration:body.hydrationBudgetMl,
   sleepDebt:body.sleepDebt,stress:body.stress};
}
function sensation(body,needs){
 if(!body)return 'No physiological data';
 const sensations=[];
 if(needs?.thirst>=65||body.hydrationBudgetMl<550)sensations.push('very thirsty');
 else if(needs?.thirst>=35)sensations.push('thirsty');
 if(needs?.hunger>=65)sensations.push('very hungry');
 else if(needs?.hunger>=35||body.hormones.ghrelin>=70)sensations.push('hungry');
 if(body.sleepDebt>=65||body.hormones.melatonin>=60)
  sensations.push('sleepy');
 if(body.stress>=55)sensations.push('physically stressed');
 if(body.glycogenKcal<180)sensations.push('low on readily available fuel');
 return sensations.join(', ')||'reasonably comfortable';
}
function restore(saved,foodCount=1){
 const body=create(0,foodCount);
 if(!saved||typeof saved!=='object'||saved.version!==1)return body;
 for(const key of ['glycogenKcal','longTermKcal','hydrationBudgetMl',
  'sleepDebt','stress','lastMealAt','lastClock']){
  const ranges={glycogenKcal:[0,1800],longTermKcal:[0,65000],
   hydrationBudgetMl:[0,3600],sleepDebt:[0,100],stress:[0,100],
   lastMealAt:[-1e9,1e9],lastClock:[0,1e9]};
  body[key]=number(saved[key],body[key],...ranges[key]);
 }
 for(const key of Object.keys(body.hormones))
  body.hormones[key]=number(saved.hormones?.[key],body.hormones[key],0,100);
 if(Array.isArray(saved.stomach))
  body.stomach=saved.stomach.slice(-40).filter(m=>m&&FOOD[m.foodId]&&
   Number.isFinite(m.remaining)&&m.remaining>=0&&m.remaining<=1)
   .map(m=>({foodId:m.foodId,remaining:m.remaining}));
 if(Array.isArray(saved.intake))
  body.intake=saved.intake.slice(-80).filter(m=>m&&FOOD[m.foodId]&&
   Number.isFinite(m.clock)&&m.clock>=0&&m.clock<=1e9)
   .map(m=>({clock:m.clock,foodId:m.foodId}));
 if(Array.isArray(saved.pantry))
  body.pantry=saved.pantry.slice(0,1000).map(id=>FOOD[id]?id:'ration');
 // Keep the legacy inventory count authoritative when migrating older saves.
 const count=clamp(Math.floor(foodCount),0,1000);
 body.pantry.length=Math.min(body.pantry.length,count);
 while(body.pantry.length<count)body.pantry.push('ration');
 return body;
}
root.Biology={FOOD,TARGET,create,foodForBiome,countFood,addForaged,
 transferFood,ingest,drink,nutrition,advance,sensation,restore};
})(globalThis);
