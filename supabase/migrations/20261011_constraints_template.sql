-- قالب القيود بلفظ ورقة «القيود» في ملف الجدول (القسم الثالث، الأعمدة A–I) — مواصفة 2026-10-11.
-- أعمدة جديدة فقط، لا حذف: الأعمدة القديمة (section, scope, mode, teacher, checked, sheet_how, sheet_tip) تبقى بلا استعمال.
alter table constraints add column if not exists target_type text not null default '';   -- A: معلّم · مادّة · دور · بارامتر
alter table constraints add column if not exists target text not null default '';        -- B: اسم الشهرة · المادّة · الدور · اسم البارامتر
alter table constraints add column if not exists ctype text not null default '';         -- C: نوع القيد (من الشيت أو مقترح)
alter table constraints add column if not exists pattern text not null default '';       -- D: «متتاليتان» أو فارغ
alter table constraints add column if not exists value text not null default '';         -- E: بصيغة الشيت
alter table constraints add column if not exists weight int;                             -- G: لـ«مرن موزون»
alter table constraints add column if not exists active boolean not null default true;   -- H: مفعَّل
alter table constraints add column if not exists duration text not null default 'شبه دائمة'; -- دائمة · شبه دائمة · مؤقتة
alter table constraints add column if not exists sheet_state text not null default 'غير مسجّل'; -- مسجّل · خامل · غير مسجّل · نوع مقترح
alter table constraints add column if not exists link_id bigint references constraints(id) on delete set null; -- قيدان من طلب واحد
-- level = F (صلب · مرن موزون)، reason = I (ملاحظة)، department = القسم للتجميع، text = سطر العرض.

-- الأنواع التي تقترحها المنصة ولم تُضف إلى الشيت بعد.
create table if not exists constraint_types (
  name text primary key,
  targets text not null default 'معلّم',  -- أنواع الهدف التي يقبلها، مفصولة بـ«،»
  explain text not null default '',       -- شرحه لمطور الشيت
  created_at timestamptz not null default now()
);
alter table constraint_types enable row level security; -- الوصول عبر الدالة فقط
