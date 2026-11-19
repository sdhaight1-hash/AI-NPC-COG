'use strict';
// God-mode observer. Rendering is a projection of the authoritative toroidal grid.
const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
const TILE=VillageArt.TILE,W=Frontier.WIDTH,H=Frontier.HEIGHT;
const STORE='ai-npc-cog-v3';
const WORLD_SEED=Number(localStorage.getItem('ai-npc-cog-world-seed'))||Frontier.DEFAULT_SEED;
const world=AgentWorld.newWorld(WORLD_SEED);
const founders=Civilization.founders(world,490);
const state={clock:490,speed:60,day:1,paused:false,auto:true,connected:false,
 backgroundBusy:false,conversationBusy:false,debugGrid:false,
 model:'rein',modelLabel:'Rein-NPC-4B',
 npcs:founders,dead:[],nextPersonId:6,world,events:[],selected:founders[0].id,
 zoom:1,viewZ:0,follow:true,selectedObject:null,camera:{x:0,y:0},nextUI:0,nextSave:0,lastDecisionMs:0};
const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Frontier.distance(state.world,a,b);
const key=p=>(p.z||0)+':'+p.x+':'+p.y;
const wrapX=x=>Frontier.wrap(x,W),wrapY=y=>Frontier.wrap(y,H);
const DURATIONS={forage:2,collect_wood:4,collect_stone:5,collect_fiber:2,
 fill_water:1,eat:3,drink:1,craft_hatchet:12,experiment_wood_stone:15,
 experiment_wood_fiber:15,experiment_wood_stone_fiber:15,
 build_fire:20,build_shelter:75,share_food:2,socialize:3,inspect:2,drop_wood:2,pickup_item:2,place_crate:6,
 stash_wood:2,stash_stone:2,stash_fiber:2,
 withdraw_wood:2,withdraw_stone:2,withdraw_fiber:2,build_cache:18,store_wood:2,retrieve_wood:2,explore:1,none:1};
let installedAtlas=null,showAtlas=true;
function selectedNpc(){return state.npcs.find(n=>n.id===state.selected)||null;}
function selectNpc(id){
 if(!state.npcs.some(n=>n.id===id))return;
 state.selected=id;state.follow=true;updateCamera(true);
 renderResidents();updateInspector();renderChat();
}
function nearest(n,range=8){
 return state.npcs.filter(p=>p!==n&&dist(p,n)<=range).sort((a,b)=>dist(a,n)-dist(b,n))[0]||null;
}
function isBlocked(x,y,z=0){return !Frontier.traversable(state.world,wrapX(x),wrapY(y),z);}
function pathfind(start,end){
 const s={x:wrapX(start.x),y:wrapY(start.y),z:start.z||0};
 const e={x:wrapX(end.x),y:wrapY(end.y),z:end.z||0};
 if(isBlocked(e.x,e.y,e.z))return [];
 const queue=[s],back=new Map([[key(s),null]]);
 for(let i=0;i<queue.length;i++){
  const p=queue[i];if(key(p)===key(e))break;
  for(const next of Frontier.neighbors(state.world,p)){
   if(back.has(key(next)))continue;
   back.set(key(next),p);queue.push(next);
  }
 }
 if(!back.has(key(e)))return [];
 const path=[];let current=e;
 while(current&&key(current)!==key(s)){
  path.push(current);current=back.get(key(current));
 }
 return path.reverse();
}
function reachable(n,point){
 if(isBlocked(point.x,point.y,point.z||0))return false;
 return dist(n,point)===0||pathfind(n,point).length>0;
}
function reachability(n){
 const queue=[{x:n.x,y:n.y,z:n.z||0}],seen=new Set([key(queue[0])]);
 for(let i=0;i<queue.length;i++){
  for(const next of Frontier.neighbors(state.world,queue[i])){
   if(!seen.has(key(next))){seen.add(key(next));queue.push(next);}
  }
 }
 return point=>seen.has(key({x:wrapX(point.x),y:wrapY(point.y),z:point.z||0}));
}
function availableActivities(n){return AgentWorld.available(n,state.world,state.npcs,reachability(n));}
function timeString(){
 const d=Civilization.stamp(state.clock);
 return String(d.hour).padStart(2,'0')+':'+String(d.minute).padStart(2,'0');
}
function activity(n){
 return n.activityStats ||= {decisions:0,none:0,rejected:0,started:0,
  completed:0,failed:0,blocked:0,errors:0,last:'No decisions yet'};
}
function activityNote(n,text){activity(n).last=String(text).slice(0,110);}
function record(message,type='routine'){
 state.events.unshift({time:'Y'+Civilization.stamp(state.clock).year+' '+timeString(),
  text:String(message).slice(0,250),type});
 state.events=state.events.slice(0,100);renderEvents();
}
function remember(n,entry,meta={}){
 const memory=Cognition.record(n,entry,state.clock,meta);
 memory.time='Y'+Civilization.stamp(state.clock).year+' '+timeString();
 return memory;
}
function moveTo(n,target){
 const path=pathfind(n,target);
 if(!path.length&&dist(n,target)>0)return false;
 n.path=path;n.travel=null;
 if(path.length){
  const next=path[0],dx=next.x-n.x,dy=next.y-n.y;
  const hx=Math.abs(dx)>W/2?(dx>0?dx-W:dx+W):dx;
  const hy=Math.abs(dy)>H/2?(dy>0?dy-H:dy+H):dy;
  n.facing=Math.abs(hx)>Math.abs(hy)?(hx>0?'right':'left'):(hy>0?'down':'up');
 }
 return true;
}
function approach(n,target){
 const options=Frontier.neighbors(state.world,target);
 const routes=options.map(p=>({p,path:pathfind(n,p)}))
  .filter(v=>v.path.length>0||dist(n,v.p)===0)
  .sort((a,b)=>a.path.length-b.path.length);
 return routes.length?moveTo(n,routes[0].p):false;
}
function position(n){
 if(!n.travel||!n.path?.length)return {x:n.x,y:n.y};
 const next=n.path[0],fraction=clamp(1-n.travel.remaining/n.travel.total,0,1);
 let dx=next.x-n.x,dy=next.y-n.y;
 if(dx>W/2)dx-=W;if(dx<-W/2)dx+=W;
 if(dy>H/2)dy-=H;if(dy<-H/2)dy+=H;
 return {x:n.x+dx*fraction,y:n.y+dy*fraction};
}
function updateMovement(n,elapsed){
 if(!n.path?.length)return;
 let budget=elapsed;
 for(let moves=0;moves<100&&budget>0&&n.path.length;moves++){
  const next=n.path[0];
  if(isBlocked(next.x,next.y,next.z||0)){
   n.path=[];n.travel=null;n.task=null;n.goal='Route invalidated';
   activity(n).blocked++;activityNote(n,'Movement: destination became blocked');
   n.thoughtAt=state.clock+3;break;
  }
  if(!n.travel){
   const terrain=Frontier.terrainAt(state.world,next.x,next.y);
   const minutes=terrain==='ridge'?0.14:terrain==='marsh'?0.12:0.07;
   n.travel={remaining:minutes,total:minutes};
  }
  if(budget<n.travel.remaining){
   n.travel.remaining-=budget;break;
  }
  budget-=n.travel.remaining;
  if(state.npcs.some(other=>other!==n&&other.x===next.x&&other.y===next.y&&
    (other.z||0)===(next.z||0))){
   n.blockedFor=(n.blockedFor||0)+elapsed;
   n.travel=null;
   if(n.blockedFor>5){
    n.path=[];n.task=null;n.goal='Route blocked by another inhabitant';
    activity(n).blocked++;activityNote(n,'Movement: another inhabitant blocked passage');
    n.thoughtAt=state.clock+3;n.blockedFor=0;
   }
   break;
  }
  n.x=next.x;n.y=next.y;n.z=next.z||0;
  n.path.shift();n.travel=null;n.blockedFor=0;
  Frontier.reveal(state.world,n.x,n.y,7);
 }
 n.motion=n.path.length?1:0;
 if(n.task&&!n.path.length&&n.task.readyAt===null)
  n.task.readyAt=state.clock+actionDuration(n,n.task.key);
}
function sceneFor(n){
 const others=state.npcs.filter(p=>p!==n&&dist(n,p)<=8)
  .map(p=>p.name+' '+dist(n,p)+' tiles away').join(', ')||'Nobody nearby';
 const nearby=state.world.nodes.filter(v=>v.stock>0&&dist(n,v)<=7)
  .sort((a,b)=>dist(n,a)-dist(n,b)).slice(0,8)
  .map(v=>v.kind+' at '+v.x+','+v.y+' ('+v.stock+' units)').join('; ')||'None observed';
 const sensations=Biology.sensation(n.bio,n.needs);
 const known=(n.knowledge?.recipes||[]).join(', ')||'No discovered crafting methods';
 const memoryQuery=n.goal+' '+sensations+' '+nearby+' '+n.action;
 const memories=Cognition.recall(n,memoryQuery,state.clock,5)
  .map(m=>m.kind+': '+m.text).join('; ')||'No relevant personal recollections';
 return 'Year '+Civilization.stamp(state.clock).year+', '+Civilization.stamp(state.clock).season+', '+timeString()+
  '. Untamed procedural wilderness; no predefined community or government. '+
  n.name+' at ('+n.x+','+n.y+','+(n.z||0)+'). Personality: '+n.personality+
  '. Age '+Math.floor(Civilization.age(n,state.clock))+
  ', health '+Math.round(n.health)+', energy '+Math.round(n.energy)+
  ', hunger '+Math.round(n.needs.hunger)+', thirst '+Math.round(n.needs.thirst)+
  ', loneliness '+Math.round(n.needs.social)+'. Bodily sensations: '+sensations+
  '. Weather '+state.world.weather.kind+', '+state.world.weather.temperature+'C.'+
  ' Inventory: '+Object.entries(n.inventory).map(([k,v])=>k+' '+v).join(', ')+
  '. Skills earned by actions: '+Object.entries(n.skills).filter(([,v])=>v>0)
   .map(([k,v])=>k+' '+v).join(', ')+
  '. Known crafting methods: '+known+
  '. Manufacturing: '+(n.workpiece?Crafting.RECIPES[n.workpiece.recipe].name+
   ' stage '+(n.workpiece.stage+1):'no active workpiece')+
  '. Finished goods: '+(n.craftedItems||[]).slice(-5).map(p=>
   p.kind+' quality '+p.quality+'/5').join(', ')+'. Personally inspected: '+
  (n.knowledge?.observations||[]).slice(-4).map(o=>o.text).join('; ')+
  '. Near people: '+others+
  '. Perceived resources: '+nearby+'. Recollections: '+memories+
  '. Intent: '+n.goal+'. Choose only available actions. Unknown recipes are not available.'+
  ' Others have independent beliefs, relationships and decisions.';
}
function actionDuration(n,key){
 if(key==='craft_stage'&&n.workpiece){
  const spec=Crafting.getRecipe(n.workpiece.recipe);
  return spec?.stages[n.workpiece.stage]?.minutes||3;
 }
 return DURATIONS[key]||2;
}
function backgroundOptions(n){
 const options=availableActivities(n).filter(o=>o.key!=='none');
 const priority={drink:100,fill_water:80,eat:90,forage:70,
  stock_water:80,stock_food:69,stock_wood:50,stock_stone:49,stock_fiber:51,
  rest:60,explore:45,inspect:62,pickup_item:63,drop_wood:12,
  build_cache:47,store_wood:37,retrieve_wood:42,experiment_wood_stone:43,
  experiment_wood_fiber:43,experiment_wood_stone_fiber:43,craft_hatchet:45,
  collect_wood:35,collect_stone:33,collect_fiber:33,
  craft_cord:56,craft_blade:55,craft_hafted_hatchet:70,
  craft_workbench:54,craft_planks:56,craft_crate:47,craft_stage:105,
  place_crate:59,stash_wood:38,stash_stone:35,stash_fiber:35,
  withdraw_wood:37,withdraw_stone:35,withdraw_fiber:35,
  socialize:40,share_food:35,make_shelter:42,build_shelter:50,
  make_campfire:40,build_fire:48};
 const urgency=o=>priority[o.key]+
  ((o.key==='drink'||o.key==='fill_water')?n.needs.thirst*.5:0)+
  ((o.key==='eat'||o.key==='forage')?n.needs.hunger*.4:0)+
  (o.key==='rest'?(100-n.energy)*.5:0)+
  (o.key==='socialize'?n.needs.social*.65:0)+
  (Frontier.hash(n.x,n.y,Math.floor(state.clock/33)+o.key.length*17)-.5)*22-
  (Cognition.recentFailure(n,o.key,state.clock)?50:0);
 options.sort((a,b)=>urgency(b)-urgency(a));
 const result=options.slice(0,9);
 const social=options.find(o=>o.key==='socialize')||options.find(o=>o.key==='explore');
 if(social&&!result.some(v=>v.key===social.key)&&result.length===9)result[8]=social;
 result.push({key:'none',when:'Observe surroundings and reconsider'});
 return result.map(({key,when})=>({key,when}));
}
function fallbackBackground(n){return AgentWorld.fallback(n,backgroundOptions(n));}
// Physiological responses continue while inference is busy. They still consume
// simulation time and inventory through the ordinary action executor.
function survivalReflex(n){
 if(n.peerPending||n.peerReservedFor)return false;
 const options=availableActivities(n);
 const urgent=Cognition.instinct(n,options);
 if(!urgent)return false;
 const critical=n.needs.thirst>=90||n.needs.hunger>=95||
  n.bio?.hydrationBudgetMl<200;
 if((n.task||n.path.length||n.action==='rest')&&!critical)return false;
 if(n.task?.key===urgent)return false;
 if(n.task||n.path.length||n.action==='rest'){
  // A physical emergency interrupts activity, never destroys the workpiece.
  // The multi-stage project remains and resumes after recovery.
  n.task=null;n.path=[];n.travel=null;n.action='none';
  if(n.plan)n.nextPlanAt=state.clock+2;
  remember(n,'Interrupted work to address immediate bodily danger',
   {kind:'need',salience:4});
 }
 return setAction(n,urgent,'survival instinct');
}
function autonomousPurpose(n){
 if(n.task||n.plan||n.path.length)return false;
 const options=availableActivities(n);
 const has=key=>options.some(o=>o.key===key);
 const priorities=[
  n.inventory.water<2?'stock_water':null,
  n.inventory.food<2?'stock_food':null,
  n.inventory.wood<3?'stock_wood':null,
  n.inventory.fiber<3?'stock_fiber':null,
  n.inventory.stone<2?'stock_stone':null
 ].filter(Boolean);
 const selected=priorities.find(k=>has(k)&&!Cognition.recentFailure(n,k,state.clock));
 if(selected)return setAction(n,selected,'self-directed goal');
 if(has('inspect')&&n.needs.curiosity>=35)return setAction(n,'inspect','self-directed curiosity');
 return has('explore')?setAction(n,'explore','self-directed exploration'):false;
}
function socialInitiative(n){
 if(!state.connected||n.needs.social<50||n.energy<25||
  n.task||n.plan||n.path.length||n.peerPending||n.peerReservedFor||
  state.clock<(n.lastPeerAt??-100000)+90)return false;
 return setAction(n,'socialize','social initiative');
}
function scheduleIdleAgents(){
 if(!state.auto||state.conversationBusy||state.paused)return;
 // Survival is a mechanical reaction, not a fictitious model decision.
 for(const n of state.npcs)survivalReflex(n);
 // A social need can initiate a meeting, never fabricate dialogue.
 if(state.connected&&!state.backgroundBusy){
  const initiator=state.npcs.find(n=>n.needs.social>=50&&
   !n.task&&!n.plan&&!n.path.length&&!n.peerReservedFor&&!n.peerPending&&
   state.clock>=n.thoughtAt);
  if(initiator)socialInitiative(initiator);
 }
 const due=state.npcs.filter(n=>!n.task&&!n.plan&&!n.path.length&&!n.peerPending&&!n.peerReservedFor&&
  n.action!=='rest'&&state.clock>=n.thoughtAt)
  .sort((a,b)=>a.thoughtAt-b.thoughtAt);
 if(!state.connected){
  // Offline world rules need no serialized model inference lane.
  for(const n of due){
   const success=setAction(n,fallbackBackground(n),'offline routine');
   n.thoughtAt=state.clock+(success?18:3);
  }
 }else if(!state.backgroundBusy&&due.length&&
  performance.now()-state.lastDecisionMs>=1500){
  void deliberate(due[0]);
 }
}
function finishPlan(n,reason,type='social'){
 if(!n.plan)return;
 remember(n,'Plan '+n.plan.key+': '+reason);record(n.name+': '+reason,type);
 n.plan=null;n.action='none';n.task=null;
 n.goal='Reconsidering my next action';n.thoughtAt=state.clock+3;
}
function setAction(n,action,source='rein',scores=null){
 if(!state.npcs.includes(n)||n.task||n.peerReservedFor){
  activity(n).rejected++;activityNote(n,'Cannot start '+action+': already occupied');
  return false;
 }
 const option=availableActivities(n).find(v=>v.key===action);
 if(!option){
  activity(n).rejected++;activityNote(n,'Action '+action+' no longer available');
  return false;
 }
 if(['stock_food','stock_water','stock_wood','stock_stone','stock_fiber',
  'make_campfire','make_shelter'].includes(action)){
  if(n.plan)return false;
  n.plan={key:action,steps:0};n.nextPlanAt=state.clock;
  n.goal='Pursuing '+action;n.action='none';n.source=source;n.scores=scores;
 }else if(action==='none'){
  n.action='none';n.task=null;n.source=source;n.scores=scores;
 }else if(action==='rest'){
  n.action='rest';n.task=null;n.path=[];n.travel=null;
  n.source=source;n.scores=scores;n.goal='Resting';
 }else{
  const target=option.target;
  if(target&&dist(n,target)>1){
   const good=(action==='share_food'||action==='socialize')
    ?approach(n,target):moveTo(n,target);
   if(!good){
    activity(n).rejected++;activityNote(n,'No reachable path for '+action);
    remember(n,'Failed to reach a destination for '+action,
     {kind:'failure',action,ref:option.ref,salience:3});
    return false;
   }
  }
  n.action=action;n.source=source;n.scores=scores;
  n.task={key:action,ref:option.ref||null,readyAt:n.path.length?null:
   state.clock+actionDuration(n,action)};
  if(action==='socialize'&&option.target)option.target.peerReservedFor=n.id;
  n.goal=action.replaceAll('_',' ')+' (self-chosen)';
 }
 if(action==='none'){
  activity(n).none++;activityNote(n,'Selected none ['+source+']');
 }else{
  activity(n).started++;activityNote(n,'Started '+action+' ['+source+']');
 }
 record(n.name+' chose '+action.replaceAll('_',' ')+' ['+source+']',
  ['rein','hivemind'].includes(source)?'ai':'routine');
 if(['rein','hivemind'].includes(source))remember(n,'Chose '+action+' from perceived options');
 return true;
}
function completeActivity(n){
 if(!n.task||n.path.length||n.task.readyAt===null||
  state.clock<n.task.readyAt)return;
 if(n.task.key==='socialize'){
  if(n.peerPending||state.backgroundBusy||state.conversationBusy||
    state.paused||state.clock<(n.peerRetryAt||0))return;
  const other=state.npcs.find(v=>v.id===n.task.ref);
  if(!other||dist(n,other)>2){n.task=null;n.thoughtAt=state.clock+5;return;}
  if(!state.connected){
   n.task=null;n.action='none';n.thoughtAt=state.clock+15;
   return;
  }
  void peerExchange(n,other);return;
 }
 const outcome=AgentWorld.complete(n,state.world,state.npcs);
 if(outcome.ok){
  activity(n).completed++;activityNote(n,'Completed: '+outcome.message);
  remember(n,outcome.message,{kind:'success',action:n.task?.key,ref:n.task?.ref,
   salience:n.task?.key==='inspect'?3:2});
  record(n.name+': '+outcome.message,'social');
  if(n.plan){
   n.plan.steps++;n.nextPlanAt=state.clock+1;
   if(n.plan.steps>=24)finishPlan(n,'Plan step limit reached','warning');
  }else n.thoughtAt=state.clock+2;
  }else{
  activity(n).failed++;activityNote(n,'Task failed: '+outcome.message);
  remember(n,'Could not finish '+n.task?.key+': '+outcome.message,
   {kind:'failure',action:n.task?.key,ref:n.task?.ref,salience:3});
  record(n.name+': '+outcome.message+' [rejected]','warning');
  if(n.plan)finishPlan(n,'Plan blocked: '+outcome.message,'warning');
  n.thoughtAt=state.clock+4;
 }
 n.action='none';
}
function advancePlan(n){
 if(!n.plan||n.task||n.path.length||n.action==='rest'||
  state.clock<(n.nextPlanAt||0))return;
 const result=AgentWorld.nextPlanAction(n,state.world,state.npcs,reachability(n));
 if(result.status==='done')return finishPlan(n,'Plan completed');
 if(result.status==='blocked')return finishPlan(n,result.reason,'warning');
 if(!setAction(n,result.option.key,'plan'))finishPlan(n,'Subaction unavailable','warning');
}
async function jsonPost(route,body){
 const response=await fetch(route,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error||'HTTP '+response.status);
  error.status=response.status;throw error;}
 return data;
}
async function checkModel(){
 try{
  const response=await fetch('/api/health',{cache:'no-store'});
  const health=await response.json();
   state.connected=!!health.connected;
   state.model=health.model==='hivemind'?'hivemind':'rein';
   state.modelLabel=typeof health.modelLabel==='string'?health.modelLabel:'Rein-NPC-4B';
 }catch{state.connected=false;}
 const tag=$('modelStatus');tag.className='chip '+(state.connected?'online':'offline');
 tag.replaceChildren();
  const dot=document.createElement('i');dot.className='status-dot';
  tag.append(dot,document.createTextNode(' '+(state.connected?state.modelLabel+' connected':'Offline · basic survival routines')));
  $('modelName').textContent=state.modelLabel;
}
async function deliberate(n){
 if(!state.npcs.includes(n))return;
 state.backgroundBusy=true;
 const location=key(n),options=backgroundOptions(n);
 try{
  if(state.connected){
   const data=await jsonPost('/api/decide',{
    persona:n.personality,scene:sceneFor(n),history:[],
    question:'Which available action do you choose independently, and why?',options
   });
   activity(n).decisions++;
   if(!state.paused&&!state.conversationBusy&&state.npcs.includes(n)&&key(n)===location&&
      options.some(o=>o.key===data.action)){
    const selected=setAction(n,data.action,
     data.source==='hivemind'?'hivemind':'rein',data.scores);
    if(selected&&data.action==='none')autonomousPurpose(n);
   }else{
    activity(n).rejected++;
    activityNote(n,'Discarded stale, paused or invalid model selection');
   }
  }else if(!state.paused)setAction(n,fallbackBackground(n),'offline routine');
 }catch(e){
  if(e.status!==429){
   activity(n).errors++;activityNote(n,'Model error: '+e.message);
   record(n.name+': '+state.modelLabel+' error '+e.message,'warning');
   if(!state.paused&&state.npcs.includes(n))
    setAction(n,fallbackBackground(n),'offline routine');
   void checkModel();
  }
 }finally{
  n.thoughtAt=state.clock+(state.connected?(n.action==='none'&&!n.task?3:25):18);
  state.backgroundBusy=false;state.lastDecisionMs=performance.now();
 }
}
async function peerExchange(n,other){
 if(n.peerPending||other.peerPending||state.backgroundBusy||
  state.conversationBusy||!state.npcs.includes(n)||!state.npcs.includes(other))return;
 n.peerPending=true;other.peerPending=true;state.backgroundBusy=true;
 const locA=key(n),locB=key(other);
 try{
  const response=await jsonPost('/api/peer-exchange',{
   speaker:{name:n.name,persona:n.personality},
   listener:{name:other.name,persona:other.personality},
   scene:sceneFor(n)+'\n'+sceneFor(other).slice(0,420)
  });
  if(state.paused||!state.npcs.includes(n)||!state.npcs.includes(other)||
    !n.task||n.task.key!=='socialize'||n.task.ref!==other.id||
    key(n)!==locA||key(other)!==locB||dist(n,other)>2)return;
  if(typeof response.first!=='string'||typeof response.second!=='string'||
    !response.first.trim()||!response.second.trim())throw Error('Empty exchange');
  n.task.approved=true;
  const outcome=AgentWorld.complete(n,state.world,state.npcs);
  if(!outcome.ok)throw Error(outcome.message);
  activity(n).completed++;activityNote(n,'Completed conversation with '+other.name);
  const first=response.first.slice(0,220),second=response.second.slice(0,220);
  const exchange={at:'Y'+Civilization.stamp(state.clock).year+' '+timeString(),
   with:other.id,first:n.name+': '+first,second:other.name+': '+second};
  n.peerLog.push(exchange);n.peerLog=n.peerLog.slice(-12);
  other.peerLog.push({...exchange,with:n.id});other.peerLog=other.peerLog.slice(-12);
  remember(n,'Spoke with '+other.name+': '+first+'; '+second);
  remember(other,'Spoke with '+n.name+': '+first+'; '+second);
  record(n.name+' and '+other.name+' exchanged dialogue','ai');
  n.action='none';n.thoughtAt=state.clock+4;other.thoughtAt=state.clock+4;
 }catch(e){
  record(n.name+' ↔ '+other.name+': '+e.message,'warning');
  if(n.task?.key==='socialize')n.task=null;
  n.action='none';n.thoughtAt=state.clock+8;
  activity(n).failed++;activityNote(n,'Conversation failed: '+e.message);
 }finally{
  if(other.peerReservedFor===n.id)delete other.peerReservedFor;
  n.peerPending=false;other.peerPending=false;state.backgroundBusy=false;
  state.lastDecisionMs=performance.now();
 }
}
const staticCanvas=document.createElement('canvas');
staticCanvas.width=W*TILE;staticCanvas.height=H*TILE;
const staticCtx=staticCanvas.getContext('2d');
const undergroundCanvas=document.createElement('canvas');
undergroundCanvas.width=W*TILE;undergroundCanvas.height=H*TILE;
const undergroundCtx=undergroundCanvas.getContext('2d');
let drawnLayer=null;
function drawStaticWorld(){VillageArt.drawWorld(staticCtx,{width:W,height:H},[],[],state.world);}
function drawUnderground(){
 if(drawnLayer===state.viewZ)return;
 drawnLayer=state.viewZ;
 undergroundCtx.clearRect(0,0,W*TILE,H*TILE);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const m=Frontier.materialAt(state.world,x,y,state.viewZ);
  undergroundCtx.fillStyle=m==='cave'?'#293c3c':m==='air'?'#455b60':
   m==='water'?'#306b80':m==='stone'?'#716b64':'#414744';
  undergroundCtx.fillRect(x*TILE,y*TILE,TILE,TILE);
  if(m==='cave'){
   undergroundCtx.fillStyle='#53665c';
   undergroundCtx.fillRect(x*TILE+3,y*TILE+5,2,2);
  }
 }
}
function loadTileset(){
 if(typeof Image==='undefined')return;
 const img=new Image();
 img.onload=()=>{
  if(VillageArt.setAtlas(img)){
   installedAtlas=img;drawStaticWorld();$('artToggle').textContent='Art: CC0 Tiny Town';
  }
 };
 img.src='/assets/kenney-tiny-town.png';
}
function updateCamera(force=false){
 const p=selectedNpc();
 if(!p||!state.follow)return;
 const point=position(p),viewW=canvas.width/state.zoom,viewH=canvas.height/state.zoom;
 const tx=(point.x+.5)*TILE-viewW/2,ty=(point.y+.5)*TILE-viewH/2;
 const dx=((((tx-state.camera.x)%(W*TILE))+1.5*W*TILE)%(W*TILE))-.5*W*TILE;
 const dy=((((ty-state.camera.y)%(H*TILE))+1.5*H*TILE)%(H*TILE))-.5*H*TILE;
 state.camera.x=Frontier.wrap(state.camera.x+(force?dx:dx*.18),W*TILE);
 state.camera.y=Frontier.wrap(state.camera.y+(force?dy:dy*.18),H*TILE);
}
function clientToTile(clientX,clientY,rect){
 const sx=(clientX-rect.left)*canvas.width/rect.width;
 const sy=(clientY-rect.top)*canvas.height/rect.height;
 return {x:wrapX(Math.floor((state.camera.x+sx/state.zoom)/TILE)),
  y:wrapY(Math.floor((state.camera.y+sy/state.zoom)/TILE)),z:state.viewZ};
}
function drawWorld(){
 updateCamera();
 ctx.imageSmoothingEnabled=false;ctx.fillStyle='#152925';
 ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.save();ctx.scale(state.zoom,state.zoom);
 const vw=canvas.width/state.zoom,vh=canvas.height/state.zoom;
 const layer=state.viewZ===0?staticCanvas:(drawUnderground(),undergroundCanvas);
 for(const ox of [-W*TILE,0,W*TILE])for(const oy of [-H*TILE,0,H*TILE]){
  const x=ox-state.camera.x,y=oy-state.camera.y;
  if(x>vw||y>vh||x+W*TILE<0||y+H*TILE<0)continue;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.drawImage(layer,0,0);
  if(state.viewZ===0){
   VillageArt.drawWorldObjects(ctx,state.world,{
    left:-1,top:-1,right:W+1,bottom:H+1});
   const focused=AgentWorld.objectById(state.world,state.selectedObject);
   if(focused){
    ctx.strokeStyle='#fff0a6';ctx.lineWidth=2;
    ctx.strokeRect(focused.x*TILE+1,focused.y*TILE+1,TILE-2,TILE-2);
   }
  }
  for(const n of state.npcs.filter(v=>(v.z||0)===state.viewZ)
   .sort((a,b)=>position(a).y-position(b).y)){
   const p=position(n);
   VillageArt.drawActor(ctx,n,false,{x:wrapX(p.x),y:wrapY(p.y)},
    state.selected===n.id,performance.now());
  }
  if(state.viewZ===0)VillageArt.drawAmbient(ctx,state.world,state.clock,performance.now());
  if(state.debugGrid){
   ctx.strokeStyle='rgba(255,220,152,.25)';ctx.lineWidth=.5;
   for(let i=0;i<=W;i++){ctx.beginPath();ctx.moveTo(i*TILE,0);
    ctx.lineTo(i*TILE,H*TILE);ctx.stroke();}
   for(let i=0;i<=H;i++){ctx.beginPath();ctx.moveTo(0,i*TILE);
    ctx.lineTo(W*TILE,i*TILE);ctx.stroke();}
  }
  ctx.restore();
 }
 ctx.restore();
}
function renderEvents(){
 const area=$('eventLog');area.replaceChildren();
 for(const e of state.events.slice(0,40)){
  const row=document.createElement('div');row.className='event '+e.type;
  const tm=document.createElement('span');tm.className='event-time';tm.textContent=e.time;
  const dot=document.createElement('i');dot.className='event-dot';
  const msg=document.createElement('span');msg.textContent=e.text;
  row.append(tm,dot,msg);area.append(row);
 }
}
function renderResidents(){
 const area=$('residentList');area.replaceChildren();
 for(const n of state.npcs){
  const btn=document.createElement('button');btn.type='button';
  btn.className='resident'+(n.id===state.selected?' active':'');
  const mark=document.createElement('i');mark.className='symbol';mark.style.background=n.color;
  btn.append(mark,document.createTextNode(n.name));
  btn.addEventListener('click',()=>selectNpc(n.id));area.append(btn);
 }
}
function updateInspector(){
 const n=selectedNpc();
 $('npcCount').textContent=state.npcs.length+' alive · '+state.dead.length+' dead';
 if(!n){
  $('npcName').textContent='No living inhabitants';
  $('npcMeta').textContent='The next monthly arrival may repopulate the world.';
  return;
 }
 $('npcPortrait').textContent=n.name[0];$('npcPortrait').style.background=n.color+'44';
 $('npcName').textContent=n.name;
 $('npcMeta').textContent='Age '+Math.floor(Civilization.age(n,state.clock))+
  ' · Y'+Civilization.stamp(state.clock).year+' · '+AgentWorld.focus(n);
 for(const [prefix,val] of [['mood',n.mood],['energy',n.energy],['health',n.health]]){
  $(prefix+'Val').textContent=Math.round(val)+'/100';
  $(prefix+'Meter').style.width=clamp(val)+'%';
 }
 $('hungerVal').textContent=Math.round(n.needs.hunger)+'/100';
 $('hungerMeter').style.width=clamp(n.needs.hunger)+'%';
 $('thirstVal').textContent=Math.round(n.needs.thirst)+'/100';
 $('thirstMeter').style.width=clamp(n.needs.thirst)+'%';
 $('socialVal').textContent=Math.round(n.needs.social)+'/100';
 $('bioSensation').textContent=Biology.sensation(n.bio,n.needs);
 const diet=Biology.nutrition(n.bio,state.clock);
 $('bioNutrition').textContent=diet.kcal+' kcal · '+diet.meals+' meals · '+diet.diversity+' foods';
 $('bioHormones').textContent=Object.entries(n.bio.hormones)
  .map(([k,v])=>k+' '+Math.round(v)).join(' · ');
 $('inventoryVal').textContent=Object.entries(n.inventory).map(([k,v])=>k+' '+v).join(' · ');
 $('experienceVal').textContent=Object.entries(n.skills).filter(([,v])=>v>0)
  .map(([k,v])=>k+' '+v).join(' · ')||'No practice yet';
 $('knowledgeVal').textContent=(n.knowledge?.recipes||[]).join(', ')||'No learned recipes';
 $('npcGoal').textContent=n.goal;
 $('npcPlan').textContent=n.plan?n.plan.key+' ('+n.plan.steps+' steps)':'No active plan';
 const a=activity(n);
 $('npcActivity').textContent=a.decisions+' model decisions · '+a.started+
  ' actions started · '+a.completed+' completed · '+a.none+' no-ops';
 $('npcActivityFailures').textContent=(a.rejected+a.failed+a.blocked)+
  ' rejected/failed/blocked · '+a.errors+' model errors';
 $('npcActivityLast').textContent=a.last;
 $('npcCrafting').textContent=n.workpiece?
  Crafting.RECIPES[n.workpiece.recipe].name+' · '+(n.workpiece.stage+1)+'/'+
  Crafting.RECIPES[n.workpiece.recipe].stages.length:'No workpiece';
 $('npcGoods').textContent=(n.craftedItems||[]).slice(-5).map(p=>
  p.kind+' ★'+p.quality).join(', ')||'None';
 $('decisionSource').textContent=n.source==='rein'?'Rein-NPC':n.source==='hivemind'?'Hivemind':n.source||'Simulation';
 const scores=$('npcDecisions');scores.replaceChildren();
 if(n.scores)for(const [label,val] of Object.entries(n.scores)){
  const row=document.createElement('div');row.className='decision-row';
  const t=document.createElement('span');t.textContent=label;
  const v=document.createElement('strong');v.textContent=Math.round(val*100)+'%';
  row.append(t,v);scores.append(row);
 }
 const memories=$('npcMemories');memories.replaceChildren();
 for(const m of n.memories.slice(-7).reverse()){
  const row=document.createElement('div');row.className='memory';
  row.textContent=m.time+' — '+m.text;memories.append(row);
 }
 renderChat();
}
function renderObjectInspector(){
 const object=AgentWorld.objectById(state.world,state.selectedObject);
 const info=AgentWorld.describeObject(state.world,object);
 $('objectName').textContent=info?.name||'Select a resource or object on the map';
 $('objectDetail').textContent=info?info.description:
  'Click a tree, berry shrub, spring, stone outcrop, item or constructed object.';
 $('objectLocation').textContent=info?
  'Position '+info.x+', '+info.y+' · Physical state persists':'No object selected';
}
function renderChat(){
 const n=selectedNpc(),area=$('chatLog');area.replaceChildren();
 if(!n)return;
 for(const ex of (n.peerLog||[]).slice(-8).reverse()){
  const row=document.createElement('div');row.className='memory';
  row.textContent=ex.at+' · '+ex.first+' / '+ex.second;area.append(row);
 }
 if(!n.peerLog.length){
  const publicTalk=state.npcs.flatMap(person=>(person.peerLog||[])
   .filter(ex=>person.id<ex.with).map(ex=>({...ex,person:person.name})))
   .sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5);
  if(publicTalk.length){
   const heading=document.createElement('div');heading.className='empty';
   heading.textContent='Latest conversations elsewhere:';area.append(heading);
   for(const ex of publicTalk){
    const row=document.createElement('div');row.className='memory';
    row.textContent=ex.at+' · '+ex.first+' / '+ex.second;area.append(row);
   }
  }else{
   const empty=document.createElement('div');empty.className='empty';
   empty.textContent=state.connected?'No completed model conversations yet.':
    'Offline: dialogue requires a connected model.';
   area.append(empty);
  }
 }
}
function serializePerson(n){
 const {travel,motion,blockedFor,peerPending,peerReservedFor,peerRetryAt,...stored}=n;
 return stored;
}
function save(){
 try{
  const pack={version:3,seed:state.world.seed,clock:state.clock,
   nextPersonId:state.nextPersonId,npcs:state.npcs.map(serializePerson),
   dead:state.dead,world:state.world,events:state.events,
   selected:state.selected,viewZ:state.viewZ};
  localStorage.setItem(STORE,JSON.stringify(pack));
 }catch{ /* No destructive reset when storage is unavailable. */ }
}
function validSavedPath(path,start){
 if(!Array.isArray(path)||path.length>W*H*8)return false;
 let prev={x:start.x,y:start.y,z:start.z||0};
 for(const tile of path){
  if(!tile||!Frontier.neighbors(state.world,prev).some(p=>key(p)===key(tile)))
   return false;
  prev=tile;
 }
 return true;
}
function restore(){
 try{
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(!saved||saved.version!==3||saved.seed!==state.world.seed||
    !Number.isFinite(saved.clock)||saved.clock<490||
    !Number.isInteger(saved.nextPersonId)||saved.nextPersonId<6||
    !Array.isArray(saved.npcs)||!Array.isArray(saved.dead))return;
  AgentWorld.restoreWorld(state.world,saved.world);
  Frontier.restore(state.world,saved.world);
  state.clock=saved.clock;state.world.now=saved.clock;
  const seen=new Set();
  const archived=new Set(saved.dead.filter(v=>v&&typeof v.id==='string').map(v=>v.id));
  state.npcs=[];
  for(const old of saved.npcs.slice(0,5000)){
   if(!old||typeof old.id!=='string'||!/^person_[1-9]\d*$/.test(old.id)||
     seen.has(old.id)||archived.has(old.id)||!Number.isInteger(old.x)||!Number.isInteger(old.y)||
     !Number.isInteger(old.z)||isBlocked(old.x,old.y,old.z))continue;
   if(!Number.isFinite(old.birthAt)||old.birthAt>state.clock||
     !Number.isFinite(old.health)||old.health<=0)continue;
   seen.add(old.id);
   const n=Civilization.person(state.world,Number(old.id.slice(7)),
    Number.isFinite(old.spawnAt)?old.spawnAt:490,old);
   n.x=old.x;n.y=old.y;n.z=old.z;
   n.name=String(old.name||n.name).slice(0,80);
   n.birthAt=old.birthAt;n.health=clamp(old.health);n.alive=true;
   for(const k of ['mood','energy','trust'])if(Number.isFinite(old[k]))n[k]=clamp(old[k]);
   for(const k of ['goal','source','personality','facing'])
    if(typeof old[k]==='string')n[k]=old[k].slice(0,300);
   for(const k of Object.keys(n.needs))
    if(Number.isFinite(old.needs?.[k]))n.needs[k]=clamp(old.needs[k]);
   for(const k of Object.keys(n.inventory))
    if(Number.isInteger(old.inventory?.[k])&&old.inventory[k]>=0)
     n.inventory[k]=Math.min(old.inventory[k],1000);
   for(const k of Object.keys(n.skills))
    if(Number.isInteger(old.skills?.[k])&&old.skills[k]>=0)
     n.skills[k]=Math.min(old.skills[k],100000);
   n.bio=Biology.restore(old.bio,n.inventory.food);
   if(old.activityStats&&typeof old.activityStats==='object'){
    const a=activity(n);
    for(const k of ['decisions','none','rejected','started','completed','failed','blocked','errors'])
     if(Number.isInteger(old.activityStats[k])&&old.activityStats[k]>=0)
      a[k]=Math.min(old.activityStats[k],10000000);
    if(typeof old.activityStats.last==='string')
     a.last=old.activityStats.last.slice(0,110);
   }
   Crafting.restore(n,old);
   n.knowledge={recipes:Array.isArray(old.knowledge?.recipes)?
    [...new Set(old.knowledge.recipes.filter(v=>
      ['hatchet','campfire','shelter'].includes(v)))]:[],observations:[]};
   if(Array.isArray(old.knowledge?.observations))
    n.knowledge.observations=old.knowledge.observations.filter(o=>o&&
     typeof o.id==='string'&&AgentWorld.objectById(state.world,o.id)&&
     typeof o.text==='string'&&Number.isFinite(o.at))
     .slice(-40).map(o=>({id:o.id,kind:String(o.kind||'').slice(0,30),
      at:o.at,text:o.text.slice(0,240)}));
   Cognition.restore(n,old.memories);
   if(Array.isArray(old.peerLog))n.peerLog=old.peerLog.slice(-12);
   if(old.relationships&&typeof old.relationships==='object')n.relationships=old.relationships;
   if(Array.isArray(old.visited))n.visited=old.visited.slice(-32);
   if(validSavedPath(old.path,n))n.path=old.path;
   if(AgentWorld.KEYS.includes(old.task?.key)&&
     (old.task.ref===null||typeof old.task.ref==='string')){
    n.task={key:old.task.key,ref:old.task.ref,
     readyAt:Number.isFinite(old.task.readyAt)?Math.max(old.task.readyAt,state.clock):null};
   }
   n.plan=AgentWorld.validatePlan(old.plan);
   if(n.workpiece&&(!n.plan||n.plan.key!=='craft_project'||
    n.plan.recipe!==n.workpiece.recipe))
    n.plan={key:'craft_project',recipe:n.workpiece.recipe,steps:0};
   if(!n.workpiece&&n.plan?.key==='craft_project')n.plan=null;
   n.action=AgentWorld.KEYS.includes(old.action)?old.action:'none';
   n.thoughtAt=state.clock+3+state.npcs.length*2;
   state.npcs.push(n);
  }
  state.dead=saved.dead.filter(v=>v&&typeof v.id==='string'&&!seen.has(v.id)).slice(-10000);
  const maxId=Math.max(5,...state.npcs.map(n=>Number(n.id.slice(7))),
   ...state.dead.filter(v=>/^person_[1-9]\d*$/.test(v.id))
    .map(v=>Number(v.id.slice(7))));
  state.nextPersonId=Math.max(saved.nextPersonId,maxId+1);
  state.events=Array.isArray(saved.events)?saved.events.slice(0,100):[];
  state.selected=state.npcs.some(n=>n.id===saved.selected)
   ?saved.selected:state.npcs[0]?.id||null;
  if(Number.isInteger(saved.viewZ)&&saved.viewZ>=Frontier.MIN_Z&&
   saved.viewZ<=Frontier.MAX_Z)state.viewZ=saved.viewZ;
 }catch{ /* Damaged save is ignored; a fresh world remains available. */ }
}
function step(dt){
 if(state.paused||dt<=0)return;
 const elapsed=dt*state.speed/60,before=state.clock;
 state.clock+=elapsed;state.world.now=state.clock;
 state.day=Math.floor(state.clock/1440)+1;
 state.world.weather=Frontier.weather(state.world,state.clock);
 AgentWorld.regenerate(state.world,elapsed);
 const arrivals=Civilization.advanceArrivals(state,before,state.clock);
 for(const n of arrivals)record(n.name+' arrived in the wilderness','social');
 for(const n of [...state.npcs]){
  if(n.peerReservedFor&&!state.npcs.some(peer=>peer.id===n.peerReservedFor&&
   peer.task?.key==='socialize'&&peer.task.ref===n.id))delete n.peerReservedFor;
  if(!n.peerPending&&!n.peerReservedFor)updateMovement(n,elapsed);
  const recovery=AgentWorld.stepNeeds(n,state.world,elapsed);
  if(recovery==='Recovered'){
   activity(n).completed++;activityNote(n,'Finished resting and recovered');
  }
  const death=Civilization.updateHealth(state,n,elapsed);
  if(death){record(n.name+' died of '+death,'warning');continue;}
  if(!n.peerPending){
   if(n.task&&!n.path.length)completeActivity(n);
   else if(n.plan&&!n.task&&!n.path.length)advancePlan(n);
  }
 }
 if(!state.npcs.some(n=>n.id===state.selected)){
  state.selected=state.npcs[0]?.id||null;renderResidents();
 }
 scheduleIdleAgents();
}
function drawMinimap(){
 const c=$('miniMap'),m=c.getContext('2d');
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  m.fillStyle=Frontier.COLORS[Frontier.terrainAt(state.world,x,y)];
  m.fillRect(x*2,y*2,2,2);
 }
 for(const n of state.npcs){
  m.fillStyle='#f1c7ac';m.fillRect(n.x*2,n.y*2,2,2);
 }
}
function updateHUD(now){
 if(now<state.nextUI)return;
 state.nextUI=now+600;
 const stamp=Civilization.stamp(state.clock);
 $('worldTime').textContent=timeString();
 $('worldDay').textContent=stamp.season.toUpperCase()+' · YEAR '+stamp.year+' · MONTH '+stamp.month+' · DAY '+stamp.day;
 $('worldWeather').textContent=state.world.weather.kind.toUpperCase()+
  ' · '+state.world.weather.temperature+'°C';
 $('worldSeed').textContent=String(state.world.seed);
 $('populationStats').textContent=state.npcs.length+' living · '+state.dead.length+
  ' deaths · '+state.world.structures.length+' constructed objects · next arrivals on the 1st';
 $('zLabel').textContent='Z '+state.viewZ;
 $('worldStatus').textContent=state.paused?'Paused':state.backgroundBusy?
  state.modelLabel+' deliberating…':'World running';
 $('footerNote').textContent=state.connected?
  'One shared '+state.modelLabel+' lane · deterministic world rules':'Offline survival fallback (not AI cognition)';
 $('pauseBtn').textContent=state.paused?'▶ Resume':'Ⅱ Pause';
 renderResidents();updateInspector();drawMinimap();
 if(now>state.nextSave){save();state.nextSave=now+5000;}
}
const heldKeys=new Set();
window.addEventListener('keydown',event=>{
 const active=document.activeElement?.tagName;
 if(active==='INPUT'||active==='TEXTAREA')return;
 const k=event.key.toLowerCase();
 if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown'].includes(k)){
  event.preventDefault();state.follow=false;heldKeys.add(k);
 }else if(k==='+'||k==='='){event.preventDefault();setZoom(state.zoom+1);}
 else if(k==='-'||k==='_'){event.preventDefault();setZoom(state.zoom-1);}
 else if(k==='pageup'){event.preventDefault();setZ(state.viewZ+1);}
 else if(k==='pagedown'){event.preventDefault();setZ(state.viewZ-1);}
 else if(k==='f'&&selectedNpc()){state.follow=true;updateCamera(true);}
});
window.addEventListener('keyup',e=>heldKeys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>heldKeys.clear());
window.addEventListener('pagehide',save);
function pan(dt){
 if(state.follow)return;
 const dx=(heldKeys.has('d')||heldKeys.has('arrowright')?1:0)-
  (heldKeys.has('a')||heldKeys.has('arrowleft')?1:0);
 const dy=(heldKeys.has('s')||heldKeys.has('arrowdown')?1:0)-
  (heldKeys.has('w')||heldKeys.has('arrowup')?1:0);
 state.camera.x+=dx*220*dt/state.zoom;
 state.camera.y+=dy*220*dt/state.zoom;
}
function frameStep(dt){pan(dt);step(dt);}
function setZoom(n){state.zoom=clamp(n,1,3);$('zoomLevel').textContent=state.zoom+'×';updateCamera(true);}
function setZ(n){state.viewZ=clamp(n,Frontier.MIN_Z,Frontier.MAX_Z);
 drawnLayer=null;$('zLabel').textContent='Z '+state.viewZ;}
canvas.addEventListener('click',event=>{
 const tile=clientToTile(event.clientX,event.clientY,canvas.getBoundingClientRect());
 const n=state.npcs.find(p=>(p.z||0)===tile.z&&dist(p,tile)<=1);
 if(n){state.selectedObject=null;selectNpc(n.id);renderObjectInspector();return;}
 const object=tile.z===0?[...state.world.items,...state.world.nodes,
  ...state.world.structures].find(o=>o.x===tile.x&&o.y===tile.y):null;
 state.selectedObject=object?.id||null;renderObjectInspector();
 if(!object){state.follow=false;state.camera.x=tile.x*TILE-canvas.width/(2*state.zoom);
  state.camera.y=tile.y*TILE-canvas.height/(2*state.zoom);}
});
$('pauseBtn').addEventListener('click',()=>{state.paused=!state.paused;});
$('zoomIn').addEventListener('click',()=>setZoom(state.zoom+1));
$('zoomOut').addEventListener('click',()=>setZoom(state.zoom-1));
$('zUp').addEventListener('click',()=>setZ(state.viewZ+1));
$('zDown').addEventListener('click',()=>setZ(state.viewZ-1));
$('followBtn').addEventListener('click',()=>{state.follow=true;updateCamera(true);});
$('physicsDebug').addEventListener('click',()=>{
 state.debugGrid=!state.debugGrid;
 $('physicsDebug').textContent=state.debugGrid?'Grid: On':'Grid: Off';
});
$('artToggle').addEventListener('click',()=>{
 if(!installedAtlas){record('Optional CC0 atlas is not installed');return;}
 showAtlas=!showAtlas;
 VillageArt.setAtlas(showAtlas?installedAtlas:null);
 drawStaticWorld();
 $('artToggle').textContent=showAtlas?'Art: CC0 Tiny Town':'Art: Original';
});
$('autoAI').addEventListener('change',e=>{state.auto=e.target.checked;});
for(const button of document.querySelectorAll('[data-speed]'))button.addEventListener('click',()=>{
 state.speed=Number(button.dataset.speed);
 document.querySelectorAll('[data-speed]').forEach(el=>
  el.classList.toggle('active',el===button));
});
$('clearLog').addEventListener('click',()=>{state.events=[];renderEvents();});
$('resetBtn').addEventListener('click',()=>{
 if(!window.confirm('Reset this simulated world and its history?'))return;
 localStorage.removeItem(STORE);window.location.reload();
});
$('newIsland').addEventListener('click',()=>{
 if(!window.confirm('Generate a new world? This discards the current local simulation.'))return;
 localStorage.setItem('ai-npc-cog-world-seed',
  String(Math.floor(Math.random()*2147483646)+1));
 localStorage.removeItem(STORE);window.location.reload();
});
function tick(now){
 // Fixed 50 ms logical steps prevent frame jitter from changing action ordering.
 // Long browser suspensions do not silently fast-forward a year of AI actions.
 const dt=tick.last===undefined?0:Math.max(0,Math.min(.25,(now-tick.last)/1000));
 tick.last=now;tick.accumulator=(tick.accumulator||0)+dt;
 let ticks=0;
 while(tick.accumulator>=.05&&ticks<5){
  frameStep(.05);tick.accumulator-=.05;ticks++;
 }
 if(tick.accumulator>=.05)tick.accumulator=0;
 drawWorld();updateHUD(now);requestAnimationFrame(tick);
}
drawStaticWorld();restore();loadTileset();
state.world.now=state.clock;state.world.weather=Frontier.weather(state.world,state.clock);
for(const n of state.npcs)Frontier.reveal(state.world,n.x,n.y,7);
renderResidents();updateInspector();renderChat();renderObjectInspector();renderEvents();updateCamera(true);
record('Natural toroidal world initialized; five independent founders, no prebuilt structures.');
checkModel();setInterval(checkModel,10000);requestAnimationFrame(tick);
