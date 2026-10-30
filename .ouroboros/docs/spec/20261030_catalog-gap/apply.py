#!/usr/bin/env python3
"""build_rows.py 결과(out-build/)를 worktree 정본에 반영한다. 매번 git HEAD 원본에서 다시 만든다(재실행 안전)."""
import csv, io, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WT = sys.argv[1]
BASE = "8ba8a60"  # 갭 보강 직전(v0.55.0) — 언제나 이 원본에서 다시 만든다(커밋 뒤 다시 돌려도 같은 결과)
B = f"{HERE}/out-build"
TAG = "// 오픈짐 대조 갭 보강 @plm SRS-094"

def head(rel):
    return subprocess.run(["git", "-C", WT, "show", f"{BASE}:{rel}"], capture_output=True, text=True, check=True).stdout

def write(rel, s):
    open(f"{WT}/{rel}", "w", encoding="utf-8").write(s)

final = json.load(open(f"{B}/final.json"))
names = {n["id"]: n["name_ko"] for n in final}

# 1) 마스터 — 끝에 덧붙임
rel = "src/core/src/data/catalog/catalog.master.csv"
src = head(rel)
# 기존 행은 별칭 **추가만**(qa spec H-2 — 같은 동작을 새 종목 대신 별칭으로)
extra = json.load(open(f"{B}/existing_aliases.json"))
mrows = list(csv.reader(io.StringIO(src)))
mh = mrows[0]
iE, iK, iN = mh.index("id_en"), mh.index("aliases_ko"), mh.index("aliases_en")
hit = set()
for r in mrows[1:]:
    if r and r[iE] in extra:
        ko, en = extra[r[iE]]
        r[iK] = ";".join([x for x in r[iK].split(";") if x] + ko)
        r[iN] = ";".join([x for x in r[iN].split(";") if x] + en)
        hit.add(r[iE])
assert hit == set(extra), set(extra) - hit
out = io.StringIO()
csv.writer(out, lineterminator="\n").writerows(mrows)
src2 = out.getvalue()
add = open(f"{B}/rows.csv", encoding="utf-8").read() + open(f"{B}/merge_rows.csv", encoding="utf-8").read()
write(rel, src2 + add)
# 다시 쓴 CSV 가 별칭 칸 말고는 원본과 같은가(따옴표 방식 차이로 다른 줄이 바뀌지 않게)
changed = [a for a, b in zip(src.splitlines(), src2.splitlines()) if a != b]
assert len(changed) == len(extra), f"별칭 말고 바뀐 줄: {len(changed)}"

# 2) family — 새 행 + 허용 기구 넓힘, family 이름순 유지
rel = "src/core/src/data/catalog/catalog.families.csv"
rows = list(csv.DictReader(io.StringIO(head(rel))))
hdr = list(rows[0].keys())
patch = json.load(open(f"{B}/families.patch.json"))
for r in rows:
    if r["family"] in patch["widen"]:
        r["equipments"] = patch["widen"][r["family"]]
rows += patch["new"]
rows.sort(key=lambda r: r["family"])
out = io.StringIO()
w = csv.DictWriter(out, fieldnames=hdr, lineterminator="\n")
w.writeheader()
w.writerows(rows)
write(rel, out.getvalue())

# 3) 픽토그램 원형 — FAMILY_ARCH 닫는 줄 앞
rel = "src/core/src/data/pictograms/render.ts"
s = head(rel)
arch = json.load(open(f"{B}/arch.json"))
start = s.index("export const FAMILY_ARCH")
end = s.index("\n};", start)
block = f"\n  {TAG} — 새 동작 그룹은 가장 가까운 기존 원형을 쓴다\n" + "".join(f"  {f}: '{a}',\n" for f, a in arch.items())
s = s[:end] + block.rstrip("\n") + s[end:]
write(rel, s)

# 4) 스무고개 — 해당 부위·세부 질문 줄의 ids 끝에
rel = "src/core/src/domain/exerciseFinder.ts"
lines = head(rel).splitlines(keepends=True)
finder = json.load(open(f"{B}/finder.json"))
want = {}
for i, (m, k) in finder.items():
    want.setdefault((m, k), []).append(i)
cur = None
done = set()
for idx, line in enumerate(lines):
    m = re.match(r"\s{2}(\w+): \[$", line.rstrip("\n"))
    if m:
        cur = m.group(1)
        continue
    m = re.search(r"key: '(\w+)'", line)
    if m and cur and (cur, m.group(1)) in want:
        ids = want[(cur, m.group(1))]
        j = line.index("] }")
        line = line[:j] + ", " + ", ".join(f"'{i}'" for i in ids) + line[j:]
        if "@plm SRS-094" not in line:
            line = line.rstrip("\n") + " // 오픈짐 대조 갭 보강 @plm SRS-094\n"
        lines[idx] = line
        done.add((cur, m.group(1)))
missing = set(want) - done
if missing:
    sys.exit(f"스무고개 질문을 못 찾음: {missing}")
write(rel, "".join(lines))

# 5) 대체 패턴 — PATTERN_BY_ID 닫는 줄 앞
rel = "src/core/src/domain/movementPatterns.ts"
s = head(rel)
pat = json.load(open(f"{B}/pattern.json"))
start = s.index("const PATTERN_BY_ID")
end = s.index("\n};", start)
block = f"\n  {TAG}(같은 family 기존 종목의 패턴을 잇는다)\n" + "".join(
    f"  \"{i}\": '{p}', // {names[i]}\n" for i, p in pat.items())
s = s[:end] + block.rstrip("\n") + s[end:]
write(rel, s)
print("반영:", len(final), "종목")
