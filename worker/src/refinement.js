import {validateIntent, intentSchema} from './intent.js';

const fields=['purpose','rhythm','feeling','maxWalkMinutes','maxStops','foodMode','drinkMode'];
export const refinementSchema={type:'object',additionalProperties:false,properties:{
  set:{type:'object',additionalProperties:false,properties:Object.fromEntries(fields.map(k=>[k,intentSchema.properties[k]]))},
  addExcludedType:intentSchema.properties.excludedTypes,
  removeExcludedType:intentSchema.properties.excludedTypes,
  rankingPreference:{type:['string','null'],enum:['closer',null]},
  clarification:{type:['string','null'],maxLength:160}
},required:['set','addExcludedType','removeExcludedType','rankingPreference','clarification']};

// Strict structured output requires every property to be required. Null means unchanged
// on the model wire, and is removed before the existing public patch contract is validated.
export const refinementWireSchema={...refinementSchema,properties:{...refinementSchema.properties,set:{type:'object',additionalProperties:false,properties:Object.fromEntries(fields.map(k=>[k,{anyOf:[intentSchema.properties[k],{type:'null'}]}])),required:fields}}};
export function normalizeWirePatch(value){
  if(!value?.set||typeof value.set!=='object'||Array.isArray(value.set))return value;
  return {...value,set:Object.fromEntries(Object.entries(value.set).filter(([,v])=>v!==null))};
}

// Model output is only a proposal. Do not invent preferences from generic context.
export function groundRefinement(patch,current,text){
  if(!patch?.set||typeof text!=='string')return patch;
  const mentions={
    purpose:/吃|喝|飲料|咖啡|散步|走走|逛|休息|廁所|洗手間|室內|避雨/,
    rhythm:/走|步行|慢|快|趕|一站|一家|一間|兩站|三站|多站/,
    feeling:/安靜|在地|驚喜|綠意|文化|穩妥/,
    maxWalkMinutes:/(?:走|步行).{0,12}[0-9一二三四五六七八九十]+.{0,3}分|[0-9]+.{0,3}分.{0,8}(?:走|步行)/,
    maxStops:/[123一二兩三].{0,2}(?:站|家|間)|單站/,
    foodMode:/正餐|小點|點心|零食|吃飽|餐點/,
    drinkMode:/咖啡|飲料|喝|茶/
  };
  const valueEvidence={
    purpose:{'吃點東西':/吃|正餐|點心/,'喝杯咖啡':/咖啡/,'drink':/喝|飲料|咖啡|茶/,'走走看看':/散步|走走|逛/,'坐著休息':/休息|累|坐/,'找洗手間':/廁所|洗手間/,'找室內待著':/室內|避雨/},
    feeling:{'安靜':/安靜/,'在地':/在地/,'有點驚喜':/驚喜/,'有綠意':/綠意|綠地/,'有文化感':/文化/,'簡單穩妥':/簡單|穩妥/},
    rhythm:{'快速完成':/快|趕/,'慢慢走':/慢/,'少走一點':/少走|近|太遠/,'可多走一點':/多走|走遠/,'只去一站':/一站|一家|一間|單站/,'想去兩三站':/兩站|三站|多站|兩三/},
    foodMode:{meal:/正餐|餐點/,snack:/小點|點心|零食|吃飽/},
    drinkMode:{coffee:/咖啡/,nonCoffee:/(?:不要|不喝|避開|排除)咖啡|非咖啡/,any:/都可以|任何飲料|不限/}
  };
  const set=Object.fromEntries(Object.entries(patch.set).filter(([key,value])=>mentions[key]?.test(text)&&value!==current[key]&&(!valueEvidence[key]||valueEvidence[key][value]?.test(text))));
  if('maxWalkMinutes' in set&&!new RegExp(`(?:^|[^0-9])${set.maxWalkMinutes}\\s*分`).test(text))delete set.maxWalkMinutes;
  if('maxStops' in set&&!new RegExp(`(?:${set.maxStops}|${{1:'一',2:'二兩',3:'三'}[set.maxStops].split('').join('|')})\\s*(?:站|家|間)`).test(text))delete set.maxStops;
  const typeEvidence={coffee:/咖啡/,meal:/正餐|吃飯|餐點/,snack:/小點|點心|零食/,park:/公園|綠地/,culture:/文化|博物館/,indoor:/室內/,convenience:/便利商店|超商|7-11/i,walk:/散步|走走/,toilet:/廁所|洗手間/};
  const addExcludedType=patch.addExcludedType.filter(type=>current.excludedTypes.includes(type)||typeEvidence[type]?.test(text)&&/不要|不吃|不喝|避開|排除|已吃|吃飽/.test(text));
  const removeExcludedType=patch.removeExcludedType.filter(type=>typeEvidence[type]?.test(text)&&/可以|允許|接受|不再排除|取消排除|恢復/.test(text)&&!/(?:不可以|不允許|不接受)/.test(text));
  // Changing the main task belongs to the wheel; text refinement cannot change it.
  // The sole exception migrates legacy coffee to the same drink task's non-coffee subtype.
  let clarification=patch.clarification;
  if(set.purpose&&!(set.purpose==='drink'&&set.drinkMode==='nonCoffee'&&current.purpose==='喝杯咖啡')){delete set.purpose;clarification='要換主要需求，請回到需求輪盤選擇；這次先保留原方案。';}
  const closer=/(?:更近|近一點|走近|太遠|少走|不想走太遠|離我近)/.test(text)&&!/(?:不要|不用|不必)更近/.test(text);
  return {...patch,set,addExcludedType,removeExcludedType,clarification,rankingPreference:closer?patch.rankingPreference:null};
}

export function mergeRefinement(current,patch){
  const base=validateIntent(current);
  if(!base||!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!refinementSchema.required.includes(k)))return null;
  if(!patch.set||typeof patch.set!=='object'||Array.isArray(patch.set)||Object.keys(patch.set).some(k=>!fields.includes(k)))return null;
  if(![null,'closer'].includes(patch.rankingPreference)||!(patch.clarification===null||typeof patch.clarification==='string'&&patch.clarification.length<=160))return null;
  const types=intentSchema.properties.excludedTypes.items.enum;
  for(const key of ['addExcludedType','removeExcludedType'])if(!Array.isArray(patch[key])||patch[key].length>9||patch[key].some(t=>!types.includes(t)))return null;
  // Refinement never weakens hard walking/stops constraints. Time/return are not patchable.
  for(const key of ['maxWalkMinutes','maxStops'])if(base[key]!=null&&key in patch.set&&(patch.set[key]==null||patch.set[key]>base[key]))return null;
  const excludedTypes=[...new Set([...base.excludedTypes.filter(t=>!patch.removeExcludedType.includes(t)),...patch.addExcludedType])];
  return validateIntent({...base,...patch.set,excludedTypes});
}

export function seatClarification(intent){
  if(!intent?.unsupportedConstraints?.length||intent.unsupportedConstraints.some(s=>!/^座位無法確認$/.test(s)))return null;
  return {intent,partialIntent:intent,clarification:'目前查不到即時座位，要先看座位未確認的候選嗎？',clarificationOptions:[{id:'accept_unknown_seats',label:'接受座位未確認'},{id:'keep_requirement',label:'我一定需要座位'}]};
}

export function deterministicRefinement(input){
  const base=validateIntent(input.intent);
  if(!base)return null;
  const empty={set:{},addExcludedType:[],removeExcludedType:[],rankingPreference:null,clarification:null};
  if(input.answer==='accept_unknown_seats'){
    if(!seatClarification(base))return null;
    return {intent:validateIntent({...base,indoorMode:'shelter',unsupportedConstraints:[]}),patch:empty,warnings:['你接受座位未確認；並不保證可坐或有空位。']};
  }
  const text=typeof input.text==='string'?input.text.trim().replace(/[，。！!\s]/g,''):'';
  const kind=input.kind==='text'&&/^(?:換個地方|換一個地方|換一家|換一間|換一個)$/.test(text)?'replace':input.kind==='text'&&/^(?:走近一點|太遠了?|近一點)$/.test(text)?'closer':input.kind;
  if(kind==='closer')empty.rankingPreference='closer';
  else if(kind!=='replace')return null;
  return {intent:base,patch:empty,warnings:[],revisionKind:kind};
}

export function decisionSummary({places,route,intent,referenceSeconds}){
  const reasonCodes=['time_verified','stop_count_verified'];
  const reasons=[`這次安排 ${places.length} 站，步行約 ${route.walkMinutes} 分鐘，建議停留 ${route.stayMinutes} 分鐘。`];
  const evidenceRefs=['route.walkMinutes','route.stayMinutes','places.length','route.fitsWithinMinutes'];
  if(referenceSeconds!=null&&route.totalDurationSeconds<referenceSeconds){reasonCodes.push('shorter_walk_verified');reasons.push(`同一起點與返程設定重新驗算，步行比原方案少約 ${Math.round((referenceSeconds-route.totalDurationSeconds)/6)/10} 分鐘。`);evidenceRefs.push('revision.referenceWalkSeconds');}
  else if(route.returnToOrigin){reasonCodes.push('return_included');reasons.push(`返程已計入，另留 ${route.bufferMinutes} 分鐘緩衝與 ${route.freeMinutes} 分鐘彈性。`);evidenceRefs.push('route.returnLeg');}
  else reasons.push(`另留 ${route.bufferMinutes} 分鐘緩衝與 ${route.freeMinutes} 分鐘彈性，不把空檔排滿。`);
  if(intent?.excludedTypes.length)reasonCodes.push('exclusions_checked');
  const warnings=['營業與現場狀態可能改變；座位、排隊及消費條件未確認。'];
  if(places.some(p=>p.requiresStaffConfirmation))warnings.unshift('便利商店廁所尚未確認，請先詢問店員。');
  if(intent?.drinkMode==='nonCoffee')warnings.push('已避開咖啡店類別；個別飲品、庫存及成分需現場確認。');
  return {reasonCodes,reasons,evidenceRefs,warnings};
}
