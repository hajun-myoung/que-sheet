-- Resolve identity once per statement without changing row authorization.
alter policy member_read on public.members using(user_id=(select auth.uid()) or public.my_role(event_id)='operator');
alter policy assignment_read on public.assignments using(judge_id=(select auth.uid()) or public.my_role(event_id)='operator');
alter policy evaluation_read on public.evaluations using(judge_id=(select auth.uid()) or public.my_role(event_id)='operator');
alter policy receipt_read on public.request_receipts using(actor=(select auth.uid()));

-- Cover team/event ownership lookups and referencing sides of foreign keys.
create index members_user_event_idx on public.members(user_id,event_id);
create index members_event_team_idx on public.members(event_id,team_id);
create index submissions_event_team_idx on public.submissions(event_id,team_id);
create index sessions_event_team_idx on public.sessions(event_id,team_id);
create index sessions_event_submission_idx on public.sessions(event_id,submission_id);
create index assignments_event_judge_idx on public.assignments(event_id,judge_id);
create index evaluations_event_judge_idx on public.evaluations(event_id,judge_id);
create index evaluations_event_rubric_idx on public.evaluations(event_id,rubric_id);
create index invitations_event_team_idx on public.invitations(event_id,team_id);
create index request_receipts_actor_idx on public.request_receipts(actor);
create index participant_codes_event_team_idx on public.participant_codes(event_id,team_id);
create index teams_event_submission_idx on public.teams(event_id,submission_id);
-- events(id,current_rubric_id) already resolves at most one row by its id primary key.
