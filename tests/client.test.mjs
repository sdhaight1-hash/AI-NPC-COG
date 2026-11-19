import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function makeBrowser(options={}){
 const events=new Map(),saved=options.saved||new Map();
 const counters={staticRects:0,screenImages:0};
 const frames=[];
 let failScreenDraw=!!options.failScreenDrawOnce;
 let failStaticDraw=!!options.failStaticDrawOnce;
 const fakeCtx=kind=>new Proxy({
  measureText:s=>({width:String(s).length*8}),
  fillRect(){if(kind==='static'){
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
  performance:{now:()=>0},
  localStorage:{
   getItem:k=>saved.get(k)||null,
   setItem(k,v){saved.set(k,v);},
   removeItem(k){saved.delete(k);}
  },fetch:options.fetch||(async()=>({ok:true,json:async()=>({connected:false})}))};
 const source=['pixel-art.js','frontier.js','biology.js','crafting.js','cognition.js','agency.js','emergence.js',
  'civilization.js','receipts.js','activities.js','reservations.js','projects.js','perception.js','evidence-memory.js','world-runtime.js','simulation.js','persistence.js','app.js'].map(path=>
  readFileSync(new URL('../public/'+path,import.meta.url),'utf8')).join('\n');
 vm.runInNewContext(source+'\n'+
  'globalThis.exposed={state,step,pathfind,moveTo,position,setAction,completeActivity,'+
  'availableActivities,backgroundOptions,sceneFor,save,validSavedPath,drawWorld,'+
  'updateMovement,clientToTile,setZoom,setZ,peerExchange,renderChat,selectNpc,tick,scheduleIdleAgents,survivalReflex,deliberate,activity};',context);
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
 n.needs.thirst=60;
 assert.equal(b.setAction(n,'drink','rein'),true);
 assert.equal(stats.started,2);
 b.step(2);
 assert.equal(stats.completed,1);
 assert.match(stats.last,/Completed/);
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
