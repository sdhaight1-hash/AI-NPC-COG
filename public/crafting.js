// Authoritative, multi-stage manufacturing. One NPC, one workpiece, finite inputs.
// No LLM or client code is permitted to grant a finished product directly.
(function(root){
 'use strict';
 const RECIPES=Object.freeze({
  cord:{name:'Twisted plant cord',inputs:{fiber:3},stages:[
   {name:'Sort and prepare fibers',minutes:3},{name:'Twist and ply fibers',minutes:6},
   {name:'Bind and finish cord',minutes:3}],output:{kind:'cord',count:1}},
  blade:{name:'Knapped stone blade',inputs:{stone:2},stages:[
   {name:'Select a suitable stone core',minutes:3},{name:'Flake the cutting edge',minutes:7},
   {name:'Retouch and inspect edge',minutes:4}],output:{kind:'blade',count:1}},
  hafted_hatchet:{name:'Hafted stone hatchet',inputs:{blade:1,cord:1,wood:1},stages:[
   {name:'Shape a wooden handle',minutes:6},{name:'Seat the knapped blade',minutes:6},
   {name:'Bind and test the haft',minutes:5}],output:{kind:'hatchet',count:1}},
  workbench:{name:'Primitive woodworking bench',inputs:{wood:3,stone:1,cord:1},stages:[
   {name:'Prepare bench supports',minutes:8},{name:'Fit and brace work surface',minutes:10},
   {name:'Stabilize the bench',minutes:6}],output:{structure:'workbench'}},
  planks:{name:'Split wooden planks',inputs:{wood:2},tool:'hatchet',station:'workbench',stages:[
   {name:'Mark and orient the grain',minutes:4},{name:'Split along grain',minutes:8},
   {name:'Dress and check the faces',minutes:5}],output:{kind:'plank',count:3}},
  crate:{name:'Timber storage crate',inputs:{plank:3,cord:1},station:'workbench',stages:[
   {name:'Lay out the boards',minutes:5},{name:'Assemble the crate sides',minutes:9},
   {name:'Bind and fit the lid',minutes:6}],output:{kind:'crate',count:1}}
 });
 const MATERIALS=Object.freeze({
  wood:{hardness:2,flexibility:3},stone:{hardness:5,flexibility:0},
  fiber:{hardness:0,flexibility:5},cord:{hardness:1,flexibility:5},
  blade:{hardness:5,flexibility:0},plank:{hardness:2,flexibility:3}
 });
 const KINDS=['cord','blade','hatchet','plank','crate'];
 const hasInputs=(npc,recipe)=>Object.entries(recipe.inputs)
  .every(([kind,amount])=>(npc.inventory[kind]||0)>=amount);
 function stationNear(npc,world,type,range=8){
  return world.structures.find(s=>s.type===type&&
   root.Frontier.distance(world,npc,s)<=range)||null;
 }
 function options(npc,world){
  if(npc.workpiece){
   const spec=RECIPES[npc.workpiece.recipe];
   const step=spec?.stages[npc.workpiece.stage];
   if(!step)return [];
   const station=npc.workpiece.station?
    world.structures.find(s=>s.id===npc.workpiece.station):null;
   return [{key:'craft_stage',when:'Continue '+spec.name+': '+step.name+
    ' ('+(npc.workpiece.stage+1)+'/'+spec.stages.length+' stages)',
    target:station||null,ref:station?.id||null}];
  }
  return Object.entries(RECIPES).flatMap(([id,spec])=>{
   if(!hasInputs(npc,spec)||npc.energy<18||
    (spec.tool&&(npc.inventory[spec.tool]||0)<1))return [];
   if(id==='hafted_hatchet'&&npc.inventory.hatchet>0)return [];
   const station=spec.station?stationNear(npc,world,spec.station):null;
   if(spec.station&&!station)return [];
   if(id==='workbench'&&world.structures.some(s=>s.type==='workbench'&&
    root.Frontier.distance(world,npc,s)<4))return [];
   return [{key:'craft_'+id,when:'Begin '+spec.name+'; requires '+
    Object.entries(spec.inputs).map(([k,v])=>v+' '+k).join(', ')+
    '; '+spec.stages.length+' production stages'+(spec.station?' at '+spec.station:''),
    target:station||null,ref:station?.id||null}];
  });
 }
 function getRecipe(id){return RECIPES[id]||null;}
 function begin(npc,world,id,stationId=null){
  const spec=RECIPES[id];
  if(!spec||npc.workpiece||npc.energy<18||!hasInputs(npc,spec)||
   (spec.tool&&(npc.inventory[spec.tool]||0)<1))
   return {ok:false,message:'Manufacturing prerequisites are missing'};
  if(id==='hafted_hatchet'&&npc.inventory.hatchet>0)
   return {ok:false,message:'Already carrying a hatchet'};
  let station=null;
  if(spec.station){
   station=world.structures.find(s=>s.id===stationId&&s.type===spec.station);
   if(!station||root.Frontier.distance(world,npc,station)>1)
    return {ok:false,message:'Required workshop is not reachable'};
  }
  if(id==='workbench'&&world.structures.some(s=>s.type==='workbench'&&
   root.Frontier.distance(world,npc,s)<4))
   return {ok:false,message:'Another workbench already occupies this area'};
  // Consume raw materials at job start. An interrupted project remains a real
  // unfinished workpiece, so save/load cannot refund or duplicate inputs.
  let inherited=0,parts=0;
  for(const [kind,quantity] of Object.entries(spec.inputs)){
   for(let i=0;i<quantity;i++){
    if(KINDS.includes(kind)){
     const index=(npc.craftedItems||[]).findIndex(p=>p.kind===kind);
     if(index!==-1){
      inherited+=npc.craftedItems[index].quality;parts++;
      npc.craftedItems.splice(index,1);
     }
    }
   }
   npc.inventory[kind]-=quantity;
  }
  npc.workpiece={recipe:id,stage:0,workmanship:0,
   materialQuality:parts?inherited/parts:2,
   station:station?.id||null,x:npc.x,y:npc.y,startedAt:world.now};
  return {ok:true,message:'Started '+spec.name+': '+spec.stages[0].name};
 }
 function advance(npc,world){
  const part=npc.workpiece;
  if(!part||!RECIPES[part.recipe])return {ok:false,message:'No active workpiece'};
  const spec=RECIPES[part.recipe],step=spec.stages[part.stage];
  if(!step||npc.energy<8)return {ok:false,message:'Too exhausted to continue making this'};
  if(part.station){
   const station=world.structures.find(s=>s.id===part.station&&
    s.type===spec.station);
   if(!station||root.Frontier.distance(world,npc,station)>1)
    return {ok:false,message:'The required workshop is not in reach'};
  }
  if(spec.tool&&(npc.inventory[spec.tool]||0)<1)
   return {ok:false,message:'Required tool is missing'};
  if(part.recipe==='workbench'&&part.stage===spec.stages.length-1&&
   world.structures.length>=80)
   return {ok:false,message:'World structure limit reached'};
  const practiced=npc.skills.crafting||0;
  const technique=Math.min(5,1+Math.floor(practiced/4));
  part.workmanship+=technique;
  npc.energy=Math.max(0,npc.energy-4);
  npc.skills.crafting=practiced+1;
  part.stage++;
  if(part.stage<spec.stages.length)
   return {ok:true,message:'Completed '+step.name+'; next: '+
    spec.stages[part.stage].name};
  const quality=Math.max(1,Math.min(5,Math.round(
   (part.workmanship/spec.stages.length+part.materialQuality)/2)));
  const output=spec.output;
  if(output.structure){
   world.structures.push({id:'workbench_'+(world.structures.length+1),
    type:'workbench',x:npc.x,y:npc.y,craftQuality:quality});
  }else{
   npc.craftedItems ||= [];
   for(let i=0;i<output.count;i++)npc.craftedItems.push({
    kind:output.kind,quality,maker:npc.id,craftedAt:world.now,
    method:part.recipe,materialQuality:part.materialQuality});
   npc.inventory[output.kind]=(npc.inventory[output.kind]||0)+output.count;
  }
  npc.workpiece=null;
  return {ok:true,message:'Finished '+spec.name+' (quality '+quality+'/5)'+
   (output.kind?'; produced '+output.count+' '+output.kind:'; workshop constructed')};
 }
 function restore(npc,source){
  npc.craftedItems=Array.isArray(source?.craftedItems)?
   source.craftedItems.filter(item=>item&&KINDS.includes(item.kind)&&
    Number.isInteger(item.quality)&&item.quality>=1&&item.quality<=5&&
    typeof item.maker==='string'&&Number.isFinite(item.craftedAt))
    .slice(0,1000).map(item=>({kind:item.kind,quality:item.quality,
     maker:item.maker,craftedAt:item.craftedAt,method:String(item.method||'').slice(0,32),
     materialQuality:Math.max(1,Math.min(5,Number(item.materialQuality)||2))})):[];
  // An item count can be read from inventory only if the persisted item
  // records back it. This also rejects corrupt saves that mint components.
  for(const kind of KINDS.filter(k=>k!=='hatchet'))npc.inventory[kind]=
   npc.craftedItems.filter(item=>item.kind===kind).length;
  // Original v3 saves may contain a legitimate legacy hatchet with no
  // quality record. Preserve the tool rather than erasing it on migration.
  const recordedHatchets=npc.craftedItems.filter(item=>item.kind==='hatchet').length;
  if((npc.inventory.hatchet||0)>recordedHatchets)
   npc.craftedItems.push({kind:'hatchet',quality:2,maker:npc.id,
    craftedAt:npc.spawnAt||0,method:'legacy',materialQuality:2});
  npc.inventory.hatchet=npc.craftedItems.filter(item=>item.kind==='hatchet').length;
  const p=source?.workpiece,spec=RECIPES[p?.recipe];
  npc.workpiece=spec&&Number.isInteger(p.stage)&&p.stage>=0&&
   p.stage<spec.stages.length&&Number.isFinite(p.workmanship)&&p.workmanship>=0&&
   Number.isFinite(p.materialQuality)&&p.materialQuality>=1&&p.materialQuality<=5&&
   Number.isFinite(p.startedAt)&&p.startedAt<=npc.spawnAt+1e9?
   {recipe:p.recipe,stage:p.stage,workmanship:p.workmanship,
    materialQuality:p.materialQuality,station:typeof p.station==='string'?p.station:null,
    x:npc.x,y:npc.y,startedAt:p.startedAt}:null;
 }
 root.Crafting={RECIPES,MATERIALS,options,getRecipe,begin,advance,restore};
})(globalThis);
