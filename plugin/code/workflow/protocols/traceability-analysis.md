# 프로토콜: 추적성 분석 (Traceability Analysis)

> code 작업을 plan의 아티팩트 추적 백본에 **일관되게** 편입한다. `/spec` Step 2.5에서 실행.
> 목적: 모든 구현이 요구(SRS/SAD)에 연결되고, 코드 위치가 딥링크로 끝까지 추적되도록 보장.

## 단계
1. **상위 아티팩트 해소(resolve)**
   - 작업이 구현하는 요구/설계를 찾는다: `.ouroboros/docs/requirements/SRS-*.md`·`docs/design/SAD-*.md` 또는 PLM(`mcp__plm__search`, `artifact_get`).
   - 키워드·도메인으로 후보를 모으고, 실제 대응 여부를 사람이 판정.

2. **요구 선행 게이트 (G0)** — plan-first 일관성
   | 상황 | 조치 |
   |------|------|
   | 대응 SRS/SAD 있음 | spec 헤더 `추적(implements): SRS-NNN, SAD-NNN` 기재 |
   | 새 동작/기능인데 SRS 없음 | **먼저 `/requirement`로 SRS 발급** 권고(AskUserQuestion). 추적 백본 우선 |
   | 요구 불변(버그픽스·리팩터·문서·빌드, Patch/Task) | **G0 면제** — 단, 영향받는 SRS는 참조로 기재 권장 |

3. **구현 매핑 계획(map)**
   - 작성/수정할 **심볼(함수·클래스·모듈) ↔ 실현 SRS/SAD** 표를 설계.
   - 각 심볼은 구현 시 `@plm <SRS> [<SAD>]` 역링크 주석으로 실현.
   - granularity(system/module/component/function)를 함께 기록 → PLM Code 아티팩트 granularity와 정합.

4. **완료 후 동기**: 구현 끝나면 `/plm-hub:codescan` → Code 아티팩트(`loc:path:line`)·`realizes`·문서 `code_refs` 자동 생성. `/plm-hub:gates`로 G3(구현 갭) 확인.

## 산출
- spec 헤더 `추적(implements)` 라인.
- spec 본문 **"추적 매핑"** 표: `| 심볼/파일 | 실현 SRS/SAD | granularity |`.
- 이 표가 구현·`@plm`·codescan의 계획서이자 검증 기준.

## 정합 원칙
- **요구 없는 코드 금지**(G0): 새 동작은 SRS가 선행한다(plan 체계 일관성).
- **모든 구현은 역링크**: 함수에 `@plm`, 문서에 `code_refs`(자동) — 양방향 딥링크.
- PLM 미바인딩 시: 경고 후 스킵(graceful), 추적 매핑 표는 그래도 spec에 남긴다.
