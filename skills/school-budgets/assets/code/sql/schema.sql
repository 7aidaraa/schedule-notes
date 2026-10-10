-- Tables the budgets section needs (Supabase / Postgres). RLS on, no policies: only the edge function (service role) reads and writes.
create table if not exists teachers (
  name text primary key,            -- full name, the key everywhere
  department text not null,
  is_head boolean not null default false,
  nick text,                        -- short name as the timetable sheet writes it
  uid text                          -- the timetable sheet's user id (optional)
);
create table if not exists budgets (
  department text primary key,
  data jsonb not null default '{}'::jsonb,   -- see references/data-format.md «budgets[].data»
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists settings (key text primary key, value text not null);
-- Passwords: SHA-256 of the word, never the word in a file.
--   insert into settings values ('admin_pass_sha256', encode(sha256(convert_to('…','UTF8')),'hex'));
--   insert into settings values ('head_pass_sha256',  encode(sha256(convert_to('…','UTF8')),'hex'));
--   insert into settings values ('teacher_pass', '…');   -- teachers: requests only, no budget
alter table teachers enable row level security;
alter table budgets enable row level security;
alter table settings enable row level security;
