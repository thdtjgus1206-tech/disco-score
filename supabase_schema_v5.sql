-- D.I.S.C.O PRELIMINARY PROGRAM / DPP v5
-- 로그인 안정화 우선 버전 SQL
-- Supabase SQL Editor에서 실행해줘.

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

alter table public.dpp_settings enable row level security;

drop policy if exists dpp_settings_all on public.dpp_settings;
create policy dpp_settings_all on public.dpp_settings
for all using (true) with check (true);

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
on conflict (event_id) do update set
  judges = excluded.judges,
  judge_count = excluded.judge_count,
  top_count = excluded.top_count,
  updated_at = now();

-- Publications 화면에서 dpp_settings Realtime 스위치 ON 해줘.
