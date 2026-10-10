// ---- النموذج الرسمي لميزانية القسم: تنزيل Excel / PDF / صورة، ورفع Excel معبّأ يملأ المحرر ----
// الديباجة الرسمية (الشعاران واسم المدرسة) في الملفات المنزّلة فقط؛ شاشات المنصة بلا شعار (قرار صاحب المنصة 2026-10-10).
const FORM = { ...SCHOOL_DATA.form, version: 1, mark: 'نموذج المنصة' };
const FORM_PLEA = 'نرجو التكرم برفع الميزانية بملف Excel من نموذج المنصة؛ فالمنصة تقرؤه آلياً وتُدخل بياناته في ميزانية القسم دون إعادة كتابة، فتقلّ الأخطاء ويُختصر الوقت عليكم وعلى المطور. أما ملف PDF أو الصورة فيُحفظ مرفقاً للاطلاع فقط. شاكرين لكم حسن تعاونكم.';
const TICKS = ['✓', '✔', '√', '@', 'x', 'X', '×'];

const loadScript = src => new Promise((res, rej) => {
  if (document.querySelector('script[src="' + src + '"]')) return res();
  const s = el('script', { src }); s.onload = res; s.onerror = () => rej('تعذر تحميل ' + src); document.head.append(s);
});
const needExcel = () => window.ExcelJS ? Promise.resolve() : loadScript('vendor/exceljs-4.4.0.min.js');
const needCanvas = () => Promise.all([window.html2canvas ? 0 : loadScript('vendor/html2canvas-1.4.1.min.js'), window.jspdf ? 0 : loadScript('vendor/jspdf-2.5.1.umd.min.js')]);
function saveBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// The form's content, shared by Excel, PDF and image: one row per teacher × subject.
const formClasses = d => CLASSES.filter(c => !HIDDEN.includes(c) || d.teachers.some(t => c in (t.cells || {})));
const formSubjects = (dp, d) => isMulti(dp) ? deptSubjects(dp, d.teachers) : [dp];
const officialFor = (dp, subj, c) => (OFFICIAL[subj ? SHEET_SUBJECT[subj] || subj : dp] || {})[c];
const nickOf = n => (TEACHERS.find(t => t.name === n) || {}).nick || n;
function formRows(dp, d) {
  const subs = formSubjects(dp, d), multi = isMulti(dp);
  return d.teachers.filter(t => t.name).map(t => {
    const by = {};
    for (const c of CLASSES) if (c in (t.cells || {})) for (const p of partsOf(dp, t, c)) ((by[p.subj || ''] = by[p.subj || ''] || {})[c] = p.h);
    let keys = Object.keys(by).sort((a, b) => subs.indexOf(a) - subs.indexOf(b));
    if (!keys.length) keys = [multi ? (t.subjects || [])[0] || '' : ''];
    return { name: t.name, nick: nickOf(t.name), note: t.note || '', lines: keys.map(k => ({ subj: multi ? k : dp, cells: by[k] || {} })) };
  });
}
const headOf = dp => { const h = TEACHERS.find(t => t.department === dp && t.is_head); return h ? h.nick || h.name : ''; };
// The head of department is marked «رئيس القسم» in the notes, unless the note already says so.
const HEAD_NOTE = 'رئيس القسم';
const withHeadNote = (dp, nick, note) => nick && nick === headOf(dp) && !/رئيس/.test(note || '') ? (note ? HEAD_NOTE + ' — ' + note : HEAD_NOTE) : note || '';
const cellMark = (dp, subj, c, h) => h === undefined ? '' : h === officialFor(dp, subj === dp ? null : subj, c) ? '✓' : h;

async function imageB64(path) {
  const buf = await (await fetch(path)).arrayBuffer();
  let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}
const colName = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

// ---- Excel ----
async function buildXlsx(dp, d) {
  await needExcel();
  const multi = isMulti(dp), classes = formClasses(d), subs = formSubjects(dp, d), rows = formRows(dp, d);
  const C0 = 5, CN = C0 + classes.length - 1, NOTE = CN + 1, HELP = CN + 2, HR = 9;
  const L = colName, lastL = L(NOTE);
  const wb = new ExcelJS.Workbook(); wb.creator = 'منصة ميزانيات وملاحظات الجدول المدرسي';
  const ws = wb.addWorksheet('الميزانية', { views: [{ rightToLeft: true, showGridLines: false }] });
  const ref = wb.addWorksheet('المقرر', { views: [{ rightToLeft: true }] });
  const guide = wb.addWorksheet('طريقة التعبئة', { views: [{ rightToLeft: true }] });
  const meta = wb.addWorksheet('_منصة', { state: 'veryHidden' });
  const thin = { style: 'thin', color: { argb: 'FF9E9E9E' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };

  // _منصة: the platform's mark, the department, and the dropdown lists.
  meta.getCell('A1').value = FORM.mark; meta.getCell('B1').value = FORM.version;
  meta.getCell('A2').value = 'القسم'; meta.getCell('B2').value = dp;
  meta.getCell('A3').value = 'العام'; meta.getCell('B3').value = FORM.year;
  meta.getCell('A4').value = 'تاريخ التنزيل'; meta.getCell('B4').value = new Date().toISOString().slice(0, 10);
  meta.getCell('A5').value = 'رئيس القسم'; meta.getCell('B5').value = headOf(dp);
  const staff = [...new Set([...TEACHERS.filter(t => t.department === dp).map(t => t.nick || t.name), ...rows.map(r => r.nick)])];
  staff.forEach((n, i) => { meta.getCell('D' + (i + 1)).value = n; });
  subs.forEach((s, i) => { meta.getCell('E' + (i + 1)).value = s; });

  // المقرر: the same class columns as the budget sheet, one row per subject.
  ref.getCell('D2').value = 'المادة';
  classes.forEach((c, i) => { ref.getCell(2, C0 + i).value = sheetClass(c); });
  subs.forEach((s, j) => {
    ref.getCell(3 + j, 4).value = s;
    classes.forEach((c, i) => { const o = officialFor(dp, multi ? s : null, c); if (o) ref.getCell(3 + j, C0 + i).value = o; });
  });
  ref.getRow(2).font = { bold: true };
  ref.getColumn(4).width = 18;
  ref.getCell('A1').value = 'حصص كل مادة في كل صف (من ورقة «المواد») — للاطلاع، لا تُعدَّل';
  await ref.protect('', {});
  const REF_SUBJ = `المقرر!$D$3:$D$${2 + subs.length}`, REF_GRID = `المقرر!$${L(C0)}$3:$${L(CN)}$${2 + subs.length}`;

  // Official header.
  ws.getColumn(1).width = 4; ws.getColumn(2).width = 22; ws.getColumn(3).width = 7; ws.getColumn(4).width = multi ? 15 : 13;
  for (let c = C0; c <= CN; c++) ws.getColumn(c).width = 5.6;
  ws.getColumn(NOTE).width = 18; ws.getColumn(HELP).hidden = true;
  const moe = wb.addImage({ base64: await imageB64(FORM.logos.ministry), extension: 'jpeg' });
  const school = wb.addImage({ base64: await imageB64(FORM.logos.school), extension: 'png' });
  ws.addImage(moe, { tl: { col: 1.4, row: 0.1 }, ext: { width: 66, height: 74 } });
  ws.addImage(school, { tl: { col: NOTE - 2.6, row: 0.4 }, ext: { width: 120, height: 63 } });
  const put = (range, value, font) => { ws.mergeCells(range); const c = ws.getCell(range.split(':')[0]); c.value = value; c.alignment = center; if (font) c.font = font; };
  put('A5:D5', FORM.ministry, { bold: true, size: 12 });
  put('A6:D6', FORM.region, { size: 11 });
  put('A7:D7', FORM.school, { size: 11 });
  put(`${L(C0 + 1)}2:${L(CN - 2)}3`, 'ميزانية الأقسام العلمية للعام الدراسي ' + FORM.year, { bold: true, size: 16 });
  put(`${L(C0 + 1)}4:${L(CN - 2)}5`, 'القسم العلمي / ' + dp, { bold: true, size: 13 });
  put(`${L(NOTE - 3)}6:${lastL}6`, 'العام الدراسي ' + FORM.year, { size: 11 });
  for (let c = 1; c <= NOTE; c++) ws.getCell(8, c).border = { bottom: { style: 'double', color: { argb: 'FF217346' } } };

  // Table header.
  const heads = ['م', 'المعلم', 'النصاب', 'المادة', ...classes.map(sheetClass), 'ملاحظات'];
  heads.forEach((h, i) => { const c = ws.getCell(HR, i + 1); c.value = h; c.font = { bold: true }; c.alignment = center; c.border = box; c.fill = fill('FFDBE9E1'); });
  ws.getRow(HR).height = 22;

  // Data rows: teachers, then 10 empty rows to add.
  let r = HR + 1, n = 0;
  const lines = [];
  rows.forEach(t => { n++; lines.push({ n, t, first: true, span: t.lines.length, line: t.lines[0] }); t.lines.slice(1).forEach(line => lines.push({ t, line })); });
  for (let k = 0; k < 10; k++) lines.push({ n: ++n, t: null, first: true, span: 1, line: { subj: multi ? '' : dp, cells: {} } });
  const first = r;
  lines.forEach(x => {
    const row = ws.getRow(r);
    if (x.first) {
      if (x.span > 1) for (const col of [1, 2, 3]) ws.mergeCells(r, col, r + x.span - 1, col);
      row.getCell(1).value = x.n;
      if (x.t) row.getCell(2).value = x.t.nick;
      row.getCell(3).value = { formula: `SUM(${L(HELP)}${r}:${L(HELP)}${r + x.span - 1})` };
      const note = x.t ? withHeadNote(dp, x.t.nick, x.t.note) : '';
      row.getCell(NOTE).value = note || (headOf(dp) ? { formula: `IF($B${r}=_منصة!$B$5,"${HEAD_NOTE}","")` } : null);
    }
    row.getCell(4).value = x.line.subj || null;
    classes.forEach((c, i) => { const v = cellMark(dp, x.line.subj, c, x.line.cells[c]); if (v !== '') row.getCell(C0 + i).value = v; });
    row.getCell(HELP).value = { formula: `IFERROR(SUMPRODUCT((${L(C0)}${r}:${L(CN)}${r}="✓")*INDEX(${REF_GRID},MATCH($D${r},${REF_SUBJ},0),0)),0)+SUM(${L(C0)}${r}:${L(CN)}${r})` };
    for (let c = 1; c <= NOTE; c++) { const cell = row.getCell(c); cell.border = box; cell.alignment = c === 2 || c === NOTE ? { vertical: 'middle', horizontal: 'right', wrapText: true } : center; }
    row.getCell(2).font = { bold: true }; row.getCell(3).font = { bold: true }; row.getCell(3).fill = fill('FFEEF6F1');
    // Editable: name, subject (multi-subject departments), classes, notes.
    for (const c of [2, ...(multi ? [4] : []), NOTE]) row.getCell(c).protection = { locked: false };
    for (let c = C0; c <= CN; c++) row.getCell(c).protection = { locked: false };
    row.height = 20;
    r++;
  });
  const last = r - 1;
  for (let rr = first; rr <= last; rr++) {
    ws.getCell(rr, 2).dataValidation = { type: 'list', allowBlank: true, formulae: [`_منصة!$D$1:$D$${staff.length}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'اسم غير موجود', error: 'هذا الاسم ليس في قائمة معلمي القسم. يُقبل، وتنبّهك المنصة عند الرفع.' };
    if (multi) ws.getCell(rr, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [`_منصة!$E$1:$E$${subs.length}`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'مادة غير معروفة', error: 'اختر مادة من القائمة.' };
    for (let c = C0; c <= CN; c++) ws.getCell(rr, c).dataValidation = { type: 'custom', allowBlank: true, formulae: [`OR(${L(c)}${rr}="✓",AND(ISNUMBER(${L(c)}${rr}),${L(c)}${rr}>=0,${L(c)}${rr}<=40))`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'قيمة غير مقبولة', error: 'اكتب ✓ (المقرر) أو عدد الحصص من 1 إلى 40.' };
  }
  const area = `${L(C0)}${first}:${L(CN)}${last}`;
  ws.addConditionalFormatting({ ref: area, rules: [
    { type: 'expression', priority: 1, formulae: [`IFERROR(INDEX(${REF_GRID},MATCH($D${first},${REF_SUBJ},0),COLUMN()-${C0 - 1})="",TRUE)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD9D9D9' } } } },
    { type: 'expression', priority: 2, formulae: [`${L(C0)}${first}<>""`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF2CC' } } } },
  ] });

  // Official footer: «ميزانية المعلمين» and the signatures.
  let f = last + 2;
  put(`A${f}:${lastL}${f}`, 'ميزانية المعلمين', { bold: true, size: 12 });
  const q = Math.max(1, Math.floor((NOTE - 1) / 4)), spans = [[2, 1 + q], [2 + q, 1 + 2 * q], [2 + 2 * q, 1 + 3 * q], [2 + 3 * q, NOTE]];
  ['العدد المطلوب', 'الموجود', 'العجز', 'ملاحظات'].forEach((h, i) => {
    const [a, b] = spans[i];
    ws.mergeCells(f + 1, a, f + 1, b); ws.mergeCells(f + 2, a, f + 2, b);
    const hc = ws.getCell(f + 1, a); hc.value = h; hc.font = { bold: true }; hc.alignment = center; hc.fill = fill('FFDBE9E1');
    for (const rr of [f + 1, f + 2]) for (let c = a; c <= b; c++) ws.getCell(rr, c).border = box;
    ws.getCell(f + 2, a).alignment = center;
  });
  const req = ws.getCell(f + 2, spans[0][0]); req.value = d.required ?? null; req.protection = { locked: false };
  ws.getCell(f + 2, spans[1][0]).value = { formula: `COUNTA(B${first}:B${last})` };
  ws.getCell(f + 2, spans[2][0]).value = { formula: `IF(${L(spans[0][0])}${f + 2}="","",${L(spans[0][0])}${f + 2}-${L(spans[1][0])}${f + 2})` };
  ws.getCell(f + 2, spans[3][0]).protection = { locked: false };
  f += 4;
  put(`A${f}:D${f}`, 'رئيس القسم', { bold: true, size: 12 });
  put(`${L(NOTE - 3)}${f}:${lastL}${f}`, 'مدير المدرسة', { bold: true, size: 12 });
  put(`A${f + 1}:D${f + 1}`, headOf(dp), { size: 12 });
  put(`${L(NOTE - 3)}${f + 1}:${lastL}${f + 1}`, FORM.principal, { size: 12 });
  put(`A${f + 2}:D${f + 2}`, 'التوقيع: ....................');
  put(`${L(NOTE - 3)}${f + 2}:${lastL}${f + 2}`, 'التوقيع: ....................');

  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }, printArea: `A1:${lastL}${f + 2}` };
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });

  // طريقة التعبئة
  guide.getColumn(1).width = 110;
  [['طريقة تعبئة نموذج ميزانية القسم', true],
    ['1. لكل معلم سطر، ولكل مادة يدرّسها سطر. اسم المعلم ونصابه يُكتبان مرة واحدة.', false],
    ['2. المعلم الذي يدرّس مادة ثانية: اكتبها في السطر الذي تحته، واترك خانة الاسم فارغة.', false],
    ['3. في خانة الصف: ✓ تعني الحصص المقررة لتلك المادة في ذلك الصف، أو اكتب عدد الحصص إن خالف المقرر.', false],
    ['4. الخانة الرمادية: لا حصص لهذه المادة في هذا الصف. النصاب يُحسب وحده.', false],
    ['5. اسم المعلم والمادة من القوائم المنسدلة. لا تغيّر أسماء الأوراق ولا العناوين.', false],
    ['6. ارفع الملف Excel كما هو في المنصة: «ميزانية القسم ← رفع Excel معبّأ» فتُملأ الميزانية آلياً.', false],
    ['', false],
    ['مثال: معلم يدرّس الجيولوجيا في 11ع1–11ع5 والتربية البيئية في 11ع2–11ع5:', true],
    ['   السطر الأول: حسين القطيفي | الجيولوجيا | ✓ في 11ع1 إلى 11ع5', false],
    ['   السطر الثاني: (الاسم فارغ) | التربية البيئية | ✓ في 11ع2 إلى 11ع5', false],
  ].forEach(([t, b], i) => { const c = guide.getCell(i + 1, 1); c.value = t; c.font = { bold: b, size: b ? 13 : 12 }; c.alignment = { horizontal: 'right', readingOrder: 'rtl', wrapText: true }; });
  await guide.protect('', {});

  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---- Reading a filled form back: the same shape the editor saves ----
const cellText = c => { const v = c.isMerged && c.master ? c.master.value : c.value; if (v == null) return ''; if (typeof v === 'object') return v.richText ? v.richText.map(x => x.text).join('') : v.result != null ? String(v.result) : v.text != null ? String(v.text) : ''; return String(v).trim(); };
const classOf = label => CLASSES.find(c => sheetClass(c) === String(label).replace(/\s/g, '').replace('‏', ''));
async function isFormFile(file) {
  if (!/\.xlsx$/i.test(file.name)) return false;
  try { await needExcel(); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer()); const m = wb.getWorksheet('_منصة'); return m && cellText(m.getCell('A1')) === FORM.mark ? cellText(m.getCell('B2')) : false; }
  catch { return false; }
}
async function readForm(file, dp, d) {
  await needExcel();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(await file.arrayBuffer()); } catch { throw 'تعذرت قراءة الملف: ليس ملف Excel سليماً'; }
  const meta = wb.getWorksheet('_منصة');
  if (!meta || cellText(meta.getCell('A1')) !== FORM.mark) throw 'هذا الملف ليس نموذج المنصة. نزّل النموذج من زر «تنزيل Excel» ثم عبّئه.';
  const fdp = cellText(meta.getCell('B2'));
  if (fdp !== dp) throw 'هذا نموذج قسم «' + fdp + '»، لا قسم «' + dp + '».';
  const ws = wb.getWorksheet('الميزانية');
  if (!ws) throw 'ورقة «الميزانية» غير موجودة في الملف';
  let hr = 0;
  ws.eachRow((row, i) => { if (!hr && cellText(row.getCell(2)) === 'المعلم') hr = i; });
  if (!hr) throw 'لم أجد صف العناوين («المعلم») في ورقة «الميزانية»';
  const head = ws.getRow(hr), cols = [];
  let noteCol = 0;
  head.eachCell((c, i) => { const k = classOf(cellText(c)); if (k) cols.push([i, k]); if (cellText(c) === 'ملاحظات') noteCol = i; });
  const multi = isMulti(dp), subs = formSubjects(dp, d), report = { unknown: [], bad: [], orphan: [], odd: 0 };
  const byNick = n => TEACHERS.find(t => t.nick === n || t.name === n);
  const out = [], index = {};
  let cur = null, curKey = null;
  for (let i = hr + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i), first = cellText(row.getCell(1));
    if (first === 'ميزانية المعلمين' || cellText(row.getCell(2)) === 'ميزانية المعلمين') break;
    const nc = row.getCell(2), name = cellText(nc), key = nc.isMerged && nc.master ? nc.master.address : nc.address;
    const subjRaw = cellText(row.getCell(4)), subj = multi ? subjRaw : null;
    const marks = cols.map(([ci, c]) => [c, cellText(row.getCell(ci)), ci]).filter(x => x[1] !== '');
    const note = noteCol ? cellText(row.getCell(noteCol)) : '';
    if (!name && !marks.length && !subjRaw) continue;
    if (name && key !== curKey) {
      const hit = byNick(name);
      if (!hit) report.unknown.push(name);
      const full = hit ? hit.name : name;
      cur = index[full] || (index[full] = { name: full, cells: {}, note: '', subjects: [], subj: {}, split: {}, parts: {} });
      if (!out.includes(cur)) out.push(cur);
      curKey = key;
    } else if (!name && !(nc.isMerged && key === curKey)) {
      if (!cur) { if (marks.length) report.orphan.push('السطر ' + i); continue; }
    }
    if (note && cur && !cur.note) cur.note = note;
    if (!marks.length) { if (multi && subj && cur && !cur.subjects.includes(subj)) cur.subjects.push(subj); continue; }
    if (multi && !subs.includes(subj)) { report.bad.push('السطر ' + i + ': المادة «' + (subjRaw || 'فارغة') + '» ليست من مواد القسم'); continue; }
    if (multi && !cur.subjects.includes(subj)) cur.subjects.push(subj);
    for (const [c, v, ci] of marks) {
      const off = officialFor(dp, subj, c);
      let h = null;
      if (TICKS.includes(v)) h = off || d.periods[trackOf(c)] || null;
      else if (/^\d+(\.0+)?$/.test(v) && +v >= 0 && +v <= 40) h = Math.round(+v);
      if (!h) { report.bad.push('السطر ' + i + '، ' + sheetClass(c) + ': «' + v + '»' + (TICKS.includes(v) ? ' بلا حصص مقررة لهذه المادة' : ' ليست ✓ ولا عدداً')); continue; }
      if (off && h !== off) report.odd++;
      (cur.parts[c] = cur.parts[c] || []).push({ subj, h });
    }
  }
  // Same shape as the editor: one card per teacher, two subjects in a class kept in `split`.
  const teachers = out.map(t => {
    const x = { name: t.name, cells: {}, note: t.note, subjects: multi ? t.subjects : [], subj: {}, split: {} };
    for (const c of CLASSES) if (t.parts[c]) setParts(x, c, t.parts[c]);
    return x;
  });
  const dup = [...dupes(teachers)].filter(c => {
    const seen = {};
    return teachers.some(t => c in t.cells && partsOf(dp, t, c).some(p => { const k = p.subj || dp; if (seen[k]) return true; seen[k] = 1; return false; }));
  });
  return { teachers, report: { ...report, dup } };
}

// ---- PDF and image: the same form drawn as a page ----
// `bare`: the on-screen preview — the same table without the official header and signatures (screens carry no logo).
function formPage(dp, d, bare) {
  const multi = isMulti(dp), classes = formClasses(d), rows = formRows(dp, d);
  const th = t => el('th', { textContent: t });
  const table = el('table', { className: 'fp-t' },
    el('thead', {}, el('tr', {}, ...['م', 'المعلم', 'النصاب', 'المادة', ...classes.map(sheetClass), 'ملاحظات'].map(th))),
    el('tbody', {}, ...rows.flatMap((t, i) => t.lines.map((line, j) => {
      const total = t.lines.reduce((a, l) => a + Object.values(l.cells).reduce((x, y) => x + y, 0), 0);
      const tr = el('tr');
      if (j === 0) tr.append(el('td', { rowSpan: t.lines.length, textContent: i + 1 }), el('td', { rowSpan: t.lines.length, className: 'fp-n', textContent: t.nick }), el('td', { rowSpan: t.lines.length, className: 'fp-s', textContent: total }));
      tr.append(el('td', { textContent: line.subj || '' }));
      classes.forEach(c => { const off = officialFor(dp, multi ? line.subj : null, c), v = cellMark(dp, line.subj, c, line.cells[c]); tr.append(el('td', { className: !off && v === '' ? 'fp-off' : v !== '' ? 'fp-on' : '', textContent: v })); });
      if (j === 0) tr.append(el('td', { rowSpan: t.lines.length, className: 'fp-note', textContent: withHeadNote(dp, t.nick, t.note) }));
      return tr;
    }))));
  const have = rows.length, req = d.required;
  const sum = [el('div', { className: 'fp-cap', textContent: 'ميزانية المعلمين' }),
    el('table', { className: 'fp-t fp-sum' }, el('tr', {}, ...['العدد المطلوب', 'الموجود', 'العجز', 'ملاحظات'].map(th)),
      el('tr', {}, el('td', { textContent: req ?? '' }), el('td', { textContent: have }), el('td', { textContent: req == null ? '' : req - have }), el('td')))];
  if (bare) return el('div', { className: 'fp fp-bare' }, table, ...sum);
  return el('div', { className: 'fp' },
    el('div', { className: 'fp-head' },
      el('div', { className: 'fp-side' }, el('img', { src: FORM.logos.ministry, className: 'fp-moe' }), el('b', { textContent: FORM.ministry }), el('span', { textContent: FORM.region }), el('span', { textContent: FORM.school })),
      el('div', { className: 'fp-mid' }, el('div', { className: 'fp-title', textContent: 'ميزانية الأقسام العلمية للعام الدراسي ' + FORM.year }), el('div', { className: 'fp-dept', textContent: 'القسم العلمي / ' + dp })),
      el('div', { className: 'fp-side' }, el('img', { src: FORM.logos.school, className: 'fp-school' }), el('span', { textContent: 'العام الدراسي ' + FORM.year }))),
    el('div', { className: 'fp-line' }), table, ...sum,
    el('div', { className: 'fp-sign' },
      el('div', {}, el('b', { textContent: 'رئيس القسم' }), el('div', { textContent: headOf(dp) }), el('div', { textContent: 'التوقيع: ....................' })),
      el('div', {}, el('b', { textContent: 'مدير المدرسة' }), el('div', { textContent: FORM.principal }), el('div', { textContent: 'التوقيع: ....................' }))));
}
async function formCanvas(dp, d) {
  await needCanvas();
  const page = formPage(dp, d), host = el('div', { className: 'fp-host' }, page);
  document.body.append(host);
  try {
    await Promise.all([...page.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return await html2canvas(page, { scale: 2, backgroundColor: '#ffffff' });
  } finally { host.remove(); }
}
const fileBase = dp => 'ميزانية_' + dp.replace(/\s+/g, '_');
async function downloadForm(kind, dp, d, msgEl) {
  msgEl.textContent = 'جارٍ إنشاء الملف...';
  try {
    if (kind === 'xlsx') saveBlob(await buildXlsx(dp, d), fileBase(dp) + '_نموذج_المنصة.xlsx');
    else {
      const canvas = await formCanvas(dp, d);
      if (kind === 'png') saveBlob(await new Promise(r => canvas.toBlob(r, 'image/png')), fileBase(dp) + '.png');
      else {
        const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = 297, H = 210, m = 8, k = Math.min((W - 2 * m) / canvas.width, (H - 2 * m) / canvas.height);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - canvas.width * k) / 2, m, canvas.width * k, canvas.height * k);
        saveBlob(pdf.output('blob'), fileBase(dp) + '.pdf');
      }
    }
    msgEl.textContent = 'نُزّل الملف ✓';
  } catch (e) { msgEl.textContent = 'تعذر إنشاء الملف: ' + e; }
}

// ---- In the editor: the form card (downloads, upload, review before saving) ----
function formReportView(rep) {
  const items = [];
  if (rep.unknown.length) items.push('أسماء ليست في قائمة معلمي القسم (قُبلت كما كُتبت): ' + [...new Set(rep.unknown)].join('، '));
  if (rep.dup.length) items.push('مادة عند أكثر من معلم في: ' + rep.dup.map(sheetClass).join('، '));
  if (rep.odd) items.push(rep.odd + ' خانة تخالف المقرر (تظهر حمراء في البطاقات)');
  if (rep.bad.length) items.push('أُهملت ' + rep.bad.length + ' قيمة: ' + rep.bad.slice(0, 8).join(' · ') + (rep.bad.length > 8 ? ' …' : ''));
  if (rep.orphan.length) items.push('أسطر فيها حصص بلا معلم فوقها (أُهملت): ' + rep.orphan.join('، '));
  return items.length ? el('ul', { className: 'fp-rep' }, ...items.map(t => el('li', { textContent: t }))) : el('div', { className: 'meta', textContent: 'لا ملاحظات على الملف.' });
}
function applyForm(parsed) {
  BUDGET.review = BUDGET.review || JSON.parse(JSON.stringify(BUDGET.data));
  BUDGET.data.teachers = parsed.teachers;
  renderBudget();
  const ok = el('button', { type: 'button', textContent: 'اعتماد وحفظ' }), no = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  ok.onclick = () => { BUDGET.review = null; $('beReview').replaceChildren(); $('beReview').classList.add('hidden'); changed(); };
  no.onclick = () => { BUDGET.data = BUDGET.review; BUDGET.review = null; $('beReview').replaceChildren(); $('beReview').classList.add('hidden'); renderBudget(); $('beMsg').textContent = 'أُلغي ما جاء من الملف'; };
  $('beReview').replaceChildren(el('b', { textContent: 'مُعبّأ من الملف — راجع البطاقات ثم اضغط «اعتماد وحفظ». لم يُحفظ شيء بعد.' }), formReportView(parsed.report), el('div', { className: 'row' }, ok, no));
  $('beReview').classList.remove('hidden');
  $('beReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
['xlsx', 'pdf', 'png'].forEach(k => { $('form_' + k).onclick = () => BUDGET && BUDGET.data && downloadForm(k, BUDGET.department, BUDGET.data, $('formMsg')); });
$('formUpload').onclick = () => $('formFile').click();
$('formFile').onchange = async () => {
  const f = $('formFile').files[0]; $('formFile').value = '';
  if (!f || !BUDGET || !BUDGET.data) return;
  if (!/\.xlsx$/i.test(f.name)) { $('formMsg').textContent = 'يُقرأ آلياً ملف Excel من نموذج المنصة فقط. ' + FORM_PLEA; return; }
  $('formMsg').textContent = 'جارٍ قراءة الملف...';
  try { applyForm(await readForm(f, BUDGET.department, BUDGET.data)); $('formMsg').textContent = ''; }
  catch (e) { $('formMsg').textContent = String(e); }
};
$('formPlea').textContent = FORM_PLEA;
$('budgetPlea').textContent = FORM_PLEA;

// ---- On the head's form: download the template; an attached template fills the budget instead ----
$('budgetTemplate').onclick = async () => {
  const t = person(); if (!t) return;
  $('budgetState').textContent = 'جارٍ إنشاء النموذج...';
  try { const o = await call('budget_get', { department: t.department, name: t.name }); await downloadForm('xlsx', t.department, o.budget.data, $('budgetState')); }
  catch (e) { $('budgetState').textContent = String(e); }
};
// Called by the attachment picker for each new file; true = handled here (not attached).
async function offerForm(file) {
  const t = person(), fdp = t && t.is_head ? await isFormFile(file) : false;
  if (!fdp) return false;
  const yes = el('button', { type: 'button', textContent: 'املأ الميزانية منه' }), no = el('button', { type: 'button', className: 'ghost', textContent: 'أرفقه كما هو' });
  const box = el('div', { className: 'fp-ask' }, el('div', {}, '«', el('bdi', { textContent: file.name }), '» هو نموذج المنصة' + (fdp !== t.department ? ' لقسم «' + fdp + '»' : '') + '. هل أملأ ميزانية القسم منه؟'), el('div', { className: 'row' }, yes, no));
  $('formAsk').replaceChildren(box);
  return new Promise(res => {
    no.onclick = () => { $('formAsk').replaceChildren(); res(false); };
    yes.onclick = () => {
      $('formAsk').replaceChildren(); res(true);
      openBudget(t.department, t.name, () => { $('teacher').classList.remove('hidden'); if (ROLE === 'admin') $('admin').classList.remove('hidden'); stateKey = ''; showBudgetState(); },
        async () => { try { applyForm(await readForm(file, BUDGET.department, BUDGET.data)); } catch (e) { $('formMsg').textContent = String(e); } });
    };
  });
}
