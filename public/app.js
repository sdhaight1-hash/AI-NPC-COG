'use strict';
// God-mode observer. Rendering is a projection of the authoritative toroidal grid.
const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
const TILE=VillageArt.TILE,W=Frontier.WIDTH,H=Frontier.HEIGHT;
const STORE='ai-npc-cog-v3';
const SPEED_STORE='ai-npc-cog-speed';
const PRESET_SPEEDS=[1,60,120,240,3600];
const storedSpeed=Number(localStorage.getItem(SPEED_STORE));
const initialSpeed=PRESET_SPEEDS.includes(storedSpeed)?storedSpeed:240;
const WORLD_SEED=Number(localStorage.getItem('ai-npc-cog-world-seed'))||Frontier.DEFAULT_SEED;
const world=AgentWorld.newWorld(WORLD_SEED);
const founders=Civilization.founders(world,490);
const state={clock:490,speed:initialSpeed,day:1,paused:false,auto:true,connected:false,
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
 fill_water:1,eat:3,drink:1,drink_source:1,craft_hatchet:12,experiment_wood_stone:15,
 experiment_wood_fiber:15,experiment_wood_stone_fiber:15,
 build_fire:20,build_shelter:75,share_food:2,socialize:3,inspect:2,drop_wood:2,drop_stone:2,drop_fiber:2,pickup_item:2,place_crate:6,
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
function pathfind(start,end){return WorldRuntime.pathfind(state,start,end);}
function reachable(n,point){
 if(isBlocked(point.x,point.y,point.z||0))return false;
 return dist(n,point)===0||pathfind(n,point).length>0;
}
function reachability(n){return WorldRuntime.reachability(state,n);}
function availableActivities(n){return WorldRuntime.available(state,n);}
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
function moveTo(n,target){return WorldRuntime.moveTo(state,n,target);}
function approach(n,target){return WorldRuntime.approach(state,n,target);}
function position(n){
 if(!n.travel||!n.path?.length)return {x:n.x,y:n.y};
 const next=n.path[0],fraction=clamp(1-n.travel.remaining/n.travel.total,0,1);
 let dx=next.x-n.x,dy=next.y-n.y;
 if(dx>W/2)dx-=W;if(dx<-W/2)dx+=W;
 if(dy>H/2)dy-=H;if(dy<-H/2)dy+=H;
 return {x:n.x+dx*fraction,y:n.y+dy*fraction};
}
function updateMovement(n,elapsed){return WorldRuntime.move(state,n,elapsed);}
function sceneFor(n){
 const sensed=Perception.snapshot(state,n);
 const audible=sensed.heard.slice(-4).map(e=>e.kind+' '+e.proximity+
  ' to the '+e.direction).join('; ')||'Nothing distinctive';
 const others=sensed.people.map(p=>p.name+' at '+p.x+','+p.y+
  ' ('+p.activity+')').join(', ')||'Nobody visible';
 // Vision identifies silhouettes and locations, not exact unseen resource stocks.
 // Only inspection or touch may reveal a precise container/deposit quantity.
 const nearby=sensed.objects.slice(0,8).map(o=>o.kind+
  ' at '+o.x+','+o.y).join('; ')||'None visible';
 const sensations=Biology.sensation(n.bio,n.needs);
 const known=(n.knowledge?.recipes||[]).join(', ')||'No discovered crafting methods';
 const a=Agency.state(n),motives=Agency.drives(n);
 const memoryQuery=(a.goal?.key||n.goal)+' '+sensations+' '+nearby+' '+n.action;
 const memories=Cognition.recall(n,memoryQuery,state.clock,4)
  .map(m=>m.kind+': '+m.text).join('; ')||'No relevant personal recollections';
 const evidenced=EvidenceMemory.recall(n,memoryQuery,state.clock,3)
  .map(m=>m.certainty+' '+m.type+': '+m.text+
   (m.receiptId?' [verified '+m.receiptId+']':'')+
   (m.type==='inspection'&&m.certainty==='observed'&&m.ref?
    ' [source:'+m.ref+']':'')).join('; ')||'No source-backed experiences';
 const beliefs=a.beliefs.slice(-4).map(b=>b.kind+' at '+b.x+','+b.y+
  ' ('+b.status+', last personally witnessed '+Math.floor(b.at)+')').join('; ')||'None';
 const heardSpeakers=[...new Set((n.evidenceMemory?.claims||[])
  .map(c=>c.speakerId))].slice(-4);
 const reliability=heardSpeakers.map(id=>{
  const r=EvidenceMemory.speakerReliability(n,id);
  return id+' '+r.supported+' supported, '+r.contradicted+
   ' contradicted ('+r.samples+' verified; report score '+
   r.score.toFixed(2)+')';
 }).join('; ')||'No independently verified reports';
 return 'Year '+Civilization.stamp(state.clock).year+', '+Civilization.stamp(state.clock).season+', '+timeString()+
  '. Untamed procedural wilderness; no predefined community or government. '+
  n.name+' at ('+n.x+','+n.y+','+(n.z||0)+'). Personality: '+n.personality+
  '. Age '+Math.floor(Civilization.age(n,state.clock))+
  ', health '+Math.round(n.health)+', energy '+Math.round(n.energy)+
  ', hunger '+Math.round(n.needs.hunger)+', thirst '+Math.round(n.needs.thirst)+
  ', loneliness '+Math.round(n.needs.social)+'. Bodily sensations: '+sensations+
  '. Personal drives: '+Object.entries(motives).map(([k,v])=>k+' '+Math.round(v)).join(', ')+
  '. Current intention: '+(a.goal?.key||n.plan?.key||'undecided')+
  '. My witnessed beliefs: '+beliefs+'. Relevant personal recall: '+memories+
  '. Evidence-linked recall: '+evidenced+
  '. My own verification of others\' resource reports (not friendship): '+reliability+
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
  '. Heard: '+audible+'. Visible people: '+others+
  '. Perceived resources: '+nearby+
  '. Intent: '+n.goal+'. Choose only available actions. Unknown recipes are not available.'+
  ' Others have independent beliefs, relationships and decisions.';
}
function actionDuration(n,key){return WorldRuntime.actionDuration(n,key);}
function backgroundOptions(n){
 // The same legal affordances serve the model and the autonomous executor.
 // Personal need, traits, remembered outcomes and ongoing goals order them.
 const sensedOptions=Perception.filterAffordances(state,n,availableActivities(n));
 const choices=Agency.ranked(n,sensedOptions.filter(o=>o.key!=='none'),
  state.world,state.clock).slice(0,9);
 choices.push({key:'none',when:'Observe surroundings before deciding'});
 return choices.map(({key,when})=>({key,when}));
}
function fallbackBackground(n){
 const options=availableActivities(n).filter(o=>o.key!=='socialize');
 const choice=Agency.choose(n,options,state.world,state.clock);
 return choice?.key||AgentWorld.fallback(n,backgroundOptions(n));
}
// Physiological responses continue while inference is busy. They still consume
// simulation time and inventory through the ordinary action executor.
function survivalReflex(n){
 if(n.peerPending||n.peerReservedFor)return false;
 const critical=n.needs.thirst>=90||n.needs.hunger>=95||
  n.bio?.hydrationBudgetMl<200;
 if((n.task||n.path.length||n.action==='rest')&&!critical)return false;
 const hydration=n.bio?.hydrationBudgetMl??2400;
 // Resume a protected suspended activity after the immediate emergency.
 if((n.suspendedActivities?.length||n.plan?.key==='craft_project')&&
   hydration>=450&&
  n.needs.thirst<85&&n.needs.hunger<90&&n.energy>18)return false;
 const waterSafe=n.needs.thirst<62&&hydration>=1200&&
  (n.inventory.water>=2||hydration>=1600);
 if(waterSafe&&n.needs.hunger<85&&n.bio?.longTermKcal>=150&&
  n.energy>18)return false;
 const urgent=Cognition.instinct(n,availableActivities(n));
 if(!urgent)return false;
 if(n.task?.key===urgent)return false;
 if(n.task||n.path.length||n.action==='rest'){
  // A physical emergency interrupts activity, never destroys the workpiece.
  // The multi-stage project remains and resumes after recovery.
  Activities.interrupt(state,n,'CRITICAL_NEED');
  n.task=null;n.path=[];n.travel=null;n.action='none';
  if(n.plan)n.nextPlanAt=state.clock+2;
  remember(n,'Interrupted work to address immediate bodily danger',
   {kind:'need',salience:4});
 }
 return setAction(n,urgent,'survival instinct');
}
function autonomousPurpose(n){
 if(n.task||n.plan||n.path.length||n.action==='rest')return false;
 const options=availableActivities(n).filter(o=>
  state.connected||o.key!=='socialize');
 const selected=Agency.choose(n,options,state.world,state.clock);
 return selected?setAction(n,selected.key,'self-directed goal'):false;
}
function socialInitiative(n){
 if(!state.connected||n.needs.social<50||n.energy<25||
  n.task||n.plan||n.path.length||n.peerPending||n.peerReservedFor||
  state.clock<(n.lastPeerAt??-100000)+90)return false;
 return setAction(n,'socialize','social initiative');
}
function scheduleIdleAgents(){
 if(!state.auto||state.paused)return;
 // Physiology remains authoritative even while connected dialogue is pending.
 for(const n of state.npcs)survivalReflex(n);
 if(state.conversationBusy)return;
 // A social need can initiate a meeting, never fabricate dialogue.
 if(state.connected&&!state.backgroundBusy){
  const initiator=state.npcs.find(n=>n.needs.social>=50&&
   !n.task&&!n.plan&&!n.path.length&&!n.peerReservedFor&&!n.peerPending&&
   state.clock>=n.thoughtAt);
  if(initiator)socialInitiative(initiator);
 }
 const due=state.npcs.filter(n=>!n.task&&!n.plan&&!n.path.length&&!n.peerPending&&!n.peerReservedFor&&
  (!n.project||n.project.status==='COMPLETED')&&
  n.action!=='rest'&&state.clock>=n.thoughtAt)
  .sort((a,b)=>a.thoughtAt-b.thoughtAt);
 if(!state.connected){
  // Offline world rules need no serialized model inference lane.
  for(const n of due){
   if(n.needs.social>=80&&n.energy>=25){
    const partner=availableActivities(n).find(o=>o.key==='socialize'&&
     o.target?.needs.social>=45&&o.target?.energy>=20);
    if(partner&&setAction(n,'socialize','offline routine')){
     n.thoughtAt=state.clock+18;continue;
    }
   }
   if(Projects.maybeStart(state,n)){
    WorldRuntime.advanceProject(state,n,{onRecord:renderEvents});
    n.thoughtAt=state.clock+18;continue;
   }
   const options=availableActivities(n);
   const peer=options.find(o=>o.key==='socialize'&&
    n.needs.social>=60&&n.energy>=25&&
    o.target?.needs.social>=45&&o.target?.energy>=20);
   const success=setAction(n,peer?'socialize':fallbackBackground(n),'offline routine');
   n.thoughtAt=state.clock+(success?18:3);
  }
 }else{
  // Keep the model lane for one NPC, but don't let a serialized inference
  // backlog freeze every other body for hours at accelerated world speeds.
  if(!state.backgroundBusy&&due.length&&
   performance.now()-state.lastDecisionMs>=1500){
   const n=due[0];
   if(Projects.maybeStart(state,n)){
    WorldRuntime.advanceProject(state,n,{onRecord:renderEvents});
    n.thoughtAt=state.clock+18;
   }else void deliberate(n);
  }
  for(const n of due){
   if(n===state.modelDecisionActor||n.task||n.plan||n.path.length||
    n.action==='rest'||n.peerPending||n.peerReservedFor||
    state.clock-n.thoughtAt<8)continue;
   // After eight simulated minutes waiting, use the same legal, physical
   // offline agency already exercised headlessly. Do not invent dialogue.
   if(Projects.maybeStart(state,n)){
    WorldRuntime.advanceProject(state,n,{onRecord:renderEvents});
    n.thoughtAt=state.clock+18;
   }else{
    const ok=setAction(n,fallbackBackground(n),'offline routine');
    n.thoughtAt=state.clock+(ok?18:3);
   }
  }
 }
}
function finishPlan(n,reason,type='social'){
 if(!n.plan)return;
 const success=reason==='Plan completed';
 Agency.finish(n,success,state.clock);
 remember(n,'Plan '+n.plan.key+': '+reason,{kind:success?'success':'failure',
  action:n.plan.key,salience:success?4:3});
 record(n.name+': '+reason,type);
 n.plan=null;n.action='none';n.task=null;
 n.goal='Reconsidering my next action';n.thoughtAt=state.clock+3;
}
function setAction(n,action,source='rein',scores=null){
 return WorldRuntime.begin(state,n,action,source,scores,{onRecord:renderEvents});
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
   if(n.source==='offline routine')
    return WorldRuntime.complete(state,n,{onRecord:renderEvents});
   n.task=null;n.action='none';n.thoughtAt=state.clock+15;
   return;
  }
  void peerExchange(n,other);return;
 }
 return WorldRuntime.complete(state,n,{onRecord:renderEvents});
}
function advancePlan(n){
 return WorldRuntime.advancePlan(state,n,{onRecord:renderEvents});
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
// Bind each asynchronous decision to actor-local evidence, work and resources.
// An unrelated global effect must not cancel somebody else's private choice.
function modelDecisionBasis(n){
 const options=Perception.filterAffordances(state,n,availableActivities(n));
 const references=Object.fromEntries(options.map(o=>[o.key,o.ref??null]));
 const agency=n.agency?.goal,hydration=n.bio?.hydrationBudgetMl??2400;
 return {
  action:n.action,task:n.task?.commandId??null,plan:n.plan?.key??null,
  path:n.path?.length??0,project:n.project?.id??null,
  goalKey:agency?.key??null,goalStartedAt:agency?.startedAt??null,
  evidenceSequence:n.evidenceMemory?.sequence??0,
  observations:n.knowledge?.observations?.length??0,
  inventory:JSON.stringify(n.inventory||{}),
  urgency:Number(n.needs.thirst>=62||hydration<1200)+
   2*Number(n.needs.thirst>=90||hydration<200)+
   4*Number(n.needs.hunger>=85)+8*Number(n.needs.hunger>=95)+
   16*Number(n.energy<18),
  references
 };
}
function modelChoiceStillRelevant(n,original,choice){
 const current=modelDecisionBasis(n);
 for(const field of ['action','task','plan','path','project','goalKey',
  'goalStartedAt','evidenceSequence','observations','inventory','urgency'])
  if(original[field]!==current[field])return false;
 return (original.references[choice]??null)===(current.references[choice]??null);
}
async function deliberate(n){
 if(!state.npcs.includes(n))return;
 state.backgroundBusy=true;state.modelDecisionActor=n;
 const location=key(n),options=backgroundOptions(n),basis=modelDecisionBasis(n);
 let rejected=false;
 try{
  if(state.connected){
   const data=await jsonPost('/api/decide',{
    persona:n.personality,scene:sceneFor(n),history:[],
    question:'Choose a legal action using your needs, witnessed beliefs and personal intention.',options
   });
   activity(n).decisions++;
   WorldReceipts.decision(state,n,String(data.action||'').slice(0,64),
    data.source==='hivemind'?'hivemind':'rein',
    'DECIDED',null,data.durationMs);
   if(!state.paused&&!state.conversationBusy&&state.npcs.includes(n)&&key(n)===location&&
      options.some(o=>o.key===data.action)&&
      backgroundOptions(n).some(o=>o.key===data.action)&&
      modelChoiceStillRelevant(n,basis,data.action)){
    const selected=setAction(n,data.action,
     data.source==='hivemind'?'hivemind':'rein',data.scores);
    if(selected&&data.action==='none')autonomousPurpose(n);
   }else{
    rejected=true;activity(n).rejected++;
    WorldReceipts.decision(state,n,String(data.action||'').slice(0,64),
     'model','REJECTED','Stale, paused or invalid model option');
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
  n.thoughtAt=state.clock+(rejected?3:state.connected?
   (n.action==='none'&&!n.task?3:25):18);
  state.backgroundBusy=false;state.modelDecisionActor=null;
  state.lastDecisionMs=performance.now();
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
   speakerScene:sceneFor(n),listenerScene:sceneFor(other)
  });
  if(state.paused||!state.npcs.includes(n)||!state.npcs.includes(other)||
    !n.task||n.task.key!=='socialize'||n.task.ref!==other.id||
    key(n)!==locA||key(other)!==locB||dist(n,other)>2)return;
  if(typeof response.first!=='string'||typeof response.second!=='string'||
    !response.first.trim()||!response.second.trim())throw Error('Empty exchange');
  n.task.approved=true;
  const outcome=WorldReceipts.execute(state,n,
   {key:n.task.key,ref:n.task.ref,commandId:n.task.commandId},
   ()=>AgentWorld.complete(n,state.world,state.npcs));
  if(!outcome.ok)throw Error(outcome.message);
  Activities.finish(state,n,true);
  activity(n).completed++;activityNote(n,'Completed conversation with '+other.name);
  Agency.outcome(n,state.world,'socialize',other.id,true,state.clock);
  Agency.outcome(other,state.world,'socialize',n.id,true,state.clock);
  Agency.finish(n,true,state.clock);
  const first=response.first.slice(0,220),second=response.second.slice(0,220);
  const exchange={at:'Y'+Civilization.stamp(state.clock).year+' '+timeString(),
   with:other.id,first:n.name+': '+first,second:other.name+': '+second};
  // The successful encounter proves speech occurred, not that its claims are true.
  EvidenceMemory.fromDialogue(state,n,other,outcome.receipt,first,second);
  n.peerLog.push(exchange);n.peerLog=n.peerLog.slice(-12);
  other.peerLog.push({...exchange,with:n.id});other.peerLog=other.peerLog.slice(-12);
  remember(n,'Spoke with '+other.name+': '+first+'; '+second);
  remember(other,'Spoke with '+n.name+': '+first+'; '+second);
  record(n.name+' and '+other.name+' exchanged dialogue','ai');
  n.action='none';n.thoughtAt=state.clock+4;other.thoughtAt=state.clock+4;
 }catch(e){
  record(n.name+' ↔ '+other.name+': '+e.message,'warning');
  if(n.task?.key==='socialize')n.task=null;
  Activities.finish(state,n,false,e.message);
  n.action='none';n.thoughtAt=state.clock+8;
  activity(n).failed++;activityNote(n,'Conversation failed: '+e.message);
  Agency.outcome(n,state.world,'socialize',other.id,false,state.clock);
  Agency.finish(n,false,state.clock);
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
 $('npcPlan').textContent=n.project?
  n.project.kind+' · '+n.project.status+' · '+
  n.project.nodes.filter(x=>x.status==='DONE').length+'/'+n.project.nodes.length+
  ' prerequisites · '+n.project.completedActions+' actions'+
  (n.project.blockedReason?' · blocked: '+n.project.blockedReason:''):
  n.plan?n.plan.key+' ('+n.plan.steps+' steps)':
  (n.agency?.goal?.key||'No active plan');
 const drives=Agency.drives(n);
 $('npcMotivations').textContent=Object.entries(drives).map(([k,v])=>
  k+' '+Math.round(v)).join(' · ');
 $('npcBeliefs').textContent=(n.agency?.beliefs||[]).slice(-3).map(b=>
  b.kind+' '+b.status+' at '+b.x+','+b.y).join(' · ')||'No personal evidence yet';
 const a=activity(n);
 $('npcActivity').textContent=a.decisions+' model decisions · '+a.started+
  ' actions started · '+a.completed+' completed · '+a.none+' no-ops';
 $('npcActivityFailures').textContent=(a.rejected+a.failed+a.blocked)+
  ' rejected/failed/blocked · '+a.errors+' model errors';
 $('npcActivityLast').textContent=a.last;
 const receipts=(state.receipts||[]).filter(r=>r.actorId===n.id&&
  (r.status==='COMPLETED'||r.status==='FAILED')).slice(-6).reverse();
 $('npcWorldReceipts').textContent=receipts.map(r=>{
  const impacts=(r.delta?.inventory||[]).map(d=>d.key+' '+(d.delta>0?'+':'')+d.delta);
  const stocks=(r.delta?.nodeStock||[]).map(d=>d.key+' '+(d.delta>0?'+':'')+d.delta);
  return r.id+' '+r.action+' '+r.status+
   (r.reason?' ('+r.reason+')':'')+
   (impacts.length||stocks.length?' ['+[...impacts,...stocks].join(', ')+']':'');
 }).join('\n')||'No completed physical effects yet';
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
function serializePerson(n){return Persistence.save({...state,npcs:[n]}).npcs[0];}
function save(){
 try{localStorage.setItem(STORE,JSON.stringify(Persistence.save(state)));}
 catch{ /* Retain current world when browser storage is unavailable. */ }
}
function validSavedPath(path,start){return Persistence.validSavedPath(state,path,start);}
function restore(){
 try{return Persistence.restore(state,JSON.parse(localStorage.getItem(STORE)||'null'));}
 catch{return false;}
}
function step(dt){
 if(state.paused||dt<=0)return;
 const elapsed=dt*state.speed/60;
 Simulation.advance(state,elapsed,{
  onArrival:n=>record(n.name+' arrived in the wilderness','social'),
  move:updateMovement,
  onRecovery:n=>{activity(n).completed++;activityNote(n,'Finished resting and recovered');},
  onDeath:(n,death)=>record(n.name+' died of '+death,'warning'),
  complete:completeActivity,
  advancePlan,
  afterActors:()=>{
   if(!state.npcs.some(n=>n.id===state.selected)){
    state.selected=state.npcs[0]?.id||null;renderResidents();
   }
  },
  schedule:scheduleIdleAgents
 });
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
 // Display simulated seconds so 1x speed doesn't appear frozen for a full minute.
 $('worldTime').textContent=timeString()+':'+
  String(Math.floor((state.clock-Math.floor(state.clock))*60+1e-7)).padStart(2,'0');
 $('worldDay').textContent=stamp.season.toUpperCase()+' · YEAR '+stamp.year+' · MONTH '+stamp.month+' · DAY '+stamp.day;
 $('worldWeather').textContent=state.world.weather.kind.toUpperCase()+
  ' · '+state.world.weather.temperature+'°C';
 $('worldSeed').textContent=String(state.world.seed);
 $('populationStats').textContent=state.npcs.length+' living · '+state.dead.length+
  ' deaths · '+state.world.structures.length+' constructed objects · next arrivals on the 1st';
 $('zLabel').textContent='Z '+state.viewZ;
 $('worldStatus').textContent=state.fatalFrameError?
  'ERROR · '+state.fatalFrameError.slice(0,110):state.paused?'Paused':state.backgroundBusy?
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
for(const button of document.querySelectorAll('[data-speed]')){
 button.classList.toggle('active',Number(button.dataset.speed)===state.speed);
 button.addEventListener('click',()=>{
  const value=Number(button.dataset.speed);
  if(!PRESET_SPEEDS.includes(value))return;
  state.speed=value;localStorage.setItem(SPEED_STORE,String(value));
  document.querySelectorAll('[data-speed]').forEach(el=>
   el.classList.toggle('active',el===button));
 });
}
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
 try{
 // A synchronous exception must not silently terminate requestAnimationFrame.
 let failure=null;
 try{
  // Fixed 50 ms steps avoid variable-length physics and prevent long
  // background-tab suspensions from silently fast-forwarding simulation.
  const dt=tick.last===undefined?0:Math.max(0,Math.min(.25,(now-tick.last)/1000));
  tick.last=now;tick.accumulator=(tick.accumulator||0)+dt;
  let ticks=0;
  while(tick.accumulator>=.05&&ticks<5){
   frameStep(.05);tick.accumulator-=.05;ticks++;
  }
  if(tick.accumulator>=.05)tick.accumulator=0;
 }catch(error){
  // A failed simulation transition may have partial world effects.
  state.paused=true;tick.accumulator=0;
  failure={phase:'simulation',error};
 }
 try{drawWorld();}catch(error){failure ||= {phase:'render',error};}
 try{updateHUD(now);}catch(error){failure ||= {phase:'HUD',error};}
 if(failure){
  const message=failure.phase+': '+String(failure.error?.message||failure.error);
  if(tick.lastError!==message){
   console.error('AI-NPC-COG frame failure:',message,failure.error);
   tick.lastError=message;
  }
  if(failure.phase==='simulation')state.fatalFrameError=message;
  const status=$('worldStatus');
  if(status)status.textContent='ERROR · '+message.slice(0,110);
 }else if(!state.fatalFrameError)tick.lastError=null;
 }finally{
  // Required even if a new unanticipated exception escapes diagnostics.
  requestAnimationFrame(tick);
 }
}
try{
 // Restore before rendering the terrain, so saved worlds paint the right map.
 restore();
 drawStaticWorld();loadTileset();
 state.world.now=state.clock;state.world.weather=Frontier.weather(state.world,state.clock);
 for(const n of state.npcs)Frontier.reveal(state.world,n.x,n.y,7);
 renderResidents();updateInspector();renderChat();renderObjectInspector();renderEvents();updateCamera(true);
 record('Natural toroidal world initialized; five independent founders, no prebuilt structures.');
}catch(error){
 // A transient startup canvas/UI failure must not prevent clock startup.
 console.error('AI-NPC-COG startup failure:',error);
 const status=$('worldStatus');
 if(status)status.textContent='STARTUP ERROR · '+String(error?.message||error).slice(0,100);
}finally{
 checkModel();setInterval(checkModel,10000);requestAnimationFrame(tick);
}
