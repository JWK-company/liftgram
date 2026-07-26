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
    """doc 트리에서 첫 bullet_list 노드를 반환(없으면 None)."""
    if isinstance(node, dict):
        if node.get("type") == "bullet_list":
            return node
        for c in node.get("content", []) or []:
            r = find_bullet_list(c)
            if r:
                return r
    elif isinstance(node, list):
        for c in node:
            r = find_bullet_list(c)
            if r:
                return r
    return None


def heading_name_route(doc, fallback_name, fallback_route):
    """첫 heading 텍스트 `제목 · CODE · route` 에서 (name, route) 유도.
    3파트면 (첫, 끝), 1~2파트면 (첫, fallback_route), 없으면 (fallback_name, fallback_route)."""
    for c in (doc or {}).get("content", []) or []:
        if c.get("type") == "heading":
            txt = "".join(t.get("text", "") for t in c.get("content", []) if t.get("type") == "text")
            parts = [p.strip() for p in txt.split("·")]
            if len(parts) >= 3:
                return parts[0], parts[-1]
            if parts:
                return parts[0], fallback_route
    return fallback_name, fallback_route


def parse_sae_doc(doc):
    """ProseMirror doc → [{code,label,type,state,action,effect}] (요소별 SAE)."""
    els = []
    bl = find_bullet_list(doc)
    if not bl:
        return els
    for li in bl.get("content", []) or []:
        if li.get("type") != "list_item":
            continue
        para = None
        for c in li.get("content", []) or []:
            if c.get("type") == "paragraph":
                para = c
                break
        if not para:
            continue
        lines = [""]
        for n in para.get("content", []) or []:
            if n.get("type") == "hard_break":
                lines.append("")
            elif n.get("type") == "text":
                lines[-1] += n.get("text", "")
        header = lines[0].strip()
        if not header:
            continue
        code = header.split()[0]
        if not CODE_RE.match(code):
            continue
        m = re.search(r"\[(\w+)\]", header)
        typ = m.group(1) if m else ""
        label = re.sub(r"\[\w+\]", "", header[len(code):]).strip()
        state = action = effect = ""
        for ln in lines:
            ls = ln.strip()
            if ls.startswith("상태:"):
                state = ls[len("상태:"):].strip()
            elif ls.startswith("액션:"):
                action = ls[len("액션:"):].strip()
            elif ls.startswith("이펙트:"):
                effect = ls[len("이펙트:"):].strip()
        els.append({"code": code, "label": label, "type": typ,
                    "state": state, "action": action, "effect": effect})
    return els


def doc_covers(art):
    """SAE 스펙 래퍼의 relations.covers(→UCS/SRS) 목록."""
    rel = (art.get("relations") or {}).get("covers") or []
    return list(rel)


def load_sae_spec(sae_dir, screen_code):
    """`<sae_dir>/WF-<screen_code>.json` 을 읽어 구조화(dict) 반환. 없거나 파싱 실패 시 None.

    반환: {name, route, screen_code, covers:[...], elements:[{code,label,type,state,action,effect}]}
    penpot 없는 순수 파일 로딩(발급 본문 리치화용) — wfgen.load_screen 의 파싱 규약과 동일.
    """
    if not sae_dir or not screen_code:
        return None
    path = os.path.join(sae_dir, f"WF-{screen_code}.json")
    if not os.path.isfile(path):
        return None
    try:
        art = json.load(open(path, encoding="utf-8"))
    except Exception:
        return None
    doc = art.get("doc") or {}
    name, route = heading_name_route(doc, art.get("title") or screen_code, art.get("route") or "")
    return {
        "name": name,
        "route": route,
        "screen_code": art.get("screen_code") or screen_code,
        "covers": doc_covers(art),
        "elements": parse_sae_doc(doc),
    }
