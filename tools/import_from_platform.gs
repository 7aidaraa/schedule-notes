/**
 * استيراد ملفات CSV من «منصة ميزانيات وملاحظات الجدول المدرسي» إلى ملف «نظام الجدول المدرسي».
 * يُلصق في Apps Script، ثم يُضاف onOpenImport() إلى onOpen الموجود (أو تُستدعى importFromPlatform من قائمتكم).
 * زر واحد يعرف نوع الملف من عناوينه (UTF-8 مع BOM، الصف الأول عناوين، المطابقة بأسماء الأعمدة لا مواضعها):
 *
 * 1) ملف الميزانية «ميزانية_المنصة_*.csv» — من زر «تصدير CSV للجدول» في قسم الميزانيات بالمنصة المدرسية:
 *      المعرف, اسم الشهرة, الاسم الثلاثي, القسم, الصف, المادة, الحصص [, الرقم المدني]
 *    «المعلمون» (أولاً): المعلم يُطابق بالمعرف (User ID) ثم بالاسم الثلاثي.
 *      الموجود: يُحدَّث الاسم الثلاثي والمادة والمادة الثانية (الأكثر حصصاً أولاً) والنصاب (مجموع حصصه) والمعرف.
 *      الجديد: صف جديد في أول صف فارغ، باسم شهرة (الاسم الأول والأخير، أو الكامل إن تكرر) والرقم المدني إن كان 12 رقماً.
 *      لا يُحذف أحد، ولا تُمس الفئة ولا الجناح ولا مشرف الجناح ولا البريد ولا الملاحظات ولا عمود القسم (صيغة).
 *      من في الورقة وليس في الملف يُذكر في التقرير فقط.
 *    «التوزيع»: يمسح فقط أعمدة المواد التي وردت في الملف، ثم يضع اسم الشهرة في خانة (الصف، المادة).
 *    الأعمدة التي لم ترد (مثل التجاري) لا تُمس. «حمل المعلمين» لا يُكتب فيه شيء.
 *
 * 2) ملف القيود «قيود_المنصة_*.csv» — من زر «تصدير CSV للشيت» في تبويب القيود:
 *      م, النطاق, النوع, القسم, المعلم, القيد, الإلزام, السبب, في الشيت, المقترح, المصدر
 *    «القيود بلغة عرفية (حيدر)»: تُمسح الورقة كلها ثم تُكتب القائمة بترتيب المنصة وألوانها
 *    (برتقالي باهت: فردي صلب · أحمر باهت: عام صلب · أخضر باهت: مرن). لا تُمس ورقة «القيود» التي يقرؤها البرنامج.
 *
 * قبل أول استيراد: «ملف ← سجلّ الإصدارات» يحفظ نسخة يُرجع إليها.
 */

var NOTES_SHEET = 'القيود بلغة عرفية (حيدر)';
var COLORS = { hardOne: '#fdebd6', hardAll: '#fadcdc', soft: '#e2f4e8' };

function onOpenImport() {
  SpreadsheetApp.getUi().createMenu('المنصة').addItem('استيراد من ملف CSV (الميزانية أو القيود)', 'importFromPlatform').addToUi();
}

function importFromPlatform() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;direction:rtl;text-align:right">' +
    '<p>اختر ملف CSV الذي صدّره المدير من المنصة (الميزانية أو القيود).</p>' +
    '<input type="file" id="f" accept=".csv,text/csv"><br><br>' +
    '<button onclick="go()">استيراد</button> <span id="m"></span>' +
    '<script>function go(){var f=document.getElementById("f").files[0];if(!f)return;' +
    'document.getElementById("m").textContent="جارٍ الاستيراد...";var r=new FileReader();' +
    'r.onload=function(){google.script.run.withSuccessHandler(function(t){document.getElementById("m").innerHTML=t;})' +
    '.withFailureHandler(function(e){document.getElementById("m").textContent="خطأ: "+e.message;}).importCsvText(r.result);};' +
    'r.readAsText(f,"utf-8");}</script></div>').setWidth(440).setHeight(240);
  SpreadsheetApp.getUi().showModalDialog(html, 'استيراد من المنصة');
}

function importCsvText(text) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = Utilities.parseCsv(text.replace(/^\uFEFF/, ''));
  var head = rows.shift().map(norm);
  var col = function (name, optional) { var i = head.indexOf(norm(name)); if (i < 0 && !optional) throw new Error('عمود «' + name + '» غير موجود في الملف'); return i; };
  var get = function (row, i) { return i >= 0 ? String(row[i] == null ? '' : row[i]).trim() : ''; };
  rows = rows.filter(function (row) { return row.join('').trim(); });

  if (head.indexOf(norm('النطاق')) >= 0) {
    var notes = ss.getSheetByName(NOTES_SHEET);
    if (!notes) throw new Error('لم أجد ورقة «' + NOTES_SHEET + '»');
    return importConstraints(notes, rows, head, get);
  }

  var dist = ss.getSheetByName('التوزيع'), staff = ss.getSheetByName('المعلمون');
  if (!dist || !staff) throw new Error('لم أجد ورقتي «التوزيع» و«المعلمون»');
  var cUid = col('المعرف'), cNick = col('اسم الشهرة'), cName = col('الاسم الثلاثي'), cClass = col('الصف'), cSubj = col('المادة');
  // ملف قديم فيه أسطر «قيد»: لا تُستورد من هنا بعد اليوم (القيود لها ملفها).
  var cKind = col('السجل', true);
  if (cKind >= 0) rows = rows.filter(function (row) { return norm(get(row, cKind)) !== norm('قيد'); });

  var staffReport = importStaff(staff, rows, get, cUid, cName, col('الصف'), cSubj, col('الحصص'), col('الرقم المدني', true));

  // «المعلمون»: المعرف → اسم الشهرة، الاسم الثلاثي → اسم الشهرة، اسم الشهرة → اسم الشهرة
  var sv = staff.getDataRange().getValues(), sh = sv[0].map(norm);
  var iUid = sh.indexOf(norm('User ID')), iName = sh.indexOf(norm('الاسم الثلاثي')), iNick = sh.indexOf(norm('اسم الشهرة'));
  var byUid = {}, byName = {}, nicks = {};
  for (var r = 1; r < sv.length; r++) {
    var nick = String(sv[r][iNick] || '').trim(); if (!nick) continue;
    if (iUid >= 0 && sv[r][iUid]) byUid[String(sv[r][iUid]).trim()] = nick;
    byName[norm(sv[r][iName])] = nick; nicks[norm(nick)] = nick;
  }
  var nickOf = function (row) { return byUid[get(row, cUid)] || byName[norm(get(row, cName))] || nicks[norm(get(row, cNick))]; };
  return staffReport + '<br>' + importDistribution(dist, rows, nickOf, get, cClass, cSubj, cName);
}

// «المعلمون»: تحديث من ملف الميزانية دون حذف أحد. الهوية: User ID ثم الاسم الثلاثي.
function importStaff(staff, rows, get, cUid, cName, cClass, cSubj, cHours, cCivil) {
  var sv = staff.getDataRange().getValues(), sh = sv[0].map(norm);
  var at = function (name) { var i = sh.indexOf(norm(name)); if (i < 0) throw new Error('عمود «' + name + '» غير موجود في ورقة «المعلمون»'); return i; };
  var iCivil = at('الرقم المدني'), iName = at('الاسم الثلاثي'), iSubj = at('المادة'), iSubj2 = at('مادة ثانية'),
      iLoad = at('النصاب الأسبوعي'), iNick = at('اسم الشهرة'), iUid = at('User ID');

  // معلمو الملف: المعرف، الاسم، الرقم المدني، حصص كل مادة.
  var list = [], byKey = {};
  rows.forEach(function (row) {
    var uid = get(row, cUid), name = get(row, cName), key = uid || 'n:' + norm(name);
    if (!name) return;
    var t = byKey[key];
    if (!t) { t = byKey[key] = { uid: uid, name: name, civil: '', subj: {}, load: 0 }; list.push(t); }
    var civil = get(row, cCivil).replace(/\D+/g, '');
    if (civil.length === 12) t.civil = civil;
    var h = Number(get(row, cHours)) || 0, s = get(row, cSubj);
    t.load += h;
    if (s) t.subj[s] = (t.subj[s] || 0) + h;
  });

  var rowOfUid = {}, rowOfName = {}, used = {};
  for (var r = 1; r < sv.length; r++) {
    var u = String(sv[r][iUid] || '').trim(), n = norm(sv[r][iName]);
    if (u) rowOfUid[u] = r;
    if (n) rowOfName[n] = r;
    var k = norm(sv[r][iNick]); if (k) used[k] = true;
  }
  var cols = [iCivil, iName, iSubj, iSubj2, iLoad, iNick, iUid];
  var updated = 0, added = [], renamed = [], extra = [], seen = {};
  list.forEach(function (t) {
    var subs = Object.keys(t.subj).sort(function (a, b) { return t.subj[b] - t.subj[a]; });
    if (subs.length > 2) extra.push(t.name + ': ' + subs.join('، '));
    var r = (t.uid && rowOfUid[t.uid] !== undefined) ? rowOfUid[t.uid] : rowOfName[norm(t.name)];
    if (r === undefined) {
      // صف جديد: أول صف لا رقم مدني فيه ولا اسم.
      for (r = 1; r < sv.length && (String(sv[r][iCivil]).trim() || String(sv[r][iName]).trim()); r++);
      if (r === sv.length) sv.push(sv[0].map(function () { return ''; }));
      sv[r][iCivil] = t.civil;
      var w = t.name.split(/\s+/), nick = w.length > 1 ? w[0] + ' ' + w[w.length - 1] : t.name;
      if (used[norm(nick)]) nick = t.name;
      used[norm(nick)] = true;
      sv[r][iNick] = nick;
      added.push(t.name + (t.civil ? '' : ' (بلا رقم مدني)'));
    } else {
      updated++;
      if (String(sv[r][iName]).trim() !== t.name) renamed.push(String(sv[r][iName]).trim() + ' ← ' + t.name);
    }
    seen[r] = true;
    sv[r][iName] = t.name;
    sv[r][iSubj] = subs[0] || sv[r][iSubj];
    sv[r][iSubj2] = subs[1] || '';
    sv[r][iLoad] = t.load;
    if (t.uid) sv[r][iUid] = t.uid;
  });
  var absent = [];
  for (var q = 1; q < sv.length; q++) if (!seen[q] && String(sv[q][iName]).trim()) absent.push(String(sv[q][iName]).trim());

  // يُكتب كل عمود من الأعمدة السبعة وحده، فلا تُمس الأعمدة الأخرى (القسم صيغة).
  cols.forEach(function (ci) {
    staff.getRange(2, ci + 1, sv.length - 1, 1).setValues(sv.slice(1).map(function (row) { return [row[ci]]; }));
  });

  var out = '<b>المعلمون:</b> حُدِّث ' + updated + ' معلماً' + (added.length ? '، وأُضيف ' + added.length : '') + '.';
  if (added.length) out += '<br><b>جدد (أكمل لهم الفئة والجناح ومشرف الجناح، والرقم المدني إن نقص):</b><br>' + added.join('<br>');
  if (renamed.length) out += '<br><b>تغيّر الاسم الثلاثي (اضغط «🔁 مزامنة أسماء العرض»):</b><br>' + renamed.join('<br>');
  if (extra.length) out += '<br><b>أكثر من مادتين (كُتبت أكثر مادتين حصصاً):</b><br>' + extra.join('<br>');
  if (absent.length) out += '<br><b>في الورقة وليسوا في الملف (لم يُحذفوا):</b><br>' + absent.join('<br>');
  return out;
}

// «القيود بلغة عرفية»: تُمسح الورقة كلها، ثم العناوين والقائمة بترتيب المنصة وألوانها.
function importConstraints(sheet, rows, head, get) {
  var cols = ['م', 'النطاق', 'النوع', 'القسم', 'المعلم', 'القيد', 'الإلزام', 'السبب', 'في الشيت', 'المقترح', 'المصدر'];
  var idx = cols.map(function (c) { return head.indexOf(norm(c)); });
  if (idx[5] < 0) throw new Error('عمود «القيد» غير موجود في الملف');
  var out = [cols].concat(rows.map(function (row) { return idx.map(function (i) { return get(row, i); }); }));
  sheet.clear();
  if (sheet.getMaxColumns() < cols.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols.length - sheet.getMaxColumns());
  if (sheet.getMaxRows() < out.length) sheet.insertRowsAfter(sheet.getMaxRows(), out.length - sheet.getMaxRows());
  sheet.getRange(1, 1, out.length, cols.length).setValues(out).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#eef3f7');
  sheet.setFrozenRows(1);
  var bg = out.slice(1).map(function (r) {
    var lvl = r[6], scope = r[1], hard = /صلب|لازم|ثابت/.test(lvl), soft = !hard && /مرن|مفض|مُفضَّل/.test(lvl);
    var c = soft ? COLORS.soft : hard ? (scope === 'عام' ? COLORS.hardAll : COLORS.hardOne) : null;
    return cols.map(function () { return c; });
  });
  if (bg.length) sheet.getRange(2, 1, bg.length, cols.length).setBackgrounds(bg);
  return '<b>القيود:</b> مُسحت ورقة «' + NOTES_SHEET + '» وكُتب فيها ' + rows.length + ' قيداً بترتيب المنصة.';
}

function importDistribution(dist, distRows, nickOf, get, cClass, cSubj, cName) {
  var dv = dist.getDataRange().getValues();
  var subjCol = {}; dv[0].forEach(function (h, i) { if (i > 0 && h) subjCol[norm(h)] = i; });
  var classRow = {}; dv.forEach(function (row, i) { if (i > 0 && row[0]) classRow[norm(row[0])] = i; });

  var touched = {};
  distRows.forEach(function (row) { var ci = subjCol[norm(get(row, cSubj))]; if (ci !== undefined) touched[ci] = true; });
  var grid = dv.map(function (row, ri) { return row.map(function (v, ci) { return ri > 0 && touched[ci] ? '' : v; }); });

  var missing = [], dup = [], placed = 0;
  distRows.forEach(function (row, k) {
    var nick = nickOf(row), ri = classRow[norm(get(row, cClass))], ci = subjCol[norm(get(row, cSubj))];
    if (!nick) { missing.push('توزيع: معلم غير موجود في «المعلمون»: ' + get(row, cName)); return; }
    if (ri === undefined) { missing.push('توزيع: صف غير موجود في «التوزيع»: ' + get(row, cClass)); return; }
    if (ci === undefined) { missing.push('توزيع: مادة غير موجودة في «التوزيع»: ' + get(row, cSubj)); return; }
    if (grid[ri][ci] && grid[ri][ci] !== nick) { dup.push(get(row, cClass) + ' / ' + get(row, cSubj) + ': ' + grid[ri][ci] + ' و' + nick); return; }
    grid[ri][ci] = nick; placed++;
  });
  dist.getRange(1, 1, grid.length, grid[0].length).setValues(grid);

  var out = '<b>التوزيع:</b> وُضع ' + placed + ' معلماً في ' + Object.keys(touched).length + ' عمود مادة (الأعمدة الأخرى لم تُمس).';
  if (missing.length) out += '<br><b>لم يُطابَق (' + missing.length + '):</b><br>' + uniq(missing).join('<br>');
  if (dup.length) out += '<br><b>خانة جاءها معلمان (' + dup.length + '):</b><br>' + dup.join('<br>');
  return out;
}

function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }
// مطابقة متسامحة: تجاهل الهمزات والتاء المربوطة والمسافات الزائدة وعلامة الاتجاه ‏.
function norm(s) {
  return String(s == null ? '' : s).replace(/[‏‎]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
