-- Chiaven: base de datos completa para un proyecto NUEVO de Supabase.
-- Pegar entero en SQL Editor y tocar Run. Une 000_base, 001 y 002.

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

-- Chiaven: mueve perfil, suscripción y contactos desbloqueados de localStorage a Supabase.
-- Ejecutar una vez en Supabase → SQL Editor. Es idempotente.

-- ── PERFILES ──────────────────────────────────────────────────────────────
-- Cada agencia lee y edita solo su propio perfil. Los datos de contacto de
-- otra agencia se obtienen con get_car_contact(), que exige el desbloqueo.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  cuit        text,
  direccion   text,
  telefono    text,
  ig          text,
  web         text,
  localidad   text,
  photo       text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── SUSCRIPCIONES ─────────────────────────────────────────────────────────
-- La agencia solo puede LEER su suscripción. No hay políticas de escritura:
-- se activa desde el panel de Supabase o, más adelante, desde el webhook de
-- MercadoPago con la service_role key.
create table if not exists public.subscriptions (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  plan          text not null default 'free' check (plan in ('free','trial','monthly','annual')),
  expiry        timestamptz,
  activated_at  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Pedidos de alta de plan (pago demo / transferencia) que un admin confirma.
create table if not exists public.subscription_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan        text not null check (plan in ('monthly','annual')),
  pay_method  text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);
alter table public.subscription_requests enable row level security;

drop policy if exists "sub_requests_select_own" on public.subscription_requests;
create policy "sub_requests_select_own" on public.subscription_requests
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "sub_requests_insert_own" on public.subscription_requests;
create policy "sub_requests_insert_own" on public.subscription_requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- Aprobar un pedido (correr en SQL Editor):
--   select public.approve_subscription_request(<id>);
create or replace function public.approve_subscription_request(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r public.subscription_requests;
begin
  select * into r from public.subscription_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Pedido % inexistente o ya procesado', p_id; end if;
  insert into public.subscriptions (user_id, plan, expiry, activated_at, updated_at)
  values (r.user_id, r.plan,
          now() + case r.plan when 'annual' then interval '365 days' else interval '30 days' end,
          now(), now())
  on conflict (user_id) do update
    set plan = excluded.plan,
        expiry = greatest(coalesce(public.subscriptions.expiry, now()), now())
                 + case r.plan when 'annual' then interval '365 days' else interval '30 days' end,
        activated_at = now(), updated_at = now();
  update public.subscription_requests set status = 'approved' where id = p_id;
end $$;
revoke all on function public.approve_subscription_request(bigint) from public, anon, authenticated;

-- ── CONTACTOS DESBLOQUEADOS ───────────────────────────────────────────────
create table if not exists public.contact_unlocks (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id      text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, car_id)
);
alter table public.contact_unlocks enable row level security;

drop policy if exists "unlocks_select_own" on public.contact_unlocks;
create policy "unlocks_select_own" on public.contact_unlocks
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "unlocks_insert_own" on public.contact_unlocks;
create policy "unlocks_insert_own" on public.contact_unlocks
  for insert to authenticated with check (user_id = auth.uid());

-- Contacto de la agencia dueña de un auto, solo si quien pregunta lo desbloqueó.
create or replace function public.get_car_contact(p_car_id text)
returns table (nombre text, telefono text, ig text, web text, localidad text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.telefono, p.ig, p.web, p.localidad
  from public.cars c
  join public.profiles p on p.id::text = c.owner_id::text
  where c.id::text = p_car_id
    and exists (select 1 from public.contact_unlocks u
                where u.user_id = auth.uid() and u.car_id = p_car_id);
$$;
revoke all on function public.get_car_contact(text) from public, anon;
grant execute on function public.get_car_contact(text) to authenticated;

-- Chiaven: las operaciones (negociación, reserva, checklist) pasan de localStorage
-- y de los mensajes del chat a su propia tabla. Ejecutar después de 001. Es idempotente.

create table if not exists public.operations (
  id          text primary key,
  car_id      text not null,
  buyer_id    uuid not null references auth.users(id) on delete cascade,
  seller_id   uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'negociacion',
  data        jsonb not null,           -- la operación completa tal como la usa la app
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists operations_buyer_idx  on public.operations (buyer_id);
create index if not exists operations_seller_idx on public.operations (seller_id);
create index if not exists operations_car_idx    on public.operations (car_id);
alter table public.operations enable row level security;

-- Solo comprador y vendedor ven y modifican la operación.
drop policy if exists "operations_select_parties" on public.operations;
create policy "operations_select_parties" on public.operations
  for select to authenticated using (auth.uid() in (buyer_id, seller_id));

-- La crea el comprador, y el vendedor tiene que ser el dueño real del auto.
drop policy if exists "operations_insert_buyer" on public.operations;
create policy "operations_insert_buyer" on public.operations
  for insert to authenticated with check (
    buyer_id = auth.uid()
    and buyer_id <> seller_id
    and exists (select 1 from public.cars c
                where c.id::text = car_id and c.owner_id::text = seller_id::text)
  );

drop policy if exists "operations_update_parties" on public.operations;
create policy "operations_update_parties" on public.operations
  for update to authenticated
  using (auth.uid() in (buyer_id, seller_id))
  with check (auth.uid() in (buyer_id, seller_id));

-- Comprador, vendedor y auto no se pueden cambiar; updated_at lo pone la base.
create or replace function public.operations_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id or new.car_id <> old.car_id then
      raise exception 'No se puede cambiar comprador, vendedor ni vehículo de una operación';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists operations_guard on public.operations;
create trigger operations_guard before insert or update on public.operations
  for each row execute function public.operations_guard();

-- ── Desbloqueo de contacto: ahora exige un trato real ─────────────────────
-- Se puede desbloquear si la agencia tiene Premium vigente, o si es la
-- compradora de una operación de ese auto con precio acordado o más avanzada.
drop policy if exists "unlocks_insert_own" on public.contact_unlocks;
create policy "unlocks_insert_own" on public.contact_unlocks
  for insert to authenticated with check (
    user_id = auth.uid()
    and (
      exists (select 1 from public.subscriptions s
              where s.user_id = auth.uid() and s.plan in ('monthly','annual') and s.expiry > now())
      or exists (select 1 from public.operations o
                 where o.car_id = contact_unlocks.car_id and o.buyer_id = auth.uid()
                   and o.status in ('precio_acordado','reserva_pendiente','reserva_pagada','completada'))
    )
  );
