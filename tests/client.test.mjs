import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function makeBrowser(options={}){
 const events=new Map(),saved=options.saved||new Map();
 const counters={staticRects:0,screenImages:0,screenRects:0};
 const frames=[];
 let failScreenDraw=!!options.failScreenDrawOnce;
 let failStaticDraw=!!options.failStaticDrawOnce;
 const fakeCtx=kind=>new Proxy({
  measureText:s=>({width:String(s).length*8}),
  fillRect(){if(kind==='screen')counters.screenRects++;
   if(kind==='static'){
   if(failStaticDraw){failStaticDraw=false;throw Error('Startup background drawing failed');}
   counters.staticRects++;
  }},
  drawImage(){if(kind==='screen'){
   if(failScreenDraw){failScreenDraw=false;throw Error('Canvas temporarily unavailable');}
   counters.screenImages++;
  }}
 },{get(obj,key){return obj[key]??(()=>{});},set(obj,k,v){obj[k]=v;return true;}});
 const screen=fakeCtx('screen'),staticCtx=fakeCtx('static');
 const canvas={width:640,height:416,getContext:()=>screen,
  getBoundingClientRect:()=>({left:0,top:0,width:640,height:416}),
  addEventListener(type,fn){events.set('canvas:'+type,fn);}};
 const elements=new Map([['world',canvas]]);
 const createElement=()=>({style:{},textContent:'',className:'',disabled:false,
  append(){},replaceChildren(){},addEventListener(){},setAttribute(){},
  classList:{toggle(){}},scrollTop:0,getContext:()=>staticCtx});
 const document={createElement:tag=>tag==='canvas'?
   {width:0,height:0,getContext:()=>staticCtx}:createElement(),
  createTextNode:s=>({textContent:s}),querySelectorAll:()=>[],
  getElementById(id){
   if(!elements.has(id))elements.set(id,createElement());
   return elements.get(id);
  }};
 const window={addEventListener(type,fn){events.set('window:'+type,fn);},
  confirm:()=>true,location:{reload(){}}};
 const context={document,window,console,requestAnimationFrame(fn){frames.push(fn);},setInterval(){},
  performance:{now:()=>0}, URLSearchParams, AbortSignal,
  location:options.serverMode?{search:'?world=server'}:undefined,
  localStorage:{
   getItem:k=>saved.get(k)||null,
   setItem(k,v){saved.set(k,v);},
   removeItem(k){saved.delete(k);}
  },fetch:options.fetch||(async()=>({ok:true,json:async()=>({connected:false})}))};
 const source=['pixel-art.js','frontier.js','construction.js','biology.js','crafting.js','cognition.js','agency.js','emergence.js',
  'civilization.js','receipts.js','activities.js','reservations.js','projects.js','perception.js','evidence-memory.js','world-runtime.js','simulation.js','persistence.js','app.js'].map(path=>
  readFileSync(new URL('../public/'+path,import.meta.url),'utf8')).join('\n');
 vm.runInNewContext(source+'\n'+
  'globalThis.exposed={state,step,pathfind,moveTo,position,setAction,completeActivity,'+
  'availableActivities,backgroundOptions,sceneFor,save,validSavedPath,drawWorld,drawConstructionProjection,'+
  'updateMovement,clientToTile,setZoom,setZ,peerExchange,renderChat,selectNpc,tick,scheduleIdleAgents,survivalReflex,deliberate,activity,modelDecisionBasis,modelChoiceStillRelevant,Reservations,Projects,pollServerWorld,controlServerWorld};',context);
 const launchedSpeed=context.exposed.state.speed;
 // Most tests explicitly exercise a one-minute-per-second physics fixture,
 // independently from the user-facing default playback preference.
 context.exposed.state.speed=options.fixtureSpeed??60;
 return {...context.exposed,launchedSpeed,saved,events,elements,counters,frames};
}
test('fresh start contains five distinct independent founders, no player, no village',()=>{
 const b=makeBrowser();
 assert.equal(b.state.npcs.length,5);
 assert.equal(b.state.world.structures.length,0);
 assert.equal(b.state.player,undefined);
 assert.equal(b.state.nextPersonId,6);
 assert.ok(b.state.npcs.every(n=>n.knowledge.recipes.length===0));
 assert.ok(b.counters.staticRects>100,'Natural terrain rendered');
});
test('rendering cannot change world state, and camera is observer-only',()=>{
 const b=makeBrowser();
 const before=JSON.stringify(b.state.world);
 b.drawWorld();b.drawWorld();
 assert.equal(JSON.stringify(b.state.world),before);
 assert.ok(b.counters.screenImages>=2);
 const actor=b.state.npcs[0],x=actor.x,y=actor.y;
 b.events.get('window:keydown')({key:'w',preventDefault(){}});
 b.step(.2);
 assert.equal(actor.x,x);assert.equal(actor.y,y,
  'Camera controls must not move an inhabiting character');
});
test('toroidal A* pathfinding crosses east-west seam in one step',()=>{
 const b=makeBrowser(),w=b.state.world;
 let y=-1;
 for(let row=0;row<w.height;row++){
  if(b.pathfind({x:0,y:row,z:0},{x:w.width-1,y:row,z:0}).length===1){
   y=row;break;
  }
 }
 assert.notEqual(y,-1,'At least one traversable horizontal seam');
});
test('grid movement changes tile only after time cost, independent of frame size',()=>{
 const b=makeBrowser(),n=b.state.npcs[0],w=b.state.world;
 const neighbor=b.pathfind(n,{x:(n.x+1)%w.width,y:n.y,z:0});
 const choices=neighbor.length===1?neighbor:
  b.pathfind(n,{x:n.x,y:(n.y+1)%w.height,z:0});
 assert.equal(choices.length,1);
 const target=choices[0],origin={x:n.x,y:n.y};
 assert.equal(b.moveTo(n,target),true);
 b.step(.01);
 assert.equal(n.x,origin.x);assert.equal(n.y,origin.y);
 b.step(.3);
 assert.equal(n.x,target.x);assert.equal(n.y,target.y);
});
test('an action is time-costed and consumes actual stock only at completion',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 const source=b.state.world.nodes.find(p=>p.kind==='food'&&p.stock>=2);
 assert.ok(source);
 n.x=source.x;n.y=source.y;n.path=[];
 const before=source.stock,food=n.inventory.food;
 assert.equal(b.setAction(n,'forage','rein',{forage:1}),true);
 assert.equal(source.stock,before);
 b.step(1);
 assert.equal(source.stock,before);
 b.step(2);
 assert.ok(source.stock<before);assert.ok(n.inventory.food>food);
});
test('a model cannot craft undiscovered recipes, but experimentation can reveal one',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 n.inventory.wood=2;n.inventory.stone=2;n.inventory.fiber=2;
 assert.ok(b.availableActivities(n).some(o=>o.key==='experiment_wood_stone_fiber'));
 assert.ok(!b.backgroundOptions(n).some(o=>o.key==='craft_hatchet'));
 assert.equal(b.setAction(n,'experiment_wood_stone_fiber','rein',{experiment_wood_stone_fiber:1}),true);
 b.step(18);
 assert.ok(n.knowledge.recipes.includes('hatchet'));
 assert.ok(b.availableActivities(n).some(o=>o.key==='craft_hatchet'));
});
test('model context contains personal discoveries but no other actor private physiology',()=>{
 const b=makeBrowser(),[n,other]=b.state.npcs;
 n.knowledge.recipes.push('hatchet');other.needs.hunger=99;
 const text=b.sceneFor(n);
 assert.match(text,/hatchet/);
 assert.doesNotMatch(text,/hunger 99/);
 assert.doesNotMatch(text,/leptin|ghrelin|insulin/);
 assert.match(text,/independent beliefs/);
});
test('monthly boundaries create one newcomer even when a frame skips midnight',()=>{
 const b=makeBrowser(),first=9*1440;
 b.state.clock=first-1;b.state.speed=60;
 const before=b.state.npcs.length;
 b.step(2);
 assert.equal(b.state.npcs.length,before+1);
 assert.equal(b.state.npcs.at(-1).id,'person_6');
 assert.equal(b.state.world.structures.length,0);
 b.step(.5);
 assert.equal(b.state.npcs.length,before+1);
});
test('deaths are permanent; the world persists through population zero',()=>{
 const b=makeBrowser(),w=b.state.world;
 const initial=JSON.stringify(w.terrain);
 for(const n of [...b.state.npcs])assert.equal(
  b.state.dead.length>=0&&n.alive,true);
 for(const n of [...b.state.npcs]){
  n.health=0;
  b.state.clock=1000;
  b.step(.1);
 }
 assert.equal(b.state.npcs.length,0);
 assert.equal(b.state.dead.length,5);
 assert.equal(JSON.stringify(w.terrain),initial);
 b.state.clock=9*1440-1;
 b.step(2);
 assert.equal(b.state.npcs.length,1);
 assert.equal(b.state.npcs[0].id,'person_6');
});
test('saves preserve population, recipe knowledge, deaths and world history',()=>{
 const saved=new Map(),b=makeBrowser({saved});
 const n=b.state.npcs[0];
 n.knowledge.recipes.push('hatchet');
 n.health=67;n.bio.hormones.cortisol=63;
 b.state.world.structures.push({id:'camp_1',type:'campfire',x:n.x,y:n.y});
 b.state.dead.push({id:'person_dead',name:'Late arrival',deathAt:33,cause:'test'});
 b.save();
 const clone=makeBrowser({saved});
 assert.equal(clone.state.npcs.length,5);
 assert.equal(clone.state.npcs[0].knowledge.recipes[0],'hatchet');
 assert.equal(clone.state.npcs[0].health,67);
 assert.equal(clone.state.npcs[0].bio.hormones.cortisol,63);
 assert.equal(clone.state.world.structures.length,1);
 assert.equal(clone.state.dead.length,1);
});
test('obsolete player-controlled saves are not silently imported into a different civilization',()=>{
 const saved=new Map([['ai-npc-cog-v2',JSON.stringify({player:{x:21,y:12},
  npcs:[{id:'mara'}],world:{structures:[{id:'old',type:'shelter',x:21,y:12}]}})]]);
 const b=makeBrowser({saved});
 assert.equal(b.state.npcs.length,5);
 assert.equal(b.state.world.structures.length,0);
 assert.equal(b.state.player,undefined);
});
test('NPC-to-NPC dialogue is witnessed and committed only after a complete valid response',async()=>{
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/peer-exchange'?
  {first:'Shall we share supplies?',second:'I will think about it.',durationMs:5}:
  {connected:true}})});
 const [a,c]=b.state.npcs;
 c.x=a.x;c.y=(a.y+1)%b.state.world.height;
 a.task={key:'socialize',ref:c.id,readyAt:b.state.clock};
 await b.peerExchange(a,c);
 assert.equal(a.peerLog.length,1);assert.equal(c.peerLog.length,1);
 const speakerMemory=a.evidenceMemory.episodes.find(e=>e.type==='interaction');
 const listenerMemory=c.evidenceMemory.episodes.find(e=>e.type==='interaction');
 assert.ok(speakerMemory&&listenerMemory,'Both participants heard the exchange');
 assert.equal(speakerMemory.receiptId,listenerMemory.receiptId);
 assert.equal(speakerMemory.certainty,'reported');
 assert.equal(listenerMemory.certainty,'reported');
 assert.equal(listenerMemory.ref,a.id);
 assert.equal(speakerMemory.ref,c.id);
 assert.equal(c.evidenceMemory.facts.length,0);
 assert.equal(a.task,null);
 assert.equal(a.relationships[c.id],undefined,
  'Speech alone never creates an automatic friendship');
});
test('z-level inspector and coordinate conversions do not move NPCs',()=>{
 const b=makeBrowser(),n=b.state.npcs[0],original={x:n.x,y:n.y,z:n.z};
 b.setZ(-2);
 assert.equal(b.clientToTile(100,100,{left:0,top:0,width:640,height:416}).z,-2);
 b.setZ(20);
 assert.equal(b.state.viewZ,3);
 assert.equal(n.x,original.x);assert.equal(n.y,original.y);assert.equal(n.z,original.z);
});

test('an archived identity in a damaged save cannot return alive',()=>{
 const saved=new Map(),b=makeBrowser({saved});
 b.save();
 const data=JSON.parse(saved.get('ai-npc-cog-v3'));
 data.dead.push({id:data.npcs[0].id,name:data.npcs[0].name,deathAt:data.clock,cause:'test'});
 saved.set('ai-npc-cog-v3',JSON.stringify(data));
 const restored=makeBrowser({saved});
 assert.equal(restored.state.npcs.length,4);
 assert.ok(!restored.state.npcs.some(n=>n.id===data.npcs[0].id));
 assert.ok(restored.state.dead.some(n=>n.id===data.npcs[0].id));
});
test('fixed render tick batches identical logical intervals despite jitter',()=>{
 const a=makeBrowser(),b=makeBrowser();
 a.tick(100);a.tick(150);a.tick(200);a.tick(250);a.tick(300);
 b.tick(100);b.tick(200);b.tick(300);
 assert.equal(a.state.clock,b.state.clock);
 assert.equal(a.state.npcs.length,b.state.npcs.length);
});

test('offline scheduling starts multiple independent NPC tasks without a wall-clock bottleneck',()=>{
 const b=makeBrowser();
 b.state.connected=false;
 for(const n of b.state.npcs){
  n.thoughtAt=b.state.clock;n.action='none';n.task=null;n.plan=null;n.path=[];
 }
 b.scheduleIdleAgents();
 const active=b.state.npcs.filter(n=>n.plan||n.task||n.path.length||n.action!=='none');
 assert.ok(active.length>=3,'Multiple inhabitants should choose work or a persistent purpose');
 assert.ok(active.every(n=>['offline routine','survival instinct','project'].includes(n.source)));
 assert.ok(b.state.npcs.every(n=>n.thoughtAt>b.state.clock));
 b.step(2);
 assert.ok(b.state.npcs.some(n=>n.task||n.path.length||n.action!=='none'),
  'A persistent purpose must begin an actual physical subaction');
});
test('urgent needs act while model inference is busy and use finite world inventory',()=>{
 const b=makeBrowser();
 b.state.connected=true;b.state.backgroundBusy=true;
 const n=b.state.npcs[0];
 n.task=null;n.plan=null;n.path=[];n.action='none';
 n.needs.thirst=85;n.inventory.water=2;
 assert.equal(b.survivalReflex(n),true);
 assert.equal(n.action,'drink');
 assert.equal(n.source,'survival instinct');
 const before=n.inventory.water;
 b.step(2);
 assert.equal(n.inventory.water,before-1,'Physiological action must consume real water');
});
test('urgent reflexes cannot interrupt an existing NPC task',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 n.needs.thirst=95;n.inventory.water=3;
 assert.equal(b.setAction(n,'drink','offline routine'),true);
 const task=n.task;
 b.scheduleIdleAgents();
 assert.equal(n.task,task);
});

test('offline residents spend time together with receipts but no simulated speech',()=>{
 const b=makeBrowser(),[a,other]=b.state.npcs;
 b.state.connected=false;b.state.auto=true;
 for(const n of b.state.npcs){
  n.thoughtAt=b.state.clock+200;n.needs.social=5;
  n.task=null;n.plan=null;n.path=[];n.action='none';
 }
 a.needs.social=95;a.energy=95;a.thoughtAt=b.state.clock;
 other.needs.social=90;other.energy=95;
 other.x=a.x;other.y=a.y;other.z=a.z;
 b.scheduleIdleAgents();
 assert.equal(a.task?.key,'socialize');
 assert.equal(other.peerReservedFor,a.id);
 b.step(4);
 assert.equal(a.peerLog.length,0);
 assert.equal(other.peerLog.length,0);
 assert.ok(b.state.receipts.some(r=>r.action==='socialize'&&
  r.status==='COMPLETED'&&r.actorId===a.id));
 assert.ok(a.needs.social<95);
 assert.ok(other.needs.social<90);
});

test('socially motivated residents approach each other and complete model-generated dialogue',async()=>{
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/peer-exchange'?
  {first:'I found fresh water near the marsh.',second:'We should collect some.',durationMs:8}:
  {connected:true,model:'rein',modelLabel:'Rein-NPC-4B'}})});
 const [a,other]=b.state.npcs;
 b.state.connected=true;
 for(const n of b.state.npcs){
  n.thoughtAt=b.state.clock+100;n.needs.social=5;
  n.task=null;n.plan=null;n.path=[];n.action='none';
 }
 a.needs.social=90;a.thoughtAt=b.state.clock;
 other.x=a.x;other.y=a.y;other.z=a.z;
 b.scheduleIdleAgents();
 assert.equal(a.task?.key,'socialize','An urgent social desire should initiate a real meeting');
 assert.equal(other.peerReservedFor,a.id,'Conversation partner must remain available');
 b.step(4);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.peerLog.length,1,'Both replies were required to complete conversation');
 assert.equal(other.peerLog.length,1);
 assert.ok(a.agency.practice.social>0,'Initiator learns from a real conversation');
 assert.ok(other.agency.practice.social>0,'Responder also learns from the exchange');
 assert.match(a.peerLog[0].first,/fresh water/);
 assert.equal(a.task,null);
 assert.equal(other.peerReservedFor,undefined);
 assert.ok(a.needs.social<90);
});
test('AI context contains inspected object details without sharing them telepathically',()=>{
 const b=makeBrowser(),[a,other]=b.state.npcs;
 a.knowledge.observations.push({id:'observation',kind:'stone',at:b.state.clock,
  text:'An unusual rock formation found by my own eyes'});
 assert.match(b.sceneFor(a),/unusual rock formation/);
 assert.doesNotMatch(b.sceneFor(other),/unusual rock formation/);
});

test('NPC manufacturing takes multiple real simulation steps and survives a save',()=>{
 const saved=new Map(),b=makeBrowser({saved}),npc=b.state.npcs[0];
 b.state.auto=false;
 npc.inventory.fiber=3;
 assert.equal(b.setAction(npc,'craft_cord','rein'),true);
 assert.equal(npc.inventory.cord,0);
 b.step(3);
 assert.ok(npc.workpiece,'Materials must form a persistent unfinished workpiece');
 assert.equal(npc.inventory.fiber,0,'Fiber is committed at the beginning');
 assert.equal(npc.inventory.cord,0,'Starting a job does not finish it');
 for(let i=0;i<30;i++)b.step(1);
 assert.equal(npc.inventory.cord,1);
 assert.equal(npc.workpiece,null);
 assert.equal(npc.craftedItems.filter(item=>item.kind==='cord').length,1);
 b.save();
 const restored=makeBrowser({saved});
 const copy=restored.state.npcs.find(n=>n.id===npc.id);
 assert.equal(copy.inventory.cord,1);
 assert.equal(copy.craftedItems.filter(item=>item.kind==='cord').length,1);
 assert.equal(copy.workpiece,null);
});

test('healthy inhabitants have useful non-rest options without prematurely sleeping',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 n.energy=75;
 const choices=b.availableActivities(n);
 assert.ok(choices.some(o=>o.key==='explore'||o.key==='inspect'||o.key==='forage'));
 assert.equal(choices.some(o=>o.key==='rest'),false,
  'A mildly tired founder must not immediately enter a long rest cycle');
 n.energy=45;
 assert.ok(b.availableActivities(n).some(o=>o.key==='rest'));
});
test('activity diagnostics distinguish decisions, abstentions, accepted work and rejection',async()=>{
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/health'?
  {connected:true,model:'rein',modelLabel:'Rein-NPC-4B'}:
  {action:'none',source:'rein',scores:{none:1}}})});
 const n=b.state.npcs[0],stats=b.activity(n);
 b.state.connected=true;
 await b.deliberate(n);
 assert.equal(stats.decisions,1);
 assert.equal(stats.none,1);
 assert.equal(stats.started,1,'Self-directed autonomy should turn an abstention into work');
 assert.ok(n.plan||n.task,'A legal persistent goal or action must follow abstention');
 assert.equal(n.thoughtAt,b.state.clock+3,
  'Abstention must not postpone the next model decision for 25 minutes');
 assert.match(stats.last,/Started/);
 assert.equal(b.setAction(n,'nonexistent','rein'),false);
 assert.equal(stats.rejected,1);
 n.needs.thirst=60;n.inventory.water=1; // Explicit test fixture, not starter gear.
 assert.equal(b.setAction(n,'drink','rein'),true);
 assert.equal(stats.started,2);
 b.step(2);
 assert.equal(stats.completed,1);
 assert.ok(b.state.receipts.some(r=>r.action==='drink'&&r.status==='COMPLETED'&&
  r.actorId===n.id),'A subsequent plan step may already have started');
});
test('per-NPC activity diagnostics persist safely across save reloads',()=>{
 const saved=new Map(),b=makeBrowser({saved}),n=b.state.npcs[0];
 b.setAction(n,'none','rein');
 b.setAction(n,'unsupported','rein');
 b.save();
 const copy=makeBrowser({saved}).state.npcs.find(p=>p.id===n.id);
 assert.equal(copy.activityStats.none,1);
 assert.equal(copy.activityStats.rejected,1);
 assert.match(copy.activityStats.last,/no longer available/);
});

test('critical thirst interrupts a crafting stage but keeps its committed workpiece',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 b.state.auto=false;
 n.inventory.fiber=3;
 assert.equal(b.setAction(n,'craft_cord','rein'),true);
 b.step(3);
 assert.ok(n.workpiece,'Project was started');
 const workpiece=n.workpiece,recipe=n.workpiece.recipe,stage=n.workpiece.stage;
 n.needs.thirst=96;n.bio.hydrationBudgetMl=150;n.inventory.water=2;
 assert.equal(b.survivalReflex(n),true);
 assert.equal(n.task?.key,'drink');
 assert.equal(n.workpiece,workpiece,'No material duplication or loss on interruption');
 assert.equal(n.workpiece.recipe,recipe);
 assert.equal(n.workpiece.stage,stage);
 assert.equal(n.plan?.key,'craft_project');
 b.step(2);
 assert.equal(n.inventory.water,1,'Real hydration consumes a carried water unit');
 assert.equal(n.needs.thirst<96,true);
 for(let i=0;i<80;i++)b.step(1);
 assert.equal(n.inventory.cord,1,'The paused workpiece must eventually finish');
 assert.equal(n.workpiece,null);
});
test('the model sees recalled personal history without giving it to other inhabitants',()=>{
 const b=makeBrowser(),[a,other]=b.state.npcs;
 a.goal='I need to find the freshwater spring again';
 b.Cognition?.record?.(a,'Only I observed the spring behind the northern trees',100,
  {kind:'observation',salience:5});
 // The model-facing scene is assembled from the NPC personal memory store.
 a.memories.push({text:'Only I observed the spring behind the northern trees',
  kind:'observation',at:100,x:a.x,y:a.y,salience:5});
 assert.match(b.sceneFor(a),/Only I observed the spring/);
 assert.doesNotMatch(b.sceneFor(other),/Only I observed the spring/);
});

test('personally ranked decisions and witnessed beliefs enter the model context before truncation',()=>{
 const b=makeBrowser(),n=b.state.npcs[0],other=b.state.npcs[1];
 const spring=b.state.world.nodes.find(o=>o.kind==='water');
 n.agency.goal={key:'stock_water',startedAt:b.state.clock,
  reason:'security',source:'self-directed goal',progress:1};
 n.agency.beliefs.push({ref:spring.id,kind:'water',x:spring.x,y:spring.y,
  at:b.state.clock,confidence:1,status:'available',stock:3});
 const text=b.sceneFor(n).slice(0,1800);
 assert.match(text,/Personal drives:/);
 assert.match(text,/Current intention: stock_water/);
 assert.match(text,/My witnessed beliefs: water at/);
 assert.doesNotMatch(b.sceneFor(other),/My witnessed beliefs: water at/);
});

test('real browser frame loop advances the displayed clock across scheduled offline work',()=>{
 const b=makeBrowser();
 b.state.connected=false;
 const start=b.state.clock;
 b.tick(1000);
 for(let ms=1050;ms<=16100;ms+=50)b.tick(ms);
 assert.ok(b.state.clock>=start+14,
  'Simulation clock must advance even during NPC scheduling and world rendering');
 assert.match(b.elements.get('worldTime').textContent,/^\d{2}:\d{2}:\d{2}$/);
 assert.ok(b.frames.length>250,'Every browser frame must schedule its successor');
 assert.match(b.elements.get('worldStatus').textContent,/World running|Offline|deliberating/);
});
test('browser clock advances with social demand and never requires an LLM',()=>{
 const b=makeBrowser();
 b.state.connected=false;
 for(const n of b.state.npcs){
  n.needs.social=95;n.energy=98;n.thoughtAt=b.state.clock;
  n.task=null;n.plan=null;n.path=[];n.action='none';
 }
 const start=b.state.clock;
 b.tick(1000);
 for(let ms=1050;ms<=7100;ms+=50)b.tick(ms);
 assert.ok(b.state.clock>start+5);
 assert.notEqual(b.elements.get('worldTime').textContent,'');
});

test('transient canvas failure cannot permanently stop the simulation frame loop',()=>{
 const b=makeBrowser({failScreenDrawOnce:true});
 const first=b.state.clock,initialFrames=b.frames.length;
 b.tick(1000);
 assert.equal(b.frames.length,initialFrames+1,
  'A render error must not kill requestAnimationFrame scheduling');
 for(let ms=1050;ms<=2100;ms+=50)b.tick(ms);
 assert.ok(b.state.clock>first,
  'After a rendering error, the world clock still advances');
 assert.ok(b.frames.length>initialFrames+10);
});

test('at 1x speed the HUD shows advancing seconds even before the minute changes',()=>{
 const b=makeBrowser();
 b.state.speed=1;
 b.tick(1000);
 const initial=b.elements.get('worldTime').textContent;
 for(let ms=1050;ms<=4100;ms+=50)b.tick(ms);
 const after=b.elements.get('worldTime').textContent;
 assert.match(after,/^\d{2}:\d{2}:\d{2}$/);
 assert.notEqual(after,initial,'Visible seconds distinguish slow time from a freeze');
 assert.equal(after.slice(0,5),initial.slice(0,5),
  'A few seconds should not advance an entire simulated minute at 1x');
});

test('transient startup rendering failure cannot prevent the first browser frame',()=>{
 const b=makeBrowser({failStaticDrawOnce:true});
 assert.equal(b.frames.length,1,'Startup must always schedule the first frame');
 const start=b.state.clock;
 b.tick(1000);
 for(let ms=1050;ms<=2100;ms+=50)b.tick(ms);
 assert.ok(b.state.clock>start,'World simulation can run after a startup-art failure');
});

test('fast-forward browser frames keep time advancing with active offline agents',()=>{
 const b=makeBrowser();
 b.state.speed=3600;b.state.connected=false;
 const start=b.state.clock;
 b.tick(1000);
 for(let ms=1050;ms<=4100;ms+=50)b.tick(ms);
 assert.ok(b.state.clock>start+150,
  'Fast-forward world clock must advance despite AI scheduling and HUD rendering');
 assert.ok(b.frames.length>60);
 assert.equal(b.state.paused,false);
});

test('connected inference backlog does not freeze other residents for simulated hours',()=>{
 const b=makeBrowser();
 b.state.connected=true;b.state.backgroundBusy=true;
 const pending=b.state.npcs[0];
 b.state.modelDecisionActor=pending;
 b.state.clock=500;b.state.world.now=500;
 for(const n of b.state.npcs){
  n.thoughtAt=490;n.needs.hunger=20;n.needs.thirst=20;
  n.energy=85;n.task=null;n.plan=null;n.action='none';n.path=[];
 }
 b.scheduleIdleAgents();
 assert.equal(pending.task,null,'Do not overrule the NPC awaiting a model response');
 assert.equal(pending.plan,null);
 for(const n of b.state.npcs.slice(1)){
  assert.ok(n.task||n.plan||n.action==='rest'||n.project,
   n.id+' must be allowed a legal autonomous action while inference is busy');
  assert.ok(n.thoughtAt>500,'Fallback action must be rate-limited in game time');
 }
 assert.equal(b.state.backgroundBusy,true,'Fallback cannot steal the inference lane');
});
test('connected backlog never overrides a fresh model request before the grace period',()=>{
 const b=makeBrowser();
 b.state.connected=true;b.state.backgroundBusy=true;
 b.state.modelDecisionActor=b.state.npcs[0];
 b.state.clock=500;b.state.world.now=500;
 for(const n of b.state.npcs){
  n.thoughtAt=496;n.needs.hunger=20;n.needs.thirst=20;
  n.energy=85;n.task=null;n.plan=null;n.action='none';n.path=[];
 }
 b.scheduleIdleAgents();
 for(const n of b.state.npcs.slice(1))
  assert.equal(n.task,null,'Recent model-eligible resident should retain the model lane');
});

test('watchable initial pace defaults to six-minute days and respects saved preference',()=>{
 const fresh=makeBrowser();
 assert.equal(fresh.launchedSpeed,240);
 const saved=new Map([['ai-npc-cog-speed','120']]);
 assert.equal(makeBrowser({saved}).launchedSpeed,120);
 const invalid=new Map([['ai-npc-cog-speed','400000']]);
 assert.equal(makeBrowser({saved:invalid}).launchedSpeed,240);
});

test('early thirst response drinks only through a completed physical activity',()=>{
 const b=makeBrowser();
 const n=b.state.npcs[0];
 n.needs.thirst=65;n.bio.hydrationBudgetMl=1050;
 n.inventory.water=1;n.task=null;n.plan=null;n.path=[];n.action='none';
 const before=n.bio.hydrationBudgetMl;
 assert.equal(b.survivalReflex(n),true);
 assert.equal(n.task?.key,'drink');
 assert.equal(n.inventory.water,1,'Starting a drink must not consume liquid yet');
 assert.equal(n.bio.hydrationBudgetMl,before,'Starting a drink must not mint hydration');
 b.step(2);
 assert.equal(n.inventory.water,0,'Physical completion consumes one water');
 assert.ok(n.bio.hydrationBudgetMl>before,'Drinking must replenish hydration');
 assert.ok(b.state.receipts.some(r=>r.action==='drink'&&r.status==='COMPLETED'&&
  r.actorId===n.id),'Water effects require an authoritative completed receipt');
});

test('a model decision is rejected if its personal resource target changed during inference',async()=>{
 let resolveDecision;
 const response=new Promise(resolve=>resolveDecision=resolve);
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/decide'?
  response:{connected:true}})});
 b.state.connected=true;
 const n=b.state.npcs[0],source=b.state.world.nodes.find(x=>x.kind==='food'&&x.stock>0);
 assert.ok(source);
 n.x=source.x;n.y=source.y;n.path=[];n.needs.hunger=80;
 assert.ok(b.backgroundOptions(n).some(x=>x.key==='forage'));
 const inFlight=b.deliberate(n);
 source.stock=0;
 resolveDecision({action:'forage',source:'rein',durationMs:100});
 await inFlight;
 assert.equal(b.activity(n).rejected,1);
 assert.equal(b.activity(n).modelStale,1);
 assert.equal(b.activity(n).modelStarted,0);
 assert.equal(n.task,null,'Old target must not create a new activity');
 assert.ok(b.state.receipts.some(x=>x.status==='REJECTED'&&x.action==='forage'));
});

test('new critical physiology supersedes an obsolete pending model decision',async()=>{
 let resolveDecision;
 const response=new Promise(resolve=>resolveDecision=resolve);
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/decide'?
  response:{connected:true}})});
 b.state.connected=true;
 const n=b.state.npcs[0];
 n.inventory.water=1; // The stale-decision fixture assumes a carried drink.
 const waiting=b.deliberate(n);
 n.bio.hydrationBudgetMl=100;n.needs.thirst=96;
 resolveDecision({action:'none',source:'rein',durationMs:100});
 await waiting;
 assert.equal(b.activity(n).rejected,1);
 assert.equal(n.task,null,'Obsolete choice must not interfere with urgent survival');
 assert.equal(b.survivalReflex(n),true);
 assert.equal(n.task?.key,'drink');
});

test('unrelated actors and world receipts do not invalidate a personal model choice',async()=>{
 let resolveDecision;
 const response=new Promise(resolve=>resolveDecision=resolve);
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/decide'?
  response:{connected:true}})});
 b.state.connected=true;
 const [n,other]=b.state.npcs;
 const waiting=b.deliberate(n);
 other.inventory.wood+=1;
 b.state.effectRevision=(b.state.effectRevision||0)+1;
 resolveDecision({action:'none',source:'rein',durationMs:100});
 await waiting;
 assert.equal(b.activity(n).rejected,0,
  'Changes unrelated to this NPC must not waste the shared model slot');
 assert.equal(b.activity(n).decisions,1);
 assert.equal(b.activity(n).modelAbstained,1);
 assert.equal(b.activity(n).modelStarted,0,'Fallback work is not attributed to the model');
 assert.ok(n.task||n.plan,'Accepted none decision should allow self-directed work');
});

test('an incompatible world generator checkpoint is preserved by browser autosave',()=>{
 const initial=makeBrowser();
 initial.save();
 const key='ai-npc-cog-v3';
 const checkpoint=JSON.parse(initial.saved.get(key));
 checkpoint.world.generator.revision+=1;
 const raw=JSON.stringify(checkpoint);
 initial.saved.set(key,raw);
 const reopened=makeBrowser({saved:initial.saved});
 assert.equal(reopened.state.paused,true);
 assert.match(reopened.state.events[0].text,/checkpoint was preserved/);
 reopened.save();
 assert.equal(reopened.saved.get(key),raw);
});

test('connected routine work does not repoll a resident after a saved review',async()=>{
 let calls=0;
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>{
  if(url==='/api/decide'){calls++;return {action:'none',source:'rein'};}
  return {connected:true};
 }})});
 // Finish model-status initialization before simulating the scheduler.
 await new Promise(resolve=>setImmediate(resolve));
 const n=b.state.npcs[0];
 b.state.npcs=[n];b.state.connected=true;n.needs.social=0;n.thoughtAt=b.state.clock;
 for(const type of ['shelter','campfire','workbench','crate'])
  b.state.world.structures.push({id:type+'_1',type,x:n.x,y:n.y});
 b.state.lastDecisionMs=-5000;
 b.scheduleIdleAgents();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);
 assert.equal(n.attention.reviewedAt,b.state.clock);
 b.save();
 const reopened=makeBrowser({saved:b.saved,fetch:async url=>({ok:true,json:async()=>{
  if(url==='/api/decide')calls++;
  return {connected:true};
 }})});
 await new Promise(resolve=>setImmediate(resolve));
 const resident=reopened.state.npcs[0];
 resident.task=null;resident.path=[];resident.travel=null;resident.plan=null;
 resident.project=null;resident.action='none';
 reopened.state.clock+=40;reopened.state.world.now=reopened.state.clock;
 resident.thoughtAt=reopened.state.clock;reopened.state.lastDecisionMs=-5000;
 reopened.scheduleIdleAgents();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1,'No new actor-private cue warrants another model call');
 assert.ok(resident.task||resident.plan||resident.action!=='none','Routine work still starts');
});

test('1x, 60x, 240x and 3600x agree on a physical drink and a calendar arrival',()=>{
 const profiles=[1,60,240,3600].map(speed=>{
  const b=makeBrowser({fixtureSpeed:speed}),s=b.state,n=s.npcs[0];
  s.auto=false;s.clock=9*1440-2;s.world.now=s.clock;
  const water=s.world.nodes.find(node=>node.kind==='water'&&node.stock>=3);
  const before=water.stock;
  Object.assign(n,{x:water.x,y:water.y,z:0});
  n.needs.thirst=90;n.bio.hydrationBudgetMl=500;
  assert.equal(b.setAction(n,'drink_source','test'),true);
  // Every browser frame contributes 50 ms at the selected speed.
  for(let i=0;i<3600/speed;i++)b.step(.05);
  const completed=s.receipts.filter(r=>r.action==='drink_source'&&r.status==='COMPLETED');
  assert.equal(completed.length,1);
  return {clock:s.clock,arrival:s.npcs.find(v=>v.id==='person_6')?.spawnAt,
   alive:s.npcs.length,waterDebited:before-water.stock,held:n.inventory.water,
   actionAt:completed[0].clock,hydration:n.bio.hydrationBudgetMl};
 });
 for(const result of profiles){
  assert.ok(Math.abs(result.clock-(9*1440+1))<.00001);
  assert.equal(result.arrival,9*1440);
  assert.equal(result.alive,6);
  assert.equal(result.waterDebited,1);
  assert.equal(result.held,0);
  assert.ok(Math.abs(result.actionAt-(9*1440-1))<=1.00001);
  assert.ok(Math.abs(result.hydration-profiles[0].hydration)<=2);
 }
});

test('crafting inspector shows the current operation and resident-specific seal evidence',()=>{
 const b=makeBrowser(),[maker,peer]=b.state.npcs;
 maker.workpiece={recipe:'hollow_wood_trial',stage:2};
 maker.evidenceMemory.trials.push({heldWater:false,materialQuality:1});
 b.selectNpc(maker.id);
 assert.match(b.elements.get('npcCrafting').textContent,/3\/3.*Tilt-test seal using one measured freshwater unit/);
 assert.match(b.elements.get('npcCrafting').textContent,/Last trial leaked with binding grade 1\/5/);
 b.selectNpc(peer.id);
 assert.equal(b.elements.get('npcCrafting').textContent,'No workpiece');
 maker.workpiece=null;
 maker.evidenceMemory.trials.push({heldWater:true,materialQuality:3});
 b.selectNpc(maker.id);
 assert.equal(b.elements.get('npcCrafting').textContent,
  'No workpiece · Last trial held water with binding grade 3/5');
 maker.evidenceMemory.comparisons.push({failedQuality:1,passedQuality:3,
  sourceReceiptIds:['receipt_14','receipt_31']});
 b.selectNpc(maker.id);
 assert.match(b.elements.get('npcCrafting').textContent,
  /Inferred comparison: grade 1\/5 leaked, grade 3\/5 held\. Cause uncertain\. Receipts receipt_14, receipt_31/);
 b.selectNpc(peer.id);
 assert.equal(b.elements.get('npcCrafting').textContent,'No workpiece');
});


test('a pending model selection becomes stale when its specific source stock is depleted',()=>{
 const b=makeBrowser(),n=b.state.npcs[0];
 const food=b.state.world.nodes.find(x=>x.kind==='food'&&x.stock>=2);
 assert.ok(food);
 n.x=food.x;n.y=food.y;n.z=food.z||0;n.energy=100;
 const before=b.modelDecisionBasis(n),ref=before.references.forage;
 assert.ok(ref,'Foraging must be a currently legal, perceptible option');
 assert.equal(b.modelChoiceStillRelevant(n,before,'forage'),true);
 const actual=b.state.world.nodes.find(x=>x.id===ref);
 assert.ok(actual);
 actual.stock=0;
 assert.equal(b.modelChoiceStillRelevant(n,before,'forage'),false,
  'A source changed during inference must invalidate the stale command');
});

test('a rival reservation invalidates only the affected physical model affordance',()=>{
 const b=makeBrowser(),[n,peer]=b.state.npcs;
 const wood=b.state.world.nodes.find(x=>x.kind==='wood'&&x.stock>=2);
 assert.ok(wood);
 n.x=wood.x;n.y=wood.y;n.z=wood.z||0;n.energy=100;
 const before=b.modelDecisionBasis(n),ref=before.references.collect_wood;
 assert.ok(ref);
 peer.inventory.stone=10;
 assert.equal(b.modelChoiceStillRelevant(n,before,'collect_wood'),true,
  'Unrelated private inventory changes are not a global world epoch');
 const claim=b.Reservations.claim(b.state,peer.id,'cmd_900',
  [{type:'node',id:ref,kind:'wood',quantity:1}]);
 assert.equal(claim.ok,true);
 assert.equal(b.modelChoiceStillRelevant(n,before,'collect_wood'),false,
  'A concurrent hold on the same finite lot invalidates a pending choice');
});

test('a private belief correction and changed report invalidate only that actor decision',()=>{
 const b=makeBrowser(),[n,other]=b.state.npcs;
 n.agency.beliefs.push({ref:'node_1',kind:'water',x:n.x,y:n.y,
  status:'available',at:b.state.clock,confidence:1,stock:2});
 const original=b.modelDecisionBasis(n);
 other.agency.beliefs.push({ref:'node_2',kind:'wood',x:other.x,y:other.y,
  status:'depleted',at:b.state.clock,confidence:1,stock:0});
 assert.equal(b.modelChoiceStillRelevant(n,original,'none'),true,
  'Another resident\'s evidence is not this actor\'s evidence');
 n.agency.beliefs[0].status='depleted';
 assert.equal(b.modelChoiceStillRelevant(n,original,'none'),false);
 const next=b.modelDecisionBasis(n);
 n.evidenceMemory.claims.push({id:'claim_test',sourceId:'node_1',
  speakerId:other.id,kind:'water',status:'contradicted',at:b.state.clock});
 assert.equal(b.modelChoiceStillRelevant(n,next,'none'),false,
  'A material reported claim revision must reject the old decision basis');
});

test('model responses expire in simulated time and never resurrect a dead actor',()=>{
 const b=makeBrowser(),n=b.state.npcs[0],basis=b.modelDecisionBasis(n);
 b.state.clock+=46;
 assert.equal(b.modelChoiceStillRelevant(n,basis,'none'),false);
 const fresh=b.modelDecisionBasis(n);
 n.alive=false;
 assert.equal(b.modelChoiceStillRelevant(n,fresh,'none'),false);
});

test('an urgent survival action wins over a slow outstanding model choice',async()=>{
 let answer;
 const fetch=async path=>path==='/api/decide'?
  new Promise(resolve=>{answer=resolve;}):
  {ok:true,json:async()=>({connected:true})};
 const b=makeBrowser({fetch}),n=b.state.npcs[0];
 b.state.connected=true;
 n.task=null;n.plan=null;n.path=[];n.action='none';n.needs.thirst=30;
 const pending=b.deliberate(n);
 assert.equal(typeof answer,'function','Model response is held in flight');
 n.needs.thirst=96;n.bio.hydrationBudgetMl=150;n.inventory.water=2;
 assert.equal(b.survivalReflex(n),true);
 assert.equal(n.task?.key,'drink');
 answer({ok:true,json:async()=>({action:'none',source:'rein',scores:{none:1}})});
 await pending;
 assert.equal(n.task?.key,'drink','Stale model deliberation cannot displace urgent survival');
 assert.ok(b.activity(n).rejected>=1);
 assert.ok(b.state.receipts.some(x=>x.status==='REJECTED'&&x.source==='model'));
});
test('construction drawings are a pure overlay; built tiles and unfinished plans are distinguishable',()=>{
 const b=makeBrowser(),n=b.state.npcs[0],w=b.state.world;
 const point={x:n.x,y:n.y,z:n.z||0},other=b.pathfind(n,{
  x:(n.x+1)%w.width,y:n.y,z:n.z||0})[0]||
  b.pathfind(n,{x:n.x,y:(n.y+1)%w.height,z:n.z||0})[0];
 assert.ok(other,'Need a visible walkable construction cell');
 // This is a rendering-only fixture; physical authority is tested separately.
 const bp=w.construction.blueprints;
 bp.push({id:'bp_901',kind:'floor',material:'wood',...point,
  actorId:n.id,plannedAt:b.state.clock,status:'PLANNED'});
 const original=JSON.stringify(w.construction);
 const before=b.counters.screenRects;
 b.drawWorld();
 const baseline=b.counters.screenRects-before;
 assert.equal(JSON.stringify(w.construction),original,
  'A drawn blueprint can never become a finished building');
 bp.length=0;
 w.construction.tiles.push({id:'tile_901',blueprintId:'bp_901',kind:'wall',
  material:'wood',...other,actorId:n.id,builtAt:b.state.clock,
  status:'BUILT',commandId:'cmd_901'});
 const builtState=JSON.stringify(w.construction);
 const later=b.counters.screenRects;
 b.drawWorld();
 assert.ok(b.counters.screenRects-later>baseline,
  'A completed vector wall adds visible geometry beyond the base world draw');
 assert.equal(JSON.stringify(w.construction),builtState,
  'Drawing a wall must not modify its receipt or collision state');
});

test('the actual model request exposes a tested flask method only to its founder',async()=>{
 const requests=[];
 const b=makeBrowser({fetch:async (url,init)=>{
  if(url==='/api/decide')requests.push(JSON.parse(init.body));
  return {ok:true,json:async()=>({connected:true,action:'not_a_legal_action',source:'rein'})};
 }});
 const s=b.state,[maker,peer]=s.npcs;
 s.npcs=[maker,peer];
 s.auto=false;
 s.connected=true;
 const requestFor=async actor=>{
  const count=requests.length;
  await b.deliberate(actor);
  assert.equal(requests.length,count+1);
  return requests.at(-1);
 };
 const hasAction=(request,key)=>request.options.some(x=>x.key===key);
 for(const n of [maker,peer]){
  assert.ok(Object.values(n.inventory).every(count=>count===0));
  const request=await requestFor(n);
  assert.match(request.scene,/Known crafting methods: No discovered crafting methods/);
  assert.equal(hasAction(request,'craft_flask'),false);
 }
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=4&&
  b.pathfind(maker,{x:x.x,y:x.y,z:x.z||0}).length);
 assert.ok(spring);
 Object.assign(maker,{x:spring.x,y:spring.y,z:spring.z||0,energy:100});
 const w=s.world;
 const nearby=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({
  x:(spring.x+dx+w.width)%w.width,y:(spring.y+dy+w.height)%w.height,z:maker.z
 })).find(tile=>b.pathfind(maker,tile).length===1);
 assert.ok(nearby);
 Object.assign(peer,nearby);
 const supply=actor=>{
  Object.assign(actor.inventory,{wood:1,cord:1,blade:1});
  for(const kind of ['cord','blade']){
   if(!actor.craftedItems.some(x=>x.kind===kind))
    actor.craftedItems.push({kind,quality:2,maker:actor.id,craftedAt:s.clock,
     method:kind,materialQuality:2});
  }
 };
 supply(maker);
 assert.equal(b.setAction(maker,'craft_hollow_wood_trial','rein'),true);
 b.step(56);
 assert.equal(maker.inventory.flask,1);
 assert.ok(s.receipts.some(r=>r.actorId===maker.id&&r.action==='craft_stage'&&
  r.status==='COMPLETED'&&r.delta.knowledge?.learnedMethods?.includes('flask')));
 supply(maker);
 supply(peer);
 assert.deepEqual(['wood','cord','blade'].map(k=>maker.inventory[k]),
  ['wood','cord','blade'].map(k=>peer.inventory[k]));
 const own=await requestFor(maker),other=await requestFor(peer);
 assert.match(own.scene,/Known crafting methods: flask\./);
 assert.equal(hasAction(own,'craft_flask'),true);
 assert.match(other.scene,/Known crafting methods: No discovered crafting methods/);
 assert.equal(hasAction(other,'craft_flask'),false);
 assert.match(other.scene,new RegExp('Visible people: '+maker.name+' at'));
 assert.doesNotMatch(other.scene,/learned.*flask|flask-sealing instructions/i);
 assert.equal(b.availableActivities(peer).some(x=>x.key==='craft_flask'),false);
 assert.equal(b.setAction(peer,'craft_flask','rein'),false);
});

test('a pending personal review gives a founder with no model request priority over a repeat caller',async()=>{
 const requests=[];
 let reply;
 const b=makeBrowser({fetch:async (url,init)=>{
  if(url!=='/api/decide')return {ok:true,json:async()=>({connected:true})};
  requests.push(JSON.parse(init.body));
  return new Promise(resolve=>{reply=resolve;});
 }});
 await new Promise(resolve=>setImmediate(resolve));
 const s=b.state,[repeat,first]=s.npcs;
 s.npcs=[repeat,first];
 for(const n of s.npcs){
  n.energy=100;n.needs.social=0;n.needs.thirst=20;n.needs.hunger=20;
  n.bio.hydrationBudgetMl=2400;
  for(const type of ['shelter','campfire','workbench','crate'])
   s.world.structures.push({id:type+'_'+n.id,type,x:n.x,y:n.y,maker:n.id});
 }
 repeat.thoughtAt=s.clock-1;
 repeat.attention={reviewedThrough:0,reviewedAt:null,requestedAt:s.clock-31};
 first.thoughtAt=s.clock;
 s.lastDecisionMs=-5000;
 b.scheduleIdleAgents();
 assert.equal(s.modelDecisionActor,first);
 assert.equal(requests.length,1);
 assert.equal(requests[0].persona,first.personality);
 b.scheduleIdleAgents();
 assert.equal(requests.length,1,'The shared model lane stays serialized');
 reply({ok:true,json:async()=>({action:'not_offered',source:'rein'})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(b.activity(first).modelRefused,1);
 const replyTrace=s.receipts.find(r=>r.actorId===first.id&&r.status==='DECIDED');
 assert.equal(replyTrace?.action,'invalid_selection');
 assert.ok(s.receipts.some(r=>r.status==='REJECTED'&&r.context?.decisionId===replyTrace.id));
 assert.equal(s.receipts.some(r=>r.action==='not_offered'),false);
 assert.equal(b.activity(first).modelStale,0);
 assert.equal(first.attention.reviewedAt,null);
 b.save();
 const restored=makeBrowser({saved:b.saved});
 const same=restored.state.npcs.find(n=>n.id===first.id);
 assert.equal(b.activity(same).modelRefused,1);
 assert.equal(same.attention.requestedAt,s.clock);
});

test('a legal model action is counted only after it starts through the world runtime',async()=>{
 const b=makeBrowser({fetch:async url=>({ok:true,json:async()=>url==='/api/decide'?
  {action:'forage',source:'rein'}:{connected:true}})});
 await new Promise(resolve=>setImmediate(resolve));
 const s=b.state,n=s.npcs[0];
 const source=s.world.nodes.find(x=>x.kind==='food'&&x.stock>=2);
 assert.ok(source);
 Object.assign(n,{x:source.x,y:source.y,z:source.z||0,energy:100});
 n.needs.hunger=80;
 const initial=source.stock;
 await b.deliberate(n);
 assert.equal(b.activity(n).modelStarted,1);
 assert.equal(b.activity(n).decisions,1);
 assert.equal(n.task?.key,'forage');
 assert.equal(source.stock,initial,'An accepted model decision has not executed its physical effects');
 const decision=s.receipts.find(r=>r.actorId===n.id&&r.action==='forage'&&r.status==='DECIDED');
 const command=n.task.commandId;
 assert.ok(decision);
 assert.equal(s.receipts.find(r=>r.commandId===command&&r.status==='ACCEPTED')?.context.decisionId,decision.id);
 b.save();
 const restored=makeBrowser({saved:b.saved});
 restored.state.auto=false;
 restored.step(2);
 const result=restored.state.receipts.find(r=>r.commandId===command&&r.status==='COMPLETED');
 assert.equal(result?.context.decisionId,decision.id);
 assert.ok(result.delta.nodeStock.some(change=>change.key===source.id&&change.delta<0));
});

test('a blocked water project leaves the resident free to forage in both browser modes',async()=>{
 for(const connected of [false,true]){
  let modelCalls=0;
  const b=makeBrowser({fetch:async url=>{
   if(url==='/api/decide')modelCalls++;
   return {ok:true,json:async()=>({connected})};
  }});
  await new Promise(resolve=>setImmediate(resolve));
  const s=b.state,n=s.npcs[0];
  s.npcs=[n];
  const source=s.world.nodes.find(x=>x.kind==='food'&&x.stock>=2);
  assert.ok(source);
  Object.assign(n,{x:source.x,y:source.y,z:source.z||0,energy:100,thoughtAt:s.clock});
  Object.assign(n.needs,{hunger:64,thirst:20,social:0,curiosity:0});
  n.bio.hydrationBudgetMl=2400;
  const p=b.Projects.create(s,n,'water_vessel',false);
  p.status='BLOCKED';p.nextAt=s.clock+60;
  const wake=p.nextAt,stock=source.stock;
  s.lastDecisionMs=-5000;
  b.scheduleIdleAgents();
  assert.equal(n.task?.key,'forage');
  assert.equal(n.source,'offline routine');
  assert.equal(source.stock,stock);
  b.step(2);
  assert.ok(source.stock<stock);
  assert.equal(n.project,p);
  assert.equal(p.status,'BLOCKED');
  assert.equal(p.nextAt,wake);
  assert.equal(modelCalls,0);
 }
});

test('two server-world tabs share playback state without stepping or saving locally',async()=>{
 const legacy=makeBrowser();
 const {clock,npcs,dead,world,events}=legacy.state;
 const snapshot=JSON.parse(JSON.stringify({clock,npcs,dead,world,events,receipts:[]}));
 let paused=false,speed=240;
 const requests=[];
 const fetch=async (route,options)=>{
  requests.push(route);
  if(route==='/api/world/control'){
   const patch=JSON.parse(options.body);
   paused=patch.paused??paused;speed=patch.speed??speed;
  }
  return {ok:true,json:async()=>JSON.parse(JSON.stringify({
   snapshot,day:1,paused,speed,auto:true,warning:null
  }))};
 };
 const saved=new Map([['ai-npc-cog-v3','existing browser save']]);
 const tabs=[makeBrowser({serverMode:true,fetch,saved}),
  makeBrowser({serverMode:true,fetch,saved})];
 await new Promise(resolve=>setImmediate(resolve));
 for(const tab of tabs){
  assert.equal(tab.state.npcs.length,5);
  tab.step(60);tab.save();
  assert.equal(tab.state.clock,clock);
  assert.equal(tab.state.connected,false);
 }
 await tabs[0].controlServerWorld({paused:true,speed:120});
 await tabs[1].pollServerWorld();
 for(const tab of tabs){
  assert.equal(tab.state.paused,true);
  assert.equal(tab.state.speed,120);
  assert.equal(tab.state.clock,clock);
 }
 assert.equal(saved.get('ai-npc-cog-v3'),'existing browser save');
 assert.deepEqual(requests,['/api/world','/api/world','/api/world/control','/api/world']);
});

test('a server-world viewer stays disconnected when its world endpoint fails',async()=>{
 const b=makeBrowser({serverMode:true,fetch:async()=>({
  ok:false,json:async()=>({error:'No readable world checkpoint'})
 })});
 await new Promise(resolve=>setImmediate(resolve));
 b.step(60);b.tick(2000);
 assert.equal(b.state.clock,490);
 assert.equal(b.state.npcs.length,0);
 assert.match(b.elements.get('worldStatus').textContent,/No readable world checkpoint/);
 assert.equal(b.saved.size,0);
});
