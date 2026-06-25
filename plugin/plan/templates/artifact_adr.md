---
id: "ADR-{{NNN}}"
type: ADR
title: "{{결정 제목}}"
status: Draft             # ADR 워크플로우상 Proposed→Accepted→Superseded 를 Draft/In Review/Approved/Superseded 로 매핑
owner: "{{책임 역할}}"
product: "{{제품}}"
created: {{ISO8601_UTC}}
updated: {{ISO8601_UTC}}
sync: true
# --- owner relation ---
informs: []               # → SRS-NNN / SAD-NNN (이 결정이 영향 주는 요구·설계)
supersedes: null          # → ADR-NNN (대체 시)
---

# ADR-{{NNN}} · {{제목}}

## 맥락 (Context)
{{어떤 상황/제약에서 결정이 필요한가}}

## 결정 (Decision)
{{무엇을 택했는가}}

## 근거 / 대안
- 채택 이유: {{}}
- 검토한 대안: {{}}

## 결과 (Consequences)
- 장점 / 트레이드오프 / 되돌림 비용

## 연결
- 영향 SRS/SAD: {{}} · 대체: {{ADR-... (있으면)}}
