---
description: PLM work agent — 대시보드의 빈약 본문 아티팩트를 자동 보정(claude CLI로 본문 생성→PLM 동기)
argument-hint: "[--apply] [--limit N] [--code CODE]"
---

기획 아티팩트의 **빈약한 본문을 자동으로 채우는 work agent**. 사람이 대시보드에서 제목만 있는 골격 아티팩트를 만들면 → agent가 맥락(상류 URS/SRS·구현 Code)을 모아 템플릿 섹션에 맞는 본문을 생성한다.

## 업무 할당(assignment) 모델
**G_body 큐** = 산문 아티팩트(URS·UCS·SRS·SAD·ADR) 중 본문이 제목 수준인 것 = '작성 요청'. plm-gate(Stop hook)가 매 세션 자동 표면화한다.

## 동작
1. 바인딩·서비스 토큰 확인(`PLM_API_TOKEN` — 사람 계정 암호 불필요).
2. `scripts/plm_agent.py` 실행:
   - PLM `/export`에서 빈약 본문 큐 수집(또는 `--code`로 특정 1건).
   - 각 아티팩트의 맥락(상류 연결·구현 Code) 수집 → `claude -p`로 본문 생성.
   - `--apply`면 로컬 `.md` 본문 갱신 + PLM 직접 upsert(서비스 토큰). 미지정 시 dry-run(큐만 표시).
3. 결과: 대시보드에서 본문이 채워진 상태로 즉시 확인.

## 사용
```
/plm-hub:agent                  # dry-run: 빈약 본문 큐 표시
/plm-hub:agent --apply --limit 5   # 5건 자동 보정
/plm-hub:agent --apply --code SRS-009  # 특정 아티팩트 보정
```

> 본문 품질 루프: 작성 시 `body-lint`(예방) · `plm-gate G_body`(상시 감지) · **agent(자동 보정)** · Code는 codescan이 자동 강화. 사람이 문제를 찾아 고칠 필요 없이 시스템이 스스로 정합을 유지한다.
