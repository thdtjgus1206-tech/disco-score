-- DPP V7 CLEAN 필수 SQL
-- 이미 v6.3 SQL을 실행했다면 다시 안 해도 됩니다.
-- duplicate key 오류가 계속 나면 이 SQL을 한 번 실행해줘.

alter table public.dpp_scores
drop constraint if exists dpp_scores_event_id_judge_circle_participant_order_key;

alter table public.dpp_scores
drop constraint if exists dpp_scores_event_id_score_mode_judge_circle_participant_order_key;

alter table public.dpp_scores
drop constraint if exists dpp_scores_event_mode_judge_order_unique;

with ranked as (
  select id, row_number() over (
    partition by event_id, score_mode, judge_circle, participant_order
    order by updated_at desc nulls last, id desc
  ) as rn
  from public.dpp_scores
)
delete from public.dpp_scores where id in (select id from ranked where rn > 1);

alter table public.dpp_scores
add constraint dpp_scores_event_mode_judge_order_unique
unique (event_id, score_mode, judge_circle, participant_order);

alter table public.dpp_participants
drop constraint if exists dpp_participants_event_id_participant_order_key;

alter table public.dpp_participants
drop constraint if exists dpp_participants_event_order_unique;

with ranked_p as (
  select id, row_number() over (
    partition by event_id, participant_order
    order by updated_at desc nulls last, id desc
  ) as rn
  from public.dpp_participants
)
delete from public.dpp_participants where id in (select id from ranked_p where rn > 1);

alter table public.dpp_participants
add constraint dpp_participants_event_order_unique
unique (event_id, participant_order);
