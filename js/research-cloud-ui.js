(function (root) {
  'use strict';
  function open({hub,onSaved=()=>{}}={}) {
    const local=root.SetuResearchLocal,cloud=root.SetuResearchCloud,model=root.SetuResearchImport;
    const dialog=document.createElement('dialog');dialog.className='research-cloud-dialog';dialog.setAttribute('aria-label','Research cloud');
    const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
    const button=(text,fn)=>{const el=node('button',text);el.type='button';el.addEventListener('click',fn);return el;};
    const close=button('Close',()=>{generation++;dialog.close();dialog.remove();unsubscribe?.();});close.className='cloud-close';
    dialog.append(close,node('h2','Research cloud'));
    const notice=node('p',cloud.RELEASE_ENABLED?'Review this account and batch before uploading.':'Cloud saving is not enabled yet. Continue using local drafts and downloaded backups.');notice.className='cloud-notice';dialog.append(notice);
    dialog.append(node('p','Local reviews are shared by this browser, not assigned to a sign-in. Upload only research you intend to store in the displayed account. New places stay unvisited suggestions in Browse. Selected merges attach evidence and preserve personal reviews, pins and confirmed tags.'));
    const status=node('p','Waiting for Setu sign-in…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(status);
    const body=node('div');dialog.append(body);document.body.append(dialog);dialog.showModal();
    let owner=null,generation=0,unsubscribe,client,records=[],plan=null,busy=false;
    const stores=Promise.all([root.SetuResearchStorage.open(),root.SetuResearchStorage.open(undefined,'setu-research-cloud-outbox-v1')]);
    const download=(value,name)=>{const url=URL.createObjectURL(new Blob([local.serializeBackup(value)],{type:'application/json'}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    async function run(fn) {
      if(busy)return;busy=true;const epoch=generation;
      try{await fn();}catch(error){if(epoch===generation){status.textContent=error.uncertain?'Upload result unconfirmed. Your exact queued request is retained; use Retry pending upload.':'Could not complete: '+error.message;if(['PGRST202','PGRST205','42P01','42883'].includes(error.code))status.textContent='Cloud saving is not set up for this app yet. Local drafts and backups remain available.';}}
      finally{busy=false;}
    }
    async function render(user) {
      const epoch=++generation;owner=user?.id || null;plan=null;body.replaceChildren();
      if(!owner){status.textContent='Sign in from Setu Home to use Research cloud.';return;}
      status.textContent='Signed in as '+(user.email || 'your Setu account')+'. No uploads run automatically.';
      try{
        const [localStore,outbox]=await stores;if(epoch!==generation)return;
        client=cloud.create({sb:hub.sb,owner,isCurrent:()=>epoch===generation && hub.user?.id===owner,localStore,outbox});
        records=await localStore.list();if(epoch!==generation)return;
        const select=node('select');select.setAttribute('aria-label','Local destination');
        records.forEach((record,i)=>{const r=record.payload?.reviews?.[record.payload?.active]?.research;const opt=node('option',(r?.destination?.name_ja || r?.destination?.name_en || 'Saved destination')+' · '+record.saved_at);opt.value=String(i);select.append(opt);});
        const mode=node('input');mode.type='checkbox';const modeLabel=node('label');modeLabel.append(mode,node('span','Publish approved local suggestions and selected evidence merges to Browse, as well as saving the review'));
        const confirmation=node('input');confirmation.type='checkbox';const confirmLabel=node('label');confirmLabel.append(confirmation,node('span','I reviewed this batch, including changed cloud decisions, and want to upload its research to '+(user.email || 'this signed-in account')));
        const preview=node('div');let draftPage=0;
        const commit=button('Upload reviewed batch',()=>run(async()=>{
          if(!plan)throw Error('Preview the destination first.');
          let receipt;
          try{receipt=await client.commit(plan,confirmation.checked);}
          catch(error){
            invalidate();
            if(error.code==='40001')error.message='Cloud records changed after this preview. Preview again and review the differences before approving.';
            throw error;
          }
          status.textContent='Cloud save confirmed · revision '+receipt.rev+' · '+receipt.created+' new suggestions · '+receipt.evidence_added+' evidence attachments.';
          invalidate();await onSaved();
        }));commit.disabled=true;
        function invalidate(){plan=null;confirmation.checked=false;commit.disabled=true;preview.replaceChildren();}
        select.addEventListener('change',invalidate);mode.addEventListener('change',invalidate);
        confirmation.addEventListener('change',()=>{commit.disabled=!cloud.RELEASE_ENABLED || !plan || !confirmation.checked;});
        function showPlan(){
          preview.replaceChildren();const s=plan.summary;
          preview.append(node('p','Cloud revision '+plan.remote_rev+' · '+s.created+' new suggestions · '+s.reused+' previously published · '+s.merges+' selected saved-place merges.'));
          if(plan.differences.length){const differences=node('details');differences.open=true;differences.append(node('summary',plan.differences.length+' cloud decisions/hub choices will change to the reviewed local values'),node('pre',JSON.stringify(plan.differences,null,2)));preview.append(differences);}
          if(plan.payload.restore_warnings?.length)preview.append(node('p',plan.payload.restore_warnings.join(' ')));
          if(plan.publish) {
            for(const draft of plan.payload.catalog.places.slice(draftPage*5,draftPage*5+5)) {
              const source=local.effectiveSource(draft),prices=model.priceSummary(source.research_fields.cost),card=node('article');
              card.append(node('h3',source.name_ja),node('p',prices.admission+' · '+prices.estimate));
              const details=node('details');details.append(node('summary','Preserved sources, potential tags and original evidence'),node('pre',JSON.stringify(draft,null,2)));card.append(details);preview.append(card);
            }
            const previous=button('Previous suggestions',()=>{draftPage--;showPlan();}),next=button('Next suggestions',()=>{draftPage++;showPlan();});
            previous.disabled=draftPage===0;next.disabled=(draftPage+1)*5>=s.local_suggestions;preview.append(previous,next);
            const merges=model.reviewExport(plan.payload.reviews[plan.payload.active]).proposed_changes.filter(p=>p.action==='merge_selected');
            if(merges.length){const details=node('details');details.append(node('summary','Selected merge evidence'),node('pre',JSON.stringify(merges,null,2)));preview.append(details);}
          }
          preview.append(button('Download proposed workspace backup',()=>run(()=>download(local.backup(plan.payload),'setu-research-proposed-backup.json'))));
        }
        const prepare=button('Preview cloud batch',()=>run(async()=>{
          invalidate();const record=records[Number(select.value || 0)];if(!record)throw Error('Save or restore a local research review first.');
          const before=generation,selected=select.value,publish=mode.checked;
          const prepared=await client.prepare(record,publish);
          if(before!==generation || selected!==select.value || publish!==mode.checked)return;
          plan=prepared;draftPage=0;showPlan();status.textContent='Preview ready. Nothing has been uploaded.';
        }));
        const retry=button('Retry pending upload',()=>run(async()=>{const record=records[Number(select.value || 0)];if(!record)throw Error('Choose a destination.');const receipt=await client.retry(record.id);status.textContent='Pending cloud save confirmed · revision '+receipt.rev;invalidate();await onSaved();}));retry.disabled=!cloud.RELEASE_ENABLED;
        const remote=node('div');
        const list=button('List my cloud reviews',()=>run(async()=>{
          const before=generation,rows=await client.list();if(before!==generation)return;remote.replaceChildren();
          rows.forEach(row=>{const line=node('p',(row.destination_name || 'Cloud review')+' · revision '+row.rev+' · '+row.updated_at);line.append(button('Download cloud backup',()=>run(async()=>download(await client.download(row.destination_id),'setu-research-cloud-backup.json'))));if(row.rev>1)line.append(button('Download previous cloud checkpoint',()=>run(async()=>download(await client.download(row.destination_id,true),'setu-research-cloud-previous.json'))));remote.append(line);});
          if(rows.length===200)remote.append(node('p','Showing the latest 200 cloud destinations.'));
          if(!rows.length)remote.append(node('p','No cloud research reviews saved for this account.'));
        }));
        const evidence=button('View my saved research evidence',()=>run(async()=>{
          const before=generation,rows=await client.evidence();if(before!==generation)return;remote.replaceChildren();
          rows.forEach(row=>{const details=node('details');details.append(node('summary',(row.source?.name_ja || 'Research source')+' · '+row.selected_fields.join(', ')),node('pre',JSON.stringify(row,null,2)));remote.append(details);});
          if(!rows.length)remote.append(node('p','No research evidence saved for this account.'));
        }));
        body.append(node('p','Choose a local destination, preview the batch and review the original evidence. Download a cloud backup to restore it through Research Import on another device.'),select,modeLabel,prepare,preview,confirmLabel,commit,retry,list,evidence,remote);
      }catch(error){if(epoch===generation)status.textContent=error.message;}
    }
    if(hub?.onAuth)unsubscribe=hub.onAuth(user=>{if((user?.id || null)!==owner || !body.children.length)void render(user);});
    else status.textContent='Setu sign-in is unavailable. Close this panel and reload Setu Home.';
    dialog.addEventListener('cancel',()=>{generation++;unsubscribe?.();dialog.remove();});
    return dialog;
  }
  root.SetuResearchCloudUI={open};
})(typeof globalThis!=='undefined'?globalThis:this);
