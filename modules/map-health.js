/* MapLibre's error event includes individual resources, not just fatal map failures. */
(function (root) {
  function watch(map, {onReady, onStatus, onRetry, onDiagnostic = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, loadTimeout = 18000, retryDelay = 1800}) {
    const problems = new Map();
    let loaded = false, disposed = false, retryTimer = null;
    const resourceKey = event => event.tile?.tileID?.key != null
      ? `${event.sourceId || 'map'}:tile:${event.tile.tileID.key}`
      : event.sourceId || 'map';
    const clearRetry = () => { if (retryTimer !== null) clearTimer(retryTimer); retryTimer = null; };
    const report = () => {
      if (disposed) return;
      if (!problems.size && loaded) {
        clearRetry();
        onStatus({state: 'ready'});
      } else if (problems.size) {
        const routeOnly = loaded && [...problems.values()].every(problem => problem.sourceId === 'route');
        const denied = [...problems.values()].some(problem => [401, 403].includes(problem.status));
        onStatus({state: loaded ? 'partial' : 'unavailable', message: routeOnly
          ? '步行路線暫時無法顯示；行程內容仍保留，可重試或使用步行導航。'
          : denied ? '地圖服務暫時無法授權，請稍後重試；行程內容仍保留。'
          : loaded ? '部分地圖資料未載入，可重試；行程內容仍保留。'
          : '地圖尚未載入，請確認網路後重試；行程內容仍保留。'});
      }
    };
    const scheduleRecovery = () => {
      if (retryTimer !== null) return;
      retryTimer = setTimer(() => {
        retryTimer = null;
        if (disposed || !problems.size) return;
        const denied = [...problems.values()].some(problem => [401, 403].includes(problem.status));
        // At most one automatic retry is allowed by the caller. Do not loop on denied keys.
        if (!denied && onRetry()) return;
        report();
      }, retryDelay);
    };
    const loadTimer = setTimer(() => {
      if (disposed || loaded) return;
      problems.set('timeout', {sourceId: 'timeout'});
      report();
      scheduleRecovery();
    }, loadTimeout);
    const handlers = {
      load() {
        if (disposed) return;
        loaded = true;
        clearTimer(loadTimer);
        problems.delete('timeout');
        onReady();
        // load/idle can also fire with errored tiles. Never clear a recorded error here.
        report();
      },
      error(event) {
        if (disposed || event.error?.name === 'AbortError') return;
        problems.set(resourceKey(event), {sourceId: event.sourceId, status: Number(event.error?.status) || null});
        onDiagnostic({source: event.sourceId === 'route' ? 'route' : event.tile ? 'tile' : 'map', status: Number(event.error?.status) || null});
        scheduleRecovery();
      },
      sourcedata(event) {
        if (disposed) return;
        // A different tile finishing, or isSourceLoaded/idle, does not prove the failed one recovered.
        if (event.tile?.state === 'loaded') problems.delete(resourceKey(event));
        if (!event.tile && ['content', 'metadata'].includes(event.sourceDataType)) problems.delete(event.sourceId);
        report();
      },
      sourcedataabort(event) {
        if (disposed || !event.tile?.aborted) return;
        // Panning or fitting a new route removes obsolete tiles; they no longer describe this viewport.
        problems.delete(resourceKey(event));
        report();
      }
    };
    Object.entries(handlers).forEach(([event, handler]) => map.on(event, handler));
    return () => {
      disposed = true;
      clearTimer(loadTimer);
      clearRetry();
      Object.entries(handlers).forEach(([event, handler]) => map.off(event, handler));
    };
  }
  const api = {watch};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YoxiMapHealth = api;
})(globalThis);
