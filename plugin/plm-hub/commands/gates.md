---
description: PLM 거버넌스 게이트(G1~G3 orphan)와 재검토 큐를 조회한다
---

PLM(권위)에서 바인딩된 프로젝트의 게이트 상태를 조회해 보고한다.

1. `plm` MCP의 `gates` 도구로 G1(SRS→URS)·G2(SAD→SRS)·G3(Code→SRS) orphan을 조회한다.
2. `review_queue` 도구로 변경 영향 전파(needs_review) 대기를 조회한다.
3. orphan/재검토 항목을 표로 정리하고, 각 항목의 해소 방법(관계 추가/재검토)을 제안한다.
4. 필요 시 `relation_link` 도구로 누락 관계를 즉시 보완한다.
