# صفحة الميزانيات في ملف HTML واحد

تبني من نسخة كود المهارة (`skills/school-budgets/assets/code/web/`، فالميزانيات حُذفت من المنصة 2026-10-11) والشعارين في `tools/single-page/assets/` ومن ملف البيانات (`school-budgets-data.json`، صيغة مهارة school-budgets) صفحة واحدة مكتفية بنفسها:
الكود والمكتبات والخط والشعاران والبيانات كلها داخل الملف.

```bash
python3 tools/single-page/build.py . school-budgets-data.json tools/single-page/backend.js ميزانيات_الأقسام.html
```

- `backend.js` يستبدل `call()`: بلا إعداد يعمل على البيانات المضمّنة ويحفظ في المتصفح، ومع `CONFIG.firebase` يعمل على Firestore (`budgets` + عقد `budget_rows`).
- ملف البيانات والصفحة الناتجة فيهما أسماء المعلمين: لا يُحفظان في المستودع.
- بعد البناء: اختبر الوضعين (مستقل، وFirebase وهمي) قبل الإرسال.
