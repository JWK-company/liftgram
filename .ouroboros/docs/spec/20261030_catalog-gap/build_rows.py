#!/usr/bin/env python3
"""오픈짐 대조 결과(merged-new.json, A·B 등급) → 카탈로그 정본 변경안.

출력(out-build/):
  rows.csv            마스터에 덧붙일 행(헤더 없음)
  families.patch.json 새 family 행 · 기존 family 의 허용 기구 넓힘
  arch.json           새 family → 픽토그램 원형
  finder.json         새 종목 id → (부위, 세부 질문 key)
  pattern.json        새 종목 id → 대체 패턴
  report.txt          확인할 것
"""
import csv, io, json, re, sys, os, collections, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
WT = sys.argv[1]
BASE = "8ba8a60"  # 갭 보강 직전(v0.55.0) — 언제나 이 원본에서 다시 만든다(커밋 뒤 다시 돌려도 같은 결과)  # worktree 루트
CAT = f"{WT}/src/core/src/data/catalog"
OUT = f"{HERE}/out-build"

def head(rel):  # 언제나 git HEAD 원본을 읽는다(적용 뒤 다시 돌려도 같은 결과)
    return subprocess.run(["git", "-C", WT, "show", f"{BASE}:{rel}"], capture_output=True, text=True, check=True).stdout
os.makedirs(OUT, exist_ok=True)

def seed_id(en):
    return "seed-" + re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", en.lower()))

master = list(csv.DictReader(io.StringIO(head("src/core/src/data/catalog/catalog.master.csv"))))
fams = list(csv.DictReader(io.StringIO(head("src/core/src/data/catalog/catalog.families.csv"))))
fam_by = {f["family"]: f for f in fams}
cand = [n for n in json.load(open(f"{HERE}/merged-new.json")) if n["tier"] in ("A", "B")]

# ── 손 정리(대조 뒤 검토) ──
by_ko = {n["name_ko"]: n for n in cand}
# 1) 맨몸 싱글 레그 데드리프트 = 싱글 레그 루마니안 데드리프트(같은 동작) — 하나로
keep, drop = by_ko["싱글 레그 데드리프트"], by_ko["싱글 레그 루마니안 데드리프트"]
keep["aliases_ko"] = list(dict.fromkeys(keep["aliases_ko"] + ["싱글 레그 루마니안 데드리프트"] + drop["aliases_ko"]))
keep["aliases_en"] = list(dict.fromkeys(keep["aliases_en"] + drop["aliases_en"] + [drop["name_en"]]))
keep["og"] = keep["og"] + drop["og"]
keep["tier"] = "A"
cand.remove(drop)
for n in cand:
    if n["family"] == "single_leg_rdl":
        n["family"] = "single_leg_deadlift"
        n["family_is_new"] = True
# 2) 핀 프레스 = 벤치 변형 — 주동근 가슴
pin = by_ko["바벨 핀 프레스"]
pin["primary"], pin["secondary"] = "chest", ["triceps", "shoulders"]
# 3) 목 운동은 기존 목 종목처럼 other
for n in cand:
    if n["family"] in ("neck_extension", "neck_side_flexion", "neck_bridge", "neck_curl"):
        n["primary"] = "other"
        n["secondary"] = [s for s in n["secondary"] if s != "traps"] or []

# 4) 같은 family 기존 종목과 주동근을 맞춘다(스무고개 트리가 주동근으로 갈린다)
for ko in ("덤벨 커시 런지", "스미스 커시 런지"):
    by_ko[ko]["primary"], by_ko[ko]["secondary"] = "quads", ["glutes"]
by_ko["리버스 핵 스쿼트"]["primary"], by_ko["리버스 핵 스쿼트"]["secondary"] = "quads", ["glutes", "hamstrings"]
# 5) 「bench press」 검색을 가로채는 별칭 뺌(벤치프레스가 첫 결과여야 한다 — exerciseSearch.test 성공 기준 1)
pin["aliases_en"] = [a for a in pin["aliases_en"] if "bench press" not in a]

# ── qa spec 반영(docs/qa/20261030_catalog-gap-spec_qa.md) ──
# H-2·L-9: 같은 동작(그립 칸·바 위치·수행 디테일)은 새 종목 대신 기존 종목의 별칭으로. L-4: 넥 브릿지는 경추 부하가 커서 뺀다.
EXISTING_ALIASES = {  # 기존 종목 id_en → (한국어 별칭, 영문 별칭) — 기존 행에는 별칭 **추가만** 한다
    # qa code M-1: 이 별칭은 그립 칸(close)을 함축한다 — 아래 MERGE_ROWS 의 통합(보관) 행이 근거(「클로즈그립 풀다운」 선례)
    "Incline Press": (["인클라인 클로즈그립 벤치프레스"], ["incline close grip bench press"]),
    "Barbell Shrug": (["비하인드 백 슈러그", "바벨 비하인드 백 슈러그", "백 슈러그"], ["behind the back shrug"]),
    "Shrug (Smith)": (["스미스 비하인드 백 슈러그", "스미스 백 슈러그"], ["smith behind the back shrug"]),
    "Pull Up": (["L-싯 풀업", "엘싯 풀업"], ["l-sit pull-up"]),
    "Deadlift High Pull": (["스모 데드리프트 하이 풀", "바벨 스모 데드리프트 하이 풀", "스모 하이 풀", "SDHP"],
                           ["sumo deadlift high pull"]),
    "Hanging Knee Raise": (["행잉 오블리크 니 레이즈", "행잉 트위스트 니 레이즈"], ["hanging oblique knee raise"]),
    # M-7: 한국 헬스장의 「인클라인 로우」는 대개 덤벨 — 새 바벨 인클라인 로우가 첫 자리를 빼앗지 않게
    "Chest Supported Row (Dumbbell)": (["인클라인 로우"], []),
}
DROP = {"바벨 인클라인 클로즈그립 벤치프레스", "바벨 비하인드 백 슈러그", "스미스 비하인드 백 슈러그", "L-싯 풀업",
        "바벨 스모 데드리프트 하이 풀", "행잉 오블리크 니 레이즈", "넥 브릿지"}
cand = [n for n in cand if n["name_ko"] not in DROP]
# M-7: 너무 일반적인 별칭(「triceps press」가 덤벨 오버헤드 익스텐션의 첫 자리를 빼앗는다)
bwt = by_ko["맨몸 트라이셉스 익스텐션"]
bwt["aliases_en"] = [a for a in bwt["aliases_en"] if a.lower() not in ("triceps press",)]
# qa code L-2: 다른 레그 컬처럼 보조근 없음 · L-3: 티비알리스는 카프 레이즈의 반대 동작이라 「비슷한 운동」으로 잇지 않는다
by_ko["닐링 레그 컬"]["secondary"] = []
by_ko["티비알리스 레이즈"]["similar"] = []
# L-5·L-6: 현장에서 더 흔한 이름을 대표로
for old, new in (("시티드 니 턱", "시티드 니업"), ("스토머크 배큠", "복부 배큠")):
    n = by_ko[old]
    n["aliases_ko"] = [old] + [a for a in n["aliases_ko"] if a != new]
    n["name_ko"] = new

# 6) family 안 기구 유일(catalogIntegrity — 기구 바꾸기 = 같은 family 의 다른 기구 종목). 기존 종목과 같은
#    family·같은 기구가 되는 새 종목은 제 family 로 떼고, 원형·스무고개·패턴·축은 원래 family(parent)를 잇는다.
SPLIT = {
    "바벨 인클라인 클로즈그립 벤치프레스": "incline_close_grip_bench_press",
    "바벨 인클라인 스컬크러셔": "incline_skull_crusher", "EZ바 인클라인 스컬크러셔": "incline_skull_crusher",
    "덤벨 인클라인 트라이셉스 익스텐션": "incline_skull_crusher",
    "바벨 비하인드 백 슈러그": "behind_back_shrug", "스미스 비하인드 백 슈러그": "behind_back_shrug",
    "덤벨 인클라인 슈러그": "incline_shrug", "바벨 인클라인 로우": "incline_bench_row",
    "케이블 비하인드 넥 랫풀다운": "behind_neck_pulldown", "케이블 스탠딩 로우": "standing_cable_row",
    "L-싯 풀업": "l_sit_pull_up", "덤벨 인클라인 스퀴즈 프레스": "incline_squeeze_press",
    "덤벨 B스탠스 루마니안 데드리프트": "b_stance_rdl", "바벨 B스탠스 루마니안 데드리프트": "b_stance_rdl",
    "바벨 스모 루마니안 데드리프트": "sumo_romanian_deadlift", "랜드마인 루마니안 데드리프트": "landmine_romanian_deadlift",
    "햄스트링 브릿지": "hamstring_bridge", "레터럴 스텝업": "lateral_step_up",
    "랜드마인 리버스 런지": "landmine_reverse_lunge", "리버스 핵 스쿼트": "reverse_hack_squat",
    "바벨 스모 데드리프트 하이 풀": "sumo_deadlift_high_pull", "덤벨 인클라인 리어 델트 플라이": "incline_rear_delt_fly",
    "덤벨 사이드 라잉 레터럴 레이즈": "side_lying_lateral_raise",
    "덤벨 사이드 라잉 리어 델트 레이즈": "side_lying_rear_delt_raise", "디클라인 레그 레이즈": "decline_leg_raise",
    "행잉 오블리크 니 레이즈": "hanging_oblique_knee_raise", "행잉 니 투 엘보": "knees_to_elbows",
    "V 싯 홀드": "v_sit_hold", "플랭크 힙 딥": "plank_hip_dip", "사이드 플랭크 로테이션": "side_plank_rotation",
    "베어 플랭크": "bear_plank", "스탠딩 니 투 엘보": "standing_knee_to_elbow", "앱 코스터": "ab_coaster",
    # qa spec M-4: 랜드마인·풀 스루·45도 벤치는 셋업이 달라 「기구 바꾸기」 형제로 두지 않는다(랜드마인 별도 family 관례)
    "랜드마인 레터럴 레이즈": "landmine_lateral_raise", "플랭크 풀 스루": "plank_pull_through",
    "랜드마인 싱글 레그 루마니안 데드리프트": "landmine_single_leg_rdl", "45도 사이드 벤드": "roman_chair_side_bend",
}
used_pairs = {(r["family"], r["equipment"]) for r in master if r["status"] not in ("merge", "delete")}
for n in cand:
    n["parent"] = None
    if n["name_ko"] in SPLIT:
        n["parent"], n["family"], n["family_is_new"] = n["family"], SPLIT[n["name_ko"]], True
        if n["parent"] not in n["similar"]:
            n["similar"] = [n["parent"], *n["similar"]][:4]
for n in cand:
    pair = (n["family"], n["equipment"])
    if pair in used_pairs:
        print(f"✗ family 안 기구 중복 {n['name_ko']} {pair}")
    used_pairs.add(pair)

# ── 이름 규칙 ──
PREFIX = {"barbell": "바벨 ", "dumbbell": "덤벨 ", "cable": "케이블 ", "machine": "머신 ", "smith": "스미스 ",
          "kettlebell": "케틀벨 ", "band": "밴드 ", "ezbar": "EZ바 ", "trapbar": "트랩바 "}
def name_rule(n):
    if n["equipment"] == "bodyweight":
        return "bodyweight"
    p = PREFIX.get(n["equipment"])
    return "prefix" if p and n["name_ko"].startswith(p) else "intrinsic"

# ── 겹침 검사(대소문자·공백 무시) ──
norm = lambda s: re.sub(r"\s+", "", s.lower())
taken = {}
for r in master:
    for s in [r["new_name_ko"], r["old_name_ko"], r["id_en"], *r["aliases_ko"].split(";"), *r["aliases_en"].split(";")]:
        if s.strip():
            taken.setdefault(norm(s), r["id_en"])
for en, (ko_al, en_al) in EXISTING_ALIASES.items():
    assert any(r["id_en"] == en for r in master), en
    for a in ko_al + en_al:
        k = norm(a)
        assert k not in taken or taken[k] == en, f"기존 별칭 추가 충돌 {a} ↔ {taken[k]}"
        taken[k] = en
ids = {seed_id(r["id_en"]) for r in master}
report = []
seen = {}
for n in cand:
    sid = seed_id(n["name_en"])
    if sid in ids:
        report.append(f"✗ id 충돌 {sid}")
    ids.add(sid)
    n["id"] = sid
    for s in [n["name_ko"], n["name_en"]]:
        k = norm(s)
        if k in taken:
            report.append(f"✗ 이름 충돌 {s} ↔ 기존 {taken[k]}")
        if k in seen:
            report.append(f"✗ 새 종목끼리 이름 충돌 {s} ↔ {seen[k]}")
        seen[k] = n["name_ko"]
    clean_al = {"ko": [], "en": []}
    for lang in ("ko", "en"):
        for a in n[f"aliases_{lang}"]:
            k = norm(a)
            if not a.strip() or k in taken or k in seen and seen[k] != n["name_ko"]:
                report.append(f"· 별칭 뺌(겹침) {n['name_ko']}: {a}")
                continue
            if k == norm(n["name_ko"]) or k == norm(n["name_en"]):
                continue
            seen[k] = n["name_ko"]
            clean_al[lang].append(a)
    n["aliases_ko"], n["aliases_en"] = clean_al["ko"], clean_al["en"]

# ── 동작 그룹 ──
fam_names = set(fam_by)
new_fams = collections.OrderedDict()
widen = collections.defaultdict(set)
for n in cand:
    f, eq = n["family"], n["equipment"]
    if f in fam_by:
        eqs = set(filter(None, fam_by[f]["equipments"].split(";")))
        if eq not in eqs:
            widen[f].add(eq)
    else:
        new_fams.setdefault(f, set()).add(eq)
    n["similar"] = [s for s in n["similar"] if s in fam_names or s in new_fams or any(c["family"] == s for c in cand)]

LOAD_FAMS = {"kneeling_leg_curl": "pin", "hack_calf_raise": "plate"}  # 머신 새 그룹 — 적재 축
fam_patch = {"new": [], "widen": {}}
parent_of = {n["family"]: n["parent"] for n in cand if n["parent"]}
for f, eqs in new_fams.items():
    load = LOAD_FAMS.get(f)
    row = {"family": f, "equipments": ";".join(sorted(eqs)), "attachments": "", "grips": "",
           "load": "pin;plate" if load else "", "load_default": load or ""}
    par = fam_by.get(parent_of.get(f))
    if par:  # 떼어 낸 family 는 원래 family 의 축을 잇는다(쓸 수 있는 기구가 있을 때만 — 무결성 규칙)
        row["grips"] = par["grips"]
        if "cable" in eqs:
            row["attachments"] = par["attachments"]
        if "machine" in eqs and par["load"]:
            row["load"], row["load_default"] = par["load"], par["load_default"]
    if f == "behind_neck_pulldown":  # qa code L-1 — 목 뒤로 내리는 동작에 V·뉴트럴·싱글 손잡이와 언더·뉴트럴 그립은 성립하지 않는다
        row["attachments"], row["grips"] = "lat_bar;straight", "wide;close"
    if f == "ab_coaster" and row["load"]:
        row["load_default"] = "plate"  # qa spec L-8 — 무릎 캐리지 플레이트 적재가 흔하다
    fam_patch["new"].append(row)
for f, eqs in widen.items():
    cur = list(filter(None, fam_by[f]["equipments"].split(";")))
    fam_patch["widen"][f] = ";".join(sorted(set(cur) | eqs))

# ── 픽토그램 원형(새 family) ──
ARCH = {
    "pin_press": "bench_press", "curl_to_press": "curl", "archer_pull_up": "pull_up", 
    "one_arm_pull_up": "pull_up", "straight_bar_dip": "dips", "floor_fly": "fly_lying", "planche_push_up": "push_up",
    "scapular_push_up": "plank_high", "landmine_squeeze_press": "landmine_press",
    "single_leg_deadlift": "romanian_deadlift", "skater_squat": "pistol", "kneeling_hip_thrust": "pull_through",
    "kneeling_leg_curl": "standing_leg_curl", "sliding_leg_curl": "glute_bridge", "shrimp_squat": "pistol",
    "snatch_pull": "high_pull", "tibialis_raise": "calf_raise", "snatch_balance": "overhead_squat",
    "hack_calf_raise": "calf_raise", "pogo_jump": "jump_squat", "crab_walk": "bear_crawl", "butt_kick": "high_knees",
    "plank_jack": "plank_high", "burpee_box_jump": "burpee", "cuban_press": "upright_row", "z_press": "seated_press",
    "handstand_walk": "handstand", "wall_walk": "handstand", "neck_side_flexion": "neck_curl", "neck_bridge": "neck_ext",
    # qa spec M-5: 반대·다른 동작을 그리던 셋은 전용 원형(poses.ts)
    "back_lever": "back_lever", "tibialis_raise": "tibialis_raise", "vacuum": "vacuum",
    # qa code M-2: 다른 자세를 그리던 넷도 전용 원형
    "crab_walk": "crab_walk", "butt_kick": "butt_kick", "kneeling_hip_thrust": "kneeling_hip_thrust",
    "standing_knee_to_elbow": "standing_knee_to_elbow",
    "seated_knee_tuck": "v_sit", "double_crunch": "crunch", "inchworm": "plank_high",
    "incline_close_grip_bench_press": "incline_press",
}
rsrc = head("src/core/src/data/pictograms/render.ts")
fa = rsrc[rsrc.index("export const FAMILY_ARCH"):]
fa = fa[:fa.index("\n};")]
for f in new_fams:
    par = parent_of.get(f)
    if par in ARCH and f not in ARCH:
        ARCH[f] = ARCH[par]
    if par and f not in ARCH:
        m = re.search(rf"\n  {par}: (?:'(\w+)'|\{{ d: '(\w+)')", fa)
        if m:
            ARCH[f] = m.group(1) or m.group(2)
    if f not in ARCH:
        report.append(f"✗ 원형 없음 {f}")

# ── 스무고개 세부 질문 ──
finder_src = head("src/core/src/domain/exerciseFinder.ts")
sub_of_id = {}
cur_muscle = None
for line in finder_src.splitlines():
    m = re.match(r"\s{2}(\w+): \[$", line)
    if m:
        cur_muscle = m.group(1)
    m = re.search(r"key: '(\w+)'.*ids: \[([^\]]*)\]", line)
    if m and cur_muscle:
        for i in re.findall(r"'([^']+)'", m.group(2)):
            sub_of_id[i] = (cur_muscle, m.group(1))
TREE = {"chest", "back", "shoulders", "triceps", "quads", "hamstrings", "glutes", "calves", "abs"}
id_by_en = {r["id_en"]: seed_id(r["id_en"]) for r in master}
fam_members = collections.defaultdict(list)
for r in master:
    if r["status"] not in ("merge", "delete"):
        fam_members[r["family"]].append((seed_id(r["id_en"]), r["primary"]))
FINDER_NEW = {  # 새 family → 세부 질문 key (주동근 트리 안에서)
    "pin_press": "flat", "straight_bar_dip": "decline", "floor_fly": "fly", "planche_push_up": "flat",
    "scapular_push_up": "flat", "landmine_squeeze_press": "flat", "archer_pull_up": "vertical", "back_lever": "vertical",
    "one_arm_pull_up": "vertical", "snatch_pull": "deadlift", "single_leg_deadlift": "hinge", "skater_squat": "lunge",
    "shrimp_squat": "lunge", "kneeling_hip_thrust": "thrust", "kneeling_leg_curl": "curl", "sliding_leg_curl": "curl",
    "tibialis_raise": "standing", "hack_calf_raise": "standing", "pogo_jump": "standing", "cuban_press": "rear",
    "z_press": "press", "handstand_walk": "press", "wall_walk": "press", "seated_knee_tuck": "legraise",
    "double_crunch": "crunch", "inchworm": "plank", "plank_jack": "plank", "vacuum": "plank", "curl_to_press": None,
}
finder = {}
for n in cand:
    mus = n["primary"]
    if mus not in TREE:
        continue
    key = None
    for sid, prim in fam_members.get(n["parent"] or n["family"], []):
        if sid in sub_of_id and sub_of_id[sid][0] == mus:
            key = sub_of_id[sid][1]
            break
    if key is None:
        key = FINDER_NEW.get(n["family"]) or FINDER_NEW.get(n["parent"]) or {"햄스트링 브릿지": "curl", "베어 플랭크": "plank"}.get(n["name_ko"])
    if key is None:
        report.append(f"✗ 스무고개 미분류 {n['name_ko']} ({mus}/{n['family']})")
    else:
        finder[n["id"]] = [mus, key]

# ── 대체 패턴 ──
pat_src = head("src/core/src/domain/movementPatterns.ts")
pat_of = dict(re.findall(r'"(seed-[^"]+)": \'(\w+)\'', pat_src))
PATTERN_NEW = {
    "pin_press": "horizontalPress", "straight_bar_dip": "horizontalPress", "floor_fly": "fly",
    "planche_push_up": "horizontalPress", "landmine_squeeze_press": "horizontalPress", "archer_pull_up": "verticalPull",
    "one_arm_pull_up": "verticalPull", "single_leg_deadlift": "hinge", "skater_squat": "lungeStep",
    "shrimp_squat": "lungeStep", "kneeling_hip_thrust": "hinge", "snatch_pull": "hinge",
    "hack_calf_raise": "calf", "z_press": "verticalPress", "cuban_press": "lateralRaise", "double_crunch": "core",
    "seated_knee_tuck": "core", "inchworm": "core", "plank_jack": "core", "vacuum": "core", "curl_to_press": "curl",
}
pattern = {}
for n in cand:
    votes = collections.Counter(pat_of[s] for s, _ in fam_members.get(n["parent"] or n["family"], []) if s in pat_of)
    p = votes.most_common(1)[0][0] if votes else (PATTERN_NEW.get(n["family"]) or PATTERN_NEW.get(n["parent"]))
    if p:
        pattern[n["id"]] = p

# ── 행 ──
HDR = list(master[0].keys())
with open(f"{OUT}/rows.csv", "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh, lineterminator="\n")
    for n in cand:
        row = {k: "" for k in HDR}
        row.update({
            "status": "new", "id_en": n["name_en"], "old_name_ko": "", "new_name_ko": n["name_ko"],
            "name_rule": name_rule(n), "equipment": n["equipment"], "primary": n["primary"],
            "secondary": ";".join(n["secondary"]), "kind": "strength", "load_mode": n["load_mode"],
            "family": n["family"], "aliases_ko": ";".join(n["aliases_ko"]), "aliases_en": ";".join(n["aliases_en"]),
            "merge_into": "", "implied_axes": "", "similar": ";".join(n["similar"]), "media": "gen", "usage_sets": "",
            "note": f"오픈짐 대조 2026-10-30({n['tier']}) — {n['why']}",
        })
        w.writerow([row[k] for k in HDR])
json.dump(fam_patch, open(f"{OUT}/families.patch.json", "w"), ensure_ascii=False, indent=1)
json.dump({f: ARCH[f] for f in new_fams if f in ARCH}, open(f"{OUT}/arch.json", "w"), indent=1)
json.dump(finder, open(f"{OUT}/finder.json", "w"), indent=1)
json.dump(pattern, open(f"{OUT}/pattern.json", "w"), indent=1)
json.dump(cand, open(f"{OUT}/final.json", "w"), ensure_ascii=False, indent=1)
# 별칭이 함축하는 기록 칸의 근거 — 보관(merge) 행. 옛 이름 = 대상 별칭 · implied_axes = 축 값(exerciseNames.impliedAxesForAlias)
MERGE_ROWS = [{
    "status": "merge", "id_en": "Barbell Incline Close Grip Bench Press", "old_name_ko": "인클라인 클로즈그립 벤치프레스",
    "new_name_ko": "바벨 인클라인 프레스", "name_rule": "prefix", "equipment": "barbell", "primary": "chest",
    "secondary": "triceps;shoulders", "kind": "strength", "load_mode": "weight", "family": "incline_press",
    "merge_into": "Incline Press", "implied_axes": "grip=close", "similar": "bench_press;decline_press;incline_fly",
    "media": "inherit:Incline Press", "note": "오픈짐 대조 2026-10-30 — 같은 동작(인클라인 프레스 + 그립 close) · qa code M-1",
}]
with open(f"{OUT}/merge_rows.csv", "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh, lineterminator="\n")
    for m in MERGE_ROWS:
        w.writerow([m.get(k, "") for k in HDR])
json.dump(EXISTING_ALIASES, open(f"{OUT}/existing_aliases.json", "w"), ensure_ascii=False, indent=1)
open(f"{OUT}/report.txt", "w").write("\n".join(report))
print(f"종목 {len(cand)} · 새 family {len(new_fams)} · 넓힌 family {len(widen)} · 스무고개 {len(finder)} · 패턴 {len(pattern)}")
print("\n".join(r for r in report if r.startswith("✗")) or "충돌·누락 없음")
print(f"별칭 뺌 {sum(1 for r in report if r.startswith('·'))}")
