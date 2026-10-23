-- Ejecutar en Supabase > SQL Editor
create table empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null, sector text, ciudad text, web text, notas text,
  created_at timestamptz default now()
);
create table contactos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  empresa_id uuid not null references empresas on delete cascade,
  nombre text not null, email text not null, cargo text, telefono text,
  created_at timestamptz default now()
);
create table plantillas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null, asunto text not null, cuerpo text not null,
  created_at timestamptz default now()
);
create table campanas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plantilla_id uuid references plantillas on delete set null,
  total int not null default 0, enviados int not null default 0,
  estado text not null default 'en_curso',
  created_at timestamptz default now()
);
create table interacciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  empresa_id uuid references empresas on delete cascade,
  contacto_id uuid references contactos on delete set null,
  campana_id uuid references campanas on delete set null,
  tipo text not null check (tipo in ('enviado','recibido','nota')),
  asunto text, cuerpo text,
  gmail_thread_id text, gmail_message_id text unique,
  created_at timestamptz default now()
);
create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mensaje text not null, empresa_id uuid references empresas on delete cascade,
  leida boolean not null default false,
  created_at timestamptz default now()
);
-- Solo accesible desde el backend (service role): sin políticas
create table gmail_cuentas (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null, refresh_token text not null,
  last_sync timestamptz not null default now()
);

alter table gmail_cuentas enable row level security;
do $$ declare t text; begin
  foreach t in array array['empresas','contactos','plantillas','campanas','interacciones','notificaciones'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "propio" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter publication supabase_realtime add table notificaciones;
