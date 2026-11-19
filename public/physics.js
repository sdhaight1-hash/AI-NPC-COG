// Lightweight deterministic 2D top-down kinematic controller.
// Coordinates are in tile units: (0.5,0.5) is the center of tile (0,0).
// Solid tiles are authoritative; model text never manipulates positions directly.
(function (root) {
  'use strict';
  const RADIUS=0.23;
  const STEP=0.105;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function create(x,y,radius=RADIUS){
    return {x:x+.5,y:y+.5,vx:0,vy:0,radius};
  }
  function cellCollision(x,y,radius,isBlocked){
    const minX=Math.floor(x-radius),maxX=Math.floor(x+radius);
    const minY=Math.floor(y-radius),maxY=Math.floor(y+radius);
    for(let iy=minY;iy<=maxY;iy++)for(let ix=minX;ix<=maxX;ix++){
      if(!isBlocked(ix,iy))continue;
      const nearX=clamp(x,ix,ix+1),nearY=clamp(y,iy,iy+1);
      if((x-nearX)**2+(y-nearY)**2<radius*radius-1e-9)return true;
    }
    return false;
  }
  function bodyCollision(x,y,radius,others){
    for(const other of others||[]){
      if(!other||!Number.isFinite(other.x)||!Number.isFinite(other.y))continue;
      const r=radius+(other.radius||RADIUS);
      if((x-other.x)**2+(y-other.y)**2<r*r-1e-8)return true;
    }
    return false;
  }
  function tryMove(body,dx,dy,isBlocked,others=[]){
    const count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/STEP));
    const stepX=dx/count,stepY=dy/count;
    const startX=body.x,startY=body.y;
    let hitX=false,hitY=false;
    for(let i=0;i<count;i++){
      const candidateX=body.x+stepX;
      if(!cellCollision(candidateX,body.y,body.radius,isBlocked)&&
         !bodyCollision(candidateX,body.y,body.radius,others)){
        body.x=candidateX;
      }else hitX=true;
      const candidateY=body.y+stepY;
      if(!cellCollision(body.x,candidateY,body.radius,isBlocked)&&
         !bodyCollision(body.x,candidateY,body.radius,others)){
        body.y=candidateY;
      }else hitY=true;
    }
    if(hitX)body.vx=0;
    if(hitY)body.vy=0;
    return {dx:body.x-startX,dy:body.y-startY,hitX,hitY};
  }
  function steer(body,intent,dt,isBlocked,others=[],speed=4.5){
    if(!Number.isFinite(dt)||dt<=0)return {dx:0,dy:0,hitX:false,hitY:false};
    dt=Math.min(dt,.1);
    const magnitude=Math.hypot(intent.x||0,intent.y||0);
    const nx=magnitude>1?intent.x/magnitude:(intent.x||0);
    const ny=magnitude>1?intent.y/magnitude:(intent.y||0);
    // Exponential approach avoids frame-rate-sensitive linear acceleration.
    const responsiveness=magnitude>0.01?13:20;
    const blend=1-Math.exp(-responsiveness*dt);
    body.vx+=(nx*speed-body.vx)*blend;
    body.vy+=(ny*speed-body.vy)*blend;
    if(Math.abs(body.vx)<.008)body.vx=0;
    if(Math.abs(body.vy)<.008)body.vy=0;
    return tryMove(body,body.vx*dt,body.vy*dt,isBlocked,others);
  }
  function follow(body,target,dt,isBlocked,others=[],speed=2.35){
    const dx=target.x+.5-body.x,dy=target.y+.5-body.y;
    const distance=Math.hypot(dx,dy);
    if(distance<.045&&Math.hypot(body.vx,body.vy)<.6){
      body.x=target.x+.5;body.y=target.y+.5;
      body.vx=0;body.vy=0;return {arrived:true,blocked:false};
    }
    // Scale speed close to the target, preventing jerky overshoot.
    const desiredSpeed=Math.min(speed,Math.sqrt(2*14*distance));
    const desired=distance>0.0001?{x:dx/distance*desiredSpeed/speed,
      y:dy/distance*desiredSpeed/speed}:{x:0,y:0};
    const result=steer(body,desired,dt,isBlocked,others,speed);
    const after=Math.hypot(target.x+.5-body.x,target.y+.5-body.y);
    if(after<.048&&Math.hypot(body.vx,body.vy)<.8){
      body.x=target.x+.5;body.y=target.y+.5;body.vx=0;body.vy=0;
      return {arrived:true,blocked:false};
    }
    return {arrived:false,blocked:result.hitX||result.hitY};
  }
  function valid(body,isBlocked){
    return Number.isFinite(body?.x)&&Number.isFinite(body?.y)&&
      !cellCollision(body.x,body.y,body.radius??RADIUS,isBlocked);
  }
  root.Physics2D={create,steer,follow,tryMove,cellCollision,bodyCollision,valid,RADIUS};
})(globalThis);
