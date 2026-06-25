---
description: 기획 회고 — ADR 후보 정리·로드맵 갱신 제안 (경량)
---

# /reflect — 기획 회고

최근 기획 작업을 돌아보고 후속을 제안한다(메모리 의존 없는 경량 버전).

## 절차
1. 최근 변경된 아티팩트(requirements·design·decisions·roadmap)를 훑는다.
2. 점검:
   - 반복 등장한 결정/근거 → **ADR 후보** 제안(`/decision`).
   - 범위/우선순위 변화 → **Roadmap 갱신** 제안.
   - orphan/dangling(있으면) → 보완 안내(`/trace`).
   - Approved 가능 후보(G1·G2 pass) → PLM 대시보드 Status 전이 안내.
3. 결과를 사용자에게 요약 보고(문서 자동생성은 안 함 — 제안만).

> 코드/구현 회고는 범위 밖. 기획 산출물 정합·후속 액션에 집중.
