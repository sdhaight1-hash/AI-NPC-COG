'use strict';
// God-mode observer. Rendering is a projection of the authoritative toroidal grid.
const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
const TILE=VillageArt.TILE,W=Frontier.WIDTH,H=Frontier.HEIGHT;
const STORE='ai-npc-cog-v3';
const SPEED_STORE='ai-npc-cog-speed';
const PRESET_SPEEDS=[1,60,120,240,3600];
const serverMode=globalThis.location?.search?
 new URLSearchParams(globalThis.location.search).get('world')==='server':false;
const storedSpeed=serverMode?240:Number(localStorage.getItem(SPEED_STORE));
const initialSpeed=PRESET_SPEEDS.includes(storedSpeed)?storedSpeed:240;
const WORLD_SEED=(!serverMode&&Number(localStorage.getItem('ai-npc-cog-world-seed')))||Frontier.DEFAULT_SEED;
const world=AgentWorld.newWorld(WORLD_SEED);
const founders=serverMode?[]:Civilization.founders(world,490);
const state={clock:490,speed:initialSpeed,day:1,paused:false,auto:true,connected:false,
 backgroundBusy:false,conversationBusy:false,debugGrid:false,
 model:'rein',modelLabel:'Rein-NPC-4B',
 npcs:founders,dead:[],nextPersonId:6,world,events:[],selected:founders[0]?.id||null,
 zoom:1,viewZ:0,follow:true,selectedObject:null,camera:{x:0,y:0},nextUI:0,nextSave:0,lastDecisionMs:0};
const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Frontier.distance(state.world,a,b);
const key=p=>(p.z||0)+':'+p.x+':'+p.y;
const wrapX=x=>Frontier.wrap(x,W),wrapY=y=>Frontier.wrap(y,H);
let installedAtlas=null,showAtlas=true;
function selectedNpc(){return state.npcs.find(n=>n.id===state.selected)||null;}
function selectNpc(id){
 if(!state.npcs.some(n=>n.id===id))return;
 state.selected=id;state.follow=true;updateCamera(true);
 renderResidents();updateInspector();renderChat();
}
function pathfind(start,end){return WorldRuntime.pathfind(state,start,end);}
function availableActivities(n){return WorldRuntime.available(state,n);}
function timeString(){
 const d=Civilization.stamp(state.clock);
 return String(d.hour).padStart(2,'0')+':'+String(d.minute).padStart(2,'0');
}
function activity(n){return WorldRuntime.stats(n);}
function activityNote(n,text){WorldRuntime.note(n,text);}
function record(message,type='routine'){WorldRuntime.log(state,message,type,{onRecord:renderEvents});}
function remember(n,entry,meta={}){return WorldRuntime.remember(state,n,entry,meta);}
function moveTo(n,target){return WorldRuntime.moveTo(state,n,target);}
function position(n){
 if(!n.travel||!n.path?.length)return {x:n.x,y:n.y};
 const next=n.path[0],fraction=clamp(1-n.travel.remaining/n.travel.total,0,1);
 let dx=next.x-n.x,dy=next.y-n.y;
 if(dx>W/2)dx-=W;if(dx<-W/2)dx+=W;
 if(dy>H/2)dy-=H;if(dy<-H/2)dy+=H;
 return {x:n.x+dx*fraction,y:n.y+dy*fraction};
}
function updateMovement(n,elapsed){return WorldRuntime.move(state,n,elapsed);}
function sceneFor(n,attentionSubject=''){
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
 const memoryQuery=[attentionSubject,a.goal?.key||n.goal,sensations,nearby,n.action].join(' ');
 const memories=Cognition.recall(n,memoryQuery,state.clock,4)
  .map(m=>m.kind+': '+m.text).join('; ')||'No relevant personal recollections';
 const evidenced=EvidenceMemory.recall(n,memoryQuery,state.clock,3)
  .map(m=>m.certainty+' '+m.type+': '+m.text+
   (m.receiptId?' [event '+m.receiptId+']':'')+
   (m.type==='inspection'&&m.certainty==='observed'&&m.ref?
    ' [source:'+m.ref+']':'')).join('; ')||'No source-backed experiences';
 const beliefs=a.beliefs.slice(-4).map(b=>b.kind+' at '+b.x+','+b.y+
  ' ('+b.status+', last personally witnessed '+Math.floor(b.at)+')').join('; ')||'None';
 const relationships=Object.keys(n.relationships||{}).slice(-4).map(id=>{
  const r=Agency.relationship(n,id,state.clock);
  const action=n.relationships[id].action;
  return id+' help received '+r.cooperation+', tension '+r.tension+
   ', last encounter '+action.replaceAll('_',' ');
 }).join('; ')||'None';
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
  ', loneliness '+Math.round(n.needs.social)+', mood '+Math.round(n.mood)+
  '. Bodily sensations: '+sensations+
  '. Temperament: '+Civilization.traitSummary(n)+'. Current emotions: '+describeAffect(n.affect)+
  '. Personal drives: '+Object.entries(motives).map(([k,v])=>k+' '+Math.round(v)).join(', ')+
  '. Current intention: '+(a.goal?.key||n.plan?.key||'undecided')+
  '. My witnessed beliefs: '+beliefs+'. My relationships: '+relationships+
  '. Relevant personal recall: '+memories+
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
function backgroundOptions(n){
 // The same legal affordances serve the model and the autonomous executor.
 // Personal need, traits, remembered outcomes and ongoing goals order them.
 const choices=Agency.ranked(n,availableActivities(n).filter(o=>o.key!=='none'),
  state.world,state.clock).slice(0,9);
 choices.push({key:'none',when:'Observe surroundings before deciding'});
 return choices.map(({key,when})=>({key,when}));
}
function fallbackBackground(n){
 if(WorldRuntime.projectWaiting(state,n))return WorldRuntime.chooseOffline(state,n);
 const options=availableActivities(n).filter(o=>o.key!=='socialize');
 const choice=Agency.choose(n,options,state.world,state.clock);
 return choice?.key||AgentWorld.fallback(n,backgroundOptions(n));
}
// Physiological responses continue while inference is busy. They still consume
// simulation time and inventory through the ordinary action executor.
function survivalReflex(n){return WorldRuntime.survival(state,n,{onRecord:renderEvents});}
function autonomousPurpose(n){
 if(n.task||n.plan||n.path.length||n.action==='rest')return false;
 const options=availableActivities(n).filter(o=>
  state.connected||o.key!=='socialize');
 const selected=Agency.choose(n,options,state.world,state.clock);
 return selected?setAction(n,selected.key,'self-directed goal'):false;
}
function socialCandidate(n){
 return !n.task&&!n.plan&&!n.path.length&&!n.peerReservedFor&&!n.peerPending&&
  AgentWorld.socialReady(n);
}
function scheduleSocial(atProjectBoundary=false){
 if(!state.auto||state.paused||!state.connected||state.backgroundBusy||state.conversationBusy||
  state.npcs.some(n=>n.task?.key==='socialize'))return;
 const candidates=state.npcs.filter(socialCandidate);
 const due=candidates.filter(n=>(state.clock>=n.thoughtAt||
  (atProjectBoundary&&n.project?.status==='ACTIVE'&&n.lastActivity?.state==='COMPLETED'&&
   state.clock+2>=n.thoughtAt))&&state.clock-(n.lastPeerAt??-100000)>=90)
  .sort((a,b)=>b.needs.social-a.needs.social||a.thoughtAt-b.thoughtAt);
 for(const n of due){
  if(!candidates.some(peer=>peer!==n&&AgentWorld.socialOpportunity(state.world,n,peer)))continue;
  if(availableActivities(n).some(o=>o.key==='socialize')&&
   setAction(n,'socialize','social initiative'))return;
 }
}
function scheduleIdleAgents(offerSocial=true){
 if(!state.auto||state.paused)return;
 // Physiology remains authoritative even while connected dialogue is pending.
 for(const n of state.npcs)survivalReflex(n);
 if(state.peerExchange&&!peerExchangeValid(state.peerExchange))
  stopPeerExchange(state.peerExchange,'SOCIAL_CONTEXT_CHANGED');
 if(state.conversationBusy)return;
 if(offerSocial)scheduleSocial();
 const due=state.npcs.filter(n=>!n.task&&!n.plan&&!n.path.length&&!n.peerPending&&!n.peerReservedFor&&
  (!n.project||n.project.status==='COMPLETED'||WorldRuntime.projectWaiting(state,n))&&
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
  const cues=new Map(due.filter(n=>!WorldRuntime.projectWaiting(state,n))
   .map(n=>[n,Cognition.attentionCue(n,state.clock)]));
  // Keep the model lane for one NPC, but don't let a serialized inference
  // backlog freeze every other body for hours at accelerated world speeds.
  const n=due.filter(actor=>cues.get(actor)).sort((a,b)=>
   (a.attention?.requestedAt??-1)-(b.attention?.requestedAt??-1))[0];
  if(!state.backgroundBusy&&n&&performance.now()-state.lastDecisionMs>=1500){
   if(Projects.maybeStart(state,n)){
    WorldRuntime.advanceProject(state,n,{onRecord:renderEvents});
    n.thoughtAt=state.clock+18;
   }else void deliberate(n,cues.get(n));
  }
  for(const n of due){
   if(n===state.modelDecisionActor||n.task||n.plan||n.path.length||
    n.action==='rest'||n.peerPending||n.peerReservedFor||
    (cues.get(n)&&state.clock-n.thoughtAt<8))continue;
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
function setAction(n,action,source='rein',scores=null,decisionId=null){
 return WorldRuntime.begin(state,n,action,source,scores,{onRecord:renderEvents,decisionId});
}
function completeActivity(n){
 if(!n.task||n.path.length||n.task.readyAt===null||
  state.clock<n.task.readyAt)return;
 if(n.task.key==='socialize'){
  if(n.peerPending||state.paused)return;
  if(n.source==='offline routine')
   return WorldRuntime.complete(state,n,{onRecord:renderEvents});
  const other=state.npcs.find(v=>v.id===n.task.ref);
  if(!state.connected||!WorldRuntime.socialMeeting(state,n,other)||
   state.clock-n.task.readyAt>=15){
   WorldRuntime.cancelSocial(state,n,'SOCIAL_CONTEXT_CHANGED');
   return;
  }
  if(!state.backgroundBusy&&!state.conversationBusy)void peerExchange(n,other);
  return;
 }
 return WorldRuntime.complete(state,n,{onRecord:renderEvents});
}
function advancePlan(n){
 return WorldRuntime.advancePlan(state,n,{onRecord:renderEvents});
}
async function jsonPost(route,body,signal=null){
 const response=await fetch(route,{method:'POST',headers:{'content-type':'application/json'},
  ...(signal?{signal}:serverMode?{signal:AbortSignal.timeout(5000)}:{}),
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
  tag.append(dot,document.createTextNode(' '+(state.connected?state.modelLabel+' connected':'Offline · NPC dialogue unavailable')));
  $('modelName').textContent=state.modelLabel;
}
// Bind each asynchronous decision to actor-local evidence, work and resources.
// An unrelated global effect must not cancel somebody else's private choice.
function modelDecisionBasis(n){
 const options=availableActivities(n);
 const references={none:null},physical={none:JSON.stringify({ref:null,stock:null,count:null,claims:[]})};
 for(const option of options){
  // WorldRuntime.begin commits the FIRST legal option for an action key.
  // Record that exact target instead of accidentally tracking the last one.
  if(Object.hasOwn(references,option.key))continue;
  const ref=option.ref??null,target=option.target;
  references[option.key]=ref;
  // This is an INTERNAL commit guard, never a model-facing observation:
  // the scene and available-action descriptions must not reveal live stock.
  // A competing reservation or source depletion makes a pending choice stale.
  const claims=ref?(state.reservations||[]).filter(r=>
   r.status==='ACTIVE'&&r.id===ref&&
   ['node','item','structure'].includes(r.type))
   .map(r=>[r.type,r.kind,r.quantity,r.commandId]).sort((a,b)=>
    JSON.stringify(a).localeCompare(JSON.stringify(b))):[];
  physical[option.key]=JSON.stringify({ref,
   stock:Number.isInteger(target?.stock)?target.stock:null,
   count:Number.isInteger(target?.count)?target.count:null,
   claims});
 }
 const agency=n.agency?.goal,hydration=n.bio?.hydrationBudgetMl??2400;
 return {
  actorId:n.id,issuedAt:state.clock,alive:n.alive!==false,
  action:n.action,task:n.task?.commandId??null,plan:n.plan?.key??null,
  path:n.path?.length??0,
  project:JSON.stringify(n.project?{
   kind:n.project.kind,status:n.project.status,
   nextAt:n.project.nextAt,blockedReason:n.project.blockedReason,
   completedActions:n.project.completedActions}:null),
  goalKey:agency?.key??null,goalStartedAt:agency?.startedAt??null,
  evidenceSequence:n.evidenceMemory?.sequence??0,
  // An update to an existing belief/claim matters even when counts do not.
  observations:JSON.stringify(n.knowledge?.observations||[]),
  sightings:JSON.stringify(n.knowledge?.sightings||[]),
  beliefs:JSON.stringify(n.agency?.beliefs||[]),
  claims:JSON.stringify(n.evidenceMemory?.claims||[]),
  inventory:JSON.stringify(n.inventory||{}),
  relationships:JSON.stringify(n.relationships||{}),
  urgency:Number(n.needs.thirst>=62||hydration<1200)+
   2*Number(n.needs.thirst>=90||hydration<200)+
   4*Number(n.needs.hunger>=85)+8*Number(n.needs.hunger>=95)+
   16*Number(n.energy<18)+32*Number(n.health<25),
  references,physical
 };
}
function modelChoiceStillRelevant(n,original,choice){
 if(!original||original.actorId!==n.id||n.alive===false||
  !state.npcs.includes(n)||state.clock<original.issuedAt||
  state.clock-original.issuedAt>45)return false;
 const current=modelDecisionBasis(n);
 for(const field of ['alive','action','task','plan','path','project','goalKey',
  'goalStartedAt','evidenceSequence','observations','sightings','beliefs',
  'claims','inventory','relationships','urgency'])
  if(original[field]!==current[field])return false;
 return Object.hasOwn(original.references,choice)&&
  original.references[choice]===current.references[choice]&&
  original.physical[choice]===current.physical[choice];
}
async function deliberate(n,cue=null){
 if(!state.npcs.includes(n))return;
 state.backgroundBusy=true;state.modelDecisionActor=n;
 const location=key(n),options=backgroundOptions(n),basis=modelDecisionBasis(n);
 let rejected=false;
 try{
  if(state.connected){
   if(cue)Cognition.attentionState(n).requestedAt=state.clock;
   const data=await jsonPost('/api/decide',{
    persona:n.personality,scene:sceneFor(n,cue?.subject),history:[],
    question:cue?'Review '+cue.kind+(cue.subject?' about '+cue.subject:'')+
     ' and choose a legal action using your own evidence.':
     'Choose a legal action using your needs, witnessed beliefs and personal intention.',options
   });
   const offered=options.some(o=>o.key===data.action);
   const stats=activity(n),action=offered?data.action:'invalid_selection';
   const source=data.source==='hivemind'?'hivemind':'rein';
   stats.decisions++;
   const decision=WorldReceipts.decision(state,n,action,source,'DECIDED',null,data.durationMs);
   if(!offered){
    rejected=true;stats.rejected++;stats.modelRefused++;
    WorldReceipts.decision(state,n,action,'model','REJECTED','Action was not offered',null,decision.id);
    activityNote(n,'Discarded action that was not offered to the model');
   }else if(state.paused||state.conversationBusy||!state.npcs.includes(n)||
    key(n)!==location||!backgroundOptions(n).some(o=>o.key===data.action)||
    !modelChoiceStillRelevant(n,basis,data.action)||
    (cue&&Cognition.attentionCue(n,state.clock,false)?.sourceId!==cue.sourceId)){
    rejected=true;stats.rejected++;stats.modelStale++;
    WorldReceipts.decision(state,n,action,'model','REJECTED','Decision context changed',null,decision.id);
    activityNote(n,'Discarded stale model selection');
   }else if(setAction(n,action,source,data.scores,decision.id)){
    if(cue)Cognition.attentionReviewed(n,state.clock,basis.evidenceSequence);
    if(data.action==='none'){
     stats.modelAbstained++;
     autonomousPurpose(n);
    }else stats.modelStarted++;
   }else {
    rejected=true;stats.modelRefused++;
   }
  }else if(!state.paused)setAction(n,fallbackBackground(n),'offline routine');
 }catch(e){
  if(e.status!==429){
   activity(n).errors++;activityNote(n,'Model error: '+e.message);
   record(n.name+': '+state.modelLabel+' error '+e.message,'warning');
   if(!state.paused&&!state.conversationBusy&&state.npcs.includes(n)&&
    n.alive!==false&&key(n)===location&&!n.task&&!n.plan&&!n.path.length&&
    n.action!=='rest'&&!n.peerPending&&!n.peerReservedFor&&
    (!n.project||n.project.status==='COMPLETED'||WorldRuntime.projectWaiting(state,n)))
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
function describeAffect(affect){
 return Object.entries(affect||{}).map(([key,value])=>key+' '+Math.round(value)).join(', ');
}
function peerSceneFor(n,other){
 const relation=Agency.relationship(n,other.id,state.clock);
 const seen=new Set(),sources=[];
 for(const entry of (n.evidenceMemory?.episodes||[]).slice().reverse()){
  if(entry.type!=='inspection'||entry.certainty!=='observed'||!entry.receiptId||
   !entry.ref||seen.has(entry.ref))continue;
  const kind=entry.text.match(/^Inspected (food|water|wood|stone|fiber) /)?.[1];
  if(!kind)continue;
  seen.add(entry.ref);
  sources.push(kind+' [source:'+entry.ref+']');
  if(sources.length===3)break;
 }
 return 'You are '+n.name+' speaking with '+other.name+'. '+
  'Sources you personally inspected, current supply unknown: '+(sources.join(', ')||'none')+'. '+
  'Help received from this resident '+relation.cooperation+', tension '+relation.tension+
  ', mood '+Math.round(n.mood)+'. '+describeAffect(n.affect)+'. '+Biology.sensation(n.bio,n.needs)+
  '. Treat what they say as a report and speak only for yourself.';
}
function peerExchangeValid(session){
 const {n,other,task,locA,locB,expiresAt}=session;
 return state.peerExchange===session&&!state.paused&&
  n.task===task&&key(n)===locA&&key(other)===locB&&state.clock<expiresAt&&
  WorldRuntime.socialMeeting(state,n,other);
}
function stopPeerExchange(session,reason=null){
 if(state.peerExchange!==session)return;
 const {n,other,task,controller}=session;
 if(reason)controller?.abort();
 if(reason&&n.task===task)WorldRuntime.cancelSocial(state,n,reason);
 if(other.peerReservedFor===n.id)delete other.peerReservedFor;
 n.peerPending=false;other.peerPending=false;
 state.peerExchange=null;state.backgroundBusy=false;
 state.lastDecisionMs=performance.now();
}
async function peerExchange(n,other){
 if(n.peerPending||other?.peerPending||state.backgroundBusy||state.paused||
  state.conversationBusy||!WorldRuntime.socialMeeting(state,n,other))return;
 const controller=typeof AbortController==='undefined'?null:new AbortController();
 const expiresAt=state.clock+Math.min(90,Math.max(45,state.speed*24/60));
 const session={n,other,task:n.task,locA:key(n),locB:key(other),expiresAt,controller};
 state.peerExchange=session;
 n.peerPending=true;other.peerPending=true;state.backgroundBusy=true;
 try{
  const response=await jsonPost('/api/peer-exchange',{
   speaker:{name:n.name,persona:n.personality},
   listener:{name:other.name,persona:other.personality},
   speakerScene:peerSceneFor(n,other),listenerScene:peerSceneFor(other,n)
  },controller?AbortSignal.any([controller.signal,AbortSignal.timeout(24000)]):null);
  if(!peerExchangeValid(session)){
   stopPeerExchange(session,'SOCIAL_CONTEXT_CHANGED');
   return;
  }
  if(typeof response.first!=='string'||typeof response.second!=='string'||
    !response.first.trim()||!response.second.trim())throw Error('Empty exchange');
  n.task.approved=true;n.task.spoken=true;
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
  if(!peerExchangeValid(session)){
   stopPeerExchange(session,'SOCIAL_CONTEXT_CHANGED');
   return;
  }
  activity(n).failed++;activityNote(n,'Conversation failed: '+e.message);
  Agency.finish(n,false,state.clock);
  stopPeerExchange(session,'SOCIAL_REQUEST_FAILED');
 }finally{
  stopPeerExchange(session);
 }
}
const staticCanvas=document.createElement('canvas');
staticCanvas.width=W*TILE;staticCanvas.height=H*TILE;
const staticCtx=staticCanvas.getContext('2d');
const undergroundCanvas=document.createElement('canvas');
undergroundCanvas.width=W*TILE;undergroundCanvas.height=H*TILE;
const undergroundCtx=undergroundCanvas.getContext('2d');
let drawnLayer=null;
const vectorArt = document.getElementById('vectorArt');
const useVectorArt = () => Boolean(globalThis.ContentArt?.available && vectorArt?.checked);
if (vectorArt && globalThis.ContentArt) {
 vectorArt.disabled = !ContentArt.available;
 vectorArt.addEventListener('change', drawStaticWorld);
}
function drawStaticWorld(){
 const vector = useVectorArt();
 canvas.classList?.toggle('vector-map', vector);
 if (vector) ContentArt.drawWorld(staticCtx, state.world, TILE);
 else VillageArt.drawWorld(staticCtx,{width:W,height:H},[],[],state.world);
}
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
// Pure Canvas projection: blueprints are outlines, finished tiles have
// material silhouettes. Hiding a roof changes only rendering, never physics.
function drawConstructionProjection(view){
 const layer=state.viewZ,construction=state.world.construction;
 if(!construction)return;
 const visible=p=>p.z===layer&&p.x>=view.left&&p.x<=view.right&&
  p.y>=view.top&&p.y<=view.bottom;
 for(const b of construction.blueprints.filter(visible)){
  const x=b.x*TILE,y=b.y*TILE;
  ctx.save();ctx.strokeStyle='#e6c67a';ctx.lineWidth=1.25;
  ctx.setLineDash([3,2]);ctx.strokeRect(x+1.5,y+1.5,TILE-3,TILE-3);
  ctx.setLineDash([]);
  const builder=state.npcs.find(n=>n.task?.key==='build_tile'&&n.task.ref===b.id);
  if(builder?.currentActivity){
   const a=builder.currentActivity;
   const ratio=clamp(a.workDone/a.workRequired,0,1);
   ctx.fillStyle='#f2d991';ctx.fillRect(x+2,y+TILE-3,(TILE-4)*ratio,2);
  }
  ctx.restore();
 }
 const order={floor:0,wall:1,door:2,roof:3};
 const selected=selectedNpc();
 const tiles=construction.tiles.filter(visible).slice()
  .sort((a,b)=>order[a.kind]-order[b.kind]||a.id.localeCompare(b.id));
 for(const tile of tiles){
  const x=tile.x*TILE,y=tile.y*TILE;
  ctx.save();
  if(tile.kind==='floor'){
   ctx.fillStyle='#b09a70';ctx.fillRect(x,y,TILE,TILE);
   ctx.strokeStyle='#70593c';ctx.lineWidth=1;
   for(let line=4;line<TILE;line+=5){
    ctx.beginPath();ctx.moveTo(x+1,y+line);ctx.lineTo(x+TILE-1,y+line);
    ctx.stroke();
   }
  }else if(tile.kind==='wall'){
   ctx.fillStyle='#433c32';ctx.fillRect(x,y,TILE,TILE);
   ctx.fillStyle='#8f806b';ctx.fillRect(x+1,y+1,TILE-2,TILE-3);
   ctx.fillStyle='#b9a185';ctx.fillRect(x+3,y+3,TILE-6,3);
   ctx.fillStyle='#685744';ctx.fillRect(x+3,y+8,TILE-6,3);
  }else if(tile.kind==='door'){
   ctx.fillStyle='#7f6242';ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
   ctx.fillStyle='#292a25';ctx.fillRect(x+5,y+3,TILE-7,TILE-6);
   ctx.strokeStyle='#d7b78b';ctx.lineWidth=2;
   ctx.beginPath();ctx.moveTo(x+4,y+TILE-3);ctx.lineTo(x+10,y+4);ctx.stroke();
  }else if(tile.kind==='roof'){
   const under=(selected?.z||0)===layer&&selected?.x===tile.x&&
    selected?.y===tile.y;
   if(!under){
    ctx.fillStyle='#6e6049';ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle='#ac9370';
    ctx.beginPath();ctx.moveTo(x+1,y+5);ctx.lineTo(x+TILE/2,y+1);
    ctx.lineTo(x+TILE-1,y+5);ctx.lineTo(x+TILE-1,y+TILE-1);
    ctx.lineTo(x+1,y+TILE-1);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#524938';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x+TILE/2,y+2);
    ctx.lineTo(x+TILE/2,y+TILE-1);ctx.stroke();
   }else{
    ctx.strokeStyle='rgba(232,204,153,.8)';ctx.lineWidth=1;
    ctx.strokeRect(x+1,y+1,TILE-2,TILE-2);
   }
  }
  ctx.restore();
 }
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
   const view = {left:-x/TILE-1, top:-y/TILE-1,
    right:(vw-x)/TILE+1, bottom:(vh-y)/TILE+1};
   if (useVectorArt()) ContentArt.drawObjects(ctx,state.world,TILE,view);
   else VillageArt.drawWorldObjects(ctx,state.world,view);
  }
  drawConstructionProjection({left:-x/TILE-1,top:-y/TILE-1,
   right:(vw-x)/TILE+1,bottom:(vh-y)/TILE+1});
  if(state.viewZ!==0)for(const item of state.world.items){
   if(item.kind==='flask'&&item.z===state.viewZ)VillageArt.drawGroundFlask(ctx,item);
  }
  for(const remains of state.world.remains){
   if(remains.z!==state.viewZ)continue;
   const rx=remains.x*TILE,ry=remains.y*TILE;
   ctx.fillStyle='#403831';ctx.fillRect(rx+TILE*.19,ry+TILE*.44,TILE*.64,TILE*.26);
   ctx.fillStyle='#b4a093';ctx.fillRect(rx+TILE*.23,ry+TILE*.45,TILE*.54,TILE*.15);
  }
  const focused=AgentWorld.objectById(state.world,state.selectedObject);
  if(focused&&(focused.z||0)===state.viewZ){
   ctx.strokeStyle='#fff0a6';ctx.lineWidth=2;
   ctx.strokeRect(focused.x*TILE+1,focused.y*TILE+1,TILE-2,TILE-2);
  }
  for(const n of state.npcs.filter(v=>(v.z||0)===state.viewZ)
   .sort((a,b)=>position(a).y-position(b).y)){
   const p=position(n);
   const actorPosition={x:wrapX(p.x),y:wrapY(p.y)};
   VillageArt.drawActor(ctx,n,false,actorPosition,state.selected===n.id,performance.now());
   if(useVectorArt())ContentArt.drawVesselWorkpiece(ctx,n.workpiece,
    actorPosition.x*TILE,actorPosition.y*TILE,TILE);
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
let portraitKey=null;
function updateInspector(){
 const n=selectedNpc();
 $('npcCount').textContent=state.npcs.length+' alive · '+state.dead.length+' dead';
 if(!n){
  $('npcName').textContent='No living inhabitants';
  $('npcMeta').textContent='The next monthly arrival may repopulate the world.';
  if(portraitKey!==null){
   const portrait=$('npcPortrait');
   portrait.getContext('2d').clearRect(0,0,portrait.width,portrait.height);
   portraitKey=null;
  }
  return;
 }
 const portrait=$('npcPortrait'),look=n.id+':'+JSON.stringify(n.appearance);
 if(look!==portraitKey){
  VillageArt.drawPortrait(portrait,n);
  portrait.style.background=n.color+'44';
  portraitKey=look;
 }
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
 $('npcMood').textContent=Math.round(n.mood)+'/100';
 $('npcAffect').textContent=describeAffect(n.affect);
 $('npcAffectBaseline').textContent=describeAffect(n.affectBaseline);
 $('npcTraits').textContent=Object.entries(Civilization.TRAIT_GROUPS).map(([group,facets])=>
  group+'\n'+facets.map(key=>Civilization.traitLabel(key)+' '+
   Math.round(Civilization.trait(n,key)*100)).join(' · ')).join('\n\n');
 $('npcRelationships').textContent=Object.keys(n.relationships||{}).slice(-4).map(id=>{
  const name=state.npcs.find(peer=>peer.id===id)?.name||id;
  const r=Agency.relationship(n,id,state.clock);
  return name+' · help '+r.cooperation+'/8 · tension '+r.tension+'/6';
 }).join(' | ')||'No shared history yet';
 const a=activity(n);
 const measured=a.modelStarted+a.modelAbstained+a.modelStale+a.modelRefused;
 $('npcActivity').textContent=a.decisions+' model replies · '+a.started+
  ' actions started · '+a.completed+' completed'+(measured?
   ' · '+a.modelStarted+'/'+measured+' model actions started · '+
   a.modelAbstained+' abstained · '+a.modelStale+' stale · '+a.modelRefused+' refused':'');
 $('npcActivityFailures').textContent=(a.rejected+a.failed+a.blocked)+
  ' rejected/failed/blocked · '+(a.abandoned||0)+' abandoned · '+a.errors+' model errors';
 $('npcActivityLast').textContent=a.last+' · '+(n.agency?.completedGoals||0)+
  ' goals finished · '+(n.agency?.failedGoals||0)+' goals failed';
 const receipts=(state.receipts||[]).filter(r=>r.actorId===n.id&&
  (r.status==='COMPLETED'||r.status==='FAILED')).slice(-6).reverse();
 $('npcWorldReceipts').textContent=receipts.map(r=>{
  const impacts=(r.delta?.inventory||[]).map(d=>d.key+' '+(d.delta>0?'+':'')+d.delta);
  const stocks=(r.delta?.nodeStock||[]).map(d=>d.key+' '+(d.delta>0?'+':'')+d.delta);
  return r.id+' '+r.action+' '+r.status+
   (r.context?.projectNodeId?' · '+r.context.projectKind+' / '+r.context.projectNodeId:'')+
   (r.reason?' ('+r.reason+')':'')+
   (impacts.length||stocks.length?' ['+[...impacts,...stocks].join(', ')+']':'');
 }).join('\n')||'No completed physical effects yet';
 const workpiece=n.workpiece,recipe=Crafting.RECIPES[workpiece?.recipe];
 const stage=recipe?.stages[workpiece.stage];
 const trial=n.evidenceMemory?.trials?.at(-1);
 const trialNote=trial?' · Last trial '+(trial.heldWater?'held water':'leaked')+
  ' with binding grade '+trial.materialQuality+'/5':'';
 const comparison=n.evidenceMemory?.comparisons?.at(-1);
 const comparisonNote=comparison?' · Inferred comparison: grade '+
  comparison.failedQuality+'/5 leaked, grade '+comparison.passedQuality+
  '/5 held. Cause uncertain. Receipts '+comparison.sourceReceiptIds.join(', '):'';
 $('npcCrafting').textContent=(stage?
  recipe.name+' · '+(workpiece.stage+1)+'/'+recipe.stages.length+' · '+stage.name:
  'No workpiece')+trialNote+comparisonNote;
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
 $('objectDetail').textContent=info?info.description+
  (object.kind==='flask'?' · '+(object.vessel.waterUnits*400)+' mL water':''):
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
let serverPollPending=false,serverControlPending=false,serverRequestId=0;
let serverLoaded=false,serverError=null,serverWarning=null;
function applyServerView(view){
 const snapshot=view.snapshot;
 if(!snapshot?.world||!Array.isArray(snapshot.npcs))throw Error('Invalid server world response');
 const redraw=!serverLoaded||state.world.seed!==snapshot.world.seed;
 const wasSelected=state.selected;
 for(const key of ['clock','npcs','dead','nextPersonId','world','events','receipts',
  'reservations','commandSeq','receiptSeq','reservationSeq','effectRevision'])state[key]=snapshot[key];
 state.day=view.day;state.paused=view.paused;state.auto=view.auto;state.speed=view.speed;
 state.selected=state.npcs.some(n=>n.id===wasSelected)?wasSelected:state.npcs[0]?.id||null;
 serverLoaded=true;serverError=null;serverWarning=view.warning;
 if(redraw){drawnLayer=null;drawStaticWorld();updateCamera(true);}
 renderEvents();renderObjectInspector();
 if(redraw||state.selected!==wasSelected)renderChat();
}
async function pollServerWorld(){
 if(serverPollPending||serverControlPending)return;
 serverPollPending=true;
 const request=++serverRequestId;
 try{
  const response=await fetch('/api/world',{signal:AbortSignal.timeout(5000)});
  const view=await response.json();
  if(request!==serverRequestId)return;
  if(!response.ok)throw Error(view.error||'Server world unavailable');
  applyServerView(view);
 }catch(error){
  if(request===serverRequestId)serverError=error.message;
 }finally{serverPollPending=false;}
}
async function controlServerWorld(patch){
 if(!serverLoaded||serverControlPending)return;
 serverControlPending=true;
 ++serverRequestId;
 try{applyServerView(await jsonPost('/api/world/control',patch));}
 catch(error){serverError=error.message;}
 finally{serverControlPending=false;}
}
function save(){
 if(serverMode||state.saveLoadFailed)return;
 try{localStorage.setItem(STORE,JSON.stringify(Persistence.save(state)));}
 catch{ /* Retain current world when browser storage is unavailable. */ }
}
function validSavedPath(path,start){return Persistence.validSavedPath(state,path,start);}
function restore(){
 try{
  const raw=localStorage.getItem(STORE);
  if(raw===null||Persistence.restore(state,JSON.parse(raw)))return true;
 }catch{ /* The incompatible checkpoint stays in storage. */ }
 state.saveLoadFailed=true;
 state.paused=true;
 return false;
}
function step(dt){
 if(serverMode||state.paused||dt<=0)return;
 const elapsed=dt*state.speed/60;
 Simulation.advance(state,elapsed,{
  onArrival:n=>record(n.name+' arrived in the wilderness','social'),
  move:updateMovement,
  onRecovery:n=>{activity(n).completed++;activityNote(n,'Finished resting and recovered');},
  onDeath:(n,death)=>record(n.name+' died of '+death,'warning'),
  complete:completeActivity,
  advancePlan,
  beforeProjects:()=>scheduleSocial(true),
  afterActors:()=>{
   if(!state.npcs.some(n=>n.id===state.selected)){
    state.selected=state.npcs[0]?.id||null;renderResidents();
   }
  },
  schedule:()=>scheduleIdleAgents(false)
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
  ' deaths · '+(state.world.structures.length+(state.world.construction?.tiles.length||0))+' constructed objects · next arrivals on the 1st';
 $('zLabel').textContent='Z '+state.viewZ;
 $('worldStatus').textContent=state.fatalFrameError?
  'ERROR · '+state.fatalFrameError.slice(0,110):state.paused?'Paused':state.backgroundBusy?
  state.modelLabel+' deliberating…':'World running';
 $('footerNote').textContent=state.connected?
  'One shared '+state.modelLabel+' lane · deterministic world rules':'Offline survival fallback (not AI cognition)';
 $('pauseBtn').textContent=state.paused?'▶ Resume':'Ⅱ Pause';
 if(serverMode){
  $('worldStatus').textContent=serverError?'Server world unavailable · '+serverError:
   serverWarning||(!serverLoaded?'Connecting to server world':state.paused?'Server world paused':'Server world running');
  $('footerNote').textContent='Shared server world · offline resident decisions';
  $('modelStatus').textContent='Shared world · NPC dialogue unavailable';
  const disabled=!serverLoaded||serverControlPending;
  $('pauseBtn').disabled=disabled;$('autoAI').disabled=disabled;
  $('exportWorld').disabled=!serverLoaded;
  $('autoAI').checked=state.auto;
  for(const button of document.querySelectorAll('[data-speed]')){
   button.disabled=disabled;
   button.classList.toggle('active',Number(button.dataset.speed)===state.speed);
  }
 }
 renderResidents();updateInspector();drawMinimap();
 if(now>state.nextSave){save();state.nextSave=now+5000;}
}
const heldKeys=new Set();
window.addEventListener('keydown',event=>{
 const active=document.activeElement?.tagName;
 if(document.getElementById('catalog')?.open || active==='INPUT'||active==='TEXTAREA'||active==='SELECT')return;
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
 if(state.follow || document.getElementById('catalog')?.open)return;
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
 const remains=state.world.remains.find(o=>o.z===tile.z&&o.x===tile.x&&o.y===tile.y);
 const item=state.world.items.find(o=>(o.z||0)===tile.z&&o.x===tile.x&&o.y===tile.y);
 const built=[...(state.world.construction?.tiles||[]),
  ...(state.world.construction?.blueprints||[])].find(o=>
   o.z===tile.z&&o.x===tile.x&&o.y===tile.y);
 const n=state.npcs.find(p=>(p.z||0)===tile.z&&
  dist(p,tile)<=((remains||item||built)?0:1));
 if(n){state.selectedObject=null;selectNpc(n.id);renderObjectInspector();return;}
 const object=remains||item||built||(tile.z===0?[...state.world.nodes,
  ...state.world.structures].find(o=>o.x===tile.x&&o.y===tile.y):null);
 state.selectedObject=object?.id||null;renderObjectInspector();
 if(!object){state.follow=false;state.camera.x=tile.x*TILE-canvas.width/(2*state.zoom);
  state.camera.y=tile.y*TILE-canvas.height/(2*state.zoom);}
});
$('pauseBtn').addEventListener('click',()=>{
 if(serverMode)void controlServerWorld({paused:!state.paused});
 else state.paused=!state.paused;
});
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
$('autoAI').addEventListener('change',e=>{
 if(serverMode)void controlServerWorld({auto:e.target.checked});
 else state.auto=e.target.checked;
});
for(const button of document.querySelectorAll('[data-speed]')){
 button.classList.toggle('active',Number(button.dataset.speed)===state.speed);
 button.addEventListener('click',()=>{
  const value=Number(button.dataset.speed);
  if(!PRESET_SPEEDS.includes(value))return;
  if(serverMode){void controlServerWorld({speed:value});return;}
  state.speed=value;localStorage.setItem(SPEED_STORE,String(value));
  document.querySelectorAll('[data-speed]').forEach(el=>
   el.classList.toggle('active',el===button));
 });
}
$('clearLog').addEventListener('click',()=>{state.events=[];renderEvents();});
$('exportWorld').addEventListener('click',()=>{
 if(state.saveLoadFailed||(serverMode&&!serverLoaded))return;
 const blob=new Blob([JSON.stringify(Persistence.save(state))],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download='ai-npc-cog-world-'+state.world.seed+'.json';
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('resetBtn').addEventListener('click',()=>{
 if(serverMode||!window.confirm('Reset this simulated world and its history?'))return;
 localStorage.removeItem(STORE);window.location.reload();
});
$('newIsland').addEventListener('click',()=>{
 if(serverMode||!window.confirm('Generate a new world? This discards the current local simulation.'))return;
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
 const restored=serverMode||restore();
 drawStaticWorld();loadTileset();
 state.world.now=state.clock;state.world.weather=Frontier.weather(state.world,state.clock);
 for(const n of state.npcs)Frontier.reveal(state.world,n.x,n.y,7);
 renderResidents();updateInspector();renderChat();renderObjectInspector();renderEvents();updateCamera(true);
 if(serverMode){
  for(const id of ['resetBtn','newIsland','clearLog'])$(id).disabled=true;
 }else if(restored)record('Natural toroidal world initialized; five independent founders, no prebuilt structures.');
 else record('Saved world could not be loaded. Its checkpoint was preserved and autosave is disabled.','error');
}catch(error){
 // A transient startup canvas/UI failure must not prevent clock startup.
 console.error('AI-NPC-COG startup failure:',error);
 const status=$('worldStatus');
 if(status)status.textContent='STARTUP ERROR · '+String(error?.message||error).slice(0,100);
}finally{
 if(serverMode){
  void pollServerWorld();setInterval(pollServerWorld,800);
 }else{checkModel();setInterval(checkModel,10000);}
 requestAnimationFrame(tick);
}
