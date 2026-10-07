# النسخة المنشورة

- الرابط: https://teacher-requests.onrender.com
- الواجهة: `web/` (موقع ثابت على Render، يُنشر تلقائياً من هذا الفرع)
- الخادم: `supabase/functions/api` (مشروع Supabase باسم teacher-requests)
- البيانات: جدول `requests`، والمرفقات في مخزن خاص اسمه `attachments`
- كلمات السر: في جدول `settings`. كلمة المعلم نص صريح، وكلمة المدير محفوظة كبصمة SHA-256.

تغيير كلمة المدير (من SQL Editor في Supabase):
```sql
update settings set value = encode(sha256(convert_to('كلمة_جديدة','UTF8')),'hex') where key='admin_pass_sha256';
```

## الحقول (أكتوبر 2026)
- القسم العلمي والاسم: قائمتان مقترحتان مع إمكان الكتابة اليدوية، تأتيان من جدول `teachers` بعد كلمة سر المعلم فقط (لا تظهر الأسماء في الصفحة العامة). المصدر: «جدول المعلّمين.pdf» في Drive.
- الصفة تُحدَّد آلياً من `teachers.is_head` (رؤساء الأقسام = من في جدولهم «اجتماع رؤساء الأقسام»)، ويحددها الخادم لا النموذج.
- رئيس القسم وحده تظهر له خانة «ميزانية القسم» (ملف واحد يُحفظ مع أول طلب).
- عدة طلبات في إرسال واحد؛ كل طلب بسببه ويُحفظ صفاً مستقلاً.
- رقم الهاتف إلزامي (8 أرقام، عربية أو إنجليزية). كل إرسال يحدّث جدول `contacts` (آخر رقم لكل اسم)، ويظهر في تبويب «أرقام المعلمين» مع زر واتساب، ويبقى حتى لو حُذفت الطلبات.

تحديث قائمة المعلمين (SQL Editor):
```sql
insert into teachers(name,department) values ('الاسم','القسم') on conflict (name) do update set department=excluded.department;
delete from teachers where name='الاسم';
update teachers set is_head = true where name='الاسم';   -- تعيين رئيس قسم
```

## الهوية البصرية
- منصة شخصية: لا شعار ولا اسم مدرسة ولا اسم شخص. أيقونة تقويم محايدة (SVG داخل الصفحة، و`web/assets/icon.png` للمتصفح).
- الألوان: كحلي `#0b3a5a`، أزرق `#155375`، سماوي `#227ba7`، وذهبي `#c9962e` للتمييز.
- الخط: IBM Plex Sans Arabic محفوظ داخل الموقع (`web/assets/fonts`).
