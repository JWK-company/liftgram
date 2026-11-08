#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""제작 키 → 칠할 부위(주동근, 보조근). 앱 종목 마스터 표(primary·secondary)를 muscle.py 의 부위 이름으로 옮긴다.
사용: muscle_table.py <catalog.json> <catalog.master.csv> <출력 muscles.json>
한 키가 여러 종목에 연결되면 첫 종목(이름순)의 근육을 쓴다. 앱 근육 묶음(back·shoulders·abs·fullBody)은 동작 묶음·키 이름으로 세분한다."""
import csv, json, re, sys
def slug(s): return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")
def split(s): return [x for x in (s or "").split(";") if x]
def regions(g, key, fam):
    k = key.split("__")[0]
    if g == "back":
        if fam == "hinge" or re.search(r"extension|hyper|good_morning|superman|deadlift", k): return ["lower_back"]
        return ["lats"]
    if g == "shoulders":
        if re.search(r"lateral|upright|y_raise|w_raise|lu_raise", k): return ["side_delts"]
        if re.search(r"rear|face_pull|reverse_fly|pull_apart|band_pull", k): return ["rear_delts"]
        if re.search(r"front_raise|plate_raise", k): return ["front_delts"]
        return ["front_delts", "side_delts"]
    if g == "abs": return ["abs", "obliques"] if re.search(r"twist|side|oblique|russian|wood|windmill|pallof|bicycle|landmine_180", k) else ["abs"]
    if g == "glutes": return ["glutes"]
    if g == "quads": return ["quads"]
    if g in ("chest", "hamstrings", "calves", "biceps", "triceps", "forearms", "traps"): return [g]
    if g == "fullBody": return ["quads", "glutes"]
    return []   # other 등은 칠하지 않는다
def main(cat_p, csv_p, out_p):
    C = json.load(open(cat_p)); rows = {"seed-"+slug(r["id_en"]): r for r in csv.DictReader(open(csv_p, encoding="utf-8"))}
    out, miss = {}, []
    for key, E in C["keys"].items():
        ids = sorted(i for i, k in C["links"].items() if k == key); r = next((rows[i] for i in ids if i in rows), None)
        if not r: miss.append(key); continue
        fam = E.get("family"); p = [y for g in split(r["primary"]) for y in regions(g, key, fam)]
        s = [y for g in split(r["secondary"]) for y in regions(g, key, fam) if y not in p]
        if "chest" in p or "triceps" in p: s = [y for y in s if y != "side_delts"]   # 미는 동작의 보조 어깨는 앞어깨
        if "adduction" in key and "abduction" not in key: p = ["adductors"]
        if p or s: out[key] = [sorted(set(p)), sorted(set(s))]
    json.dump(out, open(out_p, "w"), ensure_ascii=False, indent=0, sort_keys=True); print("부위표", len(out), "근육 정보 없음", len(miss), miss[:5])
if __name__ == "__main__": main(*sys.argv[1:])
