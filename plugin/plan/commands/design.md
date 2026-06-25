---
description: 상위 설계 문서(SAD)를 발급한다 (G2 추적 대상)
argument-hint: "{설계 영역/컴포넌트}"
---

# /design — 설계(SAD) 발급

SAD(Architecture Doc)를 발급한다. 모듈 수준 상세설계(SDS)·코드는 범위 밖 — 상위 설계만.

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/templates/artifact_sad.md` → `.ouroboros/docs/design/SAD-NNN.md`.
2. **`refs: [SRS-...]`**(G2 필수) — 이 설계가 다루는 SRS를 채운다. `component`·Summary 작성.
3. `informed_by`는 적지 않는다(ADR이 `informs`의 owner).
4. ID 채번 = design/ 최대 번호 +1. `created`/`updated`=UTC, `status: Draft`.
5. **자체 점검**: 모든 SAD에 `refs`가 있는지(G2). 참조한 SRS가 실제 존재하는지(dangling 방지). **본문 규칙(아래) 충족**.
6. current.md·state.json 갱신.

## 본문 작성 규칙 (필수 — 한 줄 요약만 쓰지 말 것)
템플릿의 모든 `##` 섹션을 실질 내용으로 채운다. 플레이스홀더·빈 섹션 금지.
- **개요(Summary)**: 상위 설계 의도 2문장+ (모듈 수준 SDS는 범위 밖).
- **컴포넌트/책임**: 각 컴포넌트 → 책임을 bullet로 (≥2).
- **연결**: 다루는 SRS 명시.
- 저장 시 `body-lint` hook이 빈약 본문을 경고한다(비차단).

## 다음 단계
`/decision`(ADR) → `/trace`(G1/G2·orphan·매트릭스).

> 동기화: 거버넌스 백엔드는 **PLM**(plm-hub의 Edit hook `plm-sync`가 `.md` 저장 시 자동 upsert). 일괄은 `/plm-hub:sync`.
