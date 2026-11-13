-- Participant codes grant a single team's participant role, never an operator role.
alter table public.teams add column leader_name text not null default '' check(length(leader_name)<=80);
alter table public.teams add column member_names text[] not null default '{}' check(cardinality(member_names)<=30);
alter table public.submissions add column team_profile jsonb;

create table public.participant_codes (
  team_id uuid primary key references public.teams(id),
  event_id uuid not null references public.events(id),
  code_hash text not null unique,
  expires_at timestamptz not null,
  foreign key(event_id,team_id) references public.teams(event_id,id)
);
create table public.code_attempts (
  user_id uuid primary key references auth.users(id),
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.participant_codes enable row level security;
alter table public.code_attempts enable row level security;
revoke all on public.participant_codes, public.code_attempts from public, anon, authenticated;

create function public.issue_participant_code(p_event uuid,p_team uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code text:=upper(replace(gen_random_uuid()::text,'-','')); expiry timestamptz:=clock_timestamp()+interval '7 days';
begin
  perform 1 from public.events where id=p_event for update;
  if public.my_role(p_event) is distinct from 'operator' then raise exception '운영자만 코드를 발급할 수 있습니다.';end if;
  if not exists(select 1 from public.teams where id=p_team and event_id=p_event) then raise exception '팀을 찾을 수 없습니다.';end if;
  insert into public.participant_codes(team_id,event_id,code_hash,expires_at)
  values(p_team,p_event,encode(sha256(convert_to(code,'UTF8')),'hex'),expiry)
  on conflict(team_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('code',code,'expires_at',expiry);
end $$;

create function public.redeem_participant_code(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.participant_codes; m public.members; n integer; stamp timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception '인증 세션이 필요합니다.';end if;
  -- Return errors as data so failed attempts commit and cannot roll back the throttle.
  insert into public.code_attempts values(auth.uid(),stamp,1)
  on conflict(user_id) do update set
    attempts=case when public.code_attempts.window_start<stamp-interval '1 minute' then 1 else public.code_attempts.attempts+1 end,
    window_start=case when public.code_attempts.window_start<stamp-interval '1 minute' then stamp else public.code_attempts.window_start end
  returning attempts into n;
  if n>10 then return jsonb_build_object('error','시도 횟수를 초과했습니다. 1분 후 다시 입력해 주세요.');end if;
  select * into c from public.participant_codes
  where code_hash=encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code,''),'[-[:space:]]','','g')),'UTF8')),'hex') and expires_at>stamp for share;
  if c.team_id is null then return jsonb_build_object('error','코드가 올바르지 않거나 만료되었습니다. 운영자에게 확인해 주세요.');end if;
  select * into m from public.members where event_id=c.event_id and user_id=auth.uid();
  if m.user_id is not null and (m.role<>'participant' or m.team_id<>c.team_id) then
    return jsonb_build_object('error','다른 역할이나 팀으로 접속 중입니다. 로그아웃 후 다시 입력해 주세요.');
  end if;
  insert into public.members(event_id,user_id,role,team_id,display_name)
  values(c.event_id,auth.uid(),'participant',c.team_id,'팀 참여자') on conflict(event_id,user_id) do nothing;
  -- A concurrent redemption for another team must not report success.
  if not exists(select 1 from public.members where event_id=c.event_id and user_id=auth.uid() and role='participant' and team_id=c.team_id) then
    return jsonb_build_object('error','다른 팀 코드가 먼저 적용되었습니다. 로그아웃 후 다시 시도해 주세요.');
  end if;
  update public.event_updates set revision=revision+1 where event_id=c.event_id;
  return jsonb_build_object('event_id',c.event_id,'team_id',c.team_id);
end $$;

create function public.check_team_profile(p jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare member jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or jsonb_typeof(p->'name') is distinct from 'string'
    or length(trim(p->>'name')) not between 1 and 80
    or jsonb_typeof(p->'leader_name') is distinct from 'string'
    or length(trim(p->>'leader_name')) not between 1 and 80
    or jsonb_typeof(p->'member_names') is distinct from 'array' then
    raise exception '팀명, 팀장 이름과 팀원 목록을 확인해 주세요.';
  end if;
  if jsonb_array_length(p->'member_names')>30 then raise exception '팀원은 최대 30명입니다.';end if;
  for member in select * from jsonb_array_elements(p->'member_names') loop
    if jsonb_typeof(member)<>'string' or length(trim(member #>> '{}')) not between 1 and 80 then raise exception '팀원 이름은 1~80자입니다.';end if;
  end loop;
end $$;

-- Extend the existing atomic file swap, including profile changes in that transaction.
create function public.finalize_submission_with_profile(
 p_actor uuid,p_event uuid,p_team uuid,p_previous uuid,p_id uuid,p_name text,p_path text,p_pages int,p_bytes int,p_profile jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.submissions; result jsonb;
begin
  perform public.check_team_profile(p_profile);
  perform 1 from public.events where id=p_event for update;
  select * into prior from public.submissions where id=p_id;
  -- Existing function owns authorization, scope validation and submission CAS.
  result:=public.finalize_submission(p_actor,p_event,p_team,p_previous,p_id,p_name,p_path,p_pages,p_bytes);
  if prior.id is not null then
    if prior.team_profile is distinct from p_profile then raise exception '같은 제출 요청의 팀 정보가 다릅니다.';end if;
    return result;
  end if;
  update public.submissions set team_profile=p_profile where id=p_id;
  update public.teams set name=trim(p_profile->>'name'),leader_name=trim(p_profile->>'leader_name'),
    member_names=array(select trim(x) from jsonb_array_elements_text(p_profile->'member_names') x)
    where id=p_team and event_id=p_event;
  return result||jsonb_build_object('team_profile',p_profile);
end $$;
revoke all on function public.finalize_submission_with_profile(uuid,uuid,uuid,uuid,uuid,text,text,int,int,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_submission_with_profile(uuid,uuid,uuid,uuid,uuid,text,text,int,int,jsonb) to service_role;

-- Anonymous code sessions cannot create operator-owned events.
alter function public.create_event(text,uuid) rename to create_event_verified;
revoke all on function public.create_event_verified(text,uuid) from public,anon,authenticated;
create function public.create_event(p_name text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception '운영자는 이메일 인증 후 행사를 만들 수 있습니다.';end if;
  return public.create_event_verified(p_name,p_request);
end $$;
revoke all on function public.create_event(text,uuid) from public,anon;
grant execute on function public.create_event(text,uuid) to authenticated;
revoke all on function public.issue_participant_code(uuid,uuid),public.redeem_participant_code(text),public.check_team_profile(jsonb) from public,anon;
grant execute on function public.issue_participant_code(uuid,uuid),public.redeem_participant_code(text) to authenticated;
