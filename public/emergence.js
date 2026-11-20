// Small world-rule kernel. Agents have needs and histories, never assigned professions.
// Rein chooses from valid local affordances; this module executes and validates outcomes.
(function (root) {
  'use strict';
  const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
  const distance = (a,b) => Frontier.distance({width:Frontier.WIDTH,height:Frontier.HEIGHT},a,b);
  const KEYS = ['forage','collect_wood','collect_stone','collect_fiber','fill_water','drink_source',
    'eat','drink','rest','share_food','socialize','teach_flask','build_fire','craft_hatchet',
    'build_shelter','build_tile','design_home','experiment_wood_stone','experiment_wood_fiber',
    'experiment_wood_stone_fiber',...Object.keys(root.Crafting.RECIPES).map(id=>'craft_'+id),
    'craft_stage','place_crate','stash_wood','stash_stone','stash_fiber',
    'withdraw_wood','withdraw_stone','withdraw_fiber','inspect','drop_wood','drop_stone','drop_fiber','drop_flask','pickup_item','build_cache','store_wood','retrieve_wood','explore','none'];
  const HARVEST_KINDS=Object.freeze({forage:'food',collect_wood:'wood',
    collect_stone:'stone',collect_fiber:'fiber',fill_water:'water'});
  const GROUND_KINDS=Object.freeze(['wood','stone','fiber','flask']);
  const sameLevel=(a,b)=>(a.z||0)===(b.z||0);
  const skillNames = {forage:'foraging',collect_wood:'gathering',collect_stone:'gathering',
    collect_fiber:'gathering',fill_water:'survival',drink_source:'survival',drink:'survival',
    craft_hatchet:'crafting',build_shelter:'building',build_tile:'building',
    design_home:'building',
    build_cache:'building',inspect:'exploring',
    socialize:'socializing',teach_flask:'socializing',build_fire:'building',explore:'exploring',experiment_wood_stone:'crafting',
    experiment_wood_fiber:'crafting',experiment_wood_stone_fiber:'crafting'};
  function newWorld(seed=Frontier.DEFAULT_SEED) {
    const island=Frontier.generate(seed);
    return {version:3,now:0,seed:island.seed,width:island.width,height:island.height,
      generator:island.generator,terrain:island.terrain,discovered:{},edits:{},zMin:Frontier.MIN_Z,zMax:Frontier.MAX_Z,
      weather:Frontier.weather(island,480),
      nodes:island.resources,construction:root.Construction?.fresh(),
      structures:[],items:[],remains:[],itemSeq:1};
  }
  // Transitional physical-load view over the existing numeric inventory.
  // This computes measurements; it does not introduce a competing item store.
  // The volumes are armful bulk estimates, NOT free storage pockets or vessels.
  const ITEM_LOAD=Object.freeze({
    food:{kg:.25,liters:.4},water:{kg:.4,liters:.4},
    wood:{kg:2.5,liters:5},stone:{kg:2.2,liters:.85},
    fiber:{kg:.2,liters:1.5},hatchet:{kg:1.5,liters:1.5},
    cord:{kg:.3,liters:.4},blade:{kg:.45,liters:.3},
    plank:{kg:.9,liters:2},crate:{kg:5,liters:17},
    flask:{kg:.6,liters:1.2}
  });
  const MAX_CARRY_KG=32,MAX_CARRY_L=45;
  function carrying(n){
    let mass=0,bulk=0;
    for(const [kind,count] of Object.entries(n.inventory||{})){
      const def=ITEM_LOAD[kind];
      if(!def||!Number.isInteger(count)||count<0)
        return {valid:false,massKg:null,volumeL:null,
          maxMassKg:MAX_CARRY_KG,maxVolumeL:MAX_CARRY_L};
      mass+=count*def.kg;bulk+=count*def.liters;
    }
    return {valid:true,massKg:Number(mass.toFixed(3)),
      volumeL:Number(bulk.toFixed(3)),
      maxMassKg:MAX_CARRY_KG,maxVolumeL:MAX_CARRY_L};
  }
  const vesselRoom=n=>root.Crafting.vesselRoom(n);
  function roomFor(n,kind){
    const def=ITEM_LOAD[kind],load=carrying(n);
    if(!def||!load.valid)return 0;
    return Math.max(0,Math.min(1000-(n.inventory[kind]||0),
      Math.floor((MAX_CARRY_KG-load.massKg+1e-9)/def.kg),
      Math.floor((MAX_CARRY_L-load.volumeL+1e-9)/def.liters)));
  }
  function canCarryItem(n,item){
    if(!GROUND_KINDS.includes(item.kind)||item.count!==1||roomFor(n,item.kind)<1)return false;
    if(item.kind!=='flask')return true;
    const liquid=item.vessel?.waterUnits,load=carrying(n);
    if(!Number.isInteger(liquid)||liquid<0||liquid>root.Crafting.FLASK_CAPACITY)return false;
    const flask=ITEM_LOAD.flask,water=ITEM_LOAD.water;
    return load.massKg+flask.kg+liquid*water.kg<=load.maxMassKg+1e-9&&
     load.volumeL+flask.liters+liquid*water.liters<=load.maxVolumeL+1e-9;
  }
  // Instruction requires evidence of a *tested* method and a physical
  // example made by this resident. A recipe flag, rumor or found flask alone
  // is not proof that the speaker can explain how to manufacture one.
  function canTeachFlask(n){
    if(!n.knowledge?.recipes?.includes('flask')||
     !n.craftedItems?.some(x=>x.kind==='flask'&&x.maker===n.id&&
      typeof x.vesselId==='string'))return false;
    const m=n.evidenceMemory;
    return !!m?.methods?.some(method=>method.method==='flask'&&
     m.episodes?.some(e=>e.id===method.sourceEpisodeId&&
      e.receiptId===method.receiptId&&e.certainty==='observed'));
  }
  function newAgent(n, index=0) {
    n.needs = { hunger:28+(index*9)%35, thirst:24+(index*7)%28,
      social:35+(index*7)%32, curiosity:40+(index*11)%36 };
    // Every new resident begins with a functioning body, not free possessions.
    // Real hydration/glycogen are physiological reserves; pantry is inventory.
    n.inventory = { food:0,water:0,wood:0,stone:0,fiber:0,hatchet:0,
      cord:0,blade:0,plank:0,crate:0,flask:0 };
    n.skills = { foraging:0,gathering:0,crafting:0,survival:0,
      socializing:0,building:0,exploring:0 };
    n.bio = Biology.create(index,n.inventory.food);
    n.knowledge ||= {recipes:[],observations:[]};
    n.visited = [];
    n.task = null;
    n.plan = null;
    n.craftedItems=[];n.workpiece=null;
    n.project=null;n.completedProjects=[];
    n.evidenceMemory={sequence:0,episodes:[],facts:[],claims:[],summaries:[],methods:[],trials:[],comparisons:[],social:[],lastDay:0};
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
      world.structures.find(o=>o.id===id)||
      world.construction?.tiles.find(o=>o.id===id)||
      world.construction?.blueprints.find(o=>o.id===id)||
      world.remains?.find(o=>o.id===id)||null;
  }
  function describeObject(world,object){
    if(!object)return null;
    if(object.status==='BUILT'&&root.Construction?.LAYERS[object.kind])
     return {id:object.id,name:'Constructed '+object.kind+' tile',kind:object.kind,
      x:object.x,y:object.y,z:object.z,condition:'built',
      description:'Physical '+object.material+' '+object.kind+' built by '+
       object.actorId+' at '+object.builtAt+' (committed '+object.commandId+')'};
    if(object.status==='PLANNED'&&root.Construction?.LAYERS[object.kind])
     return {id:object.id,name:'Planned '+object.kind+' tile',kind:object.kind,
      x:object.x,y:object.y,z:object.z,condition:'unbuilt',
      description:'Unbuilt '+object.kind+' blueprint owned by '+object.actorId+
       '; declares intent only, with no materials consumed or shelter benefit'};
    if(object.kind==='remains')return {id:object.id,kind:'remains',name:'Remains',
      x:object.x,y:object.y,z:object.z,description:'Remains of a deceased resident'};
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
    if(object.kind==='flask'&&object.count===1)return {id:object.id,kind:'flask',
      name:'Carved wooden flask',x:object.x,y:object.y,z:object.z,
      description:'A carved wooden flask lying on the ground'};
    if(['wood','stone','fiber'].includes(object.kind)&&object.count===1)
      return {id:object.id,name:'Dropped '+object.kind,kind:object.kind,
        x:object.x,y:object.y,condition:'on ground',
        description:'One unit of '+object.kind+' lying on the ground'};
    return null;
  }
  function inspectTarget(n,world,canReach){
    const seen=new Set((n.knowledge?.observations||[]).map(o=>o.id));
    return [...world.nodes,...world.structures,...world.items,
      ...(world.construction?.tiles||[]),...(world.remains||[])]
      .filter(o=>!seen.has(o.id)&&(n.z||0)===(o.z||0)&&distance(n,o)<=8&&
        (o.kind!=='remains'||root.Perception?.line(world,n,o))&&
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
      ['stone','collect_stone','stone'],['fiber','collect_fiber','plant fiber']]){
      const node=findNode(n,world,kind,canReach);
      if(node&&n.energy>=12&&roomFor(n,kind)>0){
        add(key,'Collect '+label+' from a visible source ('+node.stock+' remaining, '+distance(n,node)+' tiles away)',node,node.id);
      }
    }
    const drinkable=findNode(n,world,'water',canReach);
    if(drinkable&&n.energy>=12&&vesselRoom(n)>0&&roomFor(n,'water')>0)
      add('fill_water','Fill carried water flask from a real freshwater source',drinkable,drinkable.id);
    if(drinkable&&(n.needs.thirst>=10||n.bio?.hydrationBudgetMl<2400))
      add('drink_source','Drink directly at a reachable freshwater source',
       drinkable,drinkable.id);
    if(!n.plan&&n.inventory.water<2&&vesselRoom(n)>0&&roomFor(n,'water')>0&&drinkable)
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
    if(recipient&&n.inventory.food>0&&roomFor(recipient,'food')>0)
      add('share_food','Offer one carried food to nearby '+recipient.name,recipient,recipient.id);
    const other=nearestResident(n,residents,p=>!p.task&&!p.plan&&
      !p.path?.length&&!p.peerPending&&!p.peerReservedFor);
    if(other && world.now-(n.lastPeerAt ?? -100000)>=90)
      add('socialize','Seek out '+other.name+' and initiate a real conversation',other,other.id);
    if(n.energy>=20&&!n.workpiece&&!n.task&&!n.plan&&canTeachFlask(n)){
      const student=nearestResident(n,residents,p=>p.alive!==false&&
       p.energy>=20&&p.needs.curiosity>=45&&!p.task&&!p.plan&&!p.path?.length&&
       !p.peerPending&&!p.peerReservedFor&&
       !p.knowledge?.recipes?.includes('flask')&&canReach(p));
      if(student)
       add('teach_flask','Explain the tested sealing method using a real flask to '+student.name,
        student,student.id);
    }
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
    if(n.knowledge.recipes.includes('shelter')&&n.inventory.wood>=2&&
      n.inventory.fiber>=1&&n.energy>=20&&
      !world.structures.some(site=>site.type==='cache'&&distance(n,site)<3))
      add('build_cache','Build a small wood-and-fiber storage cache using a known method');
    const cache=world.structures.filter(site=>site.type==='cache'&&
      distance(n,site)<=8&&canReach(site)).sort((a,b)=>distance(n,a)-distance(n,b))[0];
    if(cache){
      if(n.inventory.wood>0&&(cache.contents?.wood||0)<12)
        add('store_wood','Store one carried wood in a nearby material cache',cache,cache.id);
      if(n.inventory.wood<2&&(cache.contents?.wood||0)>0&&roomFor(n,'wood')>0)
        add('retrieve_wood','Take one stored wood from a nearby cache',cache,cache.id);
    }
    for(const job of root.Crafting.options(n,world))
      add(job.key,job.when,job.target||null,job.ref||null);
    for(const job of root.Construction?.options(world,n,residents,canReach)||[])
      add(job.key,job.when,job.target,job.ref);
    if(!n.plan&&(!n.project||n.project.kind==='home')&&
       n.knowledge?.recipes?.includes('shelter')&&n.energy>=30&&
       !world.construction?.tiles.some(t=>t.kind==='roof'&&t.actorId===n.id)&&
       root.Construction?.compactSite(world,n,residents))
      add('design_home','Survey nearby ground and mark a compact six-tile dwelling');
    const examine=inspectTarget(n,world,canReach);
    if(examine&&n.energy>=10)
      add('inspect','Examine '+describeObject(world,examine).name+
        ' at '+examine.x+','+examine.y+' to learn its condition',examine,examine.id);
    const loose=world.items.find(item=>canCarryItem(n,item)&&distance(n,item)<=8&&canReach(item));
    if(loose)
      add('pickup_item','Pick up one '+loose.kind+' from the ground',loose,loose.id);
    if(world.items.length<120&&
      !world.items.some(item=>distance(n,item)<=1)){
      if(n.inventory.flask>0)add('drop_flask','Place one carried flask on the ground');
      if(n.inventory.wood>=4)
        add('drop_wood','Place one carried wood on the ground');
      const load=carrying(n);
      const burden=load.valid&&(load.massKg>=load.maxMassKg*.82||
        load.volumeL>=load.maxVolumeL*.82);
      if(burden){
        if(n.inventory.stone>0)add('drop_stone','Set one stone on the ground to free carrying space');
        if(n.inventory.fiber>0)add('drop_fiber','Set one fiber bundle on the ground to free carrying space');
      }
    }
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
    if(task.key==='design_home'){
      const outcome=root.Construction?.designHome(world,n,residents)||
       {ok:false,message:'Construction kernel unavailable'};
      if(!outcome.ok)return outcome;
      message=outcome.message;
    }else if(task.key==='build_tile'){
      const outcome=root.Construction?.build(world,n,task.ref,residents,task.commandId)||
       {ok:false,message:'Construction kernel unavailable'};
      if(!outcome.ok)return outcome;
      message=outcome.message;
    }else if(task.key==='place_crate'||/^(stash|withdraw)_(wood|stone|fiber)$/.test(task.key)){
      const result=root.Crafting.interact(n,world,task.key,task.ref);
      if(!result.ok)return result;
      message=result.message;
    }else if(task.key==='craft_stage'||(task.key.startsWith('craft_')&&
      root.Crafting.getRecipe(task.key.slice(6)))){
      let outcome;
      if(task.key==='craft_stage'){
        outcome=root.Crafting.advance(n,world,task.ref);
      }else{
        const id=task.key.slice(6);
        outcome=root.Crafting.begin(n,world,id,task.ref);
        if(outcome.ok)n.plan={key:'craft_project',recipe:id,steps:0};
      }
      if(!outcome.ok)return outcome;
      message=outcome.message;
    }else if(Object.hasOwn(HARVEST_KINDS,task.key)){
      const kind=HARVEST_KINDS[task.key];
      const node=world.nodes.find(v=>v.id===task.ref);
      if(node&&node.kind!==kind)return {ok:false,message:'RESOURCE_KIND_MISMATCH: expected '+kind};
      if(!node||node.stock<1||!sameLevel(n,node)||distance(n,node)>1)
        return {ok:false,message:'Resource no longer available'};
      // Repeated practice gradually improves output; expertise is earned, never assigned.
      const expertise=n.skills[skillNames[task.key]]||0;
      const hatchetQuality=n.craftedItems?.find(item=>item.kind==='hatchet')?.quality||2;
      const axeBonus=n.inventory.hatchet&&task.key==='collect_wood'?
       (hatchetQuality>=4?2:1):0;
      if(task.key==='fill_water'&&vesselRoom(n)<1)
        return {ok:false,message:'NO_LIQUID_CONTAINER: a real flask with space is required'};
      const collected=Math.min(node.stock,2+Math.min(2,Math.floor(expertise/3))+
        axeBonus,roomFor(n,node.kind),
        task.key==='fill_water'?vesselRoom(n):1000);
      if(collected<1)return {ok:false,message:'CARRYING_CAPACITY: no room for harvested material'};
      // Do not commit a food harvest unless both inventory and nutrition
      // bookkeeping can accept all gathered portions.
      if(node.kind==='food'){
        const foodId=node.id.startsWith('berry_')?'berries':
          Biology.foodForBiome(Frontier.terrainAt(world,node.x,node.y));
        if(!Biology.addForaged(n.bio,foodId,collected))
          return {ok:false,message:'Food inventory full'};
      }
      if(task.key==='fill_water'){
        if(!root.Crafting.fillFlask(n,collected))
          return {ok:false,message:'NO_LIQUID_CONTAINER: flask no longer available'};
      }else n.inventory[node.kind]+=collected;
      node.stock-=collected;
      n.energy=clamp(n.energy-3*collected);
      message='Collected '+collected+' '+node.kind+' (source '+node.stock+'/'+node.max+' remaining)';
    }else if(task.key==='inspect'){
      const target=objectById(world,task.ref);
      if(!target||(n.z||0)!==(target.z||0)||distance(n,target)>1||
       (target.kind==='remains'&&!root.Perception?.line(world,n,target)))
        return {ok:false,message:'Object is no longer nearby'};
      const info=describeObject(world,target);
      if(!info)return {ok:false,message:'Unknown object'};
      n.knowledge.observations ||= [];
      n.knowledge.observations.push({id:info.id,kind:info.kind,
        at:world.now,text:info.description});
      n.knowledge.observations=n.knowledge.observations.slice(-40);
      n.needs.curiosity=clamp(n.needs.curiosity-12);
      message='Inspected '+info.description;
    }else if(['drop_wood','drop_stone','drop_fiber','drop_flask'].includes(task.key)){
      const kind=task.key.slice(5);
      if(n.inventory[kind]<1||world.items.length>=120||
        world.items.some(item=>distance(n,item)<=1))
        return {ok:false,message:'Unable to leave material here'};
      const vessel=kind==='flask'?root.Crafting.removeFlask(n):null;
      if(kind==='flask'&&!vessel)return {ok:false,message:'No physical flask to place'};
      const item={id:'item_'+world.itemSeq++,kind,count:1,x:n.x,y:n.y,
        ...(kind==='flask'?{z:n.z||0,vessel}:{})};
      world.items.push(item);
      if(kind!=='flask')n.inventory[kind]--;
      message='Placed one '+kind+' on the ground at '+n.x+','+n.y;
    }else if(task.key==='pickup_item'){
      const index=world.items.findIndex(item=>item.id===task.ref);
      const item=world.items[index];
      if(!item||!canCarryItem(n,item)||!sameLevel(n,item)||distance(n,item)>1)
        return {ok:false,message:'Loose item is unavailable'};
      if(item.kind==='flask'){
        if(!root.Crafting.receiveFlask(n,item.vessel))
          return {ok:false,message:'Unable to take custody of flask'};
      }else n.inventory[item.kind]++;
      world.items.splice(index,1);
      message='Picked up one '+item.kind+' from the ground';
    }else if(task.key==='drink_source'){
      const source=world.nodes.find(v=>v.id===task.ref&&v.kind==='water');
      if(!source||source.stock<1||!sameLevel(n,source)||distance(n,source)>1)
        return {ok:false,message:'No reachable freshwater remains'};
      if(!Biology.drink(n.bio,400))
        return {ok:false,message:'Cannot consume source water'};
      source.stock--;n.needs.thirst=clamp(n.needs.thirst-48);
      message='Drank directly from freshwater (source '+source.stock+'/'+source.max+')';
    }else if(task.key==='drink'){
      if(!n.bio||!root.Crafting.takeWater(n))return {ok:false,message:'No drinkable water'};
      Biology.drink(n.bio,400);n.needs.thirst=clamp(n.needs.thirst-48);
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
        if(cache.contents.wood<1||roomFor(n,'wood')<1)
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
    }else if(task.key==='teach_flask'){
      const student=residents.find(p=>p.id===task.ref);
      if(!student||student===n||student.alive===false||!sameLevel(n,student)||
       distance(n,student)>2||student.energy<20||student.needs.curiosity<45||
       student.task||student.plan||student.path?.length||
       student.peerPending||student.peerReservedFor||
       student.knowledge?.recipes?.includes('flask')||!canTeachFlask(n))
       return {ok:false,message:'Method instruction requires a willing nearby learner and firsthand proof'};
      student.knowledge.recipes.push('flask');
      n.needs.social=clamp(n.needs.social-14);
      student.needs.social=clamp(student.needs.social-10);
      message='Explained tested flask sealing steps to '+student.name;
    }else if(task.key==='share_food'||task.key==='socialize'){
      const other=residents.find(v=>v.id===task.ref);
      if(!other||distance(n,other)>2)return {ok:false,message:'The other resident moved away'};
      if(task.key==='share_food'){
        if(n.inventory.food<1)return {ok:false,message:'No food left to share'};
        if(!other.bio||!n.bio ||roomFor(other,'food')<1)
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
      if(vesselRoom(n)<1)return {status:'blocked',reason:'NO_LIQUID_CONTAINER'};
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
      'make_campfire','make_shelter','craft_project'].includes(saved.key) ||
       !Number.isInteger(saved.steps) || saved.steps<0 || saved.steps>24)return null;
    return saved.key==='craft_project'?
      {key:saved.key,recipe:root.Crafting.getRecipe(saved.recipe)?saved.recipe:null,steps:saved.steps}:
      {key:saved.key,steps:saved.steps};
  }
  function stepNeeds(n,world,dt) {
    // Biology owns digestion, fuel, hydration budget, sleep pressure and
    // normalized endocrine indices; needs are experienced gameplay pressures.
    const sheltered=(root.Construction?.sheltered(world,n)??false)||
      world.structures.some(site=>site.type==='shelter'&&distance(n,site)<=4);
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
    // Contact drive and voluntary solitude affect the *rate* of social
    // pressure, not bodily survival or whether a relationship is possible.
    const approach=Number.isFinite(n.traits?.socialApproach)?
      clamp(n.traits.socialApproach,0,1):.5;
    const solitude=Number.isFinite(n.traits?.solitudePreference)?
      clamp(n.traits.solitudePreference,0,1):.5;
    const contactRate=Math.max(.001,.008+.039*approach-.014*solitude);
    n.needs.social=clamp(n.needs.social+dt*contactRate);
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
      // Geological mineral stock is not regenerated by seasonal weather.
      if(node.kind==='stone'){node.regrow=0;continue;}
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
    if(n.needs.thirst>45&&keys.has('drink_source'))return 'drink_source';
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
  function restoreWorld(target,saved,seenVessels=new Set(),receipts=[]) {
    if(!saved||!Array.isArray(saved.nodes)||!Array.isArray(saved.structures))return;
    const itemIds=new Set();
    target.items=[];
    for(const item of Array.isArray(saved.items)?saved.items:[]){
      if(target.items.length>=120)break;
      if(!item||typeof item.id!=='string'||!/^item_[1-9]\d{0,11}$/.test(item.id)||
       itemIds.has(item.id)||!GROUND_KINDS.includes(item.kind)||item.count!==1||
       !Number.isInteger(item.x)||!Number.isInteger(item.y)||
       item.x<0||item.x>=target.width||item.y<0||item.y>=target.height)continue;
      const {id,kind,count,x,y}=item;
      if(kind==='flask'){
        const {z,vessel}=item;
        if(!Number.isInteger(z)||!Frontier.traversable(target,x,y,z)||vessel?.kind!=='flask'||
         !Number.isInteger(vessel.quality)||vessel.quality<1||vessel.quality>5||
         typeof vessel.maker!=='string'||vessel.maker.length>80||
         !Number.isFinite(vessel.craftedAt)||vessel.craftedAt<0||vessel.craftedAt>target.now||
         typeof vessel.method!=='string'||vessel.method.length>32||
         !Number.isFinite(vessel.materialQuality)||vessel.materialQuality<1||vessel.materialQuality>5||
         vessel.vesselId===undefined||vessel.waterUnits===undefined)continue;
        const fields=root.Crafting.flaskFields(vessel,vessel.maker,0);
        if(!fields||seenVessels.has(fields.vesselId))continue;
        seenVessels.add(fields.vesselId);
        const {quality,maker,craftedAt,method,materialQuality}=vessel;
        target.items.push({id,kind,count,x,y,z,
         vessel:{kind,quality,maker,craftedAt,method,materialQuality,...fields}});
      }else{
        if(!Frontier.traversable(target,x,y,0))continue;
        target.items.push({id,kind,count,x,y});
      }
      itemIds.add(id);
    }
    target.itemSeq=Math.max(1,...target.items.map(item=>Number(item.id.slice(5))+1));
    if(Number.isInteger(saved.itemSeq)&&saved.itemSeq>target.itemSeq)
      target.itemSeq=Math.min(saved.itemSeq,1000000000);
    for(const node of target.nodes){
      const old=saved.nodes.find(v=>v.id===node.id&&v.kind===node.kind);
      if(old&&Number.isInteger(old.stock)&&old.stock>=0&&old.stock<=node.max){
        node.stock=old.stock;
        // A checkpoint must not discard partially accumulated resource growth.
        node.regrow=node.kind!=='stone'&&Number.isFinite(old.regrow)&&
          old.regrow>=0&&old.regrow<1?old.regrow:0;
      }
    }
    root.Construction?.restore(target,saved.construction,receipts);
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
  root.AgentWorld={KEYS,HARVEST_KINDS,GROUND_KINDS,INVENTORY_KINDS:Object.freeze(Object.keys(ITEM_LOAD)),newWorld,newAgent,carrying,roomFor,vesselRoom,focus,available,complete,nextPlanAction,
    validatePlan,stepNeeds,regenerate,fallback,restoreWorld,describeObject,objectById};
})(globalThis);
