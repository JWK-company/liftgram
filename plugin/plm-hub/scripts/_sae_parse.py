#!/usr/bin/env python3
"""_sae_parse.py — SAE 와이어프레임 스펙(WF-<CODE>.json) 파서 (wfgen·wfscan 공용 SSOT).

와이어프레임 SAE 스펙은 ProseMirror `doc`(CODE.json 동형) 안에 한 개의 `bullet_list` 로
요소별 SAE(상태·액션·이펙트)를 담는다. 각 list_item = 한 paragraph 로

    <요소코드> [유형] 라벨            (예: "NEW.07 [button] 저장")
    상태: …                          (hard_break 로 줄분리)
    액션: …
    이펙트: …

파싱 규약은 **한 곳(이 모듈)** 에서 정의하고 wfgen(생성)·wfscan(발급 본문) 이 함께 import 한다.
→ 두 스크립트의 파싱 규약 불일치를 원천 차단(계획서 요구: "동일 규약").
"""
import json
import os
import re

# 요소코드 = 화면코드(대문자 2~6) + '.' + 번호. 예: LIB.01 · NEW.07.
CODE_RE = re.compile(r"^[A-Z]{2,6}\.\d+$")


def find_bullet_list(node):
    """doc 트리에서 첫 bullet_list 노드를 반환(없으면 None). (역호환 — 내부는 find_bullet_lists 사용)"""
    ls = find_bullet_lists(node)
    return ls[0] if ls else None


def find_bullet_lists(node, out=None):
    """doc 트리의 **모든** bullet_list 노드(문서 순서).

    [원본] find_bullet_list 는 **첫 리스트 하나만** 돌려줘, 스펙을 두 그룹('주요 요소'/'보조 요소')으로
      나눠 적으면 뒤 그룹 전체가 **조용히 유실**됐다(감사 2026-07-31). 원복 시 호출부를 find_bullet_list 로.
    [개선] 전량 수집 후 이어붙인다 — 요소는 어느 리스트에 있든 하나도 빠지지 않는다.
    """
    if out is None:
        out = []
    if isinstance(node, dict):
        if node.get("type") == "bullet_list":
            out.append(node)
            return out          # 중첩 bullet_list 는 요소 본문 → 재귀하지 않는다
        for c in node.get("content", []) or []:
            find_bullet_lists(c, out)
    elif isinstance(node, list):
        for c in node:
            find_bullet_lists(c, out)
    return out


def heading_name_route(doc, fallback_name, fallback_route):
    """첫 heading 텍스트 `제목 · CODE · route` 에서 (name, route) 유도.

    [원본] `txt.split("·")` + `parts[0], parts[-1]` — **name 에 '·' 가 들어가면 첫 조각으로 잘리고**,
      route 에 '·' 가 들어가면 마지막 조각만 남아 래퍼의 올바른 route 를 덮어썼다. 원복 시:
      # parts = [p.strip() for p in txt.split("·")]
      # if len(parts) >= 3: return parts[0], parts[-1]
    [개선] 직렬화 포맷이 `name · CODE · route`(구분자 정확히 2개)이므로 **뒤에서 2번만** 분리한다
      → name 안의 '·' 가 보존된다.
    """
    for c in (doc or {}).get("content", []) or []:
        if c.get("type") == "heading":
            txt = "".join(t.get("text", "") for t in c.get("content", []) if t.get("type") == "text")
            parts = [p.strip() for p in txt.rsplit("·", 2)]
            if len(parts) >= 3:
                return parts[0], parts[-1]
            if parts:
                return parts[0], fallback_route
    return fallback_name, fallback_route


def parse_note(doc):
    """doc 안에서 화면 수준 자유서술(note)을 추출. `노트:` 로 시작하는 첫 paragraph 본문(라벨 제거).
    없으면 빈 문자열. wrapper 의 note 필드가 우선(load_sae_spec) — 이건 doc 폴백/역호환용."""
    for c in (doc or {}).get("content", []) or []:
        if c.get("type") != "paragraph":
            continue
        txt = "".join(t.get("text", "") for t in c.get("content", []) if t.get("type") == "text")
        s = txt.strip()
        if s.startswith("노트:"):
            return s[len("노트:"):].strip()
    return ""


# 유형 접미 `[...]` — **문자열 끝에 앵커**. wfanno._LABEL_TYPE_RE 와 같은 규약(SSOT 일치).
# [원본] `re.search(r"\[(\w+)\]", header)` — 앵커가 없어 라벨 안의 첫 브래킷을 유형으로 오인했고
#   (`[신규] 저장  [button]` → type='신규' · label='저장' · '[신규]' 소실),
#   `\w+` 라 하이픈·공백 있는 유형(`[text-input]`)은 아예 못 잡고 라벨에 눌어붙었다.
_TYPE_TAIL_RE = re.compile(r"\s*\[([^\[\]]+)\]\s*$")


def _dash_to_empty(v):
    """직렬화 시 빈 값 자리에 넣는 '—' 를 되돌린다 — 왕복 멱등성('' → '—' → '')의 짝."""
    v = (v or "").strip()
    return "" if v == "—" else v


def parse_sae_doc(doc, warn=True, where=""):
    """ProseMirror doc → [{code,label,type,state,action,effect}] (요소별 SAE).

    **조용한 유실 금지** — 규약을 못 맞춘 항목은 버리되 반드시 경고를 남긴다(warn=False 로 억제 가능).
    """
    els = []
    skipped = []
    tag = f"[sae{(' ' + where) if where else ''}]"
    for bl in find_bullet_lists(doc):
        for li in bl.get("content", []) or []:
            if li.get("type") != "list_item":
                continue
            # [원본] 첫 paragraph 하나만 읽고 break — 두 번째 문단 이후가 **조용히 유실**됐다.
            # [개선] list_item 안 **모든** paragraph 를 순서대로 이어붙인다(문단 경계=줄바꿈).
            paras = [c for c in (li.get("content", []) or []) if c.get("type") == "paragraph"]
            if not paras:
                continue
            lines = [""]
            for pi, para in enumerate(paras):
                if pi:
                    lines.append("")
                for n in para.get("content", []) or []:
                    if n.get("type") == "hard_break":
                        lines.append("")
                    elif n.get("type") == "text":
                        lines[-1] += n.get("text", "")
            header = lines[0].strip()
            if not header:
                skipped.append("(헤더 없음)")
                continue
            code = header.split()[0]
            if not CODE_RE.match(code):
                skipped.append(code)
                continue
            rest = header[len(code):]
            m = _TYPE_TAIL_RE.search(rest)
            typ = m.group(1).strip() if m else ""
            label = (_TYPE_TAIL_RE.sub("", rest) if m else rest).strip()
            state = action = effect = ""
            for ln in lines[1:]:
                ls = ln.strip()
                if ls.startswith("상태:"):
                    state = ls[len("상태:"):].strip()
                elif ls.startswith("액션:"):
                    action = ls[len("액션:"):].strip()
                elif ls.startswith("이펙트:"):
                    effect = ls[len("이펙트:"):].strip()
                elif ls and warn:
                    print(f"{tag} ⚠ {code}: 규약 밖 줄 무시 — {ls[:60]}")
            els.append({"code": code, "label": label, "type": typ,
                        "state": _dash_to_empty(state), "action": _dash_to_empty(action),
                        "effect": _dash_to_empty(effect)})
    if skipped and warn:
        print(f"{tag} ⚠ 요소 {len(skipped)}개가 코드 규약(<CODE>.<번호>) 미준수로 제외됨: "
              f"{', '.join(skipped[:8])}{' …' if len(skipped) > 8 else ''}")
    return els


def doc_covers(art):
    """SAE 스펙 래퍼의 relations.covers(→UCS/SRS) 목록."""
    rel = (art.get("relations") or {}).get("covers") or []
    return list(rel)


# ------------------------------------------------------------------ 역직렬화(elements → doc)
# forward(스펙→penpot 패널·PLM 본문)의 짝. penpot 주석 패널을 역추출(extract)해 SSOT
# WF-<CODE>.json 을 저작할 때 elements/note → ProseMirror doc 로 되돌린다(왕복 SSOT).

def _txt(s, strong=False):
    n = {"type": "text", "text": s}
    if strong:
        n["marks"] = [{"type": "strong"}]
    return n


def _sae_list_item(el):
    """요소 1개 → list_item. 헤더 `<CODE>  <라벨>  [유형]` + 상태/액션/이펙트 줄(hard_break 분리).
    parse_sae_doc 규약과 정확히 역대응(코드=strong·유형=[..] 브래킷·라벨 사이 공백2)."""
    code = el.get("code", "")
    label = (el.get("label") or "").strip()
    typ = (el.get("type") or "").strip()
    header_tail = f"  {label}" + (f"  [{typ}]" if typ else "")
    content = [_txt(code, strong=True), _txt(header_tail)]

    def _line(key, val):
        content.append({"type": "hard_break"})
        content.append(_txt(f"{key}: ", strong=True))
        content.append(_txt(val if (val or "").strip() else "—"))

    _line("상태", el.get("state", ""))
    _line("액션", el.get("action", ""))
    _line("이펙트", el.get("effect", ""))
    return {"type": "list_item", "content": [{"type": "paragraph", "content": content}]}


def serialize_sae_doc(name, route, screen_code, note, elements):
    """(name, route, screen_code, note, elements) → ProseMirror doc(CODE.json 본문).

    구성: H2 헤딩(`<name> · <CODE> · <route>`) + (note 있으면 `노트:` paragraph) +
          H3 소제목 + bullet_list(요소별 SAE). parse_sae_doc·parse_note·heading_name_route 로 재파싱 가능.
    """
    content = [{"type": "heading", "attrs": {"level": 2},
                "content": [_txt(f"{name} · {screen_code} · {route}")]}]
    if (note or "").strip():
        content.append({"type": "paragraph",
                        "content": [_txt("노트: ", strong=True), _txt(note.strip())]})
    content.append({"type": "heading", "attrs": {"level": 3},
                    "content": [_txt("SAE — 요소별 상태·액션·이펙트")]})
    content.append({"type": "bullet_list",
                    "content": [_sae_list_item(el) for el in (elements or [])]})
    return {"type": "doc", "content": content}


def serialize_sae_artifact(screen_code, name, route, note, covers, elements, base=None):
    """WF-<CODE>.json 래퍼 전체(dict) 조립. base(기존 파일 dict) 있으면 그 위에 병합(메타 보존).
    note 는 wrapper 필드(권위) + doc `노트:` 문단(표시) 양쪽에 기록."""
    art = dict(base or {})
    art.setdefault("schemaVersion", 1)
    art["id"] = f"WF-{screen_code}"
    art["type"] = "Wireframe"
    art.setdefault("title", f"{name} 와이어프레임 (SAE)")
    art.setdefault("status", "Draft")
    art["screen_code"] = screen_code
    art["route"] = route
    art["note"] = (note or "").strip()
    rel = dict(art.get("relations") or {})
    if covers:
        rel["covers"] = list(covers)
    if rel:
        art["relations"] = rel
    art["doc"] = serialize_sae_doc(name, route, screen_code, note, elements)
    return art


def load_sae_spec(sae_dir, screen_code):
    """`<sae_dir>/WF-<screen_code>.json` 을 읽어 구조화(dict) 반환. 없거나 파싱 실패 시 None.

    반환: {name, route, screen_code, note, covers:[...], elements:[{code,label,type,state,action,effect}]}
    penpot 없는 순수 파일 로딩(발급 본문 리치화용) — wfgen.load_screen 의 파싱 규약과 동일.
    """
    if not sae_dir or not screen_code:
        return None
    path = os.path.join(sae_dir, f"WF-{screen_code}.json")
    if not os.path.isfile(path):
        return None
    try:
        art = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        # [원본] 조용히 None — 호출부(wfscan 커버리지)가 "스펙 파일 없음"으로 오진단해
        #   **이미 있는 파일**을 다시 저작하라고 안내했다. 원복 시 아래 print 를 지운다.
        print(f"[sae] ⚠ {path} 파싱 실패 — 스펙 없음으로 취급됨(파일은 존재): {str(e)[:120]}")
        return None
    doc = art.get("doc") or {}
    name, route = heading_name_route(doc, art.get("title") or screen_code, art.get("route") or "")
    # note: wrapper 필드(권위) 우선, 없으면 doc `노트:` 문단 폴백.
    note = art.get("note")
    if note is None:
        note = parse_note(doc)
    return {
        "name": name,
        "route": route,
        "screen_code": art.get("screen_code") or screen_code,
        "note": (note or "").strip(),
        "covers": doc_covers(art),
        "elements": parse_sae_doc(doc, where=f"WF-{screen_code}"),
    }
