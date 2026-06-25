# Self-Verification 프로토콜

> 참조: /execute (Step 5)
> 목적: 구현 완료 후 자체 검증으로 품질 보증

---

## 적용 조건

| 등급 | 적용 |
|------|------|
| Patch | 스킵 |
| Task | 스킵 |
| Feature | **필수** |
| Project | **필수** |
| Epic | **필수** |

---

## 검증 순서 (Build -> Test -> Lint)

### 1. Build 검증

```bash
# 프로젝트 빌드 명령어 실행
npm run build   # 또는 make build, go build, etc.
```

- 성공: 다음 단계로 진행
- 실패: 빌드 에러 수정 후 재시도 (최대 3회)
- 3회 실패: AskUserQuestion ("빌드 실패 지속. 진행 방법을 선택하세요")

### 2. Test 검증

```bash
# 관련 테스트만 실행 (전체 X)
npm test -- --related   # 또는 변경 파일 관련 테스트만
```

- 성공: 다음 단계로 진행
- 실패:
  - 기존 테스트 실패 -> 코드 수정 (spec 범위 내)
  - 새 테스트 실패 -> 테스트 또는 코드 수정
  - 3회 실패: AskUserQuestion

### 3. Lint 검증

```bash
# 변경 파일만 린트
npm run lint -- --fix   # 또는 해당 프로젝트 린트 명령어
```

- 자동 수정 가능 -> 적용
- 수동 수정 필요 -> 규칙 확인 후 수정
- 프로젝트에 린트 설정 없음 -> 스킵 (경고 없이)

---

## 등급별 검증 수준

| 항목 | Feature | Project | Epic |
|------|---------|---------|------|
| Build | 필수 | 필수 | 필수 |
| Test (관련) | 필수 | 필수 | 필수 |
| Test (전체) | 선택 | 권장 | 필수 |
| Lint | 필수 | 필수 | 필수 |
| Type Check | 해당 시 | 필수 | 필수 |

---

## 검증 실패 에스컬레이션

```
1회 실패 -> 자동 수정 시도
2회 실패 -> 접근 방식 변경 후 재시도
3회 실패 -> AskUserQuestion (선택지 제시)
            a) 수동 해결 후 계속
            b) /fix 호출
            c) 해당 Phase 보류, 다음 Phase 진행
```

---

## 검증 결과 기록

Phase 완료 시 current.md에 검증 결과 요약:

```
- Self-Verification: Build OK / Test OK (12 passed) / Lint OK
```
