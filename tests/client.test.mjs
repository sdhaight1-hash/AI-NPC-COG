import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeBrowser() {
  const events = new Map();
  const saved = new Map();
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
    fetch:async()=>({ok:true,json:async()=>({connected:false})})
  };
  const art=readFileSync(new URL('../public/pixel-art.js',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../public/emergence.js',import.meta.url),'utf8');
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInNewContext(art+'\n'+rules+'\n'+source +
    '\nglobalThis.__expose={state,step,drawWorld,setAction,pathfind,backgroundOptions,save,validSavedPath,setZoom,clientToTile,updateCamera,availableActivities,completeActivity,sendMessage};',context);
  return { ...context.__expose, counters, events, saved, elements };
}

test('cached static map is painted once, while dynamic frames reuse it',()=>{
  const browser=makeBrowser();
  const before=browser.counters.staticRects;
  assert.ok(before>100,'Map should be initialized');
  browser.drawWorld();browser.drawWorld();
  assert.equal(browser.counters.staticRects,before,'Static tiles should not be redrawn each frame');
  assert.equal(browser.counters.screenImages,16,
    'Each frame draws one cached map and seven pixel-art residents');
});

test('held WASD moves continuously rather than resetting movement paths',()=>{
  const browser=makeBrowser();
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
  const stored=JSON.parse(browser.saved.get('ai-npc-cog-v1'));
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
  const stored=JSON.parse(browser.saved.get('ai-npc-cog-v1'));
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
