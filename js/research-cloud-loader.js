/* Optional online workflow; the offline importer still loads no auth client. */
(function () {
  let loading;
  window.SetuOpenResearchCloud = async options => {
    try {
      if (!loading) loading=(async () => {
        const style=document.createElement('link');style.rel='stylesheet';style.href='css/research-cloud.css';document.head.append(style);
        for(const src of ['research-import-schema','research-import','research-local','research-storage','research-cloud','research-cloud-ui']) {
          await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='js/'+src+'.js';script.onload=resolve;script.onerror=()=>reject(new Error('Research cloud files could not load. Reconnect and try again.'));document.head.append(script);});
        }
      })().catch(error=>{loading=null;throw error;});
      await loading;window.SetuResearchCloudUI.open(options || {hub:window.setu});
    } catch(error) {window.alert(error.message);}
  };
  if(new URLSearchParams(location.search).get('research-cloud')==='1') void window.SetuOpenResearchCloud({hub:window.setu});
})();
