import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function makeBrowser(options={}){
 const events=new Map(),saved=options.saved||new Map();
 const counters={staticRects:0,screenImages:0};
 const fakeCtx=kind=>new Proxy({
  measureText:s=>({width:String(s).length*8}),
  fillRect(){if(kind==='static')counters.staticRects++;},
  drawImage(){if(kind==='screen')counters.screenImages++;}
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
 const context={document,window,console,requestAnimationFrame(){},setInterval(){},
  performance:{now:()=>0},
  localStorage:{
   getItem:k=>saved.get(k)||null,
   setItem(k,v){saved.set(k,v);},
   removeItem(k){saved.delete(k);}
  },fetch:options.fetch||async()=>({ok:true,json:async()=>({connected:false})})};
 const source=['pixel-art.js','frontier.js','biology.js','emergence.js',
  'civilization.js','app.js'].map(path=>
  readFileSync(new URL('../public/'+path,import.meta.url),'utf8')).join('\n');
 vm.runInNewContext(source+'\n'+
  'globalThis.exposed={state,step,pathfind,moveTo,position,setAction,completeActivity,'+
  'availableActivities,backgroundOptions,sceneFor,save,validSavedPath,drawWorld,'+
  'updateMovement,clientToTile,setZoom,setZ,peerExchange,renderChat,selectNpc};',context);
 return {...context.exposed,saved,events,elements,counters};
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
 assert.ok(b.availableActivities(n).some(o=>o.key==='experiment_tool'));
 assert.ok(!b.backgroundOptions(n).some(o=>o.key==='craft_hatchet'));
 assert.equal(b.setAction(n,'experiment_tool','rein',{experiment_tool:1}),true);
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
 const b=makeBrowser(),first=31*1440;
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
 b.state.clock=31*1440-1;
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
