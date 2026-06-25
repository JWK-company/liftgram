---
description: 아키텍처 의사결정 기록(ADR)을 발급한다
argument-hint: "{결정 주제}"
---

# /decision — 의사결정(ADR) 발급

ADR을 발급한다. 맥락·결정·대안·결과를 기록하고 영향 요구/설계에 연결한다.

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/templates/artifact_adr.md` → `.ouroboros/docs/decisions/ADR-NNN.md`.
2. 맥락(Context)·결정(Decision)·근거/대안·결과(Consequences) 작성.
3. **owner relation**: `informs: [SRS-... | SAD-...]`(영향 대상), 기존 결정을 대체하면 `supersedes: ADR-NNN`.
4. 대체 시 기존 ADR은 PLM 대시보드에서 Status→Superseded(전이는 사람이 대시보드에서).
5. ID 채번 = decisions/ 최대 번호 +1. `created`/`updated`=UTC, `status: Draft`.
6. current.md·state.json 갱신.

## 본문 작성 규칙 (필수 — 한 줄 요약만 쓰지 말 것)
템플릿의 모든 `##` 섹션을 실질 내용으로 채운다. 플레이스홀더·빈 섹션 금지.
- **맥락(Context)**: 결정이 필요한 상황·제약 2문장+.
- **결정(Decision)**: 무엇을 택했는지 명확히.
- **근거/대안**: 채택 이유 + 검토한 대안 ≥1(왜 안 택했는지).
- **결과(Consequences)**: 장점·트레이드오프·되돌림 비용.
- 저장 시 `body-lint` hook이 빈약 본문을 경고한다(비차단).

## 다음 단계
`/trace` — 추적·게이트 점검. 회고는 `/reflect`.

> 동기화: 거버넌스 백엔드는 **PLM**(plm-hub의 Edit hook `plm-sync`가 `.md` 저장 시 자동 upsert). 일괄은 `/plm-hub:sync`.
