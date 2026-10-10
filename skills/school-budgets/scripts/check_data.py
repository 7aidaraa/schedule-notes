#!/usr/bin/env python3
"""Check a school-budgets data file against the skill's format (references/data-format.md).

Usage: python3 check_data.py school-budgets-data.json
Prints every problem; exit code 1 when there is an error (warnings alone exit 0).
"""
import json
import re
import sys

CLASS_ID = re.compile(r"^(10|11a|11s|12a|12s)-\d+$")


def main(path):
    d = json.load(open(path, encoding="utf-8"))
    errors, warnings = [], []
    err, warn = errors.append, warnings.append

    if d.get("format") != "school-budgets" or d.get("version") != 1:
        err('format must be "school-budgets" and version 1')
    s = d.get("school") or {}

    # --- school ---
    grades = s.get("grades") or []
    tracks = [g.get("track") for g in grades]
    classes = [c for g in grades for c in g.get("classes", [])]
    if not grades:
        err("school.grades is empty")
    for g in grades:
        for k in ("track", "label", "short", "classes"):
            if k not in g:
                err(f"grade {g.get('track')}: missing «{k}»")
    for c in classes:
        if not CLASS_ID.match(c):
            err(f"class id «{c}» does not follow 10-N / 11a-N / 11s-N / 12a-N / 12s-N")
    if len(set(classes)) != len(classes):
        err("a class id appears in two grades")
    for c in s.get("hidden", []):
        if c not in classes:
            err(f"hidden class «{c}» is not in grades")
    official = s.get("official") or {}
    for subj, row in official.items():
        for c, h in row.items():
            if c not in classes:
                err(f"official «{subj}»: unknown class «{c}»")
            if not isinstance(h, int) or not 0 <= h <= 40:
                err(f"official «{subj}» {c}: periods must be an integer 0..40")
    subjects = s.get("subjects") or {}
    sheet = s.get("sheetSubject") or {}
    for dept, lst in subjects.items():
        for x in lst:
            if (sheet.get(x) or x) not in official:
                warn(f"subject «{x}» of «{dept}» has no official periods (cells will be gray)")
    for col in s.get("gridCols") or []:
        if not isinstance(col, list) or not 1 <= len(col) <= 3:
            err(f"gridCols entry {col!r}: expected [column, department?, subject?]")
    form = s.get("form") or {}
    for k in ("year", "ministry", "region", "school", "principal", "logos"):
        if k not in form:
            err(f"school.form: missing «{k}»")

    # --- teachers ---
    teachers = d.get("teachers") or []
    names = [t.get("name") for t in teachers]
    if len(set(names)) != len(names):
        err("teachers: a name appears twice (the name is the key)")
    depts = {t.get("department") for t in teachers}
    for t in teachers:
        if not t.get("name") or not t.get("department"):
            err(f"teacher {t!r}: name and department are required")
        if not isinstance(t.get("is_head", False), bool):
            err(f"teacher «{t.get('name')}»: is_head must be true/false")
    for dp in sorted(depts):
        if sum(1 for t in teachers if t.get("department") == dp and t.get("is_head")) == 0:
            warn(f"department «{dp}» has no head (nobody can open its budget with the heads' password)")

    # --- budgets ---
    for b in d.get("budgets") or []:
        dp = b.get("department")
        data = b.get("data") or {}
        if dp not in depts:
            warn(f"budget «{dp}»: department not in teachers (it is not shown)")
        per = data.get("periods") or {}
        for k in per:
            if k not in tracks:
                err(f"budget «{dp}»: periods key «{k}» is not a grade track")
        multi = dp in subjects
        for t in data.get("teachers") or []:
            who = f"budget «{dp}» / «{t.get('name')}»"
            if t.get("name") not in names:
                warn(f"{who}: not in teachers (added by hand in the editor)")
            cells = t.get("cells") or {}
            for c, h in cells.items():
                if c not in classes:
                    err(f"{who}: unknown class «{c}»")
                if not isinstance(h, int) or not 0 <= h <= 40:
                    err(f"{who} {c}: periods must be an integer 0..40")
            for c in (t.get("subj") or {}):
                if c not in cells:
                    err(f"{who}: subj for «{c}» without a cell")
            for c, parts in (t.get("split") or {}).items():
                if c not in cells or sum(parts.values()) != cells[c]:
                    warn(f"{who}: split of «{c}» does not add up to the cell (ignored by the page)")
            if multi:
                for x in t.get("subjects") or []:
                    if x not in subjects[dp]:
                        warn(f"{who}: subject «{x}» is not in school.subjects[«{dp}»]")

    for w in warnings:
        print("تنبيه:", w)
    for e in errors:
        print("خطأ:", e)
    print(f"{len(errors)} خطأ، {len(warnings)} تنبيه — {len(teachers)} معلماً، {len(d.get('budgets') or [])} ميزانية، {len(classes)} شعبة")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
