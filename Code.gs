// Teacher requests web app (Google Apps Script, bound to a Google Sheet).
// Script Properties: ADMIN_PASS (required), TEACHER_PASS (optional, default "معلم").

const SHEET_NAME = 'الطلبات';
const HEADERS = ['المعرف', 'التاريخ', 'الاسم الرباعي', 'الطلب', 'السبب', 'الحالة', 'ملاحظاتي', 'معرف المرفق', 'اسم المرفق'];
const DONE = 'تم';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('طلبات المعلمين')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function role_(pass) {
  const p = PropertiesService.getScriptProperties();
  const admin = p.getProperty('ADMIN_PASS');
  const teacher = p.getProperty('TEACHER_PASS') || 'معلم';
  pass = String(pass || '').trim();
  if (admin && pass === admin) return 'admin';
  if (pass === teacher) return 'teacher';
  return null;
}

function requireRole_(pass, role) {
  if (role_(pass) !== role) throw new Error('غير مصرح');
}

function login(pass) {
  const r = role_(pass);
  if (!r) throw new Error('كلمة السر غير صحيحة');
  return r;
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function folder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder deleted: recreate */ }
  }
  const f = DriveApp.createFolder('مرفقات طلبات المعلمين');
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

// Trim, cap length, and block spreadsheet formula injection.
function clean_(s, max) {
  s = String(s || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function findRow_(sh, id) {
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  throw new Error('الطلب غير موجود');
}

function submitRequest(pass, data) {
  requireRole_(pass, 'teacher');
  const name = clean_(data.name, 120);
  const request = clean_(data.request, 3000);
  const reason = clean_(data.reason, 3000);
  if (!name || !request || !reason) throw new Error('جميع الحقول مطلوبة');

  let fileId = '', fileName = '';
  if (data.file) {
    if (ALLOWED_TYPES.indexOf(data.file.type) < 0) throw new Error('المرفق يجب أن يكون PDF أو صورة');
    const bytes = Utilities.base64Decode(data.file.data);
    if (bytes.length > MAX_FILE_BYTES) throw new Error('حجم المرفق يتجاوز 10 ميغابايت');
    const fname = String(data.file.name || 'مرفق').slice(0, 150);
    const file = folder_().createFile(Utilities.newBlob(bytes, data.file.type, name + ' - ' + fname));
    fileId = file.getId();
    fileName = clean_(fname, 150);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet_().appendRow([Utilities.getUuid(), new Date(), name, request, reason, 'جديد', '', fileId, fileName]);
  } finally {
    lock.releaseLock();
  }
  return true;
}

function listRequests(pass) {
  requireRole_(pass, 'admin');
  const sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues().map(r => ({
    id: String(r[0]),
    date: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
    name: String(r[2]),
    request: String(r[3]),
    reason: String(r[4]),
    done: r[5] === DONE,
    note: String(r[6]),
    fileId: String(r[7]),
    fileName: String(r[8]),
  })).reverse();
}

function setDone(pass, id, done) {
  requireRole_(pass, 'admin');
  const sh = sheet_();
  sh.getRange(findRow_(sh, id), 6).setValue(done ? DONE : 'جديد');
  return true;
}

function saveNote(pass, id, note) {
  requireRole_(pass, 'admin');
  const sh = sheet_();
  sh.getRange(findRow_(sh, id), 7).setValue(clean_(note, 3000));
  return true;
}

// Only serves files referenced by a request row, never arbitrary Drive files.
function getFile(pass, id) {
  requireRole_(pass, 'admin');
  const sh = sheet_();
  const fileId = String(sh.getRange(findRow_(sh, id), 8).getValue());
  if (!fileId) throw new Error('لا يوجد مرفق');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { name: blob.getName(), type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}
