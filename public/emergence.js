// Small world-rule kernel. Agents have needs and histories, never assigned professions.
// Rein chooses from valid local affordances; this module executes and validates outcomes.
(function (root) {
  'use strict';
  const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
  const distance = (a,b) => Frontier.distance({width:Frontier.WIDTH,height:Frontier.HEIGHT},a,b);
  const KEYS = ['forage','collect_wood','collect_stone','collect_fiber','fill_water',
    'eat','drink','rest','share_food','socialize','build_fire','craft_hatchet',
    'build_shelter','experiment_wood_stone','experiment_wood_fiber',
    'experiment_wood_stone_fiber',...Object.keys(root.Crafting.RECIPES).map(id=>'craft_'+id),
    'craft_stage','make_workbench','place_crate','stash_wood','stash_stone','stash_fiber',
    'withdraw_wood','withdraw_stone','withdraw_fiber','inspect','drop_wood','pickup_item','build_cache','store_wood','retrieve_wood','explore','none'];
  const skillNames = {forage:'foraging',collect_wood:'gathering',collect_stone:'gathering',
    collect_fiber:'gathering',fill_water:'survival',drink:'survival',
    craft_hatchet:'crafting',build_shelter:'building',build_cache:'building',inspect:'exploring',
    socialize:'socializing',build_fire:'building',explore:'exploring',experiment_wood_stone:'crafting',
    experiment_wood_fiber:'crafting',experiment_wood_stone_fiber:'crafting'};
  function newWorld(seed=Frontier.DEFAULT_SEED) {
    const island=Frontier.generate(seed);
    return {version:3,now:0,seed:island.seed,width:island.width,height:island.height,
      terrain:island.terrain,discovered:{},edits:{},zMin:Frontier.MIN_Z,zMax:Frontier.MAX_Z,
      weather:Frontier.weather(island,480),
      nodes:island.resources,
      structures:[],items:[],itemSeq:1};
  }
  function newAgent(n, index=0) {
    n.needs = { hunger:28+(index*9)%35, thirst:24+(index*7)%28,
      social:35+(index*7)%32, curiosity:40+(index*11)%36 };
    n.inventory = { food:1,water:2,wood:0,stone:0,fiber:0,hatchet:0,
      cord:0,blade:0,plank:0,crate:0 };
    n.skills = { foraging:0,gathering:0,crafting:0,survival:0,
      socializing:0,building:0,exploring:0 };
    n.bio = Biology.create(index,n.inventory.food);
    n.knowledge ||= {recipes:[],observations:[]};
    n.visited = [];
    n.task = null;
    n.plan = null;
    n.craftedItems=[];n.workpiece=null;
    n.peerLog = [];
    n.memories ||= [];
    n.lastPeerAt = -100000;
    return n;
  }
  function focus(n) {
    const entries=Object.entries(n.skills||{}).sort((a,b)=>b[1]-a[1]);
    if(!entries.length||entries[0][1]<3)return 'Still finding their interests';
    return 'Drawn toward '+entries[0][0]+' ('+entries[0][1]+' actions)';
  }
  const OBJECT_LABELS={food:'Berry shrub',wood:'Standing tree',
    stone:'Stone outcrop',fiber:'Wild reeds',water:'Freshwater spring'};
  function objectById(world,id){
    return world.nodes.find(o=>o.id===id)||
      world.items.find(o=>o.id===id)||
      world.structures.find(o=>o.id===id)||null;
  }
  function describeObject(world,object){
    if(!object)return null;
    if(Object.hasOwn(OBJECT_LABELS,object.kind)&&object.max!==undefined){
      const condition=object.stock===0?'depleted':
        object.stock<=object.max/3?'sparse':'available';
      return {id:object.id,name:OBJECT_LABELS[object.kind],kind:object.kind,
        x:object.x,y:object.y,condition,stock:object.stock,max:object.max,
        description:OBJECT_LABELS[object.kind]+', '+condition+
          ' ('+object.stock+'/'+object.max+' units); habitat '+
          Frontier.terrainAt(world,object.x,object.y)};
    }
    if(object.type==='crate')
      return {id:object.id,name:'Wooden storage crate',kind:'crate',
       x:object.x,y:object.y,condition:'constructed',
       description:'Quality '+object.craftQuality+'/5 storage crate by '+
        (object.maker||'unknown')+'; '+Object.entries(object.contents||{})
         .map(([k,v])=>k+': '+v).join(', ')+'; capacity '+object.capacity};
    if(object.type==='workbench')
      return {id:object.id,name:'Woodworking bench',kind:'workbench',
        x:object.x,y:object.y,condition:'constructed',
        description:'A constructed workbench (quality '+(object.craftQuality||1)+'/5) for fine timber work'};
    if(object.type==='cache')
      return {id:object.id,name:'Material cache',kind:'cache',x:object.x,y:object.y,
        condition:'constructed',description:'A simple storage cache with '+
          (object.contents?.wood||0)+'/12 units of stored wood'};
    if(object.type==='campfire'||object.type==='shelter')
      return {id:object.id,name:object.type==='campfire'?'Campfire':'Shelter',
        kind:object.type,x:object.x,y:object.y,condition:'constructed',
        description:'A constructed '+object.type+' at '+object.x+','+object.y};
    if(object.kind==='wood'&&object.count===1)
      return {id:object.id,name:'Dropped wood',kind:'wood',x:object.x,y:object.y,
        condition:'on ground',description:'One unit of wood lying on the ground'};
    return null;
  }
  function inspectTarget(n,world,canReach){
    const seen=new Set((n.knowledge?.observations||[]).map(o=>o.id));
    return [...world.nodes,...world.structures,...world.items]
      .filter(o=>!seen.has(o.id)&&distance(n,o)<=8&&
        describeObject(world,o)&&canReach(o))
      .sort((a,b)=>distance(n,a)-distance(n,b)||
        a.id.localeCompare(b.id))[0]||null;
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
      const point={x:Frontier.wrap(n.x+dx,world.width),y:Frontier.wrap(n.y+dy,world.height),z:n.z||0};
      if(!canReach(point))continue;
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
    if(!n.plan&&n.inventory.water<2&&findNode(n,world,'water',canReach))
      add('stock_water','Prepare an emergency reserve of clean drinking water');
    if(!n.plan&&n.inventory.wood<3&&findNode(n,world,'wood',canReach))
      add('stock_wood','Gather several units of wood for future work');
    if(!n.plan&&n.inventory.stone<2&&findNode(n,world,'stone',canReach))
      add('stock_stone','Gather a small supply of usable stone');
    if(!n.plan&&n.inventory.fiber<3&&findNode(n,world,'fiber',canReach))
      add('stock_fiber','Collect plant fiber for making cord and bindings');
    if(n.inventory.food>0&&n.needs.hunger>=10)
      add('eat','Eat carried food (hunger '+Math.round(n.needs.hunger)+'/100)');
    if(n.inventory.water>0&&n.needs.thirst>=10)
      add('drink','Drink carried water (thirst '+Math.round(n.needs.thirst)+'/100)');
    if(n.inventory.wood>=1&&n.inventory.stone>=1&&n.inventory.fiber>=1&&n.inventory.hatchet===0){
      if(n.knowledge?.recipes?.includes('hatchet'))
        add('craft_hatchet','Use a learned method to craft a stone hatchet');
      else add('experiment_wood_stone_fiber','Try joining wood, stone and fiber; outcome unknown');
    }
    if(n.energy<60)add('rest','Rest until recovered (energy '+Math.round(n.energy)+'/100)');
    const recipient=nearestResident(n,residents);
    if(recipient&&n.inventory.food>0)
      add('share_food','Offer one carried food to nearby '+recipient.name,recipient,recipient.id);
    const other=nearestResident(n,residents,p=>!p.task&&!p.plan&&
      !p.path?.length&&!p.peerPending&&!p.peerReservedFor);
    if(other && world.now-(n.lastPeerAt ?? -100000)>=90)
      add('socialize','Seek out '+other.name+' and initiate a real conversation',other,other.id);
    if(n.inventory.wood>=2&&n.inventory.stone>=1){
      if(!n.knowledge.recipes.includes('campfire'))
        add('experiment_wood_stone','Experiment with wood and stone; outcome unknown');
      else if(n.energy>=18&&!world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
        add('build_fire','Use a learned method to build a campfire');
    }
    if(!n.plan && n.energy>=12 && n.inventory.food<2 &&
       findNode(n,world,'food',canReach))
      add('stock_food','Commit to obtaining a small food reserve, gathering what is needed');
    if(n.knowledge.recipes.includes('campfire')&&!n.plan && n.energy>=18 &&
       !world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5) &&
       (n.inventory.wood>=2||findNode(n,world,'wood',canReach)) &&
       (n.inventory.stone>=1||findNode(n,world,'stone',canReach)))
      add('make_campfire','Commit to building a communal campfire, collecting any missing materials');
    if(n.inventory.wood>=4&&n.inventory.fiber>=3){
      if(!n.knowledge.recipes.includes('shelter'))
        add('experiment_wood_fiber','Experiment with wood and fiber; outcome unknown');
      else if(n.energy>=22&&!world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
        add('build_shelter','Use a learned method to construct a shelter');
    }
    if(n.knowledge.recipes.includes('shelter')&&!n.plan&&n.energy>=20&&
       !world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5)&&
       (n.inventory.wood>=4||findNode(n,world,'wood',canReach))&&
       (n.inventory.fiber>=3||findNode(n,world,'fiber',canReach)))
      add('make_shelter','Form an intention to collect materials and construct a shelter');
    if(!n.plan&&!n.workpiece&&n.energy>=20&&
       !world.structures.some(site=>site.type==='workbench'&&distance(n,site)<5))
      add('make_workbench','Commit to a primitive workbench: gather fiber, make cord, collect wood and stone, then build in stages');
    if(n.knowledge.recipes.includes('shelter')&&n.inventory.wood>=2&&
      n.inventory.fiber>=1&&n.energy>=20&&
      !world.structures.some(site=>site.type==='cache'&&distance(n,site)<3))
      add('build_cache','Build a small wood-and-fiber storage cache using a known method');
    const cache=world.structures.filter(site=>site.type==='cache'&&
      distance(n,site)<=8&&canReach(site)).sort((a,b)=>distance(n,a)-distance(n,b))[0];
    if(cache){
      if(n.inventory.wood>0&&(cache.contents?.wood||0)<12)
        add('store_wood','Store one carried wood in a nearby material cache',cache,cache.id);
      if(n.inventory.wood<2&&(cache.contents?.wood||0)>0)
        add('retrieve_wood','Take one stored wood from a nearby cache',cache,cache.id);
    }
    for(const job of root.Crafting.options(n,world))
      add(job.key,job.when,job.target||null,job.ref||null);
    const examine=inspectTarget(n,world,canReach);
    if(examine&&n.energy>=10)
      add('inspect','Examine '+describeObject(world,examine).name+
        ' at '+examine.x+','+examine.y+' to learn its condition',examine,examine.id);
    const loose=world.items.find(item=>item.count===1&&item.kind==='wood'&&
      distance(n,item)<=8&&canReach(item));
    if(loose&&n.inventory.wood<1000)
      add('pickup_item','Pick up one piece of wood lying on the ground',loose,loose.id);
    if(n.inventory.wood>=4&&world.items.length<120&&
      !world.items.some(item=>distance(n,item)<=1))
      add('drop_wood','Place one unit of carried wood on the ground');
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
    if(task.key==='place_crate'||/^(stash|withdraw)_(wood|stone|fiber)$/.test(task.key)){
      const result=root.Crafting.interact(n,world,task.key,task.ref);
      if(!result.ok)return result;
      message=result.message;
    }else if(task.key==='craft_stage'||root.Crafting.getRecipe(task.key.slice(6))){
      let outcome;
      if(task.key==='craft_stage'){
        outcome=root.Crafting.advance(n,world);
      }else{
        const id=task.key.slice(6);
        outcome=root.Crafting.begin(n,world,id,task.ref);
        if(outcome.ok)n.plan={key:'craft_project',recipe:id,steps:0};
      }
      if(!outcome.ok)return outcome;
      message=outcome.message;
    }else if(['forage','collect_wood','collect_stone','collect_fiber','fill_water'].includes(task.key)){
      const node=world.nodes.find(v=>v.id===task.ref);
      if(!node||node.stock<1||distance(n,node)>1)return {ok:false,message:'Resource no longer available'};
      // Repeated practice gradually improves output; expertise is earned, never assigned.
      const expertise=n.skills[skillNames[task.key]]||0;
      const hatchetQuality=n.craftedItems?.find(item=>item.kind==='hatchet')?.quality||2;
      const axeBonus=n.inventory.hatchet&&task.key==='collect_wood'?
       (hatchetQuality>=4?2:1):0;
      const collected=Math.min(node.stock,2+Math.min(2,Math.floor(expertise/3))+
        axeBonus);
      // Do not commit a food harvest unless both inventory and nutrition
      // bookkeeping can accept all gathered portions.
      if(node.kind==='food'){
        const foodId=node.id.startsWith('berry_')?'berries':
          Biology.foodForBiome(Frontier.terrainAt(world,node.x,node.y));
        if(!Biology.addForaged(n.bio,foodId,collected))
          return {ok:false,message:'Food inventory full'};
      }
      node.stock-=collected;
      n.inventory[node.kind]+=collected;
      n.energy=clamp(n.energy-3*collected);
      message='Collected '+collected+' '+node.kind+' (source '+node.stock+'/'+node.max+' remaining)';
    }else if(task.key==='inspect'){
      const target=objectById(world,task.ref);
      if(!target||distance(n,target)>1)return {ok:false,message:'Object is no longer nearby'};
      const info=describeObject(world,target);
      if(!info)return {ok:false,message:'Unknown object'};
      n.knowledge.observations ||= [];
      n.knowledge.observations.push({id:info.id,kind:info.kind,
        at:world.now,text:info.description});
      n.knowledge.observations=n.knowledge.observations.slice(-40);
      n.needs.curiosity=clamp(n.needs.curiosity-12);
      message='Inspected '+info.description;
    }else if(task.key==='drop_wood'){
      if(n.inventory.wood<1||world.items.length>=120||
        world.items.some(item=>distance(n,item)<=1))
        return {ok:false,message:'Unable to leave material here'};
      const item={id:'item_'+world.itemSeq++,kind:'wood',count:1,x:n.x,y:n.y};
      world.items.push(item);n.inventory.wood--;
      message='Placed one wood on the ground at '+n.x+','+n.y;
    }else if(task.key==='pickup_item'){
      const index=world.items.findIndex(item=>item.id===task.ref);
      const item=world.items[index];
      if(!item||item.kind!=='wood'||item.count!==1||
        distance(n,item)>1||n.inventory.wood>=1000)
        return {ok:false,message:'Loose item is unavailable'};
      world.items.splice(index,1);n.inventory.wood++;
      message='Picked up one wood from the ground';
    }else if(task.key==='drink'){
      if(n.inventory.water<1)return {ok:false,message:'No drinkable water'};
      n.inventory.water--;n.needs.thirst=clamp(n.needs.thirst-48);
      Biology.drink(n.bio,400);
      message='Drank fresh water; thirst now '+Math.round(n.needs.thirst);
    }else if(['experiment_wood_stone','experiment_wood_fiber',
      'experiment_wood_stone_fiber'].includes(task.key)){
      const experiments={
        experiment_wood_stone:{recipe:'campfire',materials:{wood:2,stone:1},consumed:'wood'},
        experiment_wood_fiber:{recipe:'shelter',materials:{wood:4,fiber:3},consumed:'fiber'},
        experiment_wood_stone_fiber:{recipe:'hatchet',materials:{wood:1,stone:1,fiber:1},consumed:'fiber'}
      };
      const experiment=experiments[task.key];
      if(n.knowledge.recipes.includes(experiment.recipe)||
         Object.entries(experiment.materials).some(([k,v])=>n.inventory[k]<v))
        return {ok:false,message:'Experiment unavailable'};
      n.inventory[experiment.consumed]--;
      n.knowledge.recipes.push(experiment.recipe);
      message='Experiment revealed a usable '+experiment.recipe+' construction method';
    }else if(task.key==='craft_hatchet'){
      if(!n.knowledge?.recipes?.includes('hatchet'))
        return {ok:false,message:'The crafting process is not known'};
      if(n.inventory.hatchet||n.inventory.wood<1||n.inventory.stone<1||n.inventory.fiber<1)
        return {ok:false,message:'Missing tool materials'};
      n.inventory.wood--;n.inventory.stone--;n.inventory.fiber--;
      n.inventory.hatchet=1;message='Crafted a stone hatchet for faster wood gathering';
    }else if(task.key==='build_cache'){
      if(!n.knowledge.recipes.includes('shelter')||n.inventory.wood<2||
        n.inventory.fiber<1||n.energy<20||
        world.structures.some(site=>site.type==='cache'&&distance(n,site)<3))
        return {ok:false,message:'Cannot construct a cache here'};
      n.inventory.wood-=2;n.inventory.fiber--;n.energy=clamp(n.energy-8);
      const cache={id:'cache_'+(world.structures.length+1),type:'cache',
        x:n.x,y:n.y,contents:{wood:0}};
      world.structures.push(cache);
      message='Constructed an empty material cache at '+n.x+','+n.y;
    }else if(task.key==='store_wood'||task.key==='retrieve_wood'){
      const cache=world.structures.find(site=>site.id===task.ref&&site.type==='cache');
      if(!cache||distance(n,cache)>1)
        return {ok:false,message:'Material cache not reachable'};
      cache.contents ||= {wood:0};
      if(task.key==='store_wood'){
        if(n.inventory.wood<1||cache.contents.wood>=12)
          return {ok:false,message:'No room or wood to store'};
        n.inventory.wood--;cache.contents.wood++;
        message='Stored one wood in cache ('+cache.contents.wood+'/12)';
      }else{
        if(cache.contents.wood<1||n.inventory.wood>=1000)
          return {ok:false,message:'No stored wood available'};
        cache.contents.wood--;n.inventory.wood++;
        message='Retrieved one wood from cache ('+cache.contents.wood+'/12 left)';
      }
    }else if(task.key==='build_shelter'){
      if(!n.knowledge.recipes.includes('shelter'))
        return {ok:false,message:'Shelter construction method is not known'};
      if(n.inventory.wood<4||n.inventory.fiber<3||n.energy<22||
         world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
        return {ok:false,message:'Cannot build shelter at this location'};
      n.inventory.wood-=4;n.inventory.fiber-=3;n.energy=clamp(n.energy-16);
      world.structures.push({id:'shelter_'+(world.structures.length+1),
        type:'shelter',x:n.x,y:n.y});
      message='Built a shared shelter at '+n.x+','+n.y;
    }else if(task.key==='eat'){
      if(n.inventory.food<1)return {ok:false,message:'No food left'};
      // The player and all NPCs digest the same defined food composition.
      // Legacy food stacks are reconciled with a generic travel ration.
      if(n.bio.pantry.length!==n.inventory.food)
        n.bio=Biology.restore(n.bio,n.inventory.food);
      const meal=Biology.ingest(n.bio,world.now);
      if(!meal)return {ok:false,message:'No edible food in inventory'};
      n.inventory.food--;n.needs.hunger=clamp(n.needs.hunger-44);
      message='Ate '+meal.name+' ('+Math.round(meal.kcal)+' kcal); hunger now '+
        Math.round(n.needs.hunger);
    }else if(task.key==='share_food'||task.key==='socialize'){
      const other=residents.find(v=>v.id===task.ref);
      if(!other||distance(n,other)>2)return {ok:false,message:'The other resident moved away'};
      if(task.key==='share_food'){
        if(n.inventory.food<1)return {ok:false,message:'No food left to share'};
        if(!other.bio||!n.bio ||other.inventory.food>=1000)
          return {ok:false,message:'Food transfer unavailable'};
        if(n.bio.pantry.length!==n.inventory.food)n.bio=Biology.restore(n.bio,n.inventory.food);
        if(other.bio.pantry.length!==other.inventory.food)
          other.bio=Biology.restore(other.bio,other.inventory.food);
        if(!Biology.transferFood(n.bio,other.bio))
          return {ok:false,message:'Cannot transfer food portion'};
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
        // Transfer is factual; relationship interpretations belong to each actor.
      }else{
        n.lastPeerAt=world.now;
        other.lastPeerAt=world.now;
      }
    }else if(task.key==='build_fire'){
      if(!n.knowledge.recipes.includes('campfire'))
        return {ok:false,message:'Campfire construction method is not known'};
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
    if(n.plan.key==='stock_water'){
      if(n.inventory.water>=2)return {status:'done'};
      key='fill_water';
    }else if(n.plan.key==='stock_wood'){
      if(n.inventory.wood>=3)return {status:'done'};
      key='collect_wood';
    }else if(n.plan.key==='stock_stone'){
      if(n.inventory.stone>=2)return {status:'done'};
      key='collect_stone';
    }else if(n.plan.key==='stock_fiber'){
      if(n.inventory.fiber>=3)return {status:'done'};
      key='collect_fiber';
    }else if(n.plan.key==='stock_food'){
      if(n.inventory.food>=2)return {status:'done'};
      key='forage';
    }else if(n.plan.key==='make_shelter'){
      if(world.structures.some(site=>site.type==='shelter'&&distance(n,site)<5))
        return {status:'done'};
      if(n.inventory.wood<4)key='collect_wood';
      else if(n.inventory.fiber<3)key='collect_fiber';
      else key='build_shelter';
    }else if(n.plan.key==='craft_project'){
      if(!n.workpiece)return {status:'done'};
      key='craft_stage';
    }else if(n.plan.key==='make_campfire'){
      if(world.structures.some(site=>site.type==='campfire'&&distance(n,site)<5))
        return {status:'done'};
      if(n.inventory.wood<2)key='collect_wood';
      else if(n.inventory.stone<1)key='collect_stone';
      else key='build_fire';
    }else return {status:'blocked',reason:'Unrecognized intention'};
    if(n.energy<20&&key!=='rest')key='rest';
    const option=available(n,world,residents,canReach).find(a=>a.key===key);
    return option?{status:'action',option}:{status:'blocked',reason:'Required resource or location unavailable'};
  }
  function validatePlan(saved){
    if(!saved || !['stock_food','stock_water','stock_wood','stock_stone','stock_fiber',
      'make_campfire','make_shelter','make_workbench','craft_project'].includes(saved.key) ||
       !Number.isInteger(saved.steps) || saved.steps<0 || saved.steps>24)return null;
    return saved.key==='craft_project'?
      {key:saved.key,recipe:root.Crafting.getRecipe(saved.recipe)?saved.recipe:null,steps:saved.steps}:
      {key:saved.key,steps:saved.steps};
  }
  function stepNeeds(n,world,dt) {
    // Biology owns digestion, fuel, hydration budget, sleep pressure and
    // normalized endocrine indices; needs are experienced gameplay pressures.
    const sheltered=world.structures.some(site=>site.type==='shelter'&&distance(n,site)<=4);
    const warm=world.structures.some(site=>site.type==='campfire'&&distance(n,site)<=3);
    const phys=Biology.advance(n.bio,dt,{
      clock:world.now,temperatureC:world.weather?.temperature??20,
      weather:world.weather?.kind,resting:n.action==='rest',sheltered,
      moving:!!n.path?.length
    });
    const appetite=Biology.appetiteDrive(n.bio)/100;
    const dryness=1-clamp(n.bio.hydrationBudgetMl/3000,0,1);
    n.needs.hunger=clamp(n.needs.hunger+dt*(.035+.045*appetite));
    n.needs.thirst=clamp(n.needs.thirst+dt*(.037+.07*dryness));
    n.needs.social=clamp(n.needs.social+dt*.025);
    n.needs.curiosity=clamp(n.needs.curiosity+dt*.016);
    n.energy=clamp(n.energy-dt*(.045+
      (n.bio.sleepDebt>70?.024:0)+(n.bio.stress>70?.015:0)+
      (phys?.energyShortfallKcal>0?.1:0)));
    if(['storm','rain','snow'].includes(world.weather?.kind)&&!sheltered)
      n.energy=clamp(n.energy-dt*.055);
    if(n.action==='rest'){
      // Nutrition influences recovery only modestly; an early-game unbalanced
      // diet should not make sleeping or survival impossible.
      const diet=Biology.nutrition(n.bio,world.now);
      const recovered=dt*(sheltered?.66:warm?.52:.26)*
        (.95+.05*diet.adequacy/100);
      n.energy=clamp(n.energy+recovered);
      if(n.energy>=90){
        n.action='none';n.goal='Recovered and considering what to do';
        return 'Recovered';
      }
    }
    return null;
  }
  function regenerate(world,dt){
    // Gradual finite regeneration, never more than a node's starting capacity.
    for(const node of world.nodes){
      if(node.stock>=node.max)continue;
      const season=world.weather?.season||'Spring';
      const growth=season==='Winter'?.08:season==='Autumn'?.50:
        season==='Summer'?1.25:1;
      const precipitation=['rain','storm','snow'].includes(world.weather?.kind);
      const rate=node.kind==='water'?.027*(precipitation?1.5:.8):
        node.kind==='food'?.018*growth:
        node.kind==='fiber'?.012*growth:.008;
      node.regrow=(node.regrow||0)+dt*rate;
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
    if(keys.has('craft_stage'))return 'craft_stage';
    if(n.inventory.fiber>=3&&n.inventory.cord<2&&keys.has('craft_cord'))return 'craft_cord';
    if(n.inventory.stone>=2&&n.inventory.blade<1&&keys.has('craft_blade'))return 'craft_blade';
    if(n.inventory.blade>=1&&n.inventory.cord>=1&&n.inventory.wood>=1&&
      n.inventory.hatchet===0&&keys.has('craft_hafted_hatchet'))return 'craft_hafted_hatchet';
    if(n.needs.curiosity>=45&&keys.has('inspect'))return 'inspect';
    // Simple survival stockpiles are mechanical routines, not invented
    // relationships, inventions, or claims of AI deliberation.
    if(n.inventory.water<2&&keys.has('fill_water'))return 'fill_water';
    if(n.inventory.food<2&&keys.has('forage'))return 'forage';
    return keys.has('explore')?'explore':'none';
  }
  function restoreWorld(target,saved) {
    if(!saved||!Array.isArray(saved.nodes)||!Array.isArray(saved.structures))return;
    target.items=Array.isArray(saved.items)?saved.items.filter(item=>item&&
      /^item_[1-9]\d*$/.test(item.id)&&item.kind==='wood'&&item.count===1&&
      Number.isInteger(item.x)&&Number.isInteger(item.y)&&
      item.x>=0&&item.x<target.width&&item.y>=0&&item.y<target.height&&
      Frontier.traversable(target,item.x,item.y,0)).slice(0,120):[];
    target.itemSeq=Math.max(1,...target.items.map(item=>Number(item.id.slice(5))+1));
    if(Number.isInteger(saved.itemSeq)&&saved.itemSeq>target.itemSeq)
      target.itemSeq=Math.min(saved.itemSeq,1000000000);
    for(const node of target.nodes){
      const old=saved.nodes.find(v=>v.id===node.id&&v.kind===node.kind);
      if(old&&Number.isInteger(old.stock)&&old.stock>=0&&old.stock<=node.max){
        node.stock=old.stock;
      }
    }
    target.structures=saved.structures.filter(s=>s&&['campfire','shelter','cache','workbench','crate'].includes(s.type)&&
      Number.isInteger(s.x)&&Number.isInteger(s.y)&&s.x>=0&&s.x<target.width&&
      s.y>=0&&s.y<target.height&&Frontier.terrainAt(target,s.x,s.y)!=='water'
    ).slice(0,80).map((v,i)=>({
      id:typeof v.id==='string'&&/^(?:fire|campfire|shelter|cache)_[1-9]\d*$/.test(v.id)?
        v.id:v.type+'_'+(i+1),
      type:v.type,x:v.x,y:v.y,
      ...(v.type==='workbench'?{craftQuality:Number.isInteger(v.craftQuality)?
       Math.max(1,Math.min(5,v.craftQuality)):1,maker:String(v.maker||'').slice(0,64)}:{}),
      ...(v.type==='crate'?{
       craftQuality:Number.isInteger(v.craftQuality)?
        Math.max(1,Math.min(5,v.craftQuality)):1,
       maker:String(v.maker||'').slice(0,64),
       capacity:8+(Number.isInteger(v.craftQuality)?
        Math.max(1,Math.min(5,v.craftQuality)):1)*4,
       contents:(()=>{
        const quality=Number.isInteger(v.craftQuality)?
         Math.max(1,Math.min(5,v.craftQuality)):1;
        const capacity=8+quality*4,contents={wood:0,stone:0,fiber:0};
        let remaining=capacity;
        for(const kind of Object.keys(contents)){
         const count=Number.isInteger(v.contents?.[kind])?
          Math.max(0,Math.min(v.contents[kind],remaining)):0;
         contents[kind]=count;remaining-=count;
        }
        return contents;
       })()}:{}),
      ...(v.type==='cache'?{contents:{wood:Number.isInteger(v.contents?.wood)?
        Math.max(0,Math.min(12,v.contents.wood)):0}}:{})
    }));
  }
  root.AgentWorld={KEYS,newWorld,newAgent,focus,available,complete,nextPlanAction,
    validatePlan,stepNeeds,regenerate,fallback,restoreWorld,describeObject,objectById};
})(globalThis);
