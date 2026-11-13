-- Event administration uses existing event locks, role checks and request receipts.
create or replace function public.app_command(p_event uuid,p_request uuid,p_kind text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.members;e public.events;t public.teams;s public.sessions;sub public.submissions;ev public.evaluations;r public.rubrics;rec public.request_receipts;stamp timestamptz:=clock_timestamp();fp text;result jsonb:='{}';d int;other uuid;idx int;item jsonb;v numeric;rid uuid;is_final boolean; target public.members; inv public.invitations;
begin
 if auth.uid() is null or p_request is null then raise exception '로그인이 필요합니다.';end if;
 select * into e from public.events where id=p_event for update;if e.id is null then raise exception '행사가 없습니다.';end if;
 stamp:=clock_timestamp();
 select * into m from public.members where event_id=p_event and user_id=auth.uid();if m.user_id is null then raise exception '행사 접근 권한이 없습니다.';end if;
 fp:=p_kind||':'||p::text;select * into rec from public.request_receipts where event_id=p_event and actor=auth.uid() and request_id=p_request;
 if found then if rec.fingerprint<>fp then raise exception '요청 ID가 다른 내용으로 사용되었습니다.';end if;return rec.result;end if;
 if p_kind not in ('move','review') and m.role<>'operator' then raise exception '운영자 권한이 필요합니다.';end if;
 if p ? 'team_id' then select * into t from public.teams where id=(p->>'team_id')::uuid and event_id=p_event;if t.id is null then raise exception '팀을 찾을 수 없습니다.';end if;end if;
 case p_kind
 when 'start' then
 if t.id is null or t.submission_id is null then raise exception 'PDF 제출이 필요합니다.';end if;
 if exists(select 1 from public.sessions where event_id=p_event and status<>'ended') then raise exception '이미 진행 중인 발표가 있습니다.';end if;
 select * into sub from public.submissions where id=t.submission_id;
 insert into public.sessions(id,event_id,team_id,submission_id,settings,status,page_count)values((p->>'id')::uuid,p_event,t.id,sub.id,jsonb_set(jsonb_set(e.settings,'{duration_seconds}',to_jsonb(coalesce(t.duration_seconds,(e.settings->>'duration_seconds')::int))),'{warning_seconds}',to_jsonb(least((e.settings->>'warning_seconds')::int,coalesce(t.duration_seconds,(e.settings->>'duration_seconds')::int)))),'preparing',sub.pages) returning to_jsonb(sessions.*) into result;
 when 'move','ready','pause','resume','reset','end' then
 select * into s from public.sessions where id=(p->>'session_id')::uuid and event_id=p_event;
 if s.id is null or s.status='ended' then raise exception '종료되었거나 없는 세션입니다.';end if;
 if s.version is distinct from (p->>'version')::int then raise exception '상태가 변경되었습니다. 동기화 후 다시 시도해 주세요.';end if;
 if p_kind='move' then
 if not(m.role='operator' or(m.role='participant' and m.team_id=s.team_id)) then raise exception '현재 발표 팀만 장표를 이동할 수 있습니다.';end if;
 if s.status not in ('running','paused') then raise exception '발표 준비 중입니다.';end if;
 d:=(p->>'delta')::int;if d is null or d not in(-1,1) or s.current_page+d not between 1 and s.page_count then raise exception '페이지 범위를 벗어났습니다.';end if;s.current_page:=s.current_page+d;
 elsif p_kind='ready' then if s.status<>'preparing' then raise exception '이미 시작된 발표입니다.';end if;s.status:='running';s.started_at:=stamp;
 elsif p_kind='pause' then if s.status<>'running' then raise exception '진행 중인 발표가 아닙니다.';end if;s.status:='paused';s.paused_at:=stamp;
 elsif p_kind='resume' then if s.status<>'paused' then raise exception '일시정지된 발표가 아닙니다.';end if;s.paused_ms:=s.paused_ms+floor(extract(epoch from(stamp-s.paused_at))*1000);s.paused_at:=null;s.status:='running';
 elsif p_kind='reset' then if s.status not in ('running','paused') then raise exception '진행 중인 발표가 아닙니다.';end if;s.started_at:=stamp;s.paused_ms:=0;if s.status='paused' then s.paused_at:=stamp;end if;
 else if s.status='paused' then s.paused_ms:=s.paused_ms+floor(extract(epoch from(stamp-s.paused_at))*1000);end if;s.status:='ended';s.ended_at:=stamp;s.paused_at:=null;end if;
 update public.sessions set current_page=s.current_page,status=s.status,started_at=s.started_at,paused_at=s.paused_at,paused_ms=s.paused_ms,ended_at=s.ended_at,version=version+1 where id=s.id returning to_jsonb(sessions.*) into result;
 when 'settings' then perform public.check_settings(p->'settings');update public.events set settings=p->'settings' where id=p_event;
 when 'team' then
 if t.id is null then insert into public.teams(id,event_id,name,description,sort_index,duration_seconds)values((p->>'id')::uuid,p_event,trim(p->>'name'),coalesce(p->>'description',''),(select coalesce(max(sort_index)+1,0) from public.teams where event_id=p_event),(p->>'duration_seconds')::int);
 else update public.teams set name=trim(p->>'name'),description=coalesce(p->>'description',''),duration_seconds=(p->>'duration_seconds')::int where id=t.id;end if;
 when 'reorder' then d:=(p->>'delta')::int;if d is null or d not in(-1,1) then raise exception '잘못된 이동입니다.';end if;select id,sort_index into other,idx from public.teams where event_id=p_event and sort_index=t.sort_index+d;if other is null then raise exception '순서를 더 변경할 수 없습니다.';end if;update public.teams set sort_index=case when id=t.id then idx else t.sort_index end where id in(t.id,other);
 when 'rubric' then perform public.check_items(p->'items');rid:=(p->>'id')::uuid;insert into public.rubrics values(rid,p_event,(select coalesce(max(version)+1,1) from public.rubrics where event_id=p_event),p->'items');update public.events set current_rubric_id=rid where id=p_event;
 when 'review' then
 if m.role<>'judge' or not exists(select 1 from public.assignments where event_id=p_event and team_id=t.id and judge_id=auth.uid()) then raise exception '배정된 팀만 심사할 수 있습니다.';end if;
 select * into ev from public.evaluations where event_id=p_event and team_id=t.id and judge_id=auth.uid();
 if ev.status='submitted' then raise exception '최종 제출된 심사입니다.';end if;
 if coalesce(ev.version,0) is distinct from(p->>'version')::int then raise exception '다른 탭에서 수정했습니다. 최신 내용을 불러오세요.';end if;
 rid:=coalesce(ev.rubric_id,e.current_rubric_id);if rid is distinct from(p->>'rubric_id')::uuid then raise exception '평가 기준이 변경되었습니다. 다시 확인해 주세요.';end if;
 select * into r from public.rubrics where id=rid;is_final:=coalesce((p->>'final')::boolean,false);
 if jsonb_typeof(p->'scores') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p->'scores') k where not exists(select 1 from jsonb_array_elements(r.items)i where i->>'id'=k)) then raise exception '평가 항목이 일치하지 않습니다.';end if;
 for item in select * from jsonb_array_elements(r.items) loop
 if not((p->'scores')?(item->>'id')) then if is_final then raise exception '모든 필수 점수를 입력해 주세요.';end if;
 else if jsonb_typeof(p->'scores'->(item->>'id'))<>'number' then raise exception '점수는 숫자여야 합니다.';end if;v:=(p->'scores'->>(item->>'id'))::numeric;if v<0 or v>(item->>'max')::numeric then raise exception '배점 범위를 벗어났습니다.';end if;end if;end loop;
 insert into public.evaluations(event_id,team_id,judge_id,rubric_id,scores,notes,status)values(p_event,t.id,auth.uid(),rid,p->'scores',coalesce(p->>'notes',''),case when is_final then 'submitted' else 'draft' end) on conflict(event_id,team_id,judge_id)do update set scores=excluded.scores,notes=excluded.notes,status=excluded.status,version=public.evaluations.version+1,updated_at=stamp returning to_jsonb(evaluations.*) into result;
 when 'reopen' then update public.evaluations set status='draft',version=version+1,updated_at=stamp where id=(p->>'evaluation_id')::uuid and event_id=p_event and status='submitted';if not found then raise exception '제출된 평가가 없습니다.';end if;
 when 'invite' then
 if coalesce(p->>'email','') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p->>'email')>254 or length(trim(coalesce(p->>'display_name',''))) not between 1 and 80 then raise exception '이메일과 이름을 확인해 주세요.';end if;
 insert into public.invitations(id,event_id,email,role,team_id,display_name,registered_only)values((p->>'id')::uuid,p_event,lower(trim(p->>'email')),p->>'role',case when p->>'role'='participant' then t.id else null end,trim(p->>'display_name'),coalesce((p->>'registered_only')::boolean,false));
 when 'event_rename' then
 if jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 100 then raise exception '행사 이름은 1~100자로 입력해 주세요.';end if;
 if e.name is distinct from p->>'expected_name' then raise exception '다른 운영자가 행사 이름을 변경했습니다. 최신 이름을 확인해 주세요.';end if;
 update public.events set name=trim(p->>'name') where id=p_event;
 when 'operator_update' then
 select * into target from public.members where event_id=p_event and user_id=(p->>'user_id')::uuid and role='operator';
 if target.user_id is null then raise exception '이 행사의 운영자가 아닙니다.';end if;
 if jsonb_typeof(p->'display_name') is distinct from 'string' or length(trim(p->>'display_name')) not between 1 and 80 then raise exception '표시 이름은 1~80자로 입력해 주세요.';end if;
 if target.display_name is distinct from p->>'expected_name' then raise exception '다른 운영자가 이름을 수정했습니다. 최신 내용을 확인해 주세요.';end if;
 update public.members set display_name=trim(p->>'display_name') where event_id=p_event and user_id=target.user_id;
 when 'operator_remove' then
 select * into target from public.members where event_id=p_event and user_id=(p->>'user_id')::uuid and role='operator';
 if target.user_id is null then raise exception '이 행사의 운영자가 아닙니다.';end if;
 if (select count(*) from public.members where event_id=p_event and role='operator')<=1 then raise exception '마지막 운영자는 제거할 수 없습니다.';end if;
 delete from public.members where event_id=p_event and user_id=target.user_id;
 when 'operator_invitation_cancel' then
 select * into inv from public.invitations where event_id=p_event and id=(p->>'invitation_id')::uuid and role='operator' for update;
 if inv.id is null or inv.accepted then raise exception '대기 중인 운영자 초대가 없습니다.';end if;
 if inv.mail_status='sending' then raise exception '메일 발송이 끝난 뒤 초대를 취소해 주세요.';end if;
 delete from public.invitations where id=inv.id;
 when 'assign' then
 if not exists(select 1 from public.members where event_id=p_event and user_id=(p->>'judge_id')::uuid and role='judge') then raise exception '행사 심사위원이 아닙니다.';end if;
 delete from public.assignments where event_id=p_event and team_id=t.id and judge_id=(p->>'judge_id')::uuid;
 if (p->>'assigned')::boolean then insert into public.assignments values(p_event,t.id,(p->>'judge_id')::uuid);end if;
 else raise exception '지원하지 않는 요청입니다.';
 end case;
 insert into public.request_receipts values(p_event,auth.uid(),p_request,fp,result);update public.event_updates set revision=revision+1 where event_id=p_event;return result;
end $$;

create or replace function public.accept_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.invitations; eid uuid;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 select event_id into eid from public.invitations where id=p_id;
 perform 1 from public.events where id=eid for update;
 if not found then raise exception '초대가 취소되었거나 행사가 없습니다.';end if;
 select * into inv from public.invitations where id=p_id for update;
 if inv.id is null or lower(inv.email)<>lower(coalesce(auth.jwt()->>'email','')) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception '초대 이메일로 로그인해야 합니다.';end if;
 if inv.accepted then
   if public.my_role(inv.event_id) is not null then return inv.event_id;end if;
   raise exception '사용된 초대입니다.';
 end if;
 if public.my_role(inv.event_id) is not null then raise exception '이미 이 행사에 참여 중인 계정입니다.';end if;
 insert into public.members values(inv.event_id,auth.uid(),inv.role,inv.team_id,inv.display_name);
 update public.invitations set accepted=true where id=p_id;
 update public.event_updates set revision=revision+1 where event_id=inv.event_id;
 return inv.event_id;
end $$;

-- Existing checked RPC boundary; no new table write privileges or public RPCs.
revoke all on function public.app_command(uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.accept_invitation(uuid) from public,anon;
grant execute on function public.app_command(uuid,uuid,text,jsonb), public.accept_invitation(uuid) to authenticated;
