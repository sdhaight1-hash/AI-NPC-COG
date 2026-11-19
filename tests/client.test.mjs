import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeBrowser(options={}) {
  const events = new Map();
  const saved = options.saved || new Map();
  const counters = { staticRects: 0, screenImages: 0 };
  const fakeContext = type => new Proxy({
    measureText: str => ({ width: String(str).length * 8 }),
    fillRect: (...args) => {
      if(type==='static') counters.staticRects++;
    },
    drawImage: () => {
      if(type==='screen') counters.screenImages++;
    }
  }, {
    get(target, key) { return target[key] ?? (() => {}); },
    set(target, key, value) { target[key] = value; return true; }
  });
  const mapCtx=fakeContext('screen'), staticCtx=fakeContext('static'), spriteCtx=fakeContext('sprite');
  const canvas={
    width: 640,height:416,
    getContext:()=>mapCtx,
    addEventListener(name,fn){ events.set('canvas:'+name,fn); }
  };
  const elements = new Map([['world', canvas]]);
  const createElement = tag => {
    if(tag==='canvas')return {width:0,height:0,getContext(){return this.width===16?spriteCtx:staticCtx;}};
    return {className:'',style:{},textContent:'',disabled:false,
      append(){},replaceChildren(){},addEventListener(){},
      classList:{toggle(){}},setAttribute(){},scrollTop:0};
  };
  const doc = {
    createElement,
    createTextNode: str=>({textContent:str}),
    querySelectorAll:()=>[],
    getElementById(id) {
      if(!elements.has(id))elements.set(id,createElement('div'));
      return elements.get(id);
    }
  };
  const win = {
    addEventListener(name,fn){events.set('window:'+name,fn);},
    confirm:()=>true,location:{reload(){}}
  };
  const context = {
    document:doc,window:win,console,
    localStorage:{getItem:key=>saved.get(key)||null,setItem(key,val){saved.set(key,val);},removeItem(key){saved.delete(key);}},
    requestAnimationFrame(){},setInterval(){},
    performance:{now:()=>0},
    fetch:options.fetch || (async()=>({ok:true,json:async()=>({connected:false})}))
  };
  const art=readFileSync(new URL('../public/pixel-art.js',import.meta.url),'utf8');
  const physics=readFileSync(new URL('../public/physics.js',import.meta.url),'utf8');
  const frontier=readFileSync(new URL('../public/frontier.js',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../public/emergence.js',import.meta.url),'utf8');
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInNewContext(art+'\n'+physics+'\n'+frontier+'\n'+rules+'\n'+source +
    '\nglobalThis.__expose={state,step,drawWorld,setAction,pathfind,backgroundOptions,save,validSavedPath,setZoom,clientToTile,updateCamera,availableActivities,completeActivity,sendMessage,advancePlan,peerExchange,updateMovement,ensureBody,moveTo,playerAction,playerOptions};',context);
  return { ...context.__expose, counters, events, saved, elements };
}

test('cached static map is painted once, while dynamic frames reuse it',()=>{
  const browser=makeBrowser();
  const before=browser.counters.staticRects;
  assert.ok(before>100,'Map should be initialized');
  browser.drawWorld();browser.drawWorld();
  assert.equal(browser.counters.staticRects,before,'Static tiles should not be redrawn each frame');
  assert.equal(browser.counters.screenImages,18,
    'Each frame draws one cached map, seven residents and the fog overlay');
});

test('held WASD moves continuously rather than resetting movement paths',()=>{
  const browser=makeBrowser();
  // Physical NPC collisions are real: start in the unobstructed lane instead of
  // running directly into Mara, who begins immediately north of the player.
  browser.state.player.x=23;browser.state.player.y=12;
  browser.state.player.body.x=23.5;browser.state.player.body.y=12.5;
  browser.events.get('window:keydown')({key:'w',preventDefault(){}});
  for(let i=0;i<5;i++)browser.step(0.2);
  assert.ok(browser.state.player.y < 11,
    'Holding W should move multiple tiles rather than repeatedly resetting to the same tile');
  browser.events.get('window:keyup')({key:'w'});
  const original=browser.state.player.y;
  for(let i=0;i<4;i++)browser.step(0.2);
  assert.equal(browser.state.player.y,original);
});

test('none action preserves the prior NPC goal',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs[0];
  npc.goal='Visiting the square';
  browser.setAction(npc,'none','offline routine',null);
  browser.setAction(npc,'none','offline routine',null);
  assert.equal(npc.goal,'Visiting the square');
});

test('an unfinished chat request is never written to persistent state',()=>{
  const browser=makeBrowser();
  browser.state.npcs[0].chat.push(
    {role:'player',content:'unfinished request',source:'pending'},
    {role:'npc',content:'previous completed response',source:'rein'}
  );
  browser.save();
  const stored=JSON.parse(browser.saved.get('ai-npc-cog-v2'));
  assert.equal(stored.npcs[0].chat.length,1);
  assert.equal(stored.npcs[0].chat[0].content,'previous completed response');
});

test('no agent has a predefined occupation, employer or workplace',()=>{
  const browser=makeBrowser();
  for(const npc of browser.state.npcs){
    assert.equal(npc.role,undefined);
    assert.equal(npc.work,undefined);
    assert.equal(npc.home,undefined);
    assert.ok(!browser.backgroundOptions(npc).some(item=>item.key==='work'));
    assert.ok(Object.values(npc.skills).every(value=>value===0));
  }
});

test('saved NPC movement routes are contiguous and never cross buildings',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs.find(n=>n.id==='nico');
  assert.equal(browser.validSavedPath([{x:8,y:11},{x:8,y:10}],npc),true);
  assert.equal(browser.validSavedPath([{x:8,y:9}],npc),false,'reject teleporting routes');
  assert.equal(browser.validSavedPath([{x:9,y:12},{x:10,y:12}],npc),true);
  assert.equal(browser.validSavedPath([{x:8,y:11},{x:8,y:10},{x:8,y:9},{x:8,y:8},{x:8,y:7}],npc),
    false,'reject a building tile');
});

test('zoom changes viewport mapping but not player world coordinates',()=>{
  const browser=makeBrowser();
  const original={x:browser.state.player.x,y:browser.state.player.y};
  const rect={left:0,top:0,width:640,height:416};
  const point={x:(original.x+.5)*16,y:(original.y+.5)*16};
  assert.equal(browser.clientToTile(point.x,point.y,rect).x,original.x);
  browser.setZoom(2);
  const centered=browser.clientToTile(320,208,rect);
  assert.equal(centered.x,original.x);
  assert.equal(centered.y,original.y);
  browser.setZoom(3);
  assert.equal(browser.state.player.x,original.x);
  assert.equal(browser.state.player.y,original.y);
  assert.equal(browser.state.zoom,3);
  browser.setZoom(99);
  assert.equal(browser.state.zoom,3,'Zoom clamps to the renderer limit');
});

test('pixel-art scene is self-contained, deterministic and supports sprite directions',()=>{
  const browser=makeBrowser();
  const sprites=browser.state.npcs;
  assert.equal(sprites.length,6);
  const [npc]=sprites;
  const route=browser.pathfind(npc,{x:12,y:11});
  assert.ok(route.length>0,'Original world paths remain functional');
  assert.ok(browser.counters.staticRects>300,'Procedural terrain uses detailed pixel art');
  browser.drawWorld();
  npc.facing='left';
  browser.drawWorld();
  npc.facing='up';
  browser.drawWorld();
  assert.ok(browser.counters.screenImages>=3,'All directions remain drawable');
});

test('agents can gather finite food, eat it, and build an object from earned materials',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs.find(n=>n.id==='rowan');
  const node=browser.state.world.nodes.find(n=>n.id==='berry_1');
  const previous=node.stock;
  npc.x=node.x;npc.y=node.y;
  const before=npc.inventory.food;
  assert.equal(browser.setAction(npc,'forage','rein',{forage:1}),true);
  assert.equal(npc.inventory.food,before+2);
  assert.equal(node.stock,previous-2);
  const hunger=npc.needs.hunger;
  assert.equal(browser.setAction(npc,'eat','rein',{eat:1}),true);
  assert.ok(npc.needs.hunger<hunger,'Eating must reduce actual hunger');
  npc.inventory.wood=2;npc.inventory.stone=1;
  const count=browser.state.world.structures.length;
  assert.equal(browser.setAction(npc,'build_fire','rein',{build_fire:1}),true);
  assert.equal(browser.state.world.structures.length,count+1);
  assert.equal(npc.inventory.wood,0);
  assert.equal(npc.inventory.stone,0);
  browser.save();
  const stored=JSON.parse(browser.saved.get('ai-npc-cog-v2'));
  assert.equal(stored.world.structures.length,count+1);
  assert.equal(stored.npcs.find(n=>n.id==='rowan').inventory.wood,0);
});

test('inference options change with actual resources and skills follow actions, not assigned jobs',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs.find(n=>n.id==='jonas');
  const berry=browser.state.world.nodes.find(n=>n.kind==='food'&&n.stock>0);
  const options=browser.backgroundOptions(npc).map(v=>v.key);
  assert.ok(options.includes('forage'));
  assert.ok(!options.includes('build_fire'),'Building requires acquired materials');
  for(const node of browser.state.world.nodes)if(node.kind==='food')node.stock=0;
  const depleted=browser.backgroundOptions(npc).map(v=>v.key);
  assert.ok(!depleted.includes('forage'));
  assert.equal(npc.skills.foraging,0);
});

test('proximity alone does not manufacture a friendship',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const mara=browser.state.npcs.find(n=>n.id==='mara');
 const jonas=browser.state.npcs.find(n=>n.id==='jonas');
 jonas.x=mara.x;jonas.y=mara.y;
 for(let i=0;i<20;i++)browser.step(0.05);
 assert.equal(mara.relationships[jonas.id],undefined);
 assert.equal(jonas.relationships[mara.id],undefined);
});

test('earned skills only reflect completed actions, never their starting personality',()=>{
 const browser=makeBrowser();
 const npc=browser.state.npcs.find(n=>n.id==='asha');
 assert.ok(Object.values(npc.skills).every(v=>v===0));
 const forest=browser.state.world.nodes.find(n=>n.id==='tree_3');
 npc.x=forest.x;npc.y=forest.y;
 const stock=forest.stock;
 assert.equal(browser.setAction(npc,'collect_wood','rein',null),true);
 assert.equal(forest.stock,stock-2);
 assert.equal(npc.skills.gathering,1);
 assert.equal(npc.skills.building,0);
});

test('a player conversation pauses and resumes an NPC resource plan',async()=>{
 const browser=makeBrowser();
 browser.state.connected=false;
 const npc=browser.state.npcs.find(n=>n.id==='asha');
 const target=browser.state.world.nodes.find(n=>n.id==='tree_3');
 const path=browser.pathfind(npc,target);
 assert.ok(path.length>0);
 npc.path=path;
 npc.task={key:'collect_wood',ref:target.id};
 npc.action='collect_wood';
 npc.goal='Collecting wood';
 browser.state.player.x=npc.x;browser.state.player.y=npc.y;
 browser.state.selected=npc.id;
 browser.elements.set('messageInput',{value:'Hello there'});
 await browser.sendMessage({preventDefault(){}});
 assert.equal(npc.task.key,'collect_wood','Conversation must not erase active plans');
 assert.equal(npc.path.length,path.length);
 assert.equal(npc.goal,'Collecting wood');
 assert.equal(npc.chat.at(-1).role,'npc');
});

test('repeated practice makes a gathering specialist measurably better',()=>{
 const browser=makeBrowser();
 const npc=browser.state.npcs.find(n=>n.id==='asha');
 const node=browser.state.world.nodes.find(n=>n.id==='tree_3');
 npc.x=node.x;npc.y=node.y;
 npc.skills.gathering=3;
 const before=node.stock;
 assert.equal(browser.setAction(npc,'collect_wood','rein',null),true);
 assert.equal(npc.inventory.wood,3,'Learned gathering must yield more than base two units');
 assert.equal(node.stock,before-3,'Extra yield must still deplete the shared resource');
});


test('Rein always receives at most ten legal action choices, even with planning',()=>{
 const browser=makeBrowser();
 const npc=browser.state.npcs.find(n=>n.id==='mara');
 const options=browser.backgroundOptions(npc);
 assert.ok(options.length<=10);
 assert.equal(options.at(-1).key,'none');
 assert.ok(options.some(x=>x.key==='stock_food'));
 assert.ok(options.some(x=>x.key==='make_campfire'));
 assert.ok(!options.some(x=>x.key==='work'),'No occupational scheduling');
});

test('an agent can pursue a self-chosen goal through separate real resource actions',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const npc=browser.state.npcs.find(n=>n.id==='mara');
 assert.equal(browser.setAction(npc,'make_campfire','rein',{make_campfire:1}),true);
 assert.equal(npc.plan.key,'make_campfire');
 assert.equal(npc.plan.steps,0);
 browser.advancePlan(npc);
 assert.equal(npc.task.key,'collect_wood');
 const wood=browser.state.world.nodes.find(node=>node.id===npc.task.ref);
 npc.x=wood.x;npc.y=wood.y;npc.path=[];npc.travel=0;
 browser.completeActivity(npc);
 assert.equal(npc.inventory.wood,2);
 assert.equal(npc.plan.steps,1);
 browser.state.clock+=2;
 browser.advancePlan(npc);
 assert.equal(npc.task.key,'collect_stone');
 const stone=browser.state.world.nodes.find(node=>node.id===npc.task.ref);
 npc.x=stone.x;npc.y=stone.y;npc.path=[];npc.travel=0;
 browser.completeActivity(npc);
 assert.equal(npc.inventory.stone,2,'Stone gathering creates actual items');
 browser.state.clock+=2;
 browser.advancePlan(npc);
 assert.equal(npc.plan.key,'make_campfire');
 assert.equal(browser.state.world.structures.length,1);
 assert.equal(npc.inventory.wood,0);
 assert.equal(npc.inventory.stone,1);
 browser.state.clock+=2;
 browser.advancePlan(npc);
 assert.equal(npc.plan,null,'Plan completes when the actual structure exists');
 assert.ok(npc.memories.some(m=>m.text.includes('Completed')));
});

test('socializing without Rein never manufactures speech or relationship gains',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 browser.state.connected=false;
 const a=browser.state.npcs.find(n=>n.id==='mara');
 const b=browser.state.npcs.find(n=>n.id==='jonas');
 b.x=a.x+1;b.y=a.y;
 assert.equal(browser.setAction(a,'socialize','offline routine',null),true);
 browser.step(0.05);
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(b.relationships[a.id],undefined);
});

test('a complete model-generated NPC exchange commits to both agents exactly once',async()=>{
 let calls=0;
 const browser=makeBrowser({fetch:async(path)=>{
  if(path==='/api/peer-exchange'){
   calls++;
   return {ok:true,json:async()=>({
    first:'I found berries beside the path.',second:'Thanks, I will look there.',
    durationMs:110,source:'rein'
   })};
  }
  return {ok:true,json:async()=>({connected:true})};
 }});
 browser.state.connected=true;
 browser.state.auto=false;
 const a=browser.state.npcs.find(n=>n.id==='mara');
 const b=browser.state.npcs.find(n=>n.id==='jonas');
 b.x=a.x+1;b.y=a.y;
 const before=a.needs.social;
 assert.equal(browser.setAction(a,'socialize','rein',null),true);
 await browser.peerExchange(a,b);
 assert.equal(calls,1,'Exactly one shared-model exchange request');
 assert.equal(a.peerLog.length,1);
 assert.equal(b.peerLog.length,1);
 assert.equal(a.peerLog[0].first,'Mara: I found berries beside the path.');
 assert.equal(a.peerLog[0].second,'Jonas: Thanks, I will look there.');
 assert.equal(a.relationships[b.id],undefined,'A conversation does not automatically grant trust');
 assert.equal(b.relationships[a.id],undefined);
 assert.ok(a.needs.social<before);
 assert.equal(a.task,null);
 browser.save();
 const saved=JSON.parse(browser.saved.get('ai-npc-cog-v2'));
 assert.equal(saved.npcs.find(n=>n.id==='jonas').peerLog.length,1);
 assert.equal(saved.npcs.find(n=>n.id==='mara').lastPeerAt,saved.clock);
});

test('failed dialogue leaves relationships and memories unchanged',async()=>{
 const browser=makeBrowser({fetch:async(path)=>{
  if(path==='/api/peer-exchange')return {
   ok:false,status:502,json:async()=>({error:'model aborted'})
  };
  return {ok:true,json:async()=>({connected:true})};
 }});
 browser.state.connected=true;browser.state.auto=false;
 const a=browser.state.npcs[0],b=browser.state.npcs[1];
 b.x=a.x+1;b.y=a.y;
 assert.equal(browser.setAction(a,'socialize','rein',null),true);
 const before=a.needs.social;
 await browser.peerExchange(a,b);
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(a.needs.social,before);
 assert.equal(a.task,null);
});

test('ongoing plans and verified exchanges survive a browser restart',()=>{
 const before=makeBrowser();
 const npc=before.state.npcs[0];
 assert.equal(before.setAction(npc,'make_campfire','rein',null),true);
 npc.plan.steps=2;
 npc.peerLog=[{at:'Day 1 08:10',with:'jonas',
  first:'Mara: I saw the lake.',second:'Jonas: It is quiet there.'}];
 npc.lastPeerAt=before.state.clock;
 before.save();
 const after=makeBrowser({saved:before.saved});
 const copy=after.state.npcs[0];
 assert.equal(copy.plan.key,'make_campfire');
 assert.equal(copy.plan.steps,2);
 assert.equal(copy.peerLog.length,1);
 assert.equal(copy.lastPeerAt,before.state.clock);
 assert.ok(after.backgroundOptions(copy).length<=10);
});

test('invalid restored goals are rejected without breaking the world',()=>{
 const before=makeBrowser();
 before.save();
 const data=JSON.parse(before.saved.get('ai-npc-cog-v2'));
 data.npcs[0].plan={key:'become_superuser',steps:-1};
 data.npcs[0].peerLog=[{with:'anonymous',first:'x',second:'y',at:'today'}];
 before.saved.set('ai-npc-cog-v2',JSON.stringify(data));
 const after=makeBrowser({saved:before.saved});
 assert.equal(after.state.npcs[0].plan,null);
 assert.equal(after.state.npcs[0].peerLog.length,0);
});

test('material cooperation changes relationships while social dialogue alone does not',()=>{
 const browser=makeBrowser();
 const a=browser.state.npcs.find(n=>n.id==='mara');
 const b=browser.state.npcs.find(n=>n.id==='jonas');
 b.x=a.x+1;b.y=a.y;b.needs.hunger=65;
 assert.equal(browser.setAction(a,'share_food','rein',null),true);
 assert.equal(a.relationships[b.id],52);
 assert.equal(b.relationships[a.id],52);
 assert.equal(a.inventory.food,0);
 assert.equal(b.inventory.food,2);
});

test('NPC planning prompt does not reveal another character’s internal hunger level',()=>{
 const browser=makeBrowser();
 const a=browser.state.npcs[0],b=browser.state.npcs[1];
 b.x=a.x+1;b.y=a.y;
 b.needs.hunger=97;
 const options=browser.backgroundOptions(a);
 assert.ok(options.some(x=>x.key==='share_food'),
   'Agent may offer food voluntarily without privileged knowledge of recipient needs');
});
test('in-flight peer responses do not mutate world state after player preemption',async()=>{
 let finish;
 const waiting=new Promise(resolve=>{finish=resolve;});
 const browser=makeBrowser({fetch:async(path)=>
  path==='/api/peer-exchange'?waiting:
  {ok:true,json:async()=>({connected:true})}
 });
 browser.state.connected=true;browser.state.auto=false;
 const a=browser.state.npcs[0],b=browser.state.npcs[1];
 b.x=a.x+1;b.y=a.y;
 assert.equal(browser.setAction(a,'socialize','rein',null),true);
 const pending=browser.peerExchange(a,b);
 assert.equal(browser.state.backgroundBusy,true);
 browser.state.conversationBusy=true;
 finish({ok:true,json:async()=>({first:'I found some wood.',second:'That is useful.',durationMs:100})});
 await pending;
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(a.task.key,'socialize','Uncommitted task remains available for retry');
 assert.equal(a.peerPending,false);
 assert.equal(b.peerPending,false);
 assert.equal(browser.state.backgroundBusy,false);
});

test('a multi-step intention rests when tired and does not spam repeated decisions',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const npc=browser.state.npcs[0];
 assert.equal(browser.setAction(npc,'make_campfire','rein',null),true);
 npc.energy=9;
 browser.advancePlan(npc);
 assert.equal(npc.action,'rest');
 assert.equal(npc.plan.key,'make_campfire');
 browser.advancePlan(npc);
 assert.equal(npc.action,'rest');
 assert.equal(npc.plan.steps,0);
 npc.energy=91;
 browser.step(.1);
 assert.equal(npc.plan.key,'make_campfire','The intention survives a rest period');
 assert.ok(npc.action==='collect_wood'||npc.action==='none');
});

test('a peer conversation cannot commit if the other resident walks away',async()=>{
 let finish;
 const waiting=new Promise(resolve=>{finish=resolve;});
 const browser=makeBrowser({fetch:async(path)=>
   path==='/api/peer-exchange'?waiting:
     {ok:true,json:async()=>({connected:true})}
 });
 browser.state.connected=true;browser.state.auto=false;
 const a=browser.state.npcs[0],b=browser.state.npcs[1];
 b.x=a.x+1;b.y=a.y;
 assert.equal(browser.setAction(a,'socialize','rein',null),true);
 const pending=browser.peerExchange(a,b);
 b.x=2;b.y=2;
 finish({ok:true,json:async()=>({first:'Hello.',second:'Hello back.',durationMs:100})});
 await pending;
 assert.equal(a.peerLog.length,0);
 assert.equal(b.peerLog.length,0);
 assert.equal(a.relationships[b.id],undefined);
 assert.equal(a.task.key,'socialize','A stale exchange cannot complete the task');
 assert.equal(a.peerPending,false);
});

test('NPC waypoint physically converges to its grid destination',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const npc=browser.state.npcs.find(n=>n.id==='asha');
 assert.equal(browser.moveTo(npc,{x:29,y:12}),true);
 for(let i=0;i<240 && npc.path.length;i++)browser.updateMovement(npc,1/60,2);
 assert.equal(npc.path.length,0,'Actor must actually reach final waypoint');
 assert.equal(npc.x,29);
 assert.equal(npc.y,12);
 assert.ok(Math.abs(npc.body.x-29.5)<.01);
 assert.ok(Math.abs(npc.body.y-12.5)<.01);
});
test('direct movement cannot enter building tiles',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const p=browser.state.player;
 p.x=19;p.y=9;p.body.x=19.5;p.body.y=9.5;p.body.vx=0;p.body.vy=0;
 browser.events.get('window:keydown')({key:'w',preventDefault(){}});
 for(let i=0;i<100;i++)browser.step(1/60);
 browser.events.get('window:keyup')({key:'w'});
 assert.ok(p.body.y>=8.23,'Collision radius keeps player outside the cafe facade');
 assert.ok(p.y>=8,'World grid and physics cannot disagree about occupying a wall');
});
test('resident collision bodies stop player from walking through another NPC',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const p=browser.state.player,npc=browser.state.npcs.find(n=>n.id==='asha');
 p.x=30;p.y=13;p.body.x=30.5;p.body.y=13.5;p.body.vx=0;p.body.vy=0;
 browser.events.get('window:keydown')({key:'w',preventDefault(){}});
 for(let i=0;i<60;i++)browser.step(1/60);
 browser.events.get('window:keyup')({key:'w'});
 const separation=Math.hypot(p.body.x-npc.body.x,p.body.y-npc.body.y);
 assert.ok(separation>=p.body.radius+npc.body.radius-.001);
});
test('physics diagnostic rendering can be enabled without changing world state',()=>{
 const browser=makeBrowser();
 const npc=browser.state.npcs[0],position={x:npc.x,y:npc.y};
 browser.state.debugPhysics=true;
 browser.drawWorld();
 assert.deepEqual({x:npc.x,y:npc.y},position);
});

test('the world expands into distinct explorable biomes and starts with discovery fog',()=>{
 const browser=makeBrowser();
 assert.equal(browser.state.world.width,80);
 assert.equal(browser.state.world.height,52);
 assert.equal(browser.state.world.terrain.length,4160);
 assert.ok(browser.state.world.nodes.length>25);
 assert.ok(browser.state.world.discovered[12*80+21]);
 assert.ok(!browser.state.world.discovered[45*80+70]);
 assert.ok(browser.pathfind(browser.state.player,{x:41,y:22}).length>0,
   'Starting clearing must connect to the generated frontier');
});
test('an NPC can pursue and finish a shelter plan through material collection',()=>{
 const browser=makeBrowser();
 browser.state.auto=false;
 const npc=browser.state.npcs[0];
 npc.x=41;npc.y=22;npc.body.x=41.5;npc.body.y=22.5;
 npc.inventory.wood=0;npc.inventory.fiber=0;
 assert.equal(browser.setAction(npc,'make_shelter','rein',null),true);
 for(let attempt=0;attempt<8&&npc.plan;attempt++){
  browser.state.clock+=2;
  browser.advancePlan(npc);
  if(npc.task){
   const node=browser.state.world.nodes.find(n=>n.id===npc.task.ref);
   if(node){npc.x=node.x;npc.y=node.y;npc.body.x=node.x+.5;npc.body.y=node.y+.5;}
   npc.path=[];browser.completeActivity(npc);
  }
 }
 assert.ok(browser.state.world.structures.some(s=>s.type==='shelter'));
 browser.state.clock+=2;browser.advancePlan(npc);
 assert.equal(npc.plan,null,'Completed building goal must clear');
 assert.ok(npc.memories.some(m=>m.text.includes('shelter')));
});
test('player and NPCs consume the same limited water and share item semantics',()=>{
 const browser=makeBrowser();
 const water=browser.state.world.nodes.find(n=>n.id==='wild_water_41_22');
 assert.ok(water,'Starter island freshwater source is guaranteed');
 const npc=browser.state.npcs[0],player=browser.state.player;
 npc.x=water.x;npc.y=water.y;
 player.x=water.x;player.y=water.y;
 const initial=water.stock;
 browser.playerAction('fill_water');
 assert.equal(water.stock,initial-2);
 npc.task={key:'fill_water',ref:water.id};
 browser.completeActivity(npc);
 assert.equal(water.stock,initial-4,'Both actors draw from the same world node');
 player.needs.thirst=82;
 browser.playerAction('drink');
 assert.equal(player.needs.thirst,34);
 browser.save();
 const stored=JSON.parse(browser.saved.get('ai-npc-cog-v2'));
 assert.equal(stored.player.inventory.water,3);
 assert.equal(stored.world.nodes.find(n=>n.id===water.id).stock,initial-4);
});
test('migration preserves legacy relationships but starts new discovery independently',()=>{
 const first=makeBrowser();
 first.save();
 const old=JSON.parse(first.saved.get('ai-npc-cog-v2'));
 old.npcs[0].relationships.jonas=77;
 old.npcs[0].memories=[{time:'Day 1 08:10',text:'Remembering a promise'}];
 first.saved.delete('ai-npc-cog-v2');
 first.saved.set('ai-npc-cog-v1',JSON.stringify(old));
 const next=makeBrowser({saved:first.saved});
 assert.equal(next.state.npcs[0].relationships.jonas,77);
 assert.equal(next.state.npcs[0].memories[0].text,'Remembering a promise');
 assert.ok(next.state.world.discovered[12*80+21]);
});
