'use strict';

// Browser-only world simulation. Rein inference lives in the separate local Node bridge.
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const TILE = VillageArt.TILE;
const W = 40, H = 26;
const STORE = 'ai-npc-cog-v1';

const buildings = [
  { id:'cottage', name:'Oak Cottage', x:4, y:3, w:7, h:5, door:{x:7,y:8}, roof:'#97674c' },
  { id:'cafe', name:'Hearth Café', x:15, y:3, w:8, h:5, door:{x:19,y:8}, roof:'#bd775d' },
  { id:'clinic', name:'Clinic', x:29, y:3, w:8, h:5, door:{x:33,y:8}, roof:'#7e93a4' },
  { id:'forge', name:'Workshop', x:4, y:16, w:7, h:5, door:{x:7,y:21}, roof:'#78665a' },
  { id:'library', name:'Library', x:16, y:17, w:8, h:5, door:{x:20,y:22}, roof:'#6a7c9f' },
  { id:'market', name:'Market', x:29, y:17, w:8, h:5, door:{x:33,y:22}, roof:'#b58c5a' }
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
  .map(n=>n.name+' ('+manhattan(n,npc)+' tiles away, hunger '+Math.round(n.needs.hunger)+
    ', social need '+Math.round(n.needs.social)+')').join(', ')||'Nobody nearby';
 const memories=npc.memories.slice(-4).map(m=>m.time+': '+m.text).join('; ')||'No notable memories';
 const nearby=state.world.nodes.filter(node=>node.stock>0&&manhattan(node,npc)<=18)
  .map(n=>n.kind+' at '+n.x+','+n.y+' ('+n.stock+' left)').slice(0,8).join('; ')||'Nothing identified';
 return 'Small settlement, day '+state.day+' at '+timeString()+'. '+
  npc.name+' is at ('+npc.x+','+npc.y+'). Personality: '+npc.personality+
  ' Physical needs: hunger '+Math.round(npc.needs.hunger)+'/100 (high is hungry), energy '+
  Math.round(npc.energy)+'/100 (low is tired), social need '+Math.round(npc.needs.social)+
  '/100 (high is lonely), curiosity '+Math.round(npc.needs.curiosity)+'/100. Inventory: '+
  Object.entries(npc.inventory).map(([k,v])=>k+' '+v).join(', ')+'. '+AgentWorld.focus(npc)+
  '. Current intention: '+npc.goal+'. Other residents within earshot: '+around+
  '. Observed usable resources: '+nearby+'. Personal memories: '+memories+
  '. Nobody has been assigned a profession, destination or routine. You choose one available action; '+
  'the environment validates it and supplies consequences.';
}
function backgroundOptions(npc){
 return availableActivities(npc).map(({key,when})=>({key,when}));
}
function fallbackBackground(npc){
 return AgentWorld.fallback(npc,backgroundOptions(npc));
}
function completeActivity(npc){
 if(!npc.task)return;
 const outcome=AgentWorld.complete(npc,state.world,state.npcs);
 if(outcome.ok){
  remember(npc,outcome.message);
  record(npc.name+': '+outcome.message,'social');
  npc.goal='Considering what to do next';
  npc.thoughtAt=state.clock+1;
 }else{
  record(npc.name+': '+outcome.message+' [world rejected]','warning');
  npc.goal='Reconsidering after a failed attempt';
  npc.thoughtAt=state.clock+1;
 }
}
function setAction(npc,action,source,scores){
 const candidate=availableActivities(npc).find(option=>option.key===action);
 if(!candidate){
  record(npc.name+': unavailable action rejected: '+action,'warning');
  return false;
 }
 if(action==='none'){
  npc.action='none';npc.source=source;npc.scores=scores;npc.task=null;
  npc.goal='Observing the world';
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
  npc.goal=action.replaceAll('_',' ')+' (self-chosen)';
  if(!npc.path.length)completeActivity(npc);
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
 // Persist the target identity. UI selection may change while inference runs.
 input.value='';
 npc.path=[];npc.travel=0;
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
  state.conversationBusy=false;$('sendBtn').disabled=false;
  $('chatHint').textContent='Interactions are prioritized over background decisions.';
  state.lastDecisionMs=performance.now();
  save();updateInspector();
 }
}

function updateMovement(actor,dt,tilesPerSec){
 if(!actor.path?.length)return;
 actor.travel+=dt*tilesPerSec;
 while(actor.travel>=1&&actor.path.length){
  const next=actor.path.shift();
  if(isBlocked(next.x,next.y)){actor.path=[];break;}
  const dx=next.x-actor.x,dy=next.y-actor.y;
  actor.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
  actor.x=next.x;actor.y=next.y;actor.travel-=1;
 }
 if(!actor.path.length)actor.travel=0;
}
function position(actor){
 if(actor.path?.length){
  const n=actor.path[0],t=Math.min(1,actor.travel);
  return {x:actor.x+(n.x-actor.x)*t,y:actor.y+(n.y-actor.y)*t};
 }
 return {x:actor.x,y:actor.y};
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
 state.camera.x=clamp(Math.round((p.x+.5)*TILE-viewW/2),0,W*TILE-viewW);
 state.camera.y=clamp(Math.round((p.y+.5)*TILE-viewH/2),0,H*TILE-viewH);
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
 $('npcName').textContent=npc.name;$('npcMeta').textContent=npc.role+' · '+npc.personality.split('.')[1]?.trim();
 for(const [prefix,value] of [['mood',npc.mood],['energy',npc.energy],['trust',npc.trust]]){
  $(prefix+'Val').textContent=Math.round(value)+'/100';
  $(prefix+'Meter').style.width=clamp(value)+'%';
 }
 $('npcGoal').textContent=npc.goal;
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
  const pack={clock:state.clock,day:state.day,player:{x:state.player.x,y:state.player.y},npcs:state.npcs.map(n=>({
   id:n.id,x:n.x,y:n.y,mood:n.mood,energy:n.energy,trust:n.trust,goal:n.goal,
   source:n.source,action:n.action,scores:n.scores,facing:n.facing,memories:n.memories,
   chat:n.chat.filter(item=>item.source!=='pending'),relationships:n.relationships,
   path:n.path,socialTarget:n.socialTarget||null
  }))};
  localStorage.setItem(STORE,JSON.stringify(pack));
 }catch{ /* Private mode / storage denied: keep playing without persistence. */ }
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
  if(data.player&&!isBlocked(data.player.x,data.player.y)){
   state.player.x=Math.round(data.player.x);state.player.y=Math.round(data.player.y);
  }
  for(const npc of state.npcs){
   const prev=data.npcs?.find(n=>n.id===npc.id);if(!prev)continue;
   if(!isBlocked(prev.x,prev.y)){npc.x=prev.x;npc.y=prev.y;}
   for(const k of ['mood','energy','trust'])if(Number.isFinite(prev[k]))npc[k]=clamp(prev[k]);
   for(const k of ['goal','source','action'])if(typeof prev[k]==='string')npc[k]=prev[k].slice(0,130);
   if(['up','down','left','right'].includes(prev.facing))npc.facing=prev.facing;
   if(prev.scores&&typeof prev.scores==='object')npc.scores=prev.scores;
   if(Array.isArray(prev.memories))npc.memories=prev.memories.slice(-16);
   if(Array.isArray(prev.chat))npc.chat=prev.chat.slice(-22);
   if(prev.relationships&&typeof prev.relationships==='object')npc.relationships=prev.relationships;
   if(validSavedPath(prev.path,npc))npc.path=prev.path.map(tile=>({x:tile.x,y:tile.y}));
   if(typeof prev.socialTarget==='string'&&state.npcs.some(other=>other.id===prev.socialTarget))
    npc.socialTarget=prev.socialTarget;
   npc.thoughtAt=state.clock+10+state.npcs.indexOf(npc)*3;
  }
 }catch{ /* Ignore stale or corrupt browser state. */ }
}
const heldKeys=new Set();
function step(dt){
 if(state.paused)return;
 if(!state.player.path.length&&heldKeys.size){
  const key=Array.from(heldKeys).at(-1);
  const delta={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],
   a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]}[key];
  if(delta)moveTo(state.player,{x:state.player.x+delta[0],y:state.player.y+delta[1]});
 }
 const beforeDay=Math.floor(state.clock/1440);
 state.clock+=dt*state.speed;
 if(Math.floor(state.clock/1440)>beforeDay)state.day++;
 updateMovement(state.player,dt,5.2);
 for(const npc of state.npcs){
  updateMovement(npc,dt,2.0);
  npc.energy=clamp(npc.energy-dt*state.speed*0.04);
  if(npc.action==='rest'&&manhattan(npc,locations[npc.home])<=1)
   npc.energy=clamp(npc.energy+dt*state.speed*0.36);
  if(npc.socialTarget&&!npc.path.length){
   const other=state.npcs.find(n=>n.id===npc.socialTarget);
   npc.socialTarget=null;
   if(other&&manhattan(npc,other)<=2){
    npc.relationships[other.id]=clamp((npc.relationships[other.id]??50)+1);
    other.relationships[npc.id]=clamp((other.relationships[npc.id]??50)+1);
    remember(npc,'Met '+other.name+' after seeking them out');
    record(npc.name+' met '+other.name+' [simulation event]','social');
   }
  }
 }
 if(state.clock-state.lastSocial>16){
  state.lastSocial=state.clock;
  for(let i=0;i<state.npcs.length;i++)for(let j=i+1;j<state.npcs.length;j++){
   const a=state.npcs[i],b=state.npcs[j];
   if(manhattan(a,b)<=2&&rand(i+Math.floor(state.clock/16),j)>.54){
    a.relationships[b.id]=clamp((a.relationships[b.id]??50)+1);
    b.relationships[a.id]=clamp((b.relationships[a.id]??50)+1);
    remember(a,'Briefly encountered '+b.name+' near '+a.goal.toLowerCase());
    record(a.name+' and '+b.name+' crossed paths [simulation event]','social');
   }
  }
 }
 if(state.auto&&!state.backgroundBusy&&!state.conversationBusy&&performance.now()-state.lastDecisionMs>(state.connected?12000:3500)){
  const due=state.npcs.filter(n=>state.clock>=n.thoughtAt).sort((a,b)=>a.thoughtAt-b.thoughtAt)[0];
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
