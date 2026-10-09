/**
 * استيراد ميزانيات الأقسام من ملف CSV تصدّره «منصة ميزانيات وملاحظات الجدول المدرسي».
 * يُلصق هذا الملف في Apps Script الخاص بملف «نظام الجدول المدرسي»، ثم يُضاف onOpenImport إلى onOpen الموجود
 * (أو تُستدعى importFromPlatform من قائمتكم مباشرة).
 *
 * نسق الملف (UTF-8 مع BOM، الصف الأول عناوين):
 *   المعرف, اسم الشهرة, الاسم الثلاثي, القسم, الصف, المادة, الحصص
 * سطر لكل معلم في كل شعبة. «الصف» و«المادة» بالصيغة نفسها المستعملة في ورقة «التوزيع».
 *
 * ما يفعله الاستيراد (كله بضغطة زر، لا شيء تلقائي):
 *   1. يطلب الملف.
 *   2. يمسح خانات «التوزيع» (الصفوف 2 فأكثر، الأعمدة B فأكثر).
 *   3. لكل سطر: يجد المعلم بالمعرف (عمود User ID في «المعلمون»)، وإلا بالاسم الثلاثي، وإلا باسم الشهرة،
 *      ثم يضع اسم شهرته في خانة (الصف، المادة).
 *   4. لا يلمس ورقة «المعلمون» إطلاقاً.
 *   5. يعرض تقريراً بما لم يُطابَق (معرّف/اسم غير موجود، صف أو مادة ليست في «التوزيع»، خانة جاءها معلمان).
 */

function onOpenImport() {
  SpreadsheetApp.getUi().createMenu('المنصة').addItem('استيراد الميزانيات من ملف CSV', 'importFromPlatform').addToUi();
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
    'r.readAsText(f,"utf-8");}</script></div>').setWidth(420).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'استيراد الميزانيات من المنصة');
}

function importCsvText(text) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dist = ss.getSheetByName('التوزيع'), staff = ss.getSheetByName('المعلمون');
  if (!dist || !staff) throw new Error('لم أجد ورقتي «التوزيع» و«المعلمون»');

  var rows = Utilities.parseCsv(text.replace(/^﻿/, ''));
  var head = rows.shift().map(norm);
  var col = function (name) { var i = head.indexOf(norm(name)); if (i < 0) throw new Error('عمود «' + name + '» غير موجود في الملف'); return i; };
  var cUid = col('المعرف'), cNick = col('اسم الشهرة'), cName = col('الاسم الثلاثي'), cClass = col('الصف'), cSubj = col('المادة');

  // المعلمون: المعرف → اسم الشهرة، الاسم الثلاثي → اسم الشهرة
  var sv = staff.getDataRange().getValues(), sh = sv[0].map(norm);
  var iUid = sh.indexOf(norm('User ID')), iName = sh.indexOf(norm('الاسم الثلاثي')), iNick = sh.indexOf(norm('اسم الشهرة'));
  var byUid = {}, byName = {}, nicks = {};
  for (var r = 1; r < sv.length; r++) {
    var nick = String(sv[r][iNick] || '').trim(); if (!nick) continue;
    if (iUid >= 0 && sv[r][iUid]) byUid[String(sv[r][iUid]).trim()] = nick;
    byName[norm(sv[r][iName])] = nick; nicks[norm(nick)] = nick;
  }

  // التوزيع: الصف → رقم الصف، المادة → رقم العمود
  var dv = dist.getDataRange().getValues();
  var subjCol = {}; dv[0].forEach(function (h, i) { if (i > 0 && h) subjCol[norm(h)] = i; });
  var classRow = {}; dv.forEach(function (row, i) { if (i > 0 && row[0]) classRow[norm(row[0])] = i; });

  var grid = dv.map(function (row) { return row.map(function (v, i) { return i === 0 ? v : ''; }); });
  var missing = [], dup = [], placed = 0;
  rows.forEach(function (row, k) {
    if (!row.join('').trim()) return;
    var nick = byUid[String(row[cUid] || '').trim()] || byName[norm(row[cName])] || nicks[norm(row[cNick])];
    var ri = classRow[norm(row[cClass])], ci = subjCol[norm(row[cSubj])];
    if (!nick) { missing.push('سطر ' + (k + 2) + ': معلم غير موجود في «المعلمون»: ' + row[cName]); return; }
    if (ri === undefined) { missing.push('سطر ' + (k + 2) + ': صف غير موجود في «التوزيع»: ' + row[cClass]); return; }
    if (ci === undefined) { missing.push('سطر ' + (k + 2) + ': مادة غير موجودة في «التوزيع»: ' + row[cSubj]); return; }
    if (grid[ri][ci] && grid[ri][ci] !== nick) { dup.push(row[cClass] + ' / ' + row[cSubj] + ': ' + grid[ri][ci] + ' و' + nick); return; }
    grid[ri][ci] = nick; placed++;
  });

  dist.getRange(1, 1, grid.length, grid[0].length).setValues(grid);
  var report = '<b>تم.</b> وُضع ' + placed + ' معلماً في خانات التوزيع.';
  if (missing.length) report += '<br><br><b>لم يُطابَق (' + missing.length + '):</b><br>' + missing.join('<br>');
  if (dup.length) report += '<br><br><b>خانة جاءها معلمان (' + dup.length + '):</b><br>' + dup.join('<br>');
  return report;
}

// مطابقة متسامحة: تجاهل الهمزات والتاء المربوطة والمسافات الزائدة وعلامة الاتجاه ‏.
function norm(s) {
  return String(s == null ? '' : s).replace(/[‏‎]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
}
