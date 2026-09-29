export const PURPOSES = ['吃點東西','喝杯咖啡','drink','走走看看','坐著休息','找洗手間','找室內待著'];
const RHYTHMS = ['快速完成','慢慢走','少走一點','可多走一點','只去一站','想去兩三站'];
const FEELINGS = ['安靜','在地','有點驚喜','有綠意','有文化感','簡單穩妥'];
const TYPES = ['meal','snack','coffee','park','culture','indoor','convenience','walk','toilet'];
export const intentSchema = {type:'object',additionalProperties:false,properties:{
  purpose:{type:'string',enum:PURPOSES},rhythm:{type:'string',enum:RHYTHMS},feeling:{type:'string',enum:FEELINGS},
  timeMinutes:{type:['integer','null'],minimum:15,maximum:120},maxWalkMinutes:{type:['integer','null'],minimum:1,maximum:60},
  maxStops:{type:['integer','null'],minimum:1,maximum:3},returnToOrigin:{type:'boolean'},foodMode:{type:'string',enum:['meal','snack']},
  drinkMode:{type:'string',enum:['any','coffee','nonCoffee']},indoorMode:{type:'string',enum:['shelter','sit']},excludedTypes:{type:'array',maxItems:9,items:{type:'string',enum:TYPES}},
  unsupportedConstraints:{type:'array',maxItems:8,items:{type:'string',maxLength:80}}
},required:['purpose','rhythm','feeling','timeMinutes','maxWalkMinutes','maxStops','returnToOrigin','foodMode','drinkMode','indoorMode','excludedTypes','unsupportedConstraints']};
export function validateIntent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k=>!intentSchema.required.includes(k))) return null;
  const v={rhythm:'少走一點',feeling:'簡單穩妥',timeMinutes:null,maxWalkMinutes:null,maxStops:null,returnToOrigin:false,foodMode:'meal',drinkMode:value.purpose==='喝杯咖啡'?'coffee':'any',indoorMode:'shelter',excludedTypes:[],unsupportedConstraints:[],...value};
  v.excludedTypes=Array.isArray(v.excludedTypes)?[...v.excludedTypes]:v.excludedTypes;
  v.unsupportedConstraints=Array.isArray(v.unsupportedConstraints)?[...v.unsupportedConstraints]:v.unsupportedConstraints;
  if(!['any','coffee','nonCoffee'].includes(v.drinkMode))return null;
  if(!PURPOSES.includes(v.purpose)||!RHYTHMS.includes(v.rhythm)||!FEELINGS.includes(v.feeling)||!['meal','snack'].includes(v.foodMode)||!['shelter','sit'].includes(v.indoorMode)||typeof v.returnToOrigin!=='boolean')return null;
  for(const [k,min,max] of [['timeMinutes',15,120],['maxWalkMinutes',1,60],['maxStops',1,3]]) if(v[k]!==null&&(!Number.isInteger(v[k])||v[k]<min||v[k]>max))return null;
  if(!Array.isArray(v.excludedTypes)||v.excludedTypes.length>9||v.excludedTypes.some(x=>!TYPES.includes(x)))return null;
  if(!Array.isArray(v.unsupportedConstraints)||v.unsupportedConstraints.length>8||v.unsupportedConstraints.some(x=>typeof x!=='string'||!x.trim()||x.length>80))return null;
  if(v.indoorMode==='sit'&&!v.unsupportedConstraints.includes('座位無法確認'))v.unsupportedConstraints.push('座位無法確認');
  if(v.purpose==='找洗手間')v.maxStops=1;
  return v;
}
// This fallback deliberately accepts only narrow statements; uncertain language is never silently dropped.
export function ruleIntent(text, purpose) {
  const result={intent:null,parser:'rules',warnings:['使用明確詞句規則整理，並非 AI 解析。']};
  if(typeof text!=='string'||!text.trim()||[...text].length>120)return {...result,clarification:'請用 1–120 字描述這次想做的事。'};
  const groups=[['吃點東西',/吃飯|正餐|吃點|小點|點心|零食/],['喝杯咖啡',/咖啡|喝點|飲料/],['走走看看',/散步|走走|逛逛/],['坐著休息',/休息|累/],['找洗手間',/廁所|洗手間/],['找室內待著',/室內|避雨/]];
  if(/不要|不吃|不喝|別|不是|先.+再|一定|必須|過敏|輪椅|無障礙|訂位|訂餐|預算|元|免費|座位|不排隊/.test(text))return {...result,clarification:'這句包含排除、順序或尚無法確認的條件，請修改成單一需求或使用快捷選項。'};
  const hits=groups.filter(([,re])=>re.test(text)).map(([p])=>p);
  if(hits.length!==1||purpose&&purpose!==hits[0]&&!(purpose==='drink'&&hits[0]==='喝杯咖啡'))return {...result,clarification:'這次最想先完成哪一件事？請選一個主要需求。'};
  const remainder=text.replace(/吃飯|正餐|吃點東西|小點|點心|零食|喝咖啡|咖啡|喝點東西|飲料|散步|走走|逛逛|休息|有點累|室內|避雨|廁所|洗手間|慢慢走|不想走太遠|只去一家|只去一站|回到原地|回到這裡|單程最多走\d+分鐘|\d+分鐘|我|想要|想|有|找|去|，|。|、|\s/g,'');
  if(remainder)return {...result,clarification:'暫時無法完整理解這句話，請簡化描述或使用快捷選項；原條件不會被忽略。'};
  const walk=text.match(/單程最多走(\d+)分鐘/);const withoutWalk=text.replace(/單程最多走\d+分鐘/,'');const time=withoutWalk.match(/(\d+)分鐘/);
  const intent=validateIntent({purpose:hits[0],timeMinutes:time?Number(time[1]):null,maxWalkMinutes:walk?Number(walk[1]):null,maxStops:/只去一家|只去一站/.test(text)?1:null,rhythm:/慢慢走/.test(text)?'慢慢走':'少走一點',foodMode:/小點|點心|零食/.test(text)?'snack':'meal',returnToOrigin:/回到原地|回到這裡/.test(text)});
  if(intent&&hits[0]==='喝杯咖啡'&&!/咖啡/.test(text)){intent.purpose='drink';intent.drinkMode='any';}
  return intent?{...result,intent}:{...result,clarification:'目前支援 15–120 分鐘、每段步行上限 1–60 分鐘，請修改條件。'};
}
