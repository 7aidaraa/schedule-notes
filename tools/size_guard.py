#!/usr/bin/env python3
"""Size guard: stops code files from growing back after a cleanup.

A ratchet. The baseline file records today's oversized files at their
current size; the guard fails when
  - a code file not in the baseline goes over the limit, or
  - a file in the baseline grows past its recorded size.
Shrinking is always allowed, and `--update` lowers recorded sizes (never
raises them). Copy this file into the repo's tools/ and call it from the
repo's checks.

Usage:
  python3 size_guard.py --init [--limit 1500] [--data 'banks/*' 'data/*.js']
                                 # write the baseline once; --data exempts files
                                 # that grow by design (content, generated)
  python3 size_guard.py          # check (exit 1 on violation)
  python3 size_guard.py --update # ratchet down after a file shrank

Baseline: .size-baseline.json at the repo root (committed).
Run from anywhere inside the repo.
"""
import argparse, fnmatch, json, os, re, subprocess, sys

CODE_EXT = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.gs', '.html', '.css', '.vue', '.svelte',
            '.dart', '.php', '.swift', '.kt', '.kts', '.java', '.go', '.rb', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.scss', '.sass', '.less', '.lua', '.sh', '.astro'}
SKIP = re.compile(r'(^|/)(dist|build|vendor|node_modules|\.next|coverage|graphify-out)/|\.min\.(js|css)$')


def root():
    return subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=True).stdout.strip()


def sizes(top, data_files):
    out = subprocess.run(['git', '-C', top, 'ls-files', '-z'], capture_output=True, check=True).stdout
    res = {}
    for p in out.decode('utf-8', 'replace').split('\0'):
        if not p or os.path.splitext(p)[1].lower() not in CODE_EXT or SKIP.search(p) or any(fnmatch.fnmatch(p, g) for g in data_files):
            continue
        try:
            with open(os.path.join(top, p), encoding='utf-8', errors='replace') as f:
                res[p] = sum(1 for _ in f)
        except OSError:
            pass
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--init', action='store_true')
    ap.add_argument('--update', action='store_true')
    ap.add_argument('--limit', type=int, default=1500)
    ap.add_argument('--data', nargs='*', default=[],
                    help='globs exempt from the guard: data and generated files that grow by design')
    a = ap.parse_args()
    top = root()
    path = os.path.join(top, '.size-baseline.json')

    if a.init:
        if os.path.exists(path):
            sys.exit('baseline exists; use --update to lower it')
        cur = sizes(top, a.data)
        base = {'limit': a.limit, 'data_files': a.data, 'files': {p: n for p, n in sorted(cur.items()) if n > a.limit}}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(base, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'baseline written: {len(base["files"])} file(s) over {a.limit} lines')
        return

    with open(path, encoding='utf-8') as f:
        base = json.load(f)
    limit, recorded = base['limit'], base['files']
    cur = sizes(top, base.get('data_files', []))

    if a.update:
        changed = 0
        for p in list(recorded):
            n = cur.get(p)
            if n is None or n <= limit:
                del recorded[p]; changed += 1
            elif n < recorded[p]:
                recorded[p] = n; changed += 1
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(base, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'baseline lowered: {changed} change(s)')
        return

    bad = []
    for p, n in sorted(cur.items()):
        if p in recorded:
            if n > recorded[p]:
                bad.append(f'{p}: {n} lines, was {recorded[p]} — it may not grow; put new code in a new file')
        elif n > limit:
            bad.append(f'{p}: {n} lines, limit {limit} — split it or put new code in a new file')
    if bad:
        print('size guard FAILED:\n  ' + '\n  '.join(bad))
        sys.exit(1)
    shrunk = [p for p in recorded if cur.get(p, 0) < recorded[p]]
    note = f' ({len(shrunk)} file(s) shrank: run --update to lock it in)' if shrunk else ''
    print(f'size guard ok: {len(cur)} code file(s), {len(recorded)} grandfathered{note}')


if __name__ == '__main__':
    main()
