-- Publicaciones ficticias para probar el catálogo.
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run.
-- Los autos se reparten entre todos los usuarios registrados, así cada agencia ve en
-- "Vehículos disponibles" los autos de las otras (los propios no aparecen ahí, sino en "Mis autos").
-- Todos tienen id 'demo-...' para poder borrarlos (ver el final).

with usuarios as (
  select id, email, row_number() over (order by created_at) - 1 as n, count(*) over () as total
  from auth.users
),
demo (i, marca, modelo, version, anio, km, color, precio, precio_info, condicion, localidad, provincia, destacado) as (
  values
    (1,  'Toyota',     'Corolla',         '2.0 XEI CVT',          2021,  38000, 'Blanco',      26500000, 'Precio lista $28.000.000', 'usado', 'Rosario',                 'Santa Fe',                        true),
    (2,  'Toyota',     'Hilux',           '2.8 SRX 4x4 AT',       2020,  85000, 'Gris plata',  39800000, 'Precio info $41.500.000',  'usado', 'Córdoba',                 'Córdoba',                         true),
    (3,  'Volkswagen', 'Amarok',          'V6 Highline',          2019,  98000, 'Negro',       35500000, 'Precio info $38.900.000',  'usado', 'Neuquén',                 'Neuquén',                         false),
    (4,  'Volkswagen', 'Gol Trend',       '1.6 Trendline',        2017,  92000, 'Rojo',         9800000, 'Precio info $10.200.000',  'usado', 'La Plata',                'Buenos Aires',                    false),
    (5,  'Volkswagen', 'Taos',            '1.4 TSI Highline',     2026,      0, 'Azul',        44900000, 'Precio lista $46.000.000', 'nuevo', 'Palermo',                 'Ciudad Autónoma de Buenos Aires', true),
    (6,  'Fiat',       'Cronos',          '1.3 Drive',            2023,  21000, 'Gris',        17900000, 'Precio info $18.500.000',  'usado', 'Villa María',             'Córdoba',                         false),
    (7,  'Fiat',       'Toro',            '2.0 Volcano 4x4',      2022,  45000, 'Blanco',      31200000, 'Precio info $34.000.000',  'usado', 'Rafaela',                 'Santa Fe',                        false),
    (8,  'Fiat',       'Pulse',           '1.0 Turbo Impetus',    2026,      0, 'Rojo',        29900000, 'Precio lista $31.500.000', 'nuevo', 'Mendoza',                 'Mendoza',                         false),
    (9,  'Ford',       'Ranger',          '3.2 Limited 4x4',      2021,  67000, 'Gris oscuro', 38900000, 'Precio info $40.000.000',  'usado', 'Bahía Blanca',            'Buenos Aires',                    true),
    (10, 'Ford',       'EcoSport',        '1.5 Freestyle',        2019,  74000, 'Naranja',     15500000, 'Precio info $15.000.000',  'usado', 'Mar del Plata',           'Buenos Aires',                    false),
    (11, 'Ford',       'Territory',       '1.8 Titanium',         2025,   9000, 'Blanco',      37500000, 'Precio lista $40.800.000', 'usado', 'Pilar',                   'Buenos Aires',                    false),
    (12, 'Chevrolet',  'Cruze',           '1.4 LTZ AT',           2020,  58000, 'Negro',       21900000, 'Precio info $22.500.000',  'usado', 'Paraná',                  'Entre Ríos',                      false),
    (13, 'Chevrolet',  'Onix',            '1.0 Turbo Premier',    2024,  15000, 'Rojo',        20500000, 'Precio info $21.000.000',  'usado', 'San Miguel de Tucumán',   'Tucumán',                         false),
    (14, 'Chevrolet',  'S10',             '2.8 High Country 4x4', 2022,  52000, 'Gris',        41500000, 'Precio info $43.000.000',  'usado', 'Salta',                   'Salta',                           false),
    (15, 'Renault',    'Sandero',         '1.6 Life',             2018,  88000, 'Blanco',      10500000, 'Precio info $10.900.000',  'usado', 'Río Cuarto',              'Córdoba',                         false),
    (16, 'Renault',    'Duster',          '1.6 Intens 4x2',       2022,  41000, 'Gris',        22800000, 'Precio info $23.500.000',  'usado', 'Godoy Cruz',              'Mendoza',                         false),
    (17, 'Renault',    'Kardian',         '1.0 Evolution',        2026,      0, 'Azul',        27900000, 'Precio lista $28.500.000', 'nuevo', 'Concordia',               'Entre Ríos',                      false),
    (18, 'Peugeot',    '208',             '1.6 Allure AT',        2023,  26000, 'Gris',        21500000, 'Precio info $23.000.000',  'usado', 'Rosario',                 'Santa Fe',                        true),
    (19, 'Peugeot',    '2008',            '1.0 T200 GT',          2025,   7000, 'Negro',       33900000, 'Precio lista $34.500.000', 'usado', 'San Carlos de Bariloche', 'Río Negro',                       false),
    (20, 'Jeep',       'Renegade',        '1.8 Sport',            2019,  71000, 'Verde',       19900000, 'Precio info $20.500.000',  'usado', 'Córdoba',                 'Córdoba',                         false),
    (21, 'Jeep',       'Compass',         '1.3 T270 Longitude',   2023,  29000, 'Blanco',      36500000, 'Precio info $39.000.000',  'usado', 'Belgrano',                'Ciudad Autónoma de Buenos Aires', false),
    (22, 'Honda',      'HR-V',            '1.5 EXL CVT',          2024,  18000, 'Gris plata',  33500000, 'Precio info $34.000.000',  'usado', 'Mendoza',                 'Mendoza',                         false),
    (23, 'Nissan',     'Frontier',        '2.3 PRO-4X 4x4',       2021,  76000, 'Rojo',        34900000, 'Precio info $35.500.000',  'usado', 'Neuquén',                 'Neuquén',                         false),
    (24, 'Citroën',    'C4 Cactus',       '1.6 Feel Pack',        2022,  33000, 'Blanco',      19800000, 'Precio info $21.900.000',  'usado', 'La Plata',                'Buenos Aires',                    false)
)
insert into public.cars (id, owner_id, owner_email, marca, modelo, version, anio, km, color, precio, precio_info,
                         condicion, localidad, provincia, destacado, es_oportunidad, es_super_oportunidad, created_at)
select 'demo-' || d.i, u.id, u.email, d.marca, d.modelo, d.version, d.anio, d.km, d.color, d.precio, d.precio_info,
       d.condicion, d.localidad, d.provincia, d.destacado,
       -- Misma regla que la app: más barato que el precio info = oportunidad; más de 5% = súper oportunidad
       nullif(regexp_replace(d.precio_info, '\D', '', 'g'), '')::numeric > d.precio,
       (nullif(regexp_replace(d.precio_info, '\D', '', 'g'), '')::numeric - d.precio)
         / nullif(regexp_replace(d.precio_info, '\D', '', 'g'), '')::numeric > 0.05,
       now() - (d.i || ' hours')::interval
from demo d
join usuarios u on u.n = d.i % u.total
on conflict (id) do nothing;

-- Ver cuántos quedaron por usuario
select owner_email, count(*) as autos_demo
from public.cars
where id like 'demo-%'
group by owner_email;

-- Para borrar todas las publicaciones ficticias:
-- delete from public.cars where id like 'demo-%';
