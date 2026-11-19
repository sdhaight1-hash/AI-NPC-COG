'use strict';

// Browser-only world simulation. Rein inference lives in the separate local Node bridge.
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const TILE = VillageArt.TILE;
const W = 40, H = 26;
const STORE = 'ai-npc-cog-v1';

const buildings = [
  { id:'cottage', name:'Longhouse', x:4, y:3, w:7, h:5, door:{x:7,y:8}, roof:'#97674c' },
  { id:'cafe', name:'Common House', x:15, y:3, w:8, h:5, door:{x:19,y:8}, roof:'#bd775d' },
  { id:'clinic', name:'Storehouse', x:29, y:3, w:8, h:5, door:{x:33,y:8}, roof:'#7e93a4' },
  { id:'forge', name:'Old Shed', x:4, y:16, w:7, h:5, door:{x:7,y:21}, roof:'#78665a' },
  { id:'library', name:'Meeting Hall', x:16, y:17, w:8, h:5, door:{x:20,y:22}, roof:'#6a7c9f' },
  { id:'market', name:'Covered Stalls', x:29, y:17, w:8, h:5, door:{x:33,y:22}, roof:'#b58c5a' }
];
const locations = Object.fromEntries(buildings.map(b => [b.id, b.door]));
locations.square={x:26,y:12};
locations.garden={x:36,y:13};
locations.bench={x:12,y:14};
const trees=[[1,2],[12,3],[26,4],[38,4],[2,9],[12,9],[26,9],[38,10],[1,16],[12,18],[27,18],[38,16],[2,23],[13,23],[26,24],[38,24],[3,13],[36,24]];

const initialNPCs = [
 { id:'mara', name:'Mara', x:21,y:11, mood:79, energy:84, trust:56, color:'#e9aa85',
   personality:'Mara, 32. Warm, observant, protective of friends, quietly stubborn. Values honesty and dislikes gossip.' },
 { id:'jonas', name:'Jonas', x:12,y:11, mood:55, energy:80, trust:41, color:'#9bc3cc',
   personality:'Jonas, 40. Dry humor, pragmatic, guarded with strangers, loyal once trust is earned.' },
 { id:'asha', name:'Asha', x:30,y:12, mood:72, energy:73, trust:63, color:'#bc9add',
   personality:'Asha, 28. Curious, patient, precise about facts, sometimes shy, loves learning and exploring.' },
 { id:'rowan', name:'Rowan', x:15,y:13, mood:65, energy:71, trust:62, color:'#a1d6aa',
   personality:'Rowan, 35. Calm under pressure, empathic but blunt, cautious, respects boundaries.' },
 { id:'lina', name:'Lina', x:26,y:14, mood:83, energy:90, trust:48, color:'#d9cb79',
   personality:'Lina, 24. Spirited, resourceful, outgoing, competitive, fond of teasing friends.' },
 { id:'nico', name:'Nico', x:8,y:12, mood:68, energy:76, trust:51, color:'#e693ad',
   personality:'Nico, 21. Restless, cheerful, socially awkward when surprised, loves discovering new places.' }
].map((n,i) => AgentWorld.newAgent({...n,
  goal:'Learning about this place',action:'none',source:'simulation',scores:null,
  memories:[],chat:[],relationships:{},path:[],travel:0,
  thoughtAt:8*60+10+i*5,lastSeen:0},i));

const state={clock:8*60+10, day:1, speed:1, paused:false, connected:false,
  auto:true, backgroundBusy:false, conversationBusy:false, selected:'mara', lastDecisionMs:0,
  zoom:1, camera:{x:0,y:0}, player:{x:21,y:12,path:[],travel:0},
  npcs:initialNPCs, world:AgentWorld.newWorld(), events:[], nextUI:0, nextSave:0, lastSocial:0};
const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const rand=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const nearest=(npc,range=6)=>state.npcs.filter(n=>n.id!==npc.id&&manhattan(n,npc)<=range)
 .sort((a,b)=>manhattan(a,npc)-manhattan(b,npc))[0];

function isBlocked(x,y){
 if(x<0||y<0||x>=W||y>=H) return true;
 if(buildings.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)) return true;
 if((x-38)**2+(y-21)**2<=4) return true;
 return false;
}
function pathfind(start,end){
 const tx=Math.round(end.x),ty=Math.round(end.y);
 if(isBlocked(tx,ty)) return [];
 const key=(x,y)=>y*W+x;
 const queue=[{x:Math.round(start.x),y:Math.round(start.y)}];
 const back=new Map([[key(queue[0].x,queue[0].y),null]]);
 for(let i=0;i<queue.length;i++){
  const p=queue[i];if(p.x===tx&&p.y===ty) break;
  for(const d of [[0,-1],[1,0],[0,1],[-1,0]]){
   const x=p.x+d[0],y=p.y+d[1],k=key(x,y);
   if(!isBlocked(x,y)&&!back.has(k)){back.set(k,p);queue.push({x,y});}
  }
 }
 if(!back.has(key(tx,ty))) return [];
 const path=[];let p={x:tx,y:ty};
 while(p && (p.x!==start.x||p.y!==start.y)){path.push({x:p.x,y:p.y});p=back.get(key(p.x,p.y));}
 return path.reverse();
}
function timeString(){
 const minutes=((Math.floor(state.clock)%1440)+1440)%1440;
 return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
function record(message,type='routine'){
 const line={time:timeString(),text:message,type};
 state.events.unshift(line);if(state.events.length>65)state.events.length=65;
 renderEvents();
}
function remember(npc,entry){
 npc.memories.push({time:'Day '+state.day+' '+timeString(),text:String(entry).slice(0,180)});
 npc.memories=npc.memories.slice(-16);
}
function moveTo(actor,target){
 const path=pathfind(actor,target);
 if(path.length===0 && manhattan(actor,target)>0) return false;
 actor.path=path;actor.travel=0;
 if(path.length){
  const next=path[0],dx=next.x-actor.x,dy=next.y-actor.y;
  actor.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
 }
 return true;
}
function approach(actor,target){
 let best=null,dist=Infinity;
 for(const d of [[0,1],[1,0],[0,-1],[-1,0]]){
  const point={x:target.x+d[0],y:target.y+d[1]};
  if(isBlocked(point.x,point.y))continue;
  const route=pathfind(actor,point);
  if((route.length>0 || manhattan(actor,point)===0)&&route.length<dist){dist=route.length;best=point;}
 }
 return best ? moveTo(actor,best) : false;
}
function reachableFrom(npc,point){
 return !isBlocked(point.x,point.y)&&
  (manhattan(npc,point)===0||pathfind(npc,point).length>0);
}
function availableActivities(npc){
 return AgentWorld.available(npc,state.world,state.npcs,point=>reachableFrom(npc,point));
}
function sceneFor(npc){
 const around=state.npcs.filter(n=>n.id!==npc.id&&manhattan(n,npc)<=8)
  .map(n=>n.name+' ('+manhattan(n,npc)+' tiles away)').join(', ')||'Nobody nearby';
 const memories=npc.memories.slice(-4).map(m=>m.time+': '+m.text).join('; ')||'No notable memories';
 const nearby=state.world.nodes.filter(node=>node.stock>0&&manhattan(node,npc)<=18)
  .map(n=>n.kind+' at '+n.x+','+n.y+' ('+n.stock+' left)').slice(0,8).join('; ')||'Nothing identified';
 return 'Small settlement, day '+state.day+' at '+timeString()+'. '+
  npc.name+' is at ('+npc.x+','+npc.y+'). Personality: '+npc.personality+
  ' Physical needs: hunger '+Math.round(npc.needs.hunger)+'/100 (high is hungry), energy '+
  Math.round(npc.energy)+'/100 (low is tired), social need '+Math.round(npc.needs.social)+
  '/100 (high is lonely), curiosity '+Math.round(npc.needs.curiosity)+'/100. Inventory: '+
  Object.entries(npc.inventory).map(([k,v])=>k+' '+v).join(', ')+'. '+AgentWorld.focus(npc)+
  '. Earned experience: '+Object.entries(npc.skills).map(([k,v])=>k+' '+v).join(', ')+
  ' (practice increases gathering yield). Current intention: '+npc.goal+
  (npc.plan?' [longer-term intention '+npc.plan.key+', '+npc.plan.steps+' completed steps]':'')+
  '. Other residents within earshot: '+around+
  '. Observed usable resources: '+nearby+'. Personal memories: '+memories+
  '. Nobody has been assigned a profession, destination or routine. You choose one available action; '+
  'the environment validates it and supplies consequences.';
}
function backgroundOptions(npc){
 // Rein supports A-J only; the world may expose more legal actions.
 // Preserve urgent survival choices and self-chosen multi-step intentions.
 const rank=['eat','rest','stock_food','make_campfire','share_food','socialize',
  'explore','forage','collect_wood','collect_stone','build_fire'];
 const options=availableActivities(npc).filter(o=>o.key!=='none')
  .sort((a,b)=>rank.indexOf(a.key)-rank.indexOf(b.key)).slice(0,9);
 options.push({key:'none',when:'Wait and observe without changing current circumstances'});
 return options.map(({key,when})=>({key,when}));
}
function fallbackBackground(npc){
 return AgentWorld.fallback(npc,backgroundOptions(npc));
}
function completeActivity(npc){
 if(!npc.task)return;
 if(npc.task.key==='socialize'){
  if(npc.peerPending || state.backgroundBusy || state.conversationBusy || state.paused ||
     state.clock<(npc.peerRetryAt||0))return;
  if(!state.connected){
   record(npc.name+': peer conversation requires Rein; no simulated dialogue','routine');
   npc.task=null;npc.action='none';npc.thoughtAt=state.clock+12;
   return;
  }
  const peer=state.npcs.find(other=>other.id===npc.task.ref);
  if(!peer || manhattan(npc,peer)>2){
   npc.task=null;npc.action='none';npc.thoughtAt=state.clock+3;
   record(npc.name+': could not start conversation; participant moved away','warning');
   return;
  }
  void peerExchange(npc,peer);
  return;
 }
 const previous=npc.task;
 const outcome=AgentWorld.complete(npc,state.world,state.npcs);
 if(outcome.ok){
  remember(npc,outcome.message);
  record(npc.name+': '+outcome.message,'social');
  if(npc.plan){
   npc.plan.steps++;
   npc.goal='Working toward '+npc.plan.key.replaceAll('_',' ')+
     ' ('+npc.plan.steps+' steps completed)';
   npc.nextPlanAt=state.clock+1;
   if(npc.plan.steps>=8)finishPlan(npc,'Stopped after eight steps','warning');
  }else{
   npc.goal='Considering what to do next';
   npc.thoughtAt=state.clock+2;
  }
 }else{
  record(npc.name+': '+outcome.message+' [world rejected]','warning');
  if(npc.plan)finishPlan(npc,'Plan blocked: '+outcome.message,'warning');
  npc.goal='Reconsidering after a failed attempt';
  npc.thoughtAt=state.clock+4;
 }
 npc.action='none';
}
function finishPlan(npc,reason,type='social'){
 if(!npc.plan)return;
 const name=npc.plan.key.replaceAll('_',' ');
 remember(npc,'Intention '+name+': '+reason);
 record(npc.name+' '+name+': '+reason,type);
 npc.plan=null;
 npc.action='none';npc.task=null;
 npc.goal='Considering a new intention';
 npc.thoughtAt=state.clock+4;
}
function advancePlan(npc){
 if(!npc.plan||npc.task||npc.peerPending||npc.action==='rest'||
    state.clock<(npc.nextPlanAt||0))return;
 if(npc.plan.steps>=8)return finishPlan(npc,'Reached the eight-step safety limit','warning');
 const next=AgentWorld.nextPlanAction(npc,state.world,state.npcs,
  point=>reachableFrom(npc,point));
 if(next.status==='done')return finishPlan(npc,'Completed');
 if(next.status==='blocked')return finishPlan(npc,next.reason,'warning');
 if(!setAction(npc,next.option.key,'plan',null))
  finishPlan(npc,'Sub-action no longer available','warning');
}
async function peerExchange(npc,other){
 if(npc.peerPending||other.peerPending||state.backgroundBusy||state.conversationBusy)return;
 if(!npc.task||npc.task.key!=='socialize'||npc.task.ref!==other.id)return;
 npc.peerPending=true;other.peerPending=true;state.backgroundBusy=true;
 record(npc.name+' approached '+other.name+' — Rein generating two dialogue turns','routine');
 const wasPaused=state.paused;
 try{
  const response=await jsonPost('/api/peer-exchange',{
   speaker:{name:npc.name,persona:npc.personality},
   listener:{name:other.name,persona:other.personality},
   scene:sceneFor(npc)+'\n'+other.name+': '+sceneFor(other).slice(0,480)
  });
  // Validate the current world again. Never commit stale inference.
  if(state.paused||wasPaused||state.conversationBusy || !npc.task ||
     npc.task.key!=='socialize'||npc.task.ref!==other.id||
     manhattan(npc,other)>2)return;
  if(typeof response.first!=='string'||typeof response.second!=='string'||
     !response.first.trim()||!response.second.trim())throw new Error('Empty exchange');
  npc.task.approved=true;
  const result=AgentWorld.complete(npc,state.world,state.npcs);
  if(!result.ok)throw new Error(result.message);
  const one=response.first.slice(0,240),two=response.second.slice(0,240);
  const exchange={at:'Day '+state.day+' '+timeString(),
   with:other.id,first:npc.name+': '+one,second:other.name+': '+two};
  npc.peerLog.push(exchange);npc.peerLog=npc.peerLog.slice(-10);
  other.peerLog.push({...exchange,with:npc.id});other.peerLog=other.peerLog.slice(-10);
  remember(npc,'Spoke with '+other.name+': "'+one.slice(0,75)+
    '" — '+other.name+' replied "'+two.slice(0,55)+'"');
  remember(other,npc.name+' said "'+one.slice(0,75)+
    '". I replied "'+two.slice(0,75)+'"');
  record(npc.name+': "'+one.slice(0,80)+'"','ai');
  record(other.name+': "'+two.slice(0,80)+'" [peer exchange '+response.durationMs+'ms]','ai');
  npc.action='none';
  npc.goal='Thinking about the conversation with '+other.name;
  npc.thoughtAt=state.clock+4;
  other.thoughtAt=Math.max(other.thoughtAt,state.clock+4);
  updateInspector();
 }catch(error){
  if(error.status!==429)record(npc.name+' ↔ '+other.name+': '+error.message,'warning');
  npc.peerFailures=(npc.peerFailures||0)+1;
  npc.peerRetryAt=state.clock+8;
  if(npc.peerFailures>=2 || error.status!==429){
   if(npc.task?.key==='socialize'&&npc.task.ref===other.id)npc.task=null;
   npc.action='none';npc.thoughtAt=state.clock+8;
  }
 }finally{
  npc.peerPending=false;other.peerPending=false;state.backgroundBusy=false;
  state.lastDecisionMs=performance.now();
 }
}
function setAction(npc,action,source,scores){
 const candidate=availableActivities(npc).find(option=>option.key===action);
 if(!candidate){
  record(npc.name+': unavailable action rejected: '+action,'warning');
  return false;
 }
 if(['stock_food','make_campfire'].includes(action)){
  if(npc.plan)return false;
  npc.plan={key:action,steps:0};
  npc.nextPlanAt=state.clock;
  npc.action='none';npc.source=source;npc.scores=scores;
  npc.goal='Planning to '+action.replaceAll('_',' ');
  record(npc.name+' chose a multi-step intention: '+action.replaceAll('_',' ')+
   ' ['+source+']',source==='rein'?'ai':'routine');
  return true;
 }
 if(action==='none'){
  npc.action='none';npc.source=source;npc.scores=scores;npc.task=null;
  if(!npc.goal)npc.goal='Observing the world';
 }else if(action==='rest'){
  npc.action='rest';npc.source=source;npc.scores=scores;npc.task=null;
  npc.path=[];npc.travel=0;npc.goal='Resting and recovering';
 }else{
  const target=candidate.target;
  if(target&&manhattan(npc,target)>1&&
     (action==='share_food'||action==='socialize'
       ?!approach(npc,target):!moveTo(npc,target))){
    record(npc.name+': could not reach chosen action','warning');
    return false;
  }
  npc.action=action;npc.source=source;npc.scores=scores;
  npc.task={key:action,ref:candidate.ref||null};
  if(action==='socialize')npc.peerFailures=0;
  npc.goal=action.replaceAll('_',' ')+' (self-chosen)';
  if(!npc.path.length && action!=='socialize')completeActivity(npc);
 }
 const score=scores&&Number.isFinite(scores[action])?' ('+Math.round(scores[action]*100)+'%)':'';
 record(npc.name+' chose '+action.replaceAll('_',' ')+score+' ['+source+']',
  source==='rein'?'ai':'routine');
 if(source==='rein')remember(npc,'Chose '+action+' based on current needs and local opportunities');
 updateInspector();
 return true;
}

async function jsonPost(path,body){
 const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok){
  const error=new Error(data.error||'HTTP '+response.status);
  error.status=response.status;
  throw error;
 }
 return data;
}
async function checkModel(){
 try{
  const response=await fetch('/api/health',{cache:'no-store'});
  const health=await response.json();
  state.connected=!!health.connected;
 }catch{state.connected=false;}
 const tag=$('modelStatus');
 tag.className='chip '+(state.connected?'online':'offline');
 tag.innerHTML='<i class="status-dot"></i> '+(state.connected?'Rein connected':'Offline · simulated routines');
}
async function deliberate(npc){
 state.backgroundBusy=true;
 try{
  const options=backgroundOptions(npc);
  if(state.connected){
   const data=await jsonPost('/api/decide',{
    persona:npc.personality,scene:sceneFor(npc),
    history:[],question:'What do you choose to do next for your own reasons, with your current needs, possessions, nearby people and resources?',options
   });
   if(!state.paused&&!state.conversationBusy&&options.some(o=>o.key===data.action)){
    setAction(npc,data.action,'rein',data.scores);
    record(npc.name+' inference completed in '+data.durationMs+'ms','ai');
   }
  }else if(!state.paused&&!state.conversationBusy){
   setAction(npc,fallbackBackground(npc),'offline routine',null);
  }
 }catch(error){
  if(error.status===429){
   record(npc.name+': background decision deferred for conversation','routine');
  }else{
   record(npc.name+': inference error — '+error.message,'warning');
   if(!state.paused&&!state.conversationBusy)
    setAction(npc,fallbackBackground(npc),'offline routine',null);
   void checkModel();
  }
 }finally{
  npc.thoughtAt=state.clock+(state.connected?32:30);
  state.lastDecisionMs=performance.now();
  state.backgroundBusy=false;
 }
}
function selectNpc(id){
 if(!state.npcs.some(n=>n.id===id))return;
 state.selected=id;renderResidents();updateInspector();renderChat();
}
function selectedNpc(){return state.npcs.find(n=>n.id===state.selected);}
function addConversation(npc,role,content,source){
 npc.chat.push({role,content,source});npc.chat=npc.chat.slice(-22);
 if(state.selected===npc.id)renderChat();
}
function socialOptions(npc){
 return [
  {key:'warm',when:'Respond warmly, welcoming a friendly person and talking openly'},
  {key:'guarded',when:'Respond politely but cautiously, giving limited information'},
  {key:'helpful',when:'Offer practical advice or assistance within actual knowledge and abilities'},
  {key:'refuse',when:'Decline the request or set a firm personal boundary'},
  {key:'avoid',when:'Disengage and attempt to leave this conversation'},
  {key:'none',when:'Stay neutral; casual conversation without extra action'}
 ];
}
function fallbackSocial(npc,text){
 if(/stupid|hate|idiot|shut up/i.test(text))return 'refuse';
 if(npc.trust>65)return 'warm';
 if(npc.trust<35)return 'guarded';
 return 'none';
}
async function sendMessage(event){
 event.preventDefault();
 const npc=selectedNpc(),input=$('messageInput');
 const message=input.value.trim();
 if(!npc||!message||state.conversationBusy)return;
 if(manhattan(state.player,npc)>4){$('chatHint').textContent='Move within 4 tiles to talk to '+npc.name+'.';return;}
 // Pause the previous plan rather than silently abandoning a gathering journey.
 // Selection may change while the shared model is generating a reply.
 const interrupted={task:npc.task,path:npc.path.slice(),action:npc.action,goal:npc.goal};
 input.value='';
 npc.path=[];npc.travel=0;npc.task=null;
 const prior=npc.chat.slice(-8).filter(item=>item.role!=='system')
  .map(({role,content})=>({role:role==='player'?'user':'assistant',content}));
 addConversation(npc,'player',message,'pending');
 record('You spoke to '+npc.name+': '+message.slice(0,75),'social');
 state.conversationBusy=true;$('sendBtn').disabled=true;
 $('chatHint').textContent='Prioritizing your conversation…';
 try{
  let action,source='offline routine',scores=null,reply,durationMs=0;
  const options=socialOptions(npc);
  if(state.connected){
   const response=await jsonPost('/api/interact',{
    persona:npc.personality,scene:sceneFor(npc),
    history:prior,message,
    question:'How should this character respond to the visitor’s latest words, given their personality and relationship?',
    options
   });
   action=response.action;scores=response.scores;reply=response.reply;
   durationMs=response.durationMs;source='rein';
   if(!options.some(o=>o.key===action))throw new Error('Model returned an unknown social action');
  }else{
   action=fallbackSocial(npc,message);
   const phrases={
    warm:'Good to see you! Pull up a chair and tell me what is on your mind.',
    guarded:'Well, that depends. What exactly are you asking?',
    helpful:'I can try to help, though I may not have all the answers.',
    refuse:'No. I am not comfortable with that.',
    avoid:'Sorry, I have somewhere to be right now.',
    none:'I hear you. Things have been busy around Hearthbrook lately.'
   };
   reply=phrases[action];
  }
  // Commit state only after a complete, validated response from both Rein calls.
  const pending=npc.chat.findLast(item=>item.role==='player'&&item.source==='pending');
  if(pending)pending.source='player';
  npc.action=action;npc.source=source;npc.scores=scores;
  if(action==='warm'||action==='helpful')npc.trust=clamp(npc.trust+2);
  if(action==='refuse'||action==='avoid')npc.trust=clamp(npc.trust-2);
  addConversation(npc,'npc',reply,source);
  remember(npc,'Player said: '+message.slice(0,85)+'; I replied: '+reply.slice(0,80));
  record(npc.name+' response: '+action+(scores?' ('+Math.round(scores[action]*100)+'%)':'')+
   ' ['+source+']'+(source==='rein'?' '+durationMs+'ms':''),source==='rein'?'ai':'social');
  if(action==='avoid'){
   npc.task=null;
   moveTo(npc,locations.square);
  }
  npc.mood=clamp(npc.mood+(action==='warm'?2:action==='refuse'?-2:0));
 }catch(error){
  record(npc.name+': conversation failed — '+error.message,'warning');
  // A failed request must not poison NPC memory or grant relationship changes.
  const index=npc.chat.findLastIndex(item=>item.role==='player'&&item.source==='pending');
  if(index>=0)npc.chat.splice(index,1);
  addConversation(npc,'system','No model reply was completed. Your message was not applied; please retry.','error');
  input.value=message;
  void checkModel();
 }finally{
  if(interrupted.action==='rest'&&npc.action!=='avoid'){
   npc.action='rest';npc.goal=interrupted.goal;
  }
  if(interrupted.task&&npc.action!=='avoid'){
   npc.task=interrupted.task;
   npc.path=interrupted.path;
   npc.travel=0;
   npc.action=interrupted.action;
   npc.goal=interrupted.goal;
  }
  state.conversationBusy=false;$('sendBtn').disabled=false;
  $('chatHint').textContent='Interactions are prioritized over background decisions.';
  state.lastDecisionMs=performance.now();
  save();updateInspector();
 }
}

function ensureBody(actor){
 if(!actor.body)actor.body=Physics2D.create(actor.x,actor.y,actor===state.player?.235:.23);
 return actor.body;
}
function nearbyBodies(actor){
 const body=ensureBody(actor);
 return [state.player,...state.npcs].filter(other=>other!==actor&&other.body)
  .map(other=>other.body).filter(other=>Math.abs(other.x-body.x)<2&&Math.abs(other.y-body.y)<2);
}
function controlVector(){
 let x=0,y=0;
 if(heldKeys.has('a')||heldKeys.has('arrowleft'))x--;
 if(heldKeys.has('d')||heldKeys.has('arrowright'))x++;
 if(heldKeys.has('w')||heldKeys.has('arrowup'))y--;
 if(heldKeys.has('s')||heldKeys.has('arrowdown'))y++;
 return {x,y};
}
function updateMovement(actor,dt,speed){
 const body=ensureBody(actor),others=nearbyBodies(actor);
 const input=actor===state.player?controlVector():{x:0,y:0};
 if(actor===state.player&&(input.x||input.y)){
  actor.path=[];actor.travel=0;
  Physics2D.steer(body,input,dt,isBlocked,others,speed);
  actor.x=Math.floor(body.x);actor.y=Math.floor(body.y);
 }else if(actor.path?.length){
  const next=actor.path[0];
  if(isBlocked(next.x,next.y)){
   actor.path=[];body.vx=0;body.vy=0;
  }else{
   const movement=Physics2D.follow(body,next,dt,isBlocked,others,speed);
   const dx=body.vx,dy=body.vy;
   if(Math.hypot(dx,dy)>.12)
    actor.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
   if(movement.arrived){
    actor.x=next.x;actor.y=next.y;
    actor.path.shift();actor.travel=0;
    actor.blockedFor=0;
   }else if(movement.blocked){
    actor.blockedFor=(actor.blockedFor||0)+dt;
    // Do not corrupt a task route. Wait briefly and let nearby bodies clear.
    if(actor.blockedFor>6){
     actor.path=[];
     actor.blockedFor=0;
     if(actor.task){actor.task=null;actor.goal='Route blocked by another resident';
       actor.thoughtAt=state.clock+5;}
    }
   }else actor.blockedFor=0;
  }
 }else{
  Physics2D.steer(body,{x:0,y:0},dt,isBlocked,others,speed);
 }
 actor.motion=Math.hypot(body.vx,body.vy);
 if(actor.motion>.13 && !actor.path?.length && actor===state.player){
  actor.facing=Math.abs(body.vx)>Math.abs(body.vy)
    ?(body.vx>0?'right':'left'):(body.vy>0?'down':'up');
 }
}
function position(actor){
 const body=actor.body;
 return body?{x:body.x-.5,y:body.y-.5}:{x:actor.x,y:actor.y};
}
const staticCanvas=document.createElement('canvas');
staticCanvas.width=W*TILE;staticCanvas.height=H*TILE;
const staticContext=staticCanvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
staticContext.imageSmoothingEnabled=false;
function drawStaticWorld(){
 VillageArt.drawWorld(staticContext,{width:W,height:H},buildings,trees);
}
function updateCamera(){
 const zoom=state.zoom;
 const viewW=canvas.width/zoom,viewH=canvas.height/zoom;
 const p=position(state.player);
 const tx=clamp((p.x+.5)*TILE-viewW/2,0,Math.max(0,W*TILE-viewW));
 const ty=clamp((p.y+.5)*TILE-viewH/2,0,Math.max(0,H*TILE-viewH));
 state.camera.x+=(tx-state.camera.x)*.26;
 state.camera.y+=(ty-state.camera.y)*.26;
}
function clientToTile(clientX,clientY,rect){
 const sx=(clientX-rect.left)*canvas.width/rect.width;
 const sy=(clientY-rect.top)*canvas.height/rect.height;
 return {
  x:Math.floor((state.camera.x+sx/state.zoom)/TILE),
  y:Math.floor((state.camera.y+sy/state.zoom)/TILE)
 };
}
function drawWorld(){
 updateCamera();
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#233e30';
 ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.save();
 ctx.scale(state.zoom,state.zoom);
 ctx.translate(-state.camera.x,-state.camera.y);
 ctx.drawImage(staticCanvas,0,0);
 VillageArt.drawWorldObjects(ctx,state.world);
 const actors=state.npcs.map(n=>({actor:n,player:false}));
 actors.push({actor:state.player,player:true});
 actors.sort((a,b)=>position(a.actor).y-position(b.actor).y);
 const now=performance.now();
 for(const item of actors){
  VillageArt.drawActor(ctx,item.actor,item.player,position(item.actor),
   !item.player&&state.selected===item.actor.id,now);
 }
 ctx.restore();
}
function renderEvents(){
 const area=$('eventLog');area.replaceChildren();
 for(const e of state.events.slice(0,35)){
  const row=document.createElement('div');row.className='event '+e.type;
  const tm=document.createElement('span');tm.className='event-time';tm.textContent=e.time;
  const dot=document.createElement('i');dot.className='event-dot';
  const msg=document.createElement('span');msg.textContent=e.text;
  row.append(tm,dot,msg);area.append(row);
 }
}
function renderResidents(){
 const wrap=$('residentList');wrap.replaceChildren();
 for(const npc of state.npcs){
  const btn=document.createElement('button');btn.type='button';
  btn.className='resident'+(npc.id===state.selected?' active':'');
  const symbol=document.createElement('i');symbol.className='symbol';symbol.style.background=npc.color;
  btn.append(symbol,document.createTextNode(npc.name));btn.addEventListener('click',()=>selectNpc(npc.id));
  wrap.append(btn);
 }
}
function updateInspector(){
 const npc=selectedNpc();if(!npc)return;
 $('npcPortrait').textContent=npc.name[0];$('npcPortrait').style.background=npc.color+'44';
 $('npcName').textContent=npc.name;
 $('npcMeta').textContent=AgentWorld.focus(npc);
 for(const [prefix,value] of [['mood',npc.mood],['energy',npc.energy],['trust',npc.trust]]){
  $(prefix+'Val').textContent=Math.round(value)+'/100';
  $(prefix+'Meter').style.width=clamp(value)+'%';
 }
 $('npcGoal').textContent=npc.goal;
 $('npcPlan').textContent=npc.plan
  ?npc.plan.key.replaceAll('_',' ')+' · '+npc.plan.steps+' steps'
  :'No ongoing plan';
 $('hungerVal').textContent=Math.round(npc.needs.hunger)+'/100';
 $('hungerMeter').style.width=clamp(npc.needs.hunger)+'%';
 $('inventoryVal').textContent='Food '+npc.inventory.food+' · Wood '+npc.inventory.wood+' · Stone '+npc.inventory.stone;
 $('experienceVal').textContent=Object.entries(npc.skills).filter(([,v])=>v>0)
   .map(([k,v])=>k+' '+v).join(' · ')||'None yet';
 $('socialVal').textContent=Math.round(npc.needs.social)+'/100';
 $('decisionSource').textContent=npc.source==='rein'?'Rein-NPC (live)':npc.source==='offline routine'?'Offline routine':'Simulation';
 $('talkDistance').textContent=manhattan(state.player,npc)+' tiles away';
 const scores=$('npcDecisions');scores.replaceChildren();
 if(npc.scores){
  for(const [name,score] of Object.entries(npc.scores).sort((a,b)=>b[1]-a[1])){
   const row=document.createElement('div');row.className='decision-row';
   const label=document.createElement('span');label.textContent=name.replaceAll('_',' ');
   const val=document.createElement('strong');val.textContent=(100*score).toFixed(1)+'%';
   row.append(label,val);scores.append(row);
  }
 }else{const msg=document.createElement('span');msg.className='empty';msg.textContent='No model decisions yet.';scores.append(msg);}
 const memories=$('npcMemories');memories.replaceChildren();
 if(!npc.memories.length){
  const msg=document.createElement('span');msg.className='empty';msg.textContent='No memories recorded.';memories.append(msg);
 }else for(const m of npc.memories.slice(-5).reverse()){
  const entry=document.createElement('div');entry.className='memory';entry.textContent=m.time+' — '+m.text;memories.append(entry);
 }
 const peerArea=$('peerLog');peerArea.replaceChildren();
 if(!npc.peerLog?.length){
  const empty=document.createElement('span');empty.className='empty';
  empty.textContent='No completed AI conversations with other residents.';
  peerArea.append(empty);
 }else{
  for(const exchange of npc.peerLog.slice(-3).reverse()){
   const entry=document.createElement('div');entry.className='memory';
   entry.textContent=exchange.at+' · '+exchange.first+' / '+exchange.second;
   peerArea.append(entry);
  }
 }
}
function renderChat(){
 const npc=selectedNpc(),area=$('chatLog');area.replaceChildren();if(!npc)return;
 if(!npc.chat.length){
  const el=document.createElement('div');el.className='empty';
  el.textContent='No conversation with '+npc.name+' yet. Walk closer and introduce yourself.';area.append(el);
 }
 for(const item of npc.chat){
  const bubble=document.createElement('div');bubble.className='chat-bubble'+(item.role==='player'?' player-msg':'');
  const label=document.createElement('small');
  label.textContent=item.role==='player'?'You':item.role==='system'?'System':npc.name+' · '+(item.source==='rein'?'Rein':'offline');
  const body=document.createElement('span');body.textContent=item.content;
  bubble.append(label,body);area.append(bubble);
 }
 area.scrollTop=area.scrollHeight;
}
function save(){
 try{
  const pack={clock:state.clock,day:state.day,
   player:{x:state.player.x,y:state.player.y},
   world:state.world,
   npcs:state.npcs.map(n=>({
    id:n.id,x:n.x,y:n.y,mood:n.mood,energy:n.energy,trust:n.trust,goal:n.goal,
    source:n.source,action:n.action,scores:n.scores,facing:n.facing,
    memories:n.memories,chat:n.chat.filter(item=>item.source!=='pending'),
    relationships:n.relationships,path:n.path,needs:n.needs,inventory:n.inventory,
    skills:n.skills,visited:n.visited,task:n.task,
    plan:n.plan,peerLog:n.peerLog,lastPeerAt:n.lastPeerAt
   }))
  };
  localStorage.setItem(STORE,JSON.stringify(pack));
 }catch{ /* Storage disabled or quota exceeded; the live simulation continues. */ }
}
function validSavedPath(path, start){
 if(!Array.isArray(path)||path.length>W*H)return false;
 let previous=start;
 for(const tile of path){
  if(!tile||!Number.isInteger(tile.x)||!Number.isInteger(tile.y)||
    manhattan(previous,tile)!==1||isBlocked(tile.x,tile.y))return false;
  previous=tile;
 }
 return true;
}
function restore(){
 try{
  const data=JSON.parse(localStorage.getItem(STORE)||'null');if(!data)return;
  if(Number.isFinite(data.clock)&&data.clock>=0)state.clock=data.clock;
  if(Number.isFinite(data.day))state.day=clamp(data.day,1,9999);
  AgentWorld.restoreWorld(state.world,data.world);
  if(data.player&&!isBlocked(data.player.x,data.player.y)){
   state.player.x=Math.round(data.player.x);state.player.y=Math.round(data.player.y);
  }
  for(const npc of state.npcs){
   const prev=data.npcs?.find(n=>n.id===npc.id);if(!prev)continue;
   if(!isBlocked(prev.x,prev.y)){npc.x=prev.x;npc.y=prev.y;}
   for(const k of ['mood','energy','trust'])if(Number.isFinite(prev[k]))npc[k]=clamp(prev[k]);
   if(typeof prev.goal==='string')npc.goal=prev.goal.slice(0,130);
   if(AgentWorld.KEYS.includes(prev.action))npc.action=prev.action;
   else {npc.action='none';npc.goal='Learning about this place';}
   if(typeof prev.source==='string')npc.source=prev.source.slice(0,40);
   if(['up','down','left','right'].includes(prev.facing))npc.facing=prev.facing;
   if(prev.scores&&typeof prev.scores==='object')npc.scores=prev.scores;
   if(Array.isArray(prev.memories))npc.memories=prev.memories.slice(-16);
   if(Array.isArray(prev.chat))npc.chat=prev.chat.filter(item=>item.source!=='pending').slice(-22);
   if(prev.relationships&&typeof prev.relationships==='object')npc.relationships=prev.relationships;
   if(validSavedPath(prev.path,npc))npc.path=prev.path.map(tile=>({x:tile.x,y:tile.y}));
   for(const key of ['hunger','social','curiosity'])
    if(Number.isFinite(prev.needs?.[key]))npc.needs[key]=clamp(prev.needs[key]);
   for(const key of ['food','wood','stone'])
    if(Number.isInteger(prev.inventory?.[key])&&prev.inventory[key]>=0)
     npc.inventory[key]=Math.min(prev.inventory[key],1000);
   for(const key of Object.keys(npc.skills))
    if(Number.isInteger(prev.skills?.[key])&&prev.skills[key]>=0)
     npc.skills[key]=Math.min(prev.skills[key],100000);
   if(Array.isArray(prev.visited))npc.visited=prev.visited.filter(x=>typeof x==='string').slice(-32);
   // Old job-based save files have no task. Do not resurrect their scripted routes.
   if(prev.task&&AgentWorld.KEYS.includes(prev.task.key)&&
       (prev.task.ref===null||typeof prev.task.ref==='string'))
    npc.task={key:prev.task.key,ref:prev.task.ref};
   else if(!data.world){npc.path=[];npc.action='none';}
   npc.plan=AgentWorld.validatePlan(prev.plan);
   if(Array.isArray(prev.peerLog))npc.peerLog=prev.peerLog
    .filter(x=>x&&typeof x.first==='string'&&typeof x.second==='string'&&
      typeof x.at==='string'&&typeof x.with==='string'&&
      state.npcs.some(other=>other.id===x.with))
    .slice(-10).map(x=>({at:x.at.slice(0,60),with:x.with,
      first:x.first.slice(0,260),second:x.second.slice(0,260)}));
   if(Number.isFinite(prev.lastPeerAt))npc.lastPeerAt=Math.min(state.clock,prev.lastPeerAt);
   // A saved NPC encounter may restart, but it must earn model approval again.
   if(npc.task?.key==='socialize')delete npc.task.approved;
   npc.thoughtAt=state.clock+4+state.npcs.indexOf(npc)*3;
  }
 }catch{ /* Ignore corrupt or obsolete saves rather than breaking the village. */ }
}
state.world.now=state.clock;
// Physics bodies are transient and rebuilt from the validated saved tile positions.
ensureBody(state.player);
for(const agent of state.npcs)ensureBody(agent);
const heldKeys=new Set();
function step(dt){
 if(state.paused)return;
 // Continuous keyboard steering is handled by Physics2D, not per-tile path resets.
 const elapsed=dt*state.speed;
 const beforeDay=Math.floor(state.clock/1440);
 state.clock+=elapsed;
 if(Math.floor(state.clock/1440)>beforeDay)state.day++;
 updateMovement(state.player,dt,5.2);
 state.world.now=state.clock;
 AgentWorld.regenerate(state.world,elapsed);
 for(const npc of state.npcs){
  if(!npc.peerPending)updateMovement(npc,dt,2.0);
  const recovered=AgentWorld.stepNeeds(npc,state.world,elapsed);
  if(recovered){
   remember(npc,'Recovered energy after resting');
   npc.thoughtAt=state.clock+2;
  }
  if(!npc.peerPending&&!state.conversationBusy){
   if(npc.task&&!npc.path.length)completeActivity(npc);
   else if(npc.plan&&!npc.task&&!npc.path.length)advancePlan(npc);
  }
 }
 // No automatic relationship gain from simply standing nearby.
 // Characters must choose to socialize, share or help to affect each other.
 if(state.auto&&!state.backgroundBusy&&!state.conversationBusy&&
    performance.now()-state.lastDecisionMs>(state.connected?12000:3500)){
  const due=state.npcs.filter(n=>!n.task&&!n.plan&&!n.peerPending&&
    n.action!=='rest'&&state.clock>=n.thoughtAt)
    .sort((a,b)=>a.thoughtAt-b.thoughtAt)[0];
  if(due)void deliberate(due);
 }
}
function updateHUD(now){
 if(now<state.nextUI)return;
 state.nextUI=now+750;
 $('worldTime').textContent=timeString();
 $('worldDay').textContent='DAY '+String(state.day).padStart(2,'0');
 $('worldStatus').textContent=state.paused?'Simulation paused':state.conversationBusy?'Conversing with NPC…':state.backgroundBusy?'Background thinking…':'World running';
 $('footerNote').textContent=state.connected?'Model decisions are labeled Rein.':'No model connected: deterministic routines active.';
 $('pauseBtn').textContent=state.paused?'▶ Resume':'Ⅱ Pause';
 if(!state.conversationBusy)updateInspector();
 if(now>state.nextSave){save();state.nextSave=now+5000;}
}
function animate(now){
 // Cap drawing at 30 fps to leave CPU budget for inference and browser input.
 if(animate.last&&now-animate.last<33){
  requestAnimationFrame(animate);
  return;
 }
 const dt=Math.min(0.06,(now-(animate.last||now))/1000);
 animate.last=now;
 step(dt);drawWorld();updateHUD(now);requestAnimationFrame(animate);
}
canvas.addEventListener('click',event=>{
 const rect=canvas.getBoundingClientRect();
 const tile=clientToTile(event.clientX,event.clientY,rect);
 const npc=state.npcs.find(n=>manhattan(position(n),tile)<=1);
 if(npc){selectNpc(npc.id);return;}
 if(!isBlocked(tile.x,tile.y)){
  moveTo(state.player,tile);
 }else record('That tile is blocked. Click an open path to walk.','warning');
});
window.addEventListener('keydown',event=>{
 const active=document.activeElement?.tagName;
 if(active==='INPUT'||active==='TEXTAREA')return;
 const key=event.key.toLowerCase();
 if(key==='+'||key==='='){event.preventDefault();setZoom(state.zoom+1);return;}
 if(key==='-'||key==='_'){event.preventDefault();setZoom(state.zoom-1);return;}
 if(key==='e'){
  const npc=selectedNpc();if(npc&&manhattan(state.player,npc)<=4)$('messageInput').focus();
  return;
 }
 if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
  event.preventDefault();heldKeys.add(key);
 }
});
window.addEventListener('keyup',event=>heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>heldKeys.clear());
window.addEventListener('pagehide',save);

function setZoom(next){
 state.zoom=clamp(next,1,3);
 $('zoomLevel').textContent=state.zoom+'×';
 updateCamera();
}
$('zoomIn').addEventListener('click',()=>setZoom(state.zoom+1));
$('zoomOut').addEventListener('click',()=>setZoom(state.zoom-1));
$('pauseBtn').addEventListener('click',()=>{state.paused=!state.paused;});
$('autoAI').addEventListener('change',event=>{state.auto=event.target.checked;record('Autonomous decisions '+(state.auto?'enabled':'disabled'));});
for(const btn of document.querySelectorAll('[data-speed]')){
 btn.addEventListener('click',()=>{
  state.speed=Number(btn.dataset.speed);
  document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',el===btn));
 });
}
$('clearLog').addEventListener('click',()=>{state.events=[];renderEvents();});
$('resetBtn').addEventListener('click',()=>{
 if(!window.confirm('Reset all local NPC memory, relationships, and positions?'))return;
 localStorage.removeItem(STORE);window.location.reload();
});
$('chatForm').addEventListener('submit',sendMessage);
drawStaticWorld();
restore();
renderResidents();updateInspector();renderChat();
record('Hearthbrook village initialized — click a resident to inspect their state.');
checkModel();
setInterval(checkModel,10000);
requestAnimationFrame(animate);
