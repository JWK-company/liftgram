#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""컨펌된 영상만 운영 표에 반영한다. 다른 종목의 현재 값은 그대로 둔다.
서버: publish.py export --out <제작 폴더> --release <release 폴더> --confirmed confirmed.json
맥:   publish.py merge --catalog catalog.json --confirmed confirmed.json --table <표.ts> --hold <motion_hold.json> [--check]
맥:   publish.py hold <키> --reason 사유 --catalog ... --confirmed ... --table ... --hold ...   표에서 내리고 컨펌을 무효로 한다
맥:   publish.py verify --confirmed confirmed.json --table <표.ts> --legacy legacy_table.json   표의 이름은 옛 목록이나 컨펌에만 있어야 한다"""
import argparse, hashlib, json, os, re, shutil, sys
LINE = re.compile(r'^  "([^"]+)": "([^"]+)",$')
SHA8 = re.compile(r"^[0-9a-f]{8}$")
KEY = re.compile(r"^[A-Za-z0-9_+-]+$")   # 제작 키 형식 — 경로·표에 그대로 쓰므로 다른 글자를 받지 않는다
HEAD = "EXERCISE_MOTION"
def file_stem(key, sha8): return f"{key.replace('+', '-')}.{sha8}"
def bounds(s):
    """표 본문의 시작·끝 위치. 선언 줄과 그 뒤 첫 닫는 줄로 찾는다."""
    m = re.search(rf"^export const {HEAD}\b.*= \{{\n", s, re.M)
    if not m: raise SystemExit("표 선언을 찾지 못함")
    e = re.compile(r"^\};$", re.M).search(s, m.end())
    if not e: raise SystemExit("표 끝을 찾지 못함")
    return m.end(), e.start()
def read_table(s):
    a, b = bounds(s); t = {}
    for ln in s[a:b].splitlines():
        if not ln.strip(): continue
        m = LINE.match(ln)
        if not m: raise SystemExit(f"형식이 다른 줄: {ln[:80]}")
        if m[1] in t: raise SystemExit(f"겹치는 종목: {m[1]}")
        t[m[1]] = m[2]
    return t
def write_table(s, table):
    for k, v in table.items():
        if not LINE.match(f'  "{k}": "{v}",'): raise SystemExit(f"표에 쓸 수 없는 값: {k[:60]}")
    a, b = bounds(s); return s[:a]+"".join(f'  "{k}": "{table[k]}",\n' for k in sorted(table))+s[b:]
def check_conf(conf):
    for k, c in conf.items():
        if not KEY.match(k): raise SystemExit(f"키 형식이 이상함: {k[:60]}")
        for f in ("sha8", "webp_sha8"):
            if not SHA8.match(str(c.get(f, ""))): raise SystemExit(f"컨펌 기록 해시가 이상함: {k}.{f}")
        if not c.get("판") or not re.fullmatch(r"\d+", str(c.get("답", ""))): raise SystemExit(f"컨펌 기록의 답은 메시지 번호만 적는다: {k}")
def write_atomic(p, text):
    """중간에 멈춰도 표·보류 파일이 잘리지 않게 임시 파일에 쓰고 바꿔 넣는다."""
    tmp = f"{p}.tmp"; open(tmp, "w").write(text); os.replace(tmp, p)
def as_list(x): return [] if x is None else ([x] if isinstance(x, str) else list(x))
def clean_reason(r):
    """공개 저장소에 적히므로 출처·사람을 가리키는 말을 받지 않는다."""
    if re.search(r"https?:|www\.|@|채널|유튜브|youtube", r, re.I): raise SystemExit("내린 이유에 주소·채널·사람을 적지 않는다")
    return r
def merge(cat, conf, table, hold, rejected=None):
    """(새 표, 새 보류, 바뀐 종목 수). 컨펌 키에 연결된 종목만 바꾼다. 내린 판을 다시 올리면 멈춘다."""
    check_conf(conf); links = cat["links"]; rejected = rejected or {}; out = dict(table); changed = set(); allowed = set()
    for key, c in conf.items():
        if key not in cat["keys"]: raise SystemExit(f"제작 목록에 없는 키: {key}")
        if c["sha8"] in as_list(rejected.get(key)): raise SystemExit(f"내렸던 판을 다시 올리려 함: {key} {c['sha8']}")
        ids = [i for i, k in links.items() if k == key]
        if not ids: raise SystemExit(f"종목에 연결되지 않은 키: {key}")
        stem = file_stem(key, c["sha8"]); allowed |= set(ids)
        for i in ids:
            if out.get(i) != stem: out[i] = stem; changed.add(i)
    new_hold = [k for k in hold if k not in conf]
    live = [i for i, k in links.items() if k in new_hold and i in out]
    if live: raise SystemExit(f"보류 키가 표에 남음: {live[:5]}")
    if set(table)-set(out): raise SystemExit("종목이 사라짐")
    if {i for i in out if out[i] != table.get(i)}-allowed: raise SystemExit("컨펌 밖 종목이 바뀜")
    return out, new_hold, len(changed)
def take_down(cat, conf, table, hold, key, reason):
    """표에서 내리고 컨펌을 무효로 한다. 그 판을 다시 올리지 못하게 해시를 적는다."""
    if key not in cat["keys"]: raise SystemExit(f"제작 목록에 없는 키: {key}")
    ids = [i for i, k in cat["links"].items() if k == key]; out = {i: v for i, v in table.items() if i not in ids}
    old = conf.get(key); conf = {k: v for k, v in conf.items() if k != key}; h = dict(hold); h["keys"] = sorted(set(h["keys"])|{key}); rej = dict(h.get("rejected", {}))
    now = {table[i].rsplit(".", 1)[1] for i in ids if i in table}|({old["sha8"]} if old else set())
    if now: rej[key] = sorted(set(as_list(rej.get(key)))|now)
    h["rejected"] = rej; h.setdefault("reasons", {})[key] = clean_reason(reason)
    return out, conf, h
# [원본] def verify(table, conf, legacy):
# [원본]     ok = set(legacy)|{file_stem(k, c["sha8"]) for k, c in conf.items()}; return sorted(set(table.values())-ok)
def verify(table, conf, legacy, hold=None):   # [개선] 보류 키·내린 판이 표에 돌아온 것도 잡는다(옛 이름은 legacy 에 있어 그것만으로는 통과했다)
    hold = hold or {}; keys, rej = set(hold.get("keys", [])), hold.get("rejected", {})
    ok = set(legacy)|{file_stem(k, c["sha8"]) for k, c in conf.items()}; bad = set(table.values())-ok
    for v in table.values():
        k, h = v.rsplit(".", 1)
        if (k in keys and k not in conf) or h in as_list(rej.get(k)): bad.add(v)
    return sorted(bad)
def sha(p, n=8):
    with open(p, "rb") as f: return hashlib.sha256(f.read()).hexdigest()[:n]
def do_export(a):
    conf = json.load(open(a.confirmed)); check_conf(conf); os.makedirs(a.release, exist_ok=True); plan = []
    for key, c in conf.items():   # 전부 검증한 뒤에 복사한다
        d = f"{a.out}/{key}"; mp4, web = f"{d}/{key}.mp4", f"{d}/thumb.webp"; stem = file_stem(key, c["sha8"])
        if os.path.exists(f"{a.release}/{stem}.mp4") and os.path.exists(f"{a.release}/{stem}.webp"):   # 이미 내보낸 판도 검사 기록 합격을 확인한다(옛 판이 release 에 남아 있어 해시만으로는 보류 판이 통과한다)
            if sha(f"{a.release}/{stem}.mp4") != c["sha8"] or sha(f"{a.release}/{stem}.webp") != c["webp_sha8"]: raise SystemExit(f"release 는 추가 전용인데 내용이 다름: {stem}")
            I = json.load(open(f"{d}/info.json")) if os.path.exists(f"{d}/info.json") else {}
            if I.get("fail") or str(I.get("sha8", "")) != c["sha8"]: raise SystemExit(f"release 에 있으나 이번 제작의 합격본이 아님: {key}")
            continue
        if not os.path.exists(mp4): raise SystemExit(f"영상 없음: {key}")
        if not os.path.exists(web): raise SystemExit(f"webp 없음: {key}")
        if sha(mp4) != c["sha8"]: raise SystemExit(f"컨펌과 다른 영상: {key}")
        if sha(web) != c["webp_sha8"]: raise SystemExit(f"컨펌과 다른 썸네일: {key}")
        if not os.path.exists(f"{d}/info.json"): raise SystemExit(f"검사 기록 없음: {key}")
        I = json.load(open(f"{d}/info.json"))
        if I.get("fail") or str(I.get("sha8", "")) != c["sha8"]: raise SystemExit(f"불합격이거나 검사 기록과 다른 영상: {key} {I.get('fail')}")
        for src, ext, want in ((mp4, "mp4", c["sha8"]), (web, "webp", c["webp_sha8"])):
            dst = f"{a.release}/{stem}.{ext}"
            if os.path.exists(dst):
                if sha(dst) != want: raise SystemExit(f"release 는 추가 전용인데 내용이 다름: {dst}")
            else: plan.append((src, dst, want))
    for src, dst, want in plan:
        tmp = f"{dst}.tmp"; shutil.copyfile(src, tmp)
        if sha(tmp) != want: os.remove(tmp); raise SystemExit(f"복사 중 내용이 바뀜: {src}")
        os.replace(tmp, dst)
    print("내보냄", len(conf), "새 파일", len(plan))
def do_merge(a):
    cat, conf = json.load(open(a.catalog)), json.load(open(a.confirmed)); src = open(a.table).read(); H = json.load(open(a.hold))
    t, hold, n = merge(cat, conf, read_table(src), H["keys"], H.get("rejected")); print("바뀔 종목", n, "보류", len(H["keys"]), "→", len(hold), "표", len(t))
    if a.check: return
    write_atomic(a.table, write_table(src, t)); H["keys"] = hold; write_atomic(a.hold, json.dumps(H, ensure_ascii=False, indent=1)+"\n")
def do_hold(a):
    cat, conf = json.load(open(a.catalog)), json.load(open(a.confirmed)); src = open(a.table).read(); H = json.load(open(a.hold))
    t, c2, h2 = take_down(cat, conf, read_table(src), H, a.key, a.reason)
    write_atomic(a.table, write_table(src, t)); write_atomic(a.confirmed, json.dumps(c2, ensure_ascii=False, indent=1)); write_atomic(a.hold, json.dumps(h2, ensure_ascii=False, indent=1)+"\n"); print("내림", a.key, "표", len(t))
def do_verify(a):
    bad = verify(read_table(open(a.table).read()), json.load(open(a.confirmed)), json.load(open(a.legacy))["names"], json.load(open(a.hold)) if a.hold else None)
    if bad: raise SystemExit(f"컨펌되지 않은 영상: {bad[:5]} 외 {max(0, len(bad)-5)}개")
    print("표 대조 통과")
if __name__ == "__main__":
    p = argparse.ArgumentParser(); sp = p.add_subparsers(dest="cmd", required=True)
    e = sp.add_parser("export"); e.add_argument("--out", required=True); e.add_argument("--release", required=True); e.add_argument("--confirmed", required=True); e.set_defaults(fn=do_export)
    m = sp.add_parser("merge"); m.add_argument("--catalog", required=True); m.add_argument("--confirmed", required=True); m.add_argument("--table", required=True); m.add_argument("--hold", required=True); m.add_argument("--check", action="store_true"); m.set_defaults(fn=do_merge)
    h = sp.add_parser("hold"); h.add_argument("key"); h.add_argument("--reason", required=True); h.add_argument("--catalog", required=True); h.add_argument("--confirmed", required=True); h.add_argument("--table", required=True); h.add_argument("--hold", required=True); h.set_defaults(fn=do_hold)
    v = sp.add_parser("verify"); v.add_argument("--confirmed", required=True); v.add_argument("--table", required=True); v.add_argument("--legacy", required=True); v.add_argument("--hold"); v.set_defaults(fn=do_verify)
    a = p.parse_args(); a.fn(a)
