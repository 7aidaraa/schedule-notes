#!/usr/bin/env python3
"""Build one self-contained HTML page of the budgets section from web/ + the data file.
Usage: python3 build.py <repo> <data.json> <backend.js> <out.html>"""
import base64
import json
import re
import sys

repo, data_path, backend_path, out = sys.argv[1:5]
# The platform no longer carries the budgets (2026-10-11): the code comes from the skill's copy, the logos from here.
W = repo + '/skills/school-budgets/assets/code/web/'
L = repo + '/tools/single-page/assets/'
read = lambda p: open(p, encoding='utf-8').read()
b64 = lambda p, mime: 'data:' + mime + ';base64,' + base64.b64encode(open(p, 'rb').read()).decode()
# Inline scripts must not close their own <script> tag.
js = lambda s: s.replace('</script', '<\\/script')

data = json.load(open(data_path, encoding='utf-8'))
school = data['school']
school['form']['logos'] = {'ministry': b64(L + 'moe.jpeg', 'image/jpeg'), 'school': b64(L + 'school.png', 'image/png')}

html = read(W + 'index.html')
html = html.replace('url(assets/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2)', 'url(' + b64(W + 'assets/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', 'font/woff2') + ')')
html = html.replace('url(assets/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2)', 'url(' + b64(W + 'assets/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2', 'font/woff2') + ')')
html = re.sub(r'<link rel="preload"[^>]*>\n', '', html)
icon = b64(W + 'assets/icon.png', 'image/png')
html = html.replace('href="assets/icon.png"', 'href="' + icon + '"')
html = re.sub(r'<title>.*?</title>', '<title>ميزانيات الأقسام</title>', html)
html = re.sub(r'<h1>.*?</h1>', '<h1>ميزانيات الأقسام</h1>', html)
html = html.replace('<div class="school">أرسل ملاحظتك على الجدول</div>', '<div class="school">ميزانية كل قسم: من يدرّس أي شعبة، وكم حصة</div>')

# Only the budgets: hide the notes platform's tabs, request form and attachments.
hide = '''
  /* صفحة الميزانيات وحدها: تُخفى أجزاء منصة الملاحظات (الطلبات، القيود، الهواتف) وكلمة السر */
  #tabRules, #tabReq, #tabAdd, #tabBook, #rules, #reqView, #book, #schoolFiles,
  #items, #addBtn, #teacher > .card:has(#phone), #budget details, #budget > p.lead, #formAsk,
  #login label, #login #pass, #login .row, #login .lead { display:none !important; }
  .localBar { margin:0 0 12px; padding:8px 12px; border-radius:10px; background:#eef3f7; font-size:13px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
</style>'''
html = html.replace('</style>', hide, 1)
html = html.replace('<section id="login" class="card">\n    <h2>الدخول</h2>', '<section id="login" class="card">\n    <h2>جارٍ الدخول...</h2>', 1)
bar = '''<main>
  <div id="localBar" class="localBar hidden"><span>تعمل الصفحة مستقلة: التعديلات محفوظة في هذا المتصفح.</span><button id="localExport" class="ghost" type="button">تنزيل ملف البيانات المحدَّث</button><button id="localReset" class="ghost" type="button">الرجوع إلى البيانات الأصلية</button></div>'''
html = html.replace('<main>', bar, 1)

dataset = {k: data[k] for k in ('format', 'version', 'exported', 'teachers', 'budgets')}
scripts = [
    '<script type="application/json" id="budgetData">' + json.dumps(dataset, ensure_ascii=False).replace('</', '<\\/') + '</script>',
    '<script>' + js(read(W + 'vendor/exceljs-4.4.0.min.js')) + '</script>',
    '<script>' + js(read(W + 'vendor/html2canvas-1.4.1.min.js')) + '</script>',
    '<script>' + js(read(W + 'vendor/jspdf-2.5.1.umd.min.js')) + '</script>',
    '<script>\nconst SCHOOL_DATA = ' + json.dumps(school, ensure_ascii=False) + ';\n</script>',
    '<script>\n' + js(re.sub(r"^const API = .*$", "const API = ''; // not used: call() is replaced below", read(W + 'app.js'), count=1, flags=re.M)) + '</script>',
    '<script>\n' + js(read(W + 'form.js')) + '</script>',
    '<script>\n' + js(read(W + 'table.js')) + '</script>',
    '<script>\n' + js(read(backend_path)) + '</script>',
]
tags = '<script src="school-data.js"></script>\n<script src="app.js"></script>\n<script src="form.js"></script>\n<script src="table.js"></script>'
assert tags in html, 'script tags changed in index.html'
html = html.replace(tags, '\n'.join(scripts))
head_note = '<!--\n  صفحة «ميزانيات الأقسام» في ملف واحد.\n  - بلا إعداد: تعمل مستقلة على البيانات المضمّنة (budgetData)، والتعديلات في المتصفح، ومنها تنزيل ملف البيانات المحدَّث وتصدير CSV للجدول.\n  - للربط بمنصة Firebase: ضع firebaseConfig في CONFIG.firebase (آخر سكربت في الملف)، وطابق CONFIG.users وCONFIG.fields مع مستخدمي المنصة.\n    الحفظ يكتب budgets/{القسم} وعقد budget_rows (سطر لكل معلم × شعبة × مادة = أسطر CSV نفسها).\n  - ?head=<الاسم الكامل> في الوضع المستقل يفتح الصفحة كرئيس ذلك القسم.\n  - فيها أسماء معلمين: لا تُنشر علناً.\n-->\n'
html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + head_note, 1) if html.startswith('<!DOCTYPE html>') else head_note + html
open(out, 'w', encoding='utf-8').write(html)
print(out, round(len(html.encode()) / 1024), 'KB')
