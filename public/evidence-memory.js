// G2.2: private, source-backed experience ledger and bounded semantic summaries.
// It never changes world state, procedures, inventory or physical authority.
(function(root){
 'use strict';
 const MAX_EPISODES=240,MAX_FACTS=120,MAX_SUMMARIES=36,MAX_CLAIMS=80;
 const words=s=>String(s||'').toLowerCase().match(/[a-z][a-z0-9_]{2,}/g)||[];
 const unique=s=>[...new Set(words(s))];
 const empty=()=>({sequence:0,episodes:[],facts:[],claims:[],summaries:[],methods:[],social:[],lastDay:0});
 const state=n=>n.evidenceMemory ||=empty();
 const clone=x=>JSON.parse(JSON.stringify(x));
 const kinds=new Set(['action','inspection','interaction','sound','personal']);
 function sourceReceipt(sim,n,receiptId){
  if(typeof receiptId!=='string')return null;
  return (sim.receipts||[]).find(x=>x.id===receiptId&&
   x.actorId===n.id&&x.status==='COMPLETED')||null;
 }
 function record(sim,n,{type='action',text='',receiptId=null,ref=null,
  salience=2,fact=null}={}){
  if(!kinds.has(type)||typeof text!=='string'||!text.trim())return null;
  const receipt=sourceReceipt(sim,n,receiptId);
  // Evidence is captured at physical commitment, not replayed from an old
  // receipt after the actor or target may have moved or changed.
  if(receipt&&(receipt.clock!==sim.clock||
   state(n).episodes.some(e=>e.receiptId===receipt.id)))return null;
  if((type==='action'||type==='inspection'||fact)&&!receipt)return null;
  if(receipt&&(type==='action'||type==='inspection')){
   if(type==='inspection'){
    if(receipt.action!=='inspect'||receipt.targetId!==ref)return null;
    const observed=root.Perception?.inspect(sim,n,ref);
    if(!observed)return null;
    // Caller-supplied descriptions and facts never become witnessed truth.
    text='Inspected '+observed.kind+' at '+observed.x+','+observed.y;
    fact=Number.isInteger(observed.stock)?{key:'stock',value:observed.stock}:null;
   }else{
    if(receipt.action==='inspect')return null;
    text='Completed '+String(receipt.action||'').slice(0,48);
    fact=null;
    ref=receipt.targetId??null;
   }
  }else if(fact)return null;
  const memory=state(n);
  const entry={id:'ev_'+(++memory.sequence),type,text:text.slice(0,180),
   at:sim.clock,ref:typeof ref==='string'?ref.slice(0,100):null,
   receiptId:receipt?.id||null,certainty:receipt&&
    (type==='action'||type==='inspection')?'observed':'reported',
   salience:Math.max(1,Math.min(5,Number(salience)||2)),
   location:{x:n.x,y:n.y,z:n.z||0}};
  memory.episodes.push(entry);
  memory.episodes=memory.episodes.slice(-MAX_EPISODES);
  if(fact&&typeof fact.key==='string'&&
   ['stock','condition','material','location'].includes(fact.key)&&
   typeof fact.value!=='object'){
   const val=String(fact.value).slice(0,80);
   // Never overwrite conflicting firsthand evidence: keep separate
   // observations, timestamps, entity and source-receipt identities.
   memory.facts.push({id:'fact_'+entry.id,entityId:entry.ref,key:fact.key,
    value:val,at:entry.at,sourceEpisodeId:entry.id,
    receiptId:entry.receiptId,certainty:'observed'});
   memory.facts=memory.facts.slice(-MAX_FACTS);
  }
  return clone(entry);
 }
 function fromReceipt(sim,n,receipt){
  if(!receipt||receipt.actorId!==n.id||receipt.status!=='COMPLETED')return null;
  // Idempotency: replays or repeated hook execution cannot create evidence twice.
  if(state(n).episodes.some(e=>e.receiptId===receipt.id))return null;
  const action=String(receipt.action||'').slice(0,48);
  let fact=null;
  let text='Completed '+action;
  if(action==='inspect'){
   const observed=root.Perception?.inspect(sim,n,receipt.targetId);
   if(observed){
    text='Inspected '+observed.kind+' at '+observed.x+','+observed.y;
    if(Number.isInteger(observed.stock))fact={key:'stock',value:observed.stock};
   }
  }
  const entry=record(sim,n,{type:action==='inspect'?'inspection':'action',
   text,receiptId:receipt.id,ref:receipt.targetId,
   salience:action==='inspect'?4:2,fact});
  if(!entry)return null;
  const m=state(n);
  if(action==='inspect'&&entry.certainty==='observed'){
   const kind=entry.text.match(/^Inspected (food|water|wood|stone|fiber) /)?.[1];
   for(const claim of m.claims){
    if(claim.sourceId===receipt.targetId&&claim.status==='unverified'){
     claim.status=kind===claim.kind?'supported':'contradicted';
     claim.verificationReceiptId=receipt.id;
    }
   }
  }
  for(const method of receipt.delta?.knowledge?.learnedMethods||[]){
   if(typeof method!=='string'||!n.knowledge?.recipes?.includes(method)||
    m.methods.some(x=>x.method===method))continue;
   m.methods.push({method:method.slice(0,64),sourceEpisodeId:entry.id,
    receiptId:receipt.id,at:sim.clock});
  }
  m.methods=m.methods.slice(-80);
  if(['share_food','socialize'].includes(action)&&
   typeof receipt.targetId==='string'){
   m.social.push({actorId:receipt.targetId,
    action,at:sim.clock,sourceEpisodeId:entry.id,receiptId:receipt.id});
   m.social=m.social.slice(-80);
  }
  return entry;
 }
 // A committed conversation proves only that words were exchanged in person.
 // Its contents remain reported claims, never witnessed world facts.
 function fromDialogue(sim,speaker,listener,receipt,first,second){
  const verified=receipt&&speaker&&sourceReceipt(sim,speaker,receipt.id);
  if(!verified||verified.action!==receipt.action||
   verified.targetId!==receipt.targetId||verified.clock!==receipt.clock)return null;
  if(!speaker||!listener||speaker===listener||
   !sim.npcs?.includes(speaker)||!sim.npcs?.includes(listener)||
   !receipt||receipt.actorId!==speaker.id||receipt.targetId!==listener.id||
   receipt.action!=='socialize'||receipt.status!=='COMPLETED'||
   receipt.clock!==sim.clock||
   !sourceReceipt(sim,speaker,receipt.id)||
   typeof first!=='string'||typeof second!=='string'||
   !first.trim()||!second.trim())return null;
  const participants=[speaker,listener];
  if(participants.some(n=>state(n).episodes.some(e=>
   e.type==='interaction'&&e.receiptId===receipt.id)))return null;
  const utterances=[{actorId:speaker.id,text:first.trim().slice(0,220)},
   {actorId:listener.id,text:second.trim().slice(0,220)}];
  const entries=participants.map((n,i)=>{
   const memory=state(n);
   const entry={id:'ev_'+(++memory.sequence),type:'interaction',
    text:('Spoke with '+participants[1-i].name+': '+
     utterances.map(u=>u.actorId+': '+u.text).join('; ')).slice(0,180),
    at:sim.clock,ref:participants[1-i].id,receiptId:receipt.id,
    certainty:'reported',salience:3,
    location:{x:n.x,y:n.y,z:n.z||0},
    utterances:clone(utterances)};
   memory.episodes.push(entry);
   memory.episodes=memory.episodes.slice(-MAX_EPISODES);
   return clone(entry);
  });
  // Explicit source tags are the ONLY typed claim channel in freeform speech.
  // The speaker must possess a real firsthand inspection of that source.
  for(let i=0;i<2;i++){
   const sender=participants[i],receiver=participants[1-i];
   const heard=utterances[i].text,found=new Set();
   for(const match of heard.matchAll(/\[source:([a-z0-9_]{1,100})\]/g)){
    const ref=match[1];
    if(found.has(ref))continue;
    found.add(ref);
    const evidence=state(sender).episodes.findLast(e=>
     e.type==='inspection'&&e.certainty==='observed'&&e.ref===ref&&
     typeof e.receiptId==='string');
    const kind=evidence?.text.match(/^Inspected (food|water|wood|stone|fiber) /)?.[1];
    if(!kind)continue;
    const target=sim.world.nodes.find(x=>x.id===ref&&x.kind===kind);
    if(!target)continue;
    const memory=state(receiver);
    if(memory.claims.some(c=>c.speechReceiptId===receipt.id&&
     c.sourceId===ref&&c.speakerId===sender.id))continue;
    memory.claims.push({id:'claim_'+entries[1-i].id+'_'+memory.claims.length,
     speakerId:sender.id,sourceId:ref,kind,
     x:target.x,y:target.y,z:target.z||0,
     at:sim.clock,sourceEpisodeId:evidence.id,
     speechEpisodeId:entries[1-i].id,speechReceiptId:receipt.id,
     status:'unverified',verificationReceiptId:null});
    memory.claims=memory.claims.slice(-MAX_CLAIMS);
   }
  }
  return entries;
 }
 function recall(n,query,clock,limit=5){
  const items=state(n).episodes;
  if(!items.length)return [];
  const q=unique(query),docCount=items.length;
  const documents=items.map(e=>unique(e.text+' '+(e.ref||'')+' '+e.type));
  const freq=new Map();
  for(const doc of documents)for(const word of doc)freq.set(word,(freq.get(word)||0)+1);
  const results=items.map((e,i)=>{
   const doc=documents[i];
   const overlap=q.reduce((sum,term)=>{
    if(!doc.includes(term))return sum;
    const df=freq.get(term)||0;
    return sum+Math.log(1+(docCount-df+.5)/(df+.5))*9;
   },0);
   const entity=q.some(term=>e.ref&&words(e.ref).includes(term))?12:0;
   const age=Math.max(0,clock-e.at);
   const recency=1/(1+age/1440);
   return {entry:e,score:overlap+entity+e.salience*.8+recency};
  });
  results.sort((a,b)=>b.score-a.score||b.entry.at-a.entry.at||
   a.entry.id.localeCompare(b.entry.id));
  return results.slice(0,Math.max(0,Math.min(8,limit)))
   .map(row=>({...clone(row.entry),relevance:Math.round(row.score*100)/100}));
 }
 function consolidate(sim,n){
  const m=state(n),day=Math.floor(sim.clock/1440);
  if(day<=m.lastDay)return 0;
  let count=0;
  // At most one factual, evidence-linked summary per elapsed day.
  const start=Math.max(m.lastDay,day-1)*1440;
  const daily=m.episodes.filter(e=>e.at>=start&&e.at<day*1440&&e.receiptId);
  if(daily.length){
   const important=[...daily].sort((a,b)=>b.salience-a.salience||
    b.at-a.at).slice(0,4);
   const id='summary_'+day;
   if(!m.summaries.some(s=>s.id===id)){
    m.summaries.push({id,at:day*1440,
     text:'Remembered physical work: '+important.map(e=>e.text).join('; ').slice(0,400),
     sourceEpisodeIds:important.map(e=>e.id),
     certainty:'inferred'});
    count++;
   }
  }
  m.summaries=m.summaries.slice(-MAX_SUMMARIES);
  m.lastDay=day;
  return count;
 }
 function restore(n,saved,clock,legacyMemories=null){
  const result=empty();
  if(saved&&typeof saved==='object'){
   const entries=Array.isArray(saved.episodes)?saved.episodes.slice(-MAX_EPISODES):[];
   const seen=new Set();
   for(const e of entries){
    if(!e||typeof e.id!=='string'||!/^ev_[1-9]\d*$/.test(e.id)||
     seen.has(e.id)||!kinds.has(e.type)||typeof e.text!=='string'||
     !Number.isFinite(e.at)||e.at>clock||e.at<0||
     !['observed','reported'].includes(e.certainty))continue;
    seen.add(e.id);
    result.episodes.push({id:e.id,type:e.type,text:e.text.slice(0,180),
     at:e.at,ref:typeof e.ref==='string'?e.ref.slice(0,100):null,
     receiptId:typeof e.receiptId==='string'?e.receiptId:null,
     certainty:e.certainty,salience:Math.max(1,Math.min(5,Number(e.salience)||2)),
     location:{x:Number.isInteger(e.location?.x)?e.location.x:n.x,
      y:Number.isInteger(e.location?.y)?e.location.y:n.y,
      z:Number.isInteger(e.location?.z)?e.location.z:(n.z||0)},
     ...(e.type==='interaction'&&Array.isArray(e.utterances)&&
      e.utterances.length===2&&e.utterances.every(u=>
       u&&typeof u.actorId==='string'&&typeof u.text==='string')?
      {utterances:e.utterances.map(u=>({
       actorId:u.actorId.slice(0,100),text:u.text.slice(0,220)}))}:{})});
   }
   result.sequence=Math.max(0,...result.episodes.map(e=>Number(e.id.slice(3))),
    Number.isSafeInteger(saved.sequence)?saved.sequence:0);
   const episodeIds=new Set(result.episodes.map(e=>e.id));
   result.facts=(Array.isArray(saved.facts)?saved.facts:[]).filter(f=>
    f&&typeof f.id==='string'&&typeof f.entityId==='string'&&
    ['stock','condition','material','location'].includes(f.key)&&
    typeof f.value==='string'&&episodeIds.has(f.sourceEpisodeId)&&
    typeof f.receiptId==='string'&&Number.isFinite(f.at)&&f.at<=clock)
    .slice(-MAX_FACTS).map(f=>({id:f.id,entityId:f.entityId.slice(0,100),
     key:f.key,value:f.value.slice(0,80),at:f.at,
     sourceEpisodeId:f.sourceEpisodeId,receiptId:f.receiptId,certainty:'observed'}));
   // A reported claim must still have its own witnessed dialogue episode
   // containing the explicit source citation in the named speaker's speech.
   result.claims=(Array.isArray(saved.claims)?saved.claims:[])
    .filter(c=>{
     if(!c||typeof c.sourceId!=='string'||typeof c.speakerId!=='string'||
      !['food','water','wood','stone','fiber'].includes(c.kind)||
      !['unverified','supported','contradicted'].includes(c.status)||
      !Number.isFinite(c.at)||c.at>clock||c.at<0||
      !Number.isInteger(c.x)||!Number.isInteger(c.y)||!Number.isInteger(c.z))return false;
     const speech=result.episodes.find(e=>e.id===c.speechEpisodeId&&
      e.type==='interaction'&&e.certainty==='reported'&&
      e.receiptId===c.speechReceiptId);
     return !!speech&&speech.utterances?.some(u=>
      u.actorId===c.speakerId&&u.text.includes('[source:'+c.sourceId+']'));
    }).slice(-MAX_CLAIMS).map(c=>({
     id:String(c.id||'').slice(0,120),speakerId:c.speakerId.slice(0,100),
     sourceId:c.sourceId.slice(0,100),kind:c.kind,x:c.x,y:c.y,z:c.z,
     at:c.at,sourceEpisodeId:String(c.sourceEpisodeId||'').slice(0,80),
     speechEpisodeId:c.speechEpisodeId,speechReceiptId:c.speechReceiptId,
     status:c.status,verificationReceiptId:
      typeof c.verificationReceiptId==='string'?c.verificationReceiptId:null
    }));
   result.summaries=(Array.isArray(saved.summaries)?saved.summaries:[])
    .filter(s=>s&&typeof s.id==='string'&&typeof s.text==='string'&&
     Number.isFinite(s.at)&&s.at<=clock&&Array.isArray(s.sourceEpisodeIds)&&
     s.sourceEpisodeIds.length>0&&
     s.sourceEpisodeIds.every(id=>episodeIds.has(id)))
    .slice(-MAX_SUMMARIES).map(s=>({id:s.id,at:s.at,
     text:s.text.slice(0,400),sourceEpisodeIds:s.sourceEpisodeIds.slice(0,4),
     certainty:'inferred'}));
   result.methods=(Array.isArray(saved.methods)?saved.methods:[])
    .filter(x=>x&&typeof x.method==='string'&&
     typeof x.receiptId==='string'&&episodeIds.has(x.sourceEpisodeId)&&
     Number.isFinite(x.at)&&x.at<=clock)
    .slice(-80).map(x=>({method:x.method.slice(0,64),
     sourceEpisodeId:x.sourceEpisodeId,receiptId:x.receiptId,at:x.at}));
   result.social=(Array.isArray(saved.social)?saved.social:[])
    .filter(x=>x&&typeof x.actorId==='string'&&
     ['share_food','socialize'].includes(x.action)&&
     typeof x.receiptId==='string'&&episodeIds.has(x.sourceEpisodeId)&&
     Number.isFinite(x.at)&&x.at<=clock)
    .slice(-80).map(x=>({actorId:x.actorId.slice(0,100),
     action:x.action,at:x.at,sourceEpisodeId:x.sourceEpisodeId,
     receiptId:x.receiptId}));
   result.lastDay=Number.isSafeInteger(saved.lastDay)?
    Math.max(0,Math.min(Math.floor(clock/1440),saved.lastDay)):0;
  }
  // Legacy v3 memories have no verified receipt provenance. Keep their
  // recollections useful but mark them reported; never derive factual claims.
  if(!saved&&Array.isArray(legacyMemories)){
   for(const m of legacyMemories.slice(-MAX_EPISODES)){
    if(!m||typeof m.text!=='string'||!Number.isFinite(m.at)||
     m.at<0||m.at>clock)continue;
    result.episodes.push({id:'ev_'+(++result.sequence),type:'personal',
     text:m.text.slice(0,180),at:m.at,
     ref:typeof m.ref==='string'?m.ref.slice(0,100):null,
     receiptId:null,certainty:'reported',
     salience:Math.max(1,Math.min(5,Number(m.salience)||1)),
     location:{x:Number.isInteger(m.x)?m.x:n.x,
      y:Number.isInteger(m.y)?m.y:n.y,z:n.z||0}});
   }
   result.episodes=result.episodes.slice(-MAX_EPISODES);
  }
  n.evidenceMemory=result;
  return result;
 }
 function belief(n,entityId,key,clock){
  const claims=state(n).facts.filter(f=>f.entityId===entityId&&f.key===key);
  if(!claims.length)return null;
  const latest=claims[claims.length-1];
  const contradictory=claims.some(f=>f.value!==latest.value);
  const age=Math.max(0,clock-latest.at);
  const confidence=Math.max(0,Math.min(1,
   (contradictory?.55:.9)/(1+age/14400)));
  return {entityId,key,value:latest.value,
   certainty:'inferred',confidence:Math.round(confidence*1000)/1000,
   contradictory,sourceEpisodeIds:claims.slice(-12).map(f=>f.sourceEpisodeId)};
 }
 function working(n){
  return {task:n.task?.key||null,commandId:n.task?.commandId||null,
   goal:n.project?.goal||n.plan?.key||n.agency?.goal?.key||null,
   remainingMinutes:n.currentActivity?
    Math.max(0,n.currentActivity.workRequired-n.currentActivity.workDone):null};
 }
 root.EvidenceMemory={state,record,fromReceipt,fromDialogue,recall,consolidate,restore,working,belief,
  MAX_EPISODES,MAX_FACTS,MAX_SUMMARIES,MAX_CLAIMS};
})(globalThis);
