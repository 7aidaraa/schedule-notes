-- اعتماد الإدارة لكل قيد في المنصة الجديدة (قرار صاحب المنصة 2026-10-12): كل القيود تبدأ «غير معتمد».
alter table constraints add column if not exists approved boolean not null default false;
