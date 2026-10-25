-- Marca como verificado el mail del usuario de prueba.
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run.

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'prueba@prueba.com';

-- Comprobar el resultado
select id, email, email_confirmed_at, confirmed_at
from auth.users
where email = 'prueba@prueba.com';
