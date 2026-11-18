'use strict';

// Browser-only world simulation. Rein inference lives in the separate local Node bridge.
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const TILE = 28;
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
 { id:'mara', name:'Mara', role:'Café owner', home:'cottage', work:'cafe', x:19,y:8, mood:79, energy:84, trust:56, color:'#e9aa85', personality:'Mara, 32, runs the Hearth Café. Warm, observant, protective of her friends, quietly stubborn. Dislikes gossip and values honesty.' },
 { id:'jonas', name:'Jonas', role:'Mechanic', home:'cottage', work:'forge', x:7,y:21, mood:55, energy:80, trust:41, color:'#9bc3cc', personality:'Jonas, 40, repairs equipment at the Workshop. Dry humor, pragmatic, guarded with strangers, deeply loyal once trust is earned.' },
 { id:'asha', name:'Asha', role:'Librarian', home:'cottage', work:'library', x:20,y:22, mood:72, energy:73, trust:63, color:'#bc9add', personality:'Asha, 28, keeps the village library. Curious, patient, precise about facts, a little shy in groups, loves local history.' },
 { id:'rowan', name:'Rowan', role:'Nurse', home:'cottage', work:'clinic', x:33,y:8, mood:65, energy:71, trust:62, color:'#a1d6aa', personality:'Rowan, 35, is the village nurse. Calm under pressure, empathic but blunt, avoids exaggeration, respects boundaries.' },
 { id:'lina', name:'Lina', role:'Market trader', home:'cottage', work:'market', x:33,y:22, mood:83, energy:90, trust:48, color:'#d9cb79', personality:'Lina, 24, runs a produce stall at the market. Spirited, business-minded, outgoing, competitive and fond of teasing friends.' },
 { id:'nico', name:'Nico', role:'Courier', home:'cottage', work:'market', x:26,y:12, mood:68, energy:76, trust:51, color:'#e693ad', personality:'Nico, 21, delivers mail through Hearthbrook. Restless, cheerful, socially awkward when surprised and always looking for adventure.' }
].map((n,i) => ({...n, goal:'Starting the day', action:'none', source:'routine', scores:null,
  memories:[], chat:[], relationships:{}, path:[], travel:0, thoughtAt:8*60+10+i*7, lastSeen:0}));

const state={clock:8*60+10, day:1, speed:1, paused:false, connected:false,
  auto:true, backgroundBusy:false, conversationBusy:false, selected:'mara', lastDecisionMs:0, player:{x:21,y:12,path:[],travel:0},
  npcs:initialNPCs, events:[], nextUI:0, nextSave:0, lastSocial:0};
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
 actor.path=path;actor.travel=0;return true;
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
function sceneFor(npc){
 const around=state.npcs.filter(n=>n.id!==npc.id&&manhattan(n,npc)<=7)
  .map(n=>n.name+' ('+n.role+', '+manhattan(n,npc)+' tiles away)').join(', ')||'Nobody nearby';
 const memories=npc.memories.slice(-5).map(m=>m.time+': '+m.text).join('; ')||'No notable prior events';
 return 'Hearthbrook, day '+state.day+' at '+timeString()+'. '+npc.name+
  ' is at tile ('+npc.x+','+npc.y+'), currently '+npc.goal+'. Mood '+Math.round(npc.mood)+
  '/100, energy '+Math.round(npc.energy)+'/100; trust in player '+Math.round(npc.trust)+
  '/100. Nearby residents: '+around+'. Recent real memories: '+memories+
  '. Known locations: home cottage, '+npc.work+' workplace, cafe, square and market. '+
  'Actions must be plausible and physically possible in this world.';
}
function backgroundOptions(npc){
 const hour=(state.clock%1440)/60;
 const options=[];
 // Filter obviously implausible options before asking Rein to choose.
 // The model ranks available actions; it does not overrule world constraints.
 if(hour>=7&&hour<19)
  options.push({key:'work',when:'Perform '+npc.role+' duties at the workplace during working hours'});
 if(hour>=6&&hour<23)
  options.push({key:'cafe',when:'Visit the cafe for food, relaxation or company'});
 options.push({key:'square',when:'Spend time in the village square or outdoors'});
 options.push({key:'home',when:'Return home for quiet, safety or sleep'});
 options.push({key:'rest',when:'Rest if tired and conserve energy'});
 if(nearest(npc,6)) options.push({key:'socialize',when:'Speak briefly with a nearby resident to maintain a relationship'});
 options.push({key:'none',when:'Continue present activity without changing plans'});
 return options;
}
function fallbackBackground(npc){
 const hour=(state.clock%1440)/60;
 if(npc.energy<30)return 'rest';
 if(hour>=8&&hour<17) return npc.work==='cafe'&&npc.mood<40?'square':'work';
 if(hour>=17&&hour<20)return 'cafe';
 return 'home';
}
function setAction(npc,action,source,scores){
 const other=nearest(npc,6);
 const targets={work:npc.work,cafe:'cafe',square:'square',home:npc.home,rest:npc.home,
   socialize:other?null:undefined};
 if(!['work','cafe','square','home','rest','socialize','none'].includes(action)) {
  record(npc.name+': rejected unknown action '+action,'warning');return;
 }
 let result=true;
 if(action==='socialize') {
  if(!other)result=false;
  else result=approach(npc,other);
  if(result&&other){
   npc.goal='Catch up with '+other.name;
   npc.socialTarget=other.id;
  }
 }else if(action==='none') {
  // A continuation is not a new destination or an ever-growing goal string.
  result=true;
 }else{
  const target=locations[targets[action]];
  result=!!target&&(npc.action===action&&npc.path.length>0?true:moveTo(npc,target));
  if(result)npc.socialTarget=null;
  if(result)npc.goal=action==='work'?'Working at '+npc.work:
    action==='cafe'?'Visiting the café':action==='square'?'Visiting the square':
    action==='home'?'Going home':'Resting at home';
 }
 if(!result){record(npc.name+': action not reachable; world rejected it','warning');return;}
 npc.action=action;npc.source=source;npc.scores=scores;
 const score=scores&&Number.isFinite(scores[action])?' ('+Math.round(scores[action]*100)+'%)':'';
 record(npc.name+' → '+action.replace('_',' ') +score+' ['+source+']',source==='rein'?'ai':'routine');
 if(source==='rein')remember(npc,'Chose '+action+' while '+sceneFor(npc).slice(0,80));
 updateInspector();
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
    history:[],question:'Which available action is most appropriate for this resident’s current needs and circumstances?',options
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
  npc.thoughtAt=state.clock+(state.connected?55:60);
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
  if(action==='avoid')moveTo(npc,locations[npc.home]);
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
staticCanvas.width=canvas.width;staticCanvas.height=canvas.height;
const staticContext=staticCanvas.getContext('2d');
function drawStaticWorld(){
 const ctx=staticContext;
 const t=TILE;
 ctx.fillStyle='#506b57';ctx.fillRect(0,0,canvas.width,canvas.height);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const r=rand(x,y);
  let color=r>.81?'#56735f':r>.43?'#526f5b':'#4c6956';
  const road=(y>=11&&y<=13)||(y>=22&&y<=23)||
    ((x===7||x===19||x===33)&&y>=7&&y<=23);
  if(road)color=r>.5?'#a69c82':'#aaa18a';
  ctx.fillStyle=color;ctx.fillRect(x*t,y*t,t,t);
  if(!road&&r>.96){ctx.fillStyle='#d4bb84';ctx.fillRect(x*t+8,y*t+12,3,3);}
 }
 // Pond and shoreline.
 ctx.fillStyle='#7c997a';ctx.beginPath();ctx.ellipse(38*t+11,21*t+12,69,72,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#406d84';ctx.beginPath();ctx.ellipse(38*t+11,21*t+12,56,58,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#8cb7bb';ctx.lineWidth=2;
 for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(39*t,21*t+12,i*14+6,0.3,1.9);ctx.stroke();}
 // Trees and low vegetation.
 for(const [x,y] of trees){
  ctx.fillStyle='#253f35';ctx.beginPath();ctx.ellipse(x*t+15,y*t+19,12,8,0,0,7);ctx.fill();
  ctx.fillStyle='#274f3f';ctx.beginPath();ctx.arc(x*t+14,y*t+9,12,0,7);ctx.fill();
  ctx.fillStyle='#3b7557';ctx.beginPath();ctx.arc(x*t+9,y*t+6,9,0,7);ctx.fill();
  ctx.fillStyle='#568468';ctx.beginPath();ctx.arc(x*t+17,y*t+5,7,0,7);ctx.fill();
 }
 // Village fountain and benches.
 ctx.fillStyle='#70848a';ctx.fillRect(25*t+9,11*t+13,36,36);
 ctx.fillStyle='#9fc9d1';ctx.beginPath();ctx.arc(26*t+13,12*t+2,12,0,7);ctx.fill();
 ctx.fillStyle='#d3e9e7';ctx.beginPath();ctx.arc(26*t+13,12*t+2,4,0,7);ctx.fill();
 for(const p of [[10,12],[27,14],[15,14]]){
  ctx.fillStyle='#634e40';ctx.fillRect(p[0]*t+2,p[1]*t+11,21,7);
  ctx.fillStyle='#b49c79';ctx.fillRect(p[0]*t+3,p[1]*t+8,20,4);
 }
 // Buildings, windows and doors.
 for(const b of buildings){
  const X=b.x*t,Y=b.y*t,BW=b.w*t,BH=b.h*t;
  ctx.fillStyle='#233d37';ctx.fillRect(X+7,Y+9,BW+7,BH+6);
  ctx.fillStyle='#d0c0a2';ctx.fillRect(X+4,Y+4,BW-8,BH-5);
  ctx.fillStyle=b.roof;ctx.fillRect(X-3,Y-4,BW+6,BH-23);
  ctx.fillStyle='#ffffff12';ctx.fillRect(X+2,Y+1,BW-4,6);
  ctx.strokeStyle='#2b3f46';ctx.lineWidth=2;ctx.strokeRect(X-3,Y-4,BW+6,BH-23);
  ctx.fillStyle='#c4d9d3';
  for(const j of [1,2,3])if(j*t < BW-22)ctx.fillRect(X+j*t-6,Y+BH-27,15,13);
  ctx.fillStyle='#4e433a';ctx.fillRect(b.door.x*t+6,Y+BH-20,17,20);
  ctx.fillStyle='#e9c682';ctx.beginPath();ctx.arc(b.door.x*t+19,Y+BH-10,2,0,7);ctx.fill();
  ctx.textAlign='center';ctx.font='bold 12px system-ui';ctx.lineWidth=4;
  ctx.strokeStyle='#18272acc';ctx.strokeText(b.name,X+BW/2,Y+17);
  ctx.fillStyle='#fff1d4';ctx.fillText(b.name,X+BW/2,Y+17);
 }
}
function drawWorld(){
 ctx.drawImage(staticCanvas,0,0);
 for(const npc of state.npcs)drawPerson(npc,false);
 drawPerson(state.player,true);
}
function drawPerson(person,isPlayer){
 const p=position(person),X=(p.x+.5)*TILE,Y=(p.y+.55)*TILE;
 const color=isPlayer?'#71b5ec':person.color;
 ctx.fillStyle='#15262188';ctx.beginPath();ctx.ellipse(X,Y+12,11,5,0,0,7);ctx.fill();
 if(!isPlayer&&state.selected===person.id){
  ctx.strokeStyle='#f9d48b';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(X,Y+6,17,14,0,0,7);ctx.stroke();
 }
 ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(X-9,Y-3,18,18,5);ctx.fill();
 ctx.fillStyle=isPlayer?'#e1d0aa':'#e6bf9d';ctx.beginPath();ctx.arc(X,Y-9,9,0,7);ctx.fill();
 ctx.fillStyle=isPlayer?'#314b6e':'#584b42';ctx.beginPath();ctx.arc(X,Y-13,8,Math.PI,2*Math.PI);ctx.fill();
 ctx.fillStyle='#293140';ctx.fillRect(X-4,Y-8,2,2);ctx.fillRect(X+3,Y-8,2,2);
 const name=isPlayer?'YOU':person.name;
 ctx.font='bold 10px system-ui';const bw=ctx.measureText(name).width+13;
 ctx.fillStyle='#182330ee';ctx.beginPath();ctx.roundRect(X-bw/2,Y-36,bw,16,5);ctx.fill();
 ctx.textAlign='center';ctx.fillStyle=isPlayer?'#b6e4ff':'#f5eada';ctx.fillText(name,X,Y-25);
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
   source:n.source,action:n.action,scores:n.scores,memories:n.memories,
   chat:n.chat.filter(item=>item.source!=='pending'),relationships:n.relationships
  }))};
  localStorage.setItem(STORE,JSON.stringify(pack));
 }catch{ /* Private mode / storage denied: keep playing without persistence. */ }
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
   if(prev.scores&&typeof prev.scores==='object')npc.scores=prev.scores;
   if(Array.isArray(prev.memories))npc.memories=prev.memories.slice(-16);
   if(Array.isArray(prev.chat))npc.chat=prev.chat.slice(-22);
   if(prev.relationships&&typeof prev.relationships==='object')npc.relationships=prev.relationships;
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
 const tile={x:Math.floor((event.clientX-rect.left)*canvas.width/rect.width/TILE),
             y:Math.floor((event.clientY-rect.top)*canvas.height/rect.height/TILE)};
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
