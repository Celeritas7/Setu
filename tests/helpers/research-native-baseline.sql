-- Synthetic rehearsal only; never apply this file to a hosted database.
-- Core column/default/check/trigger shapes inspected read-only on 2026-11-25.
-- Only generated test UUIDs are inserted. Auth SQL helpers match the inspected
-- legacy + JSON claim lookup, not a full Auth service. contacts is an empty FK stub.
create role authenticated nologin nosuperuser nobypassrls;
create role anon nologin nosuperuser nobypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim',true),''),
    nullif(current_setting('request.jwt.claims',true),''))::jsonb
$$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
create table public.contacts(id uuid primary key);
-- Reproduce legacy default grants, then verify R4 explicitly revokes them.
alter default privileges in schema public grant all on tables to anon,authenticated;

create table public."setu_hubs" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null default auth.uid(),
  "name" text not null,
  "geo_query" text,
  "lat" double precision,
  "lng" double precision,
  "geo_source" text,
  "radius_m" integer not null default 700,
  "notes" text,
  "added_by" text not null default 'me'::text,
  "accepted" boolean not null default true,
  "rev" integer not null default 1,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  "deleted_at" timestamp with time zone,
  "themes" text[] not null default '{}'::text[],
  "search_requested_at" timestamp with time zone,
  "searched_at" timestamp with time zone,
  constraint "setu_hubs_added_by_check" CHECK ((added_by = ANY (ARRAY['me'::text, 'claude'::text]))),
  constraint "setu_hubs_geo_source_check" CHECK ((geo_source = ANY (ARRAY['nominatim'::text, 'owntracks'::text, 'manual'::text, 'link'::text, 'places'::text]))),
  constraint "setu_hubs_pkey" PRIMARY KEY (id)
);

create table public."setu_food_notes" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null default auth.uid(),
  "shop_id" bigint,
  "status" text not null default 'try'::text,
  "dish" text,
  "snooze_week" integer,
  "rating" integer,
  "review" text,
  "go_back" boolean,
  "reviewed_on" date,
  "visit_since" timestamp with time zone,
  "visit_device" text,
  "added_by" text not null default 'me'::text,
  "accepted" boolean not null default true,
  "rev" integer not null default 1,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  "deleted_at" timestamp with time zone,
  "area" text,
  "name" text,
  "address" text,
  "geo_query" text,
  "lat" double precision,
  "lng" double precision,
  "geo_source" text,
  "hub_id" uuid,
  "themes" text[] not null default '{}'::text[],
  "source_url" text,
  "verified" text,
  "hours" jsonb,
  "hours_seen" date,
  "sick_effect" text,
  "sick_effect_on" date,
  "place_ref" text,
  "intro" text,
  "spend_yen" integer,
  "spend_seen" date,
  "suggested_by" text,
  "seating_type" text,
  "min_order" text,
  "min_order_yen" integer,
  "stay_limit_min" integer,
  "outlets" boolean,
  "wifi" boolean,
  "quiet" smallint,
  "smoke_free" text,
  "setting" text,
  "feel" text,
  "confidence" text,
  "last_checked" date,
  constraint "setu_food_notes_added_by_check" CHECK ((added_by = ANY (ARRAY['me'::text, 'claude'::text]))),
  constraint "setu_food_notes_confidence_check" CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'reviews'::text, 'unverified'::text]))),
  constraint "setu_food_notes_geo_source_check" CHECK ((geo_source = ANY (ARRAY['nominatim'::text, 'owntracks'::text, 'manual'::text, 'link'::text, 'places'::text]))),
  constraint "setu_food_notes_hub_id_fkey" FOREIGN KEY (hub_id) REFERENCES setu_hubs(id),
  constraint "setu_food_notes_min_order_yen_check" CHECK ((min_order_yen >= 0)),
  constraint "setu_food_notes_named" CHECK (((name IS NOT NULL) OR (shop_id IS NOT NULL))),
  constraint "setu_food_notes_pkey" PRIMARY KEY (id),
  constraint "setu_food_notes_quiet_check" CHECK (((quiet >= 1) AND (quiet <= 3))),
  constraint "setu_food_notes_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  constraint "setu_food_notes_seating_type_check" CHECK ((seating_type = ANY (ARRAY['free_seating'::text, 'buy_to_sit'::text, 'own_food_ok'::text, 'unknown'::text]))),
  constraint "setu_food_notes_setting_check" CHECK ((setting = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'both'::text]))),
  constraint "setu_food_notes_sick_effect_check" CHECK ((sick_effect = ANY (ARRAY['none'::text, 'some'::text, 'good'::text]))),
  constraint "setu_food_notes_smoke_free_check" CHECK ((smoke_free = ANY (ARRAY['yes'::text, 'no'::text, 'partly'::text]))),
  constraint "setu_food_notes_status_check" CHECK ((status = ANY (ARRAY['try'::text, 'done'::text]))),
  constraint "setu_food_notes_stay_limit_min_check" CHECK ((stay_limit_min >= 0)),
  constraint "setu_food_notes_user_id_shop_id_key" UNIQUE (user_id, shop_id)
);

create table public."setu_spots" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null default auth.uid(),
  "hub_id" uuid,
  "kind" text not null default 'shop'::text,
  "name" text not null,
  "address" text,
  "geo_query" text,
  "lat" double precision,
  "lng" double precision,
  "geo_source" text,
  "why" text,
  "status" text not null default 'try'::text,
  "suggested_by" text,
  "suggested_contact" uuid,
  "source_url" text,
  "verified" text,
  "added_by" text not null default 'me'::text,
  "accepted" boolean not null default true,
  "rev" integer not null default 1,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  "deleted_at" timestamp with time zone,
  "themes" text[] not null default '{}'::text[],
  "place_ref" text,
  "hours" jsonb,
  "hours_seen" date,
  "intro" text,
  "spend_yen" integer,
  "spend_seen" date,
  "seating_type" text,
  "min_order" text,
  "min_order_yen" integer,
  "stay_limit_min" integer,
  "outlets" boolean,
  "wifi" boolean,
  "quiet" smallint,
  "smoke_free" text,
  "setting" text,
  "feel" text,
  "confidence" text,
  "last_checked" date,
  constraint "setu_spots_added_by_check" CHECK ((added_by = ANY (ARRAY['me'::text, 'claude'::text]))),
  constraint "setu_spots_confidence_check" CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'reviews'::text, 'unverified'::text]))),
  constraint "setu_spots_geo_source_check" CHECK ((geo_source = ANY (ARRAY['nominatim'::text, 'owntracks'::text, 'manual'::text, 'link'::text, 'places'::text]))),
  constraint "setu_spots_hub_id_fkey" FOREIGN KEY (hub_id) REFERENCES setu_hubs(id),
  constraint "setu_spots_kind_check" CHECK ((kind = ANY (ARRAY['shop'::text, 'see'::text, 'other'::text]))),
  constraint "setu_spots_min_order_yen_check" CHECK ((min_order_yen >= 0)),
  constraint "setu_spots_pkey" PRIMARY KEY (id),
  constraint "setu_spots_quiet_check" CHECK (((quiet >= 1) AND (quiet <= 3))),
  constraint "setu_spots_seating_type_check" CHECK ((seating_type = ANY (ARRAY['free_seating'::text, 'buy_to_sit'::text, 'own_food_ok'::text, 'unknown'::text]))),
  constraint "setu_spots_setting_check" CHECK ((setting = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'both'::text]))),
  constraint "setu_spots_smoke_free_check" CHECK ((smoke_free = ANY (ARRAY['yes'::text, 'no'::text, 'partly'::text]))),
  constraint "setu_spots_status_check" CHECK ((status = ANY (ARRAY['try'::text, 'done'::text, 'skip'::text]))),
  constraint "setu_spots_stay_limit_min_check" CHECK ((stay_limit_min >= 0)),
  constraint "setu_spots_suggested_contact_fkey" FOREIGN KEY (suggested_contact) REFERENCES contacts(id)
);

CREATE OR REPLACE FUNCTION public.setu_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.rev is distinct from old.rev + 1 then
      raise exception 'SETU_STALE: row % is at rev %, you sent %', old.id, old.rev, new.rev - 1 using errcode = '40001';
    end if;
  else
    new.rev := 1;
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.user_id := old.user_id; else new.user_id := auth.uid(); end if;
  return new;
end $function$
;
create trigger setu_hubs_touch before insert or update on public.setu_hubs
  for each row execute function public.setu_touch();
alter table public.setu_hubs enable row level security;
create policy setu_hubs_own on public.setu_hubs to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
create trigger setu_food_notes_touch before insert or update on public.setu_food_notes
  for each row execute function public.setu_touch();
alter table public.setu_food_notes enable row level security;
create policy setu_food_notes_own on public.setu_food_notes to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
create trigger setu_spots_touch before insert or update on public.setu_spots
  for each row execute function public.setu_touch();
alter table public.setu_spots enable row level security;
create policy setu_spots_own on public.setu_spots to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
