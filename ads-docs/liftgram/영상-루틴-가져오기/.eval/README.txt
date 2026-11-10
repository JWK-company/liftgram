ADR-064 정확도 시험 자료(2026-11-10) — 영상 원문·댓글은 YouTube API 정책(보관 제한)으로 싣지 않는다. 다시 모으려면 collect.py.
  collect.py  <YOUTUBE_API_KEY> videos.json   — 검색 8개 질의 × 8개 + 예시 영상, 제목·설명란·댓글 100개(공식 API)
  baseline.ts videos.json labels.json out.json full|nocomment   — 기존 규칙 해석기(설명란 + 시각 목록 댓글) · bun 으로 src/core 에서
  llm.py      videos.json labels.json catalog.master.csv <ollama 모델> full|nocomment out.json   — 1단계 종목 뽑기 · 2단계 후보 고르기(ollama :11500)
  hybrid.ts   <llm 로그> out.json   — LLM 이 뽑은 줄을 규칙 해석기로 맞추기
  score.py    labels.json out.json  — 재현율·정밀도(opt 는 맞아도 틀려도 무시 · partial 영상은 오답 안 셈)
  pred-*.json — 결과(카탈로그 id_en) · videos.ids.json — 시험 영상 59개 목록
