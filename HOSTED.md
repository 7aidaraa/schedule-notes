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
