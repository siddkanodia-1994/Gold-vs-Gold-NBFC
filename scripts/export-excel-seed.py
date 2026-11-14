"""One-off: export the 5-year history from the original Excel model into
data/seed-history.json (the dashboard's starting history).

Usage: python3 scripts/export-excel-seed.py "<path to Gold Vs Gold NBFC Regression.xlsx>"

Share closes come from the 'Ratio chart' sheet (cols A:C) and gold from the
'Gold Data' sheet (MCX Gold M spot, Rs/10g). A share day missing from Gold Data
(special weekend sessions: Budget days, Muhurat, DR drills) takes the gold the
workbook used in its column D, so every number reproduces the workbook.
"""
import datetime as dt
import json
import sys

import openpyxl

path = sys.argv[1]
wb = openpyxl.load_workbook(path, data_only=True, read_only=True)

rows: dict[str, dict] = {}
for d, g in wb["Gold Data"].iter_rows(min_row=2, max_col=2, values_only=True):
    if isinstance(d, dt.datetime) and isinstance(g, (int, float)):
        rows.setdefault(d.date().isoformat(), {})["g"] = float(g)

carried = 0
for d, mu, ma, g in wb["Ratio chart"].iter_rows(min_row=2, max_col=4, values_only=True):
    if not isinstance(d, dt.datetime):
        continue
    key = d.date().isoformat()
    r = rows.setdefault(key, {})
    r["mu"], r["ma"] = float(mu), float(ma)
    if "g" not in r:
        carried += 1
        r["g"] = r["_sheetGold"] = float(g)

out = [{"d": k, **{f: v for f, v in r.items() if not f.startswith("_")}} for k, r in sorted(rows.items())]
json.dump({"source": path.split("/")[-1], "rows": out}, open("data/seed-history.json", "w"), separators=(",", ":"))

print(f"{len(out)} dates, {sum('mu' in r for r in out)} share days, {sum('g' in r for r in out)} gold days, {carried} gold values taken from the Ratio chart sheet")
