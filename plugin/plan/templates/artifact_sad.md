---
id: "SAD-{{NNN}}"
type: SAD
title: "{{아키텍처 문서 제목}}"
status: Draft
owner: "{{책임 역할}}"
product: "{{제품}}"
created: {{ISO8601_UTC}}
updated: {{ISO8601_UTC}}
sync: true
component: "{{컴포넌트}}"
# --- owner relation (G2: refs 필수) ---
refs: []                  # → SRS-NNN (이 설계가 다루는 소프트웨어 요구)
# informed_by 는 ADR 이 owner(informs) — 여기 적지 않음
# --- 딥링크 (자동 역기재: /plm-hub:codescan 이 소스 @plm 주석에서 채움) ---
code_refs: []             # ← 이 설계를 구현한 실제 코드 위치 [path:line, …]
---

# SAD-{{NNN}} · {{제목}}

## 개요 (Summary)
{{상위 설계 요약 — 모듈 수준 SDS 아님}}

## 컴포넌트 / 책임
- {{컴포넌트}}: {{책임}}

## 연결
- 다루는 SRS: {{SRS-...}}
