-- ============================================================
--  在英中资企业优秀成果评审 · Supabase 数据库初始化脚本
--  用法：Supabase 项目 → SQL Editor → New query → 粘贴全文 → Run
--  只需运行一次。运行前请把最后一行的 管理密钥 改成你自己的（至少 12 位）。
-- ============================================================

-- ---------- 表 ----------
create table if not exists cases (
  id       text primary key,          -- 案例编号，如 02.1
  company  text not null,
  title    text not null,
  sort     int  not null default 0
);

create table if not exists jurors (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null default replace(gen_random_uuid()::text, '-', ''),
  name         text not null,
  org          text,
  recuse       text[] not null default '{}',   -- 需回避的申报单位名称
  submitted_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists scores (
  juror_id   uuid not null references jurors(id) on delete cascade,
  case_id    text not null references cases(id) on delete cascade,
  d1 numeric(4,1), d2 numeric(4,1), d3 numeric(4,1),
  d4 numeric(4,1), d5 numeric(4,1), d6 numeric(4,1),
  updated_at timestamptz not null default now(),
  primary key (juror_id, case_id)
);

create table if not exists settings (
  id        int primary key default 1 check (id = 1),
  admin_key text not null
);

-- ---------- 权限：表不对外开放，只能通过下面的函数访问 ----------
alter table cases    enable row level security;
alter table jurors   enable row level security;
alter table scores   enable row level security;
alter table settings enable row level security;
revoke all on cases, jurors, scores, settings from anon, authenticated;

-- ---------- 工具函数 ----------
create or replace function _juror(p_token text) returns jurors
language plpgsql security definer set search_path = public as $$
declare j jurors;
begin
  select * into j from jurors where token = p_token;
  if not found then raise exception 'INVALID_LINK'; end if;
  return j;
end $$;

create or replace function _admin(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or not exists (select 1 from settings where admin_key = p_key) then
    raise exception 'INVALID_ADMIN_KEY';
  end if;
end $$;

-- ---------- 评委端 ----------
create or replace function judge_load(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare j jurors;
begin
  j := _juror(p_token);
  return json_build_object(
    'juror',  json_build_object('name', j.name, 'org', j.org, 'recuse', j.recuse, 'submitted_at', j.submitted_at),
    'scores', coalesce((select json_agg(json_build_object('case_id', case_id,
                 'd1', d1, 'd2', d2, 'd3', d3, 'd4', d4, 'd5', d5, 'd6', d6))
               from scores where juror_id = j.id), '[]'::json));
end $$;

create or replace function judge_save(p_token text, p_case text, p_scores jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  j jurors; c cases;
  maxes int[] := array[30,25,15,10,15,5];
  v numeric[] := array[]::numeric[];
  x numeric; i int;
begin
  j := _juror(p_token);
  if j.submitted_at is not null then raise exception 'ALREADY_SUBMITTED'; end if;
  select * into c from cases where id = p_case;
  if not found then raise exception 'UNKNOWN_CASE'; end if;
  if c.company = any(j.recuse) then raise exception 'RECUSED'; end if;
  for i in 1..6 loop
    x := nullif(p_scores ->> ('d' || i), '')::numeric;
    if x is not null and (x < 0 or x > maxes[i] or x <> round(x, 1)) then
      raise exception 'OUT_OF_RANGE d%', i;
    end if;
    v := array_append(v, x);
  end loop;
  insert into scores (juror_id, case_id, d1, d2, d3, d4, d5, d6, updated_at)
  values (j.id, p_case, v[1], v[2], v[3], v[4], v[5], v[6], now())
  on conflict (juror_id, case_id) do update set
    d1 = excluded.d1, d2 = excluded.d2, d3 = excluded.d3,
    d4 = excluded.d4, d5 = excluded.d5, d6 = excluded.d6, updated_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function judge_submit(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare j jurors; need int; done int;
begin
  j := _juror(p_token);
  if j.submitted_at is not null then return json_build_object('ok', true); end if;
  select count(*) into need from cases where not (company = any(j.recuse));
  select count(*) into done from scores s join cases c on c.id = s.case_id
   where s.juror_id = j.id and not (c.company = any(j.recuse))
     and s.d1 is not null and s.d2 is not null and s.d3 is not null
     and s.d4 is not null and s.d5 is not null and s.d6 is not null;
  if done < need then raise exception 'INCOMPLETE % / %', done, need; end if;
  update jurors set submitted_at = now() where id = j.id;
  return json_build_object('ok', true);
end $$;

-- ---------- 秘书处后台 ----------
create or replace function admin_load(p_key text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin(p_key);
  return json_build_object(
    'jurors', coalesce((select json_agg(row_to_json(j) order by j.created_at) from jurors j), '[]'::json),
    'scores', coalesce((select json_agg(row_to_json(s)) from scores s), '[]'::json),
    'cases',  coalesce((select json_agg(row_to_json(c) order by c.sort) from cases c), '[]'::json));
end $$;

create or replace function admin_sync_cases(p_key text, p_cases jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  perform _admin(p_key);
  for r in select * from jsonb_array_elements(p_cases) loop
    n := n + 1;
    insert into cases (id, company, title, sort)
    values (r->>'id', r->>'company', r->>'title', n)
    on conflict (id) do update set company = excluded.company, title = excluded.title, sort = excluded.sort;
  end loop;
  delete from cases where id not in (select x->>'id' from jsonb_array_elements(p_cases) x);
  return json_build_object('ok', true, 'count', n);
end $$;

create or replace function admin_save_juror(p_key text, p_id uuid, p_name text, p_org text, p_recuse text[]) returns json
language plpgsql security definer set search_path = public as $$
declare j jurors;
begin
  perform _admin(p_key);
  if p_id is null then
    insert into jurors (name, org, recuse) values (p_name, p_org, coalesce(p_recuse, '{}')) returning * into j;
  else
    update jurors set name = p_name, org = p_org, recuse = coalesce(p_recuse, '{}') where id = p_id returning * into j;
  end if;
  return row_to_json(j);
end $$;

create or replace function admin_delete_juror(p_key text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin(p_key);
  delete from jurors where id = p_id;
  return json_build_object('ok', true);
end $$;

create or replace function admin_unlock(p_key text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin(p_key);
  update jurors set submitted_at = null where id = p_id;
  return json_build_object('ok', true);
end $$;

-- 只开放函数给网页调用
revoke all on function _juror(text), _admin(text) from public, anon, authenticated;
grant execute on function judge_load(text), judge_save(text, text, jsonb), judge_submit(text),
  admin_load(text), admin_sync_cases(text, jsonb), admin_save_juror(text, uuid, text, text, text[]),
  admin_delete_juror(text, uuid), admin_unlock(text, uuid)
  to anon;

-- ---------- 管理密钥（请修改！秘书处后台用它登录） ----------
insert into settings (id, admin_key) values (1, '请改成你自己的管理密钥')
on conflict (id) do update set admin_key = excluded.admin_key;
