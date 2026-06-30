-- D.I.S.C.O PRELIMINARY PROGRAM / DPP v4
-- Supabase SQL Editor에서 실행.
-- 이미 테이블이 있으면 안전하게 필요한 컬럼만 추가됩니다.

create table if not exists public.dpp_participants (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  participant_order text not null,
  participant_circle text,
  participant_group text,
  participant_name text,
  battle_name text,
  updated_at timestamptz default now(),
  unique(event_id, participant_order)
);

create table if not exists public.dpp_scores (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  score_mode text not null default 'circle',
  judge_circle text not null,
  judge_name text,
  participant_order text not null,
  participant_circle text,
  participant_group text,
  participant_name text,
  battle_name text,
  score numeric,
  updated_at timestamptz default now(),
  unique(event_id, score_mode, judge_circle, participant_order)
);

create table if not exists public.dpp_logs (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  score_mode text default 'circle',
  judge_circle text,
  judge_name text,
  participant_order text,
  participant_circle text,
  participant_group text,
  participant_name text,
  battle_name text,
  score numeric,
  action text default 'score',
  created_at timestamptz default now()
);

alter table public.dpp_participants add column if not exists participant_circle text;
alter table public.dpp_participants add column if not exists participant_group text;

alter table public.dpp_scores add column if not exists score_mode text default 'circle';
alter table public.dpp_scores add column if not exists participant_circle text;
alter table public.dpp_scores add column if not exists participant_group text;

alter table public.dpp_logs add column if not exists score_mode text default 'circle';
alter table public.dpp_logs add column if not exists participant_circle text;
alter table public.dpp_logs add column if not exists participant_group text;

alter table public.dpp_participants enable row level security;
alter table public.dpp_scores enable row level security;
alter table public.dpp_logs enable row level security;

drop policy if exists dpp_participants_all on public.dpp_participants;
drop policy if exists dpp_scores_all on public.dpp_scores;
drop policy if exists dpp_logs_all on public.dpp_logs;

create policy dpp_participants_all on public.dpp_participants for all using (true) with check (true);
create policy dpp_scores_all on public.dpp_scores for all using (true) with check (true);
create policy dpp_logs_all on public.dpp_logs for all using (true) with check (true);

-- Realtime은 Supabase Publications 화면에서 dpp_participants / dpp_scores / dpp_logs 스위치를 ON 해줘.
