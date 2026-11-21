-- 신혼집 평면 모델러: Supabase 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 실행하세요.

-- 1) 방·사진 핀·설정을 담는 테이블 (project 별로 분리)
create table if not exists public.items (
  project    text not null,
  kind       text not null check (kind in ('rooms','pins','meta')),
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (project, kind, id)
);

-- 2) 수정 이력 (누가 언제 무엇을 바꿨는지 되돌려 볼 수 있게)
create table if not exists public.items_history (
  seq        bigserial primary key,
  project    text not null,
  kind       text not null,
  id         text not null,
  op         text not null,
  data       jsonb,
  changed_at timestamptz not null default now()
);

create or replace function public.log_item_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into items_history(project, kind, id, op, data) values (old.project, old.kind, old.id, 'delete', old.data);
    return old;
  end if;
  insert into items_history(project, kind, id, op, data) values (new.project, new.kind, new.id, lower(tg_op), new.data);
  return new;
end $$;

drop trigger if exists items_history_trg on public.items;
create trigger items_history_trg after insert or update or delete on public.items
for each row execute function public.log_item_change();

-- 3) 접근 권한: 링크(프로젝트 키)를 아는 사람은 로그인 없이 읽고 고칠 수 있어요.
--    더 엄격하게 하려면 나중에 Supabase Auth(이메일 로그인)로 바꿀 수 있어요.
alter table public.items enable row level security;
alter table public.items_history enable row level security;

drop policy if exists items_anon_all on public.items;
create policy items_anon_all on public.items for all to anon, authenticated using (true) with check (true);

drop policy if exists items_history_read on public.items_history;
create policy items_history_read on public.items_history for select to anon, authenticated using (true);

-- 새 Supabase 프로젝트는 테이블 권한을 자동으로 주지 않아서 명시적으로 부여해요.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.items to anon, authenticated;
grant select on public.items_history to anon, authenticated;

-- 4) 실시간 동기화 켜기 (다른 사람이 고친 내용이 바로 보이게)
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

-- 5) 사진 저장소 (비공개 버킷, 서명된 URL 로만 보기)
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists photos_anon_read on storage.objects;
create policy photos_anon_read on storage.objects for select to anon, authenticated using (bucket_id = 'photos');
drop policy if exists photos_anon_write on storage.objects;
create policy photos_anon_write on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
drop policy if exists photos_anon_update on storage.objects;
create policy photos_anon_update on storage.objects for update to anon, authenticated using (bucket_id = 'photos');
