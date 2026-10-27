// 와이어프레임 피드백 지시문 조립 단위 테스트 (P0-5 · plm-channel 0.1.26).
//   실행: node --test plugin/plm-channel/tests/
//
// 라이브 세션·PLM 서버를 전혀 호출하지 않는다 — **지시문 문자열만** 검증한다.
// 고정하는 계약 3가지(0.1.26 — 사본 **강제**):
//   ① 사본 있음  → penpot 명령 전부 `--page <사본>` · `wfanno.py sync`(PLM 정본 push) **부재** · 정본 미반영 고지.
//   ② 사본 없음  → **보류**. 실행 가능한 쓰기 명령 0개 + "사본이 없어 진행하지 않았습니다" 회신.
//                  (정본 직접 작업 분기는 제거됐다 — 0.1.25까지의 원문은 주석으로만 남는다.)
//   ③ 판정 불가  → ②와 같은 보류(사유 문장만 다름) — 정본 폴백 금지.
//   ④ 사본 있음  → **목업 도형도 실제로 고친다**(0.1.35 · ③-c 제자리 교체 · 새 파일 생성은 여전히 금지).
//                  낡은 금지 문장 부재 · 한 커밋(del+add) · board id 재사용 · 겹침 사전 검사 ·
//                  ③-c → ④ 순서 · 회신의 `목업변경:` 줄까지 문자열로 고정한다.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildWfFeedbackInstruction,
  filesFromFeedbackItems,
  NO_COPY_REPLY,
  normalizeOpenPage,
  notPromotedNotice,
  openPageLine,
  openPageReplyLine,
  pagesFromFeedbackItems,
  pagesFromOpenPage,
  pickWorkingCopy,
  recheckAbortReply,
  recheckCommand,
  recheckVerdict,
  stageDir,
} from "../relay/wf-feedback.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RELAY = path.join(HERE, "..", "relay", "plm-channel.mjs");
const WF = path.join(HERE, "..", "relay", "wf-feedback.mjs");

const PAGE = "pg-copy-001";
const FILE = "file-aaa";
const CTX = {
  project: "P1",
  workId: "wf-P1-alice-1",
  team: "T9",
  userText: "정렬 좀 고쳐줘",
  attachBlock: "\n[첨부 파일 1건]\n  - a.png\n",
  fbWarn: "",
  fbLines: '1) c1 · WF-LIST "목록" · #2 · bob · PLM · 미해결\n   본문: 정렬 이상',
  fbCount: 2,
  fbRefs: ["c1", "c2"],
};
/** 실제로 실행되는 스크립트 호출만 잡는 패턴(금지 목록에 이름만 언급된 것과 구분). */
const RUNNABLE = /python3 plugin\/plm-hub\/scripts\//;

// ── 파일 힌트 추출 ────────────────────────────────────────────────────────
test("filesFromFeedbackItems — loc(penpot:file:frame)과 unmapped penpot_url 양쪽에서 file uuid를 뽑는다", () => {
  const items = [
    { loc: "penpot:file-aaa:frame-1" },
    { loc: "penpot:file-aaa:frame-2" }, // 중복 제거
    { loc: null, penpot_url: "https://wf.example/#/workspace/proj-1/file-bbb" },
    { loc: null, penpot_url: null }, // 정보 없음 → 무시
  ];
  assert.deepEqual(filesFromFeedbackItems(items), ["file-aaa", "file-bbb"]);
  assert.deepEqual(filesFromFeedbackItems([]), []);
  assert.deepEqual(filesFromFeedbackItems(undefined), []);
});

// ── 사본 판정 ─────────────────────────────────────────────────────────────
test("pickWorkingCopy — 사본 없음(정본만)은 none", () => {
  assert.deepEqual(pickWorkingCopy([], [FILE]), { state: "none" });
  // archived(보관본)는 사본이 아니다 — 정본은 행 자체가 없다.
  assert.deepEqual(
    pickWorkingCopy([{ role: "archived", page_id: "pg-old", penpot_file_id: FILE }], [FILE]),
    { state: "none" },
  );
  // 다른 파일의 사본은 이 작업과 무관 → 기존 동작 유지.
  assert.deepEqual(
    pickWorkingCopy([{ role: "working", page_id: PAGE, penpot_file_id: "file-zzz" }], [FILE]),
    { state: "none" },
  );
});

test("pickWorkingCopy — 이 파일의 working 행 1개면 copy(page·file·라벨·복제수)", () => {
  const got = pickWorkingCopy(
    [
      { role: "archived", page_id: "pg-old", penpot_file_id: FILE },
      { role: "working", page_id: PAGE, penpot_file_id: FILE, label: "작업본", cloned_threads: 3 },
    ],
    [FILE],
  );
  assert.deepEqual(got, { state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 3 });
});

test("pickWorkingCopy — 사본이 2개 이상이고 **페이지 힌트가 없으면** unknown(추측 금지 · 안전 실패)", () => {
  const got = pickWorkingCopy(
    [
      { role: "working", page_id: "pg-1", penpot_file_id: FILE },
      { role: "working", page_id: "pg-2", penpot_file_id: FILE },
    ],
    [FILE],
  );
  assert.equal(got.state, "unknown");
  assert.match(got.reason, /2개/);
});

// ── 감사 C6: 한 파일에 사본 2개 = **정상 상태**(DB는 원본당 1개만 강제)인데 전면 정지였다 ──────
test("pagesFromFeedbackItems — 항목의 penpot_page만 모은다(없는 payload는 빈 배열)", () => {
  assert.deepEqual(
    pagesFromFeedbackItems([{ penpot_page: "pg-1" }, { penpot_page: "pg-1" }, { penpot_page: "pg-2" }, { penpot_page: null }]),
    ["pg-1", "pg-2"],
  );
  assert.deepEqual(pagesFromFeedbackItems([{ loc: "penpot:f:fr" }]), []); // 구 대시보드 payload
  assert.deepEqual(pagesFromFeedbackItems(undefined), []);
});

test("pickWorkingCopy — 사본이 2개여도 **대상 페이지**로 좁히면 그 사본으로 진행한다(C6)", () => {
  const rows = [
    { role: "working", page_id: "pg-copy-A", src_page_id: "pg-A", penpot_file_id: FILE, label: "A 작업본" },
    { role: "working", page_id: "pg-copy-B", src_page_id: "pg-B", penpot_file_id: FILE, label: "B 작업본" },
  ];
  // 원본 페이지를 가리키는 댓글(아직 사본으로 안 옮겨진 것) → src_page_id로 걸린다.
  assert.deepEqual(pickWorkingCopy(rows, [FILE], ["pg-B"]), {
    state: "copy", page: "pg-copy-B", file: FILE, label: "B 작업본", clonedThreads: 0,
  });
  // 사본 페이지를 직접 가리키는 댓글(복제본) → page_id로 걸린다.
  assert.equal(pickWorkingCopy(rows, [FILE], ["pg-copy-A"]).page, "pg-copy-A");
});

test("pickWorkingCopy — 좁혀도 하나로 안 정해지면 여전히 unknown(안전 실패는 유지)", () => {
  const rows = [
    { role: "working", page_id: "pg-copy-A", src_page_id: "pg-A", penpot_file_id: FILE },
    { role: "working", page_id: "pg-copy-B", src_page_id: "pg-B", penpot_file_id: FILE },
  ];
  // 두 사본 모두에 걸리는 힌트(여러 화면의 댓글을 섞어 담은 경우) → 판정 불가.
  assert.equal(pickWorkingCopy(rows, [FILE], ["pg-A", "pg-B"]).state, "unknown");
  // 어느 쪽과도 무관한 페이지 → 판정 불가(엉뚱한 사본을 집지 않는다).
  const none = pickWorkingCopy(rows, [FILE], ["pg-Z"]);
  assert.equal(none.state, "unknown");
  assert.match(none.reason, /좁혀도 0개/);
});

test("pickWorkingCopy — 힌트가 없으면(전부 화면 밖 댓글) 프로젝트 전체 working 행을 본다", () => {
  const rows = [{ role: "working", page_id: PAGE, penpot_file_id: FILE }];
  assert.equal(pickWorkingCopy(rows, []).state, "copy");
  assert.equal(pickWorkingCopy(rows, undefined).state, "copy");
});

// ── 감사 Y5(R4): 반쪽 복제 사본은 승격이 **영구 거절**이라, 거기에 일을 주면 작업이 확정 폐기된다 ──
test("[Y5] pickWorkingCopy — cleanup_note가 있는 사본에는 작업을 주지 않는다(보류 + 처방)", () => {
  const got = pickWorkingCopy(
    [{ role: "working", page_id: PAGE, penpot_file_id: FILE, cleanup_note: "페이지 정리 실패(잔재 페이지 pg-x)" }],
    [FILE],
  );
  assert.equal(got.state, "unknown", "none(사본 없음)이 아니라 보류여야 한다 — 사람이 치워야 진행된다");
  assert.match(got.reason, /사본 버리기/);
  assert.match(got.reason, /페이지 정리 실패/, "서버가 남긴 사유를 그대로 전달한다");
});

test("[Y5] pickWorkingCopy — 정상 사본이 함께 있으면 그 사본으로 진행한다(반쪽만 제외)", () => {
  const rows = [
    { role: "working", page_id: "pg-broken", src_page_id: "pg-A", penpot_file_id: FILE, cleanup_note: "잔재" },
    { role: "working", page_id: "pg-ok", src_page_id: "pg-B", penpot_file_id: FILE, label: "B 작업본" },
  ];
  // 반쪽이 후보에서 빠지므로 **페이지 힌트 없이도** 하나로 정해진다(예전엔 2개라 unknown이었다).
  assert.equal(pickWorkingCopy(rows, [FILE]).page, "pg-ok");
  assert.equal(pickWorkingCopy(rows, [FILE], ["pg-B"]).page, "pg-ok");
});

test("[Y5] pickWorkingCopy — cleanup_note가 빈 문자열·공백이면 정상 사본이다(과잉 차단 금지)", () => {
  assert.equal(pickWorkingCopy([{ role: "working", page_id: PAGE, penpot_file_id: FILE, cleanup_note: "" }], [FILE]).state, "copy");
  assert.equal(pickWorkingCopy([{ role: "working", page_id: PAGE, penpot_file_id: FILE, cleanup_note: "  " }], [FILE]).state, "copy");
  assert.equal(pickWorkingCopy([{ role: "working", page_id: PAGE, penpot_file_id: FILE, cleanup_note: null }], [FILE]).state, "copy");
});

test("[Y5] pickWorkingCopy — 다른 파일의 반쪽 사본은 이 작업을 막지 않는다(파일 스코프 유지)", () => {
  const rows = [{ role: "working", page_id: "pg-x", penpot_file_id: "file-zzz", cleanup_note: "잔재" }];
  assert.deepEqual(pickWorkingCopy(rows, [FILE]), { state: "none" });
});

// ── ① 사본 있음 ───────────────────────────────────────────────────────────
test("지시문(사본 있음) — 모든 penpot 명령에 --page 사본이 붙고 PLM push는 사라진다", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 3 },
  });

  // 실행 가능한 스크립트 호출은 전부 --page 사본 페이지를 달고 있어야 한다.
  const cmds = s.split("\n").filter((l) => RUNNABLE.test(l));
  assert.ok(cmds.length >= 3, `사본 모드 실행 명령이 너무 적다: ${cmds.length}`);
  for (const c of cmds) {
    assert.match(c, new RegExp(`--page ${PAGE}(\\s|$)`), `--page 누락: ${c}`);
    assert.match(c, /wfanno\.py/, `wfanno 외 스크립트 실행 지시: ${c}`);
  }

  // ★ PLM 정본 본문 push는 **세션의 실행 지시에서** 제거된다(이름은 "실행 금지" 문장과
  //   ⑤의 **관리자 승격 후 절차**에만 남는다 — 감사 X4로 그 절차에 sync가 복원됐다).
  const adminCmds = cmds.filter((c) => /(stage-apply|\bsync\b)/.test(c));
  assert.deepEqual(
    cmds.filter((c) => /\bsync\b/.test(c) && !/--page /.test(c)),
    [],
    "감사 X4 — 처방된 sync에 --page가 없으면 항상 실행 거부된다",
  );
  assert.equal(adminCmds.length, 2, "⑤ 관리자 절차 = stage-apply + sync 두 줄이어야 한다");
  assert.match(s, /stage-apply는 승격된 뒤에만 동작합니다/, "관리자 절차 설명이 없다");
  assert.ok(!/--force/.test(s), "사본 모드에 --force(정본 덮어쓰기)가 남아 있다");
  assert.match(s, /`wfanno\.py sync`는 PLM \*\*정본\*\* 본문을 밉니다/, "sync 금지 사유 설명이 없다");
  assert.match(s, /승격/, "승격 시점에 반영된다는 안내가 없다");

  // ① 명세 확보는 읽기 전용 extract + --no-plm(정본 문서 무접촉).
  const extract = cmds.find((c) => c.includes("extract"));
  assert.ok(extract, "명세 확보용 extract 명령이 없다");
  assert.match(extract, /--no-plm/);

  // 세션 회신에 '사본에서 작업 · 정본 미반영'이 드러나야 한다(message + report 양쪽).
  assert.ok(s.includes(notPromotedNotice(PAGE)), "정본 미반영 고지 문구가 없다");
  assert.match(s, /작업용 사본\(working copy\)이 있습니다/);
  assert.match(s, /result의 \*\*<요약> 첫 줄\*\*에도/, "report result에 고지를 넣으라는 지시가 없다");

  // **새 파일** 생성 금지(핀 분리)와 정산 형식은 유지된다 — 0.1.35에서 금지 대상이
  // "목업을 고치는 것" → "penpot 파일·화면을 새로 만드는 것"으로 좁혀졌다(아래 전용 테스트).
  assert.match(s, /penpot 파일·화면을 새로 만들지 마세요/);
  assert.match(s, /반영: c1234, c1250/);
});

// ── 감사 W11: 사본 작업이 **로컬 SAE 정본 명세**를 고치고 커밋하면 안 된다 ──────────────
//
// 결함: 사본 모드 지시문이 `.ouroboros/docs/wireframes/WF-<CODE>.json`(SSOT)을 직접 고치고 커밋까지
// 시켰다. 그러면 "정본 반영은 승격 시점"이라는 불변식이 승격 없이 깨진다 —
//   ① 이후 정본 페이지에 wfscan 을 돌리면 그 명세로 정본 PLM 본문이 보강되고
//   ② 사본을 버려 단일 페이지가 되면 다음 render 가 그 명세를 정본 penpot 페이지에 그린다.
test("지시문(사본 있음) — SAE 명세는 스테이징에만 쓰고 정본 명세는 편집·커밋하지 않는다(감사 W11)", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 3 },
  });
  const SD = stageDir(PAGE);
  assert.equal(SD, `.ouroboros/docs/wireframes/.working/${PAGE}`, "스테이징 경로 규약이 바뀌었다(wfanno와 맞물림)");

  // 명세를 읽고 쓰는 실행 명령은 **전부** 스테이징을 가리켜야 한다.
  const specCmds = s.split("\n").filter((l) => RUNNABLE.test(l) && /(render|extract)/.test(l));
  assert.ok(specCmds.length >= 2, `명세를 다루는 명령이 너무 적다: ${specCmds.length}`);
  for (const c of specCmds) assert.match(c, new RegExp(`--sae-dir ${SD.replace(/\./g, "\\.")}(\\s|$)`), `--sae-dir 누락: ${c}`);

  // 정본 명세를 고치지 말라는 지시가 **명시적으로** 있어야 한다(암묵 규칙은 지켜지지 않는다).
  assert.match(s, /정본 명세.*수정도 커밋도 하지 않습니다/s, "정본 명세 편집 금지 지시가 없다");
  assert.match(s, /스테이징.*만\*\* 커밋/s, "커밋 대상이 스테이징으로 좁혀지지 않았다");
  assert.ok(!/반영을 마친 뒤 반드시 \*\*커밋\*\*하세요/.test(s), "예전의 무제한 커밋 지시가 남아 있다");

  // 정본으로 넘기는 경로는 **승격 이후의 stage-apply** 하나뿐이라고 안내한다.
  assert.match(s, /stage-apply/, "승격 후 정본 반영 절차(stage-apply) 안내가 없다");
  assert.match(s, /승격된 뒤에만 동작합니다/, "stage-apply의 전제(승격)가 설명되지 않았다");
});

// ── 0.1.35 목업 제자리 수정 — "설명만 최신" 근절 ────────────────────────────────
//
// 근본 결함(2026-07-31 실사용 지적): 지시문이 **명세와 주석 패널만** 고치게 했고, 심지어
// "목업 파일을 새로 만드는 작업이 아닙니다 / 목업 도형을 바꿔야 하는 항목은 '미반영'" 이라고
// **명시적으로 막고** 있었다. 그 문장은 사본이 없던 시절의 안전장치(목업 수정 = 새 파일 = 핀 분리)였다.
// 사본 페이지가 생긴 뒤로는 **제자리 교체**가 가능하므로 전제가 사라졌다.
// 아래 테스트가 고정하는 것: ① 낡은 금지 문장 부재 ② ③-c 단계의 위치·불변식 ③ 겹침 사전 검사
// ④ ③-c → ④ 순서 ⑤ 회신의 '그림이 바뀐 요소' 줄 ⑥ **보류 분기 무변경**.
const COPY_CTX = { ...CTX, copy: { state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 3 } };

test("[목업] 낡은 금지 문장이 사라지고 '사본에서는 목업 도형도 실제로 고친다'로 바뀌었다", () => {
  const s = buildWfFeedbackInstruction(COPY_CTX);
  // 제거 대상 — 세션이 목업을 안 건드리게 만들던 두 문장.
  assert.ok(!/화면을 새로 도출하거나 목업 파일을\n?\s*새로 만드는 작업이 아닙니다/.test(s),
    "'목업을 만드는 작업이 아니다'라는 낡은 문장이 남아 있다");
  assert.ok(!/목업 재생성 필요\(관리자 승인 필요\)/.test(s),
    "'목업은 못 고치니 미반영' 처방이 남아 있다(이번 결함의 직접 원인)");
  // 대체 문장 — 목업도 고친다 + **새 파일은 여전히 금지**라는 구분이 분명해야 한다.
  assert.match(s, /목업 도형을 실제로 교체/, "목업을 실제로 고치라는 지시가 없다");
  assert.match(s, /새 파일 금지 ≠ 목업 수정 금지/, "'새 파일 금지'와 '목업 수정 금지'의 구분이 없다");
  assert.match(s, /penpot 파일·화면을 새로 만들지 마세요/, "새 파일 생성 금지가 사라졌다(핀 분리 방지)");
});

test("[목업] ③-c 제자리 수정 단계가 ③-b 뒤·④ 앞에 있고 한 커밋·id 재사용·y보정을 강제한다", () => {
  const s = buildWfFeedbackInstruction(COPY_CTX);
  const lines = s.split("\n");
  const iRecheck = lines.findIndex((l) => /^ {2}③-b /.test(l));
  const iRemock = lines.findIndex((l) => /^ {2}③-c /.test(l));
  const iAnno = lines.findIndex((l) => /^ {2}④ /.test(l));
  assert.ok(iRecheck > 0 && iRemock > iRecheck, "③-c가 쓰기 직전 재확인(③-b) 앞에 있다(가드 우회)");
  assert.ok(iAnno > iRemock, "④ 주석 패널 재렌더가 ③-c보다 앞에 있다(옛 폭 기준 패널이 남는다)");

  const block = lines.slice(iRemock, iAnno).join("\n");
  // 부분 적용 금지 — del + add 를 같은 커밋에.
  assert.match(block, /같은 \*\*`changes` 배열\*\*|같은 `changes` 배열/, "del/add를 한 커밋으로 묶으라는 지시가 없다");
  assert.match(block, /del-obj/);
  assert.match(block, /add-obj/);
  assert.match(block, /부분 적용 금지/);
  // 댓글 핀·추적성 유지의 유일한 수단.
  assert.match(block, /board id 재사용\(필수\)/, "board id 재사용 요구가 없다(댓글 frame-id·loc이 끊긴다)");
  assert.match(block, /frame-id/);
  assert.match(block, /loc: penpot:<file>:<frame>/);
  // 빌더가 y=0에만 그린다는 실제 제약.
  assert.match(block, /y 보정/, "y 오프셋 보정 지시가 없다");
  assert.match(block, /selrect/);
  // 쓰기 대상 페이지는 사본 하나뿐.
  assert.ok(block.includes(`page=${PAGE}`), "③-c가 사본 페이지를 명시하지 않는다");
  assert.ok(!/정본/.test(block.replace(/정본 페이지·정본 파일은 여기서도 무접촉입니다/, "")),
    "③-c가 정본을 쓰는 여지를 남겼다");
});

test("[목업] wfgen은 '새 파일만 만든다'는 제약과 대체 수단(실재 API)이 지시문에 적혀 있다", () => {
  const s = buildWfFeedbackInstruction(COPY_CTX);
  assert.match(s, /`wfgen\.py`는 실행하지 마세요/, "wfgen 실행 금지가 없다");
  assert.match(s, /\*\*무조건 `create-file`\(새 파일\)\*\*/, "wfgen이 새 파일만 만든다는 근거가 없다");
  assert.match(s, /제자리 갱신\n?\s*옵션\(`--page`\/`--file`\)이 \*\*없습니다\*\*/, "없는 옵션 제약이 안 적혔다");
  // 지어낸 명령이 아니라 **실재 모듈 함수**를 쓰게 한다(plm-hub/tests/test_wf_inplace.py가 같은 API로 실행 검증).
  for (const api of ["wfanno._resolve_ctx", "wfanno._load_pages", "wfanno._frames",
                     "wfanno.screen_boards", "wfgen.load_screen", "wfgen.pick_archetype",
                     "wfgen.build_screens", "wfgen.penpot_rpc"]) {
    assert.ok(s.includes(api), `실재 API ${api}가 지시문에 없다`);
  }
  // 존재하지 않는 CLI를 지어내지 않았는지 — 실행 명령 줄은 여전히 wfanno.py 뿐이다.
  for (const c of s.split("\n").filter((l) => RUNNABLE.test(l))) assert.match(c, /wfanno\.py/);
});

test("[목업] 겹침 사전 검사(dry-run)가 쓰기 전 단계로 못박혀 있고 침범 시 진행을 막는다", () => {
  const s = buildWfFeedbackInstruction(COPY_CTX);
  assert.match(s, /겹침 사전 검사\(쓰기 전 · 필수\)/, "겹침 검사 단계가 없다");
  assert.match(s, /panel_anchor/, "재렌더될 패널 자리를 계산하라는 지시가 없다");
  assert.match(s, /build_anno_panel/);
  assert.match(s, /하나라도 겹치면 쓰지 마세요/, "침범해도 진행할 여지가 남아 있다");
  assert.match(s, /이웃 board 를 옮겨서 자리를 만드는 것은 금지/, "남의 화면을 밀어 자리를 만들 여지가 있다");
  assert.match(s, /미반영.*이웃 화면 침범/s, "침범 시 미반영 처리 지시가 없다");
  // 크기가 바뀌면 패널이 따라가야 한다 — 순서 의존을 말로 못박는다.
  assert.match(s, /③-c 를 했으면 ④는 필수이고 순서도 ③-c → ④ 입니다/, "패널 재렌더 의존 관계가 없다");
});

test("[회신] ⑦에 '그림이 실제로 바뀐 요소 목록'이 강제되고 정산에도 같은 줄이 실린다", () => {
  const s = buildWfFeedbackInstruction(COPY_CTX);
  assert.match(s, /그림이 실제로 바뀐 요소 목록/, "회신 형식에 그림 변경 목록이 없다");
  assert.match(s, /목업변경: LIST\.03/, "형식 예시가 없다");
  assert.match(s, /목업변경: 없음\(명세만\)/, "안 바꿨을 때의 명시 규칙이 없다");
  assert.match(s, /result 에도 `목업변경:` 줄을/, "정산(report.result)에 남기라는 지시가 없다");
  // 서버 정산 파서는 `반영:`/`미반영:` 두 줄만 읽는다 — 그 형식은 그대로여야 한다.
  assert.match(s, /반영: c1234, c1250/);
  assert.match(s, /★★ \*\*`반영:` 줄에 적지 않은 항목은 '완료'가 되지 않고/);
});

test("[보류 무변경] 사본 없음·판정 불가 지시문에는 목업 단계가 새어 나가지 않는다", () => {
  for (const copy of [{ state: "none" }, { state: "unknown", reason: "조회 실패" }]) {
    const s = buildWfFeedbackInstruction({ ...CTX, copy });
    assert.deepEqual(s.split("\n").filter((l) => RUNNABLE.test(l)), [], "보류인데 실행 명령이 생겼다");
    // `update-file`은 보류의 **금지 목록**에 이름으로 남아 있어야 하므로 제외한다(아래에서 따로 확인).
    for (const w of ["③-c", "목업변경", "del-obj", "add-obj", "build_screens", "제자리"]) {
      assert.ok(!s.includes(w), `보류 지시문에 '${w}'가 새어 나갔다(쓰기 유도)`);
    }
    // 보류의 본체(쓰기 전면 금지 목록·회신 규율)는 0.1.34 그대로.
    assert.match(s, /penpot update-file 계열 호출 · 목업 생성 스크립트 · PLM 본문 put_doc\/import/);
    assert.match(s, /읽기 전용 조사.*는 해도 됩니다/s);
  }
});

// ── ①-b 쓰기 직전 재확인(감사 C1) ─────────────────────────────────────────
//
// 릴레이는 claim 시점 1회만 조회한다 — 그사이 승격되면 "사본"이라 믿은 page가 **정본**이다.
// 아래가 그 경합을 잡는 유일한 판정식이고, 지시문은 세션이 그것을 **쓰기 직전에** 부르게 만든다.
test("recheckVerdict — 사본이 그대로면 ok", () => {
  const got = recheckVerdict(PAGE, [{ role: "working", page_id: PAGE, penpot_file_id: FILE, src_page_id: "pg-canon" }]);
  assert.equal(got.ok, true);
  assert.equal(got.kind, "working");
});

test("recheckVerdict — 작업 중 승격되면 promoted(가장 위험한 경합 · 정본을 직접 고칠 뻔한 지점)", () => {
  // 승격은 사본 행을 지우고 **옛 정본**에 보관본 행을 만든다(src_page_id = 정본이 된 사본 페이지).
  const got = recheckVerdict(PAGE, [
    { role: "archived", page_id: "pg-canon", src_page_id: PAGE, penpot_file_id: FILE, promoted_at: "2026-07-31T05:00:00Z" },
  ]);
  assert.equal(got.ok, false);
  assert.equal(got.kind, "promoted");
  assert.match(got.reason, /정본으로 승격/);
});

test("recheckVerdict — 승격 중간·보관본·사라짐·조회실패는 전부 중단(안전 실패)", () => {
  assert.equal(recheckVerdict(PAGE, [{ role: "working", page_id: PAGE, promoted_at: "now" }]).kind, "promoting");
  assert.equal(recheckVerdict(PAGE, [{ role: "archived", page_id: PAGE }]).kind, "archived");
  assert.equal(recheckVerdict(PAGE, []).kind, "gone"); // 버려졌다
  assert.equal(recheckVerdict(PAGE, [{ role: "working", page_id: PAGE, closed_at: "x" }]).kind, "gone");
  assert.equal(recheckVerdict(PAGE, null).kind, "unknown"); // 조회 실패 = ok 아님
  assert.equal(recheckVerdict(null, []).kind, "unknown");
  for (const v of [recheckVerdict(PAGE, []), recheckVerdict(PAGE, null)]) assert.equal(v.ok, false);
});

test("지시문(사본 있음) — 첫 쓰기 앞에 재확인 절차가 있고, render 자체도 가드를 달고 나간다", () => {
  const s = buildWfFeedbackInstruction({ ...CTX, copy: { state: "copy", page: PAGE, file: FILE } });
  const lines = s.split("\n");
  const iCheck = lines.findIndex((l) => l.includes("wfanno.py page-role"));
  const iRender = lines.findIndex((l) => /wfanno\.py render/.test(l) && !/--dry-run/.test(l));
  assert.ok(iCheck > 0, "쓰기 직전 재확인 명령이 지시문에 없다");
  assert.ok(iRender > iCheck, "재확인이 첫 render(쓰기)보다 뒤에 있다");
  assert.ok(s.includes(recheckCommand("P1", PAGE)), "재확인 명령이 --expect working으로 나가지 않는다");

  // 세션이 ③-b를 건너뛰어도 쓰기 지점에서 막힌다 — render가 가드 플래그를 달고 나간다.
  const renders = lines.filter((l) => /wfanno\.py render/.test(l) && !/--dry-run/.test(l));
  assert.ok(renders.length > 0);
  for (const r of renders) assert.match(r, /--expect-page-role working/, `render 가드 누락: ${r}`);

  // 멈췄을 때 사람에게 나갈 문장 + 정산 규율(reason 금지)이 함께 있어야 한다.
  assert.ok(s.includes(recheckAbortReply("promoted")), "중단 회신 문구가 지시문에 없다");
  assert.match(s, /`reason` 인자는 \*\*쓰지 마세요\*\*/);
  assert.match(s, /그 자리에서 멈춥니다/);
});

test("정본 미반영 고지는 **시점 의존 단정**을 하지 않는다(감사 R5 · 이력에 거짓말이 남지 않게)", () => {
  const notice = notPromotedNotice(PAGE);
  assert.match(notice, /승격 이력/, "반영 여부 확인처를 가리키지 않는다");
  assert.ok(!/아직 반영되지 않았습니다\*\*\(/.test(notice), "옛 단정 문장이 그대로 남아 있다");
  // [원본] 보존 규율 — 되돌릴 수 있게 옛 문장이 주석에 남아 있어야 한다.
  assert.match(fs.readFileSync(WF, "utf8"), /\[원본\] 시점 의존 문장/);
});

// ── ② 사본 없음 = 보류(정본 직접 작업 분기 제거 · 관리자 확정 2026-07-31) ────────────
test("지시문(사본 없음) — 정본을 고치지 않고 **보류**한다: 실행 가능한 쓰기 명령 0개", () => {
  const s = buildWfFeedbackInstruction({ ...CTX, copy: { state: "none" } });

  // ★ 핵심: 사본이 없으면 아무것도 쓰지 않는다. 정본을 미는 `sync --force`는 흔적도 없어야 한다.
  assert.deepEqual(s.split("\n").filter((l) => RUNNABLE.test(l)), []);
  assert.ok(!/--force/.test(s), "정본 덮어쓰기(--force)가 남아 있다");

  assert.match(s, /보류/);
  assert.match(s, /작업을 시작하지 마세요/);
  assert.match(s, /작업용 사본\(working copy\)이 없습니다/);
  assert.match(s, /댓글 반영은 작업용 사본에서만/, "왜 멈추는지(강제 규칙)를 말하지 않는다");

  // 회신 문구 — 사람이 읽는 message 첫 줄과 정산(report.result) 양쪽에 같은 문장이 실린다.
  assert.ok(s.includes(NO_COPY_REPLY), "'사본이 없어 진행하지 않았습니다' 회신 문구가 없다");
  assert.match(s, /사본이 없어 진행하지 않았습니다/);
  assert.match(s, /report\(work_id="wf-P1-alice-1", ok=false/);
  assert.match(s, /`reason` 인자는 \*\*쓰지 마세요\*\*/, "reason을 쓰면 '보내는 중'에 갇힌다는 경고가 없다");
  assert.match(s, /대상: c1, c2 \(2건\)/);
});

test("코드 보존 — 제거된 '정본 직접 작업' 원문이 주석으로 남아 있고 되살릴 수 있다(§3.6)", () => {
  const src = fs.readFileSync(WF, "utf8");
  assert.match(src, /\[원본\] 0\.1\.25까지의 \*\*정본 직접 작업\*\* 분기/, "제거 원문의 [원본] 표시가 없다");
  assert.match(src, /\/\/\s+`\s+python3 plugin\/plm-hub\/scripts\/wfanno\.py sync --project \$\{P\} --code WF-<CODE> --force/,
    "원문의 sync --force 절차가 주석에서 사라졌다(원복 불가)");
  // 릴레이 본체의 0.1.24 원문 블록도 그대로 평가 가능해야 한다 — 두 세대의 원문이 모두 살아 있다.
  const legacy = evalPreservedOriginal({
    w: { project: CTX.project, work_id: CTX.workId },
    buildInfo: { team: CTX.team },
    bText: CTX.userText,
    attachBlock: CTX.attachBlock,
    fbWarn: CTX.fbWarn,
    fbLines: CTX.fbLines,
    fbItems: [{ ref: "c1" }, { ref: "c2" }],
  });
  assert.match(legacy, /wfanno\.py sync --project P1 --code WF-<CODE> --force/);
  // 그리고 그 원문은 **지금 나가는 지시문이 아니다**(강제 전환이 실제로 일어났다는 증거).
  assert.notEqual(buildWfFeedbackInstruction({ ...CTX, copy: { state: "none" } }), legacy);
});

// ── ③ 판정 불가(안전 실패) ────────────────────────────────────────────────
test("지시문(조회 실패) — 실행 가능한 쓰기 명령이 하나도 없고 보류·회신만 지시한다", () => {
  const reason = "작업용 사본 조회 실패(HTTP 403) — 토큰 권한이 부족합니다";
  const s = buildWfFeedbackInstruction({ ...CTX, copy: { state: "unknown", reason } });

  // ★ 정본을 건드리는 쪽으로 폴백하지 않는다 — 실행 명령 0개.
  assert.deepEqual(s.split("\n").filter((l) => RUNNABLE.test(l)), []);
  assert.ok(!/--force/.test(s));

  assert.match(s, /보류/);
  assert.match(s, /작업을 시작하지 마세요/);
  assert.ok(s.includes(reason), "사람이 읽을 사유가 지시문에 없다");
  assert.match(s, /message\(kind="result", thread="wireframe:P1", work_id="wf-P1-alice-1"\)/);
  assert.match(s, /report\(work_id="wf-P1-alice-1", ok=false/);
  // reason 인자를 쓰면 blocked로 갇힌다 — 쓰지 말라는 경고가 있어야 한다.
  assert.match(s, /`reason` 인자는 \*\*쓰지 마세요\*\*/);
});

test("지시문(설정 부족도 unknown 경로) — 사유만 바뀌고 쓰기 금지는 동일", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "unknown", reason: "릴레이 설정 부족(API/TOKEN/project 미설정)" },
  });
  assert.deepEqual(s.split("\n").filter((l) => RUNNABLE.test(l)), []);
  assert.match(s, /릴레이 설정 부족/);
});

// ── ④ 지금 **열어둔** 페이지(0.1.34 · 관리자 요구 2026-07-31) ─────────────────
//
// "사본을 열어놓고 그 안에서도 피드백·보완을 한 다음 합칠 텐데, Claude가 지금 **어디서** 작업해야
//  하는지 알려면 열려 있는 페이지가 정본인지 사본인지·어떤 페이지인지 알아야 한다."
// 고정하는 계약:
//   ① 지시문 첫머리에 **한 줄**이 있고, 4케이스(사본·정본·보관본·미상)가 각각 정확히 적힌다.
//   ② 대상 사본 선택은 ①열어둔 페이지 → ②고른 댓글의 페이지 순. 둘이 다른 사본을 가리키면 **둘 다** 적는다.
//   ③ 정본/보관본을 열어둔 채 보내면 "보던 곳 ≠ 작업한 곳"이 **회신에도** 남는다.
//   ④ 구 대시보드 payload(open_page 없음)는 "열린 페이지 미상"으로 흐르고 나머지 지시문은 그대로다.
const OPEN_COPY = { penpot_file: FILE, penpot_page: PAGE, role: "working", page_name: "Page 1 (작업본 · 07-31)" };
const OPEN_CANON = { penpot_file: FILE, penpot_page: "pg-canon", role: "canonical", page_name: "Page 1" };
const OPEN_ARCH = { penpot_file: FILE, penpot_page: "pg-arch", role: "archived", page_name: "보관 · Page 1 (07-30)" };

test("normalizeOpenPage — 대시보드 payload를 정규화하고, 페이지가 없으면 null(모른다)", () => {
  assert.deepEqual(normalizeOpenPage(OPEN_COPY), {
    page: PAGE, file: FILE, role: "working", name: "Page 1 (작업본 · 07-31)",
  });
  // 이미 정규화된 값을 다시 넣어도 같은 값(릴레이 본체가 한 번 정규화한 뒤 조립에 넘긴다).
  assert.deepEqual(normalizeOpenPage(normalizeOpenPage(OPEN_COPY)), normalizeOpenPage(OPEN_COPY));
  // 모르는 role 문자열·누락은 unknown으로 접는다(임의 값이 '정본'으로 읽히지 않게).
  assert.equal(normalizeOpenPage({ penpot_page: PAGE, role: "canonicalish" }).role, "unknown");
  assert.equal(normalizeOpenPage({ penpot_page: PAGE }).role, "unknown");
  for (const v of [null, undefined, {}, { penpot_page: "" }, "pg-1", 3]) assert.equal(normalizeOpenPage(v), null);
});

test("pagesFromOpenPage — 열어둔 페이지 1개(모르면 빈 배열 = 예전 판정 그대로)", () => {
  assert.deepEqual(pagesFromOpenPage(OPEN_COPY), [PAGE]);
  assert.deepEqual(pagesFromOpenPage(null), []);
  assert.deepEqual(pagesFromOpenPage({ role: "working" }), []);
});

test("openPageLine — 사본·정본·보관본·미상 4케이스가 각각 다른 문장으로 나간다", () => {
  assert.equal(
    openPageLine(OPEN_COPY),
    `지금 열려 있는 페이지: **사본** \`Page 1 (작업본 · 07-31)\` (page=${PAGE} · file=${FILE})`,
  );
  assert.equal(openPageLine(OPEN_CANON), `지금 열려 있는 페이지: **정본** \`Page 1\` (page=pg-canon · file=${FILE})`);
  assert.equal(
    openPageLine(OPEN_ARCH),
    `지금 열려 있는 페이지: **보관본** \`보관 · Page 1 (07-30)\` (page=pg-arch · file=${FILE})`,
  );
  assert.equal(
    openPageLine(null),
    "지금 열려 있는 페이지: **열린 페이지 미상**(대시보드가 알려오지 않았습니다 — 추측하지 마세요)",
  );
  // 역할을 판정 못 한 경우(대장 조회 실패)도 정본이라 말하지 않는다.
  assert.match(openPageLine({ penpot_page: PAGE, role: "unknown" }), /역할 미상/);
  // 이름을 모르면 이름 칸을 비운다(빈 백틱을 만들지 않는다).
  assert.equal(openPageLine({ penpot_page: PAGE, role: "working" }), `지금 열려 있는 페이지: **사본** (page=${PAGE})`);
});

test("[우선순위] pickWorkingCopy — 사본이 2개면 **열어둔 페이지**가 고른 댓글보다 먼저다", () => {
  const rows = [
    { role: "working", page_id: "pg-copy-A", src_page_id: "pg-A", penpot_file_id: FILE, label: "A 작업본" },
    { role: "working", page_id: "pg-copy-B", src_page_id: "pg-B", penpot_file_id: FILE, label: "B 작업본" },
  ];
  // 댓글은 A를, 열어둔 페이지는 B를 가리킨다 → ① 우선순위대로 B.
  const got = pickWorkingCopy(rows, [FILE], ["pg-A"], ["pg-copy-B"]);
  assert.equal(got.page, "pg-copy-B");
  assert.equal(got.pickedBy, "open");
  assert.deepEqual(got.alt, { page: "pg-copy-A", label: "A 작업본" }, "밀린 쪽(댓글의 사본)이 결과에 남아야 한다");
  // 열어둔 페이지가 아무것도 못 좁히면 ② 댓글 힌트로 폴백한다(0.1.33 동작 보존).
  const fallback = pickWorkingCopy(rows, [FILE], ["pg-A"], ["pg-무관"]);
  assert.equal(fallback.page, "pg-copy-A");
  assert.equal(fallback.pickedBy, undefined, "예전과 같은 판정에는 새 필드를 싣지 않는다(반환 모양 보존)");
  assert.equal(fallback.alt, undefined);
  // 둘이 **같은** 사본을 가리키면 불일치가 아니다.
  assert.equal(pickWorkingCopy(rows, [FILE], ["pg-A"], ["pg-copy-A"]).alt, undefined);
});

test("[우선순위] pickWorkingCopy — 후보가 하나면 열어둔 페이지가 무엇이든 그 사본이다(회귀 0)", () => {
  const rows = [{ role: "working", page_id: PAGE, penpot_file_id: FILE, label: "작업본" }];
  assert.deepEqual(pickWorkingCopy(rows, [FILE], ["pg-x"], ["pg-y"]), {
    state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 0,
  });
});

// ── ④-c 변경 칩(바뀐 프레임 표시 · 0.1.36) ─────────────────────────────────
//
// 왜 고정하나: 사람이 사본을 열었을 때 **어느 프레임이 바뀌었는지** 캔버스에서 알아볼 방법이 없었다
// (주석 패널은 모든 프레임에 항상 있으니 신호가 못 된다). 회신 글만으로는 화면을 찾을 수 없다.
// 지시문에 칩 부착 단계가 빠지면 그 표시는 아무도 붙이지 않는다 — 그래서 문장이 아니라 테스트로 고정한다.
test("지시문(사본 있음) — ④-c 변경 칩 부착이 있고, 가드·요소목록을 달고 **패널 재렌더 뒤**에 온다", () => {
  const s = buildWfFeedbackInstruction({ ...CTX, copy: { state: "copy", page: PAGE, file: FILE } });
  const lines = s.split("\n");
  const marks = lines.filter((l) => /wfanno\.py mark/.test(l) && !/--clear/.test(l));
  assert.ok(marks.length > 0, "변경 칩 부착 명령이 지시문에 없다 — 아무도 표시를 붙이지 않는다");
  for (const m of marks) {
    assert.match(m, new RegExp(`--page ${PAGE}(\\s|$)`), `칩 명령에 사본 페이지가 없다: ${m}`);
    assert.match(m, /--expect-page-role working/, `칩 명령에 역할 가드가 없다: ${m}`);
  }
  assert.match(s, /--items "/, "바뀐 요소 목록(--items)을 안 넘긴다 — 칩에 무엇이 바뀐지 안 남는다");

  // 순서: 패널 재렌더(④) → 칩(④-c). 패널이 프레임 우변 기준이라 목업이 바뀌면 자리가 바뀐다.
  const iRender = lines.findIndex((l) => /wfanno\.py render/.test(l) && !/--dry-run/.test(l));
  const iMark = lines.findIndex((l) => /wfanno\.py mark/.test(l) && !/--clear/.test(l));
  assert.ok(iRender > 0 && iMark > iRender, "칩 부착이 패널 재렌더보다 앞에 있다(순서 역전)");
  assert.match(s, /④-c/, "칩 단계 번호가 절차에 없다");
  assert.match(s, /붙이지 않음/, "겹침으로 못 붙였을 때의 처리를 안 알린다");
});

test("지시문(사본 있음) — 승격 뒤 정리(mark --clear)가 관리자 절차에 함께 있다", () => {
  const s = buildWfFeedbackInstruction({ ...CTX, copy: { state: "copy", page: PAGE, file: FILE } });
  const clears = s.split("\n").filter((l) => /wfanno\.py mark --clear/.test(l));
  assert.equal(clears.length, 1, "승격 뒤 칩 정리 명령이 정확히 한 줄이 아니다");
  assert.match(clears[0], new RegExp(`--page ${PAGE}(\\s|$)`));
  // stage-apply → sync → mark --clear 순서(정본이 된 페이지에 '반영됨' 표시를 남기지 않는다)
  // 산문에도 명령 이름이 나오므로 **실행 가능한 줄**만 본다(RUNNABLE).
  const lines = s.split("\n");
  const at = (re) => lines.findIndex((l) => RUNNABLE.test(l) && re.test(l));
  const iStage = at(/wfanno\.py stage-apply/);
  const iSync = at(/wfanno\.py sync/);
  const iClear = at(/wfanno\.py mark --clear/);
  assert.ok(iStage > 0 && iSync > iStage && iClear > iSync, "승격 절차 순서가 어긋났다");
});

test("[보류] 변경 칩도 쓰기다 — 사본 없음·판정 불가 분기에는 mark 명령이 하나도 없다", () => {
  for (const copy of [{ state: "none" }, { state: "unknown", reason: "조회 실패" }]) {
    const s = buildWfFeedbackInstruction({ ...CTX, copy });
    assert.ok(!/wfanno\.py mark/.test(s), "보류인데 칩 부착(penpot 쓰기)을 시킨다");
  }
});

test("지시문(사본 있음) — 첫머리에 열린 페이지 한 줄이 있고, 열어둔 사본 = 작업 사본이면 잡음이 없다", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "copy", page: PAGE, file: FILE, label: "작업본" },
    open: OPEN_COPY,
  });
  const lines = s.split("\n");
  assert.equal(lines[1], openPageLine(OPEN_COPY), "열린 페이지 줄이 첫머리(2번째 줄)에 없다");
  assert.ok(lines.findIndex((l) => l.startsWith("사용자:")) > 1, "사용자 입력보다 앞에 와야 한다");
  assert.match(s, /열어둔 페이지가 곧 \*\*이 작업의 사본\*\*입니다/);
  // 보던 곳과 작업할 곳이 같으니 회신에 덧붙일 문장은 없다.
  assert.equal(openPageReplyLine(OPEN_COPY, PAGE), "");
  assert.ok(!/열어둔 페이지 ≠ 작업한 사본/.test(s));
});

test("지시문(정본을 열어둔 채 전송) — '정본을 보고 있었고 작업은 사본에서'가 지시문·회신 양쪽에 남는다", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "copy", page: PAGE, file: FILE, label: "작업본" },
    open: OPEN_CANON,
  });
  assert.match(s, /사용자는 \*\*정본\*\* `Page 1`\(page=pg-canon\)을 보고 있었고/);
  assert.match(s, /이 작업은 \*\*작업용 사본\*\*\(page=pg-copy-001\)에서 합니다/);
  // 회신 규율 — ⑦ 둘째 줄 + report result에 같은 문장을 넣게 한다.
  const reply = openPageReplyLine(OPEN_CANON, PAGE);
  assert.match(reply, /사용자가 보고 있던 페이지는 \*\*정본\*\*/);
  assert.ok(s.includes(reply), "회신 문장이 지시문에 실리지 않았다");
  assert.match(s, /둘째 줄에\*\* 다음 문장도 그대로 적으세요/);
  assert.match(s, /⑦의 둘째 문장\(열어둔 페이지 ≠ 작업한 사본\)도 그대로 넣으세요/);
  // 그래도 쓰기 대상은 사본 하나뿐이다(정본으로 새지 않는다 — 사본 강제 유지).
  for (const c of s.split("\n").filter((l) => RUNNABLE.test(l))) assert.match(c, new RegExp(`--page ${PAGE}(\\s|$)`));
});

test("지시문(보관본을 열어둔 채 전송) — 지나간 자리라는 사실과 실제 작업 자리를 함께 말한다", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: { state: "copy", page: PAGE, file: FILE },
    open: OPEN_ARCH,
  });
  assert.match(s, /사용자는 \*\*보관본\*\*\(이전 정본\)/);
  assert.match(s, /보관본은 지나간 자리라 무엇을 해도 반영되지 않습니다/);
  assert.ok(s.includes(openPageReplyLine(OPEN_ARCH, PAGE)));
});

test("지시문(열어둔 페이지 ≠ 댓글의 사본) — 둘 다 적고, 열어둔 쪽으로 정한 사실을 명시한다", () => {
  const s = buildWfFeedbackInstruction({
    ...CTX,
    copy: {
      state: "copy", page: "pg-copy-B", file: FILE, label: "B 작업본",
      pickedBy: "open", alt: { page: "pg-copy-A", label: "A 작업본" },
    },
    open: { penpot_file: FILE, penpot_page: "pg-copy-B", role: "working", page_name: "B 작업본" },
  });
  assert.match(s, /열어둔 페이지와 고른 댓글이 서로 다른 사본을 가리킵니다/);
  assert.match(s, /page=pg-copy-B/, "작업 대상(열어둔 쪽)이 적히지 않았다");
  assert.match(s, /댓글이 가리킨 사본은 page=pg-copy-A "A 작업본"입니다/, "밀린 쪽이 적히지 않았다");
  assert.match(s, /회신에 이 사실을 반드시 적으세요/);
});

test("[구 payload 호환] open_page가 없으면 '열린 페이지 미상'으로 흐르고 나머지 지시문은 그대로다", () => {
  const copy = { state: "copy", page: PAGE, file: FILE, label: "작업본", clonedThreads: 3 };
  const s = buildWfFeedbackInstruction({ ...CTX, copy }); // 구 대시보드 = open 없음
  assert.equal(s.split("\n")[1], openPageLine(null));
  assert.match(s, /\*\*열린 페이지 미상\*\* — 대상 사본은 \*\*고른 댓글의 페이지\*\*로 정했습니다/);
  // 사본 강제 계약(0.1.33)은 한 글자도 흔들리지 않는다.
  for (const c of s.split("\n").filter((l) => RUNNABLE.test(l))) assert.match(c, new RegExp(`--page ${PAGE}(\\s|$)`));
  assert.ok(s.includes(notPromotedNotice(PAGE)));
  assert.ok(!/--force/.test(s));
  // 열린 페이지 줄과 미상 안내 2줄을 빼면 0.1.33 지시문과 **완전히 같다**(회귀 0의 기계적 정의).
  const strip = (x) =>
    x.split("\n").filter((l) => !/열려 있는 페이지|열린 페이지 미상/.test(l)).join("\n");
  assert.equal(strip(s), strip(buildWfFeedbackInstruction({ ...CTX, copy, open: OPEN_COPY })).replace(
    /  · 열어둔 페이지가 곧 \*\*이 작업의 사본\*\*입니다\(page=pg-copy-001\) — 사용자가 보고 있는 그 자리에서 작업합니다\.\n/,
    "",
  ));
});

test("[보류] 사본이 없어도 '지금 열려 있는 페이지'는 첫머리에 적힌다(사람이 왜 막혔는지 대조할 좌표)", () => {
  for (const copy of [{ state: "none" }, { state: "unknown", reason: "조회 실패" }]) {
    const s = buildWfFeedbackInstruction({ ...CTX, copy, open: OPEN_CANON });
    assert.equal(s.split("\n")[1], openPageLine(OPEN_CANON));
    assert.deepEqual(s.split("\n").filter((l) => RUNNABLE.test(l)), [], "보류인데 실행 명령이 생겼다");
  }
  // 미상이어도 같은 자리에 같은 형식으로 적는다.
  assert.equal(buildWfFeedbackInstruction({ ...CTX, copy: { state: "none" } }).split("\n")[1], openPageLine(null));
});

// ── 헬퍼: 릴레이에 주석으로 보존된 [원본] 지시문을 되살려 평가한다 ────────────
//
// 코드 변경 보존 규칙(§3.6)에 따라 0.1.24 원문이 plm-channel.mjs에 주석으로 남아 있다.
// 그 주석을 **실행 가능한 골든**으로 쓴다 — 보존 블록이 훼손되면 이 테스트가 먼저 깨진다.
function evalPreservedOriginal(vars) {
  const src = fs.readFileSync(RELAY, "utf8");
  const begin = src.indexOf("    // [원본] 0.1.24 인라인 지시문");
  const stop = src.indexOf("    // [개선] 0.1.", begin); // 버전은 오른다 — 마커 접두만 고정한다
  assert.ok(begin > 0 && stop > begin, "릴레이의 [원본] 보존 블록을 찾지 못했다(주석이 지워졌는지 확인)");
  const uncommented = src
    .slice(begin, stop)
    .split("\n")
    .map((l) => l.replace(/^\s*\/\/ ?/, ""))
    .join("\n");
  const i = uncommented.indexOf("? `[와이어프레임");
  assert.ok(i > 0, "보존 블록에서 원문 템플릿 리터럴을 찾지 못했다");
  let expr = uncommented.slice(i + 1).trim();
  expr = expr.replace(/\+\s*REMOTE_ASK_RULE\(w\.work_id\)\s*$/, "").trim(); // 원격 질문 규칙은 호출측이 덧붙인다
  const names = Object.keys(vars);
  // eslint-disable-next-line no-new-func -- 보존 주석을 골든으로 평가하는 테스트 전용 경로
  return new Function(...names, `return (${expr});`)(...names.map((n) => vars[n]));
}
