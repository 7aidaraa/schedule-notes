-- «قيود الجدول»: checklist the admin ticks after each timetable export.
-- Rows come from the sheet's «القيود بلغة عرفية (حيدر)» (seed file) or from a request's constraint field.
create table if not exists constraints (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  pos int not null default 1000000,          -- sheet order; request rows sort after it
  section text not null,                     -- الآلي العام · الآلي الفردي · اليدوي العام · اليدوي الفردي · مسودة · من الطلبات
  department text not null default '',
  teacher text not null default '',
  text text not null,
  level text not null default '',            -- صلب · مرن · لازم · مُفضَّل ...
  checked boolean not null default false,
  request_id uuid unique references requests(id) on delete set null
);
alter table constraints enable row level security; -- access only through the function (service role)
