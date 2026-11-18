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
  const mapCtx=fakeContext('screen'), staticCtx=fakeContext('static');
  const canvas={
    width: 1120,height:728,
    getContext:()=>mapCtx,
    addEventListener(name,fn){ events.set('canvas:'+name,fn); }
  };
  const elements = new Map([['world', canvas]]);
  const createElement = tag => {
    if(tag==='canvas')return {width:0,height:0,getContext:()=>staticCtx};
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
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInNewContext(source + '\nglobalThis.__expose={state,step,drawWorld,setAction,pathfind,backgroundOptions,save,validSavedPath};',context);
  return { ...context.__expose, counters, events, saved };
}

test('cached static map is painted once, while dynamic frames reuse it',()=>{
  const browser=makeBrowser();
  const before=browser.counters.staticRects;
  assert.ok(before>100,'Map should be initialized');
  browser.drawWorld();browser.drawWorld();
  assert.equal(browser.counters.staticRects,before,'Static tiles should not be redrawn each frame');
  assert.equal(browser.counters.screenImages,2);
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

test('NPC world rules exclude night shifts from available model options',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs[0];
  browser.state.clock=2*60;
  const overnight=browser.backgroundOptions(npc).map(item=>item.key);
  assert.ok(!overnight.includes('work'));
  browser.state.clock=10*60;
  const daytime=browser.backgroundOptions(npc).map(item=>item.key);
  assert.ok(daytime.includes('work'));
});

test('saved NPC movement routes are contiguous and never cross buildings',()=>{
  const browser=makeBrowser();
  const npc=browser.state.npcs.find(n=>n.id==='nico');
  assert.equal(browser.validSavedPath([{x:26,y:11},{x:26,y:10}],npc),true);
  assert.equal(browser.validSavedPath([{x:26,y:9}],npc),false,'reject teleporting routes');
  assert.equal(browser.validSavedPath([{x:27,y:12},{x:28,y:12},{x:29,y:12}],npc),true);
  const mara=browser.state.npcs.find(n=>n.id==='mara');
  assert.equal(browser.validSavedPath([{x:19,y:7}],mara),false,'reject a building tile');
});
