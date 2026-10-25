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
