---
description: 요구→설계 추적성을 조회하고 orphan·G1/G2 게이트·매트릭스를 산출한다
argument-hint: "[--matrix]"
---

# /trace — 추적성 조회

요구→설계 추적 그래프를 점검한다(기획 범위: URS·UCS·SRS·SAD·ADR·Roadmap).

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/scripts/trace_validate.py --full --update-state` 실행.
2. `--matrix` 인자 시 `--matrix .ouroboros/docs/traceability/matrix.md` 추가로 매트릭스 생성.
3. 출력 해석 후 사용자에게 보고:
   - **5질문**: ①요구→설계 어디서 다뤄지나 ②설계 근거 요구 ③미충족(orphan) ④역추적 ⑤커버리지
   - **게이트**: G1(모든 SRS가 `derives_from`→URS) · G2(모든 SAD가 `refs`→SRS)
   - **orphan/dangling** 목록
4. **사람 판단 체크리스트**(기계조건 외):
   - 요구 완전성: 이해관계자 니즈가 URS로 빠짐없이 포착됐나?
   - 설계 타당성: SAD가 SRS를 합리적으로 다루나?
   - Approved 후보: G1·G2 pass면 PLM 대시보드에서 Approved 전이 검토(사람 수동).
5. current.md 게이트 섹션 갱신.

> 게이트는 소프트(차단 아님). 위반은 보완 권고로만.
