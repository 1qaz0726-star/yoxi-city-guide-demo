import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateChoice, verifyItinerary, normalizeCoordinate } from '../src/index.js';
const origin = { latitude:25, longitude:121 };
const env = { GOOGLE_MAPS_SERVER_KEY:'test-server', GOOGLE_MAPS_BROWSER_KEY:'test-browser' };
const geometry = { type:'LineString',coordinates:[[121,25],[121.001,25]] };
const candidate = (id,role='meal') => ({id,name:id,journeyRole:role,location:origin,initialRoute:{duration:300,distanceMeters:400,geometry}});
function req(path,input) { return new Request('https://example.test'+path,{method:input?'POST':'GET',headers:{Origin:'http://localhost:4173','Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})}); }
test('no duplicate meals or fabricated IDs',()=>{
  const c=[candidate('a'),candidate('b')];
  assert.equal(validateChoice({stops:[{id:'a',stayMinutes:10},{id:'b',stayMinutes:10}]},c),null);
  assert.equal(validateChoice({stops:[{id:'made-up',stayMinutes:10}]},c),null);
});
test('null coordinates rejected',()=>assert.equal(normalizeCoordinate({lat:null,lng:null}),null));
test('config exposes browser key only',async()=>{
  const body=await (await worker.fetch(req('/api/config'),env)).json();
  assert.equal(body.provider,'google');assert.equal(body.browserApiKey,'test-browser');assert.ok(!JSON.stringify(body).includes('test-server'));
});
test('partial Google setup keeps provider pair on Geoapify',async()=>{
  const body=await (await worker.fetch(req('/api/config'),{GOOGLE_MAPS_BROWSER_KEY:'test-browser',GEOAPIFY_SERVER_API_KEY:'legacy-server',GEOAPIFY_BROWSER_KEY:'legacy-browser'})).json();
  assert.equal(body.provider,'geoapify');assert.equal(body.googleSetupComplete,false);
});
test('return journey counted and rejects impossible budget',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({routes:[{duration:'600s',distanceMeters:800,polyline:{geoJsonLinestring:geometry}}]}));
  const c=[candidate('a','coffee')],choice={stops:[{id:'a',stayMinutes:10}]};
  const ok=await verifyItinerary(choice,c,origin,30,5,env,true);assert.equal(ok.returnLeg.duration,600);
  assert.equal(await verifyItinerary(choice,c,origin,20,5,env,true),null);
});
test('real contract: exclusions, unknown opening, exact budget sum',async t=>{
  t.mock.method(globalThis,'fetch',async(url)=>String(url).includes('places:searchNearby') ? Response.json({places:[{id:'excluded',displayName:{text:'Old cafe'},location:origin,types:['cafe']},{id:'new',displayName:{text:'New cafe'},location:origin,types:['cafe']}]}) : Response.json({routes:[{duration:'120s',distanceMeters:150,polyline:{geoJsonLinestring:geometry}}]}));
  const res=await worker.fetch(req('/api/plan',{origin:{lat:25,lng:121},preferences:{purpose:'喝杯咖啡',rhythm:'只去一站',feeling:'安靜'},timeMinutes:45,returnToOrigin:true,excludePlaceIds:['excluded']}),env);
  assert.equal(res.status,200);const body=await res.json();assert.equal(body.places.length,1);assert.equal(body.places[0].id,'new');assert.equal(body.places[0].openingStatus,'unknown');
  assert.equal(body.route.walkMinutes+body.route.stayMinutes+body.route.bufferMinutes+body.route.freeMinutes,45);assert.equal(body.route.walkMinutes,4);
});
test('upstream failure is explicit and contains no credentials',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:403}));
  const res=await worker.fetch(req('/api/route',{origin:{lat:25,lng:121},destination:{lat:25.1,lng:121}}),env);
  assert.equal(res.status,502);assert.ok(!(await res.text()).includes('test-server'));
});
test('invalid exclusion rejected before provider request',async()=>{
  const res=await worker.fetch(req('/api/plan',{origin:{lat:25,lng:121},preferences:{purpose:'吃點東西',rhythm:'只去一站',feeling:'安靜'},timeMinutes:45,excludePlaceIds:'all'}),env);assert.equal(res.status,400);
});
test('aborted upstream returns bounded safe error',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('aborted','AbortError');});
  const res=await worker.fetch(req('/api/route',{origin:{lat:25,lng:121},destination:{lat:25.1,lng:121}}),env);assert.equal(res.status,502);
});
test('request local route cache caps calls for one-stop return plan',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url)=>{calls++;return String(url).includes('places:searchNearby')?Response.json({places:[{id:'c',displayName:{text:'Cafe'},location:{latitude:25.001,longitude:121},types:['cafe']}]}):Response.json({routes:[{duration:'120s',distanceMeters:150,polyline:{geoJsonLinestring:geometry}}]});});
  const res=await worker.fetch(req('/api/plan',{origin:{lat:25,lng:121},preferences:{purpose:'喝杯咖啡',rhythm:'只去一站',feeling:'安靜'},timeMinutes:45,returnToOrigin:true}),env);
  assert.equal(res.status,200);assert.equal(calls,4); // two categories + outbound + return, no redundant revalidation call
});
test('unreachable first return route tries second same-purpose place',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('places:searchNearby'))return Response.json({places:['a','b'].map((id,index)=>({id,displayName:{text:id},location:{latitude:25.001+index*.001,longitude:121},types:['cafe']}))});
    const request=JSON.parse(options.body);
    if(request.origin.location.latLng.latitude===25.001 && request.destination.location.latLng.latitude===25)return Response.json({routes:[]});
    return Response.json({routes:[{duration:'120s',distanceMeters:150,polyline:{geoJsonLinestring:geometry}}]});
  });
  const res=await worker.fetch(req('/api/plan',{origin:{lat:25,lng:121},preferences:{purpose:'喝杯咖啡',rhythm:'只去一站',feeling:'安靜'},timeMinutes:45,returnToOrigin:true}),env);
  assert.equal(res.status,200);assert.equal((await res.json()).places[0].id,'b');
});
test('deadline stops additional provider calls',async t=>{
  let now=0,calls=0;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async(url)=>{calls++;now=31000;return Response.json({places:[{id:'a',displayName:{text:'a'},location:origin,types:['cafe']}]});});
  const res=await worker.fetch(req('/api/plan',{origin:{lat:25,lng:121},preferences:{purpose:'喝杯咖啡',rhythm:'只去一站',feeling:'安靜'},timeMinutes:45}),env);
  assert.ok(res.status>=400);assert.equal(calls,1);
});
