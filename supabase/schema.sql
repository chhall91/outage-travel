-- Outage Travel forum — Supabase schema + row-level security.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Auth: anonymous sign-ins (Authentication → Sign In / Providers → "Allow anonymous sign-ins")
-- and/or email magic links. Nobody's real name is required; posts show a display name.

create extension if not exists pgcrypto;

-- ---------- profiles: one display name per signed-in user ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 30),
  created_at timestamptz not null default now()
);

-- ---------- threads ----------
create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board ~ '^[a-z0-9-]{2,60}$'),          -- 'overall' or a plant id
  category text not null check (category in ('housing','food','rides','work','general')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(body) <= 4000),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  last_activity_at timestamptz not null default now(),
  reply_count int not null default 0,
  report_count int not null default 0,
  hidden boolean not null default false,
  deleted boolean not null default false
);
create index if not exists forum_threads_board_idx on public.forum_threads (board, last_activity_at desc);

-- ---------- replies ----------
create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  report_count int not null default 0,
  hidden boolean not null default false,
  deleted boolean not null default false
);
create index if not exists forum_replies_thread_idx on public.forum_replies (thread_id, created_at);

-- ---------- reports: one per user per post ----------
create table if not exists public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('thread','reply')),
  target_id uuid not null,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

-- ---------- triggers (security definer so users can't set counters themselves) ----------
-- Stamp author_name from the poster's profile (can't be spoofed). Posting requires a profile.
create or replace function public.forum_stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select display_name into n from public.profiles where id = auth.uid();
  if n is null then raise exception 'Set a display name before posting'; end if;
  new.author_id := auth.uid();
  new.author_name := n;
  return new;
end $$;

drop trigger if exists t_stamp_thread on public.forum_threads;
create trigger t_stamp_thread before insert on public.forum_threads for each row execute function public.forum_stamp_author();
drop trigger if exists t_stamp_reply on public.forum_replies;
create trigger t_stamp_reply before insert on public.forum_replies for each row execute function public.forum_stamp_author();

-- Mark edits / soft deletes.
create or replace function public.forum_on_edit() returns trigger
language plpgsql as $$
begin
  if new.deleted and not old.deleted then new.body := ''; end if;
  if new.body is distinct from old.body or (tg_table_name = 'forum_threads' and new.title is distinct from old.title) then
    new.edited_at := now();
  end if;
  return new;
end $$;
drop trigger if exists t_edit_thread on public.forum_threads;
create trigger t_edit_thread before update on public.forum_threads for each row execute function public.forum_on_edit();
drop trigger if exists t_edit_reply on public.forum_replies;
create trigger t_edit_reply before update on public.forum_replies for each row execute function public.forum_on_edit();

-- Keep reply_count and last_activity_at current.
create or replace function public.forum_reply_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid uuid := coalesce(new.thread_id, old.thread_id);
begin
  update public.forum_threads t set
    reply_count = (select count(*) from public.forum_replies r where r.thread_id = tid and not r.deleted and not r.hidden),
    last_activity_at = greatest(t.created_at, coalesce((select max(created_at) from public.forum_replies r where r.thread_id = tid and not r.deleted), t.created_at))
  where t.id = tid;
  return null;
end $$;
drop trigger if exists t_reply_counts on public.forum_replies;
create trigger t_reply_counts after insert or update or delete on public.forum_replies for each row execute function public.forum_reply_counts();

-- Reports: bump count, hide after 3 distinct reports (HIDE_AFTER in src/lib/forum.js).
create or replace function public.forum_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare hide_after int := 3;
begin
  if new.target_type = 'thread' then
    update public.forum_threads set report_count = report_count + 1,
      hidden = (report_count + 1) >= hide_after where id = new.target_id;
  else
    update public.forum_replies set report_count = report_count + 1,
      hidden = (report_count + 1) >= hide_after where id = new.target_id;
  end if;
  return null;
end $$;
drop trigger if exists t_on_report on public.forum_reports;
create trigger t_on_report after insert on public.forum_reports for each row execute function public.forum_on_report();

-- ---------- privileges: users may only write the columns they own ----------
revoke all on public.profiles, public.forum_threads, public.forum_replies, public.forum_reports from anon, authenticated;
grant select on public.profiles, public.forum_threads, public.forum_replies to anon, authenticated;
grant insert (id, display_name) , update (display_name) on public.profiles to authenticated;
grant insert (board, category, title, body) on public.forum_threads to authenticated;
grant update (title, body, category, deleted) on public.forum_threads to authenticated;
grant insert (thread_id, body) on public.forum_replies to authenticated;
grant update (body, deleted) on public.forum_replies to authenticated;
grant insert (target_type, target_id, reason) on public.forum_reports to authenticated;

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_replies enable row level security;
alter table public.forum_reports enable row level security;

drop policy if exists p_read on public.profiles;
create policy p_read on public.profiles for select using (true);
drop policy if exists p_ins on public.profiles;
create policy p_ins on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Everyone sees visible posts; authors also see their own hidden ones.
drop policy if exists t_read on public.forum_threads;
create policy t_read on public.forum_threads for select using ((not hidden and not deleted) or author_id = auth.uid());
drop policy if exists t_ins on public.forum_threads;
create policy t_ins on public.forum_threads for insert to authenticated with check (author_id = auth.uid());
drop policy if exists t_upd on public.forum_threads;
create policy t_upd on public.forum_threads for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists r_read on public.forum_replies;
create policy r_read on public.forum_replies for select using ((not hidden and not deleted) or author_id = auth.uid());
drop policy if exists r_ins on public.forum_replies;
create policy r_ins on public.forum_replies for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.forum_threads t where t.id = thread_id and not t.hidden and not t.deleted));
drop policy if exists r_upd on public.forum_replies;
create policy r_upd on public.forum_replies for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- Reports are write-only for users (only you, in the dashboard, can read them).
drop policy if exists rep_ins on public.forum_reports;
create policy rep_ins on public.forum_reports for insert to authenticated with check (reporter_id = auth.uid());

-- Moderation: in Table Editor, set hidden = false to restore a post, or hidden = true to pull one.
