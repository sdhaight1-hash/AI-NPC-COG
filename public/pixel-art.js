// Original, self-contained 16px pixel art for the Hearthbrook test village.
// Inspired by classic top-down RPG tilesets; no third-party pixel assets embedded.
(function (root) {
  'use strict';
  const TILE = 16;
  const C = {
    grass: ['#577d43', '#608448', '#64894c', '#527640', '#6e9150'],
    grassDark: '#40613b', grassLight: '#80a45b',
    soil: '#95704c', soilDark: '#775737', soilLight: '#b28b61',
    stone: '#c2b19a', stoneLight: '#d4c3a9', stoneDark: '#928b79',
    water: '#3a8193', waterLight: '#72b3ba', waterDark: '#256477',
    trunk: '#5c422d', trunkLight: '#8e6039',
    outline: '#252b29', cream: '#e1cda8', wood: '#684732'
  };
  const outfit = {
    mara:   { hair: '#61402d', shirt: '#e39e76', shade:'#aa6249', accent:'#fff1cc', pants:'#3f5874' },
    jonas:  { hair: '#3b3028', shirt: '#597d98', shade:'#395770', accent:'#bd9761', pants:'#393f51' },
    asha:   { hair: '#49314f', shirt: '#a792cf', shade:'#736394', accent:'#e5d3a3', pants:'#5d4f71' },
    rowan:  { hair: '#6c5036', shirt: '#c9e2d0', shade:'#8fa99b', accent:'#e8f7ed', pants:'#607c77' },
    lina:   { hair: '#774a31', shirt: '#e5bb64', shade:'#ac863a', accent:'#d26555', pants:'#6c563d' },
    nico:   { hair: '#292d3f', shirt: '#cb7c91', shade:'#915469', accent:'#f7c8aa', pants:'#4f597b' },
    player: { hair: '#3b2d27', shirt: '#5eabd4', shade:'#316b99', accent:'#e1e9b9', pants:'#263e6a' }
  };
  const sprites = new Map();
  let tinyTownAtlas=null;
  function setAtlas(image){
    if(image===null){tinyTownAtlas=null;return true;}
    if(!image || image.width!==192 || image.height!==176) return false;
    tinyTownAtlas=image;
    return true;
  }
  function atlasTile(ctx,index,x,y){
    if(!tinyTownAtlas)return;
    ctx.drawImage(tinyTownAtlas,(index%12)*16,Math.floor(index/12)*16,16,16,x,y,16,16);
  }
  function rect(ctx,color,x,y,w=1,h=1){
    ctx.fillStyle=color; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  }
  function hash(x,y,k=0){
    let n=(Math.imul(x+711,73856093)^Math.imul(y+37,19349663)^Math.imul(k+1,83492791))>>>0;
    n=Math.imul(n^(n>>>16),2246822507)>>>0;
    return (n^(n>>>13))>>>0;
  }
  function flower(ctx,x,y,kind){
    const color=['#f0d47d','#f3a8a8','#e8e1b9','#c6b7e4'][kind%4];
    rect(ctx,'#2f673d',x,y+1,1,3);
    rect(ctx,color,x-1,y,3,2);rect(ctx,'#f9ead1',x,y,1,1);
  }
  function ground(ctx,x,y,kind='grass'){
    const X=x*TILE,Y=y*TILE,h=hash(x,y);
    if(kind==='path'){
      rect(ctx,h%3===0?'#a18a68':'#ab9676',X,Y,16,16);
      // CC0 tiles from Kenney, packed 12x11, with procedural detail retained.
      if(tinyTownAtlas){atlasTile(ctx,24+(h%3),X,Y);return;}
      rect(ctx,'#937d5f',X,Y+7,16,1);
      const joints=[3+(h%4),10+((h>>>3)%4)];
      for(const j of joints){
        rect(ctx,'#88775e',X+j,Y+1,1,5);
        rect(ctx,'#c4ac88',X+j-3,Y+2,3,1);
        rect(ctx,'#d3b996',X+j+2,Y+10,4,1);
      }
      for(let i=0;i<3;i++){
        const px=(h>>>(i*5))&15,py=(h>>>(i*3+9))&15;
        rect(ctx,i%2?'#93795c':'#c0a786',X+px,Y+py,2,1);
      }
      return;
    }
    rect(ctx,C.grass[h%5],X,Y,16,16);
    if(tinyTownAtlas){
      atlasTile(ctx,(h%5===0?1:0),X,Y);
      if((h%23)===0)atlasTile(ctx,2,X,Y);
      return;
    }
    if((h&3)===0)rect(ctx,'#699253',X+2,Y+7,8,4);
    for(let i=0;i<4;i++){
      const p=hash(x,y,i+2);
      const px=p%15,py=(p>>>8)%15;
      rect(ctx,i===3?C.grassLight:C.grassDark,X+px,Y+py,1,2);
      if(i%2===0)rect(ctx,C.grassLight,X+px+1,Y+py,1,1);
    }
    if((h%17)===0)flower(ctx,X+6,Y+6,(h>>>5)%4);
    if((h%43)===0){
      rect(ctx,'#98a18d',X+11,Y+10,3,2);
      rect(ctx,'#6d8372',X+11,Y+12,4,1);
    }
  }
  // Terrain is quiet enough to read at a glance. Only physical world objects
  // carry the large sprites; procedural decoration never masquerades as food.
  function wilderness(ctx,x,y,biome){
    const X=x*TILE,Y=y*TILE;
    const patch=hash(Math.floor(x/4),Math.floor(y/4),19);
    const detail=hash(x,y,41);
    const palette={
      meadow:['#789b62','#71935b','#7fa16a','#6e9158'],
      forest:['#436b4d','#3d6448','#497350','#3a6148'],
      marsh:['#637965','#5d735f','#69826d','#58715e'],
      ridge:['#777c70','#72776c','#7d8276','#6c7469'],
      sand:['#c0b48b','#b8ad85','#c7bb95','#b6ab80'],
      water:['#346c7f','#306778','#3b7183','#2e6779']
    };
    rect(ctx,(palette[biome]||palette.meadow)[patch%4],X,Y,16,16);
    if(biome==='water'){
      if(detail%5===0)rect(ctx,'#6b9ba5',X+3,Y+6,9,1);
      if(detail%9===0)rect(ctx,'#214f63',X+6,Y+13,7,1);
    }else if(biome==='sand'){
      if(detail%8===0)rect(ctx,'#e0cfaa',X+5,Y+8,5,1);
    }else if(biome==='ridge'){
      // Sparse rocky seams, not a grid of identical gray blocks.
      if(detail%9===0){
        rect(ctx,'#555f5a',X+3,Y+10,10,2);
        rect(ctx,'#a2a69a',X+6,Y+8,5,1);
      }
      if(detail%17===0)rect(ctx,'#8b8f81',X+10,Y+4,3,2);
    }else if(biome==='marsh'){
      if(detail%7===0){
        rect(ctx,'#456e66',X+2,Y+9,11,3);
        rect(ctx,'#a0a876',X+7,Y+3,1,9);
      }
    }else if(biome==='forest'){
      if(detail%11===0){
        rect(ctx,'#2b543d',X+3,Y+10,8,2);
        rect(ctx,'#6b9060',X+5,Y+7,2,4);
      }
    }else if(detail%9===0){
      rect(ctx,'#426f47',X+6,Y+9,1,4);
      rect(ctx,'#a0b77b',X+7,Y+8,2,1);
    }
  }
  function pond(ctx) {
    // Irregular shoreline near the eastern edge, avoiding all passable road tiles.
    for(let y=19;y<=24;y++)for(let x=35;x<=39;x++){
      const d=((x-38)**2)/10+((y-21.5)**2)/8;
      if(d>1.2)continue;
      const X=x*16,Y=y*16,h=hash(x,y,9);
      rect(ctx,C.soilDark,X,Y,16,16);
      rect(ctx,d>.74?'#649185':C.water,X+1,Y+1,14,14);
      rect(ctx,C.waterDark,X+2,Y+13,12,2);
      if((h&1)===0)rect(ctx,C.waterLight,X+3,Y+5,7,1);
      if((h&4)===0)rect(ctx,'#9fd7cc',X+9,Y+9,4,1);
      if(d>.7) {
        rect(ctx,'#9ea26b',X+1,Y+1,2,2);
        rect(ctx,'#9d855b',X+12,Y+12,2,2);
      }
    }
    // Reeds on shore.
    for(const [x,y] of [[35,20],[35,22],[36,24],[39,19],[38,24]]){
      rect(ctx,'#416e43',x*16+4,y*16+5,1,8);
      rect(ctx,'#d6bb70',x*16+3,y*16+3,2,4);
      rect(ctx,'#678f45',x*16+7,y*16+7,1,7);
    }
  }
  function tree(ctx,x,y,variant=0){
    const X=x*16,Y=y*16;
    // Use Kenney's vertically paired 16x16 deciduous tree tiles when loaded;
    // other tree variants keep their original richly layered canopies.
    if(tinyTownAtlas && variant%3===0){
      rect(ctx,'#274833',X+2,Y+12,14,3);
      atlasTile(ctx,4,X,Y-16);
      atlasTile(ctx,16,X,Y);
      return;
    }
    rect(ctx,'#294a32',X+2,Y+13,20,6);
    rect(ctx,'#344330',X+10,Y+11,5,14);
    rect(ctx,C.trunk,X+11,Y+9,4,13);
    rect(ctx,C.trunkLight,X+12,Y+12,1,8);
    const foliage=['#346342','#3b7144','#448048','#4e8545','#68944d'];
    const offset=variant%3;
    const clumps=[[-2,2,11,11],[6,-5,15,13],[12,3,13,12],[2,9,18,12],[12,10,12,9]];
    for(let i=0;i<clumps.length;i++){
      const [cx,cy,w,h]=clumps[i];
      rect(ctx,'#264c37',X+cx+1,Y+cy+2,w,h);
      rect(ctx,foliage[(i+offset)%foliage.length],X+cx,Y+cy,w,h-2);
      rect(ctx,'#74a752',X+cx+2,Y+cy+2,Math.max(2,w-7),2);
      if(i%2===0)rect(ctx,'#a0bb65',X+cx+5,Y+cy+4,3,1);
    }
    if(variant%5===1){
      flower(ctx,X+7,Y+2,variant);
      flower(ctx,X+18,Y+7,variant+1);
    }
  }
  function bush(ctx,x,y,variant=0){
    const X=x*16,Y=y*16,h=hash(x,y,6);
    rect(ctx,'#335137',X+2,Y+11,15,4);
    rect(ctx,'#2b5937',X+1,Y+5,14,8);
    rect(ctx,'#4c8b47',X+3,Y+3,10,8);
    rect(ctx,'#7aa953',X+5,Y+3,5,2);
    rect(ctx,'#638f42',X+2,Y+9,12,3);
    if((h+variant)%3===0)flower(ctx,X+7,Y+5,(h>>>3)%4);
  }
  function rock(ctx,x,y){
    const X=x*16,Y=y*16;
    rect(ctx,'#445247',X+4,Y+11,10,3);
    rect(ctx,'#737c72',X+3,Y+6,10,7);
    rect(ctx,'#9da69a',X+5,Y+5,6,3);
    rect(ctx,'#566c65',X+10,Y+10,3,2);
  }
  function fence(ctx,x,y,vertical=false){
    const X=x*16,Y=y*16;
    if(vertical) {
      rect(ctx,'#60492c',X+6,Y,4,16);
      rect(ctx,'#d5b27b',X+7,Y,2,16);
      for(const o of [2,11])rect(ctx,'#8e6945',X+3,Y+o,10,3);
    }else{
      for(const o of [1,13]){
        rect(ctx,'#59432c',X+o,Y+5,3,10);
        rect(ctx,'#dcc08a',X+o+1,Y+4,1,10);
      }
      for(const o of [7,12])rect(ctx,'#98734c',X,Y+o,16,3);
    }
  }
  function building(ctx,b){
    const X=b.x*16,Y=b.y*16,W=b.w*16,H=b.h*16;
    const variants={
      cottage:['#9e5744','#c87f56','#5d3c32'],
      cafe:['#ab5f4b','#d3946d','#724332'],
      clinic:['#567c7d','#7eaca5','#34575d'],
      forge:['#6d5b57','#9d8170','#3e3f45'],
      library:['#666c9a','#9097be','#41486e'],
      market:['#9e7a46','#d1a262','#694c2d']
    };
    const [dark,light,edge]=variants[b.id]||variants.cottage;
    // Strong pixel shadow and walls under layered roof.
    rect(ctx,'#274333',X+5,Y+8,W+3,H-2);
    rect(ctx,'#554433',X+1,Y+16,W-2,H-16);
    rect(ctx,C.cream,X+3,Y+17,W-6,H-22);
    for(let i=0;i<W;i+=19){
      rect(ctx,'#876548',X+i+4,Y+17,3,H-22);
      rect(ctx,'#faf0cd',X+i+8,Y+20,6,2);
    }
    rect(ctx,'#563c31',X+3,Y+H-9,W-6,5);
    rect(ctx,'#c9a981',X+5,Y+H-7,W-10,2);
    // Sloped shingles and outlined eaves.
    rect(ctx,edge,X-4,Y-7,W+8,H-18);
    rect(ctx,dark,X-2,Y-6,W+4,H-22);
    for(let y=Y+1;y<Y+H-26;y+=7){
      rect(ctx,light,X-1,y,W+2,2);
      rect(ctx,edge,X+1,y+4,W-2,2);
      for(let x=X+3+((y/7|0)%2)*7;x<X+W-3;x+=14)
        rect(ctx,'#eac298',x,y+2,5,1);
    }
    rect(ctx,light,X+7,Y-10,W-15,4);
    rect(ctx,edge,X-5,Y+H-27,W+10,5);
    rect(ctx,light,X-3,Y+H-27,W+6,2);
    // Visible lower wall with windows and dark frames.
    const bottom=Y+H-19;
    for(const xx of [X+13,X+W-31]){
      rect(ctx,'#573f34',xx,bottom,17,13);
      rect(ctx,'#9cc4be',xx+3,bottom+2,11,7);
      rect(ctx,'#e2e7ce',xx+4,bottom+3,4,2);
      rect(ctx,'#506e70',xx+8,bottom+2,2,7);
      rect(ctx,'#a16b46',xx+1,bottom+10,15,3);
      flower(ctx,xx+6,bottom+10,(hash(xx,b.y)>>>5)%4);
    }
    // Door and stone doorstep aligned with its existing accessible tile.
    const dx=b.door.x*16+4;
    rect(ctx,'#4a332a',dx,bottom-1,12,19);
    rect(ctx,'#8d6544',dx+2,bottom+1,8,15);
    rect(ctx,'#b88e61',dx+3,bottom+2,4,6);
    rect(ctx,'#ecd38e',dx+9,bottom+9,1,2);
    rect(ctx,'#8f8874',dx-3,Y+H-3,19,3);
    // Roof details differentiate the buildings without using borrowed artwork.
    if(b.id==='forge'){
      rect(ctx,'#534f50',X+22,Y-13,11,16);
      rect(ctx,'#7d7772',X+24,Y-16,7,4);
      rect(ctx,'#b5aaa3',X+25,Y-15,3,2);
    }
    if(b.id==='cafe'||b.id==='market'){
      const awning=b.id==='cafe'?'#da8062':'#edb85d';
      rect(ctx,'#61422f',dx-6,Y+H-23,24,4);
      for(let i=0;i<4;i++)rect(ctx,i%2?awning:'#f3e0a8',dx-5+i*6,Y+H-22,6,4);
    }
    if(b.id==='clinic'){
      rect(ctx,'#e8dfc9',X+W/2-7,Y+6,14,13);
      rect(ctx,'#c66666',X+W/2-1,Y+8,3,9);
      rect(ctx,'#c66666',X+W/2-4,Y+11,9,3);
    }
    if(b.id==='library'){
      rect(ctx,'#bdad84',X+W/2-12,Y+7,24,10);
      rect(ctx,'#5e4a3a',X+W/2-10,Y+9,20,6);
      rect(ctx,'#dbcb9d',X+W/2-7,Y+10,14,2);
    }
    if(b.id==='cottage'){
      rect(ctx,'#5f4635',X+20,Y-13,10,13);
      rect(ctx,'#ae9072',X+22,Y-14,6,3);
    }
  }
  function details(ctx){
    // Curated pockets of village life. Decorative only; collision remains in the engine.
    for(const [x,y] of [[2,5],[3,11],[11,6],[12,18],[24,6],[25,17],[27,21],[36,12],[11,24],[32,24],[17,24]]){
      bush(ctx,x,y,hash(x,y)%3);
    }
    for(const [x,y] of [[1,8],[13,3],[26,2],[37,8],[1,21],[25,20],[35,15]]){
      rock(ctx,x,y);
    }
    for(let x=1;x<=3;x++){fence(ctx,x,17);fence(ctx,x,24);}
    for(let y=18;y<24;y++)fence(ctx,1,y,true);
    for(let x=2;x<5;x++)for(let y=18;y<24;y++){
      if((x+y)%2===0){
        rect(ctx,'#806443',x*16+3,y*16+3,10,12);
        rect(ctx,'#a18550',x*16+7,y*16+6,2,8);
        flower(ctx,x*16+8,y*16+3,(x+y)%4);
      }
    }
    for(const [x,y] of [[13,13],[26,14],[12,12]]){
      rect(ctx,'#514132',x*16+2,y*16+9,13,5);
      rect(ctx,'#b89061',x*16+2,y*16+7,13,3);
      rect(ctx,'#d4b180',x*16+4,y*16+8,8,1);
    }
    // Tiny bridges, washing line, garden pots and stacked supplies make the
    // settlement feel inhabited without assigning residents particular jobs.
    for(const [x,y] of [[6,9],[18,9],[32,9],[18,23],[34,23]]){
      const X=x*16,Y=y*16;
      rect(ctx,'#63523c',X+2,Y+9,12,3);
      rect(ctx,'#b99565',X+3,Y+8,10,2);
      rect(ctx,'#e2cf9b',X+5,Y+8,5,1);
    }
    for(let i=0;i<3;i++){
      const X=(23+i)*16,Y=17*16;
      rect(ctx,'#54442f',X+3,Y+9,11,5);
      rect(ctx,'#a27a4f',X+4,Y+10,9,2);
      if(i%2)flower(ctx,X+9,Y+8,i);
    }
    // Market crates and colorful produce just outside the market building.
    for(const [x,y] of [[30,22],[35,22],[36,23]]){
      rect(ctx,'#59422d',x*16+3,y*16+7,13,9);
      rect(ctx,'#ad7d4e',x*16+4,y*16+9,11,5);
      for(let j=0;j<3;j++)rect(ctx,j%2?'#d89b47':'#9bbb54',x*16+5+j*3,y*16+5,3,4);
    }
    // Well in the center, with a visible water rim and timber supports.
    const X=26*16,Y=12*16;
    rect(ctx,'#5b6259',X-3,Y-2,22,20);
    rect(ctx,'#d1c4a4',X,Y,16,15);
    rect(ctx,'#527b8b',X+3,Y+3,10,9);
    rect(ctx,'#83b5bb',X+6,Y+4,5,2);
    rect(ctx,'#77543b',X+1,Y-9,3,12);
    rect(ctx,'#77543b',X+12,Y-9,3,12);
    rect(ctx,'#a77b4b',X,Y-11,16,3);
    for(let j=0;j<16;j+=6)rect(ctx,'#ebdbb3',X+j,Y+14,3,2);
    // Roadside lamp and village sign.
    for(const [x,y] of [[13,11],[24,11],[28,22]]){
      rect(ctx,'#3b3e34',x*16+8,y*16+3,2,15);
      rect(ctx,'#cda76e',x*16+5,y*16+1,8,6);
      rect(ctx,'#fff0a4',x*16+7,y*16+2,4,3);
      rect(ctx,'#514838',x*16+4,y*16,10,2);
    }
  }
  function createSprite(id, facing, stride){
    const el=document.createElement('canvas');el.width=16;el.height=24;
    const c=el.getContext('2d');
    const index=Number(/^person_(\d+)$/.exec(id)?.[1]||1);
    const personalities=['mara','jonas','asha','rowan','lina','nico'];
    const p=outfit[id]||outfit[personalities[(index-1)%personalities.length]];
    const skin=['#edc29d','#c28c66','#d9a18b','#b68e72','#e1ac87','#a97b62'][(index-1)%6];
    const skinShade=['#b98e73','#916849','#a57967','#87634f','#a57c5d','#765843'][(index-1)%6];
    // Feet anchor: bottom row 23; forward walking alternates legs.
    const legA=[20,22,20,19][stride%4],legB=[20,19,20,22][stride%4];
    rect(c,'#293143',4,legA,4,3);rect(c,'#293143',9,legB,3,3);
    rect(c,p.pants,5,18,3,4);rect(c,p.pants,9,18,3,4);
    rect(c,'#293044',4,23,4,1);rect(c,'#293044',9,23,4,1);
    // Arms, shirt, and shading.
    rect(c,skinShade,2,12,3,7);rect(c,skin,2,12,2,5);
    rect(c,skinShade,12,12,3,7);rect(c,skin,13,12,2,5);
    rect(c,p.shade,4,11,9,9);
    rect(c,p.shirt,5,11,7,8);
    rect(c,p.accent,6,13,4,2);
    if(id==='mara') {rect(c,'#f5e3bf',6,14,5,5);rect(c,'#af614c',8,16,1,3);}
    if(id==='jonas') {rect(c,'#c0a16e',5,13,1,6);rect(c,'#c0a16e',10,13,1,6);}
    if(id==='asha') {rect(c,'#e7cf94',5,12,7,2);rect(c,'#f4e6bc',4,17,2,3);}
    if(id==='rowan') {rect(c,'#f3f0db',6,11,5,9);rect(c,'#b76c63',8,13,1,4);}
    if(id==='lina') {rect(c,'#85543a',12,13,4,5);rect(c,'#dcaa67',13,14,3,3);}
    if(id==='nico') {rect(c,'#c7a47e',11,12,4,6);rect(c,'#78593b',13,13,2,4);}
    // Hair and head with four face directions.
    rect(c,skinShade,5,4,7,8);
    rect(c,skin,5,4,6,7);
    if(facing==='up'){
      rect(c,p.hair,4,3,9,9);
      rect(c,p.hair,5,2,7,2);
      rect(c,'#957861',8,11,2,1);
    } else {
      rect(c,p.hair,4,3,9,4);
      rect(c,p.hair,4,6,2,5);
      rect(c,p.hair,11,6,2,5);
      rect(c,p.hair,6,2,6,2);
      if(facing==='down'){
        rect(c,'#383339',7,8,1,1);
        rect(c,'#383339',10,8,1,1);
        rect(c,skinShade,8,10,2,1);
      }else if(facing==='left'){
        rect(c,p.hair,4,5,3,7);
        rect(c,'#383339',6,8,1,1);
        rect(c,skinShade,5,10,2,1);
      }else{
        rect(c,p.hair,11,5,3,7);
        rect(c,'#383339',10,8,1,1);
        rect(c,skinShade,11,10,2,1);
      }
    }
    // Distinct silhouettes.
    if(id==='jonas') {rect(c,'#463c37',4,4,9,3);rect(c,'#726354',5,3,6,1);}
    if(id==='asha') {rect(c,'#e1c68c',5,3,7,1);rect(c,'#7b5a73',11,8,2,5);}
    if(id==='rowan') {rect(c,'#ecddca',5,2,7,2);}
    if(id==='lina') {rect(c,'#dcaa5d',4,3,10,2);}
    if(id==='nico') {rect(c,'#373549',4,3,8,4);rect(c,'#df9e7e',11,7,2,3);}
    return el;
  }
  function actor(ctx,person,isPlayer,p,selected,clockMs){
    const id=isPlayer?'player':person.id;
    const facing=['up','down','left','right'].includes(person.facing)?person.facing:'down';
    const moving=(person.motion||0)>.14 || !!person.path?.length;
    const stride=moving?Math.floor(clockMs/135)%4:0;
    const key=id+':'+facing+':'+stride;
    if(!sprites.has(key))sprites.set(key,createSprite(id,facing,stride));
    const px=Math.round((p.x+.5)*TILE),py=Math.round((p.y+1)*TILE);
    rect(ctx,'#2c483c',px-6,py-3,13,3);
    if(selected){
      // Distinct selection bracket and floating marker.
      rect(ctx,'#ffe5a4',px-9,py-22,2,5);
      rect(ctx,'#ffe5a4',px+7,py-22,2,5);
      rect(ctx,'#ffe5a4',px-9,py-3,2,3);
      rect(ctx,'#ffe5a4',px+7,py-3,2,3);
    }
    ctx.drawImage(sprites.get(key),px-8,py-24);
    if(person.task?.key==='socialize'||person.peerPending){
      rect(ctx,'#fff3d3',px+6,py-27,6,5);
      rect(ctx,'#866a55',px+8,py-25,2,1);
    }
    const name=isPlayer?'YOU':person.name.toUpperCase();
    ctx.font='bold 6px monospace';ctx.textAlign='center';
    const width=Math.ceil(ctx.measureText(name).width)+6;
    rect(ctx,'#1e2b27',px-width/2,py-32,width,9);
    rect(ctx,selected?'#f7d084':isPlayer?'#87c8e7':'#d9ddc9',px-width/2,py-32,width,1);
    ctx.fillStyle=isPlayer?'#bde9ff':'#fff2d6';ctx.fillText(name,px,py-25);
  }
  function drawWorld(ctx,dimensions,buildings,trees,world){
    ctx.imageSmoothingEnabled=false;
    if(world){
      // Natural terrain only: no roads, plazas, ponds, or buildings at generation.
      for(let y=0;y<dimensions.height;y++)for(let x=0;x<dimensions.width;x++){
        const biome=world.terrain[y*dimensions.width+x];
        wilderness(ctx,x,y,biome);
      }
      // Trees and shrubs are drawn from real nodes in drawWorldObjects.
      return;
    }
    for(let y=0;y<dimensions.height;y++)for(let x=0;x<dimensions.width;x++)
      ground(ctx,x,y,'grass');
    for(const [x,y] of trees)tree(ctx,x,y,hash(x,y)%8);
    for(const b of buildings)building(ctx,b);
  }
  function drawWorldObjects(ctx,world,view=null){
    if(!world)return;
    for(const node of world.nodes||[]){
      if(view&&(node.x<view.left||node.x>view.right||
        node.y<view.top||node.y>view.bottom))continue;
      const x=node.x*16,y=node.y*16;
      if(node.kind==='food'){
        rect(ctx,'#264d36',x+2,y+8,13,7);
        rect(ctx,node.stock?'#548f46':'#486b42',x+3,y+5,10,7);
        rect(ctx,'#81ab53',x+4,y+4,5,3);
        if(node.stock>0)for(let i=0;i<Math.min(4,node.stock);i++)
          rect(ctx,i%2?'#bf6270':'#d87c70',x+4+(i%2)*5,y+7+(i>>1)*3,2,2);
      }else if(node.kind==='wood'){
        if(node.stock>0){
          rect(ctx,'#392f28',x+7,y+10,3,7);
          rect(ctx,'#865b3c',x+8,y+9,2,7);
          rect(ctx,'#203f31',x+2,y+5,13,9);
          rect(ctx,'#407549',x+3,y+2,11,10);
          rect(ctx,'#63945a',x+5,y+2,7,3);
          rect(ctx,'#2c563a',x+2,y+11,12,2);
        }else{
          rect(ctx,'#493e31',x+4,y+10,10,4);
          rect(ctx,'#93764f',x+6,y+9,7,3);
        }
      }else if(node.kind==='fiber'){
        rect(ctx,'#305f3d',x+2,y+11,11,4);
        for(let i=0;i<4;i++){
          rect(ctx,'#537e48',x+3+i*3,y+5+(i%2)*2,2,9);
          rect(ctx,'#d5c27e',x+4+i*3,y+3+(i%2)*2,1,3);
        }
      }else if(node.kind==='water'){
        rect(ctx,'#455e62',x+1,y+10,15,4);
        rect(ctx,'#4d99a5',x+2,y+5,12,9);
        rect(ctx,'#96c4bd',x+4,y+6,6,2);
        rect(ctx,'#bed5c7',x+7,y+10,4,1);
      }else if(node.kind==='stone'){
        rect(ctx,'#3c514a',x+2,y+12,13,3);
        rect(ctx,node.stock?'#8d968e':'#64736e',x+2,y+7,12,6);
        rect(ctx,'#bec4b2',x+5,y+6,6,2);
        if(node.stock>0)rect(ctx,'#d1d1ba',x+3,y+10,3,1);
      }
    }
    for(const item of world.items||[]){
      const x=item.x*16,y=item.y*16;
      if(item.kind!=='wood')continue;
      rect(ctx,'#2b3028',x+3,y+11,11,4);
      rect(ctx,'#ab8456',x+3,y+8,10,5);
      rect(ctx,'#e5b77c',x+4,y+9,2,3);
      rect(ctx,'#e5d49b',x+10,y+9,2,1);
    }
    for(const site of world.structures||[]){
      if(view&&(site.x<view.left||site.x>view.right||
        site.y<view.top||site.y>view.bottom))continue;
      const x=site.x*16,y=site.y*16;
      if(site.type==='shelter'){
        rect(ctx,'#303d34',x-6,y+11,28,8);
        rect(ctx,'#835d3e',x-7,y+1,29,14);
        rect(ctx,'#ab8450',x-4,y-4,23,12);
        rect(ctx,'#d5af70',x-2,y-6,18,3);
        rect(ctx,'#3c342b',x+4,y+8,8,10);
        rect(ctx,'#d9bd82',x+7,y+10,2,3);
        continue;
      }
      if(site.type==='crate'){
        rect(ctx,'#292b23',x+1,y+12,14,4);
        rect(ctx,'#875b3d',x+2,y+5,12,9);
        rect(ctx,'#c18e59',x+3,y+5,10,3);
        rect(ctx,'#493427',x+4,y+9,8,2);
        rect(ctx,'#d3b278',x+7,y+7,2,7);
        if(Object.values(site.contents||{}).some(n=>n>0))
         rect(ctx,'#e6d5a2',x+4,y+4,8,2);
        continue;
      }
      if(site.type==='workbench'){
        rect(ctx,'#322d27',x+1,y+12,15,4);
        rect(ctx,'#ac8556',x+1,y+6,14,5);
        rect(ctx,'#e7bc7d',x+2,y+6,12,2);
        rect(ctx,'#6a4e35',x+3,y+10,2,6);
        rect(ctx,'#6a4e35',x+11,y+10,2,6);
        continue;
      }
      if(site.type==='cache'){
        rect(ctx,'#302d25',x+1,y+11,15,4);
        rect(ctx,'#7e6039',x+2,y+6,13,8);
        rect(ctx,'#c79a59',x+3,y+6,11,3);
        rect(ctx,'#4c3927',x+5,y+9,2,4);
        rect(ctx,'#4c3927',x+11,y+9,2,4);
        if(site.contents?.wood>0)rect(ctx,'#d7c48e',x+7,y+8,4,2);
        continue;
      }
      if(site.type!=='campfire')continue;
      rect(ctx,'#42463f',x+1,y+11,14,3);
      rect(ctx,'#b4a18a',x+3,y+9,11,3);
      rect(ctx,'#62442d',x+4,y+11,10,3);
      rect(ctx,'#e7b862',x+6,y+5,5,8);
      rect(ctx,'#f8df83',x+8,y+3,3,8);
      rect(ctx,'#da6747',x+6,y+9,7,3);
    }
  }
  function drawAmbient(ctx,world,clock,now){
    // Low-cost pixelated dusk/night grade. No shaders or extra draw calls per tile.
    const hour=((clock%1440)+1440)%1440/60;
    const twilight=Math.max(0,Math.min(1,(hour-16.5)/4.5))+
      Math.max(0,Math.min(1,(5.5-hour)/3));
    const night=Math.min(1,twilight);
    if(night>.015){
      ctx.fillStyle='rgba(18,32,64,'+(night*.55).toFixed(3)+')';
      ctx.fillRect(0,0,world?.width*16||640,world?.height*16||416);
    }
    for(const fire of world?.structures||[]){
      if(fire.type!=='campfire')continue;
      const x=fire.x*16+8,y=fire.y*16+5;
      for(let i=0;i<3;i++){
        const rise=((now/120+i*7)%23);
        const drift=Math.sin(now/900+i*2)*3;
        ctx.fillStyle='rgba(210,213,194,'+(0.35-rise/65)+')';
        ctx.fillRect(Math.round(x+drift),Math.round(y-rise),3+i%2,2);
      }
    }
  }
  root.VillageArt={ TILE, drawWorld, drawWorldObjects, drawAmbient, drawActor:actor, hash, setAtlas };
})(globalThis);
