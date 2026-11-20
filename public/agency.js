// Bounded personal agency: needs and dispositions -> legal intentions -> projects
// -> witnessed outcomes -> revisable beliefs and priorities. No omniscient facts.
(function(root){
 'use strict';
 const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
 const GOALS=new Set(['stock_water','stock_food','stock_wood','stock_stone',
  'stock_fiber','make_shelter','make_campfire']);
 const CATEGORIES={
  drink:'safety',drink_source:'safety',fill_water:'safety',eat:'safety',forage:'safety',rest:'safety',
  stock_water:'security',stock_food:'security',stock_wood:'craft',
  stock_stone:'craft',stock_fiber:'craft',make_shelter:'security',
  make_campfire:'security',collect_wood:'craft',collect_stone:'craft',
  collect_fiber:'craft',craft_stage:'craft',build_fire:'craft',
  build_shelter:'craft',build_cache:'craft',craft_hatchet:'craft',
  explore:'curiosity',inspect:'curiosity',socialize:'social',
  share_food:'social',none:'idle'
 };
 const category=k=>CATEGORIES[k]||(k.startsWith('craft_')||k.startsWith('experiment_')
  ||k.startsWith('stash_')||k.startsWith('withdraw_')?'craft':
  k==='pickup_item'||k.startsWith('drop_')?'craft':'curiosity');
 const personalityBias=(n,kind)=>{
  const p=String(n.personality||'').toLowerCase();
  if(kind==='social')return /expressive|gentle/.test(p)?16:/reserved|independent/.test(p)?-10:0;
  if(kind==='curiosity')return /curious|adventurous/.test(p)?17:/cautious|reserved/.test(p)?-7:0;
  if(kind==='security')return /cautious|patient|pragmatic/.test(p)?13:/adventurous/.test(p)?-5:0;
  if(kind==='craft')return /patient|pragmatic|independent/.test(p)?12:0;
  return 0;
 };
 const defaultAgency=()=>({goal:null,beliefs:[],practice:{safety:0,security:0,
  craft:0,curiosity:0,social:0},completedGoals:0,failedGoals:0});
 function state(n){return n.agency ||= defaultAgency();}
 function drives(n){
  const inv=n.inventory||{},needs=n.needs||{};
  const hunger=needs.hunger||0,thirst=needs.thirst||0;
  return {
   safety:clamp(Math.max(hunger,thirst,100-(n.energy||0))),
   security:clamp(30+Math.max(0,2-(inv.water||0))*14+
    Math.max(0,2-(inv.food||0))*12+(n.health<65?12:0)),
   craft:clamp(32+Math.max(0,3-(inv.wood||0))*5+
    Math.max(0,3-(inv.fiber||0))*4),
   curiosity:clamp(needs.curiosity||0),
   social:clamp(needs.social||0)
  };
 }
 function known(n,ref,clock){
  if(!ref)return null;
  const b=state(n).beliefs.find(x=>x.ref===ref);
  if(!b)return null;
  // Belief confidence fades; the world is never secretly rewritten to agree.
  return {...b,effective:b.confidence/(1+Math.max(0,clock-b.at)/2400)};
 }
 function score(n,option,world,clock){
  const k=option.key,kind=category(k),m=state(n),d=drives(n),inv=n.inventory||{};
  if(k==='none')return -100;
  let value=24+personalityBias(n,kind)+(m.practice[kind]||0)*2;
  if(kind==='safety')value+=d.safety*.38;
  if(kind==='security')value+=d.security*.35;
  if(kind==='craft')value+=d.craft*.30;
  if(kind==='curiosity')value+=d.curiosity*.55;
  if(kind==='social')value+=d.social*.65;
  if(k==='drink'||k==='drink_source')value+=(n.needs.thirst||0)*.65-((n.needs.thirst||0)<30?35:0);
  if(k==='eat')value+=(n.needs.hunger||0)*.58-((n.needs.hunger||0)<30?35:0);
  if(k==='rest')value+=(100-n.energy)*.42;
  if(k==='fill_water')value+=Math.max(0,3-(inv.water||0))*16;
  if(k==='forage')value+=Math.max(0,3-(inv.food||0))*13;
  if(k.startsWith('stock_')){
   const item=k.slice(6),target=item==='water'||item==='food'?2:3;
   value+=Math.max(0,target-(inv[item]||0))*13+10;
  }
  if(k==='make_shelter')value+=30;
  if(k==='make_campfire')value+=18;
  if(k==='explore')value+=5;
  if(k==='inspect')value+=8;
  if(k==='craft_stage')value+=120; // Finish committed materials first.
  if(k.startsWith('craft_')&&k!=='craft_stage')value+=6;
  if(m.goal?.key===k)value+=22; // Durably prefer the established intention.
  const belief=known(n,option.ref,clock);
  if(belief)value+=(belief.status==='depleted'?-30:belief.status==='failed'?-25:12)*
   belief.effective;
  if(root.Cognition.recentFailure(n,k,clock))value-=42;
  if(option.target&&Number.isFinite(option.target.x)){
   const distance=root.Frontier.distance(world,n,option.target);
   value-=Math.min(18,distance*.9);
  }
  return Number(value.toFixed(2));
 }
 function ranked(n,options,world,clock){
  return options.map(o=>({...o,utility:score(n,o,world,clock)}))
   .sort((a,b)=>b.utility-a.utility||a.key.localeCompare(b.key));
 }
 function choose(n,options,world,clock){
  const choices=ranked(n,options.filter(o=>o.key!=='none'),world,clock);
  const top=choices[0];
  return top&&top.utility>=25?top:null;
 }
 function begin(n,action,clock,source='simulation'){
  if(action==='none'||action==='rest')return;
  const a=state(n);
  if((source==='plan'||source==='project')&&a.goal)return; // Substeps should not replace the project.
  if(!a.goal||a.goal.key!==action){
   a.goal={key:action,startedAt:clock,source:String(source).slice(0,32),
    reason:category(action),progress:0};
  }
 }
 function observe(n,world,action,ref,success,clock){
  if(!ref)return;
  // Learning requires physical contact or deliberate inspection; never ingest
  // unseen world nodes or other NPCs' private memories.
  const permitted=action==='inspect'||action==='forage'||action==='fill_water'||action==='drink_source'||
   ['collect_wood','collect_stone','collect_fiber','pickup_item',
    'store_wood','retrieve_wood','stash_wood','stash_stone','stash_fiber',
    'withdraw_wood','withdraw_stone','withdraw_fiber'].includes(action);
  if(!permitted)return;
  const old=state(n).beliefs.find(b=>b.ref===ref);
  const obj=root.AgentWorld.objectById(world,ref);
  if(!old&&!obj)return;
  const b=old||{ref,kind:'unknown',x:n.x,y:n.y,confidence:0,at:clock,status:'uncertain'};
  // A failed action can establish depletion only from same-level contact.
  const expected=root.AgentWorld.HARVEST_KINDS?.[action]||(action==='drink_source'?'water':null);
  const witnessedEmpty=obj&&obj.kind===expected&&obj.stock===0&&
   (n.z||0)===(obj.z||0)&&root.Frontier.distance(world,n,obj)<=1;
  if(obj&&(success||witnessedEmpty)){
   b.kind=String(obj.kind||obj.type||'unknown').slice(0,30);
   b.x=obj.x;b.y=obj.y;
   b.stock=Number.isInteger(obj.stock)?Math.max(0,obj.stock):null;
   b.status=b.stock===0?'depleted':'available';
   b.confidence=1;
  }else{
   b.status='failed';b.confidence=clamp(b.confidence+.15,0,1);
  }
  b.at=clock;
  const beliefs=state(n).beliefs;
  if(!old)beliefs.push(b);
  if(beliefs.length>80)beliefs.splice(0,beliefs.length-80);
 }
 function outcome(n,world,action,ref,ok,clock){
  const a=state(n),kind=category(action);
  observe(n,world,action,ref,ok,clock);
  // A tiny bounded preference update, grounded in an actual experienced result.
  if(kind!=='idle'&&a.practice[kind]!==undefined)
   a.practice[kind]=clamp(a.practice[kind]+(ok?.16:-.22),-5,5);
  if(a.goal){
   if(ok)a.goal.progress=Math.min(999,a.goal.progress+1);
   else if(a.goal.key===action)a.goal.progress=Math.max(0,a.goal.progress-1);
  }
 }
 function finish(n,success,clock){
  const a=state(n);
  if(!a.goal)return;
  if(success)a.completedGoals++;
  else a.failedGoals++;
  a.goal=null;
 }
 function restore(n,saved,clock=0){
  const a=defaultAgency();
  if(saved&&typeof saved==='object'){
   for(const kind of Object.keys(a.practice)){
    const v=saved.practice?.[kind];
    if(Number.isFinite(v))a.practice[kind]=clamp(v,-5,5);
   }
   for(const kind of ['completedGoals','failedGoals'])
    if(Number.isInteger(saved[kind])&&saved[kind]>=0)
     a[kind]=Math.min(1000000,saved[kind]);
   if(Array.isArray(saved.beliefs))
    a.beliefs=saved.beliefs.filter(b=>b&&typeof b.ref==='string'&&b.ref.length<100&&
     typeof b.kind==='string'&&Number.isInteger(b.x)&&Number.isInteger(b.y)&&
     Number.isFinite(b.at)&&b.at<=clock&&Number.isFinite(b.confidence))
     .slice(-80).map(b=>({ref:b.ref,kind:b.kind.slice(0,30),
      x:b.x,y:b.y,at:b.at,confidence:clamp(b.confidence,0,1),
      status:['available','depleted','failed','uncertain'].includes(b.status)?
       b.status:'uncertain',
      stock:Number.isInteger(b.stock)&&b.stock>=0?b.stock:null}));
   const g=saved.goal;
   if(g&&typeof g.key==='string'&&g.key.length<50&&
    Number.isFinite(g.startedAt)&&g.startedAt<=clock&&
    Number.isInteger(g.progress)&&g.progress>=0)
    a.goal={key:g.key,startedAt:g.startedAt,
     reason:String(g.reason||'').slice(0,30),
     source:String(g.source||'').slice(0,32),progress:Math.min(999,g.progress)};
  }
  n.agency=a;
 }
 root.Agency={state,drives,score,ranked,choose,begin,observe,outcome,finish,restore,
  isPlan:key=>GOALS.has(key)};
})(globalThis);
