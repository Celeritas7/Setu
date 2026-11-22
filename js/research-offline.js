/* Verifies this importer's controller and cache; never reads saved research. */
(function (root) {
  'use strict';
  const VERSION = 'r3-2';
  const STATUS = 'SETU_RESEARCH_OFFLINE_STATUS';
  const PREPARE = 'SETU_RESEARCH_OFFLINE_PREPARE';
  function start({serviceWorker, secure, base, status, check, reopen,
    createChannel = () => new MessageChannel(), schedule = setTimeout, cancel = clearTimeout}) {
    let registration = null, sequence = 0;
    reopen.hidden = true;
    if (!secure || !serviceWorker) {
      status.textContent = 'Offline reopening needs a supported browser on HTTPS. Local backups remain available.';
      check.disabled = true;
      return Promise.resolve();
    }
    const scope = new URL('research-import.html',base).href;
    const script = new URL('research-import-sw.js',base).href;
    async function verify(repair = false) {
      const attempt = ++sequence;
      reopen.hidden = true;
      if (registration?.active?.state !== 'activated') {
        status.textContent = 'Installing offline files. Keep this page online until verification finishes.';
        return;
      }
      const controller = serviceWorker.controller;
      if (!controller || controller.scriptURL !== script) {
        status.textContent = 'Offline files are installed, but this page is not controlled yet. Reload normally once while online; avoid Ctrl+Shift+R or Ctrl+F5.';
        return;
      }
      status.textContent = repair ? 'Preparing and checking offline files…' : 'Checking page control and offline files…';
      const result = await new Promise(resolve => {
        const channel = createChannel();let timer;
        const finish = value => {
          cancel(timer);channel.port1.onmessage = null;channel.port1.close();resolve(value);
        };
        channel.port1.onmessage = event => finish(event.data);
        timer = schedule(() => finish(null),5000);
        try {controller.postMessage({type:repair ? PREPARE : STATUS},[channel.port2]);}
        catch (_) {finish(null);}
      });
      if (attempt !== sequence) return;
      if (serviceWorker.controller !== controller || registration.active?.state !== 'activated') return verify();
      if (result?.type === STATUS && result.version === VERSION && result.ready === true) {
        status.textContent = 'Research Import ready offline: this page is controlled and all required files are cached. Saved reviews stay in this browser.';
        reopen.hidden = false;
      } else {
        status.textContent = 'Offline reopening is not verified. Reconnect, then select Check offline setup. Local saving and downloaded backups remain available.';
      }
    }
    const watched = new WeakSet();
    function watch() {
      for (const worker of [registration?.installing,registration?.waiting,registration?.active]) {
        if (!worker || watched.has(worker)) continue;
        watched.add(worker);worker.addEventListener('statechange',() => {
          watch();
          if (worker.state === 'redundant' && registration.active?.state !== 'activated') {
            sequence++;reopen.hidden = true;
            status.textContent = 'Offline installation failed. Reconnect and select Check offline setup. Saved reviews remain in this browser.';
          } else void verify();
        });
      }
    }
    serviceWorker.addEventListener('controllerchange',() => {void verify();});
    check.addEventListener('click',async () => {
      if (!registration) return initialize();
      // An existing cached setup remains usable when an online update is unavailable.
      try {await registration.update();} catch (_) { /* Verify the installed worker. */ }
      watch();await verify(true);
    });
    async function initialize() {
      try {
        try {registration = await serviceWorker.register(script,{scope,updateViaCache:'none'});}
        catch (error) {
          registration = await serviceWorker.getRegistration(scope);
          if (!registration || registration.scope !== scope || registration.active?.scriptURL !== script) throw error;
        }
        registration.addEventListener('updatefound',() => {watch();void verify();});
        watch();await verify();
      } catch (_) {
        status.textContent = 'Offline reopening is unavailable. Reconnect and select Check offline setup. Local saving and downloaded backups remain available.';
      }
    }
    return initialize();
  }
  const api = {start,VERSION,STATUS,PREPARE};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SetuResearchOffline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
