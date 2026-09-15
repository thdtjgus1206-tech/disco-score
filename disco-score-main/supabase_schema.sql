
-- D.I.S.C.O PRELIMINARY PROGRAM / DPP v3.0
-- Supabase SQL setup
-- SQL Editor에서 전체 실행해줘.

create table if not exists public.dpp_scores (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  judge_circle text not null,
  judge_name text,
  participant_order text not null,
  participant_group text,
  participant_name text,
  battle_name text,
  score numeric,
  updated_at timestamptz default now(),
  unique(event_id, judge_circle, participant_order)
);

create table if not exists public.dpp_participants (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  participant_order text not null,
  participant_group text,
  participant_name text,
  battle_name text,
  updated_at timestamptz default now(),
  unique(event_id, participant_order)
);

create table if not exists public.dpp_logs (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  judge_circle text,
  judge_name text,
  participant_order text,
  participant_group text,
  participant_name text,
  battle_name text,
  score numeric,
  action text default 'score',
  created_at timestamptz default now()
);

alter table public.dpp_scores enable row level security;
alter table public.dpp_participants enable row level security;
alter table public.dpp_logs enable row level security;

drop policy if exists "dpp_scores_select" on public.dpp_scores;
drop policy if exists "dpp_scores_insert" on public.dpp_scores;
drop policy if exists "dpp_scores_update" on public.dpp_scores;
drop policy if exists "dpp_scores_delete" on public.dpp_scores;

drop policy if exists "dpp_participants_select" on public.dpp_participants;
drop policy if exists "dpp_participants_insert" on public.dpp_participants;
drop policy if exists "dpp_participants_update" on public.dpp_participants;
drop policy if exists "dpp_participants_delete" on public.dpp_participants;

drop policy if exists "dpp_logs_select" on public.dpp_logs;
drop policy if exists "dpp_logs_insert" on public.dpp_logs;
drop policy if exists "dpp_logs_update" on public.dpp_logs;
drop policy if exists "dpp_logs_delete" on public.dpp_logs;

create policy "dpp_scores_select" on public.dpp_scores for select using (true);
create policy "dpp_scores_insert" on public.dpp_scores for insert with check (true);
create policy "dpp_scores_update" on public.dpp_scores for update using (true) with check (true);
create policy "dpp_scores_delete" on public.dpp_scores for delete using (true);

create policy "dpp_participants_select" on public.dpp_participants for select using (true);
create policy "dpp_participants_insert" on public.dpp_participants for insert with check (true);
create policy "dpp_participants_update" on public.dpp_participants for update using (true) with check (true);
create policy "dpp_participants_delete" on public.dpp_participants for delete using (true);

create policy "dpp_logs_select" on public.dpp_logs for select using (true);
create policy "dpp_logs_insert" on public.dpp_logs for insert with check (true);
create policy "dpp_logs_update" on public.dpp_logs for update using (true) with check (true);
create policy "dpp_logs_delete" on public.dpp_logs for delete using (true);

alter publication supabase_realtime add table public.dpp_scores;
alter publication supabase_realtime add table public.dpp_participants;
alter publication supabase_realtime add table public.dpp_logs;
