-- Chiaven: tanda 1 de mejoras. Pegar entero en SQL Editor y tocar Run.
-- Es idempotente: se puede correr más de una vez sin romper nada.

-- ── AUTOS: estado vendido y ficha más completa ─────────────────────────────
alter table public.cars add column if not exists status          text not null default 'disponible'; -- 'disponible' | 'vendido'
alter table public.cars add column if not exists sold_at         timestamptz;
alter table public.cars add column if not exists precio_venta    numeric;
alter table public.cars add column if not exists combustible     text;     -- Nafta, Diésel, GNC, Híbrido, Eléctrico
alter table public.cars add column if not exists transmision     text;     -- Manual, Automática
alter table public.cars add column if not exists descripcion     text;
alter table public.cars add column if not exists acepta_permuta  boolean not null default false;
alter table public.cars add column if not exists unico_dueno     boolean not null default false;
alter table public.cars add column if not exists vtv             text;     -- al_dia, vencida, no_corresponde
alter table public.cars add column if not exists moneda          text not null default 'ARS'; -- ARS | USD
alter table public.cars add column if not exists precio_usd      numeric;  -- precio cargado en dólares (precio queda en pesos)
create index if not exists cars_status_idx on public.cars (status);

-- ── FAVORITOS (cada agencia ve solo los suyos) ─────────────────────────────
create table if not exists public.favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, car_id)
);
alter table public.favorites enable row level security;
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites for select to authenticated using (user_id = auth.uid());
drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites for delete to authenticated using (user_id = auth.uid());

-- ── NOTIFICACIONES (cada agencia ve solo las suyas) ───────────────────────
create table if not exists public.notifications (
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  icon       text,
  text       text not null,
  sub        text,
  type       text,
  action     text,
  read       boolean not null default false,
  ts         timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists notifications_user_ts_idx on public.notifications (user_id, ts desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Avisar a PostgREST que hay columnas y tablas nuevas
notify pgrst, 'reload schema';
