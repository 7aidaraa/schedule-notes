-- بطاقة المعلم وطبقات القيود — مواصفة 2026-10-12. أعمدة وجدول جديدان فقط، لا حذف.
-- ما تقوله ورقة «المعلمون» في الشيت عن كل معلم (تُحدَّث بزر «استيراد CSV المعلمين»، لا ربط آلي):
alter table teachers add column if not exists subject text not null default '';      -- المادة
alter table teachers add column if not exists subject2 text not null default '';     -- مادة ثانية
alter table teachers add column if not exists category text not null default '';     -- الفئة (رئيس قسم بقيود صلبة → رؤساء الأقسام، معلم بقيود إدارية → إداريّون)
alter table teachers add column if not exists wing_sup boolean not null default false; -- مشرف جناح؟ (→ مشرفو الأجنحة)

-- الظروف: مجموعات معلمين تسمّيها المنصة وحدها؛ قيودها في constraints بـ target_type = 'ظرف'،
-- وتُصدَّر صفاً بهدف «معلّم» لكل عضو.
create table if not exists constraint_groups (
  name text primary key,
  members text not null default '',   -- أسماء الشهرة مفصولة بـ«،»
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table constraint_groups enable row level security; -- الوصول عبر الدالة فقط
