// Small world-rule kernel. Agents have needs and histories, never assigned professions.
// Rein chooses from valid local affordances; this module executes and validates outcomes.
(function (root) {
  'use strict';
  const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
  const distance = (a,b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y);
  const RESOURCE_SEEDS = [
    ['berry_1','food',12,14,6], ['berry_2','food',27,16,6],
    ['berry_3','food',36,12,5], ['berry_4','food',3,11,5],
    ['tree_1','wood',12,9,8], ['tree_2','wood',2,13,8],
    ['tree_3','wood',26,9,8], ['tree_4','wood',38,10,7],
    ['rock_1','stone',13,23,7], ['rock_2','stone',27,18,7],
    ['rock_3','stone',3,21,6]
  ];
  const KEYS = ['forage','collect_wood','collect_stone','collect_fiber','fill_water',
    'eat','drink','rest','share_food','socialize','build_fire','craft_hatchet',
    'build_shelter','explore','none'];
  const skillNames = {forage:'foraging',collect_wood:'gathering',collect_stone:'gathering',
    collect_fiber:'gathering',fill_water:'survival',drink:'survival',
    craft_hatchet:'crafting',build_shelter:'building',
    share_food:'cooperation',socialize:'socializing',build_fire:'building',explore:'exploring'};
  function newWorld(seed=Frontier.DEFAULT_SEED) {
    const island=Frontier.generate(seed);
    return {version:2,now:0,seed:island.seed,width:island.width,height:island.height,
      terrain:island.terrain,discovered:{},
      weather:Frontier.weather(island,480),
      nodes:[...RESOURCE_SEEDS.map(([id,kind,x,y,max])=>({id,kind,x,y,max,stock:max})),
        ...island.resources],
      structures:[]};
  }
  function newAgent(n, index=0) {
    n.needs = { hunger:28+(index*9)%35, thirst:24+(index*7)%28,
      social:35+(index*7)%32, curiosity:40+(index*11)%36 };
    n.inventory = { food:1,water:2,wood:0,stone:0,fiber:0,hatchet:0 };
    n.skills = { foraging:0,gathering:0,crafting:0,survival:0,
      cooperation:0,socializing:0,building:0,exploring:0 };
    n.visited = [];
    n.task = null;
    n.plan = null;
    n.peerLog = [];
    n.lastPeerAt = -100000;
    return n;
  }
  function focus(n) {
    const entries=Object.entries(n.skills||{}).sort((a,b)=>b[1]-a[1]);
    if(!entries.length||entries[0][1]<3)return 'Still finding their interests';
    return 'Drawn toward '+entries[0][0]+' ('+entries[0][1]+' actions)';
  }
  function findNode(n,world,kind,canReach) {
    const candidates=world.nodes.filter(node=>node.kind===kind&&node.stock>0&&
      distance(n,node)<=18).sort((a,b)=>distance(n,a)-distance(n,b));
    return candidates.slice(0,8).find(node=>canReach(node))||null;
  }
  function nearestResident(n,residents,condition=()=>true) {
    return residents.filter(other=>other.id!==n.id&&distance(n,other)<=8&&condition(other))
      .sort((a,b)=>distance(a,n)-distance(b,n))[0]||null;
  }
  function exploreTarget(n,canReach,world) {
    // Evaluate a small ring of vantage points, not hundreds of BFS paths per decision.
    // All inhabitants use the same directions; past visits change where they choose.
    const directions=[[7,0],[-7,0],[0,7],[0,-7],[6,6],[-6,6],[6,-6],[-6,-6],
      [12,3],[-12,3],[3,12],[-3,-12],[9,-4],[-9,4]];
    const seen=new Set(n.visited||[]);
    let seed=0;for(const c of n.id)seed=seed*31+c.charCodeAt(0)|0;
    let best=null,score=-Infinity;
    for(const [dx,dy] of directions){
      const point={x:n.x+dx,y:n.y+dy};
      if(point.x<0||point.x>=world.width||point.y<0||point.y>=world.height||!canReach(point))continue;
      const id=point.x+':'+point.y;
      const novelty=seen.has(id)?-100:100;
      const tie=((point.x*73+point.y*151+seed*19)>>>0)%29;
      if(novelty+tie>score){score=novelty+tie;best=point;}
    }
    return best;
  }
  function available(n,world,residents,canReach) {
    const list=[];
    const add=(key,when,target=null,ref=null)=>list.push({key,when,target,ref});
    for(const [kind,key,label] of [['food','forage','food'],['wood','collect_wood','wood'],
      ['stone','collect_stone','stone'],['fiber','collect_fiber','plant fiber'],
      ['water','fill_water','fresh water']]){
      const node=findNode(n,world,kind,canReach);
      if(node&&n.energy>=12){
        add(key,'Collect '+label+' from a visible source ('+node.stock+' remaining, '+distance(n,node)+' tiles away)',node,node.id);
      }
    }
    if(n.inventory.food>0&&n.needs.hunger>=10)
      add('eat','Eat carried food (hunger '+Math.round(n.needs.hunger)+'/100)');
    if(n.inventory.water>0&&n.needs.thirst>=10)
      add('drink','Drink carried water (thirst '+Math.round(n.needs.thirst)+'/100)');
    if(n.inventory.wood>=1&&n.inventory.stone>=1&&n.inventory.fiber>=1&&n.inventory.hatchet===0)
      add('craft_hatchet','Craft a basic tool from wood, stone and plant fiber');
    if(n.energy<88)add('rest','Rest until recovered (energy '+Math.round(n.energy)+'/100)');
    const recipient=nearestResident(n,residents);
    if(recipient&&n.inventory.food>0)
      add('share_food','Offer one carried food to nearby '+recipient.name,recipient,recipient.id);
    const other=nearestResident(n,residents);
    if(other && world.now-(n.lastPeerAt ?? -100000)>=45)
      add('socialize','Seek out '+other.name+' and initiate a real conversation',other,other.id);
    if(n.inventory.wood>=2&&n.inventory.stone>=1&&n.energy>=18&&
       !world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
      add('build_fire','Build a shared campfire using 2 wood and 1 stone');
    if(!n.plan && n.energy>=12 && n.inventory.food<2 &&
       findNode(n,world,'food',canReach))
      add('stock_food','Commit to obtaining a small food reserve, gathering what is needed');
    if(!n.plan && n.energy>=18 &&
       !world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5) &&
       (n.inventory.wood>=2||findNode(n,world,'wood',canReach)) &&
       (n.inventory.stone>=1||findNode(n,world,'stone',canReach)))
      add('make_campfire','Commit to building a communal campfire, collecting any missing materials');
    if(n.inventory.wood>=4&&n.inventory.fiber>=3&&n.energy>=22&&
       !world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
      add('build_shelter','Construct a small shelter from 4 wood and 3 plant fiber');
    if(!n.plan&&n.energy>=20&&
       !world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5)&&
       (n.inventory.wood>=4||findNode(n,world,'wood',canReach))&&
       (n.inventory.fiber>=3||findNode(n,world,'fiber',canReach)))
      add('make_shelter','Form an intention to collect materials and construct a shelter');
    const destination=exploreTarget(n,canReach,world);
    if(destination&&n.energy>=10)
      add('explore','Explore an unfamiliar reachable area ('+distance(n,destination)+' tiles)',destination);
    add('none','Continue the current activity or observe before deciding');
    return list;
  }
  function complete(n,world,residents) {
    const task=n.task;
    if(!task)return {ok:false,message:'No task'};
    // An NPC conversation never earns friendship from proximity alone.
    if(task.key==='socialize' && task.approved!==true)
      return {ok:false,message:'A real exchange is required before social effects'};
    n.task=null;
    let message='';
    if(['forage','collect_wood','collect_stone','collect_fiber','fill_water'].includes(task.key)){
      const node=world.nodes.find(v=>v.id===task.ref);
      if(!node||node.stock<1||distance(n,node)>1)return {ok:false,message:'Resource no longer available'};
      // Repeated practice gradually improves output; expertise is earned, never assigned.
      const expertise=n.skills[skillNames[task.key]]||0;
      const collected=Math.min(node.stock,2+Math.min(2,Math.floor(expertise/3))+
        (n.inventory.hatchet&&task.key==='collect_wood'?1:0));
      node.stock-=collected;
      n.inventory[node.kind]+=collected;
      n.energy=clamp(n.energy-3*collected);
      message='Collected '+collected+' '+node.kind+' (source '+node.stock+'/'+node.max+' remaining)';
    }else if(task.key==='drink'){
      if(n.inventory.water<1)return {ok:false,message:'No drinkable water'};
      n.inventory.water--;n.needs.thirst=clamp(n.needs.thirst-48);
      message='Drank fresh water; thirst now '+Math.round(n.needs.thirst);
    }else if(task.key==='craft_hatchet'){
      if(n.inventory.hatchet||n.inventory.wood<1||n.inventory.stone<1||n.inventory.fiber<1)
        return {ok:false,message:'Missing tool materials'};
      n.inventory.wood--;n.inventory.stone--;n.inventory.fiber--;
      n.inventory.hatchet=1;message='Crafted a stone hatchet for faster wood gathering';
    }else if(task.key==='build_shelter'){
      if(n.inventory.wood<4||n.inventory.fiber<3||n.energy<22||
         world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
        return {ok:false,message:'Cannot build shelter at this location'};
      n.inventory.wood-=4;n.inventory.fiber-=3;n.energy=clamp(n.energy-16);
      world.structures.push({id:'shelter_'+(world.structures.length+1),
        type:'shelter',x:n.x,y:n.y});
      message='Built a shared shelter at '+n.x+','+n.y;
    }else if(task.key==='eat'){
      if(n.inventory.food<1)return {ok:false,message:'No food left'};
      n.inventory.food--;n.needs.hunger=clamp(n.needs.hunger-44);
      message='Ate food; hunger now '+Math.round(n.needs.hunger);
    }else if(task.key==='share_food'||task.key==='socialize'){
      const other=residents.find(v=>v.id===task.ref);
      if(!other||distance(n,other)>2)return {ok:false,message:'The other resident moved away'};
      if(task.key==='share_food'){
        if(n.inventory.food<1)return {ok:false,message:'No food left to share'};
        n.inventory.food--;other.inventory.food++;
        n.needs.social=clamp(n.needs.social-15);
        other.needs.social=clamp(other.needs.social-10);
        message='Shared food with '+other.name;
      }else{
        n.needs.social=clamp(n.needs.social-32);
        other.needs.social=clamp(other.needs.social-16);
        message='Spent time with '+other.name;
      }
      // Talk alone is not proof of friendship. Cooperative material acts
      // earn trust; dialogue changes needs and memory, not automatic affection.
      if(task.key==='share_food'){
        n.relationships[other.id]=clamp((n.relationships[other.id]??50)+2);
        other.relationships[n.id]=clamp((other.relationships[n.id]??50)+2);
      }else{
        n.lastPeerAt=world.now;
        other.lastPeerAt=world.now;
      }
    }else if(task.key==='build_fire'){
      if(n.inventory.wood<2||n.inventory.stone<1||n.energy<18||
        world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
        return {ok:false,message:'Not enough supplies or space to build'};
      n.inventory.wood-=2;n.inventory.stone--;n.energy=clamp(n.energy-12);
      world.structures.push({id:'fire_'+(world.structures.length+1),type:'campfire',x:n.x,y:n.y});
      message='Built a shared campfire at '+n.x+','+n.y;
    }else if(task.key==='explore'){
      const id=n.x+':'+n.y;
      n.visited=[...new Set([...(n.visited||[]),id])].slice(-32);
      n.needs.curiosity=clamp(n.needs.curiosity-30);
      message='Explored tile '+id;
    }else return {ok:false,message:'Unknown task'};
    if(skillNames[task.key])n.skills[skillNames[task.key]]=(n.skills[skillNames[task.key]]||0)+1;
    return {ok:true,message};
  }
  // Rein selects the intention. World rules execute each prerequisite one step
  // at a time, without inventing items or requiring more model calls.
  function nextPlanAction(n,world,residents,canReach){
    if(!n.plan)return {status:'done'};
    let key;
    if(n.plan.key==='stock_food'){
      if(n.inventory.food>=2)return {status:'done'};
      key='forage';
    }else if(n.plan.key==='make_shelter'){
      if(world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
        return {status:'done'};
      if(n.inventory.wood<4)key='collect_wood';
      else if(n.inventory.fiber<3)key='collect_fiber';
      else key='build_shelter';
    }else if(n.plan.key==='make_campfire'){
      if(world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
        return {status:'done'};
      if(n.inventory.wood<2)key='collect_wood';
      else if(n.inventory.stone<1)key='collect_stone';
      else key='build_fire';
    }else return {status:'blocked',reason:'Unrecognized intention'};
    if(n.energy<20)key='rest';
    const option=available(n,world,residents,canReach).find(a=>a.key===key);
    return option?{status:'action',option}:{status:'blocked',reason:'Required resource or location unavailable'};
  }
  function validatePlan(saved){
    if(!saved || !['stock_food','make_campfire','make_shelter'].includes(saved.key) ||
       !Number.isInteger(saved.steps) || saved.steps<0 || saved.steps>8)return null;
    return {key:saved.key,steps:saved.steps};
  }
  function stepNeeds(n,world,dt) {
    const badWeather=world.weather?.kind==='storm'||world.weather?.kind==='rain';
    const shelter=world.structures.some(site=>site.type==='shelter'&&distance(n,site)<=4);
    n.needs.thirst=clamp(n.needs.thirst+dt*(world.weather?.temperature>26?.12:.08));
    n.needs.hunger=clamp(n.needs.hunger+dt*.065);
    if(badWeather&&!shelter)n.energy=clamp(n.energy-dt*.055);
    n.needs.social=clamp(n.needs.social+dt*.025);
    n.needs.curiosity=clamp(n.needs.curiosity+dt*.016);
    n.energy=clamp(n.energy-dt*.045);
    if(n.action==='rest'){
      const warm=world.structures.some(site=>site.type==='campfire'&&distance(n,site)<=3);
      n.energy=clamp(n.energy+dt*(shelter?.66:warm?.52:.26));
      if(n.energy>=90) {
        n.action='none';n.goal='Recovered and considering what to do';return 'Recovered';
      }
    }
    return null;
  }
  function regenerate(world,dt){
    // Gradual finite regeneration, never more than a node's starting capacity.
    for(const node of world.nodes){
      if(node.stock>=node.max)continue;
      node.regrow=(node.regrow||0)+dt*(node.kind==='water'?.027:
        node.kind==='food'?.018:node.kind==='fiber'?.012:.008);
      while(node.regrow>=1&&node.stock<node.max){node.stock++;node.regrow--;}
    }
  }
  function fallback(n,options) {
    const keys=new Set(options.map(o=>o.key));
    if(n.needs.thirst>45&&keys.has('drink'))return 'drink';
    if(n.needs.thirst>45&&keys.has('fill_water'))return 'fill_water';
    if(n.needs.hunger>55&&keys.has('eat'))return 'eat';
    if(n.needs.hunger>50&&keys.has('forage'))return 'forage';
    if(n.energy<30&&keys.has('rest'))return 'rest';
    // Offline is deterministic survival simulation, not an imitation of Rein cognition.
    return keys.has('explore')?'explore':'none';
  }
  function restoreWorld(target,saved) {
    if(!saved||!Array.isArray(saved.nodes)||!Array.isArray(saved.structures))return;
    for(const node of target.nodes){
      const old=saved.nodes.find(v=>v.id===node.id&&v.kind===node.kind);
      if(old&&Number.isInteger(old.stock)&&old.stock>=0&&old.stock<=node.max){
        node.stock=old.stock;
      }
    }
    target.structures=saved.structures.filter(s=>s&&['campfire','shelter'].includes(s.type)&&
      Number.isInteger(s.x)&&Number.isInteger(s.y)&&s.x>=0&&s.x<target.width&&
      s.y>=0&&s.y<target.height&&Frontier.terrainAt(target,s.x,s.y)!=='water'
    ).slice(0,80).map((v,i)=>({id:v.type+'_'+(i+1),type:v.type,x:v.x,y:v.y}));
  }
  root.AgentWorld={KEYS,newWorld,newAgent,focus,available,complete,nextPlanAction,validatePlan,stepNeeds,regenerate,fallback,restoreWorld};
})(globalThis);
