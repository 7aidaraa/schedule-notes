-- إعادة بناء «التغطية» في المنصة الجديدة — مواصفة 2026-10-13 (docs/مواصفة_2026-10-13.md).
-- المنصة القديمة (target_type = '') لا تُمسّ، ولا قيود 1105–1109 التي تعرضها «المنصة القديمة» في «حُوّلت اليوم».

-- الأدوار مجموعات كالظروف: kind = 'دور' أو 'ظرف'، و parent للدور الفرعي (الجناح تحت «مشرفو الأجنحة»).
alter table constraint_groups add column if not exists kind text not null default 'ظرف';
alter table constraint_groups add column if not exists parent text not null default '';
-- صياغة الشيت: يكتبها صاحب المنصة بيده تحت كل قيد في «القائمة».
alter table constraints add column if not exists sheet_text text not null default '';

-- البداية من الصفر (أسئلة 10–12): قيود المنصة الجديدة وظروفها وأنواعها المقترحة.
delete from constraints where target_type <> '' and id not in (1105, 1106, 1107, 1108, 1109);
delete from constraint_groups;
delete from constraint_types;

-- الأدوار الثلاثة والأجنحة الأربعة، بلا أعضاء.
insert into constraint_groups (name, kind, parent, created_at) values
  ('رؤساء الأقسام', 'دور', '', now()),
  ('مشرفو الأجنحة', 'دور', '', now() + interval '1 second'),
  ('جناح العاشر 1', 'دور', 'مشرفو الأجنحة', now() + interval '2 second'),
  ('جناح العاشر 2', 'دور', 'مشرفو الأجنحة', now() + interval '3 second'),
  ('جناح الحادي عشر', 'دور', 'مشرفو الأجنحة', now() + interval '4 second'),
  ('جناح الثاني عشر', 'دور', 'مشرفو الأجنحة', now() + interval '5 second'),
  ('إداريّون', 'دور', '', now() + interval '6 second');
