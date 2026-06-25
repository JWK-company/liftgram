# Verification Pyramid 프로토콜

> 참조: /execute (Step 4-5)
> 목적: 4단계 검증 레벨로 테스트 범위와 깊이를 체계화

---

## 검증 레벨 정의

### L1: Static Analysis (정적 분석)

- **범위**: 코드 형식, 타입, 린트
- **도구**: TypeScript compiler, ESLint, Prettier, etc.
- **적용 시점**: 모든 코드 변경 후 즉시
- **소요 시간**: < 30초
- **자동화**: 완전 자동

```bash
# 예시
npx tsc --noEmit          # 타입 체크
npm run lint              # 린트
npm run format -- --check # 포맷 체크
```

### L2: Unit Test (단위 테스트)

- **범위**: 개별 함수/모듈의 입출력 검증
- **도구**: Jest, Vitest, pytest, etc.
- **적용 시점**: 기능 단위 구현 완료 후
- **소요 시간**: < 2분
- **자동화**: 테스트 파일 존재 시 자동

```bash
# 예시 - 변경 관련 테스트만
npm test -- --related
npm test -- --testPathPattern="auth"
```

### L3: Integration Test (통합 테스트)

- **범위**: 모듈 간 상호작용, API 엔드포인트
- **도구**: Supertest, Testing Library, etc.
- **적용 시점**: Phase 완료 후
- **소요 시간**: < 5분
- **자동화**: CI/로컬 환경에 따라 다름

```bash
# 예시
npm run test:integration
npm run test:e2e -- --grep="auth"
```

### L4: System Test (시스템 테스트)

- **범위**: 전체 시스템 동작, E2E
- **도구**: Playwright, Cypress, etc.
- **적용 시점**: 전체 작업 완료 후 (마지막 Phase)
- **소요 시간**: < 10분
- **자동화**: CI 환경 권장

---

## 등급별 필수 레벨

| 등급 | L1 | L2 | L3 | L4 |
|------|----|----|----|----|
| Patch | 선택 | 선택 | X | X |
| Task | 선택 | 선택 | X | X |
| Feature | **필수** | **필수** | 권장 | 선택 |
| Project | **필수** | **필수** | **필수** | 권장 |
| Epic | **필수** | **필수** | **필수** | **필수** |

---

## Phase별 검증 매핑

| Phase 위치 | 최소 검증 |
|-----------|----------|
| Phase 중간 (Step 완료) | L1 |
| Phase 완료 | L1 + L2 |
| 마지막 Phase 완료 | L1 + L2 + L3 |
| 전체 작업 완료 | L1 + L2 + L3 + L4 (해당 시) |

---

## 검증 실패 대응

| 레벨 | 실패 시 행동 |
|------|------------|
| L1 | 즉시 수정 (자동 fix 우선) |
| L2 | 코드 또는 테스트 수정 |
| L3 | 영향 범위 분석 후 수정 |
| L4 | AskUserQuestion (범위 확인 후 수정/보류 결정) |
