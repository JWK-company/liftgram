# SPEC-025 — 개발자용 문구 제거 — 진단 줄·오류 원문·지문·내부 용어

> 타입 Spec · 그룹 할일/문구-정리 · ADStudio가 `SPEC-025.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

## 목표

출시 뒤 일반 사용자에게 보이는 개발자용 문구를 없앤다. 할 일 #T7의 요청이다.

**등급 근거:** 화면 코드 약 30개를 고치지만 동작은 바꾸지 않고 문구 정리 한 관심사다. Task, 한 단계로 진행한다. 스펙 리뷰는 코드 리뷰와 합쳐 REV-031 하나로 진행한다.

## 범위

전수 조사로 찾은 곳만 고친다. 경로는 아래 설계 표에 있다.

**고치지 않는 것:**

- `화면 버전`·`화면 업데이트`·`앱 설치 파일`: 실기기 피드백으로 나눈 이름이다.
- `src/frontend/app/privacy/page.tsx`: 법적 문서라 정확성이 우선이다. 출시 전 점검 항목으로 넘긴다.
- 소셜 로그인 `설정 필요`: 운영 환경값 `OAUTH_PREVIEW_PROVIDERS`가 비어 있으면 보이지 않는다. 출시 전 점검 항목으로 넘긴다.
- 운영 탭, `/ops`, 모더레이션 큐, 광고 미리 보기, `개발 빌드` 배지: 역할이나 빌드 조건으로 이미 막혀 있다.
- 추정 1RM, PR, 볼륨: 운동 용어다.

## 설계

| 분류 | 처리 | 위치 |
| --- | --- | --- |
| 진단 줄 | 삭제. 상태 값은 e2e 대기 신호로 숨겨 두고 오프라인일 때만 안내 | `src/frontend/app/components/CatalogClient.tsx` |
| 종목 id 줄 | 삭제 | `src/frontend/app/exercise/[id]/page.tsx` |
| 오류 원문 | `errorText`로 통일. 한국어 문구만 그대로, 영어 원문은 코드별 문구나 공통 문구 | `src/frontend/lib/errorText.ts`와 호출부 |
| 원인 코드 | 글자 삭제, 시험 표지만 숨김 | `src/frontend/app/components/appdist/AppUpdateSheet.tsx` |
| 서명 지문 | 표시 삭제. 파일 확인 동작은 유지 | `src/frontend/app/components/appdist/AppUpdateCard.tsx`, `src/frontend/app/app/AppPageClient.tsx` |
| build 번호 | 삭제. 네이티브 앱 버전은 유지 | `src/frontend/app/components/profile/AppVersionRow.tsx` |
| 잠금 진단 기록 | 협업자·관리자만 표시 | `src/frontend/app/components/profile/LockScreenRow.tsx` |
| 자가진단 페이지 | 개발·e2e 빌드에서만 열림 | `src/frontend/app/diag/db/page.tsx` |
| 앱 설명 | 경쟁사 이름 제거 | `src/frontend/app/layout.tsx`, `src/frontend/public/manifest.json` |
| 내부 용어 | 「동기」는 「백업」으로, RIR 기록 표는 「여유」로, 묶음 번호는 %로, Epley는 쉬운 말로 | `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts`, `src/frontend/app/components/sync/ImportFlow.tsx` |

## 작업 단계

- [x] 오류 문구 함수와 호출부
- [x] 진단 줄, 지문, 코드, 번호 제거
- [x] 문구 교체(ko·en)
- [x] 영향받는 e2e 갱신

**완료 기준:** `make verify` 통과, 영향받는 e2e 통과.

## 수용 기준

- 조사 표의 문구가 일반 사용자 화면에 보이지 않는다.
- 영어 오류 원문이 토스트와 오류 화면에 나오지 않는다.
- 서버가 준 한국어 안내는 그대로 보인다.

## 테스트 계획

`make verify`, 그리고 `src/frontend/e2e/`의 catalog, sync, coaching, data-safety, opengym-qa1, opengym-import, app-distribution, lock-bridge, declutter-summary, multi-tab, local-db, offline, profile 묶음.

## 위험·주의

- 앱 교체나 서명 문제를 지원할 때 사용자 화면에서 지문을 읽어 줄 수 없다. 대응은 관리자 쪽에서 한다.
- 잠금 진단 기록은 일반 사용자 기기에서 원인을 받을 수 없게 된다. 협업자 기기로 재현해야 한다.
- 기기 저장소의 한국어 예외는 그대로 보이므로, 새 예외 문구도 사용자에게 보이는 말로 써야 한다.
