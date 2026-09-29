import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../modules/map-health.js';

function fixture({retry = false} = {}) {
  const listeners = new Map(), timers = new Map(), statuses = [], diagnostics = [];
  let clock = 0, timerId = 0, retries = 0, ready = 0;
  const map = {
    on(name, callback) { listeners.set(name, callback); },
    off(name) { listeners.delete(name); },
    fire(name, event = {}) { listeners.get(name)?.(event); }
  };
  const dispose = health.watch(map, {
    onReady: () => { ready++; },
    onStatus: status => statuses.push(status),
    onRetry: () => { retries++; return retry; },
    onDiagnostic: details => diagnostics.push(details),
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, {at: clock + delay, callback}); return id; },
    clearTimer(id) { timers.delete(id); }
  });
  return {
    map, statuses, diagnostics, dispose,
    get latest() { return statuses.at(-1); },
    get retries() { return retries; },
    get ready() { return ready; },
    tick(milliseconds) {
      const end = clock + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; clock = timer.at; timers.delete(id); timer.callback();
      }
      clock = end;
    }
  };
}
const tileError = (key = '15/27444/14000', status = 503) => ({sourceId: 'openmaptiles', tile: {tileID: {key}, state: 'errored'}, error: {status}});
const tileSuccess = key => ({sourceId: 'openmaptiles', tile: {tileID: {key}, state: 'loaded'}, isSourceLoaded: true});

test('a healthy map becomes ready and cancels the initial timeout', () => {
  const f = fixture(); f.map.fire('load'); f.tick(20000);
  assert.equal(f.latest.state, 'ready'); assert.equal(f.ready, 1); assert.equal(f.retries, 0);
});

test('a transient tile failure that successfully reloads does not become a permanent banner', () => {
  const f = fixture(); f.map.fire('load'); f.map.fire('error', tileError());
  f.tick(500); f.map.fire('sourcedata', tileSuccess('15/27444/14000')); f.tick(2000);
  assert.equal(f.latest.state, 'ready'); assert.equal(f.retries, 0);
});

test('a later successful reload clears an already visible partial warning', () => {
  const f = fixture(); f.map.fire('load'); f.map.fire('error', tileError()); f.tick(1800);
  assert.equal(f.latest.state, 'partial');
  f.map.fire('sourcedata', tileSuccess('15/27444/14000'));
  assert.equal(f.latest.state, 'ready');
});

test('load, idle, and unrelated successful tiles do not hide a genuinely missing tile', () => {
  const f = fixture(); f.map.fire('error', tileError()); f.map.fire('load');
  f.map.fire('idle'); f.map.fire('sourcedata', tileSuccess('different-tile')); f.tick(1800);
  assert.equal(f.latest.state, 'partial'); assert.equal(f.retries, 1);
});

test('failed route overlay reports the route, while the base map remains usable', () => {
  const f = fixture(); f.map.fire('load');
  f.map.fire('error', {sourceId: 'route', error: new Error('Invalid GeoJSON')}); f.tick(1800);
  assert.equal(f.latest.state, 'partial'); assert.match(f.latest.message, /^步行路線/);
  f.map.fire('sourcedata', {sourceId: 'route', sourceDataType: 'content'});
  assert.equal(f.latest.state, 'ready');
});

test('an obsolete failed tile removed during a route camera move cannot leave a stale warning', () => {
  const f = fixture(); f.map.fire('load'); f.map.fire('error', tileError()); f.tick(1800);
  const obsolete = tileError(); obsolete.tile.aborted = true;
  f.map.fire('sourcedataabort', obsolete);
  assert.equal(f.latest.state, 'ready');
});

test('intentional AbortError from cancelled map requests is not shown as a failure', () => {
  const f = fixture(); f.map.fire('load');
  f.map.fire('error', {error: {name: 'AbortError'}}); f.tick(20000);
  assert.equal(f.latest.state, 'ready'); assert.equal(f.retries, 0);
});

test('401/403 errors stay visible and never trigger automatic retry loops', () => {
  for (const status of [401, 403]) {
    const f = fixture({retry: true}); f.map.fire('error', tileError('tile', status)); f.tick(1800);
    assert.equal(f.latest.state, 'unavailable'); assert.match(f.latest.message, /授權/); assert.equal(f.retries, 0);
  }
});

test('a stalled initial load still produces a retryable failure even after an earlier resource error', () => {
  const f = fixture(); f.map.fire('error', tileError()); f.tick(20000);
  assert.equal(f.latest.state, 'unavailable'); assert.equal(f.ready, 0);
});

test('late successful initial load recovers from the timeout', () => {
  const f = fixture(); f.tick(18000); assert.equal(f.latest.state, 'unavailable');
  f.map.fire('load'); f.tick(2000);
  assert.equal(f.latest.state, 'ready'); assert.equal(f.retries, 0);
});

test('disposing a replaced map cancels all old events and delayed retries', () => {
  const f = fixture(); f.map.fire('error', tileError()); f.dispose();
  f.map.fire('load'); f.tick(30000);
  assert.equal(f.ready, 0); assert.equal(f.retries, 0); assert.equal(f.statuses.length, 0);
});

test('a source-less sprite error requests a real reload; the new successful map has no stale warning', () => {
  const oldMap = fixture({retry: true}); oldMap.map.fire('load');
  oldMap.map.fire('error', {error: {status: 503, url: 'https://maps.example/sprite.png'}});
  oldMap.tick(1800); assert.equal(oldMap.retries, 1); oldMap.dispose();
  const freshMap = fixture(); freshMap.map.fire('load'); freshMap.tick(20000);
  assert.equal(freshMap.latest.state, 'ready'); assert.equal(freshMap.retries, 0);
});

test('a source-less resource still failing after the retry remains an honest partial warning', () => {
  const f = fixture(); f.map.fire('load');
  f.map.fire('error', {error: {status: 503, url: 'https://maps.example/sprite.png'}});
  f.map.fire('sourcedata', tileSuccess('some-successful-tile')); f.map.fire('idle'); f.tick(1800);
  assert.equal(f.latest.state, 'partial'); assert.match(f.latest.message, /部分地圖資料/);
});

test('diagnostics never include provider URLs, keys, or map coordinates', () => {
  const f = fixture();
  f.map.fire('error', {...tileError(), error: {status: 503, message: 'https://provider.example/25.05/121.5?apiKey=private-key'}});
  assert.deepEqual(f.diagnostics, [{source: 'tile', status: 503}]);
});
