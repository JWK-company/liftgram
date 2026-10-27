#!/usr/bin/env python3
"""wfanno.py — 와이어프레임 **주석 패널(penpot) ↔ SAE 기능명세(SSOT/PLM 문서)** 양방향 동기.

하나의 SSOT(`WF-<CODE>.json` SAE 명세)에서 **penpot 주석 패널** 과 **PLM 본문 SAE 표** 를 양쪽에
생성/역추출한다. 주석 패널 형태는 AnyC 실측 스키마(anno-bg/title/rule + 요소별 anno-code/label/state/
act/eff)를 **그대로 재현** + 화면 수준 자유서술(note)을 얹는다.

**페이지 스코핑(안전장치)**: penpot 파일은 페이지를 여러 개 가질 수 있고, 페이지를 복제하면 shape id 가
100% 동일해진다. 그래서 이 스크립트는 **한 번에 정확히 한 페이지**만 다룬다(`--page <id|이름>`).
미지정 시 페이지가 1개면 그 페이지, **2개 이상이면 실행을 거부**한다(페이지 목록을 찍고 `--page` 요구).
과거에는 전 페이지 objects 를 한 dict 로 병합해 `del-obj` 가 **다른 페이지의 주석 패널을 삭제**했다(QA A5).

서브커맨드:
  render  <project> [--code WF-XXX|--all] [--file FID] [--page P] [--dry-run]
      WF-<CODE>.json 명세 → penpot 주석 패널 생성/치환. **비파괴·멱등**: 각 패널을 `anno:<CODE>`
      그룹으로 감싸 기존 그룹만 교체(하이파이 프레임·다른 객체 무수정). 프레임 우측(+28·width 330)에 배치.
  extract <project> [--code WF-XXX|--all] [--file FID] [--dry-run] [--no-plm]
      penpot 의 anno-* 객체군 → SAE 명세(`WF-<CODE>.json`) + (선택) PLM 본문. **penpot 읽기만**
      (update-file 호출 0 — AnyC 같은 읽기전용 대상의 빈 PLM 문서 채우기 경로).
  sync    <project> [--file FID] [--dry-run] [--no-render] [--no-plm]
      일괄 양방향 — 프레임마다 **로컬 명세가 있으면** render+PLM 문서, **없으면** extract(읽기만)+PLM 문서.
      → 로컬 명세가 없던(=penpot에만 알맹이) 프레임은 **절대 render 하지 않는다**(읽기전용 원천 보호).
  mark    <project> --code WF-XXX [--items "12,13"] [--label 문구] [--date MM-DD] [--page P] [--clear]
      **변경 칩** — 바뀐 프레임 위에 `✱ 반영됨 · 07-31 · RDR.12, RDR.13` 칩을 얹는다(`chg:<CODE>` 그룹
      1개 · 멱등 교체 · 프레임 이름/댓글 핀 무접촉). 겹치면 프레임 우측 상단 내부로 폴백하고, 그것도
      막히면 **붙이지 않고 경고**한다(이웃을 밀어내지 않는다). `--clear` 로 걷어낸다(--code 생략 시 전량).

penpot RPC·shape 헬퍼·설정 해석은 **wfgen 모듈 재사용**(드리프트 방지). PLM 발급/본문 plumbing 은
**wfscan 모듈 재사용**. SAE 파싱/역직렬화는 **_sae_parse**(SSOT). 모든 HTTP user-agent 명시(CF 회피).
graceful: 예외에도 exit 0(비차단).
"""
import argparse
import datetime as _dt
import json
import os
import re
import sys
from urllib.parse import quote  # noqa: F401  (주석 처리된 [원본] fetch_page_roles 원복용)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wfgen        # noqa: E402  shape 헬퍼·penpot RPC·resolve·find_team/find_wf_project·get_file 재사용
import wfscan       # noqa: E402  PLM 발급/본문(plm_import·plm_put_doc·artifact_exists·build_doc) 재사용
from _sae_parse import (  # noqa: E402
    load_sae_spec, serialize_sae_artifact, parse_sae_doc,
)

ROOT_UUID = wfgen.ROOT_UUID
SCREEN_CODE_RE = re.compile(r"^[A-Z]{2,6}$")

# ---- 패널 배치 상수(AnyC 실측: panel_x=frame.x+390+28=418 · code_x=436 · text_x=502 · width=330) ----
GAP = 28            # 프레임 우변 → 패널 좌변 간격
PANEL_W = 330       # 패널 폭
PAD = 18            # 패널 좌 padding(code 열 x = panel_x + 18)
LABEL_DX = 66       # code 열 → label/state/act/eff 열 추가 오프셋(text_x = code_x + 66 = panel_x + 84)
TEXT_W = 228        # label/state/act/eff 텍스트 폭
CODE_W = 62         # code 텍스트 폭
INNER_W = PANEL_W - 2 * PAD   # 294 — title/rule/note 폭

# ---- 색·폰트(AnyC 실측 leaf 속성) ----
COL = {
    "bg": "#FFFFFF", "bg_stroke": "#D0D5DD", "rule": "#EAECF0",
    "title": "#101828", "code": "#4F46E5", "label": "#101828",
    "state": "#98A2B3", "act": "#98A2B3", "eff": "#475467", "note": "#475467",
}


def _wrap(s, size, maxpx):
    """CJK/ASCII 혼합 문자열을 maxpx 폭으로 그리디 줄바꿈(wfgen.text_px 폭 모델 공유)."""
    s = (s or "").strip()
    if not s:
        return []
    lines, cur = [], ""
    for ch in s:
        if cur and wfgen.text_px(cur + ch, size) > maxpx:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def _clean(v):
    v = (v or "").strip()
    return "" if v == "—" else v


# ================================================================== forward: 명세 → 패널 객체
def build_anno_panel(page_id, screen_code, name, note, elements, fx, fy, fw, fh):
    """SAE 명세 → penpot 주석 패널 change-ops. 반환 (ops, panel_x, panel_w, panel_h).

    패널 = `anno:<SCREEN_CODE>` 그룹 1개(자식: anno-bg/title/rule/note/code/label/state/act/eff).
    좌표는 절대좌표(프레임 우측 +GAP). AnyC 스키마·리듬 재현 + note 블록(있으면 rule 아래).
    """
    px = fx + fw + GAP
    code_x = px + PAD                 # 좌열 mono 코드
    text_x = code_x + LABEL_DX        # 우열 라벨/상태/액션/이펙트
    gid = wfgen._uid()

    kids = []   # bg 이후 z-순서 자식(그리는 순서 = z 하→상)

    def T(x, y, w, h, s, size, weight, color, nm, grow="fixed"):
        # note·effect 등 wrap 가능 필드는 auto-height 단일 오브젝트(penpot 네이티브 wrap)
        # → 역추출(extract)이 오브젝트 1개에서 **원문 그대로** 복원(왕복 무손실). 단일줄은 fixed.
        o = wfgen.text_obj(wfgen._uid(), nm, x, y, w, h, ROOT_UUID, s, color, size, weight, "left")
        o["growType"] = grow
        kids.append(o)
        return o

    def _nlines(s, w):
        return max(1, len(_wrap(s, 10.5, w)))

    # 제목 + 구분선
    T(code_x, fy + 16, INNER_W, 20, f"화면 설명 — {name}", 14, 700, COL["title"], "anno-title")
    kids.append(wfgen.rect_obj(wfgen._uid(), "anno-rule", code_x, fy + 42, INNER_W, 1,
                               ROOT_UUID, fill=COL["rule"]))

    cursor = fy + 53
    # 화면 note(자유서술) — rule 아래, 요소 위. 단일 auto-height 오브젝트(전폭 wrap).
    note_s = _clean(note)
    if note_s:
        nn = _nlines(note_s, INNER_W - 2)
        T(code_x, cursor, INNER_W, 16 * nn, note_s, 10.5, 400, COL["note"], "anno-note", "auto-height")
        cursor += 16 * nn + 8

    # 요소별 SAE — 필드마다 오브젝트 1개(effect 는 auto-height 로 여러 줄, 무손실 왕복)
    for el in (elements or []):
        code = el.get("code", "")
        label = (el.get("label") or "").strip()
        typ = (el.get("type") or "").strip()
        state, action, effect = _clean(el.get("state")), _clean(el.get("action")), _clean(el.get("effect"))
        label_txt = label + (f"  [{typ}]" if typ else "")
        label_y = cursor
        T(text_x, label_y, TEXT_W, 16, label_txt, 11.5, 600, COL["label"], "anno-label", "auto-height")
        T(code_x, label_y + 1, CODE_W, 14, code, 9.5, 700, COL["code"], "anno-code")
        detail_y = label_y + 21
        drew = False
        if state:
            T(text_x, detail_y, TEXT_W, 15, f"상태: {state}", 10.5, 600, COL["state"], "anno-state")
            detail_y += 16
            drew = True
        if action:
            T(text_x, detail_y, TEXT_W, 15, f"조작: {action}", 10.5, 600, COL["act"], "anno-act")
            detail_y += 16
            drew = True
        if effect:
            en = _nlines(effect, TEXT_W)
            T(text_x, detail_y, TEXT_W, 16 * en, effect, 10.5, 400, COL["eff"], "anno-eff", "auto-height")
            detail_y += 16 * en
            drew = True
        bottom = (detail_y - 16) if drew else label_y
        cursor = bottom + 19

    panel_h = max(66, (cursor - 19) + 15 + 16 - fy)   # 마지막 줄 하단 + padding
    # 배경(z 최하단 = 첫 자식) — 높이 확정 후 생성해 앞에 붙인다.
    bg = wfgen.rect_obj(wfgen._uid(), "anno-bg", px, fy, PANEL_W, panel_h,
                        ROOT_UUID, fill=COL["bg"], stroke=COL["bg_stroke"], radius=12)
    children = [bg] + kids
    for o in children:                # 그룹 자식 재지정(parentId=그룹 · frameId=ROOT 유지)
        o["parentId"] = gid
        o["frameId"] = ROOT_UUID
    bx, by, bw, bh = wfgen._bbox_of(children)
    group = wfgen.group_obj(gid, f"anno:{screen_code}", bx, by, bw, bh, ROOT_UUID,
                            [o["id"] for o in children], parent_id=None)
    ops = [wfgen.add_change(page_id, group)] + [wfgen.add_change(page_id, o) for o in children]
    return ops, px, PANEL_W, panel_h


# ================================================================== 변경 칩(chg:<CODE>) — 눈으로 보는 표시
#
# 왜 있나(관리자 요구 2026-07-31): "변경한 프레임에 확인할 수 있도록 표시를 해주면 좋겠다. 체크박스를
# 만들거나 별표시, 변경했다는 텍스트박스를 칩처럼 만들어 위에 붙여주거나."
# 댓글 반영이 끝나도 사본 페이지에는 **어느 프레임이 바뀌었는지 표가 없다**. 주석 패널은 프레임마다
# 항상 있으니 "바뀐 것"의 신호가 못 되고, 목업 도형은 바뀐 뒤의 모습만 보여준다. 그래서 프레임 위에
# 눈에 띄는 칩을 하나 얹는다 — `✱ 반영됨 · 07-31 · RDR.12, RDR.13`.
#
# 규약(주석 패널과 같은 형태로 맞춘다 — 배우는 규칙을 늘리지 않는다):
#   · 그룹 이름 `chg:<CODE>` 1개로 감싼다 → 재실행 시 그 그룹만 지우고 다시 그린다(멱등·중복 0).
#   · 이름이 **정확히 일치하는 그룹**만 후보다. 좌표 밴드 추정이 없으므로 남의 칩·주석 패널·목업 도형을
#     지울 방법 자체가 없다(주석 패널의 loose 밴드 사고를 반복하지 않는다).
#   · 프레임 이름·아티팩트 규약·댓글 핀은 건드리지 않는다(칩은 root 소속 별개 객체다).
CHG_PREFIX = "chg:"
CHG_LABEL = "반영됨"        # --label 로 교체 가능
CHG_MARK = "✱"             # 별표시(관리자 예시) — 텍스트 한 글자라 어떤 폰트에서도 깨지지 않는다
CHIP_H = 26                # 칩 높이
CHIP_R = 13                # 알약(pill) 라운드 = 높이/2
CHIP_FS = 11.5             # 칩 글자 크기
CHIP_PAD_X = 12            # 칩 좌우 padding
CHIP_TY = 6                # 칩 안 텍스트 y 오프셋
CHIP_GAP = 10              # 프레임 상단 ↔ 칩 하단 간격("제목 줄 위" 배치)
CHIP_INSET = 12            # 폴백 배치(프레임 우측 상단 **내부**)의 여백
CHIP_MINW = 96
CHIP_MAXW = 520
CHG_COL = {"bg": "#F59E0B", "stroke": "#B45309", "text": "#1F2937"}   # amber-500 / amber-700 / gray-800


def mark_items(raw, code):
    """`--items` 원문 → 요소코드 목록. `12,13` · `RDR.12 RDR.13` · `WF-RDR.12` 전부 받는다.

    숫자만 주면 그 화면 코드로 채운다(`12` → `RDR.12`) — 세션이 지시문에서 번호만 옮겨 적어도 된다.
    입력 순서 유지 · 중복 제거(사람이 같은 요소를 두 번 적어도 칩이 지저분해지지 않는다)."""
    out, seen = [], set()
    for tok in re.split(r"[,\s]+", str(raw or "")):
        t = tok.strip().upper()
        if not t:
            continue
        if t.startswith("WF-"):
            t = t[3:]
        if re.fullmatch(r"\d{1,3}", t):
            t = f"{code}.{int(t):02d}"
        elif re.fullmatch(r"\.\d{1,3}", t):
            t = f"{code}{t}"
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def chip_text(label, date_s, items, maxpx):
    """칩 문구 — `✱ 반영됨 · 07-31 · RDR.12, RDR.13`. **순수 함수**(테스트 고정 대상).

    폭이 모자라면 담을 수 있는 데까지 담고 나머지는 `외 N개`로 축약한다(관리자 요구: "길면 개수로").
    하나도 못 담으면 `N개 요소`. 머리(별표·라벨·날짜)는 어떤 경우에도 자르지 않는다 — 그것이 신호다."""
    head = f"{CHG_MARK} {label}" + (f" · {date_s}" if date_s else "")
    items = [i for i in (items or []) if i]
    if not items:
        return head
    full = f"{head} · " + ", ".join(items)
    if wfgen.text_px(full, CHIP_FS) <= maxpx:
        return full
    kept = []
    for it in items:
        rest = len(items) - len(kept) - 1
        cand = f"{head} · " + ", ".join(kept + [it]) + (f" 외 {rest}개" if rest else "")
        if wfgen.text_px(cand, CHIP_FS) > maxpx:
            break
        kept.append(it)
    if not kept:
        return f"{head} · {len(items)}개 요소"
    rest = len(items) - len(kept)
    return f"{head} · " + ", ".join(kept) + (f" 외 {rest}개" if rest else "")


def chip_box(fr, chip_w, spot):
    """칩 사각형 (x,y,w,h). **순수 함수** — 프레임 기하만 본다.

    `above`  프레임 **바로 위**(제목 줄 위) · 우측 정렬. penpot 이 그리는 board 이름 라벨은 좌측 상단이라
             우측 정렬이면 그 라벨과 겹치지 않는다. 패널은 프레임 **우변 +28**부터라 x 로도 안 만난다.
    `inside` 프레임 **우측 상단 내부**(위가 막혔을 때의 폴백). 덮는 것은 **자기 화면**뿐이다."""
    fx, fy, fw = fr["x"], fr["y"], fr["w"]
    if spot == "above":
        return fx + fw - chip_w, fy - CHIP_H - CHIP_GAP, chip_w, CHIP_H
    return fx + fw - chip_w - CHIP_INSET, fy + CHIP_INSET, chip_w, CHIP_H


def _rect_hit(a, b):
    """사각형 (x,y,w,h) 두 개가 겹치는가(맞닿음은 겹침 아님)."""
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def chip_placement(fr, all_frames, objs, chip_w, skip_ids=()):
    """겹치지 않는 첫 배치 → (rect, spot, hits). 둘 다 침범하면 (None, None, hits).

    검사 상대는 **루트 소속 객체**(이웃 board · 남의 `anno:*` 패널 · 남의 `chg:*` 칩)뿐이다 — 자식 도형은
    부모가 대표한다(제자리 교체 레시피의 겹침 검사와 같은 규약). `inside` 폴백에서는 **자기 화면 board**를
    제외한다(자기 위에 얹는 것이 그 배치의 정의다). 자기 옛 칩(`skip_ids`)도 늘 제외한다(교체 대상)."""
    mine = {b["id"] for b in screen_boards(fr, all_frames)}
    skip = set(skip_ids)
    hits = []
    for spot in ("above", "inside"):
        box = chip_box(fr, chip_w, spot)
        hit = []
        for oid, o in objs.items():
            key = wfgen._pget(o, "id") or oid    # dict 키와 obj["id"] 가 다를 수 있다(양쪽 대조)
            if oid in skip or key in skip:
                continue                          # 내 옛 칩 — 교체 대상이라 상대가 아니다
            if spot == "inside" and (oid in mine or key in mine):
                continue                          # 폴백은 **자기 화면 위**에 얹는 배치다
            if wfgen._pget(o, "parentId", "parent-id") != ROOT_UUID:
                continue                          # 루트 소속만 — 자식 도형은 부모가 대표한다
            ow, oh = o.get("width", 0) or 0, o.get("height", 0) or 0
            if not ow or not oh:
                continue
            if _rect_hit(box, (o.get("x", 0), o.get("y", 0), ow, oh)):
                hit.append(str(wfgen._pget(o, "name") or oid))
        if not hit:
            return box, spot, []
        hits = hit
    return None, None, hits


def build_change_chip(page_id, screen_code, box, text_s):
    """변경 칩 change-ops — `chg:<CODE>` 그룹(자식: chg-bg 알약 + chg-text). 좌표는 절대좌표."""
    x, y, w, h = box
    gid = wfgen._uid()
    bg = wfgen.rect_obj(wfgen._uid(), "chg-bg", x, y, w, h, ROOT_UUID,
                        fill=CHG_COL["bg"], stroke=CHG_COL["stroke"], radius=CHIP_R)
    tx = wfgen.text_obj(wfgen._uid(), "chg-text", x + CHIP_PAD_X, y + CHIP_TY,
                        w - 2 * CHIP_PAD_X, h - 2 * CHIP_TY, ROOT_UUID,
                        text_s, CHG_COL["text"], CHIP_FS, 700, "left")
    children = [bg, tx]
    for o in children:
        o["parentId"] = gid
        o["frameId"] = ROOT_UUID
    bx, by, bw, bh = wfgen._bbox_of(children)
    group = wfgen.group_obj(gid, f"{CHG_PREFIX}{screen_code}", bx, by, bw, bh, ROOT_UUID,
                            [o["id"] for o in children], parent_id=None)
    return [wfgen.add_change(page_id, group)] + [wfgen.add_change(page_id, o) for o in children]


def chg_stale_ids(objs, code):
    """이 화면의 옛 변경 칩(`chg:<CODE>` 그룹 + 자손) id 집합 — 재렌더/`--clear` 의 삭제 대상.

    이름이 **정확히 일치하는 그룹**에서만 출발하고, 자손은 ① 그룹 `shapes` 트리 ② parentId 사슬 두 갈래로
    회수한다(에디터에서 손댄 그룹의 shapes 목록이 낡아도 고아 도형을 남기지 않는다)."""
    want = f"{CHG_PREFIX}{code}"
    gids = set()
    for oid, o in objs.items():
        if wfgen._pget(o, "type") == "group" and str(wfgen._pget(o, "name") or "") == want:
            gids.add(oid)
            gid = wfgen._pget(o, "id")
            if gid:
                gids.add(gid)
    if not gids:
        return set()
    ids, stack = set(), list(gids)
    while stack:
        cur = stack.pop()
        if cur in ids:
            continue
        ids.add(cur)
        for ch in (wfgen._pget(objs.get(cur) or {}, "shapes", default=[]) or []):
            stack.append(ch)
    for oid, o in objs.items():
        if oid in ids:
            continue
        cur, hops = wfgen._pget(o, "parentId", "parent-id"), 0
        while cur and hops < 12:
            if cur in gids:
                ids.add(oid)
                break
            nxt = wfgen._pget(objs.get(cur) or {}, "parentId", "parent-id")
            if not nxt or nxt == cur:
                break
            cur, hops = nxt, hops + 1
    return {i for i in ids if i in objs}


# ================================================================== reverse: penpot anno-* → 명세
def _text_of(o):
    """penpot text 오브젝트 → 평문(leaf.text 이어붙임)."""
    out = []

    def walk(n):
        if isinstance(n, dict):
            t = n.get("text")
            if isinstance(t, str):
                out.append(t)
            for k in ("children", "content"):
                if k in n:
                    walk(n[k])
        elif isinstance(n, list):
            for x in n:
                walk(x)
    walk(o.get("content") or {})
    return "".join(out)


_LABEL_TYPE_RE = re.compile(r"\s*\[(\w+)\]\s*$")


def extract_elements(anno_objs):
    """프레임 우측 anno-* 오브젝트군 → (note, elements[]). anno-code 를 앵커로 요소 분리.

    anno-code(요소코드)를 y 순으로 앵커 삼아 [code_y-4, 다음code_y-4) 구간의 label/state/act/eff 를 귀속.
    note = anno-note 텍스트(줄들 join · rule 아래 요소 위). type 은 label 의 `[..]` 접미(우리 render 가 부여)에서 복원.
    """
    codes = sorted(((o.get("y", 0), _text_of(o)) for o in anno_objs if o.get("name") == "anno-code"),
                   key=lambda t: t[0])
    notes = sorted(((o.get("y", 0), _text_of(o)) for o in anno_objs if o.get("name") == "anno-note"),
                   key=lambda t: t[0])
    note = " ".join(t for _, t in notes).strip()
    # 이름별 y-정렬 텍스트 버킷
    def bucket(nm):
        return sorted(((o.get("y", 0), _text_of(o)) for o in anno_objs if o.get("name") == nm),
                      key=lambda t: t[0])
    labels, states, acts, effs = bucket("anno-label"), bucket("anno-state"), bucket("anno-act"), bucket("anno-eff")
    els = []
    for i, (cy, code) in enumerate(codes):
        y_lo = cy - 6
        y_hi = codes[i + 1][0] - 6 if i + 1 < len(codes) else 10 ** 9
        in_range = lambda y: y_lo <= y < y_hi
        label_txt = " ".join(t for y, t in labels if in_range(y)).strip()
        typ = ""
        m = _LABEL_TYPE_RE.search(label_txt)
        if m:
            typ = m.group(1)
            label_txt = _LABEL_TYPE_RE.sub("", label_txt).strip()
        state = " ".join(t for y, t in states if in_range(y)).strip()
        state = re.sub(r"^상태:\s*", "", state)
        action = " ".join(t for y, t in acts if in_range(y)).strip()
        action = re.sub(r"^(조작|액션):\s*", "", action)
        effect = " ".join(t for y, t in effs if in_range(y)).strip()
        els.append({"code": code.strip(), "label": label_txt, "type": typ,
                    "state": state, "action": action, "effect": effect})
    return note, els


# ================================================================== penpot 파일 파싱
# [원본] 페이지 **병합** 로더 — 결함(QA A5)으로 전 호출부 차단됨. 원복 시 주석 해제한 호출부와 함께 사용.
#   결함: `objs[oid] = obj` / `obj_page[oid] = pid` 가 파일 전역 shape id 유일성을 가정한다.
#   페이지를 복제하면(우리 도구든 penpot UI의 '페이지 복제'든) shape id 가 100% 동일해져
#   같은 id 가 여러 페이지에 존재 → 소속 페이지가 **마지막 페이지로 덮인다**(dict 순서 의존).
#   그 결과 render/sync 의 `del-obj`가 **엉뚱한 페이지(원본)의 주석 패널을 삭제**했다.
# def _load_file(base, tok, file_id):
#     """get-file → (revn, vern, objects_by_id, obj_page{id:pageId}). 읽기 전용."""
#     f = wfgen.get_file(base, tok, file_id)
#     revn = wfgen._pget(f, "revn", default=0)
#     vern = wfgen._pget(f, "vern", default=0)
#     data = wfgen._pget(f, "data")
#     pages = wfgen._pget(data, "pagesIndex", "pages-index") if isinstance(data, dict) else None
#     objs, obj_page = {}, {}
#     if isinstance(pages, dict):
#         for pid, page in pages.items():
#             o = wfgen._pget(page, "objects")
#             if isinstance(o, dict):
#                 for oid, obj in o.items():
#                     objs[oid] = obj
#                     obj_page[oid] = pid
#     return revn, vern, objs, obj_page


# [개선] 페이지 **경계 보존** 로더 — 객체 키는 (page_id, obj_id) 복합. 병합하지 않는다.
def _load_pages(base, tok, file_id):
    """get-file → (revn, vern, pages). pages = [(page_id, page_name, objects{oid:obj}), ...] 파일 순서.

    **페이지를 절대 병합하지 않는다.** 이후 모든 경로(프레임 탐색·패널 region·stale 수집·del-obj/add-obj)는
    _select_page 로 고른 **단일 페이지의 objects dict** 만 본다 = 사실상 (page_id, obj_id) 복합 키.
    순서는 data.pages(페이지 id 배열) 우선, 없으면 pagesIndex 키 순서(순서 가정에 의존하지 않도록
    선택 자체는 _select_page 가 명시적으로 강제한다)."""
    f = wfgen.get_file(base, tok, file_id)
    revn = wfgen._pget(f, "revn", default=0)
    vern = wfgen._pget(f, "vern", default=0)
    data = wfgen._pget(f, "data")
    pidx = wfgen._pget(data, "pagesIndex", "pages-index") if isinstance(data, dict) else None
    order = wfgen._pget(data, "pages") if isinstance(data, dict) else None
    pages = []
    if isinstance(pidx, dict):
        keys = [k for k in order if k in pidx] if isinstance(order, list) else []
        keys += [k for k in pidx.keys() if k not in keys]     # order 누락분 보강
        for pid in keys:
            page = pidx.get(pid) or {}
            o = wfgen._pget(page, "objects")
            pages.append((pid, (wfgen._pget(page, "name") or "").strip(),
                          o if isinstance(o, dict) else {}))
    return revn, vern, pages


def _root_frame_count(objs):
    return sum(1 for o in objs.values()
               if wfgen._pget(o, "type") == "frame"
               and wfgen._pget(o, "parentId", "parent-id") == ROOT_UUID)


def _page_list_text(pages):
    """오류 메시지용 페이지 목록(이름·id·루트 프레임 수)."""
    out = []
    for pid, pname, objs in pages:
        out.append(f"      - {(pname or '(이름없음)'):<22} {pid}   (루트 프레임 {_root_frame_count(objs)})")
    return "\n".join(out)


def _select_page(pages, page_arg):
    """페이지 선택. 반환 (page_id, page_name, objects, err|None).

    - `--page` 지정: id 완전일치 → 이름 완전일치 → 이름 대소문자 무시 일치. 못 찾거나 이름이 중복이면 err.
    - `--page` 미지정: 페이지가 **1개면 그 페이지**(기존 동작 동일). **2개 이상이면 실행 거부**(err).
      '첫 페이지'로 추측하지 않는다 — 추측이 곧 원본 패널 삭제였다(QA A5. 침묵 실패가 최악).
    """
    if not pages:
        return None, None, {}, "페이지가 없다(get-file data.pagesIndex 비어있음)."
    if page_arg:
        want = str(page_arg).strip()
        for pid, pname, objs in pages:
            if pid == want:
                return pid, pname, objs, None
        hits = [p for p in pages if p[1] == want] or [p for p in pages if p[1].casefold() == want.casefold()]
        if len(hits) == 1:
            pid, pname, objs = hits[0]
            return pid, pname, objs, None
        if len(hits) > 1:
            return None, None, {}, f"페이지 이름 '{want}' 이 {len(hits)}개다 — 이름 대신 **페이지 id**로 지정하라."
        return None, None, {}, f"--page '{want}' 에 해당하는 페이지가 없다."
    if len(pages) == 1:
        pid, pname, objs = pages[0]
        return pid, pname, objs, None
    return None, None, {}, (f"페이지가 {len(pages)}개다 — 어느 페이지를 다룰지 `--page` 로 명시해야 한다. "
                            "(추측하면 다른 페이지의 주석 패널을 지울 수 있다)")


def _page_or_skip(tag, fname, fid, pages, page_arg):
    """_select_page + 거부 시 표준 안내 출력. 반환 (page_id, page_name, objs) 또는 None(=이 파일 스킵)."""
    pid, pname, objs, err = _select_page(pages, page_arg)
    if not err:
        return pid, pname, objs
    print(f"\n{tag} ✖ 실행 거부 — file='{fname}' ({fid}): {err}")
    print(f"    이 파일은 **아무것도 건드리지 않고** 스킵한다. 페이지 목록:")
    print(_page_list_text(pages))
    first = pages[0][1] if pages else ""
    print(f"    예) --page \"{first or '<페이지이름>'}\"   또는   --page <페이지 id>")
    return None


def _frames(objs):
    """루트 프레임 목록 → [{id,name,x,y,w,h,code}]."""
    out = []
    for oid, o in objs.items():
        if wfgen._pget(o, "type") != "frame":
            continue
        if wfgen._pget(o, "parentId", "parent-id") != ROOT_UUID:
            continue
        name = (wfgen._pget(o, "name") or "").strip()
        head = name.split()[0] if name.split() else ""
        code = head if SCREEN_CODE_RE.match(head) else None
        out.append({"id": wfgen._pget(o, "id") or oid, "name": name, "code": code,
                    "x": o.get("x", 0), "y": o.get("y", 0),
                    "w": o.get("width", 0), "h": o.get("height", 0)})
    return out


# ================================================================== 패널 배치 SSOT (감사 2026-07-31)
# [원본] wfgen 과 wfanno 가 패널 x 를 **서로 다르게** 계산했다 — 실사용 겹침 결함.
#   · wfgen(main): `build_anno_panel(..., s0.ox, s0.oy, wmax - s0.ox, s0.h)` = 그 화면 **모든 board** 우측 끝
#   · wfanno(cmd_render): `build_anno_panel(..., fr["x"], fr["y"], fr["w"], fr["h"])` = **루트 프레임만**
#   → 오버레이 board(<CODE>-A)나 미배치 board(<CODE>-Z)가 있는 화면은 재렌더 시 패널이 그 board 위를 덮었다.
#   이제 아래 두 함수가 **유일한 배치 규약**이고 양쪽이 이것만 호출한다.
def screen_boards(fr, all_frames=None):
    """이 화면에 속한 board 전량 — 본체 + 보조 board(`<CODE>-A` 오버레이 · `<CODE>-Z` 미배치 …).

    보조 board 는 이름 head 가 `<CODE>-A` 라 SCREEN_CODE_RE(하이픈 불허)에 안 걸려 code=None 이다.
    따라서 code 가 아니라 **이름 head 접두**로 회수한다.
    """
    code = fr.get("code")
    out = [fr]
    if not code:
        return out
    for g in (all_frames or []):
        if g is fr or (g.get("id") and g.get("id") == fr.get("id")):
            continue
        nm = (g.get("name") or "").strip()
        head = nm.split()[0] if nm.split() else ""
        if head.startswith(code + "-"):
            out.append(g)
    return out


def panel_anchor(fr, all_frames=None):
    """[SSOT] 주석 패널 앵커 `(fx, fy, fw, fh)` — 패널 좌변 = `fx + fw + GAP`.

    화면의 **모든 board 를 감싼 우측 끝**을 기준으로 삼아 보조 board 위를 절대 덮지 않는다.
    wfgen(최초 생성)·wfanno(재렌더)·_panel_band(stale 밴드)가 전부 이 함수 하나를 쓴다.
    """
    bs = screen_boards(fr, all_frames)
    fx, fy = fr["x"], fr["y"]
    right = max(g["x"] + g["w"] for g in bs)
    return fx, fy, right - fx, fr["h"]


# ---- loose anno-* 삭제 밴드 상수(아래 _panel_band) ----
LOOSE_PAD = 10       # 패널 실폭(PANEL_W) 기준 x 여유 — 이웃 열을 절대 넘지 않을 만큼만
LOOSE_TAIL = 600     # 아래 이웃이 없을 때의 y 꼬리(레거시 AnyC 패널은 프레임보다 길다: h≈1.5×)


# [원본] 넓은 폴백 region — **실사용 데이터 손실의 직접 원인**(2026-07-31: RDR.12·13 / QA.09·10 소실).
#   ① 대상 프레임에 아직 anno-bg 가 없으면(그 화면 첫 렌더) x 가 `fx+fw-10 … fx+fw+PANEL_W+140`,
#      y 가 `fy-40 … fy+fh+400` 까지 벌어져 **이웃 프레임의 패널**이 통째로 그 안에 들어왔다.
#   ② anno-bg 가 있는 경로에는 **아래 이웃 클램프가 아예 없다** — 패널이 프레임보다 길면(요소 많은 화면)
#      region 이 아래 화면의 패널 위로 그대로 뻗었다.
#   ③ _anno_for_frame 이 그 region 안의 **모든** anno-* 를 stale 로 넣어 del-obj 했다(소유권 무시).
#   → `--code` 로 화면을 하나씩 렌더하면 남의 패널을 지운 뒤 자기 것만 다시 그려 **영구 소실**.
#     (`--all` 은 같은 커밋에서 전부 다시 add 되어 증상이 가려졌다 = 오래 숨은 이유.)
#   원복 시 아래를 주석 해제하고 _panel_band/_anno_ctx 경로를 주석 처리하라.
# def _panel_region(objs, fr, all_frames=None):
#     """프레임의 주석 패널 region(x_lo,x_hi,y_lo,y_hi). 패널 높이는 프레임보다 클 수 있어(AnyC h≈1.5×)
#     **패널 자신의 anno-bg 로 정밀 바운딩**한다(아래 프레임 패널 침범 방지). anno-bg 없으면 같은 열의
#     바로 아래 프레임 상단으로, 그것도 없으면 fy+fh+400 로 보수적 폴백."""
#     fx, fy, fw, fh = fr["x"], fr["y"], fr["w"], fr["h"]
#     px = fx + fw + GAP
#     bg = None
#     for oid, o in objs.items():
#         if wfgen._pget(o, "name") == "anno-bg" and wfgen._pget(o, "type") == "rect":
#             ox, oy = o.get("x", 0), o.get("y", 0)
#             if abs(ox - px) <= 14 and abs(oy - fy) <= 14:
#                 bg = o
#                 break
#     if bg:
#         return bg["x"] - 4, bg["x"] + bg.get("width", PANEL_W) + 4, bg["y"] - 4, bg["y"] + bg.get("height", fh) + 4
#     # 폴백: 같은 열(|Δx|<60) 바로 아래 프레임 상단까지
#     y_hi = fy + fh + 400
#     if all_frames:
#         belows = [g["y"] for g in all_frames if g is not fr and abs(g["x"] - fx) < 60 and g["y"] > fy + 20]
#         if belows:
#             y_hi = min(belows) - 4
#     return fx + fw - 10, fx + fw + PANEL_W + 140, fy - 40, y_hi


# [개선] 소유권 우선 + 좁은 밴드. 아래 3개(_anno_groups·_owner_of·_panel_band)와 _anno_ctx 가 한 벌이다.
def _anno_groups(objs):
    """`anno:<CODE>` 그룹 id → 그룹 이름. (dict 키·obj["id"] 양쪽으로 색인 — 둘이 다를 수 있다)"""
    out = {}
    for oid, o in objs.items():
        if wfgen._pget(o, "type") != "group":
            continue
        nm = str(wfgen._pget(o, "name") or "")
        if nm.startswith("anno:"):
            out[oid] = nm
            gid = wfgen._pget(o, "id")
            if gid:
                out[gid] = nm
    return out


def _owner_of(objs, groups, oid, o):
    """객체의 **소유 패널**(`anno:<CODE>`) 이름. parentId 사슬을 거슬러 판정 — 그룹의 shapes 목록이
    낡아도(penpot 에디터 편집) 소유권을 놓치지 않는다. 소유자 없으면 None(=loose)."""
    if not groups:
        return None
    if oid in groups:
        return groups[oid]
    cur, hops = wfgen._pget(o, "parentId", "parent-id"), 0
    while cur and hops < 12:
        if cur in groups:
            return groups[cur]
        nxt = wfgen._pget(objs.get(cur) or {}, "parentId", "parent-id")
        if not nxt or nxt == cur:
            return None
        cur, hops = nxt, hops + 1
    return None


def _overlap(a_lo, a_hi, b_lo, b_hi):
    """닫힌 구간 [a_lo,a_hi] 과 [b_lo,b_hi] 가 겹치는가."""
    return a_lo <= b_hi and b_lo <= a_hi


def _panel_band(fr, bgs=(), owner=None, all_frames=None):
    """이 프레임 패널의 **loose anno-\\* 삭제 밴드**(x_lo,x_hi,y_lo,y_hi).

    핵심: 밴드는 **프레임 레이아웃(기하)의 순수 함수**다 — 어떤 화면을 먼저 렌더했는지, 이웃 패널이
    이미 있는지에 좌우되지 않는다. 그래서 `--code` 순차 렌더와 `--all` 일괄 렌더가 같은 판정을 내린다
    (불변식: 순차 결과 == 일괄 결과. 이번 결함의 본질).

      x : 패널 실폭 기준 좁은 밴드 — `[fx+fw+GAP-LOOSE_PAD, fx+fw+GAP+PANEL_W+LOOSE_PAD]`.
          (구 코드의 `+140` 슬랙이 우측 이웃을 삼켰다)
      y : `fy-8` … **같은 x 밴드를 쓰는 아래 이웃 프레임 상단 -4**. 이웃이 없으면 `fy+fh+LOOSE_TAIL`.
          이웃 클램프는 **항상 최우선**(아래 화면의 패널 영역을 절대 침범하지 않는다).
          자기 앵커의 anno-bg(레거시 loose 패널)가 더 길면 그 하단까지만 **확장**하되 클램프에 다시 걸린다.
    """
    # 밴드 기준도 배치 SSOT(panel_anchor)를 쓴다 — 보조 board 가 있는 화면에서 밴드와 실제 패널이
    # 어긋나 레거시 loose 객체를 못 지우거나 남의 열을 침범하던 문제를 함께 막는다.
    fx, fy, fw, fh = panel_anchor(fr, all_frames)
    px = fx + fw + GAP
    x_lo, x_hi = px - LOOSE_PAD, px + PANEL_W + LOOSE_PAD
    y_lo = fy - 8
    y_hi = fy + fh + LOOSE_TAIL
    mine = f"anno:{fr['code']}" if fr.get("code") else None
    # (a) 자기 앵커(px, fy)의 anno-bg 가 더 길면 그 하단까지 확장. **남의 그룹 소유 bg 는 무시**(소유권 우선).
    for oid, o in bgs:
        if abs(o.get("x", 0) - px) > 14 or abs(o.get("y", 0) - fy) > 14:
            continue
        own = (owner or {}).get(oid)
        if own and own != mine:
            continue
        y_hi = max(y_hi, o.get("y", fy) + o.get("height", fh) + 4)
    # (b) 이웃 클램프(최우선) — 내 밴드와 x 가 겹치는 아래 프레임(그 몸통이든 그 패널이든)의 상단 직전에서 끊는다.
    tops = []
    for g in (all_frames or []):
        if g is fr or (g.get("id") and g.get("id") == fr.get("id")):
            continue
        if g["y"] <= fy + 8:
            continue
        gax, _gay, gaw, _gah = panel_anchor(g, all_frames)
        gpx = gax + gaw + GAP
        if _overlap(x_lo, x_hi, gpx, gpx + PANEL_W) or _overlap(x_lo, x_hi, g["x"], g["x"] + g["w"]):
            tops.append(g["y"])
    if tops:
        y_hi = min(y_hi, min(tops) - 4)
    return x_lo, x_hi, y_lo, max(y_hi, y_lo)


def _anno_ctx(objs, all_frames):
    """패널 판정 컨텍스트 — (owner{oid:그룹명}, bands{frame_id:밴드}). 프레임마다 재계산하지 않도록 1회 산출."""
    groups = _anno_groups(objs)
    owner = {oid: _owner_of(objs, groups, oid, o) for oid, o in objs.items()} if groups else {}
    bgs = [(oid, o) for oid, o in objs.items()
           if wfgen._pget(o, "name") == "anno-bg" and wfgen._pget(o, "type") == "rect"]
    bands = {}
    for i, g in enumerate(all_frames or []):
        bands[g.get("id") or i] = _panel_band(g, bgs, owner, all_frames)
    return owner, bands


def _anno_for_frame(objs, fr, all_frames=None):
    """이 프레임 패널의 anno 텍스트 + **이 프레임 패널로 확정된** 삭제 대상 id.

    반환 (anno_texts[list of obj], stale_ids[삭제대상 id set]). 판정 순서 = 소유권 → 밴드 → 모호성:
      1) 내 그룹 `anno:<CODE>` 와 그 자손 → stale(자기 패널 교체 · **밴드 무관** · 기존 동작 유지).
      2) **다른** `anno:<CODE'>` 그룹 소유 객체 → 절대 stale 아님(읽기에서도 제외). 남의 패널 불가침.
      3) 그룹 밖 loose `anno-*` → 이 프레임의 좁은 밴드(_panel_band) 안일 때만 stale(레거시 정리).
         다른 프레임 밴드에도 걸리면(소유 모호) **건드리지 않는다**(보수적 — 지우느니 남긴다).
    """
    all_frames = list(all_frames) if all_frames else [fr]
    owner, bands = _anno_ctx(objs, all_frames)
    fkey = fr.get("id") or next((i for i, g in enumerate(all_frames) if g is fr), 0)
    band = bands.get(fkey) or _panel_band(fr, (), owner, all_frames)
    others = [b for k, b in bands.items() if k != fkey]
    mine = f"anno:{fr['code']}" if fr.get("code") else None

    def _in(b, o):
        x, y = o.get("x", 0), o.get("y", 0)
        return b[0] <= x <= b[1] and b[2] <= y <= b[3]

    stale = set()
    anno_texts = []
    # 1) 내 그룹 자손(shapes 트리) — 기존 로직 그대로
    group_id = None
    for oid, o in objs.items():
        if mine and wfgen._pget(o, "type") == "group" and wfgen._pget(o, "name") == mine:
            group_id = wfgen._pget(o, "id") or oid
            break
    if group_id:
        stack = [group_id]
        while stack:
            cur = stack.pop()
            if cur in stale:
                continue
            stale.add(cur)
            co = objs.get(cur) or {}
            for ch in (wfgen._pget(co, "shapes", default=[]) or []):
                stack.append(ch)
    for oid, o in objs.items():
        nm = str(wfgen._pget(o, "name") or "")
        if not nm.startswith("anno"):
            continue
        own = owner.get(oid)
        if own and own != mine:
            continue                      # 2) 남의 패널 — 삭제도 읽기도 금지(소유권 우선)
        if own == mine or oid in stale:    # 내 패널 소유물 — shapes 목록이 낡아도 부모 사슬로 회수
            stale.add(oid)
            if wfgen._pget(o, "type") == "text":
                anno_texts.append(o)
            continue
        # 3) loose(그룹 밖) — 밴드 안 + 모호하지 않을 때만
        if not _in(band, o):
            continue
        if any(_in(b, o) for b in others):
            continue
        if wfgen._pget(o, "type") == "text":
            anno_texts.append(o)
        if nm == "anno-bg" or nm.startswith("anno-"):
            stale.add(oid)
    return anno_texts, stale


# ================================================================== 공통: 설정·penpot 해석
def _resolve_ctx(project_override, sae_override):
    cfg = wfgen.resolve()
    project = project_override or cfg["project"]
    sae_dir = sae_override
    if not sae_dir and cfg["ouro"]:
        cand = os.path.join(cfg["ouro"], "docs", "wireframes")
        sae_dir = cand if os.path.isdir(cand) else cand   # 없으면 write 시 mkdir
    if not cfg["penpot_token"]:
        healed = wfgen._selfheal_penpot_token(cfg["plm_api"], cfg["plm_token"], cfg["ouro"])
        if healed:
            cfg["penpot_token"] = healed
            print("[wfanno] penpot 토큰 자동 발급(.env) — PLM 인증 프로비저닝 완료.")
    return cfg, project, sae_dir


def _find_files(base, tok, project, file_override):
    """penpot 팀 `PLM · {project}` → Wireframes → 파일 [(id,name)]. --file 지정 시 그것만."""
    team_id = wfgen.find_team(base, tok, project)
    if not team_id:
        print(f"[wfanno] penpot 팀 'PLM · {project}' 없음 — 와이어프레임 탭을 먼저 열어 팀 생성.")
        return []
    pid = wfgen.find_wf_project(base, tok, team_id, "Wireframes")
    if not pid:
        print(f"[wfanno] penpot 팀 'PLM · {project}' 안 'Wireframes' 프로젝트 없음.")
        return []
    files = wfscan.list_files(base, tok, pid)
    if file_override:
        files = [(fid, fn) for fid, fn in files if fid == file_override]
    return files


def _sae_dir_write(sae_dir):
    if sae_dir and not os.path.isdir(sae_dir):
        try:
            os.makedirs(sae_dir, exist_ok=True)
        except Exception:
            pass
    return sae_dir


def _norm_code(code_arg):
    """--code WF-XXX|XXX → SCREEN_CODE(XXX)."""
    if not code_arg:
        return None
    c = code_arg.strip().upper()
    return c[3:] if c.startswith("WF-") else c


# ================================================================== PLM 문서 push(공유)
def _plm_push_doc(cfg, project, code, frame_name, loc, spec, dry, force=False):
    """extract/sync 의 PLM 본문 채우기 — wfscan.build_doc(note 포함) 로 upsert. 실패 비차단.

    **비파괴**(wfscan 규약): 기존 문서가 이미 리치(표/미디어)면 스킵(force 시 덮어씀). 얇음/부재만 채운다.
    → AnyC 처럼 일부 이미 채워진 PLM 문서를 회귀시키지 않는다."""
    api, atok = cfg["plm_api"], cfg["plm_token"]
    if not atok:
        return "no-token"
    doc = wfscan.build_doc(frame_name, code, loc, spec)
    covers = (spec or {}).get("covers") or []
    rels = [{"src": f"WF-{code}", "rel": "covers", "dst": d} for d in covers]
    if dry:
        return "dry"
    try:
        exists = wfscan.artifact_exists(api, atok, project, f"WF-{code}")
    except Exception:
        exists = False
    if exists and not force:
        try:
            cur = wfscan.plm_get_doc(api, atok, project, f"WF-{code}")
            if cur is not None and wfscan._doc_has_rich(cur):
                return "skip-rich"   # 이미 채워짐 — 회귀 방지
        except Exception:
            pass
    try:
        art = {"code": f"WF-{code}", "type": "Wireframe", "title": (frame_name or f"WF-{code}")[:200],
               "status": "Draft", "body": ""}
        wfscan.plm_import(api, atok, project, [art], rels)
        wfscan.plm_put_doc(api, atok, project, f"WF-{code}", doc)
        return "ok"
    except Exception as e:
        print(f"[wfanno] ⚠ WF-{code} PLM 본문 push 실패(비차단): {str(e)[:70]}")
        return "err"


# ================================================================== 사본 역할 재확인(감사 C1)
#
# 왜 있나: 릴레이는 작업을 세션에 넘길 때 **딱 한 번** 사본 상태를 조회하고 그 결과로 지시문을 굳힌다
# (`plm-channel.mjs`). 그 사이 관리자가 [정본으로 올리기]를 하면 지시문이 가리키던 `--page`는 이제
# **정본**이다 — 그대로 render 하면 검토 없이 정본이 바뀌고, 세션은 반대로 "정본 미반영"이라고 보고한다.
# → 쓰기 **직전**에 한 번 더 확인하고, 바뀌었으면 아무것도 쓰지 않고 멈춘다(안전 실패).

ROLE_ABORT_HINT = ("대시보드에서 상태를 확인한 뒤 같은 댓글을 다시 보내주세요"
                   " — 사본이 정본이 됐다면 반영은 이미 끝난 것입니다.")


def page_role_of(items, page):
    """역할 대장 items[] + 페이지 uuid → 역할 판정(**순수 함수** · I/O 없음).

    'working'   아직 작업용 사본이다(계속 써도 된다)
    'promoting' 승격이 진행 중이다(promoted_at 있음 · 대장 갱신 전 — 감사 C2 중간 상태)
    'promoted'  그 사본이 **정본이 됐다**(옛 정본이 보관본 행으로 그 페이지를 가리킨다)
    'archived'  그 페이지 자체가 보관본이다
    'canonical' 역할 행이 없다(= 정본이거나 사본이 사라졌다)

    ★ 감사 X3(R3 높음) — **마감된 승격(`closed_at`)도 `promoted`다.** `[보관 완료]`는 되돌리기 창을
      닫을 뿐 "승격됐다"는 사실을 취소하지 않는다. 예전엔 `closed_at` 행을 통째로 걸러내 그 페이지가
      `canonical`로 읽혔고, `stage-apply`는 `promoted`가 아니면 exit 3이라 **승격이 끝났는데 도구가
      아니라고 말하는** 데드엔드가 됐다(남는 길은 `--force` = 검토 없이 정본 덮어쓰기).
      살아 있는 행(`page_id` 직접 일치) 판정은 종전 그대로 `closed_at`을 배제한다 — 마감된 사본이
      아직 작업 중인 것처럼 보이면 안 되기 때문이다. 바뀐 것은 **역참조 한 갈래**뿐이다.
    """
    allrows = [r for r in (items or []) if isinstance(r, dict)]
    rows = [r for r in allrows if not r.get("closed_at")]
    for r in rows:
        if str(r.get("page_id") or "") == str(page):
            role = str(r.get("role") or "")
            if role == "working":
                return "promoting" if r.get("promoted_at") else "working"
            if role == "archived":
                return "archived"
    # [원본] for r in rows:  ← 마감된 승격을 놓쳤다(감사 X3). 원복 시 `allrows`를 `rows`로 되돌린다.
    for r in allrows:
        if str(r.get("role") or "") == "archived" and str(r.get("src_page_id") or "") == str(page):
            return "promoted"
    return "canonical"


# 사유 문장은 릴레이(`wf-feedback.mjs` RECHECK_REASON)와 **같은 문장**이다 — 사람이 지시문과 스크립트
# 출력에서 다른 말을 들으면 어느 쪽이 맞는지 매번 판단해야 한다.
ROLE_REASON = {
    "promoted": "이 사본이 그사이 정본으로 승격됐습니다",
    "promoting": "이 사본의 승격이 진행 중입니다",
    "archived": "이 페이지가 보관본(이전 정본)이 됐습니다",
    "canonical": "이 사본이 사라졌습니다(버려졌거나 이미 정본입니다)",
    "working": "작업용 사본이 그대로입니다",
}


def fetch_page_roles(cfg, project):
    """PLM `GET /wireframe/working-copy?project=P` → (items, None) / (None, 사유).
    조회 실패는 **성공으로 치지 않는다** — 확인되지 않은 상태로 정본을 건드리지 않기 위해서다.

    구현은 **wfscan.fetch_page_roles 가 SSOT**다(wfscan 도 같은 대장으로 사본 페이지를 스캔에서
    제외한다 — 감사 G4). 두 벌로 갈라지면 한쪽만 고쳐지는 드리프트가 생긴다."""
    # [원본] 자체 구현 — 원복 시 아래를 주석 해제하고 위임 호출을 주석 처리.
    # api, atok = cfg.get("plm_api"), cfg.get("plm_token")
    # if not api or not atok:
    #     return None, "PLM 설정 부족(api/token) — 사본 상태를 확인할 수 없습니다"
    # try:
    #     r = wfscan.plm_get(api, atok, f"/wireframe/working-copy?project={quote(str(project))}")
    # except Exception as e:
    #     return None, f"사본 상태 조회 실패({str(e)[:80]})"
    # items = r.get("items") if isinstance(r, dict) else None
    # if not isinstance(items, list):
    #     return None, "사본 상태 응답 형식이 예상과 다릅니다(items 없음)"
    # return items, None
    # [개선] 같은 판정 근거를 한 곳에서만 유지.
    return wfscan.fetch_page_roles(cfg, project)


def expect_matches(got, expect):
    """`--expect-page-role` 기대 ↔ 실제 판정. **순수 함수**.

    `canonical` 기대는 `promoted`(그 사본이 정본이 됐다)도 받는다 — 둘 다 "지금 이 페이지가 정본"이라는
    같은 사실이고, 승격 직후 대장 모양만 다르다. 여기서 갈라 놓으면 승격 한 번에 정상 절차가 멈춘다."""
    if expect == "canonical":
        return got in ("canonical", "promoted")
    return got == expect


def recheck_page_role(cfg, project, page, expect):
    """쓰기 직전 재확인 → ("ok", 사유) / ("stop", 사유). 조회 실패도 stop(안전 실패)."""
    items, err = fetch_page_roles(cfg, project)
    if err:
        return "stop", err
    got = page_role_of(items, page)
    if expect_matches(got, expect):
        return "ok", ROLE_REASON.get(got, got)
    return "stop", f"{ROLE_REASON.get(got, got)} (기대={expect} 실제={got} page={page})"


# ================================================================== 정본 산출물 쓰기 가드(감사 W10)
#
# 왜 있나: C1 가드(`--expect-page-role`)는 **render 에만** 붙어 있었다. 그런데 **PLM 정본 본문을 실제로
# 쓰는 것**은 `sync`(_plm_push_doc)와 `extract`이고, 이 둘은 역할 대장을 한 번도 조회하지 않았다.
#   wfanno.py sync --project P --page <사본페이지>
# 한 줄이면 사본 내용이 정본 문서에 그대로 올라갔다 — 리뷰어는 승인 전에 사본을 정본으로 읽는다.
# "도구 자체 가드"라는 설계 주장과 어긋나고, 유일한 방어가 지시문 텍스트였다.
#
# 가드의 성격이 render 와 다르다는 점이 중요하다:
#   · render 는 **사본 페이지에 그리는 것이 정상**이다(사본 모드의 본체) → 기대와 다를 때만 중단.
#   · sync/extract 가 만드는 것은 **정본 산출물**(PLM 본문 · 로컬 SAE 명세 = 프로젝트 SSOT)이다
#     → 페이지가 정본임을 **증명하지 못하면 그 쓰기만 건너뛴다**(파일 전체를 죽이지 않는다).
# 판정 근거는 wfscan 과 **같은 구현**(role_page_ids + classify_page)이다 — 두 벌로 갈라지면 한쪽만
# 고쳐지는 드리프트가 생긴다. 대장 조회 실패 + 페이지 2개↑ = 거부도 wfscan G4 규약과 같다.

CANON_SKIP_HINT = ("정본 산출물(PLM 본문·로컬 SAE 명세)은 건드리지 않았다."
                   " 사본 내용의 정본 반영은 **승격(promote)** 시점이다.")


def canonical_write_verdict(cfg, project, file_id, page_id, page_name, page_count, expect=None):
    """이 페이지에 **정본 산출물**을 써도 되는가. **I/O는 대장 조회 1회**(penpot 무접촉).

    반환 (verdict, why):
      "ok"    정본이 확실하다 — 그대로 쓴다
      "stop"  `--expect-page-role` 기대와 다르다 — 호출측이 exit 3(아무것도 쓰지 않는다)
      "skip"  사본·보관본이거나 정본임을 증명 못 한다 — **정본 산출물만** 건너뛴다(penpot render는 별개)
    """
    items, err = fetch_page_roles(cfg, project)
    if expect:
        if err:
            return "stop", err
        got = page_role_of(items, page_id)
        if not expect_matches(got, expect):
            return "stop", f"{ROLE_REASON.get(got, got)} (기대={expect} 실제={got} page={page_id})"
    role_sets = wfscan.role_page_ids(items, file_id) if items is not None else None
    kind, why = wfscan.classify_page(page_id, page_name, role_sets)
    if kind != "canonical":
        return "skip", f"이 페이지는 {kind} — {why}"
    if items is None and page_count >= 2:
        # wfscan G4와 같은 규약: 대장을 못 읽었는데 페이지가 여럿이면 어느 것이 정본인지 증명할 수 없다.
        return "skip", f"사본 상태를 확인하지 못했고(={err}) 파일에 페이지가 {page_count}개다 — 정본임을 증명할 수 없다"
    return "ok", why


def cmd_page_role(args):
    """작업용 사본 상태 재확인 — penpot 무접촉·읽기 전용. `--expect` 불일치면 exit 3."""
    cfg, project, _sae = _resolve_ctx(args.project, None)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        sys.exit(3 if args.expect else 0)
    items, err = fetch_page_roles(cfg, project)
    if err:
        print(f"[wfanno] ⛔ 확인 실패 — {err}")
        print(f"[wfanno]    {ROLE_ABORT_HINT}")
        sys.exit(3 if args.expect else 0)
    got = page_role_of(items, args.page)
    if not args.expect:
        print(f"[wfanno] page={args.page} 역할={got} — {ROLE_REASON.get(got, got)}")
        return
    if got == args.expect:
        print(f"[wfanno] ✔ ok — page={args.page} 역할={got}({ROLE_REASON.get(got, got)}). 계속 진행하세요.")
        return
    print(f"[wfanno] ⛔ 중단 — {ROLE_REASON.get(got, got)} (기대={args.expect} 실제={got} page={args.page})")
    print(f"[wfanno]    아무것도 쓰지 마세요. {ROLE_ABORT_HINT}")
    sys.exit(3)


# ================================================================== subcmd: render
def cmd_render(args):
    cfg, project, sae_dir = _resolve_ctx(args.project, args.sae_dir)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        return
    if not cfg["penpot_token"]:
        print("[wfanno] penpot 토큰 없음 — .env PENPOT_ACCESS_TOKEN 필요.")
        return
    base, tok = cfg["penpot_api"], cfg["penpot_token"]
    only = _norm_code(args.code)
    files = _find_files(base, tok, project, args.file)
    if not files:
        return
    tag = "[wfanno render --dry-run]" if args.dry_run else "[wfanno render]"
    total_rendered = 0
    for fid, fname in files:
        try:
            # [원본] 페이지 병합 로더 — 원복 시 아래를 주석 해제하고 _load_pages 블록을 주석 처리.
            # revn, vern, objs, obj_page = _load_file(base, tok, fid)
            # [개선] 페이지 경계 보존 — 한 페이지만 고른다(미지정 + 다중 페이지 = 실행 거부).
            revn, vern, pages = _load_pages(base, tok, fid)
        except Exception as e:
            print(f"[wfanno] ⚠ get-file 실패(스킵) {fname}: {str(e)[:60]}")
            continue
        sel = _page_or_skip(tag, fname, fid, pages, args.page)
        if not sel:
            continue
        page_id, page_name, objs = sel
        allfr = _frames(objs)
        frames = [fr for fr in allfr if fr["code"] and (not only or fr["code"] == only)]
        changes = []
        rendered = []
        for fr in frames:
            spec = load_sae_spec(sae_dir, fr["code"])
            if not spec or not spec.get("elements"):
                continue
            # [원본] 병합 dict 에서 소속 페이지 역산(통제 불가) — 원복 시 주석 해제.
            # page_id = obj_page.get(fr["id"]) or next(iter(obj_page.values()), None)
            # [개선] page_id 는 _select_page 가 고른 **그 페이지** 하나로 고정.
            _texts, stale = _anno_for_frame(objs, fr, allfr)
            for sid in stale:
                # [원본] changes.append({"type": "del-obj", "id": sid, "pageId": obj_page.get(sid, page_id)})
                # [개선] stale 은 이 페이지의 objects 에서만 나왔다 → pageId 도 이 페이지로 확정.
                changes.append({"type": "del-obj", "id": sid, "pageId": page_id})
            # [원본] 루트 프레임만 기준 — 보조 board(<CODE>-A/-Z) 위를 덮었다. 원복 시 아래 주석 해제.
            # ops, _px, _pw, ph = build_anno_panel(page_id, fr["code"], spec["name"], spec.get("note", ""),
            #                                      spec["elements"], fr["x"], fr["y"], fr["w"], fr["h"])
            # [개선] 배치 SSOT(panel_anchor) — wfgen 최초 생성과 **같은 좌표**.
            afx, afy, afw, afh = panel_anchor(fr, allfr)
            ops, _px, _pw, ph = build_anno_panel(page_id, fr["code"], spec["name"], spec.get("note", ""),
                                                 spec["elements"], afx, afy, afw, afh)
            changes.extend(ops)
            rendered.append((fr["code"], len(spec["elements"]), len(stale), int(ph)))
        if not rendered:
            print(f"{tag} {fname}: 렌더 대상 프레임 없음(로컬 명세 매칭 0).")
            continue
        print(f"\n{tag} file='{fname}' ({fid})  revn={revn} vern={vern}  page='{page_name}' ({page_id})")
        for code, nel, ndel, ph in rendered:
            print(f"    ● anno:{code:<8} 요소 {nel:>2} · 기존삭제 {ndel:>2} · 패널높이 {ph}")
        total_rendered += len(rendered)
        if args.dry_run:
            print(f"    (dry-run: del {sum(r[2] for r in rendered)} + add {sum(1 for c in changes if c.get('type')=='add-obj')} = 커밋 안 함)")
            continue
        # 감사 C1 — **쓰기 직전** 사본 역할 재확인(지시문 절차와 같은 판정식). 바뀌었으면 아무것도 쓰지 않는다.
        if getattr(args, "expect_page_role", None):
            verdict, why = recheck_page_role(cfg, project, page_id, args.expect_page_role)
            if verdict != "ok":
                print(f"    ⛔ 중단 — {why}")
                print(f"    아무것도 쓰지 않았습니다(정본 무접촉). {ROLE_ABORT_HINT}")
                sys.exit(3)
            print(f"    ✔ 사본 재확인 ok — page={page_id} 역할={args.expect_page_role}")
        try:
            res = wfgen.penpot_rpc(base, tok, "update-file", {
                "id": fid, "revn": revn, "vern": vern, "sessionId": wfgen._uid(), "changes": changes})
            print(f"    ✔ update-file OK — revn {revn} → {wfgen._pget(res, 'revn', default='?')}")
        except Exception as e:
            print(f"    ✖ update-file 실패(비차단): {str(e)[:200]}")
    print(f"\n{tag} 총 {total_rendered}개 화면 패널 {'검증(dry)' if args.dry_run else '렌더'}. penpot 열기: {base}")


# ================================================================== subcmd: mark (변경 칩)
def cmd_mark(args):
    """변경 칩 부착/제거 — `chg:<CODE>` 그룹 하나를 프레임 위에 얹거나 걷어낸다(멱등·비파괴).

    붙이기: `mark --code WF-XXX --page P --items "12,13"`   걷기: `mark --clear [--code WF-XXX] --page P`
    `--code` 없는 `--clear` 는 그 페이지의 **모든** 칩을 걷는다(승격 뒤 정리 경로).
    """
    cfg, project, _sae = _resolve_ctx(args.project, None)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        return
    if not cfg["penpot_token"]:
        print("[wfanno] penpot 토큰 없음 — .env PENPOT_ACCESS_TOKEN 필요.")
        return
    base, tok = cfg["penpot_api"], cfg["penpot_token"]
    only = _norm_code(args.code)
    if not only and not args.clear:
        print("[wfanno] mark: 붙일 때는 `--code WF-XXX` 가 필요하다(칩은 화면 단위 표시다).")
        print("         페이지의 칩을 전부 걷어내려면: mark --clear --page <페이지>")
        return
    label = (args.label or CHG_LABEL).strip() or CHG_LABEL
    # `--date ""` 는 "날짜 빼라"는 뜻이다(빈 문자열이 falsy 라 or 로 쓰면 오늘로 되살아난다).
    date_s = _dt.date.today().strftime("%m-%d") if args.date is None else args.date.strip()
    files = _find_files(base, tok, project, args.file)
    if not files:
        return
    tag = "[wfanno mark --dry-run]" if args.dry_run else "[wfanno mark]"
    if args.clear:
        tag = tag.replace("mark", "mark --clear")
    total = 0
    for fid, fname in files:
        try:
            revn, vern, pages = _load_pages(base, tok, fid)
        except Exception as e:
            print(f"[wfanno] ⚠ get-file 실패(스킵) {fname}: {str(e)[:60]}")
            continue
        sel = _page_or_skip(tag, fname, fid, pages, args.page)
        if not sel:
            continue
        page_id, page_name, objs = sel
        allfr = _frames(objs)
        frames = [fr for fr in allfr if fr["code"] and (not only or fr["code"] == only)]
        changes, done, skipped = [], [], []
        for fr in frames:
            stale = chg_stale_ids(objs, fr["code"])
            dels = [{"type": "del-obj", "id": sid, "pageId": page_id} for sid in sorted(stale)]
            if args.clear:
                if dels:
                    changes.extend(dels)
                    done.append((fr["code"], "clear", len(dels), 0, ""))
                continue
            items = mark_items(args.items, fr["code"])
            maxpx = min(CHIP_MAXW, max(CHIP_MINW, fr["w"])) - 2 * CHIP_PAD_X
            text_s = chip_text(label, date_s, items, maxpx)
            chip_w = int(min(min(CHIP_MAXW, max(CHIP_MINW, fr["w"])),
                             max(CHIP_MINW, wfgen.text_px(text_s, CHIP_FS) + 2 * CHIP_PAD_X)))
            box, spot, hits = chip_placement(fr, allfr, objs, chip_w, stale)
            if not box:
                # 침범하면 **붙이지 않는다**(관리자 요구 5). 옛 칩도 지우지 않는다 — 지우고 못 붙이면
                # 표시가 통째로 사라져 "바뀐 적 없다"로 읽힌다(가장 나쁜 결과).
                skipped.append((fr["code"], sorted(set(hits))[:3]))
                continue
            changes.extend(dels)
            changes.extend(build_change_chip(page_id, fr["code"], box, text_s))
            done.append((fr["code"], spot, len(dels), chip_w, text_s))
        if not done and not skipped:
            print(f"{tag} {fname}: 대상 프레임 없음"
                  f"{'(칩이 없다)' if args.clear else '(화면코드 규약 프레임 0 또는 --code 불일치)'}.")
            continue
        print(f"\n{tag} file='{fname}' ({fid})  revn={revn} vern={vern}  page='{page_name}' ({page_id})")
        for code, spot, ndel, cw, text_s in done:
            if args.clear:
                print(f"    ● chg:{code:<8} 제거 {ndel}개 객체")
            else:
                print(f"    ● chg:{code:<8} {spot:<6} · 기존삭제 {ndel:>2} · 폭 {cw:>3} · 「{text_s}」")
        for code, hits in skipped:
            print(f"    ⚠ chg:{code:<8} 붙이지 않음 — 위·안쪽 모두 침범: {', '.join(hits) or '?'}")
            print(f"       (이웃을 밀어내지 않는다. 목업 크기를 줄이거나 사람이 배치를 조정한 뒤 다시 실행하라)")
        total += len(done)
        if args.dry_run:
            print(f"    (dry-run: del {sum(1 for c in changes if c.get('type') == 'del-obj')}"
                  f" + add {sum(1 for c in changes if c.get('type') == 'add-obj')} = 커밋 안 함)")
            continue
        if not changes:
            continue
        # render 와 같은 가드 — 쓰기 직전에 사본 역할을 한 번 더 확인한다(감사 C1).
        if getattr(args, "expect_page_role", None):
            verdict, why = recheck_page_role(cfg, project, page_id, args.expect_page_role)
            if verdict != "ok":
                print(f"    ⛔ 중단 — {why}")
                print(f"    아무것도 쓰지 않았습니다(정본 무접촉). {ROLE_ABORT_HINT}")
                sys.exit(3)
            print(f"    ✔ 사본 재확인 ok — page={page_id} 역할={args.expect_page_role}")
        try:
            res = wfgen.penpot_rpc(base, tok, "update-file", {
                "id": fid, "revn": revn, "vern": vern, "sessionId": wfgen._uid(), "changes": changes})
            print(f"    ✔ update-file OK — revn {revn} → {wfgen._pget(res, 'revn', default='?')}")
        except Exception as e:
            print(f"    ✖ update-file 실패(비차단): {str(e)[:200]}")
    verb = "제거" if args.clear else "부착"
    print(f"\n{tag} 총 {total}개 화면 칩 {verb}{'(dry)' if args.dry_run else ''}. penpot 열기: {base}")


# ================================================================== subcmd: extract
def cmd_extract(args):
    cfg, project, sae_dir = _resolve_ctx(args.project, args.sae_dir)
    sae_explicit = bool(args.sae_dir)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        return
    if not cfg["penpot_token"]:
        print("[wfanno] penpot 토큰 없음 — .env PENPOT_ACCESS_TOKEN 필요.")
        return
    base, tok = cfg["penpot_api"], cfg["penpot_token"]
    _sae_dir_write(sae_dir)
    only = _norm_code(args.code)
    files = _find_files(base, tok, project, args.file)
    if not files:
        return
    tag = "[wfanno extract --dry-run]" if args.dry_run else "[wfanno extract]"
    wrote, plm = [], []
    for fid, fname in files:
        try:
            # [원본] revn, vern, objs, obj_page = _load_file(base, tok, fid)   # 읽기 전용(페이지 병합)
            # [개선] penpot 은 읽기전용이지만 **명세/PLM 본문을 덮어쓴다** → 어느 페이지에서 뽑았는지가 곧 정본.
            revn, vern, pages = _load_pages(base, tok, fid)   # 읽기 전용
        except Exception as e:
            print(f"[wfanno] ⚠ get-file 실패(스킵) {fname}: {str(e)[:60]}")
            continue
        sel = _page_or_skip(tag, fname, fid, pages, args.page)
        if not sel:
            continue
        page_id, page_name, objs = sel
        # 감사 W10 — extract 는 **로컬 SAE 명세(SSOT)와 PLM 정본 본문을 덮어쓴다**. 어느 페이지에서
        # 뽑았는지가 곧 정본이 되므로, 정본임을 증명하지 못하면 그 두 쓰기를 건너뛴다.
        verdict, why = canonical_write_verdict(
            cfg, project, fid, page_id, page_name, len(pages), getattr(args, "expect_page_role", None))
        if verdict == "stop":
            print(f"    ⛔ 중단 — {why}")
            print(f"    아무것도 쓰지 않았습니다(정본 무접촉). {ROLE_ABORT_HINT}")
            sys.exit(3)
        canon_ok = verdict == "ok"
        # `--sae-dir`를 **명시**했으면 그건 호출측이 고른 자리다(사본 모드의 스테이징 · 감사 W11).
        # 정본 디렉터리로 흐르는 것만 막는다.
        spec_ok = canon_ok or sae_explicit
        if not canon_ok:
            print(f"\n{tag} ⚠ {fname}[{page_name}]: {why}")
            print(f"    → PLM 본문 push 생략" + ("" if spec_ok else " · 로컬 SAE 명세 쓰기 생략") + f". {CANON_SKIP_HINT}")
            if not sae_explicit:
                print(f"    사본에서 명세를 뽑으려면 `--sae-dir <스테이징 경로>`로 정본 밖에 쓰세요.")
        allfr = _frames(objs)
        frames = [fr for fr in allfr if fr["code"] and (not only or fr["code"] == only)]
        for fr in frames:
            anno_texts, _stale = _anno_for_frame(objs, fr, allfr)
            note, els = extract_elements(anno_texts)
            if not els:
                continue
            name = fr["name"].split(None, 1)[1] if len(fr["name"].split(None, 1)) > 1 else fr["name"]
            base_art = None
            path = os.path.join(sae_dir, f"WF-{fr['code']}.json") if sae_dir else None
            if path and os.path.isfile(path):
                try:
                    base_art = json.load(open(path, encoding="utf-8"))
                except Exception:
                    base_art = None
            route = (base_art or {}).get("route", "/")
            covers = ((base_art or {}).get("relations") or {}).get("covers") or []
            art = serialize_sae_artifact(fr["code"], name, route, note, covers, els, base=base_art)
            if not args.dry_run and path and spec_ok:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(art, f, ensure_ascii=False, indent=1)
            wrote.append((fr["code"], len(els), bool(note), path if spec_ok else "(생략 — 사본)"))
            # PLM 본문(선택) — spec dict 형태로 build_doc
            if not args.no_plm and canon_ok:
                spec = {"name": name, "route": route, "note": note, "covers": covers, "elements": els}
                loc = f"penpot:{fid}:{fr['id']}"
                st = _plm_push_doc(cfg, project, fr["code"], fr["name"], loc, spec, args.dry_run, force=args.force)
                plm.append((fr["code"], st))
        # 읽기전용 증명: revn 재조회
        try:
            # [원본] revn2, _v, _o, _p = _load_file(base, tok, fid)
            revn2, _v, _pgs = _load_pages(base, tok, fid)
            print(f"{tag} file='{fname}' page='{page_name}' revn {revn}→{revn2} "
                  f"{'(불변 ✔ 읽기전용)' if revn == revn2 else '(⚠ 변경됨!)'}")
        except Exception:
            pass
    if wrote:
        print(f"\n{tag} 명세 {'작성예정' if args.dry_run else '작성'}:")
        for code, nel, hasnote, path in wrote:
            print(f"    → WF-{code:<8} 요소 {nel:>2}{'  +note' if hasnote else ''}   {path or ''}")
    if plm:
        print(f"\n{tag} PLM 본문:")
        for code, st in plm:
            print(f"    ↑ WF-{code:<8} {st}")
    if not wrote:
        print(f"{tag} 추출된 anno-* 요소 없음(패널 미존재).")


# ================================================================== subcmd: sync
def cmd_sync(args):
    cfg, project, sae_dir = _resolve_ctx(args.project, args.sae_dir)
    sae_explicit = bool(args.sae_dir)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        return
    if not cfg["penpot_token"]:
        print("[wfanno] penpot 토큰 없음 — .env PENPOT_ACCESS_TOKEN 필요.")
        return
    base, tok = cfg["penpot_api"], cfg["penpot_token"]
    _sae_dir_write(sae_dir)
    files = _find_files(base, tok, project, args.file)
    if not files:
        return
    tag = "[wfanno sync --dry-run]" if args.dry_run else "[wfanno sync]"
    print(f"{tag} project={project} · 파일 {len(files)}개 · render={'off' if args.no_render else 'on'} · plm={'off' if args.no_plm else 'on'}"
          + (f" · page={args.page}" if args.page else ""))
    for fid, fname in files:
        try:
            # [원본] revn, vern, objs, obj_page = _load_file(base, tok, fid)
            # [개선] 페이지 경계 보존(미지정 + 다중 페이지 = 실행 거부).
            revn, vern, pages = _load_pages(base, tok, fid)
        except Exception as e:
            print(f"[wfanno] ⚠ get-file 실패(스킵) {fname}: {str(e)[:60]}")
            continue
        sel = _page_or_skip(tag, fname, fid, pages, args.page)
        if not sel:
            continue
        page_id, page_name, objs = sel
        # 감사 W10 — sync 는 penpot 렌더(사본에서도 정상)와 **정본 산출물 쓰기**(PLM 본문·SAE 명세)를
        # 한 명령에 섞는다. 렌더는 그대로 두고 **정본 쓰기만** 페이지 역할로 가른다.
        verdict, why = canonical_write_verdict(
            cfg, project, fid, page_id, page_name, len(pages), getattr(args, "expect_page_role", None))
        if verdict == "stop":
            print(f"    ⛔ 중단 — {why}")
            print(f"    아무것도 쓰지 않았습니다(정본 무접촉). {ROLE_ABORT_HINT}")
            sys.exit(3)
        canon_ok = verdict == "ok"
        spec_ok = canon_ok or sae_explicit
        if not canon_ok:
            print(f"  ⚠ {fname}[{page_name}]: {why}")
            print(f"    → PLM 본문 push 생략" + ("" if spec_ok else " · 로컬 SAE 명세 쓰기 생략")
                  + f" (penpot 렌더는 그대로). {CANON_SKIP_HINT}")
        allfr = _frames(objs)
        frames = [fr for fr in allfr if fr["code"]]
        changes = []
        report = []
        for fr in frames:
            had_spec = load_sae_spec(sae_dir, fr["code"])
            has_els = bool(had_spec and had_spec.get("elements"))
            # [원본] page_id = obj_page.get(fr["id"]) or next(iter(obj_page.values()), None)
            # [개선] page_id = _select_page 결과 고정(위).
            if has_els:
                # 로컬 명세 존재 → penpot 패널 render(멱등) + PLM 본문
                mode = "render"
                if not args.no_render:
                    _texts, stale = _anno_for_frame(objs, fr, allfr)
                    for sid in stale:
                        # [원본] changes.append({"type": "del-obj", "id": sid, "pageId": obj_page.get(sid, page_id)})
                        changes.append({"type": "del-obj", "id": sid, "pageId": page_id})
                    # [원본] 루트 프레임만 기준 — 보조 board 를 덮었다. 원복 시 아래 주석 해제.
                    # ops, _px, _pw, _ph = build_anno_panel(..., fr["x"], fr["y"], fr["w"], fr["h"])
                    # [개선] 배치 SSOT(panel_anchor) — render/sync/wfgen 3경로 좌표 일치.
                    afx, afy, afw, afh = panel_anchor(fr, allfr)
                    ops, _px, _pw, _ph = build_anno_panel(page_id, fr["code"], had_spec["name"],
                                                          had_spec.get("note", ""), had_spec["elements"],
                                                          afx, afy, afw, afh)
                    changes.extend(ops)
                if not args.no_plm and canon_ok:
                    loc = f"penpot:{fid}:{fr['id']}"
                    _plm_push_doc(cfg, project, fr["code"], fr["name"], loc, had_spec, args.dry_run, force=args.force)
                elif not args.no_plm:
                    mode = "render(정본 push 생략 — 사본)"
            else:
                # 로컬 명세 없음 → penpot 읽기만(extract) — **절대 render 안 함**(읽기전용 원천 보호)
                mode = "extract(읽기전용)"
                anno_texts, _stale = _anno_for_frame(objs, fr, allfr)
                note, els = extract_elements(anno_texts)
                if els:
                    name = fr["name"].split(None, 1)[1] if len(fr["name"].split(None, 1)) > 1 else fr["name"]
                    art = serialize_sae_artifact(fr["code"], name, "/", note, [], els)
                    path = os.path.join(sae_dir, f"WF-{fr['code']}.json") if sae_dir else None
                    if not args.dry_run and path and spec_ok:
                        with open(path, "w", encoding="utf-8") as f:
                            json.dump(art, f, ensure_ascii=False, indent=1)
                    if not spec_ok:
                        mode = "extract(명세 쓰기 생략 — 사본)"
                    if not args.no_plm and canon_ok:
                        spec = {"name": name, "route": "/", "note": note, "covers": [], "elements": els}
                        loc = f"penpot:{fid}:{fr['id']}"
                        # 감사 H-6 — `sync --force`가 이 경로(로컬 명세 없음 → extract)에만 전달되지 않아
                        # 같은 명령의 두 갈래가 서로 다른 계약을 따랐다(render 갈래만 덮어쓰기). `--force`의
                        # 뜻은 "PLM 본문이 이미 리치여도 덮어쓴다" 하나뿐이므로 갈래에 따라 달라지면 안 된다.
                        # [원본] --force 미전달 — 이 경로는 항상 비파괴였다. 원복 시 아래를 주석 해제.
                        # _plm_push_doc(cfg, project, fr["code"], fr["name"], loc, spec, args.dry_run)
                        # [개선] render 갈래(위)·extract 서브커맨드와 동일하게 --force 전달.
                        _plm_push_doc(cfg, project, fr["code"], fr["name"], loc, spec, args.dry_run,
                                      force=args.force)
                else:
                    mode = "skip(명세·패널 없음)"
            report.append((fr["code"], mode))
        # penpot 커밋(있을 때만)
        if changes and not args.dry_run and not args.no_render:
            try:
                res = wfgen.penpot_rpc(base, tok, "update-file", {
                    "id": fid, "revn": revn, "vern": vern, "sessionId": wfgen._uid(), "changes": changes})
                print(f"  ✔ {fname}[{page_name}]: update-file revn {revn}→{wfgen._pget(res, 'revn', default='?')} ({sum(1 for c in changes if c.get('type')=='add-obj')} add)")
            except Exception as e:
                print(f"  ✖ {fname}: update-file 실패(비차단): {str(e)[:150]}")
        for code, mode in report:
            print(f"    {code:<8} {mode}")


# ================================================================== subcmd: stage-apply (감사 W11)
#
# 왜 있나: 사본 모드 지시문이 `.ouroboros/docs/wireframes/WF-<CODE>.json`(프로젝트가 선언한 SSOT)을
# 직접 고치고 **커밋까지** 시켰다. 그러면 "정본 반영은 승격 시점"이라는 불변식이 승격 없이 깨진다 —
# 이후 누가 정본 페이지에 `wfscan`을 돌리면 그 명세로 정본 PLM 본문이 보강되고, 사본을 버려 파일이
# 단일 페이지로 돌아가면 다음 `render`가 그 명세를 정본 penpot 페이지에 그대로 그린다.
#
# → 사본 작업은 **스테이징 디렉터리**에만 쓴다(`--sae-dir`). 그 스테이징을 정본으로 옮기는 유일한
#   경로가 이 명령이고, **그 사본이 실제로 승격됐을 때만** 동작한다(page_role_of == "promoted").
#   즉 "승격 시 반영"이 사람의 기억이 아니라 도구의 판정으로 강제된다.

def stage_dir_for(sae_dir, page):
    """사본 페이지별 스테이징 경로 — 정본 디렉터리 **안의 점 디렉터리**(같은 저장소·같은 리뷰 흐름).
    `_`/`.` 시작 경로는 plm-sync 훅 동기 대상이 아니라 편집이 PLM으로 새지 않는다."""
    if not sae_dir or not page:
        return None
    return os.path.join(sae_dir, ".working", str(page))


def cmd_stage_apply(args):
    cfg, project, sae_dir = _resolve_ctx(args.project, args.sae_dir)
    if not project:
        print("[wfanno] PLM 프로젝트 미바인딩 — --project 또는 /plm-hub:link 후 재시도.")
        return
    stage = args.stage_dir or stage_dir_for(sae_dir, args.page)
    tag = "[wfanno stage-apply --dry-run]" if args.dry_run else "[wfanno stage-apply]"
    if not stage or not os.path.isdir(stage):
        print(f"{tag} 스테이징 없음: {stage or '(경로 미상)'} — 옮길 명세가 없다.")
        return
    items, err = fetch_page_roles(cfg, project)
    got = "unknown" if err else page_role_of(items, args.page)
    if got != "promoted" and not args.force:
        why = err or ROLE_REASON.get(got, got)
        print(f"{tag} ⛔ 중단 — 이 사본은 아직 정본이 아니다({got}: {why}).")
        print(f"    정본 반영은 **승격(promote) 이후**다. 대시보드에서 [정본으로 올리기] 뒤 다시 실행하라.")
        print(f"    (검증을 건너뛰려면 --force — 정본 명세를 검토 없이 덮어쓴다)")
        sys.exit(3)
    names = sorted(f for f in os.listdir(stage) if re.match(r"^WF-[A-Z0-9]{2,8}\.json$", f))
    if not names:
        print(f"{tag} 스테이징에 명세 파일이 없다: {stage}")
        return
    _sae_dir_write(sae_dir)
    for nm in names:
        src, dst = os.path.join(stage, nm), os.path.join(sae_dir, nm)
        if args.dry_run:
            print(f"    → {nm}   {'덮어씀' if os.path.isfile(dst) else '신규'}  (dry-run)")
            continue
        try:
            with open(src, encoding="utf-8") as f:
                data = f.read()
            with open(dst, "w", encoding="utf-8") as f:
                f.write(data)
            print(f"    ✔ {nm} → {dst}")
        except Exception as e:
            print(f"    ✖ {nm} 실패(비차단): {str(e)[:120]}")
    # 감사 X4(R3 높음) — `--page` 없는 `sync`는 **항상 실행 거부**된다. 승격은 옛 정본을
    # `보관 · <이름> (MM-DD)`로 rename해 파일에 남기고(`close`도 penpot 페이지를 지우지 않는다)
    # → 그 파일은 **영구히 2페이지 이상**이고, `_select_page`는 `--page` 없이 다중 페이지를 거부한다.
    # 승격은 페이지 uuid를 바꾸지 않으므로(이름·순서만 교체) **새 정본 page uuid = 이 사본 page uuid**다.
    print(f"\n{tag} {len(names)}건 반영. 이제 아래로 PLM 정본 본문을 맞추면 된다"
          f" (승격된 사본 페이지가 곧 새 정본이라 `--page`는 같은 uuid다):")
    print(f"    python3 wfanno.py sync --project {project} --page {args.page}")
    # 변경 칩 정리 — 승격되면 그 페이지가 **정본**이다. "✱ 반영됨" 칩이 정본에 남아 있으면 다음 리뷰어가
    # 무엇이 새로 바뀐 것인지 오해한다(칩은 "이번 사본에서 바뀐 것"이라는 뜻이다).
    # 지우는 것은 penpot 쓰기라 stage-apply(penpot 무접촉 · 읽기+파일복사)에 섞지 않고 **명령을 안내**한다.
    print(f"    python3 wfanno.py mark --clear --project {project} --page {args.page}"
          f"    # 변경 칩 걷어내기(정본이 된 뒤에는 표시가 혼란만 준다)")


# ================================================================== main
def main():
    ap = argparse.ArgumentParser(prog="wfanno", add_help=True)
    sub = ap.add_subparsers(dest="cmd")
    for nm in ("render", "extract", "sync"):
        p = sub.add_parser(nm)
        p.add_argument("project", nargs="?", default=None)
        p.add_argument("--project", dest="project_opt", default=None)
        p.add_argument("--code", default=None)
        p.add_argument("--all", action="store_true")
        p.add_argument("--file", default=None)
        # 페이지 스코핑(필수 안전장치) — 페이지 id 또는 페이지 이름. 미지정 시 페이지가 1개면 그것,
        # 2개 이상이면 **실행 거부**(어느 페이지를 그리고 지울지 추측하지 않는다 — QA A5).
        p.add_argument("--page", default=None)
        p.add_argument("--sae-dir", dest="sae_dir", default=None)
        p.add_argument("--dry-run", action="store_true")
        p.add_argument("--no-plm", action="store_true")
        p.add_argument("--force", action="store_true")
        # 감사 C1·W10 — 쓰기 **직전** 페이지 역할 재확인. 기대와 다르면 아무것도 쓰지 않고 exit 3.
        #   render : 사본 모드가 `working`을 박아 보낸다(그사이 승격이면 정본을 덮지 않는다).
        #   sync/extract : 정본 산출물(PLM 본문·SAE 명세)을 쓰므로 `canonical`을 박아 보낸다.
        # 미지정이어도 sync/extract 는 `canonical_write_verdict`가 정본 여부를 스스로 확인하고,
        # 증명하지 못하면 **정본 쓰기만** 건너뛴다(도구 자체 가드 — 지시문 텍스트에 의존하지 않는다).
        p.add_argument("--expect-page-role", dest="expect_page_role", default=None,
                       choices=["working", "canonical"])
        if nm == "sync":
            p.add_argument("--no-render", action="store_true")
    # 변경 칩(`chg:<CODE>`) — 바뀐 프레임을 눈으로 알아보게 한다. 붙이기/걷기 한 명령.
    mk = sub.add_parser("mark")
    mk.add_argument("project", nargs="?", default=None)
    mk.add_argument("--project", dest="project_opt", default=None)
    mk.add_argument("--code", default=None)
    mk.add_argument("--file", default=None)
    mk.add_argument("--page", default=None)
    mk.add_argument("--items", default=None, help="바뀐 요소 코드(쉼표/공백 구분 · '12,13' 처럼 번호만도 가능)")
    mk.add_argument("--label", default=None, help=f"칩 문구(기본 '{CHG_LABEL}')")
    mk.add_argument("--date", default=None, help="칩 날짜(기본 오늘 MM-DD · 빈 문자열이면 생략)")
    mk.add_argument("--clear", action="store_true", help="칩 제거(--code 생략 시 그 페이지 전량)")
    mk.add_argument("--dry-run", action="store_true")
    mk.add_argument("--expect-page-role", dest="expect_page_role", default=None,
                    choices=["working", "canonical"])
    # 사본 상태 재확인 전용(읽기 전용 · penpot 무접촉) — 세션이 쓰기 전에 1회 호출한다.
    pr = sub.add_parser("page-role")
    pr.add_argument("project", nargs="?", default=None)
    pr.add_argument("--project", dest="project_opt", default=None)
    pr.add_argument("--page", required=True)
    pr.add_argument("--expect", default=None, choices=["working"])
    # 감사 W11 — 사본 작업의 스테이징 명세를 **승격된 뒤** 정본 자리로 옮긴다.
    sa = sub.add_parser("stage-apply")
    sa.add_argument("project", nargs="?", default=None)
    sa.add_argument("--project", dest="project_opt", default=None)
    sa.add_argument("--page", required=True)
    sa.add_argument("--stage-dir", dest="stage_dir", default=None)
    sa.add_argument("--sae-dir", dest="sae_dir", default=None)
    sa.add_argument("--dry-run", action="store_true")
    sa.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if not args.cmd:
        ap.print_help()
        return
    # positional 또는 --project 둘 다 허용
    args.project = args.project or args.project_opt
    if not hasattr(args, "no_render"):
        args.no_render = False
    {"render": cmd_render, "extract": cmd_extract, "sync": cmd_sync, "mark": cmd_mark,
     "page-role": cmd_page_role, "stage-apply": cmd_stage_apply}[args.cmd](args)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[wfanno] 예외(비차단): {str(e)[:200]}")
