-- R4 metadata-only inventory, before or after a separately approved install.
-- One SELECT; no data rows, Auth identities, tokens or settings secrets are read.
-- This is evidence, not a readiness/approval decision. Check migration history
-- and the actual target/gateway separately. See docs/research-r4-release-plan.md.
with targets(name,scope) as (values
  ('setu_hubs','core'),('setu_food_notes','core'),('setu_spots','core'),
  ('setu_research_workspaces','research'),('setu_research_requests','research'),
  ('setu_research_identities','research'),('setu_research_evidence','research')
), relations as (
  select t.*,c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reltuples
  from targets t left join pg_catalog.pg_class c on c.relnamespace=to_regnamespace('public') and c.relname=t.name
), details as (
  select r.name,r.scope,r.oid is not null as present,r.relkind,
    r.relrowsecurity as rls,r.relforcerowsecurity as force_rls,
    (select count(*) from pg_catalog.pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select count(*) from pg_catalog.pg_constraint c where c.conrelid=r.oid) as constraints,
    (select count(*) from pg_catalog.pg_constraint c where c.conrelid=r.oid and not c.convalidated) as unvalidated_constraints,
    (select count(*) from pg_catalog.pg_policy p where p.polrelid=r.oid) as policies,
    coalesce((select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select jsonb_agg(coalesce(x.rolname::text,'PUBLIC') order by x.rolname) from unnest(p.polroles) q(role_oid)
        left join pg_catalog.pg_roles x on x.oid=q.role_oid),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
      from pg_catalog.pg_policy p where p.polrelid=r.oid),'[]'::jsonb) as policy_rules,
    coalesce((select jsonb_agg(jsonb_build_object('name',c.conname,'references',c.confrelid::regclass::text,
      'delete_action',c.confdeltype,'validated',c.convalidated) order by c.conname)
      from pg_catalog.pg_constraint c where c.conrelid=r.oid and c.contype='f'),'[]'::jsonb) as foreign_keys,
    (select count(*) from pg_catalog.pg_trigger t where t.tgrelid=r.oid and not t.tgisinternal) as triggers,
    -- A same-target pre/post fingerprint. Index additions and size/statistics
    -- are deliberately outside it; column/constraint/policy/trigger/ACL drift is not.
    case when r.oid is not null then encode(sha256(convert_to(jsonb_build_object(
      'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
        from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid)) order by c.conname)
        from pg_catalog.pg_constraint c where c.conrelid=r.oid),
      'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,p.polroles,
        pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
        from pg_catalog.pg_policy p where p.polrelid=r.oid),
      'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.tgname)
        from pg_catalog.pg_trigger t where t.tgrelid=r.oid and not t.tgisinternal),
      'owner',(select c.relowner::regrole::text from pg_catalog.pg_class c where c.oid=r.oid),
      'acl',(select c.relacl::text from pg_catalog.pg_class c where c.oid=r.oid)
    )::text,'UTF8')),'hex') end as shape_sha256,
    (select jsonb_object_agg(role,jsonb_build_object(
      'select',has_table_privilege(role,r.oid,'SELECT'),'insert',has_table_privilege(role,r.oid,'INSERT'),
      'update',has_table_privilege(role,r.oid,'UPDATE'),'delete',has_table_privilege(role,r.oid,'DELETE'),
      'truncate',has_table_privilege(role,r.oid,'TRUNCATE'),'references',has_table_privilege(role,r.oid,'REFERENCES'),
      'trigger',has_table_privilege(role,r.oid,'TRIGGER'))) from (values('anon'),('authenticated')) v(role)) as effective_grants,
    case when r.scope='core' and r.oid is not null then pg_total_relation_size(r.oid) end as relation_bytes,
    case when r.scope='core' then r.reltuples::bigint end as estimated_rows
  from relations r
), functions as (
  select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,p.prosecdef as security_definer,p.provolatile as volatility,
    p.proconfig as settings,
    encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') as definition_sha256,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
  from pg_catalog.pg_proc p where p.pronamespace=to_regnamespace('public') and p.proname like 'setu\_research\_%' escape '\'
), indexes as (
  select c.relname as name,t.relname as table_name,i.indisvalid as valid,i.indisready as ready,i.indisunique as unique,
    pg_get_indexdef(c.oid) as definition
  from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
    join pg_catalog.pg_class t on t.oid=i.indrelid
  where c.relnamespace=to_regnamespace('public') and c.relname like 'setu\_research\_%' escape '\'
)
select jsonb_build_object(
  'probe_version','r4-catalog-1','observed_at',clock_timestamp(),'database',current_database(),
  'postgres_version',current_setting('server_version'),'metadata_only',true,
  'prerequisites',jsonb_build_object('utf8',current_setting('server_encoding')='UTF8',
    'nfkc',normalize('Ａ',NFKC)='A','sha256',length(sha256(''::bytea))=32,
    'auth_users',to_regclass('auth.users') is not null,'auth_uid',to_regprocedure('auth.uid()') is not null,
    'auth_jwt',to_regprocedure('auth.jwt()') is not null),
  'browser_roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls,'inherit',rolinherit) order by rolname)
    from pg_catalog.pg_roles where rolname in ('anon','authenticated')),
  'core_tables',(select jsonb_agg(to_jsonb(d) order by name) from details d where scope='core'),
  'core_revision_function_sha256',(select encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
    from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.setu_touch()')),
  'research_tables',(select jsonb_agg(to_jsonb(d) order by name) from details d where scope='research'),
  'research_functions',coalesce((select jsonb_agg(to_jsonb(f) order by name,arguments) from functions f),'[]'::jsonb),
  'research_indexes',coalesce((select jsonb_agg(to_jsonb(i) order by name) from indexes i),'[]'::jsonb),
  'research_relations',coalesce((select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind) order by c.relname)
    from pg_catalog.pg_class c where c.relnamespace=to_regnamespace('public') and c.relname like 'setu\_research\_%' escape '\'),'[]'::jsonb),
  'migration_history_checked',false,'gateway_verified',false,'recovery_verified',false,'activation_authorized',false
) as research_catalog;
