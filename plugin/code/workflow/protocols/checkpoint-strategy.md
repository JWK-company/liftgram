# Checkpoint Strategy 프로토콜

> 참조: /execute (Step 5)
> 목적: Phase별 checkpoint 커밋으로 진행 상태를 보존하고 안전한 롤백 포인트 확보

---

## 적용 조건

| 등급 | Checkpoint 커밋 |
|------|----------------|
| Patch | X (하지 않음) |
| Task | X (하지 않음) |
| Feature | **O** (Phase 완료 시) |
| Project | **O** (Phase 완료 시) |
| Epic | **O** (Phase 완료 시) |

---

## 커밋 메시지 형식

### Phase 완료 커밋

```
feat({{scope}}): Phase {{N}} - {{Phase 제목}}

- {{완료 항목 1}}
- {{완료 항목 2}}
- {{완료 항목 3}}

Refs: {{spec 경로}}
```

### Hotfix / 긴급 수정 커밋

```
fix({{scope}}): {{수정 내용 1줄}}
```

### 작업 최종 완료 커밋

```
feat({{scope}}): {{작업명}} 완료

Phase 1: {{Phase 1 제목}}
Phase 2: {{Phase 2 제목}}
...

Refs: {{spec 경로}}
```

---

## Phase별 Checkpoint 절차

### 1. 체크리스트 완료 확인

- spec의 해당 Phase 모든 작업 항목 `[x]` 확인
- 미완료 항목 존재 시 -> AskUserQuestion ("미완료 항목이 있습니다. 계속?")

### 2. Self-Verification 실행

- 참조: `self-verification.md`
- Build -> Test -> Lint 순서

### 3. Checkpoint 커밋 생성

```bash
git add {{변경 파일들}}
git commit -m "feat({{scope}}): Phase {{N}} - {{제목}}"
```

### 4. current.md 갱신

- 현재 Phase 완료 기록
- 다음 Phase 브리핑

### 5. 사용자 입력 대기

- **자동 다음 Phase 실행 금지**
- Phase 완료 보고 + 다음 Phase 브리핑 제시
- 사용자 확인 후에만 다음 Phase 진행

---

## 롤백 전략

Phase 진행 중 심각한 문제 발생 시:

```
1. 현재 변경 사항 stash 또는 되돌리기
2. 마지막 checkpoint 커밋으로 복귀
3. spec 재검토
4. AskUserQuestion ("접근 방식 변경 필요")
```

---

## 브랜치 전략

| 등급 | 브랜치 |
|------|--------|
| Patch/Task | 현재 브랜치에서 작업 |
| Feature+ | KG 조회 -> AskUser 확인 후 브랜치 생성/선택 |
