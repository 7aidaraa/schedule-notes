#!/usr/bin/env node
// Browser regressions of web/ against a mocked API (no network, no password, no database).
// Run: NODE_PATH=/opt/node-tools/node_modules node tools/ui_regress.js   (exit 0 = all pass, 2 = playwright missing)
// Each case is a bug found in the review of 2026-10-14; the case fails on the code before its fix.
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

let chromium;
for (const t of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(t)); break; } catch (e) { /* next */ } }
if (!chromium) { console.log('ui_regress: skipped (playwright not found)'); process.exit(2); }

const WEB = path.join(__dirname, '..', 'web');
const T0 = [
  { name: 'أحمد علي حسن', department: 'الرياضيات', nick: 'أحمد علي', subject: 'الرياضيات', subject2: '' },
  { name: 'خالد سالم محمد', department: 'الرياضيات', nick: 'خالد سالم', subject: 'الإحصاء', subject2: '' }];
const rule = (id, target_type, target, ctype, value) => ({ id, department: 'الرياضيات', text: '', level: 'صلب', reason: '', request_id: null, target_type, target, ctype,
  pattern: '', value, weight: null, active: true, duration: 'ثابتة', sheet_state: 'مسجّل', link_id: null, checked: false, approved: false, sheet_text: '' });

function mock(calls) {
  const T = T0.map(t => ({ ...t })); // each case starts from the same teachers
  return body => {
    calls.push(body);
    if (body.action === 'login') return { role: 'admin', teachers: T, phones: {} };
    // 2001: the teacher's row written as the sheet spells the name (no hamza), not as its nick.
    if (body.action === 'rules') return { rows: [rule(2001, 'معلّم', 'احمد علي', 'لا حصّة', '1'), rule(2002, 'دور', 'رؤساء الأقسام', 'لا حصّة', '7')], types: [],
      groups: [{ name: 'رؤساء الأقسام', members: 'أحمد علي', note: '', kind: 'دور', parent: '' }] };
    if (body.action === 'teacher_save') { const t = T.find(x => x.name === body.old); if (t) Object.assign(t, { name: body.name, nick: body.nick }); }
    if (body.action === 'grid_save') return { ok: true, ids: (body.add || []).map((_, i) => 3000 + i) };
    return { ok: true };
  };
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
async function waitPort(port) {
  for (let i = 0; i < 60; i++) {
    if (await new Promise(r => { const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); }); c.on('error', () => r(false)); })) return;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('static server did not start');
}

const CASES = {
  // Renaming a role from its page: back on the page, it is the page of the new name (not an empty page of the old one,
  // whose grid would then save constraints for a role that no longer exists).
  async groupRename(page, calls) {
    await page.evaluate(() => openTarget('دور', 'رؤساء الأقسام'));
    await page.click('text=✏️ الاسم والأعضاء');
    await page.fill('.cform input', 'رؤساء الشعب');
    await page.click('#fabSave');
    await page.waitForTimeout(700);
    const title = await page.textContent('#scrTitle');
    if (!calls.some(c => c.action === 'group_save' && c.name === 'رؤساء الشعب' && c.old === 'رؤساء الأقسام')) return 'group_save was not sent';
    if (!title.includes('رؤساء الشعب')) return 'after the rename the page is still «' + title + '»';
    if (!(await page.$('text=✏️ الاسم والأعضاء'))) return 'the renamed role\'s page lost its edit button (old name has no group)';
    const n = await page.$$eval('.wk td button.hard', b => b.length);
    if (n !== 5) return 'the renamed role\'s grid shows ' + n + ' hard cells, not its 5';
    return '';
  },
  // The same for a teacher whose nick changes (the helper both forms share).
  async teacherRename(page, calls) {
    await page.evaluate(() => openTarget('معلّم', 'خالد سالم'));
    await page.click('button[title="تعديل المعلم"]');
    await page.fill('.cform input >> nth=1', 'خالد السالم');
    await page.click('#fabSave');
    await page.waitForTimeout(900);
    const title = await page.textContent('#scrTitle');
    if (!calls.some(c => c.action === 'teacher_save' && c.nick === 'خالد السالم')) return 'teacher_save was not sent';
    if (!title.includes('خالد السالم')) return 'after the rename the page is «' + title + '»';
    return '';
  },
  // A teacher's row whose target is spelled differently from the nick (hamza, spaces): the server deletes a row only
  // when its target equals the one sent, so each spelling must be sent as its own target.
  async gridVariantTarget(page, calls) {
    await page.evaluate(() => openTarget('معلّم', 'أحمد علي'));
    await page.click('.wk tr:nth-child(2) td:nth-child(2) button');
    await page.click('.sheetMenu .opt.free');
    await page.click('#fabSave');
    await page.waitForTimeout(700);
    const saves = calls.filter(c => c.action === 'grid_save');
    if (!saves.length) return 'grid_save was not sent';
    const bad = saves.filter(c => (c.del || []).includes(2001) && c.target !== 'احمد علي');
    if (bad.length) return 'row 2001 (target «احمد علي») was sent for deletion under target «' + bad[0].target + '»: the server would keep it';
    if (!saves.some(c => (c.del || []).includes(2001))) return 'row 2001 was not deleted';
    return '';
  },
  // Pulling down to refresh in «القائمة» must not throw away sheet wording typed and not saved yet.
  async pullKeepsDraft(page, calls) {
    const pull = async () => {
      await page.evaluate(() => {
        scrollTo(0, 0);
        const t = (type, y) => { const touch = new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: y });
          dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true })); };
        t('touchstart', 100); t('touchmove', 300); t('touchend', 300);
      });
      await page.waitForTimeout(500);
    };
    await page.click('#rvList');
    let n0 = calls.filter(c => c.action === 'rules').length;
    await pull();
    if (calls.filter(c => c.action === 'rules').length !== n0 + 1) return 'with nothing unsaved, the pull did not reload';
    await page.fill('.stx textarea', 'نص لم يُحفظ');
    n0 = calls.filter(c => c.action === 'rules').length;
    await pull();
    const v = await page.inputValue('.stx textarea');
    if (v !== 'نص لم يُحفظ') return 'the pull reloaded the list and lost the unsaved wording';
    if (calls.filter(c => c.action === 'rules').length !== n0) return 'the pull reloaded while a wording was unsaved';
    return '';
  },
};

(async () => {
  const port = await freePort();
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: WEB, stdio: 'ignore', detached: true });
  let failed = 0;
  const browser = await chromium.launch();
  try {
    await waitPort(port);
    const only = process.argv[2];
    for (const [name, run] of Object.entries(CASES)) {
      if (only && only !== name) continue;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      const calls = [];
      const api = mock(calls);
      await ctx.route('**/functions/v1/api', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api(JSON.parse(r.request().postData() || '{}'))) }));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      let why;
      try {
        await page.goto('http://127.0.0.1:' + port + '/index.html');
        await page.fill('#pass', 'x'); await page.click('#loginBtn');
        await page.waitForSelector('#coverView .sec');
        why = await run(page, calls);
      } catch (e) { why = 'crashed: ' + String(e).slice(0, 200); }
      if (!why && errors.length) why = 'page error: ' + errors[0].slice(0, 200);
      console.log((why ? 'FAIL ' : 'ok   ') + name + (why ? ' — ' + why : ''));
      if (why) failed++;
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch (e) { server.kill(); }
  }
  process.exit(failed ? 1 : 0);
})();
