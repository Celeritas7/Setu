// Browser rehearsal for correcting the note and spending on one saved occurrence.
export function openCorrection(container,sb,key) {
  const form=document.createElement('form');
  container.replaceChildren(form);
  const add=(tag,text)=>{
    const node=document.createElement(tag);
    node.textContent=text;
    form.append(node);
    return node;
  };
  add('h2','Review saved draft observation');
  add('p','Account '+key.expected_owner);
  const current=add('pre',''),note=document.createElement('textarea'),spend=document.createElement('input');
  add('label','First-hand note').append(note);
  note.maxLength=2000;
  spend.type='number';spend.min='0';spend.step='1';spend.max=String(Number.MAX_SAFE_INTEGER);
  add('label','Actual yen (blank if unknown)').append(spend);
  const review=add('button','Review correction'),preview=add('pre','');
  const withdraw=add('button','Review withdrawal');
  const save=add('button','Confirm correction'),reload=add('button','Load latest revision'),cancel=add('button','Cancel');
  for (const button of [review,withdraw,save,reload,cancel]) button.type='button';
  form.onsubmit=e=>e.preventDefault();
  const status=add('p','');
  status.setAttribute('role','status');
  let row,pending,busy=false,closed=false,stale=false,subscription;
  function controls() {
    note.disabled=spend.disabled=busy||!row;
    review.disabled=withdraw.disabled=busy||stale||!row;
    save.disabled=busy||stale||!pending;
    reload.hidden=!stale;reload.disabled=busy;
  }
  function invalidate() {save.textContent='Confirm correction';pending=null;preview.textContent='';controls();}
  function close(message) {
    closed=true;subscription?.unsubscribe();
    status.textContent=message;container.replaceChildren(status);
  }
  async function read() {
    busy=true;controls();
    try {
      const {data,error}=await sb.rpc('setu_rehearse_review_observation',key);
      if (closed) return;
      if (error || !data?.length) {close('Draft unavailable. Reopen the review.');return;}
      // Keep local edits, but adopt concurrent changes to fields left untouched.
      if (!row || note.value===(row.observation.note??'')) note.value=data[0].observation.note??'';
      if (!row || spend.value===String(row.observation.spend_yen??'')) spend.value=data[0].observation.spend_yen??'';
      row=data[0];stale=false;
      current.textContent='Saved revision '+row.revision+' · '+row.stop_name+'\n'+JSON.stringify(row.observation,null,2);
      status.textContent='Review the saved details and your correction.';
    } catch {if (!closed) close('Could not load the draft. Reopen the review.');}
    finally {busy=false;invalidate();}
  }
  note.oninput=spend.oninput=invalidate;
  review.onclick=()=>{
    invalidate();
    if (!form.reportValidity()) return;
    const replacement={...row.observation,note:note.value.trim()||null,spend_yen:spend.value===''?null:spend.valueAsNumber};
    if (replacement.outcome==='Personally reviewed' && !replacement.note) {
      status.textContent='A personal review needs a first-hand note.';return;
    }
    save.textContent='Confirm correction';
    pending={...key,reviewed_revision:row.revision,replacement};
    preview.textContent='Proposed revision from '+row.revision+'\n'+JSON.stringify(replacement,null,2);
    controls();
  };
  withdraw.onclick=()=>{
    pending={...key,reviewed_revision:row.revision};
    preview.textContent='Withdraw saved revision '+row.revision+' · '+row.stop_name+' · '+row.observation.space+
      '\nThe draft will disappear from review. Its original observation stays in storage.';
    status.textContent='Confirm withdrawal of this saved observation or cancel.';
    save.textContent='Confirm withdrawal';
    controls();
  };
  save.onclick=async ()=>{
    if (!pending || busy) return;
    busy=true;controls();cancel.disabled=true;
    try {
      const withdrawing=!Object.hasOwn(pending,'replacement');
      const operation=withdrawing?'setu_rehearse_withdraw_observation':'setu_rehearse_correct_observation';
      status.textContent=withdrawing?'Withdrawing saved observation…':'Saving correction…';
      const {data,error,status:code}=await sb.rpc(operation,pending);
      if (closed) return;
      if (!error) {close(withdrawing?'Observation withdrawn from review.':'Saved revision '+data+'.');return;}
      if (code===403 || code===404) {close('Account or draft unavailable. Reopen the review.');return;}
      status.textContent=code===409?'Another edit was saved. Load the latest revision to compare.':'Save unconfirmed. Load the latest revision.';
      stale=true;
    } catch {if (!closed){status.textContent='Save unconfirmed. Load the latest revision.';stale=true;}}
    finally {busy=false;cancel.disabled=false;invalidate();}
  };
  reload.onclick=read;cancel.onclick=()=>close(pending && !Object.hasOwn(pending,'replacement')?'Withdrawal cancelled.':'Correction cancelled.');
  subscription=sb.auth.onAuthStateChange((_,session)=>{
    if (!closed && (session?.user?.id!==key.expected_owner || session.user.is_anonymous)) close('Account changed. Reopen the review.');
  }).data.subscription;
  if (!closed) void read();
  else subscription.unsubscribe();
}
