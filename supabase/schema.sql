-- Run this once in Supabase: SQL Editor > New query > paste > Run.

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.app_data (               -- one row per user: the whole app state as JSON
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  rev integer not null default 1,            -- bumped on every save; detects edits from another device
  updated_at timestamptz not null default now()
);

create table public.app_settings (           -- single row
  id integer primary key default 1 check (id = 1),
  allow_signup boolean not null default true
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- ---------- helper functions ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.has_users() returns boolean   -- lets the login screen know if this is the first run
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles);
$$;
grant execute on function public.has_users() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- permissions (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.app_data enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles: read own, admins read all" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles: edit own name" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;   -- nobody can change their own role from the browser

create policy "app_data: only the owner" on public.app_data
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "settings: everyone can read" on public.app_settings
  for select using (true);                                  -- writes only through the server function

-- ---------- keep profiles in sync with the login accounts ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'user' else 'admin' end   -- the first account is the administrator
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.sync_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_user_email();
