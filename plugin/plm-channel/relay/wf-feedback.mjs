// 와이어프레임 **댓글 피드백 반영** 지시문 조립 — 순수 함수(P0-5 · plm-channel 0.1.26).
//
// 왜 분리했나: 이 지시문 하나가 "정본이 언제 갱신되는가"를 결정한다. 릴레이 본체(plm-channel.mjs)는
// SSE·MCP·fetch가 뒤엉켜 있어 지시문 문자열을 테스트할 수 없었다. 조립을 여기로 빼서 **부수효과 0**으로
// 만들고(입력 → 문자열), 사본 있음/없음/조회실패 3케이스를 단위 테스트로 고정한다.
//
// ── 문제(QA 치명 #4) ──────────────────────────────────────────────────────
// SAE 명세는 화면 단위 파일이고 `wfanno sync`는 **PLM 정본 본문을 민다**. 세션이 작업용 사본(working
// copy) 페이지에서만 작업해도, 지시문이 `sync --force`를 시키는 한 **리뷰어는 승인 전에 사본 내용을
// 정본 문서로 읽는다**. "원본은 그대로 둡니다"가 거짓이 되는 지점이 정확히 여기다.
//
// ── 해법(0.1.26 — 사본 **강제**) ──────────────────────────────────────────
//  copy    사본 있음  → penpot 작업은 전부 `--page <사본 페이지>` 고정 · **PLM push(sync) 지시문에서 제거**
//                       (정본 반영은 승격(promote) 시점) · 회신에 "정본 미반영" 명시.
//  none    사본 없음  → **보류**(작업하지 않는다). 관리자 확정 2026-07-31: "댓글 반영은 무조건 사본 만들고
//                       진행 — 옵션이 아닌 강제". 즉 **정본 직접 작업 분기는 존재하지 않는다**.
//                       (0.1.25까지는 여기서 정본을 그대로 고쳤다 — 그 원문은 아래 ② 블록에 주석으로 보존.)
//  unknown 판정 불가  → **안전 실패**: 정본을 건드리는 쪽으로 폴백하지 않는다. 쓰기 전면 금지 + 사람 회신.
//
// none과 unknown은 **같은 보류 지시문**을 쓴다(사유 문장만 다르다). 세션이 할 일이 같기 때문이다:
// 아무것도 쓰지 말고, 사람에게 사유를 알리고, `reason` 없이 ok=false로 끝내 댓글을 '할 일'로 되돌린다.
//
// 서버 계약(GET /wireframe/working-copy?project=P → {items:[{...PageRole, cloned_threads}]}):
//   role='working'(사본) | 'archived'(보관본) · 정본은 행 자체가 없다. page_id = **사본 페이지 uuid**.

/** 피드백 항목들에서 penpot **파일 uuid** 후보를 뽑는다(사본 조회 결과를 이 파일로 좁히기 위함).
 *  mapped 항목: `loc = "penpot:<file>:<frame>"` · unmapped 항목: `penpot_url = .../workspace/<proj>/<file>`. */
export function filesFromFeedbackItems(items) {
  const out = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const m = /^penpot:([^:]+):/.exec(String(it?.loc || ""));
    if (m) {
      out.add(m[1]);
      continue;
    }
    const u = /\/workspace\/[^/]+\/([^/?#\s]+)/.exec(String(it?.penpot_url || ""));
    if (u) out.add(u[1]);
  }
  return [...out];
}

/** 피드백 항목들에서 penpot **페이지 uuid** 후보를 뽑는다(감사 C6 — 파일 스코프를 페이지로 좁히기 위함).
 *  대시보드가 항목마다 `penpot_page`를 실어 보낸다(`toFeedbackItem` · 프레임 밖 댓글도 페이지엔 속한다).
 *  구 대시보드 payload에는 없다 → 빈 배열 = 힌트 없음 = 예전 판정 그대로. */
export function pagesFromFeedbackItems(items) {
  const out = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const p = it?.penpot_page;
    if (p) out.add(String(p));
  }
  return [...out];
}

// ── 지금 **열어둔** penpot 페이지(0.1.34) ────────────────────────────────────
//
// 관리자 요구(2026-07-31): "사본을 열어놓고 그 안에서도 피드백·보완을 한 다음 합칠 텐데, Claude가 지금
// **어디서** 작업해야 하는지 알려면 열려 있는 페이지가 정본인지 사본인지·어떤 페이지인지 알아야 한다."
//
// 예전엔 세션에 **고른 댓글의 페이지**만 전달됐다. 그건 "무엇을 고쳐야 하나"의 좌표이지 "사람이 지금
// 어디를 보고 있나"가 아니다. 사본을 열어 두고 정본 페이지의 옛 댓글을 골라 보내면, 세션은 사람이
// 정본을 보고 있다고 착각할 근거조차 없이 그냥 사본을 고르고, 회신은 "사본에서 했습니다"만 말한다 —
// 사람은 자기가 보던 화면과 회신이 같은 것인지 알 수 없다.
//
// 대시보드가 `payload.open_page`로 실어 보낸다(빌더 · penpot 주입 스크립트의 `plm-page` 브리지):
//   { penpot_file, penpot_page, role: "canonical"|"working"|"archived"|"unknown", page_name }
// **가산 필드**다 — 구 대시보드는 안 보내고(그때는 `열린 페이지 미상`), 구 릴레이는 안 읽는다(회귀 0).

/** payload.open_page 정규화 — 없거나 페이지가 없으면 **null**(모른다). 이미 정규화된 값도 그대로 통과
 *  (idempotent): 릴레이 본체가 한 번 정규화한 뒤 지시문 조립에 다시 넘기기 때문이다. */
export function normalizeOpenPage(v) {
  if (!v || typeof v !== "object") return null;
  const page = String(v.penpot_page ?? v.page ?? "").trim();
  if (!page) return null;
  const roleRaw = String(v.role ?? "").trim();
  const role = roleRaw === "canonical" || roleRaw === "working" || roleRaw === "archived" ? roleRaw : "unknown";
  const file = String(v.penpot_file ?? v.file ?? "").trim() || null;
  const name = String(v.page_name ?? v.name ?? "").trim() || null;
  return { page, file, role, name };
}

/** 열어둔 페이지의 **페이지 힌트**(사본 판정 1순위). 모르면 빈 배열 = 예전 판정 그대로. */
export function pagesFromOpenPage(open) {
  const o = normalizeOpenPage(open);
  return o ? [o.page] : [];
}

/** 역할 → 사람이 읽는 한 단어. 지시문·회신이 **같은 단어**를 쓴다(화면 배지와도 같은 어휘). */
export const OPEN_ROLE_LABEL = { canonical: "정본", working: "사본", archived: "보관본" };

/** 지시문 첫머리 1줄 — "지금 열려 있는 페이지: **사본** `Page 1 (작업본 · 07-31)` (page=…)".
 *  모르면 **미상**이라고 적는다(추측 금지 — 이 한 줄이 세션의 작업 위치 인식을 좌우한다). */
export function openPageLine(open) {
  const o = normalizeOpenPage(open);
  if (!o) return "지금 열려 있는 페이지: **열린 페이지 미상**(대시보드가 알려오지 않았습니다 — 추측하지 마세요)";
  const kind = OPEN_ROLE_LABEL[o.role] || "역할 미상";
  return (
    `지금 열려 있는 페이지: **${kind}**${o.name ? ` \`${o.name}\`` : ""}` +
    ` (page=${o.page}${o.file ? ` · file=${o.file}` : ""})`
  );
}

/** 회신에 **반드시 남겨야 하는** 한 줄(없으면 빈 문자열).
 *  사람이 보던 화면과 작업한 자리가 다를 때만 만든다 — 같으면 굳이 말하지 않는다(잡음 금지). */
export function openPageReplyLine(open, page) {
  const o = normalizeOpenPage(open);
  if (!o || !page) return "";
  const nm = o.name ? ` \`${o.name}\`` : "";
  if (o.role === "canonical")
    return `사용자가 보고 있던 페이지는 **정본**${nm}이며, 이 작업은 **작업용 사본**(page=${page})에서 수행했습니다.`;
  if (o.role === "archived")
    return `사용자가 보고 있던 페이지는 **보관본**(이전 정본)${nm}이며, 이 작업은 **작업용 사본**(page=${page})에서 수행했습니다.`;
  if (o.role === "working" && o.page !== String(page))
    return `사용자가 열어 둔 사본(page=${o.page})과 이 작업의 사본(page=${page})이 **다릅니다** — 작업은 page=${page}에서 수행했습니다.`;
  return "";
}

/** 조회 응답(items) + 파일·페이지 힌트 → 분기 판정.
 *  - 파일 힌트가 있으면 **그 파일의 사본만** 본다(다른 파일에 사본이 있어도 이 작업과 무관).
 *  - 후보가 2개 이상이면 **페이지 힌트로 좁힌다**(감사 C6). DB는 "원본당 사본 1개"만 강제하므로
 *    서로 다른 화면의 사본 2개는 **정상 상태**인데, 예전엔 그것만으로 그 파일의 모든 전송이
 *    `unknown`(보류)으로 죽었다. 이 작업의 댓글이 어느 페이지 것인지는 payload에 이미 있다.
 *  - 좁혀도 하나로 정해지지 않으면 그때 `unknown`(안전 실패) — 추측해서 정본을 건드리느니 사람에게 넘긴다.
 *
 *  0.1.34 — 좁히는 힌트가 **둘**이 됐다. 우선순위는 관리자 확정 그대로다:
 *    ① `openHints`  지금 **열어둔** 페이지(사람이 보고 있는 자리 = 작업 의도)
 *    ② `pageHints`  고른 댓글의 페이지(예전 유일 힌트 · ①이 못 좁히면 폴백)
 *  둘이 **서로 다른 사본**을 가리키면 ①로 정하되 그 사실을 결과에 담아(`alt`) 지시문이 **둘 다 적는다**
 *  — 조용히 한쪽을 고르면 사람은 자기가 보던 화면에 반영된 줄 안다. */
export function pickWorkingCopy(items, fileHints = [], pageHints = [], openHints = []) {
  // [원본] 감사 Y5 이전 — `cleanup_note`(반쪽 복제)를 보지 않았다. 원복 시 아래 한 줄로 되돌린다.
  // const rows = (Array.isArray(items) ? items : []).filter((r) => r && String(r.role) === "working" && r.page_id && !r.closed_at);
  // [개선] 감사 Y5(높음 · R4) — **반쪽 복제 사본에는 작업을 주지 않는다.**
  //   서버는 `cleanup_note`가 있는 사본의 승격을 **영구 거절**한다(X2). 그런데 릴레이가 그 사본을
  //   정상 대상으로 배정하면, 세션이 수십 분 작업한 뒤 승격이 100% 실패하고 처방은 `[사본 버리기]`
  //   (= 그 작업 전량 폐기)뿐이다. 즉 **작업이 확정적으로 버려지는 유일한 경로**다.
  //   화면·서버는 이미 그 사본을 위험으로 표시한다 — 릴레이만 몰랐다.
  const live = (Array.isArray(items) ? items : []).filter(
    (r) => r && String(r.role) === "working" && r.page_id && !r.closed_at,
  );
  const broken = (r) => String(r?.cleanup_note || "").trim() !== "";
  const rows = live.filter((r) => !broken(r));
  const hints = new Set((fileHints || []).filter(Boolean).map(String));
  const scoped = hints.size ? rows.filter((r) => hints.has(String(r.penpot_file_id))) : rows;
  if (scoped.length === 0) {
    // 이 작업이 가리키는 사본이 **반쪽 복제라서** 후보에서 빠진 것이라면 "사본 없음"이 아니라
    // **보류(unknown)** 다 — 사람이 그 사본을 버리고 새로 만들어야 진행된다.
    const brokenScoped = hints.size
      ? live.filter((r) => broken(r) && hints.has(String(r.penpot_file_id)))
      : live.filter(broken);
    if (brokenScoped.length > 0) {
      return {
        state: "unknown",
        reason:
          `이 화면의 작업용 사본이 **복제가 끝나지 않은 상태**입니다(정본으로 올릴 수 없는 사본) — ` +
          `대시보드에서 [사본 버리기]로 정리하고 새로 만든 뒤 다시 보내주세요. ` +
          `(${brokenScoped.map((r) => `${r.page_id}: ${String(r.cleanup_note).trim()}`).join(" · ")})`,
      };
    }
    return { state: "none" };
  }
  // 페이지 힌트 = 그 페이지를 **덮는** 사본. 사본 페이지 자신(page_id)이든 그 원본(src_page_id)이든
  // 걸리면 그 사본이 그 힌트의 대상이다.
  const narrow = (hints) => {
    const set = new Set((hints || []).filter(Boolean).map(String));
    if (!set.size) return [];
    return scoped.filter((r) => set.has(String(r.page_id)) || set.has(String(r.src_page_id || "")));
  };
  let picked = scoped;
  /** 무엇이 이 사본을 정했나 — `only`(후보가 하나) · `open`(열어둔 페이지) · `comment`(고른 댓글). */
  let pickedBy = "only";
  /** 우선순위에 밀린 **다른 사본**(있으면 지시문이 둘 다 적는다). */
  let alt = null;
  if (scoped.length > 1) {
    // [원본] 0.1.33까지 — 힌트가 댓글 페이지 하나뿐이었다. 원복 시 아래 두 줄로 되돌리고
    //   [개선] 블록(byOpen 우선)을 주석 처리한다(§3.6).
    // const byPage = narrow(pageHints);
    // if (byPage.length !== 1) return { state:"unknown", reason: … }; picked = byPage;
    // [개선] 0.1.34 — 열어둔 페이지가 **1순위**, 고른 댓글이 폴백.
    const byOpen = narrow(openHints);
    const byCmt = narrow(pageHints);
    const chosen = byOpen.length === 1 ? byOpen : byCmt;
    if (chosen.length !== 1) {
      // 사유 문장은 0.1.33 문구를 **그대로 유지**하고(사람이 읽던 말이 안 바뀐다) 열어둔 페이지 몫만 덧붙인다.
      const bits = [];
      if ((pageHints || []).filter(Boolean).length) bits.push(`대상 페이지로 좁혀도 ${byCmt.length}개`);
      if ((openHints || []).filter(Boolean).length) bits.push(`열어둔 페이지로는 ${byOpen.length}개`);
      return {
        state: "unknown",
        reason:
          `이 파일에 작업용 사본이 ${scoped.length}개 있어 어느 사본 페이지에 반영할지 판정할 수 없습니다` +
          (bits.length ? `(${bits.join(" · ")})` : "") +
          `(pages: ${scoped.map((r) => r.page_id).join(", ")})`,
      };
    }
    picked = chosen;
    pickedBy = byOpen.length === 1 ? "open" : "comment";
    // 두 힌트가 각각 **다른** 사본을 가리켰다 — 조용히 삼키지 않는다.
    if (byOpen.length === 1 && byCmt.length === 1 && String(byOpen[0].page_id) !== String(byCmt[0].page_id)) {
      alt = { page: String(byCmt[0].page_id), label: String(byCmt[0].label || byCmt[0].src_name || "") };
    }
  }
  const r = picked[0];
  return {
    state: "copy",
    page: String(r.page_id),
    file: String(r.penpot_file_id || ""),
    label: String(r.label || r.src_name || ""),
    clonedThreads: Number(r.cloned_threads) || 0,
    // 아래 둘은 **새 동작일 때만** 싣는다 — 0.1.33이 이미 하던 판정(후보 1개 · 댓글 힌트로 좁히기)의
    // 반환 모양은 그대로 둔다(기존 계약 테스트가 결과 전체를 deepEqual로 고정하고 있고, 그 고정은
    // "판정 결과가 조용히 달라지지 않는다"를 지키는 장치다).
    ...(pickedBy === "open" ? { pickedBy } : {}),
    ...(alt ? { alt } : {}),
  };
}

// ── 쓰기 직전 **재확인**(감사 C1) ────────────────────────────────────────────
//
// 릴레이는 작업을 세션에 넘길 때 **딱 한 번** 사본 상태를 조회하고 그 결과로 지시문을 굳힌다
// (`plm-channel.mjs`의 claim 시점 1회). 세션이 실제로 쓰는 것은 그로부터 수 분 뒤다 — 그사이 관리자가
// [정본으로 올리기]를 하면 지시문이 가리키던 `--page`는 이제 **정본**이다. 세션은 "사본"이라 믿고
// 정본 페이지의 주석 패널을 갈아끼우고, 회신에는 "정본에 아직 반영되지 않았습니다"라고 적는다
// (검토 없이 정본이 바뀌고, 사람은 정반대로 안다).
//
// 그래서 **쓰기 직전에 한 번 더 본다.** 판정식은 아래 순수 함수 하나이며, 같은 판정이
// `wfanno.py page-role`(세션이 부르는 명령)과 `wfanno.py render --expect-page-role`(도구 자체 가드)에도
// 동일하게 들어 있다 — 세션이 절차를 건너뛰어도 쓰기 지점에서 막힌다.

/** 재확인 판정(순수) — 최신 items[] + 지시문이 가리키던 사본 페이지.
 *  `{ok:true}` 또는 `{ok:false, kind, reason}`. **모르면 ok가 아니다**(안전 실패). */
export function recheckVerdict(page, items) {
  if (!page) return { ok: false, kind: "unknown", reason: RECHECK_REASON.unknown };
  if (!Array.isArray(items)) return { ok: false, kind: "unknown", reason: RECHECK_REASON.unknown };
  const rows = items.filter((r) => r && !r.closed_at);
  const mine = rows.find((r) => String(r.page_id || "") === String(page));
  if (mine && String(mine.role) === "working") {
    return mine.promoted_at
      ? { ok: false, kind: "promoting", reason: RECHECK_REASON.promoting }
      : { ok: true, kind: "working", reason: RECHECK_REASON.working };
  }
  if (mine && String(mine.role) === "archived") {
    return { ok: false, kind: "archived", reason: RECHECK_REASON.archived };
  }
  // 사본 행이 사라졌다 — 옛 정본이 보관본으로 이 페이지를 가리키면 **승격**된 것이다(가장 위험한 경우).
  const promoted = rows.some(
    (r) => String(r.role) === "archived" && String(r.src_page_id || "") === String(page),
  );
  return promoted
    ? { ok: false, kind: "promoted", reason: RECHECK_REASON.promoted }
    : { ok: false, kind: "gone", reason: RECHECK_REASON.gone };
}

/** 판정별 사유 1줄 — 지시문·회신·`wfanno.py`가 **같은 문장**을 쓴다(사람이 두 곳에서 다른 말을 듣지 않게). */
export const RECHECK_REASON = {
  working: "작업용 사본이 그대로입니다",
  promoting: "이 사본의 승격이 진행 중입니다",
  promoted: "이 사본이 그사이 정본으로 승격됐습니다",
  archived: "이 페이지가 보관본(이전 정본)이 됐습니다",
  gone: "이 사본이 사라졌습니다(버려졌거나 정리됨)",
  unknown: "사본 상태를 확인하지 못했습니다",
};

/** 재확인에서 멈췄을 때의 회신 1줄 — message 첫 줄과 report.result에 **그대로** 실린다. */
export function recheckAbortReply(kind) {
  const why = RECHECK_REASON[kind] || RECHECK_REASON.unknown;
  return (
    `작업 도중 작업용 사본 상태가 바뀌어 중단했습니다 — ${why}. ` +
    `아무것도 쓰지 않았습니다(정본 무접촉). 대시보드에서 상태를 확인한 뒤 같은 댓글을 다시 보내주세요.`
  );
}

/** 세션이 쓰기 직전에 실행할 재확인 명령 — penpot 무접촉·읽기 전용 1회. */
export function recheckCommand(project, page) {
  return `python3 plugin/plm-hub/scripts/wfanno.py page-role --project ${project} --page ${page} --expect working`;
}

// ── 사본 작업의 SAE 명세는 **스테이징**에 쓴다(감사 W11) ──────────────────────────
//
// 0.1.28까지의 사본 모드 지시문은 `.ouroboros/docs/wireframes/WF-<CODE>.json`(프로젝트가 선언한 SSOT)을
// 직접 고치고 **커밋까지** 시켰다. 그러면 "정본 반영은 승격 시점"이라는 불변식이 승격 없이 깨진다:
//   ① 이후 누가 정본 페이지에 `wfscan`을 돌리면 본문이 얇은 WF 아티팩트가 그 명세로 **보강**된다
//      (빌더 지시문이 매번 wfscan을 시킨다).
//   ② 사본을 **버린 뒤** 파일이 단일 페이지로 돌아가면 다음 `wfanno.py render --code WF-X`가
//      (`--page` 없이도) 그 명세를 **정본 penpot 페이지에 렌더**한다.
// → 사본 스코프의 편집물은 사본 스코프에 둔다. 정본으로 넘기는 유일한 경로는 `wfanno.py stage-apply`이고
//   그 명령은 **그 사본이 실제로 승격됐을 때만** 동작한다(도구가 판정 · 사람의 기억에 맡기지 않는다).

/** 사본 페이지별 SAE 명세 스테이징 경로 — `wfanno.py stage_dir_for()`와 **같은 규약**. */
export function stageDir(page) {
  return `.ouroboros/docs/wireframes/.working/${page}`;
}

/** 사본이 없어 보류할 때의 회신 1줄 — message·report 양쪽에 **그대로** 실린다.
 *  사람이 다음에 뭘 해야 하는지까지 한 문장에 담는다(대시보드에서 다시 보내면 사본이 자동 생성된다). */
export const NO_COPY_REPLY =
  "사본이 없어 진행하지 않았습니다 — 대시보드에서 그 댓글을 다시 보내면 작업용 사본이 자동으로 만들어집니다.";

/** 사본 모드 회신 1줄 — message·report 양쪽에 **그대로** 실리는 정본 미반영 고지.
 *
 *  [원본] 시점 의존 문장 — 원복 시 아래를 주석 해제하고 새 문장을 주석 처리한다.
 *    `작업용 사본(page=…)에서 작업했습니다 — 정본에는 **아직 반영되지 않았습니다**(관리자가 [승격]하면 반영됩니다).`
 *  이 문장은 **작업 시작 시점**에 굳어 이력에 영구히 남는다. 그 뒤 승격되면 이력이 거짓말을 한다(감사 R5,
 *  C1의 "정본 미반영이라고 잘못 보고"). → 사실(어디서 작업했나)만 남기고 반영 여부는 **확인처**를 가리킨다. */
export function notPromotedNotice(page) {
  return (
    `이 작업은 작업용 사본(page=${page})에서 수행했습니다 — 정본(원본 페이지·PLM 문서) 반영 여부는` +
    ` **승격 이력**으로 확인하세요(작업 시점에는 미반영이며, 관리자가 [정본으로 올리기]를 하면 반영됩니다).`
  );
}

// ── 목업 도형도 **실제로 고친다**(0.1.35) ────────────────────────────────────
//
// 실사용 지적(2026-07-31): "왜 주석만 고치고 실제 와이어프레임(그림)은 안 고치냐."
// 맞는 지적이었다. 0.1.34까지의 지시문은 절차가 ①명세 → ②요소 특정 → ③명세 수정 → ④**주석 패널**
// 재렌더 → ⑤⑥⑦ 뿐이라 **목업 도형을 건드리는 단계가 아예 없었고**, 심지어 이렇게 못박고 있었다:
//   "이것은 penpot 댓글 피드백을 **SAE 명세에 반영**하는 요청입니다. 화면을 새로 도출하거나 목업 파일을
//    새로 만드는 작업이 아닙니다."
//   "**목업 도형 자체(레이아웃·요소 배치)를 바꿔야 하는 항목**은 명세만 고친 뒤 그 항목을 '미반영'으로
//    남기고 사유에 '목업 재생성 필요(관리자 승인 필요)'라고 적으세요."
// 그 문장들은 **사본이 없던 시절의 안전장치**다: 그때 목업 수정 = wfgen 재실행 = create-file = 새 파일 =
// 댓글·핀이 옛 파일에 남아 분리. 지금은 사본 페이지에서 **제자리 교체**가 되므로 전제가 사라졌다.
//
// 그래서 0.1.35는 금지의 **대상을 좁힌다**: 금지되는 것은 "목업을 고치는 것"이 아니라 **"penpot 파일·화면을
// 새로 만드는 것"** 이다. 대신 ③-c 단계가 사본 페이지에서 옛 board 서브트리를 지우고 새 board를 **같은
// 자리·같은 id**로 그린다(한 update-file = 한 커밋 · 부분 적용 금지).
//
// 지시문이 시키는 수단이 실재하는지는 코드로 확인했다:
//   · `wfgen.py`는 **제자리 갱신 CLI가 없다** — main()이 무조건 create-file(새 파일)이고 `--page`/`--file`이
//     없다. 그래서 CLI가 아니라 **모듈 재사용 + change-ops 직접 조립**을 지시한다.
//   · 그 조립 절차(전 단계 · 겹침 검사 포함)는 `plugin/plm-hub/tests/test_wf_inplace.py`가 픽스처로
//     실행 검증한다(penpot 무접촉). 같은 테스트가 이 파일에 그 API 이름들이 적혀 있는지도 대조해
//     **지시문과 코드가 갈라지면 즉시 실패**한다.
// 불변식 3가지: ⓐ board id 재사용(댓글 frame-id·`wireframe_frames`·아티팩트 loc이 그 id를 가리킨다)
//   ⓑ 쓰기 전 겹침 계산(이웃 침범이면 쓰지 않는다 — 이웃을 밀어내는 것도 금지) ⓒ ③-c → ④ 순서
//   (패널은 프레임 우변 기준이라 목업 크기가 바뀌면 반드시 뒤따라 재렌더).
// 보류(none·unknown) 분기는 **한 글자도 바뀌지 않았다** — 사본이 아니면 여전히 아무것도 쓰지 않는다.

// ── 바뀐 프레임에 **변경 칩**을 붙인다(0.1.36) ───────────────────────────────
//
// 관리자 요구(2026-07-31): "변경한 프레임에 확인할 수 있도록 뭔가 표시를 해주면 좋겠다. 체크박스를
// 만들거나 별표시, 변경했다는 텍스트박스를 칩처럼 만들어 위에 붙여주거나."
// 0.1.35까지는 반영이 끝나도 **캔버스에 표시가 없었다** — 회신 글에 `목업변경:` 줄은 남지만, 사본을
// 열어 놓고 보는 사람은 어느 프레임이 바뀐 것인지 그림만 봐서는 모른다(주석 패널은 모든 프레임에 항상
// 있으니 "바뀐 것"의 신호가 못 된다).
//
// 그래서 ④-c 단계가 `wfanno.py mark`(plm-hub 0.6.30)로 프레임 위에 칩 하나를 얹는다:
//   `✱ 반영됨 · 07-31 · RDR.12, RDR.13`  — `chg:<CODE>` 그룹 1개 · 재실행하면 그 그룹만 교체(멱등).
// 불변식 3가지: ⓐ 순서는 ④(패널 재렌더) → ④-c — 패널이 프레임 우변 기준이라 목업 크기가 바뀌면
//   칩·패널 자리 계산이 함께 바뀐다. ⓑ 겹치면 붙이지 않는다(도구가 위→안쪽 폴백 후 경고 · 이웃을
//   밀어내지 않는다). ⓒ 승격 뒤에는 걷어낸다(`mark --clear` — 정본에 "반영됨"이 남으면 오해를 부른다).
// 보류(none·unknown) 분기는 **한 글자도 바뀌지 않았다** — 칩도 penpot 쓰기라 사본이 아니면 안 붙인다.

/**
 * 와이어프레임 피드백 반영 지시문 조립(순수).
 * @param {object} ctx
 * @param {string} ctx.project      PLM project
 * @param {string} ctx.workId       work_id
 * @param {string} ctx.team         penpot team id(표시용)
 * @param {string} ctx.userText     사용자 입력 본문(합성 라인 strip 후)
 * @param {string} ctx.attachBlock  첨부 블록(없으면 "")
 * @param {string} ctx.fbWarn       경고 블록(없으면 "")
 * @param {string} ctx.fbLines      피드백 항목 본문 블록
 * @param {number} ctx.fbCount      항목 수
 * @param {string[]} ctx.fbRefs     항목 ref 목록(보류 회신용)
 * @param {{state:"copy"|"none"|"unknown",page?:string,file?:string,label?:string,clonedThreads?:number,reason?:string,pickedBy?:string,alt?:{page:string,label:string}|null}} ctx.copy
 * @param {object} [ctx.open] payload.open_page — 지금 **열어둔** 페이지(없으면 미상 · 0.1.34)
 * @returns {string} 세션에 주입할 지시문(원격 질문 규칙은 호출측이 덧붙인다)
 */
export function buildWfFeedbackInstruction(ctx) {
  const { project, workId, team, userText, attachBlock, fbWarn, fbLines, fbCount, copy } = ctx;
  const P = project;
  const W = workId;
  // 0.1.34 — **첫머리 한 줄**이다. 세션이 절차를 읽기 전에 "사람이 지금 어디를 보고 있는가"를 먼저 안다.
  const openLine = openPageLine(ctx.open);
  const open = normalizeOpenPage(ctx.open);
  const head =
    `[와이어프레임 피드백 반영] project=${P} team=${team || "?"} work_id=${W}\n` +
    `${openLine}\n` +
    `사용자: ${userText || "(선택한 댓글 참고)"}\n` +
    (attachBlock || "") +
    (fbWarn || "");

  // ── ③ 보류 — 사본이 **없거나**(강제 위반) 사본 여부를 확정하지 못했다. **쓰기 금지**(정본 폴백 없음). ──
  if (copy?.state === "unknown" || copy?.state === "none") {
    const unknown = copy.state === "unknown";
    const refs = (ctx.fbRefs || []).join(", ");
    const headline = unknown
      ? `이 프로젝트에 **작업용 사본(working copy)이 있는지 확인하지 못했습니다**`
      : `이 화면에는 **작업용 사본(working copy)이 없습니다**`;
    const reason = unknown
      ? copy.reason || "작업용 사본 상태 조회 실패"
      : "작업용 사본 없음 — 댓글 반영은 사본에서만 합니다(정본 직접 작업 금지)";
    const why = unknown
      ? `— 왜 멈추는가: 사본이 있는데 정본(원본 페이지·PLM 문서)에 쓰면 **리뷰어가 승인 전에 사본 내용을 정본으로\n` +
        `  읽게 됩니다**. 확인되지 않은 상태에서 정본을 건드리는 쪽으로 진행하지 않습니다(안전 실패).\n\n`
      : `— 왜 멈추는가: **댓글 반영은 작업용 사본에서만** 합니다(관리자 확정). 정본(원본 페이지·PLM 문서)을 바로\n` +
        `  고치면 검토·승인 절차 없이 변경이 정본에 들어갑니다. 사본이 없으면 반영할 자리가 없는 것이므로 멈춥니다.\n\n`;
    const todo = unknown
      ? `     (예: 작업용 사본 조회 실패 — 권한/서버 확인 필요. 확인 후 같은 댓글을 다시 보내주세요.)\n`
      : `     **첫 줄에 다음 문장을 그대로** 적으세요: ${NO_COPY_REPLY}\n`;
    const settle = unknown ? `보류 — ${reason.replace(/"/g, "'")}` : NO_COPY_REPLY.replace(/"/g, "'");
    return (
      `[와이어프레임 피드백 반영 — 보류] project=${P} team=${team || "?"} work_id=${W}\n` +
      `${openLine}\n` +
      `사용자: ${userText || "(선택한 댓글 참고)"}\n` +
      `대상: ${refs || "(ref 미상)"} (${fbCount}건)\n\n` +
      `⛔ **작업을 시작하지 마세요.** ${headline}.\n` +
      `   사유: ${reason}\n\n` +
      why +
      `— ⛔ 이 작업에서 **금지**(하나도 실행하지 마세요):\n` +
      `  · \`wfanno.py render\` / \`sync\` / \`extract\` (penpot·명세·PLM 본문을 씁니다)\n` +
      `  · penpot update-file 계열 호출 · 목업 생성 스크립트 · PLM 본문 put_doc/import\n` +
      `  (읽기 전용 조사 — 명세 파일 열람·doc_get·get-file — 는 해도 됩니다. **쓰기만** 금지입니다.)\n\n` +
      `— 지금 할 일(둘 다 하세요):\n` +
      `  ① message(kind="result", thread="wireframe:${P}", work_id="${W}") 로 사람에게 사유와 필요한 조치를 알립니다.\n` +
      todo +
      `  ② report(work_id="${W}", ok=false, result="${settle}")\n` +
      `     ⚠ \`reason\` 인자는 **쓰지 마세요** — reason이 있으면 blocked가 되어 댓글이 '보내는 중'에 갇힙니다.\n` +
      `     reason 없이 ok=false 로 끝내면 댓글이 **'할 일'로 되돌아가** 사람이 다시 고를 수 있습니다.`
    );
  }

  // ── ① 사본 있음 — 사본 페이지에서만 작업 · PLM 정본 push 금지 ─────────────────────────────
  if (copy?.state === "copy") {
    const PG = copy.page;
    const SD = stageDir(PG);
    // ── 열어둔 페이지 ↔ 작업 대상 사본의 **대조**(0.1.34) ────────────────────────────────
    // 우선순위는 ①열어둔 페이지 → ②고른 댓글의 페이지다. 여기서는 그 결과를 **사람이 오해하지 않게**
    // 말한다: 사용자가 보던 자리와 작업할 자리가 다르면 그 사실을 지시문과 회신 양쪽에 남긴다.
    const openNote = (() => {
      if (!open) return `  · **열린 페이지 미상** — 대상 사본은 **고른 댓글의 페이지**로 정했습니다(사용자가 어디를 보고 있었는지는 알 수 없습니다).\n`;
      const nm = open.name ? ` \`${open.name}\`` : "";
      if (copy.alt)
        return (
          `  · ⚠ **열어둔 페이지와 고른 댓글이 서로 다른 사본을 가리킵니다.** 우선순위(①열어둔 페이지 → ②고른 댓글)에 따라\n` +
          `    **열어둔 쪽**(page=${PG}${copy.label ? ` "${copy.label}"` : ""})에서 작업합니다 — 댓글이 가리킨 사본은 page=${copy.alt.page}` +
          `${copy.alt.label ? ` "${copy.alt.label}"` : ""}입니다. **회신에 이 사실을 반드시 적으세요.**\n`
        );
      if (open.role === "canonical")
        return (
          `  · ⚠ 사용자는 **정본**${nm}(page=${open.page})을 보고 있었고, 이 작업은 **작업용 사본**(page=${PG})에서 합니다\n` +
          `    (댓글 반영은 사본에서만 — 관리자 확정). 사용자가 보던 화면은 지금 바뀌지 않으므로 **회신에 그 사실을 적으세요.**\n`
        );
      if (open.role === "archived")
        return (
          `  · ⚠ 사용자는 **보관본**(이전 정본)${nm}(page=${open.page})을 보고 있었습니다 — 작업은 **사본**(page=${PG})에서 합니다.\n` +
          `    보관본은 지나간 자리라 무엇을 해도 반영되지 않습니다. **회신에 그 사실을 적으세요.**\n`
        );
      if (open.role === "working")
        return open.page === String(PG)
          ? `  · 열어둔 페이지가 곧 **이 작업의 사본**입니다(page=${PG}) — 사용자가 보고 있는 그 자리에서 작업합니다.\n`
          : `  · ⚠ 열어둔 사본(page=${open.page})과 이 작업의 사본(page=${PG})이 **다릅니다**(다른 파일·다른 화면일 수 있습니다).\n` +
            `    작업은 page=${PG}에서 합니다. **회신에 이 사실을 적으세요.**\n`;
      return `  · 열어둔 페이지(page=${open.page})의 역할을 판정하지 못했습니다 — 작업 대상 사본은 아래 page=${PG}입니다.\n`;
    })();
    const replyLine = openPageReplyLine(open, PG);
    return (
      head +
      `\n★ **작업용 사본(working copy)이 있습니다** — page=\`${PG}\`${copy.label ? ` "${copy.label}"` : ""}` +
      `${copy.file ? ` · file=${copy.file}` : ""}${copy.clonedThreads ? ` · 복제 스레드 ${copy.clonedThreads}건` : ""}\n` +
      openNote +
      `  이 작업은 **사본 페이지 안에서만** 수행합니다. 원본(정본) 페이지와 **PLM 정본 문서는 건드리지 않습니다**.\n` +
      `  · penpot을 만지는 명령은 **예외 없이 \`--page ${PG}\`** 를 붙입니다. 빼면 원본 페이지를 덮거나(단일 페이지 파일)\n` +
      `    실행이 거부됩니다(다중 페이지 — plm-hub 0.6.21). **원본 페이지 id를 --page에 넣지 마세요.**\n` +
      `  · SAE 명세는 **스테이징(\`${SD}\`)** 에만 씁니다. 정본 명세(\`.ouroboros/docs/wireframes/WF-*.json\`)는\n` +
      `    **읽기만** 하고 고치지도 커밋하지도 않습니다 — 그 파일이 프로젝트 SSOT라 고치는 순간 승격 없이도\n` +
      `    정본에 반영됩니다(이후 wfscan이 그 명세로 정본 PLM 본문을 보강하거나, 사본을 버리면 다음 render가\n` +
      `    정본 penpot 페이지에 그대로 그립니다). 승격 뒤 정본으로 옮기는 것은 관리자의 \`stage-apply\`입니다.\n` +
      `  · **PLM 본문 push(\`wfanno.py sync\`)는 이 작업에서 실행하지 않습니다.** 사본 내용은 관리자가 대시보드에서\n` +
      `    **[승격(promote)]** 할 때 정본에 반영됩니다. 지금 밀면 리뷰어가 승인 전 사본 내용을 정본으로 읽습니다.\n` +
      `\n— 이것은 **penpot 댓글 피드백을 사본 페이지에 반영**하는 요청입니다. **SAE 명세와 목업 도형을 둘 다**\n` +
      `  고칩니다 — "카드가 크다 / 툴바를 위로" 처럼 **그림**을 가리키는 지적은 ③-c 에서 사본 페이지의\n` +
      `  **목업 도형을 실제로 교체**하세요(설명만 최신이고 그림은 그대로면 반영한 것이 아닙니다).\n` +
      `  ⛔ 단 **penpot 파일·화면을 새로 만드는 것은 여전히 금지**입니다 — 새 파일에는 기존 댓글·핀이 따라오지\n` +
      `  않아 목업과 영구히 분리됩니다. **새 파일 금지 ≠ 목업 수정 금지**: 사본 페이지(page=${PG}) 안에서\n` +
      `  **제자리 교체**만 합니다. 아래 ${fbCount}건이 **이번 작업의 전부**이며, 추가 댓글을 스스로 수집하지 마세요.\n\n` +
      fbLines +
      `\n\n` +
      `— 반영 절차(**사본 모드** · SAE 명세가 SSOT · 목업·주석 패널은 그 명세를 그린 결과물):\n` +
      `  ⓪ **워킹트리 최신화(필수)**: \`git pull --rebase\` — 명세는 git 추적 파일이고 다른 세션이 이미 고쳤을 수\n` +
      `     있습니다. 낡은 명세로 render 하면 **남의 반영을 캔버스에서 지웁니다**(패널 전체 교체).\n` +
      `     반영을 마친 뒤 **스테이징(\`${SD}\`)만** 커밋하세요. 정본 명세(\`docs/wireframes/WF-*.json\`)는\n` +
      `     이 작업에서 **수정도 커밋도 하지 않습니다**(승격 없이 정본이 갱신되는 유일한 구멍입니다).\n` +
      `  ① **명세 확보**: 스테이징 \`${SD}/WF-<CODE>.json\`을 씁니다.\n` +
      `     · 스테이징에 파일이 없으면 정본 명세 \`.ouroboros/docs/wireframes/WF-<CODE>.json\`을 **복사해** 시작합니다\n` +
      `       (정본은 읽기만 — \`cp\`로 가져오고 원본은 그대로 둡니다).\n` +
      `     · 정본 명세도 없으면(penpot에만 알맹이가 있는 화면) 먼저\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py extract --project ${P} --code WF-<CODE> --page ${PG} --no-plm --sae-dir ${SD}\n` +
      `       로 **사본 페이지**의 주석 패널을 스테이징으로 역추출합니다(penpot 읽기 전용 · \`--no-plm\`이라\n` +
      `       PLM 정본 문서를 건드리지 않고, \`--sae-dir\`이라 정본 명세도 건드리지 않습니다).\n` +
      `     명세 없이 render 하면 **아무 일도 일어나지 않고 조용히 끝납니다**.\n` +
      `  ② **대상 요소 특정**: 피드백이 가리키는 요소(<CODE>.NN)를 정합니다. 본문만으로 애매하면 penpot get-file로\n` +
      `     그 프레임의 x/y/width/height를 읽어 핀 절대좌표를 프레임 기준 상대 위치로 환산하세요(wfanno.py \`_frames()\` 방식).\n` +
      `     그래도 애매하면 **추측하지 말고 그 항목을 '미반영'으로 남기고 사유에 질문을 적으세요**(⑦).\n` +
      `     본문의 \`@[<uuid>]\`는 penpot 멘션 원문입니다 — 사람 이름이 아니니 무시하세요.\n` +
      `  ③ **명세 수정**: 요소 추가/수정, 상태·액션·이펙트 갱신. 화면 수준 의견은 note에.\n` +
      `     ⚠ 고치는 파일은 \`${SD}/WF-<CODE>.json\` **하나뿐**입니다(정본 명세 파일은 편집 금지).\n` +
      `  ③-b **쓰기 직전 재확인(필수 · 첫 쓰기 바로 앞에서 1회)**:\n` +
      `        ${recheckCommand(P, PG)}\n` +
      `     → \`✔ ok\`가 아니면 **그 자리에서 멈춥니다**(render·update-file·put_doc 등 쓰기 전면 금지).\n` +
      `     ⚠ 왜: 이 작업을 넘길 때 사본 상태를 **한 번만** 봤습니다. 그사이 관리자가 [정본으로 올리기]를\n` +
      `       했다면 위 page는 이제 **정본**이고, 그대로 render 하면 검토 없이 정본이 바뀝니다.\n` +
      `     멈춘 경우 두 가지만 하세요(①을 먼저):\n` +
      `       · message(kind="result", thread="wireframe:${P}", work_id="${W}") 첫 줄에 그대로:\n` +
      `         ${recheckAbortReply("promoted")}\n` +
      `       · report(work_id="${W}", ok=false, result="<위 문장>") — \`reason\` 인자는 **쓰지 마세요**\n` +
      `         (reason이 있으면 blocked가 되어 댓글이 '보내는 중'에 갇힙니다).\n` +
      `     ※ 실제 사유는 명령 출력의 \`⛔ 중단 — …\` 문장을 그대로 옮겨 적으세요(승격/버려짐/조회실패).\n` +
      `  ③-c **목업 도형 제자리 수정(그림을 가리키는 지적이 하나라도 있으면 필수)**:\n` +
      `     쓰는 페이지는 오직 **page=${PG}**(사본). 정본 페이지·정본 파일은 여기서도 무접촉입니다.\n` +
      `     ⛔ \`wfgen.py\`는 실행하지 마세요 — \`main()\`이 **무조건 \`create-file\`(새 파일)** 이고 제자리 갱신\n` +
      `       옵션(\`--page\`/\`--file\`)이 **없습니다**. 실행하면 새 파일이 생겨 댓글·핀과 분리됩니다.\n` +
      `     대신 **모듈 재사용 + penpot change-ops 직접 조립**으로 바꿉니다\n` +
      `     (\`python3\` 한 번 · \`sys.path.insert(0, "plugin/plm-hub/scripts")\` 뒤 \`import wfgen, wfanno\`):\n` +
      `       ⒜ \`cfg, _p, _s = wfanno._resolve_ctx("${P}", "${SD}")\` → base=\`cfg["penpot_api"]\` · tok=\`cfg["penpot_token"]\`\n` +
      `          \`revn, vern, pages = wfanno._load_pages(base, tok, "${copy.file || "<file>"}")\` → **page=${PG}** 인 항목의 objects,\n` +
      `          \`frames = wfanno._frames(objs)\` → \`fr = 그 중 code == "<CODE>"\` 인 프레임.\n` +
      `       ⒝ \`wfanno.screen_boards(fr, frames)\` = 이 화면의 board 전량(본체 + \`<CODE>-A\`·\`-Z\` 보조 board).\n` +
      `          각 board 와 **그 자손 전부**(\`obj["shapes"]\` 재귀)를 \`del-obj\`(pageId=${PG})로 모읍니다\n` +
      `          — penpot 은 자식을 자동 삭제하지 않습니다(부모만 지우면 고아 도형이 남습니다).\n` +
      `       ⒞ **③에서 고친 스테이징 명세**로 다시 그립니다(명세가 SSOT — 손으로 도형을 짜지 마세요):\n` +
      `            name, route, covers, els, spec_arch, note = wfgen.load_screen("${SD}", "<CODE>")\n` +
      `            arch = wfgen.pick_archetype("<CODE>", els, None, spec_arch)\n` +
      `            screens, miss = wfgen.build_screens("${PG}", "<CODE>", name, route, covers, els, fr["x"], arch, warn=False)\n` +
      `          → 각 \`s.finalize()\` 가 그 board 의 \`add-obj\` 목록입니다(\`miss\` 가 있으면 \`<CODE>-Z\` 보조 board 포함).\n` +
      `       ⒟ **board id 재사용(필수)**: 새 board id를 **옛 board id로 치환**하세요(이름 head가 같은 것끼리 ·\n` +
      `          ops를 JSON 문자열로 만들어 치환하면 충분). 댓글 스레드의 \`frame-id\`, PLM \`wireframe_frames\`,\n` +
      `          아티팩트 \`loc: penpot:<file>:<frame>\` 이 **전부 그 id**를 가리킵니다 — 새 id로 갈아치우면\n` +
      `          그 화면 댓글이 **미매핑으로 떨어지고** 추적성이 끊깁니다.\n` +
      `       ⒠ **y 보정**: 아키타입 빌더는 언제나 y=0 에 그립니다 → 옛 프레임의 \`fr["y"]\` 만큼 내리세요\n` +
      `          (\`obj["y"]\` · \`selrect\`의 y/y1/y2 · \`points[].y\` **세 곳 전부** — 하나라도 빠지면 히트영역이 어긋납니다).\n` +
      `       ⒡ **겹침 사전 검사(쓰기 전 · 필수)**: 새 board 사각형 + **④에서 다시 앉을 주석 패널** 사각형\n` +
      `          (\`wfanno.panel_anchor(새 fr, 새 frames)\` → \`wfanno.build_anno_panel(...)\` 반환의 panel_x·panel_w·panel_h)\n` +
      `          을 이 페이지의 **다른 루트 객체**(이웃 board·남의 \`anno:*\` 패널)와 교차 검사하세요\n` +
      `          (자기 화면의 옛 \`anno:<CODE>\` 는 ④가 교체하므로 제외). **하나라도 겹치면 쓰지 마세요** —\n` +
      `          ⓐ 세로로만 커졌으면 그대로 진행 가능한지 다시 계산하고, ⓑ 이웃을 침범하면 그 항목을\n` +
      `          '미반영'(사유: 목업 확대로 이웃 화면 침범 — 재배치는 사람 판단 필요)으로 남기세요.\n` +
      `          **이웃 board 를 옮겨서 자리를 만드는 것은 금지**입니다(남의 화면 댓글 핀이 어긋납니다).\n` +
      `       ⒢ **한 커밋**: \`wfgen.penpot_rpc(base, tok, "update-file", {"id":…, "revn":…, "vern":…,\n` +
      `          "sessionId": wfgen._uid(), "changes": [ …del-obj 전부, …add-obj 전부 ]})\`\n` +
      `          — del 과 add 를 **반드시 같은 \`changes\` 배열**에 담습니다. 나눠 보내면 중간 실패 시 프레임이\n` +
      `          **사라진 채로 남고** 댓글 핀만 허공에 뜹니다(부분 적용 금지).\n` +
      `       ⒣ **직후 검증**: \`get-file\` 재조회로 그 페이지에 \`<CODE>\` board 가 **정확히 1개**이고 자식 수가\n` +
      `          기대와 같은지 확인하세요. board 가 없거나 2개면 **id 재사용이 먹지 않은 것**입니다 —\n` +
      `          그 자리에서 멈추고(추가 쓰기 금지) 사람에게 알리세요. **새 id로 강행하지 마세요.**\n` +
      `     그림을 바꿀 필요가 없는 항목(문구·상태·이펙트만 지적)은 ③까지로 충분합니다 — 억지로 다시 그리지 마세요.\n` +
      `  ④ **사본 페이지 주석 패널 재렌더(in-place · ③-c 뒤에 실행)**:\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${P} --code WF-<CODE> --page ${PG} --expect-page-role working --sae-dir ${SD}\n` +
      `     ⚠ \`--sae-dir ${SD}\`를 빼면 **정본 명세**를 읽어 그립니다 — 이번 수정이 반영되지 않습니다.\n` +
      `     ⚠ \`--expect-page-role working\`을 빼지 마세요 — 이 플래그가 **쓰기 직전에 한 번 더** 사본 여부를\n` +
      `       확인해, ③-b 이후에 승격이 일어나도 update-file 전에 멈춥니다(중단 시 exit 3 · 아무것도 안 씀).\n` +
      `     → 사본 페이지 안에서 \`anno:<CODE>\` 그룹만 교체(비파괴·멱등). 하이파이 프레임·댓글 핀은 건드리지 않습니다.\n` +
      `     ⚠ **③-c 를 했으면 ④는 필수이고 순서도 ③-c → ④ 입니다.** 패널은 프레임 **우변 기준**으로 앉기 때문에\n` +
      `       목업 크기가 바뀌면 패널 자리도 바뀝니다. 반대로 하면 패널이 옛 폭 기준에 남아 새 목업을 덮습니다.\n` +
      `     ⚠ \`--page ${PG}\`를 **절대 빼지 마세요** — 빼면 원본(정본) 페이지를 덮칠 수 있습니다.\n` +
      `     ⚠ **출력을 반드시 읽으세요.** \`✖ update-file 실패(비차단)\`가 찍히면 **실패한 것입니다**(스크립트는 실패해도 exit 0).\n` +
      `       원인 대부분은 그 파일을 누가 penpot 에디터로 열고 있어 revn이 밀린 것 — 10초 뒤 1회 재시도하고,\n` +
      `       또 실패하면 그 항목을 '미반영'(사유: penpot 편집 중 충돌)으로 남기세요.\n` +
      `     ⚠ **화면이 여러 개면 \`--code\`를 화면마다 따로** 줍니다(단수 인자 · 파일당 1회 update-file · 부분 성공 가능).\n` +
      `  ④-b **렌더 자기검증(필수 · 중복 패널 탐지)**:\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${P} --code WF-<CODE> --page ${PG} --dry-run --sae-dir ${SD}\n` +
      `     → 출력의 \`기존삭제 N\`이 **정확히 한 세트**여야 합니다. 다른 세션이 같은 페이지를 동시에 렌더했으면 옛 패널과\n` +
      `       새 패널이 겹쳐 쌓여 N이 2배 이상으로 잡힙니다. 그 경우 render를 한 번 더 실행해 수렴시키고(멱등),\n` +
      `       그래도 안 맞으면 '미반영'(사유: 동시 렌더 충돌)으로 남기고 사람에게 알리세요.\n` +
      `  ④-c **변경 칩 부착(그림이나 명세를 실제로 고친 화면마다 · ④-b 통과 뒤)**:\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py mark --project ${P} --code WF-<CODE> --page ${PG} --expect-page-role working \\\n` +
      `                --items "<바뀐 요소 번호들 · 예: 12,13>"\n` +
      `     → 그 프레임 위에 \`✱ 반영됨 · MM-DD · <CODE>.12, <CODE>.13\` 칩이 붙습니다(\`chg:<CODE>\` 그룹 · 멱등).\n` +
      `     ⚠ 왜 필요한가: 사람이 사본을 열었을 때 **어느 프레임이 바뀌었는지** 알 수 있는 표시가 캔버스에\n` +
      `       없습니다(주석 패널은 모든 프레임에 항상 있으니 신호가 못 됩니다). 회신 글만으로는 캔버스에서\n` +
      `       바뀐 화면을 찾을 수 없습니다.\n` +
      `     · \`--items\` 는 **실제로 바뀐 요소만** 적으세요(⑦의 \`목업변경:\` 줄과 같은 목록). 번호만 줘도 됩니다.\n` +
      `     · 출력에 \`⚠ … 붙이지 않음 — 위·안쪽 모두 침범\`이 찍히면 **정상 동작**입니다(이웃을 밀어내지 않습니다).\n` +
      `       그 화면은 칩 없이 두고, 회신에 \`칩 미부착: <CODE>(이웃 침범)\`을 한 줄 덧붙이세요.\n` +
      `     · 그림·명세를 하나도 안 바꾼 화면에는 붙이지 마세요(칩이 흔해지면 신호가 죽습니다).\n` +
      `     · 칩은 **사본 페이지 안의 표시**라 정본 무접촉입니다. 승격 뒤 정리는 관리자 몫입니다(⑤).\n` +
      `  ⑤ **PLM 본문·정본 명세 갱신 — 이 작업에서는 하지 않습니다(사본 모드)**.\n` +
      `     \`wfanno.py sync\`는 PLM **정본** 본문을 밉니다. 승인 전에 밀면 리뷰어가 사본 내용을 정본으로 읽게 되므로\n` +
      `     **실행하지 마세요**(0.6.24부터는 도구도 사본 페이지에서 정본 push를 스스로 거부합니다).\n` +
      `     정본 반영 절차는 관리자 몫입니다: 대시보드 **[정본으로 올리기]** → \n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py stage-apply --project ${P} --page ${PG}\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py sync --project ${P} --page ${PG}\n` +
      `        python3 plugin/plm-hub/scripts/wfanno.py mark --clear --project ${P} --page ${PG}\n` +
      `     (마지막 줄은 ④-c 의 변경 칩을 걷어냅니다 — 승격되면 그 페이지가 정본이라 "반영됨" 표시가\n` +
      `      남아 있으면 다음 리뷰어가 무엇이 새로 바뀐 것인지 오해합니다.)\n` +
      `     (stage-apply는 승격된 뒤에만 동작합니다 — 스테이징 명세를 정본 자리로 옮깁니다.\n` +
      `      ⚠ \`sync\`의 \`--page ${PG}\`를 빼지 마세요 — 승격 뒤에도 옛 정본이 \`보관 · …\`로 파일에 남아\n` +
      `      **파일이 영구히 2페이지 이상**이라 --page 없는 sync는 항상 실행 거부됩니다. 승격은 페이지 uuid를\n` +
      `      바꾸지 않으므로 **새 정본 page uuid = 위 사본 page uuid**로 같습니다.)\n` +
      `     대시보드 **[보관 완료]** 를 먼저 눌러도 위 두 명령은 그대로 동작합니다(마감 = 되돌리기 창을\n` +
      `     닫는 것일 뿐 승격 사실을 취소하지 않습니다 — plm-hub 0.6.25부터).\n` +
      `  ⑥ **렌더 검증**: get-file→SVG→PNG로 **사본 페이지**의 패널이 프레임 우측에 갱신됐는지 눈으로 확인.\n` +
      `  ⑦ **항목별 회신(사람용)**: message(kind="result", thread="wireframe:${P}", work_id="${W}")로\n` +
      `     **첫 줄에 반드시** 다음 문장을 그대로 적으세요:\n` +
      `        ${notPromotedNotice(PG)}\n` +
      (replyLine
        ? `     그리고 **둘째 줄에** 다음 문장도 그대로 적으세요(사용자가 보던 화면과 작업한 자리가 다릅니다):\n` +
          `        ${replyLine}\n`
        : "") +
      `     그 다음 줄에 **그림이 실제로 바뀐 요소 목록**을 한 줄로 적으세요(③-c 결과 · 이 줄은 생략 불가):\n` +
      `        목업변경: LIST.03 카드 축소, LIST.04 정렬 툴바 상단 이동\n` +
      `     그림을 하나도 바꾸지 않았다면 \`목업변경: 없음(명세만)\` 이라고 **명시**하세요 — 이 줄이 없으면 사람은\n` +
      `     설명만 최신인지 그림도 바뀌었는지 알 수 없습니다(이번 개선의 핵심입니다).\n` +
      `     그 다음 줄부터 \`c1234 반영: 정렬 툴바 LIST.07 추가 / c1247 미반영: 이웃 화면 침범\` 형태로 한 줄씩.\n` +
      `     (이건 사람이 읽는 용도입니다. 상태를 바꾸는 것은 아래 report의 result뿐입니다.)\n\n` +
      `— ⛔ **penpot 파일·화면을 새로 만들지 마세요**(목업 생성 스크립트 \`wfgen.py\` 실행 금지). 그 스크립트는 실행할\n` +
      `  때마다 \`create-file\` 로 **새 파일**을 만듭니다(제자리 갱신 경로 없음). 실행하면 기존 댓글·핀이 옛 파일에\n` +
      `  남아 목업과 분리되고, 화면코드 충돌로 새 파일이 버려져 아무 데도 연결되지 않습니다.\n` +
      `  **목업 도형 자체(레이아웃·요소 배치)를 바꿔야 하는 항목은 ③-c 로 사본 페이지에서 제자리 교체**하세요.\n` +
      `  ③-c 로도 안 되는 경우(겹침 검사에서 이웃 침범 · 화면 여러 개를 한꺼번에 재배치해야 함 · board id 재사용\n` +
      `  검증 실패)에만 그 항목을 '미반영'으로 남기고 사유에 그 사실을 적으세요.\n\n` +
      `— 완료 처리(중요 · **정산 형식을 반드시 지킬 것**):\n` +
      `  report(work_id="${W}", ok=true, result="<요약>\\n반영: …\\n미반영: … — 사유") 를 **정확히 한 번** 호출하세요.\n` +
      `  이 호출만이 댓글 상태를 바꿉니다. 호출하지 않으면 댓글이 '보내는 중'에 갇힙니다.\n` +
      `  ★ result의 **<요약> 첫 줄**에도 위 ⑦의 문장을 그대로 넣으세요(정본 미반영 사실이 정산에 남아야 합니다).\n` +
      (replyLine ? `  ★ 그 아래 줄에 ⑦의 둘째 문장(열어둔 페이지 ≠ 작업한 사본)도 그대로 넣으세요.\n` : "") +
      `  ★ result 에도 \`목업변경:\` 줄을 ⑦과 **똑같이** 넣으세요 — 정산 이력만 봐도 **그림이 실제로 바뀌었는지**\n` +
      `    알 수 있어야 합니다(서버 정산 파서는 \`반영:\`/\`미반영:\` 두 줄만 읽으므로 이 줄은 형식과 충돌하지 않습니다).\n` +
      `  ★ 두 목록은 **report의 result 인자** 안에 넣습니다(message 본문이 아닙니다 — 서버는 report.result만 파싱).\n` +
      `    형식(라인 선두 · \`c\`/\`u\` 접두 필수 · 두 줄 다 쓰세요):\n` +
      `        반영: c1234, c1250\n` +
      `        미반영: c1247, u345 — 목업 재배치 필요 / 대상 화면 불명확\n` +
      `  ★★ **\`반영:\` 줄에 적지 않은 항목은 '완료'가 되지 않고 '보류'로 남습니다**(사유: 세션 회신에 누락).\n` +
      `     ${fbCount}건을 받았으면 ${fbCount}건 전부가 \`반영:\` 또는 \`미반영:\` 어느 한쪽에 있어야 합니다.\n` +
      `  실패로 끝나면 report(ok=false) — 해당 댓글은 '할 일'로 되돌아가 다시 고를 수 있습니다.\n` +
      `  이 work_id를 **이미 처리한 적이 있다면 재실행하지 말고 report만 다시 시도**하세요(재배달 방지).\n` +
      `  애매한 항목은 **질문하지 말고 '미반영'으로 남기고 사유에 질문을 적으세요**(사람이 목록에서 사유를 읽고 판단).\n` +
      `  정말 전체를 막는 근본 질문일 때만 message(kind="question")로 묻고 턴을 종료하되, **답을 받은 뒤에는 반드시\n` +
      `  원래 work_id="${W}"로 report** 하세요(그래야 댓글이 닫힙니다).`
    );
  }

  // ── ② 사본 없음 — [원본] 0.1.25까지의 **정본 직접 작업** 분기 ────────────────────────────
  //
  // 관리자 확정(2026-07-31): "댓글 반영은 무조건 사본 만들고 진행해야 해. 옵션이 아닌 강제야."
  // → 이 분기(정본을 그대로 고치고 `wfanno.py sync --force`로 PLM 정본 본문까지 미는 경로)는
  //   **더 이상 도달하지 않는다**. state==="none"은 위 ③에서 보류로 끝난다.
  // 원복 시: 위 ③의 `|| copy?.state === "none"` 조건을 지우고 아래 주석 블록을 해제한다.
  // // ── ② 사본 없음 — 0.1.24 지시문 **그대로**(회귀 0) ────────────────────────────────────────
  // return (
  //   head +
  //   `\n— 이것은 **penpot 댓글 피드백을 SAE 명세에 반영**하는 요청입니다. 화면을 새로 도출하거나 목업 파일을\n` +
  //   `  새로 만드는 작업이 아닙니다. 아래 ${fbCount}건이 **이번 작업의 전부**이며, 추가 댓글을 스스로 수집하지 마세요.\n\n` +
  //   fbLines +
  //   `\n\n` +
  //   `— 반영 절차(SAE 명세가 SSOT · 목업은 렌더 결과물):\n` +
  //   `  ⓪ **워킹트리 최신화(필수)**: \`git pull --rebase\` — 명세(\`.ouroboros/docs/wireframes/*.json\`)는 git 추적 파일이고\n` +
  //   `     다른 세션이 이미 고쳤을 수 있습니다. 낡은 명세로 render 하면 **남의 반영을 캔버스에서 지웁니다**(패널 전체 교체).\n` +
  //   `     반영을 마친 뒤 반드시 **커밋**하세요(안 하면 다음 세션이 같은 사고를 냅니다).\n` +
  //   `  ① **명세 확보**: 각 항목의 \`.ouroboros/docs/wireframes/WF-<CODE>.json\`을 엽니다.\n` +
  //   `     ⚠ 파일이 없으면(penpot에만 알맹이가 있는 화면) 먼저\n` +
  //   `        python3 plugin/plm-hub/scripts/wfanno.py sync --project ${P} --code WF-<CODE>\n` +
  //   `     로 penpot 주석 패널을 역추출해 명세를 만든 뒤 진행합니다. 명세 없이 render 하면 **아무 일도 일어나지 않고\n` +
  //   `     조용히 끝납니다**("렌더 대상 프레임 없음(로컬 명세 매칭 0)").\n` +
  //   `  ② **대상 요소 특정**: 피드백이 가리키는 요소(<CODE>.NN)를 정합니다. 본문만으로 애매하면 penpot get-file로\n` +
  //   `     그 프레임의 x/y/width/height를 읽어 핀 절대좌표를 프레임 기준 상대 위치로 환산하세요(wfanno.py \`_frames()\` 방식).\n` +
  //   `     그래도 애매하면 **추측하지 말고 그 항목을 '미반영'으로 남기고 사유에 질문을 적으세요**(⑦).\n` +
  //   `     본문의 \`@[<uuid>]\`는 penpot 멘션 원문입니다 — 사람 이름이 아니니 무시하세요.\n` +
  //   `  ③ **명세 수정**: 요소 추가/수정, 상태·액션·이펙트 갱신. 화면 수준 의견은 note에.\n` +
  //   `  ④ **penpot 주석 패널 재렌더(in-place)**:\n` +
  //   `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${P} --code WF-<CODE>\n` +
  //   `     → 기존 파일 안에서 \`anno:<CODE>\` 그룹만 교체(비파괴·멱등). 하이파이 프레임·댓글 핀은 건드리지 않습니다.\n` +
  //   `     ⚠ **출력을 반드시 읽으세요.** \`✖ update-file 실패(비차단)\`가 찍히면 **실패한 것입니다**(스크립트는 실패해도 exit 0).\n` +
  //   `       원인 대부분은 그 파일을 누가 penpot 에디터로 열고 있어 revn이 밀린 것 — 10초 뒤 1회 재시도하고,\n` +
  //   `       또 실패하면 그 항목을 '미반영'(사유: penpot 편집 중 충돌)으로 남기세요.\n` +
  //   `     ⚠ **화면이 여러 개면 \`--code\`를 화면마다 따로** 줍니다(단수 인자 · 파일당 1회 update-file · 부분 성공 가능).\n` +
  //   `  ④-b **렌더 자기검증(필수 · 중복 패널 탐지)**:\n` +
  //   `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${P} --code WF-<CODE> --dry-run\n` +
  //   `     → 출력의 \`기존삭제 N\`이 **정확히 한 세트**여야 합니다. 다른 세션이 같은 파일을 동시에 렌더했으면 옛 패널과\n` +
  //   `       새 패널이 겹쳐 쌓여 N이 2배 이상으로 잡힙니다(update-file이 "성공"으로 끝나도 그렇습니다). 그 경우 render를\n` +
  //   `       한 번 더 실행해 수렴시키고(멱등), 그래도 안 맞으면 '미반영'(사유: 동시 렌더 충돌)으로 남기고 사람에게 알리세요.\n` +
  //   `  ⑤ **PLM 본문 갱신**:\n` +
  //   `        python3 plugin/plm-hub/scripts/wfanno.py sync --project ${P} --code WF-<CODE> --force\n` +
  //   `     ⚠ \`wfscan.py\`로는 갱신되지 않습니다 — 이미 표가 있는 본문을 비파괴 스킵합니다. \`--force\`가 필수입니다.\n` +
  //   `  ⑥ **렌더 검증**: get-file→SVG→PNG로 패널이 프레임 우측에 갱신됐는지 눈으로 확인.\n` +
  //   `  ⑦ **항목별 회신(사람용)**: message(kind="result", thread="wireframe:${P}", work_id="${W}")로\n` +
  //   `     \`c1234 반영: 정렬 툴바 LIST.07 추가 / c1247 미반영: 목업 재배치 필요\` 형태로 한 줄씩.\n` +
  //   `     (이건 사람이 읽는 용도입니다. 상태를 바꾸는 것은 아래 report의 result뿐입니다.)\n\n` +
  //   `— ⛔ **목업 생성 스크립트를 이 작업에서 실행하지 마세요.** 그 스크립트는 실행할 때마다 penpot 파일을 **새로 만듭니다**\n` +
  //   `  (create-file 무조건 · in-place 갱신 경로 없음). 실행하면 기존 댓글·핀이 옛 파일에 남아 목업과 분리되고,\n` +
  //   `  화면코드 충돌로 새 파일이 버려져 아무 데도 연결되지 않습니다. **목업 도형 자체(레이아웃·요소 배치)를 바꿔야 하는\n` +
  //   `  항목**은 명세만 고친 뒤 그 항목을 '미반영'으로 남기고 사유에 "목업 재생성 필요(관리자 승인 필요)"라고 적으세요.\n\n` +
  //   `— 완료 처리(중요 · **정산 형식을 반드시 지킬 것**):\n` +
  //   `  report(work_id="${W}", ok=true, result="<요약>\\n반영: …\\n미반영: … — 사유") 를 **정확히 한 번** 호출하세요.\n` +
  //   `  이 호출만이 댓글 상태를 바꿉니다. 호출하지 않으면 댓글이 '보내는 중'에 갇힙니다.\n` +
  //   `  ★ 두 목록은 **report의 result 인자** 안에 넣습니다(message 본문이 아닙니다 — 서버는 report.result만 파싱).\n` +
  //   `    형식(라인 선두 · \`c\`/\`u\` 접두 필수 · 두 줄 다 쓰세요):\n` +
  //   `        반영: c1234, c1250\n` +
  //   `        미반영: c1247, u345 — 목업 재배치 필요 / 대상 화면 불명확\n` +
  //   `  ★★ **\`반영:\` 줄에 적지 않은 항목은 '완료'가 되지 않고 '보류'로 남습니다**(사유: 세션 회신에 누락).\n` +
  //   `     빠뜨리면 완료로 묻히는 게 아니라 보류로 남습니다 — 안전한 쪽으로 실패합니다.\n` +
  //   `     ${fbCount}건을 받았으면 ${fbCount}건 전부가 \`반영:\` 또는 \`미반영:\` 어느 한쪽에 있어야 합니다.\n` +
  //   `  실패로 끝나면 report(ok=false) — 해당 댓글은 '할 일'로 되돌아가 다시 고를 수 있습니다.\n` +
  //   `  이 work_id를 **이미 처리한 적이 있다면 재실행하지 말고 report만 다시 시도**하세요(재배달 방지).\n` +
  //   `  애매한 항목은 **질문하지 말고 '미반영'으로 남기고 사유에 질문을 적으세요**(사람이 목록에서 사유를 읽고 판단).\n` +
  //   `  정말 전체를 막는 근본 질문일 때만 message(kind="question")로 묻고 턴을 종료하되, **답을 받은 뒤에는 반드시\n` +
  //   `  원래 work_id="${W}"로 report** 하세요(그래야 댓글이 닫힙니다).`
  // );

  // [개선] 도달 불가 — 여기까지 오면 판정이 셋 중 어느 것도 아니다(방어적 보류).
  return buildWfFeedbackInstruction({ ...ctx, copy: { state: "unknown", reason: "작업용 사본 판정 결과를 해석하지 못했습니다" } });
}
