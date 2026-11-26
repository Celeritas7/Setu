// Rehearsal only. The caller supplies validated L5A proposals and a local capture callback.
export function openConsent(container,{proposals,owner,auth,onSessionChange,capture}) {
  const rows=structuredClone(proposals);
  const selected=new Set();
  let revision=0, reviewed=null, closed=false, unsubscribe;
  container.replaceChildren();
  function add(tag,text) {
    const element=document.createElement(tag);
    element.textContent=text;
    container.append(element);
    return element;
  }
  add('h2','Review draft observations');
  add('p','Destination account: '+owner);
  const choices=add('fieldset','');
  const legend=document.createElement('legend');
  legend.textContent='Choose observations';
  choices.append(legend);
  function invalidate() {
    revision++;
    reviewed=null;
    preview.textContent='';
    confirm.disabled=true;
    review.disabled=!selected.size;
  }
  for (const [index,row] of rows.entries()) {
    const label=document.createElement('label'), box=document.createElement('input');
    box.type='checkbox';
    label.append(box,document.createTextNode([row.stop_name,row.observation.space,row.observation.outcome].join(' · ')));
    choices.append(label);
    box.onchange=()=>{
      if (box.checked) selected.add(index);
      else selected.delete(index);
      invalidate();
    };
  }
  const review=add('button','Review selected observations');
  const preview=add('pre','');
  const confirm=add('button','Confirm selected observations');
  const cancel=add('button','Cancel');
  const status=add('p','');
  status.setAttribute('role','status');
  function close(message) {
    if (closed) return;
    closed=true;
    revision++;
    reviewed=null;
    selected.clear();
    unsubscribe?.();
    container.replaceChildren(status);
    status.textContent=message;
  }
  const owned=user=>Boolean(owner && user?.id===owner && user.is_anonymous!==true);
  async function verified(version) {
    let user;
    try {
      const {data,error}=await auth.getUser();
      if (!error) user=data?.user;
    } catch { /* Require a fresh verified identity. */ }
    if (closed || version!==revision) return false;
    if (owned(user)) return true;
    close('Account could not be verified. Reopen the review.');
    return false;
  }
  review.onclick=async ()=>{
    invalidate();
    const version=revision;
    review.disabled=true;
    if (!await verified(version)) return;
    reviewed={format:'setu_place_update_draft',version:1,status:'draft',
      proposals:rows.filter((_,index)=>selected.has(index))};
    preview.textContent=JSON.stringify(reviewed,null,2);
    confirm.disabled=false;
  };
  confirm.onclick=async ()=>{
    if (!reviewed || confirm.disabled) return;
    const version=revision;
    confirm.disabled=true;
    if (!await verified(version)) return;
    const envelope=reviewed;
    close('Selection confirmed in rehearsal.');
    capture(owner,envelope);
  };
  cancel.onclick=()=>close('Review cancelled.');
  invalidate();
  unsubscribe=onSessionChange(user=>{if (!owned(user)) close('Account changed. Reopen the review.');});
  if (closed) unsubscribe?.();
  return ()=>close('Review closed.');
}
