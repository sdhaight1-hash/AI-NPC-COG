import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function physics(){
 const context={};
 vm.runInNewContext(readFileSync(new URL('../public/physics.js',import.meta.url),'utf8'),context);
 return context.Physics2D;
}
test('kinematic bodies accelerate and decay smoothly without gravity',()=>{
 const lib=physics(),solid=()=>false;
 const p=lib.create(2,2);
 const slow=lib.steer(p,{x:1,y:0},1/60,solid);
 assert.ok(slow.dx>0 && slow.dx<.1,'Initial movement uses acceleration');
 for(let i=0;i<20;i++)lib.steer(p,{x:1,y:0},1/60,solid);
 assert.ok(p.vx>3.4 && p.vx<4.7);
 const prior=p.vx;
 lib.steer(p,{x:0,y:0},1/60,solid);
 assert.ok(p.vx<prior && p.vx>0,'Release decelerates instead of snapping to zero');
 assert.equal(p.vy,0);
});
test('high-speed movement cannot tunnel through a wall',()=>{
 const lib=physics(),solid=(x,y)=>x===3&&y>=1&&y<=5;
 const p=lib.create(1,2);
 const result=lib.tryMove(p,8,0,solid);
 assert.equal(result.hitX,true);
 assert.ok(p.x<=3-p.radius+1e-5);
 assert.equal(lib.valid(p,solid),true);
});
test('diagonal movement slides along solid tiles',()=>{
 const lib=physics(),solid=(x,y)=>x===3&&y>=0&&y<=8;
 const p=lib.create(2,2);
 const first=p.y;
 let blocked=false;
 for(let i=0;i<25;i++){
  const m=lib.steer(p,{x:1,y:1},1/60,solid,[],4);
  blocked ||= m.hitX;
 }
 assert.equal(blocked,true);
 assert.ok(p.y>first+.5,'Character should slide along the vertical obstacle');
 assert.ok(p.x<=3-p.radius+1e-5);
 assert.equal(lib.valid(p,solid),true);
});
test('characters cannot overlap other moving character colliders',()=>{
 const lib=physics(),solid=()=>false;
 const p=lib.create(2,2),npc=lib.create(3,2);
 const result=lib.tryMove(p,2,0,solid,[npc]);
 assert.equal(result.hitX,true);
 assert.ok(Math.hypot(p.x-npc.x,p.y-npc.y)>=p.radius+npc.radius-.0001);
});
test('continuous tile collision rejects out-of-bounds and invalid placement',()=>{
 const lib=physics(),solid=(x,y)=>x<0||y<0||x>=6||y>=6||x===3&&y===3;
 assert.equal(lib.valid(lib.create(1,1),solid),true);
 assert.equal(lib.valid(lib.create(3,3),solid),false);
 const p=lib.create(1,1);
 lib.tryMove(p,-200,-200,solid);
 assert.ok(p.x>=p.radius && p.y>=p.radius);
});
test('follow reaches the center of its waypoint without overshoot',()=>{
 const lib=physics(),solid=()=>false,p=lib.create(2,2);
 let arrived=false;
 for(let i=0;i<180;i++){
  const r=lib.follow(p,{x:3,y:2},1/60,solid,[],2.2);
  if(r.arrived){arrived=true;break;}
 }
 assert.equal(arrived,true);
 assert.ok(Math.abs(p.x-3.5)<.00001);
 assert.ok(Math.abs(p.y-2.5)<.00001);
});
