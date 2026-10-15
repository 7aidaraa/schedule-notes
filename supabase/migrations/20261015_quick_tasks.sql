-- صفحة «مهام سريعة» (مواصفة 2026-10-15): قائمة مهام قبل تصدير الجدول؛ تُقرأ وتُشطب من المنصة، ويحدّثها كلود ببذرة.
create table if not exists quick_tasks (
  id int primary key,
  sec text not null check (sec in ('ب', 'ج', 'د')),
  pos int not null,
  title text not null,
  body text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table quick_tasks enable row level security;
