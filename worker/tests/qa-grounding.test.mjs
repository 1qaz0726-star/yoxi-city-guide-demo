import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {validateIntent} from '../src/intent.js';
const base=()=>validateIntent({purpose:'drink',timeMinutes:30,maxStops:2,maxWalkMinutes:10,returnToOrigin:true,rhythm:'慢慢走',feeling:'簡單穩妥'});
const patch=(set={},rankingPreference=null)=>({set,addExcludedType:['coffee'],removeExcludedType:[],rankingPreference,clarification:null});
async function request(t,text,p){t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify(p)}}]}));return (await worker.fetch(new Request('https://test.invalid/api/refine-intent',{method:'POST',headers:{Origin:'http://localhost:4173','Content-Type':'application/json'},body:JSON.stringify({intent:base(),kind:'text',text,planVersion:1})}),{OPENROUTER_API_KEY:'test'})).json();}
test('QA today no coffee cannot invent additional closer ranking',async t=>{const b=await request(t,'今天不要咖啡',patch({drinkMode:'nonCoffee'},'closer'));assert.ok(!b.intent||b.revision.kind!=='closer');});
for(const [field,value] of [['maxStops',1],['maxWalkMinutes',3],['rhythm','快速完成'],['feeling','安靜'],['foodMode','snack'],['purpose','走走看看']])test('QA no-coffee cannot change unmentioned '+field,async t=>{const b=await request(t,'今天不要咖啡',patch({drinkMode:'nonCoffee',[field]:value}));assert.ok(!b.intent||b.intent[field]===base()[field],field+' silently changed');});
test('QA walk less but do not change purpose rejects imagined new purpose',async t=>{const p=patch({purpose:'走走看看'},'closer');p.addExcludedType=[];const b=await request(t,'想少走但不要換需求',p);assert.ok(!b.intent||b.intent.purpose===base().purpose);});
test('QA no coffee minimal intended patch preserves remaining fields',async t=>{const b=await request(t,'今天不要咖啡',patch({drinkMode:'nonCoffee'}));assert.ok(b.intent);for(const field of ['timeMinutes','returnToOrigin','maxStops','maxWalkMinutes','rhythm','feeling','foodMode','purpose'])assert.equal(b.intent[field],base()[field]);assert.equal(b.intent.drinkMode,'nonCoffee');assert.deepEqual(b.intent.excludedTypes,['coffee']);});
test('QA negated activity mention is not permission to change purpose',async t=>{const p=patch({purpose:'走走看看'},'closer');p.addExcludedType=[];const b=await request(t,'不要散步，想少走一點',p);assert.ok(!b.intent||b.intent.purpose===base().purpose);});
