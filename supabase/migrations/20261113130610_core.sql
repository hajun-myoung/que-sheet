-- All writes go through checked RPCs. PDFs are immutable; old versions remain
-- referenced by sessions. Event-row locking serializes commands for an event.
create table public.events(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),subtitle text not null default '',settings jsonb not null default '{"duration_seconds":420,"warning_seconds":60,"normal_color":"#FFFFFF","warning_color":"#FBBF24","overtime_color":"#FB7185"}',current_rubric_id uuid);
create table public.teams(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events, name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=1000),sort_index integer not null,duration_seconds integer check(duration_seconds between 10 and 7200),submission_id uuid, unique(event_id,id),unique(event_id,sort_index) deferrable initially deferred);
create table public.members(event_id uuid not null references public.events,user_id uuid not null references auth.users,role text not null check(role in ('operator','participant','judge')),team_id uuid,display_name text not null,primary key(event_id,user_id),foreign key(event_id,team_id) references public.teams(event_id,id),check((role='participant')=(team_id is not null)));
create table public.submissions(id uuid primary key,event_id uuid not null,team_id uuid not null,name text not null check(length(name)<=255),path text not null unique,pages integer not null check(pages between 1 and 500),bytes integer not null check(bytes between 1 and 20971520),created_at timestamptz not null default now(),foreign key(event_id,team_id) references public.teams(event_id,id),unique(event_id,id));
alter table public.teams add constraint team_submission foreign key(event_id,submission_id) references public.submissions(event_id,id);
create table public.rubrics(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events,version integer not null,items jsonb not null,unique(event_id,version),unique(event_id,id));
alter table public.events add constraint current_rubric foreign key(id,current_rubric_id) references public.rubrics(event_id,id);
create table public.sessions(id uuid primary key,event_id uuid not null,team_id uuid not null,submission_id uuid not null,settings jsonb not null,status text not null check(status in ('preparing','running','paused','ended')),current_page integer not null default 1,page_count integer not null,version integer not null default 1,started_at timestamptz,paused_at timestamptz,paused_ms bigint not null default 0 check(paused_ms>=0),ended_at timestamptz,foreign key(event_id,team_id) references public.teams(event_id,id),foreign key(event_id,submission_id) references public.submissions(event_id,id),check(current_page between 1 and page_count),check((status='paused')=(paused_at is not null)),check((status='ended')=(ended_at is not null)));
create unique index one_active_session on public.sessions(event_id) where status<>'ended';
create table public.assignments(event_id uuid not null,team_id uuid not null,judge_id uuid not null,primary key(event_id,team_id,judge_id),foreign key(event_id,team_id) references public.teams(event_id,id),foreign key(event_id,judge_id) references public.members(event_id,user_id));
create table public.evaluations(id uuid primary key default gen_random_uuid(),event_id uuid not null,team_id uuid not null,judge_id uuid not null,rubric_id uuid not null,scores jsonb not null default '{}',notes text not null default '' check(length(notes)<=5000),status text not null check(status in ('draft','submitted')),version integer not null default 1,updated_at timestamptz not null default now(),foreign key(event_id,team_id) references public.teams(event_id,id),foreign key(event_id,judge_id) references public.members(event_id,user_id),foreign key(event_id,rubric_id) references public.rubrics(event_id,id),unique(event_id,team_id,judge_id));
create table public.invitations(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events,email text not null,role text not null check(role in ('operator','participant','judge')),team_id uuid,display_name text not null,accepted boolean not null default false,foreign key(event_id,team_id) references public.teams(event_id,id),check((role='participant')=(team_id is not null)));
create unique index one_pending_invite on public.invitations(event_id,lower(email)) where not accepted;
create table public.request_receipts(event_id uuid not null references public.events,actor uuid not null references auth.users,request_id uuid not null,fingerprint text not null,result jsonb not null,primary key(event_id,actor,request_id));
create table public.event_updates(event_id uuid primary key references public.events,revision bigint not null default 1);

create function public.my_role(e uuid) returns text language sql stable security definer set search_path='' as $$ select role from public.members where event_id=e and user_id=auth.uid() $$;
create function public.can_team(e uuid,t uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members m where m.event_id=e and m.user_id=auth.uid() and (m.role='operator' or (m.role='participant' and m.team_id=t) or (m.role='judge' and exists(select 1 from public.assignments a where a.event_id=e and a.team_id=t and a.judge_id=m.user_id)))) $$;
create function public.can_pdf(object_path text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.submissions s where s.path=object_path and public.can_team(s.event_id,s.team_id)) $$;

do $$ declare t text; begin foreach t in array array['events','teams','members','submissions','rubrics','sessions','assignments','evaluations','invitations','request_receipts','event_updates'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t);end loop;end $$;
create policy event_read on public.events for select to authenticated using(public.my_role(id) is not null);
create policy team_read on public.teams for select to authenticated using(public.can_team(event_id,id));
create policy member_read on public.members for select to authenticated using(user_id=auth.uid() or public.my_role(event_id)='operator');
create policy submission_read on public.submissions for select to authenticated using(public.can_team(event_id,team_id));
create policy rubric_read on public.rubrics for select to authenticated using(public.my_role(event_id) is not null);
create policy session_read on public.sessions for select to authenticated using(public.can_team(event_id,team_id));
create policy assignment_read on public.assignments for select to authenticated using(judge_id=auth.uid() or public.my_role(event_id)='operator');
create policy evaluation_read on public.evaluations for select to authenticated using(judge_id=auth.uid() or public.my_role(event_id)='operator');
create policy invitation_read on public.invitations for select to authenticated using(public.my_role(event_id)='operator');
create policy receipt_read on public.request_receipts for select to authenticated using(actor=auth.uid());
create policy update_read on public.event_updates for select to authenticated using(public.my_role(event_id) is not null);

create function public.list_events() returns jsonb language sql stable security invoker set search_path='' as $$ select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name),'[]') from public.events e $$;
create function public.app_snapshot(p_event uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 if public.my_role(p_event) is null then raise exception '행사 접근 권한이 없습니다.';end if;
 select jsonb_build_object('event',to_jsonb(e),'me',(select to_jsonb(m) from public.members m where event_id=p_event and user_id=auth.uid()),'teams',(select coalesce(jsonb_agg(t order by sort_index),'[]') from public.teams t where event_id=p_event),'submissions',(select coalesce(jsonb_agg(t),'[]') from public.submissions t where event_id=p_event),'sessions',(select coalesce(jsonb_agg(t),'[]') from public.sessions t where event_id=p_event),'rubrics',(select coalesce(jsonb_agg(t),'[]') from public.rubrics t where event_id=p_event),'evaluations',(select coalesce(jsonb_agg(t),'[]') from public.evaluations t where event_id=p_event),'members',(select coalesce(jsonb_agg(t),'[]') from public.members t where event_id=p_event),'assignments',(select coalesce(jsonb_agg(t),'[]') from public.assignments t where event_id=p_event),'invitations',(select coalesce(jsonb_agg(t),'[]') from public.invitations t where event_id=p_event),'server_time',clock_timestamp()) into result from public.events e where id=p_event;return result;
end $$;

create function public.color_luminance(c text) returns numeric language plpgsql immutable set search_path='' as $$
declare rgb numeric[]='{}';i int;v numeric;begin if c !~ '^#[0-9a-fA-F]{6}$' then raise exception '유효하지 않은 색상입니다.';end if;for i in 0..2 loop v:=get_byte(decode(substr(c,2),'hex'),i)/255.0;rgb:=array_append(rgb,case when v<=0.04045 then v/12.92 else power((v+0.055)/1.055,2.4) end);end loop;return rgb[1]*0.2126+rgb[2]*0.7152+rgb[3]*0.0722;end $$;
create function public.check_settings(s jsonb) returns void language plpgsql immutable set search_path='' as $$
declare k text;c text;begin
 if jsonb_typeof(s) is distinct from 'object' then raise exception '유효하지 않은 타이머 설정입니다.';end if;
 if jsonb_typeof(s->'duration_seconds') is distinct from 'number' or jsonb_typeof(s->'warning_seconds') is distinct from 'number' or jsonb_typeof(s->'normal_color') is distinct from 'string' or jsonb_typeof(s->'warning_color') is distinct from 'string' or jsonb_typeof(s->'overtime_color') is distinct from 'string' then raise exception '설정 값의 형식이 올바르지 않습니다.';end if;
 if not(s ?& array['duration_seconds','warning_seconds','normal_color','warning_color','overtime_color']) or (s->>'duration_seconds') !~ '^[0-9]+$' or (s->>'warning_seconds') !~ '^[0-9]+$' or (s->>'duration_seconds')::int not between 10 and 7200 or (s->>'warning_seconds')::int not between 0 and (s->>'duration_seconds')::int then raise exception '발표 시간과 종료 임박 기준을 확인해 주세요.';end if;
 foreach k in array array['normal_color','warning_color','overtime_color'] loop c:=s->>k;if (public.color_luminance(c)+0.05)/(public.color_luminance('#121116')+0.05)<4.5 then raise exception '타이머 색상 대비는 4.5:1 이상이어야 합니다.';end if;end loop;
end $$;
create function public.check_items(items jsonb) returns void language plpgsql immutable set search_path='' as $$
declare i jsonb;begin if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 20 then raise exception '평가 항목은 1~20개입니다.';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(items)x)<>jsonb_array_length(items) then raise exception '중복 평가 항목입니다.';end if;
 for i in select * from jsonb_array_elements(items) loop if jsonb_typeof(i->'id') is distinct from 'string' or coalesce(i->>'id','') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' or jsonb_typeof(i->'name') is distinct from 'string' or jsonb_typeof(i->'description') is distinct from 'string' or length(i->>'description')>500 or not(i ?& array['id','name','description','max']) or length(trim(i->>'name')) not between 1 and 80 or jsonb_typeof(i->'max')<>'number' or (i->>'max')::numeric not between 0.01 and 1000 then raise exception '평가 항목과 배점을 확인해 주세요.';end if;end loop;
end $$;

create function public.create_event(p_name text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e uuid:=p_request;r uuid:=gen_random_uuid();begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 if exists(select 1 from public.events where id=e) then if public.my_role(e)='operator' then return e;else raise exception '요청이 충돌했습니다.';end if;end if;
 insert into public.events(id,name) values(e,trim(p_name));insert into public.members values(e,auth.uid(),'operator',null,coalesce(auth.jwt()->>'email','운영자'));
 insert into public.rubrics values(r,e,1,'[{"id":"innovation","name":"혁신성","description":"차별성과 참신함","max":30},{"id":"feasibility","name":"실현 가능성","description":"구현 계획과 완성도","max":30},{"id":"impact","name":"사업성","description":"성장 가능성","max":25},{"id":"delivery","name":"전달력","description":"발표의 명확성","max":15}]');update public.events set current_rubric_id=r where id=e;insert into public.event_updates(event_id)values(e);return e;
end $$;
create function public.accept_invitation(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.invitations;begin select * into inv from public.invitations where id=p_id for update;
 if inv.id is null or auth.uid() is null or lower(inv.email)<>lower(coalesce(auth.jwt()->>'email','')) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception '초대 이메일로 로그인해야 합니다.';end if;
 if inv.accepted then if public.my_role(inv.event_id) is not null then return inv.event_id;end if;raise exception '사용된 초대입니다.';end if;
 insert into public.members values(inv.event_id,auth.uid(),inv.role,inv.team_id,inv.display_name);update public.invitations set accepted=true where id=p_id;update public.event_updates set revision=revision+1 where event_id=inv.event_id;return inv.event_id;
end $$;

create function public.app_command(p_event uuid,p_request uuid,p_kind text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if coalesce(p->>'email','') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(coalesce(p->>'display_name','')) not between 1 and 80 then raise exception '이메일과 이름을 확인해 주세요.';end if;
 insert into public.invitations(id,event_id,email,role,team_id,display_name)values((p->>'id')::uuid,p_event,lower(trim(p->>'email')),p->>'role',case when p->>'role'='participant' then t.id else null end,p->>'display_name');
 when 'assign' then
 if not exists(select 1 from public.members where event_id=p_event and user_id=(p->>'judge_id')::uuid and role='judge') then raise exception '행사 심사위원이 아닙니다.';end if;
 delete from public.assignments where event_id=p_event and team_id=t.id and judge_id=(p->>'judge_id')::uuid;
 if (p->>'assigned')::boolean then insert into public.assignments values(p_event,t.id,(p->>'judge_id')::uuid);end if;
 else raise exception '지원하지 않는 요청입니다.';
 end case;
 insert into public.request_receipts values(p_event,auth.uid(),p_request,fp,result);update public.event_updates set revision=revision+1 where event_id=p_event;return result;
end $$;

-- Only the Edge function, after parsing the complete file, may finalize it.
create function public.finalize_submission(p_actor uuid,p_event uuid,p_team uuid,p_previous uuid,p_id uuid,p_name text,p_path text,p_pages int,p_bytes int)returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.members;t public.teams;sub public.submissions;begin
 perform 1 from public.events where id=p_event for update;
 select * into m from public.members where event_id=p_event and user_id=p_actor;
 if m.user_id is null or not(m.role='operator' or(m.role='participant' and m.team_id=p_team)) then raise exception '제출 권한이 없습니다.';end if;
 select * into t from public.teams where event_id=p_event and id=p_team;if t.id is null then raise exception '팀을 찾을 수 없습니다.';end if;
 select * into sub from public.submissions where id=p_id;if found then if sub.team_id<>p_team or sub.event_id<>p_event or sub.path<>p_path then raise exception '요청이 충돌했습니다.';end if;return to_jsonb(sub);end if;
 if t.submission_id is distinct from p_previous then raise exception '제출본이 변경되었습니다. 새로 확인해 주세요.';end if;
 if p_path not like p_event::text||'/'||p_team::text||'/%' then raise exception '잘못된 저장 경로입니다.';end if;
 insert into public.submissions(id,event_id,team_id,name,path,pages,bytes)values(p_id,p_event,p_team,p_name,p_path,p_pages,p_bytes) returning * into sub;
 update public.teams set submission_id=p_id where id=p_team;update public.event_updates set revision=revision+1 where event_id=p_event;return to_jsonb(sub);
end $$;
revoke all on function public.finalize_submission(uuid,uuid,uuid,uuid,uuid,text,text,int,int) from public,anon,authenticated;
grant execute on function public.finalize_submission(uuid,uuid,uuid,uuid,uuid,text,text,int,int) to service_role;
-- Explicit execute grants; helpers cannot be called anonymously.
do $$ declare fn record;begin for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('my_role','can_team','can_pdf','list_events','app_snapshot','color_luminance','check_settings','check_items','create_event','accept_invitation','app_command')loop execute format('revoke all on function %s from public,anon',fn.signature);execute format('grant execute on function %s to authenticated',fn.signature);end loop;end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('presentations','presentations',false,20971520,array['application/pdf']) on conflict(id)do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
create policy presentation_read on storage.objects for select to authenticated using(bucket_id='presentations' and public.can_pdf(name));
-- No browser INSERT/UPDATE/DELETE policy: service-role Edge upload only.
alter publication supabase_realtime add table public.event_updates;
