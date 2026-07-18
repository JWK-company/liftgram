---
description: 아키텍처 의사결정 기록(ADR)을 발급한다
argument-hint: "{결정 주제}"
---

# /decision — 의사결정(ADR) 발급

ADR을 **JSON 아티팩트(`CODE.json`)** 로 발급한다. 포맷 = `${CLAUDE_PLUGIN_ROOT}/templates/_ARTIFACT-JSON-FORMAT.md`(동형). **markdown 생성 금지.**

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/templates/artifact_adr.json` → `.ouroboros/docs/decisions/ADR-NNN.json`.
2. 본문(`doc`) = 맥락(Context)·결정(Decision)·근거/대안·결과(Consequences) (heading + paragraph/bullet_list 노드).
3. **owner relation**: `relations.informs: ["SRS-…","SAD-…"]`(영향 대상), 대체 시 `relations.supersedes: "ADR-NNN"`.
4. 대체 시 기존 ADR은 PLM 대시보드에서 Status→Replaced(사람 전이).
5. ID 채번 = decisions/ `*.json` 최대 번호 +1. `created`/`updated`=UTC, `status: "Draft"`, `schemaVersion: 1`.
6. 유효 JSON 자체 점검 후 current.md·state.json 갱신.

## 본문(doc) 작성 규칙 (필수 — 한 줄 요약 금지)
포맷 노드 어휘로 모든 섹션을 실질 내용으로. 플레이스홀더·빈 섹션 금지.
- **맥락(Context)**: 결정이 필요한 상황·제약 2문장+.
- **결정(Decision)**: 무엇을 택했는지 명확히.
- **근거/대안**: 채택 이유 + 검토한 대안 ≥1(왜 안 택했는지).
- **결과(Consequences)**: 장점·트레이드오프·되돌림 비용.
- 저장 시 `body-lint` hook이 빈약 본문을 경고(비차단).

## 다음 단계
`/trace` — 추적·게이트 점검. 회고는 `/reflect`.

> 동기화: plm-sync hook이 `.json` 저장 시 doc·relations를 PLM에 자동 upsert. 일괄은 `/plm-hub:sync`.
