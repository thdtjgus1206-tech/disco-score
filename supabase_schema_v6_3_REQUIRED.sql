-- DPP v6.3 필수 DB 수정 SQL
-- Supabase SQL Editor에서 반드시 한 번 실행해줘.
-- 원인: 예전 UNIQUE 조건(event_id, judge_circle, participant_order)이 남아 있어서
-- Mode1/Mode2 점수 row가 충돌하고 있었음.

-- 1) 기존 잘못된 UNIQUE 제약조건 삭제
alter table public.dpp_scores
drop constraint if exists dpp_scores_event_id_judge_circle_participant_order_key;

alter table public.dpp_scores
drop constraint if exists dpp_scores_event_id_score_mode_judge_circle_participant_order_key;

-- 2) 중복 row 정리: 같은 event/mode/judge/order는 최신 1개만 남김
with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, score_mode, judge_circle, participant_order
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.dpp_scores
)
delete from public.dpp_scores
where id in (
  select id from ranked where rn > 1
);

-- 3) 새 구조에 맞는 UNIQUE 제약조건 생성
alter table public.dpp_scores
add constraint dpp_scores_event_mode_judge_order_unique
unique (event_id, score_mode, judge_circle, participant_order);

-- 4) 참가자 테이블도 안전하게 UNIQUE 보장
with ranked_participants as (
  select
    id,
    row_number() over (
      partition by event_id, participant_order
      order by updated_at desc nulls last, id desc
    ) as rn
  from public.dpp_participants
)
delete from public.dpp_participants
where id in (
  select id from ranked_participants where rn > 1
);

alter table public.dpp_participants
drop constraint if exists dpp_participants_event_id_participant_order_key;

alter table public.dpp_participants
add constraint dpp_participants_event_order_unique
unique (event_id, participant_order);
