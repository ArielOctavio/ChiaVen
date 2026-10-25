-- Chiaven: tablas base para un proyecto de Supabase NUEVO (autos, pedidos, mensajes y fotos).
-- En un proyecto que ya tiene estas tablas no hace falta correrlo. Es idempotente.

-- ── AUTOS ─────────────────────────────────────────────────────────────────
create table if not exists public.cars (
  id                    text primary key default gen_random_uuid()::text,
  owner_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email           text,
  marca                 text not null,
  modelo                text not null,
  version               text,
  anio                  int,
  km                    int,
  color                 text,
  precio                numeric,
  precio_info           text,
  condicion             text not null default 'usado' check (condicion in ('usado','nuevo')),
  localidad             text,
  provincia             text,
  image_url             text,
  images                jsonb,
  destacado             boolean not null default false,
  es_oportunidad        boolean not null default false,
  es_super_oportunidad  boolean not null default false,
  created_at            timestamptz not null default now()
);
create index if not exists cars_owner_idx on public.cars (owner_id);
alter table public.cars enable row level security;

-- Red privada: cualquier agencia con sesión ve los autos; solo el dueño los edita.
drop policy if exists "cars_select_auth" on public.cars;
create policy "cars_select_auth" on public.cars for select to authenticated using (true);
drop policy if exists "cars_insert_own" on public.cars;
create policy "cars_insert_own" on public.cars for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "cars_update_own" on public.cars;
create policy "cars_update_own" on public.cars for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "cars_delete_own" on public.cars;
create policy "cars_delete_own" on public.cars for delete to authenticated using (owner_id = auth.uid());

-- ── PEDIDOS ("Tengo un cliente") ──────────────────────────────────────────
create table if not exists public.requests (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email   text,
  texto        text not null,
  marca        text,
  modelo       text,
  anio         int,
  km_max       int,
  presupuesto  numeric,
  condicion    text,
  created_at   timestamptz not null default now()
);
create index if not exists requests_user_idx on public.requests (user_id);
alter table public.requests enable row level security;

drop policy if exists "requests_select_auth" on public.requests;
create policy "requests_select_auth" on public.requests for select to authenticated using (true);
drop policy if exists "requests_insert_own" on public.requests;
create policy "requests_insert_own" on public.requests for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "requests_update_own" on public.requests;
create policy "requests_update_own" on public.requests for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "requests_delete_own" on public.requests;
create policy "requests_delete_own" on public.requests for delete to authenticated using (user_id = auth.uid());

-- ── MENSAJES (chat y avisos de negociación) ───────────────────────────────
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  from_user   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  car_id      text,
  message     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists messages_to_idx  on public.messages (to_user, created_at desc);
create index if not exists messages_from_idx on public.messages (from_user, created_at desc);
create index if not exists messages_car_idx on public.messages (car_id);
alter table public.messages enable row level security;

-- Cada agencia ve solo los mensajes que mandó o recibió.
drop policy if exists "messages_select_parties" on public.messages;
create policy "messages_select_parties" on public.messages for select to authenticated using (auth.uid() in (from_user, to_user));
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages for insert to authenticated with check (from_user = auth.uid());
-- Al eliminar un auto, su dueño borra los chats de ese auto.
drop policy if exists "messages_delete_parties_or_owner" on public.messages;
create policy "messages_delete_parties_or_owner" on public.messages for delete to authenticated using (
  auth.uid() in (from_user, to_user)
  or exists (select 1 from public.cars c where c.id = messages.car_id and c.owner_id = auth.uid())
);

-- ── FOTOS (Storage) ───────────────────────────────────────────────────────
-- Bucket público para fotos de autos y de usados en parte de pago.
insert into storage.buckets (id, name, public)
values ('car-images', 'car-images', true)
on conflict (id) do update set public = true;

drop policy if exists "car_images_insert_auth" on storage.objects;
create policy "car_images_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'car-images');
-- La subida con reemplazo (x-upsert) necesita poder leer el objeto
drop policy if exists "car_images_select_auth" on storage.objects;
create policy "car_images_select_auth" on storage.objects for select to authenticated using (bucket_id = 'car-images');
drop policy if exists "car_images_update_auth" on storage.objects;
create policy "car_images_update_auth" on storage.objects for update to authenticated using (bucket_id = 'car-images' and owner = auth.uid());
drop policy if exists "car_images_delete_own" on storage.objects;
create policy "car_images_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'car-images' and owner = auth.uid());
