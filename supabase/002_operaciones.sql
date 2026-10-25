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
