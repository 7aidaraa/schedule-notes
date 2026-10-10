-- «القيود» قائمة واحدة مرتبة آلياً (2026-10-10): النطاق والنوع لكل قيد، وسببه، وكيف هو في الشيت، والمقترح.
alter table constraints add column if not exists scope text not null default 'فردي';   -- عام · فردي
alter table constraints add column if not exists mode text not null default 'يدوي';    -- آلي · يدوي
alter table constraints add column if not exists reason text not null default '';
alter table constraints add column if not exists sheet_how text not null default '';  -- صفوف ورقة «القيود» التي تطبّقه، حرفياً
alter table constraints add column if not exists sheet_tip text not null default '';  -- المقترح [صياغة كلود]
update constraints set scope = case when section in ('الآلي العام', 'اليدوي العام') then 'عام' else 'فردي' end,
                       mode  = case when section in ('الآلي العام', 'الآلي الفردي') then 'آلي' else 'يدوي' end;
update constraints set reason = 'طلب المدير' where reason = '' and text like '%طلب المدير%';
update constraints c set reason = r.reason from requests r where c.request_id = r.id and c.reason = '';
