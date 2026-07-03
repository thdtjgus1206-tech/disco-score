-- D.I.S.C.O PRELIMINARY PROGRAM / DPP v5.3
-- 참가자 / 점수 / 로그 테이블 추가
-- SQL Editor에서 실행해줘.

create table if not exists public.dpp_settings (
  event_id text primary key default 'DPP_MAIN',
  scoring_mode text not null default 'circle',
  judge_count integer default 3,
  top_count integer default 16,
  judges jsonb default '{
    "A":{"name":"A JUDGE","pin":"1111"},
    "B":{"name":"B JUDGE","pin":"2222"},
    "C":{"name":"C JUDGE","pin":"3333"}
  }'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.dpp_participants (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  participant_order text not null,
  participant_circle text,
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
  participant_name text,
  battle_name text,
  score numeric,
  updated_at timestamptz default now(),
  unique(event_id, score_mode, judge_circle, participant_order)
);

create table if not exists public.dpp_logs (
  id uuid default gen_random_uuid() primary key,
  event_id text not null default 'DPP_MAIN',
  score_mode text not null default 'circle',
  judge_circle text,
  judge_name text,
  participant_order text,
  participant_circle text,
  participant_name text,
  battle_name text,
  score numeric,
  created_at timestamptz default now()
);

alter table public.dpp_settings enable row level security;
alter table public.dpp_participants enable row level security;
alter table public.dpp_scores enable row level security;
alter table public.dpp_logs enable row level security;

drop policy if exists dpp_settings_all on public.dpp_settings;
drop policy if exists dpp_participants_all on public.dpp_participants;
drop policy if exists dpp_scores_all on public.dpp_scores;
drop policy if exists dpp_logs_all on public.dpp_logs;

create policy dpp_settings_all on public.dpp_settings for all using (true) with check (true);
create policy dpp_participants_all on public.dpp_participants for all using (true) with check (true);
create policy dpp_scores_all on public.dpp_scores for all using (true) with check (true);
create policy dpp_logs_all on public.dpp_logs for all using (true) with check (true);

insert into public.dpp_settings (
  event_id,
  scoring_mode,
  judge_count,
  top_count,
  judges
)
values (
  'DPP_MAIN',
  'circle',
  3,
  16,
  '{
    "A":{"name":"A JUDGE","pin":"1111"},
    "B":{"name":"B JUDGE","pin":"2222"},
    "C":{"name":"C JUDGE","pin":"3333"}
  }'::jsonb
)
on conflict (event_id) do nothing;

-- Supabase > Database > Publications에서
-- dpp_settings / dpp_participants / dpp_scores / dpp_logs 스위치를 ON 해줘.
