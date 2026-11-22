(function (root) {
  'use strict';
  function open(indexedDB = root.indexedDB, databaseName = 'setu-research-local-v1') {
    return new Promise((resolve,reject) => {
      if (!indexedDB) {reject(new Error('Browser storage is unavailable. Download a backup to keep your work.'));return;}
      const request = indexedDB.open(databaseName,1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspaces',{keyPath:'id'});
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Research Import tabs and retry local saving.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        function read(id) {return new Promise((done,fail) => {
          const tx = db.transaction('workspaces','readonly'), request = tx.objectStore('workspaces').get(id);
          tx.oncomplete = () => done(request.result || null);tx.onerror = tx.onabort = () => fail(tx.error || new Error('Local read failed.'));
        });}
        function list() {return new Promise((done,fail) => {
          const tx = db.transaction('workspaces','readonly'), request = tx.objectStore('workspaces').getAll();
          tx.oncomplete = () => done(request.result || []);tx.onerror = tx.onabort = () => fail(tx.error || new Error('Local read failed.'));
        });}
        function write(id,expectedRevision,payload) {return new Promise((done,fail) => {
          const tx = db.transaction('workspaces','readwrite'), store = tx.objectStore('workspaces'), request = store.get(id);
          let result, error;
          request.onsuccess = () => {
            const current = request.result;
            if ((current?.rev || 0) !== expectedRevision) {
              error = new Error('Another tab changed this destination. Download your current backup, then resume its saved review.');error.code='CONFLICT';tx.abort();return;
            }
            result = {id,rev:expectedRevision+1,saved_at:new Date().toISOString(),payload,previous:current?.payload || null};
            store.put(result);
          };
          tx.oncomplete = () => done(result);
          tx.onerror = tx.onabort = () => fail(error || tx.error || new Error('Local save failed. Keep this page open and download a backup.'));
        });}
        resolve({read,list,write,close:() => db.close()});
      };
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {open};else root.SetuResearchStorage = {open};
})(typeof globalThis !== 'undefined' ? globalThis : this);
