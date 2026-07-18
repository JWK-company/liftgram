---
description: 상위 설계 문서(SAD)를 발급한다 (G2 추적 대상)
argument-hint: "{설계 영역/컴포넌트}"
---

# /design — 설계(SAD) 발급

SAD(Architecture Doc)를 **JSON 아티팩트(`CODE.json`)** 로 발급한다. 포맷 = `${CLAUDE_PLUGIN_ROOT}/templates/_ARTIFACT-JSON-FORMAT.md`(동형). 모듈 상세설계(SDS)·코드는 범위 밖. **markdown 생성 금지.**

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/templates/artifact_sad.json` → `.ouroboros/docs/design/SAD-NNN.json`.
2. **`relations.refs: ["SRS-…"]`**(G2 필수) — 다루는 SRS. `component` 필드·본문(`doc`) 작성.
3. `informed_by`는 적지 않는다(ADR이 `informs`의 owner).
4. ID 채번 = design/ `*.json` 최대 번호 +1. `created`/`updated`=UTC, `status: "Draft"`, `schemaVersion: 1`.
5. **자체 점검**: 유효 JSON·모든 SAD에 `refs`(G2)·참조 SRS 실존(dangling 방지)·본문 규칙.
6. current.md·state.json 갱신.

## 본문(doc) 작성 규칙 (필수 — 한 줄 요약 금지)
포맷 노드 어휘로 모든 섹션을 실질 내용으로. 플레이스홀더·빈 섹션 금지.
- **개요(Summary)**: 상위 설계 의도 2문장+.
- **컴포넌트/책임**: 각 컴포넌트 → 책임 bullet (≥2).
- **연결**: 다루는 SRS 명시.
- 저장 시 `body-lint` hook이 빈약 본문을 경고(비차단).

## 다음 단계
`/decision`(ADR) → `/trace`(G1/G2·orphan·매트릭스).

> 동기화: plm-sync hook이 `.json` 저장 시 doc·relations를 PLM에 자동 upsert. 일괄은 `/plm-hub:sync`.
