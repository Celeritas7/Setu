// Rehearsal of one immutable source occurrence under READ COMMITTED.
export async function submitTripDraft(db,trip,details,stopName='Library',placeRef=null) {
  const values=[trip,JSON.stringify(details),stopName,placeRef===null?null:JSON.stringify(placeRef)];
  const result=await db.query(`insert into public.setu_place_update_drafts
    (trip_id,stop_index,observation_index,stop_name,observation,place_ref) values ($1,0,0,$3,$2::jsonb,$4::jsonb)
    on conflict (owner_id,trip_id,stop_index,observation_index) do nothing returning trip_id`,
    values);
  if (result.rows.length) return 'inserted';
  const {rows}=await db.query(`select observation=$2::jsonb and stop_name=$3 and (place_ref is not distinct from $4::jsonb) as same
    from public.setu_place_update_drafts where trip_id=$1 and stop_index=0 and observation_index=0`,values);
  return rows[0].same?'identical':'conflict';
}
