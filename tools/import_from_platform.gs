/**
 * استيراد ملف CSV من «منصة ميزانيات وملاحظات الجدول المدرسي» إلى ملف «نظام الجدول المدرسي».
 * يُلصق في Apps Script، ثم يُضاف onOpenImport() إلى onOpen الموجود (أو تُستدعى importFromPlatform من قائمتكم).
 *
 * نسق الملف (UTF-8 مع BOM، الصف الأول عناوين، المطابقة بأسماء الأعمدة لا مواضعها):
 *   المعرف, اسم الشهرة, الاسم الثلاثي, القسم, الصف, المادة, الحصص, السجل, القيد, السبب, الحالة, التاريخ, معرف الطلب
 *   - السجل = «توزيع»: سطر لمعلم في شعبة (الصف، المادة، الحصص).
 *   - السجل = «قيد»:   ملاحظة معلم على الجدول (القيد = طلبه، السبب = سببه، الحالة = جديد/تم، معرف الطلب ثابت).
 *
 * ما يفعله الاستيراد (بضغطة زر، لا شيء تلقائي):
 *   1. «التوزيع»: يمسح فقط أعمدة المواد التي وردت في الملف، ثم يضع اسم الشهرة في خانة (الصف، المادة).
 *      الأعمدة التي لم ترد في الملف (مثل التجاري) لا تُمس.
 *   2. «القيود بلغة عرفية (حيدر)»: يحذف الكتلة السابقة التي عنوانها «مصدرة من منصة الجدول» ويكتبها من جديد
 *      في آخر الورقة، فلا تكرار. ما كتبه صاحب الملف بيده في عمود «الإلزام» لسطر ما يُحفظ ويُعاد (المفتاح: معرف الطلب).
 *   3. «حمل المعلمين» لا يُكتب فيه شيء: معادلاته تتحدث وحدها من «التوزيع» و«المعلمون».
 *   4. «المعلمون» لا تُمس إطلاقاً.
 *   5. تقرير بما لم يُطابَق: معلم غير موجود، صف أو مادة ليست في «التوزيع»، خانة جاءها معلمان.
 */

var MARK = 'مصدرة من منصة الجدول';                 // عنوان كتلة الملاحظات في ورقة القيود
var NOTES_SHEET = 'القيود بلغة عرفية (حيدر)';
var NOTE_HEAD = ['النوع', 'القسم', 'المعلم', 'القيد', 'الإلزام', 'السبب', 'الحالة', 'التاريخ', 'معرف الطلب'];

function onOpenImport() {
  SpreadsheetApp.getUi().createMenu('المنصة').addItem('استيراد من ملف CSV (التوزيع + الملاحظات)', 'importFromPlatform').addToUi();
}

function importFromPlatform() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;direction:rtl;text-align:right">' +
    '<p>اختر ملف CSV الذي أرسله المدير من المنصة.</p>' +
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
  var dist = ss.getSheetByName('التوزيع'), staff = ss.getSheetByName('المعلمون'), notes = ss.getSheetByName(NOTES_SHEET);
  if (!dist || !staff) throw new Error('لم أجد ورقتي «التوزيع» و«المعلمون»');

  var rows = Utilities.parseCsv(text.replace(/^﻿/, ''));
  var head = rows.shift().map(norm);
  var col = function (name, optional) { var i = head.indexOf(norm(name)); if (i < 0 && !optional) throw new Error('عمود «' + name + '» غير موجود في الملف'); return i; };
  var cUid = col('المعرف'), cNick = col('اسم الشهرة'), cName = col('الاسم الثلاثي'), cDept = col('القسم'),
      cClass = col('الصف'), cSubj = col('المادة'), cKind = col('السجل', true), cReq = col('القيد', true),
      cWhy = col('السبب', true), cState = col('الحالة', true), cDate = col('التاريخ', true), cRid = col('معرف الطلب', true);
  var get = function (row, i) { return i >= 0 ? String(row[i] || '').trim() : ''; };
  var isNote = function (row) { return cKind >= 0 ? norm(get(row, cKind)) === norm('قيد') : (!get(row, cClass) && !!get(row, cReq)); };

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

  var distRows = rows.filter(function (row) { return row.join('').trim() && !isNote(row); });
  var noteRows = rows.filter(function (row) { return row.join('').trim() && isNote(row); });
  var report = [];
  report.push(importDistribution(dist, distRows, nickOf, get, cClass, cSubj, cName));
  if (notes) report.push(importNotes(notes, noteRows, get, cDept, cName, cReq, cWhy, cState, cDate, cRid));
  else report.push('<b>الملاحظات:</b> لم أجد ورقة «' + NOTES_SHEET + '» فلم تُستورد (' + noteRows.length + ' ملاحظة).');
  return report.join('<br><br>');
}

// «التوزيع»: تُمسح فقط أعمدة المواد الواردة في الملف، ثم تُملأ.
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

// «القيود بلغة عرفية»: كتلة واحدة بعنوان MARK في آخر الورقة؛ تُستبدل كلها في كل استيراد، ويبقى ما كتبه صاحب الملف في «الإلزام».
function importNotes(sheet, noteRows, get, cDept, cName, cReq, cWhy, cState, cDate, cRid) {
  var values = sheet.getDataRange().getValues();
  var start = -1;
  for (var i = 0; i < values.length; i++) if (norm(values[i][0]) === norm(MARK)) { start = i; break; }

  // ما كتبه بيده في «الإلزام» (العمود 5) على ملاحظات الاستيراد السابق، مفتاحه معرف الطلب (العمود 9)
  var kept = {};
  if (start >= 0) {
    var end = start;
    for (var j = start + 1; j < values.length; j++) {
      if (!values[j].join('').trim()) break;           // أول سطر فارغ ينهي الكتلة
      end = j;
      if (j === start + 1) continue;                   // سطر العناوين
      var rid = String(values[j][8] || '').trim(), hard = String(values[j][4] || '').trim();
      if (rid && hard) kept[rid] = hard;
    }
    sheet.deleteRows(start + 1, end - start + 1);
    values = sheet.getDataRange().getValues();
  }
  if (!noteRows.length) return '<b>الملاحظات:</b> لا ملاحظات في الملف؛ أُزيلت الكتلة السابقة إن وُجدت.';

  // آخر سطر غير فارغ + سطر فارغ فاصل
  var last = 0;
  for (var k = values.length - 1; k >= 0; k--) if (values[k].join('').trim()) { last = k + 1; break; }
  var at = last + 2;
  var block = [[MARK, 'التاريخ: ' + new Date().toISOString().slice(0, 10), '', '', '', '', '', '', ''], NOTE_HEAD];
  var restored = 0;
  noteRows.forEach(function (row) {
    var rid = get(row, cRid); if (kept[rid]) restored++;
    block.push(['منصة', get(row, cDept), get(row, cName), get(row, cReq), kept[rid] || '', get(row, cWhy), get(row, cState), get(row, cDate), rid]);
  });
  if (sheet.getMaxRows() < at + block.length) sheet.insertRowsAfter(sheet.getMaxRows(), at + block.length - sheet.getMaxRows());
  if (sheet.getMaxColumns() < NOTE_HEAD.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), NOTE_HEAD.length - sheet.getMaxColumns());
  sheet.getRange(at, 1, block.length, NOTE_HEAD.length).setValues(block);
  sheet.getRange(at, 1, 1, NOTE_HEAD.length).setFontWeight('bold');
  return '<b>الملاحظات:</b> كُتبت ' + noteRows.length + ' ملاحظة تحت عنوان «' + MARK + '» بدءاً من الصف ' + at +
    (restored ? '، وأُعيد «الإلزام» الذي كتبته لـ' + restored + ' منها.' : '.');
}

function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }
// مطابقة متسامحة: تجاهل الهمزات والتاء المربوطة والمسافات الزائدة وعلامة الاتجاه ‏.
function norm(s) {
  return String(s == null ? '' : s).replace(/[‏‎]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
