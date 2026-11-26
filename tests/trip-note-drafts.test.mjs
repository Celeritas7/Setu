import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const {open,KEY}=createRequire(import.meta.url)('../js/trip-note-drafts.js');
const blank={transport:'',recovery:'',future:''};
function tabStorage(initial=[]) {
  const map=new Map(initial);
  return {map,fail:false,getItem:key=>map.get(key)??null,
    setItem(key,value){if(this.fail) throw Error('Quota exceeded');map.set(key,value);},
    removeItem(key){if(this.fail) throw Error('Quota exceeded');map.delete(key);}};
}
test('all unfinished notes survive a reload, keyed to the original trip',()=>{
  const storage=tabStorage(),drafts=open(storage);
  const notes={transport:'Last bus cancelled',recovery:'  Station shelter\n',future:'Check return first'};
  assert.equal(drafts.set('trip-a',notes),true);
  const reopened=open(storage);
  assert.deepEqual(reopened.get('trip-a'),notes);
  assert.deepEqual(reopened.get('trip-b'),blank);
  assert.deepEqual(reopened.entries(),[{trip_id:'trip-a',notes}]);
});
test('other tabs keep independent drafts; removing one trip cannot remove another',()=>{
  const a=tabStorage(),b=tabStorage();
  const first=open(a),second=open(b);
  first.set('trip-a',{...blank,transport:'A'});
  first.set('trip-b',{...blank,future:'Later'});
  second.set('trip-a',{...blank,transport:'B'});
  second.remove('trip-a');
  assert.equal(open(a).get('trip-a').transport,'A');
  first.remove('trip-a');
  assert.deepEqual(open(a).get('trip-a'),blank);
  assert.equal(open(a).get('trip-b').future,'Later');
});
test('explicitly clearing all fields removes only that draft',()=>{
  const storage=tabStorage(),drafts=open(storage);
  drafts.set('trip-a',{...blank,transport:'A'});
  drafts.set('trip-b',{...blank,recovery:'B'});
  drafts.set('trip-a',blank);
  assert.deepEqual(open(storage).entries(),[{trip_id:'trip-b',notes:{...blank,recovery:'B'}}]);
});
test('storage failure retains text in memory and does not report persistence',()=>{
  const storage=tabStorage(),drafts=open(storage);
  storage.fail=true;
  assert.equal(drafts.set('trip-a',{...blank,transport:'Keep me'}),false);
  assert.equal(drafts.saved(),false);
  assert.equal(drafts.get('trip-a').transport,'Keep me');
  storage.fail=false;
  assert.equal(drafts.set('trip-a',drafts.get('trip-a')),true);
  assert.equal(open(storage).get('trip-a').transport,'Keep me');
});
test('unreadable saved drafts are not silently overwritten',()=>{
  const storage=tabStorage([[KEY,'invalid JSON']]),drafts=open(storage);
  assert.equal(drafts.saved(),false);
  assert.equal(drafts.set('trip-a',{...blank,transport:'New text'}),false);
  assert.equal(drafts.get('trip-a').transport,'New text');
  assert.equal(storage.getItem(KEY),'invalid JSON');
});
