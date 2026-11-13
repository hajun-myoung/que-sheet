-- Registrations are invitations, not Auth users or granted memberships.
alter table public.invitations add column registered_only boolean not null default false;
alter table public.invitations add column mail_status text not null default 'pending' check(mail_status in ('pending','sending','sent','failed','unknown'));
alter table public.invitations add column mail_attempt uuid;
alter table public.invitations add column mail_started_at timestamptz;
alter table public.invitations add column mailed_at timestamptz;
alter table public.invitations add column mail_error text;
-- Private server-only copy allows a team code to be reused for later registrants.
alter table public.participant_codes add column mail_code text;

-- Receipt survives event removal, so Storage cleanup can be safely retried.
create table public.event_deletions (
 event_id uuid primary key, actor uuid not null, name text not null,
 paths text[] not null, completed boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.event_deletions enable row level security;
revoke all on public.event_deletions from public,anon,authenticated;

create function public.pending_event_deletions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',event_id,'name',name)),'[]') from public.event_deletions where actor=(select auth.uid()) and not completed
$$;
revoke all on function public.pending_event_deletions() from public,anon;
grant execute on function public.pending_event_deletions() to authenticated;

create function public.begin_event_deletion(p_actor uuid,p_event uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; receipt public.event_deletions; paths text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,0));
 select * into receipt from public.event_deletions where event_id=p_event;
 if found then
   if receipt.actor is distinct from p_actor or receipt.name is distinct from p_name then raise exception '삭제 권한이 없습니다.';end if;
   return to_jsonb(receipt);
 end if;
 select * into e from public.events where id=p_event for update;
 if e.id is null or not exists(select 1 from public.members where event_id=p_event and user_id=p_actor and role='operator') then raise exception '운영자 권한이 필요합니다.';end if;
 if p_name is distinct from e.name then raise exception '행사 이름을 정확히 입력해 주세요.';end if;
 if exists(select 1 from public.sessions where event_id=p_event and status<>'ended') then raise exception '발표를 종료한 뒤 행사를 삭제해 주세요.';end if;
 if exists(select 1 from public.invitations where event_id=p_event and mail_status='sending' and mail_started_at>clock_timestamp()-interval '2 minutes') then raise exception '메일 발송이 끝난 뒤 삭제해 주세요.';end if;
 select coalesce(array_agg(name),'{}') into paths from storage.objects where bucket_id='presentations' and name like p_event::text||'/%';
 insert into public.event_deletions(event_id,actor,name,paths) values(p_event,p_actor,e.name,paths) returning * into receipt;
 delete from public.request_receipts where event_id=p_event;
 delete from public.assignments where event_id=p_event;
 delete from public.evaluations where event_id=p_event;
 delete from public.sessions where event_id=p_event;
 delete from public.invitations where event_id=p_event;
 delete from public.participant_codes where event_id=p_event;
 delete from public.members where event_id=p_event;
 update public.teams set submission_id=null where event_id=p_event;
 delete from public.submissions where event_id=p_event;
 delete from public.teams where event_id=p_event;
 update public.events set current_rubric_id=null where id=p_event;
 delete from public.rubrics where event_id=p_event;
 delete from public.event_updates where event_id=p_event;
 delete from public.events where id=p_event;
 return to_jsonb(receipt);
end $$;
create function public.finish_event_deletion(p_actor uuid,p_event uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.event_deletions set completed=true,paths='{}' where event_id=p_event and actor=p_actor;
 if not found then raise exception '삭제 요청이 없습니다.';end if;
end $$;
revoke all on function public.begin_event_deletion(uuid,uuid,text),public.finish_event_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_event_deletion(uuid,uuid,text),public.finish_event_deletion(uuid,uuid) to service_role;

create or replace function public.issue_participant_code(p_event uuid,p_team uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text:=upper(replace(gen_random_uuid()::text,'-','')); expiry timestamptz:=clock_timestamp()+interval '7 days';
begin
 perform 1 from public.events where id=p_event for update;
 if public.my_role(p_event) is distinct from 'operator' then raise exception '운영자만 코드를 발급할 수 있습니다.';end if;
 if not exists(select 1 from public.teams where id=p_team and event_id=p_event) then raise exception '팀을 찾을 수 없습니다.';end if;
 if exists(select 1 from public.invitations where event_id=p_event and team_id=p_team and mail_status='sending' and mail_started_at>clock_timestamp()-interval '2 minutes') then raise exception '메일 발송 중에는 코드를 변경할 수 없습니다.';end if;
 insert into public.participant_codes(team_id,event_id,code_hash,expires_at,mail_code)
 values(p_team,p_event,encode(sha256(convert_to(code,'UTF8')),'hex'),expiry,code)
 on conflict(team_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,mail_code=excluded.mail_code;
 update public.invitations set mail_status='pending',mail_attempt=null,mail_error=null where event_id=p_event and team_id=p_team and registered_only and not accepted;
 update public.event_updates set revision=revision+1 where event_id=p_event;
 return jsonb_build_object('code',code,'expires_at',expiry);
end $$;

create function public.claim_invitation_email(p_actor uuid,p_event uuid,p_id uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inv public.invitations; e public.events; c public.participant_codes; code text; team_name text;
begin
 select * into e from public.events where id=p_event for update;
 if not exists(select 1 from public.members where event_id=p_event and user_id=p_actor and role='operator') then raise exception '운영자 권한이 필요합니다.';end if;
 select * into inv from public.invitations where id=p_id and event_id=p_event for update;
 if inv.id is null or not inv.registered_only then raise exception '등록된 멤버가 아닙니다.';end if;
 if inv.mail_status='sending' and inv.mail_started_at<clock_timestamp()-interval '2 minutes' then
   update public.invitations set mail_status='unknown',mail_error='발송 결과를 확인하지 못했습니다. 수신 여부를 확인해 주세요.' where id=p_id;
   update public.event_updates set revision=revision+1 where event_id=p_event;
   return jsonb_build_object('status','unknown');
 end if;
 if inv.accepted or inv.mail_status in ('sent','sending','unknown') then return jsonb_build_object('status',inv.mail_status);end if;
 if inv.mail_status='failed' and inv.mail_started_at>clock_timestamp()-interval '1 minute' then raise exception '실패한 발송은 1분 후 다시 시도해 주세요.';end if;
 if inv.role='participant' then
   select * into c from public.participant_codes where team_id=inv.team_id;
   if c.mail_code is null or c.expires_at<clock_timestamp() then
     code:=upper(replace(gen_random_uuid()::text,'-',''));
     insert into public.participant_codes(team_id,event_id,code_hash,expires_at,mail_code)
     values(inv.team_id,p_event,encode(sha256(convert_to(code,'UTF8')),'hex'),clock_timestamp()+interval '7 days',code)
     on conflict(team_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,mail_code=excluded.mail_code returning * into c;
     -- Existing recipients also need the replacement when an old code expires.
     update public.invitations set mail_status='pending',mail_attempt=null,mail_error=null where event_id=p_event and team_id=inv.team_id and registered_only and not accepted and mail_status='sent';
   end if;
   select name into team_name from public.teams where id=inv.team_id;
 end if;
 update public.invitations set mail_status='sending',mail_attempt=p_attempt,mail_started_at=clock_timestamp(),mail_error=null where id=p_id;
 update public.event_updates set revision=revision+1 where event_id=p_event;
 return jsonb_build_object('status','claimed','id',inv.id,'email',inv.email,'display_name',inv.display_name,'role',inv.role,'event_name',e.name,'team_name',team_name,'code',c.mail_code,'expires_at',c.expires_at);
end $$;
create function public.finish_invitation_email(p_id uuid,p_attempt uuid,p_status text,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if p_status not in ('sent','failed','unknown') then raise exception '잘못된 발송 상태입니다.';end if;
 update public.invitations set mail_status=p_status,mail_error=left(p_error,300),mailed_at=case when p_status='sent' then clock_timestamp() else mailed_at end
 where id=p_id and mail_attempt=p_attempt and mail_status in ('sending','unknown') returning event_id into eid;
 if eid is null then raise exception '발송 요청이 변경되었습니다.';end if;
 update public.event_updates set revision=revision+1 where event_id=eid;
end $$;
create function public.retry_unknown_email(p_event uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=p_event for update;
 if public.my_role(p_event) is distinct from 'operator' then raise exception '운영자 권한이 필요합니다.';end if;
 update public.invitations set mail_status='pending',mail_attempt=null,mail_error=null
 where id=p_id and event_id=p_event and registered_only and (mail_status='unknown' or (mail_status='sending' and mail_started_at<clock_timestamp()-interval '2 minutes'));
 if not found then raise exception '재발송할 수 있는 상태가 아닙니다.';end if;
 update public.event_updates set revision=revision+1 where event_id=p_event;
end $$;
revoke all on function public.claim_invitation_email(uuid,uuid,uuid,uuid),public.finish_invitation_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_invitation_email(uuid,uuid,uuid,uuid),public.finish_invitation_email(uuid,uuid,text,text) to service_role;
revoke all on function public.retry_unknown_email(uuid,uuid) from public,anon;
grant execute on function public.retry_unknown_email(uuid,uuid) to authenticated;

-- Keep existing command authorization, locking and request receipts.
create or replace function public.app_command(p_event uuid,p_request uuid,p_kind text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.members;e public.events;t public.teams;s public.sessions;sub public.submissions;ev public.evaluations;r public.rubrics;rec public.request_receipts;stamp timestamptz:=clock_timestamp();fp text;result jsonb:='{}';d int;other uuid;idx int;item jsonb;v numeric;rid uuid;is_final boolean;
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
 when 'assign' then
 if not exists(select 1 from public.members where event_id=p_event and user_id=(p->>'judge_id')::uuid and role='judge') then raise exception '행사 심사위원이 아닙니다.';end if;
 delete from public.assignments where event_id=p_event and team_id=t.id and judge_id=(p->>'judge_id')::uuid;
 if (p->>'assigned')::boolean then insert into public.assignments values(p_event,t.id,(p->>'judge_id')::uuid);end if;
 else raise exception '지원하지 않는 요청입니다.';
 end case;
 insert into public.request_receipts values(p_event,auth.uid(),p_request,fp,result);update public.event_updates set revision=revision+1 where event_id=p_event;return result;
end $$;

create index event_deletions_pending_actor_idx on public.event_deletions(actor) where not completed;
create or replace function public.create_event(p_name text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception '운영자는 이메일 인증 후 행사를 만들 수 있습니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 if exists(select 1 from public.event_deletions where event_id=p_request) then raise exception '삭제된 행사의 요청은 재사용할 수 없습니다.';end if;
 return public.create_event_verified(p_name,p_request);
end $$;
