#!/usr/bin/env python3
"""Guards run before every push: `python3 tools/guards.py` (exit 1 = do not push).

1. Size guard (tools/size_guard.py): a big file does not grow, a new file stays under the limit.
2. Deleted stays deleted: each entry says what was removed and why, so a copy from an old
   branch is caught.
3. The front end still parses (node --check), when node is available.
4. Browser regressions (tools/ui_regress.js, mocked API), when playwright is available.
"""
import os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


# 1. Size guard
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'size_guard.py')], cwd=ROOT)
if r.returncode:
    fails.append('size guard failed (see above)')

# 2. Deleted stays deleted
# 2026-10-14 cleanup: the sheet-row table of a constraint had no caller since the details
# screen dropped it.
if re.search(r'function sheetRow\b', read('web/app.js')):
    fails.append('⛔ sheetRow came back in web/app.js — removed 2026-10-14, nothing called it')
if 'table.sr' in read('web/index.html'):
    fails.append('⛔ the table.sr style came back in web/index.html — removed 2026-10-14 with sheetRow')
# 2026-10-14 cleanup: the first Apps Script version (CLAUDE.md: «قديم غير مستعمل»).
for old in ('Code.gs', 'Index.html'):
    if os.path.exists(os.path.join(ROOT, old)):
        fails.append('⛔ ' + old + ' came back — the old Apps Script version was removed 2026-10-14 (unused)')

# 3. Syntax
if shutil.which('node'):
    for js in ('web/app.js', 'web/grid.js'):
        r = subprocess.run(['node', '--check', os.path.join(ROOT, js)], capture_output=True, text=True)
        if r.returncode:
            fails.append(js + ' does not parse: ' + r.stderr.strip()[:300])

# 4. Browser regressions of the 2026-10-14 review (skipped without playwright: exit 2)
if shutil.which('node'):
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/opt/node-tools/node_modules')
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'ui_regress.js')], capture_output=True, text=True, env=env, timeout=600)
    out = '\n'.join(l for l in r.stdout.splitlines() if l.startswith(('ok', 'FAIL', 'ui_regress')))
    print(out)
    if r.returncode == 1:
        fails.append('browser regressions failed (tools/ui_regress.js, see above)')

if fails:
    print('\n'.join(fails))
    sys.exit(1)
print('guards: all pass')
