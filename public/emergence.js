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
  const KEYS = ['forage','collect_wood','collect_stone','eat','rest',
    'share_food','socialize','build_fire','explore','none'];
  const skillNames = {forage:'foraging',collect_wood:'gathering',collect_stone:'gathering',
    share_food:'cooperation',socialize:'socializing',build_fire:'building',explore:'exploring'};
  function newWorld() {
    return { version:1, nodes:RESOURCE_SEEDS.map(([id,kind,x,y,max])=>({
      id,kind,x,y,max,stock:max
    })), structures:[] };
  }
  function newAgent(n, index=0) {
    n.needs = { hunger:28+(index*9)%35, social:35+(index*7)%32,
      curiosity:40+(index*11)%36 };
    n.inventory = { food:1,wood:0,stone:0 };
    n.skills = { foraging:0,gathering:0,cooperation:0,socializing:0,building:0,exploring:0 };
    n.visited = [];
    n.task = null;
    return n;
  }
  function focus(n) {
    const entries=Object.entries(n.skills||{}).sort((a,b)=>b[1]-a[1]);
    if(!entries.length||entries[0][1]<3)return 'Still finding their interests';
    return 'Drawn toward '+entries[0][0]+' ('+entries[0][1]+' actions)';
  }
  function findNode(n,world,kind,canReach) {
    return world.nodes.filter(node=>node.kind===kind&&node.stock>0&&distance(n,node)<=18)
      .filter(node=>canReach(node)).sort((a,b)=>distance(n,a)-distance(n,b))[0]||null;
  }
  function nearestResident(n,residents,condition=()=>true) {
    return residents.filter(other=>other.id!==n.id&&distance(n,other)<=8&&condition(other))
      .sort((a,b)=>distance(a,n)-distance(b,n))[0]||null;
  }
  function exploreTarget(n,canReach) {
    // Evaluate a small ring of vantage points, not hundreds of BFS paths per decision.
    // All inhabitants use the same directions; past visits change where they choose.
    const directions=[[7,0],[-7,0],[0,7],[0,-7],[6,6],[-6,6],[6,-6],[-6,-6],
      [12,3],[-12,3],[3,12],[-3,-12],[9,-4],[-9,4]];
    const seen=new Set(n.visited||[]);
    let seed=0;for(const c of n.id)seed=seed*31+c.charCodeAt(0)|0;
    let best=null,score=-Infinity;
    for(const [dx,dy] of directions){
      const point={x:n.x+dx,y:n.y+dy};
      if(point.x<0||point.x>=40||point.y<0||point.y>=26||!canReach(point))continue;
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
    for(const [kind,key,label] of [['food','forage','food'],['wood','collect_wood','wood'],['stone','collect_stone','stone']]){
      const node=findNode(n,world,kind,canReach);
      if(node&&n.energy>=12){
        add(key,'Collect '+label+' from a visible source ('+node.stock+' remaining, '+distance(n,node)+' tiles away)',node,node.id);
      }
    }
    if(n.inventory.food>0&&n.needs.hunger>=10)
      add('eat','Eat one carried food to reduce hunger ('+Math.round(n.needs.hunger)+'/100)');
    if(n.energy<88)add('rest','Rest until recovered (energy '+Math.round(n.energy)+'/100)');
    const recipient=nearestResident(n,residents,other=>other.needs?.hunger>=40);
    if(recipient&&n.inventory.food>0)
      add('share_food','Give one food to nearby hungry '+recipient.name,recipient,recipient.id);
    const other=nearestResident(n,residents);
    if(other)add('socialize','Seek out '+other.name+' to spend time together',other,other.id);
    if(n.inventory.wood>=2&&n.inventory.stone>=1&&n.energy>=18&&
       !world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
      add('build_fire','Build a shared campfire using 2 wood and 1 stone');
    const destination=exploreTarget(n,canReach);
    if(destination&&n.energy>=10)
      add('explore','Explore an unfamiliar reachable area ('+distance(n,destination)+' tiles)',destination);
    add('none','Continue the current activity or observe before deciding');
    return list;
  }
  function complete(n,world,residents) {
    const task=n.task;
    if(!task)return {ok:false,message:'No task'};
    n.task=null;
    let message='';
    if(['forage','collect_wood','collect_stone'].includes(task.key)){
      const node=world.nodes.find(v=>v.id===task.ref);
      if(!node||node.stock<1||distance(n,node)>1)return {ok:false,message:'Resource no longer available'};
      // Repeated practice gradually improves output; expertise is earned, never assigned.
      const expertise=n.skills[skillNames[task.key]]||0;
      const collected=Math.min(node.stock,2+Math.min(2,Math.floor(expertise/3)));
      node.stock-=collected;
      n.inventory[node.kind]+=collected;
      n.energy=clamp(n.energy-3*collected);
      message='Collected '+collected+' '+node.kind+' (source '+node.stock+'/'+node.max+' remaining)';
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
      n.relationships[other.id]=clamp((n.relationships[other.id]??50)+2);
      other.relationships[n.id]=clamp((other.relationships[n.id]??50)+2);
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
  function stepNeeds(n,world,dt) {
    n.needs.hunger=clamp(n.needs.hunger+dt*.065);
    n.needs.social=clamp(n.needs.social+dt*.025);
    n.needs.curiosity=clamp(n.needs.curiosity+dt*.016);
    n.energy=clamp(n.energy-dt*.045);
    if(n.action==='rest'){
      const warm=world.structures.some(site=>site.type==='campfire'&&distance(n,site)<=3);
      n.energy=clamp(n.energy+dt*(warm?.52:.26));
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
      node.regrow=(node.regrow||0)+dt*(node.kind==='food'?.018:.008);
      while(node.regrow>=1&&node.stock<node.max){node.stock++;node.regrow--;}
    }
  }
  function fallback(n,options) {
    const keys=new Set(options.map(o=>o.key));
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
    target.structures=saved.structures.filter(s=>s&&s.type==='campfire'&&
      Number.isInteger(s.x)&&Number.isInteger(s.y)&&s.x>=0&&s.x<40&&s.y>=0&&s.y<26
    ).slice(0,50).map((v,i)=>({id:'fire_'+(i+1),type:'campfire',x:v.x,y:v.y}));
  }
  root.AgentWorld={KEYS,newWorld,newAgent,focus,available,complete,stepNeeds,regenerate,fallback,restoreWorld};
})(globalThis);
