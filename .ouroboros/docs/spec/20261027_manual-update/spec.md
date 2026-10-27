# Feature Spec — 앱 업데이트는 프로필 버튼 하나로 (수동 업데이트 · 덮개 · 필수 업데이트)

> 생성일: 2026-10-27 · 등급: **Feature**(frontend 셸·프로필·탭 바·서비스워커 템플릿/생성기 + web 서버 공개 GET 1개 + core 순수 정책)
> 추적: **SRS-085**(신규 · derives_from URS-001·URS-008·URS-023) · 이전 동작 SRS-051(셸)·SRS-084(#64 /workout 보류)
> 작업 위치: worktree `../liftgram-wt-update` · 브랜치 `feat/manual-update` · 커밋까지만(push·배포는 검토자)
> 결정: 사용자 확정(2026-10-27 · 질문 없음) — 아래 「확정 결정」 1~7 그대로

## 1. 문제

지금(v0.45.0) 새 버전은 세 경로로 적용된다.

1. 하단 띠 `sw-update`의 「새로고침」 — 띠가 떠 있어도 다른 화면을 누를 수 있어, 누른 동작과 새로고침이 겹친다(입력 유실·화면 이동 끊김).
2. **운동 중이 아니면 자동 적용**(10-27 추가) — 띠 없이 skip-waiting → controllerchange → 새로고침. 사람이 무엇을 하든 끼어든다. 오늘 운동 완료 직후 요약·「바뀐 루틴 저장」 시트를 날렸다(#64). v0.45.0은 `/workout` 경로 보류로 임시 처리했다.
3. 다른 탭·다른 문서가 적용하면 이 탭에도 controllerchange → 곧바로 새로고침.

판단이 셸 상태·경로·기기 DB·다른 탭에 흩어져 있어 「될 때도 안 될 때도」 있다. 사용자는 **언제 업데이트되는지 모른다**.

## 2. 확정 결정 (사용자 2026-10-27)

| # | 결정 | 이 스펙의 구현 |
|---|------|----------------|
| 1 | 업데이트는 **프로필의 버튼 한 곳**에서만 | 프로필 목록에 「앱 버전 vX.Y.Z」 줄 + 기다리는 새 버전이 있으면 오른쪽 「업데이트」 버튼. 새 버전 번호는 **새 워커가 직접 답한다**(sw.js 에 버전을 새김 · 메시지 `{type:"version"}`) → 못 받으면 서버 `/app-version`의 `version` → 그것도 없으면 「새 버전」 |
| 2 | 누르면 **로고 스피너 전체 화면 덮개**로 입력 차단·강제 대기: flush → skip-waiting → controllerchange → reload · 새 페이지 첫 그림까지 유지 · **15초 타임아웃** 실패 화면(다시 시도·닫기) | §5 상태 기계 · `UpdateOverlay`(포털 + 뒤 화면 `inert`) · sessionStorage 표식 `liftgram.updating` + `<head>` 인라인 스크립트가 첫 칠하기 전 `html[data-updating]` → 서버가 그린 정적 덮개 표시 → 하이드레이션 뒤 2프레임 지나 해제 |
| 3 | 띠·자동 적용·/workout 보류 **걷어냄**(코드 보존 규칙 — 호출 주석 처리) · 앱 사용 중 저절로 업데이트 금지 · **앱을 완전히 닫았다 열 때 브라우저가 기다리던 워커를 활성화하는 것은 허용** | `ServiceWorker.tsx`의 자동 적용 effect·미룬 새로고침 effect·띠 렌더를 주석 처리 + [원본]/[개선]. `controllerchange` 는 **우리가 누른 업데이트일 때만** 새로고침, 그 밖(첫 설치·다른 탭 적용·브라우저 활성화)은 새로고침하지 않고 「새로고침하면 적용」 상태로만 표시 |
| 4 | **운동 중 버튼 비활성** + 「운동을 끝낸 뒤 업데이트할 수 있어요」 · 셸 상태와 기기 DB 둘 다 | 셸 `activeLoaded` 전 = 판단 전(비활성 · 이유 없음) · 셸 `activeWorkoutId` 있음 = 비활성+이유 · 누른 순간 기기 DB `getActiveWorkout()` 재확인(있으면 덮개를 띄우지 않고 이유 표시) |
| 5 | 새 버전 대기 중이면 **하단 「프로필」 탭에 작은 점**(조용한 색) · 접근 이름 「새 버전 있음」 | 점 = `--color-ink2` 6px(빨강·금색 아님 · 꺼진 탭 아이콘 ink3 보다 한 단계 진하게 — 같은 색이면 아이콘에 묻힌다) · 링크 안 `sr-only` 「새 버전 있음」 · `data-testid="nav-profile-update-dot"` |
| 6 | **필수 업데이트**: 서버가 최소 클라이언트 버전을 알려 줌 · 기본 비어 있음 | web 서버(`server.mjs`)가 Next를 거치지 않는 공개 GET **`/app-version`** → `{ version, minClientVersion }` (`Cache-Control: no-store`) · 값 = 환경변수 `MIN_CLIENT_VERSION`(기본 "") · 현재 < 최소면 같은 덮개로 업데이트 — §6 |
| 7 | 문구 한/영 | `lib/i18n.ts` `WEB_ONLY`(`web.sw.*`) — 기존 방식 |

## 3. 기존 엔드포인트 조사

- `GET /healthz`·`/readyz`(web 자신 · `server.mjs ownHealth`)·`/api/healthz`·`/api/readyz`(Go) — 버전 정보 없음. 버전 헤더도 없음.
- 그래서 **가장 가벼운 방법**: `ownHealth` 옆에 `/app-version` 하나(Next·프록시·DB 무관 · 헬스처럼 로그 제외). Go 백엔드는 건드리지 않는다(브라우저가 보는 것은 web 이고, 배포 단위의 버전도 web 의 것).
- 서비스워커는 `/app-version` 을 가로채지 않는다(navigate 아님·PRECACHE 아님 → 네트워크 그대로). 오프라인이면 확인을 건너뛴다(필수 판정 없음 = 지금 버전 유지).

## 4. 설계

### 4.1 파일 (작업 범위)

| 층 | 파일 | 변경 |
|----|------|------|
| core | `src/core/src/domain/swUpdatePolicy.ts` | **함수 추가**(기존 3개 보존): `compareVersions` · `isBelowMinVersion` · `controllerChangeDecision` · `updateRowState` · `mandatoryUpdateAction` · `readBootMarker` · 상수 `UPDATE_TIMEOUT_MS=15000`·`BOOT_MARKER_TTL_MS=60000` |
| core | `src/core/src/domain/__tests__/swUpdatePolicy.test.ts` | 새 함수 테스트 추가(기존 테스트 유지) |
| sw | `src/frontend/sw/sw.template.js` | `__APP_VERSION__` 자리표시자 · 메시지 `{type:"version"}` → 포트로 `{version, build}` 응답 · 머리 주석 갱신 |
| sw | `src/scripts/build-sw.mjs` | frontend/package.json 의 version 을 새김(자리표시자 검사 3개) |
| web | `src/frontend/lib/appUpdate.ts` (신규) | 업데이트 상태 저장소(`useSyncExternalStore`) + `startUpdate()` 절차 + `/app-version` 확인 |
| web | `src/frontend/app/components/ServiceWorker.tsx` | 등록·추적은 유지 → 저장소에 씀 · 자동 적용/미룬 새로고침/띠 주석 처리 · controllerchange 새 판정 · 필수 업데이트 effect · 부팅 표식 처리 · 덮개 렌더 |
| web | `src/frontend/app/components/UpdateOverlay.tsx` (신규) | 덮개(진행·실패) — 포털 · 뒤 화면 inert · 초점 이동 |
| web | `src/frontend/app/components/profile/AppVersionRow.tsx` (신규) · `ProfileClient.tsx` | 「앱 버전」 줄 + 버튼 · 운동 중 이유 · 필수 안내 |
| web | `src/frontend/app/components/ui/TabBar.tsx` | 프로필 탭 점 + sr-only |
| web | `src/frontend/app/layout.tsx` · `globals.css` | 부팅 덮개 인라인 스크립트 + 정적 덮개 + CSS |
| web | `src/frontend/lib/i18n.ts` | `web.sw.*` 문구 추가(기존 키 보존) |
| web | `src/frontend/server.mjs` · `lib/env.ts` · `src/.env.example` · `src/compose.yaml` | `/app-version` · `MIN_CLIENT_VERSION`(기본 "") |
| e2e | `src/frontend/e2e/manual-update.spec.ts` (신규) · `feedback-62-64.spec.ts` | 새 e2e · #64 e2e 는 새 정책에 맞게 기대를 바꾼다(아래 §8) |
| 버전 | `src/frontend/package.json` | 0.47.0 → **0.48.0**(병행 세션이 그사이 0.46.0·0.47.0 배포 — rebase 뒤 다음 minor) |

### 4.2 상태 (저장소 `lib/appUpdate.ts`)

```
{
  waiting: ServiceWorker | null      // 기다리는 새 워커(controller 가 있을 때만 — 첫 설치 제외)
  activatedElsewhere: boolean        // 이 문서는 옛 번들인데 새 워커가 이미 자리 잡음(다른 탭 적용·브라우저 활성화)
  newVersion: string | null          // 새 워커가 답한 버전(→ 서버 version → null)
  phase: "idle" | "updating" | "failed"
  failReason: "timeout" | "workout" | "flush" | "no-worker" | null
  mandatory: boolean                 // 서버 최소 버전 > 현재
  minVersion: string | null
}
available = (waiting != null || activatedElsewhere)
```

### 4.3 controllerchange 판정 (`controllerChangeDecision`)

| 조건 | 결과 |
|------|------|
| 처음 로드 때 controller 없었음(첫 설치 · clients.claim) | `ignore` |
| 우리가 누른 업데이트 중(`applying`) | `reload`(한 번만) |
| 그 밖(다른 탭이 적용 · 앱을 닫았다 열 때 브라우저 활성화가 늦게 잡힘) | `mark` — **새로고침하지 않는다**. `activatedElsewhere=true` → 프로필 「업데이트」는 새로고침만 한다(flush → reload) |

앱을 완전히 닫았다 열면 기다리던 워커는 **새 문서가 열리기 전에** 활성화되므로 새 문서는 처음부터 새 워커가 제어한다 → controllerchange 가 오지 않는다. 늦게 잡히는 드문 경우도 위 `mark` 라 사용 중 새로고침이 없다.

옛 탭이 새 워커 아래에서 계속 도는 동안 필요한 옛 정적 조각은 「옛 정적 캐시 한 세대 보존」(sw.template.js activate)으로 찾는다 — 기존 설계 그대로.

## 5. 상태 기계 (업데이트 버튼 · 덮개)

```
           ┌───────────── 새 워커 설치됨(controller 있음) / 다른 곳에서 활성화 ─────────────┐
           ▼                                                                                │
 [대기 없음] ──────────────────────────────────────────────────────────────────▶ [새 버전 대기]
   행: 「앱 버전 v0.46.0」(버튼 없음)                                              행: 「앱 버전 v0.46.0 · 새 버전 v0.47.0」 + [업데이트]
   탭 점 없음                                                                      탭 점 있음 · 운동 중이면 버튼 비활성 + 이유
                                                                                    │ 누름(운동 중 아님 · DB 재확인 통과)
                                                                                    ▼
                                                                              [업데이트 중] 덮개(로고 스피너 · 입력 차단)
                                                                     ① 기기 DB 내려쓰기(flushLocalDbResult · "failed" 면 1회 재시도)
                                                                     ② 표식 sessionStorage `liftgram.updating`={at, fromBuild, fromVersion}
                                                                     ③ activatedElsewhere → 곧바로 reload
                                                                        아니면 waiting(없으면 installing 이 installed 될 때까지 · 그래도 없으면 reg.update())
                                                                        에 "skip-waiting"
                                                                     ④ controllerchange(applying) → reload  ·  워커 state=activated 인데 이벤트 없으면 reload
                                                                     ⑤ 15초 안에 ③④가 안 되면 ──▶ [실패]
                                                                                    │ reload
                                                                                    ▼
                                                                  새 문서: <head> 스크립트가 표식(60초 이내)을 보고 html[data-updating]
                                                                  → 정적 덮개가 첫 칠하기부터 보임 → 하이드레이션 + 2프레임 뒤 해제 · 표식 삭제
                                                                  (새 문서의 build == fromBuild 이고 아직 기다리는 워커가 있으면 → [실패])

 [실패] 덮개 그대로 + 「업데이트하지 못했어요」 + [다시 시도](주 행동 · 빨강 채움 1개) + [닫기](회색)
        다시 시도 → [업데이트 중](같은 절차 · 다시 15초) · 닫기 → [새 버전 대기]
        failReason=workout(누른 순간 DB 에 진행 중 운동) → 「운동을 끝낸 뒤 업데이트할 수 있어요」 + [닫기]만
```

- **덮개가 막는 것**: 덮개는 `#modal-root`/body 직속 포털(z 300) · 뒤의 body 자식들에 `inert`(Tab·Enter·클릭 전부) · 초점은 덮개 안 상태 문구(실패면 「다시 시도」).
- **15초 기준**: 누른 순간부터 reload 호출까지. reload 이후는 새 문서가 맡는다(SW 가 셸을 기기에서 준다 → 빠르다).
- **덮개 해제 조건**: 새 문서에서만 해제(같은 문서에서는 실패 화면으로만 바뀐다). 「닫기」를 누르면 해제.

## 6. 필수 업데이트 (확정 6 · 스펙이 정할 부분)

- 확인 시점: 부팅 1회 + 화면이 다시 보일 때(visibilitychange → visible, **60초에 한 번**까지). 운영 빌드만.
- `isBelowMinVersion(APP_VERSION, minClientVersion)` — 최소값이 비었거나 SemVer 가 아니면 **필수 아님**(fail-open: 잘못 적은 값으로 앱을 잠그지 않는다).
- **서버가 그 버전을 실제로 갖고 있을 때만**(QA H-1): 서버 `version` ≥ 최소. 서버 version 을 모르거나 최소보다 낮으면(오설정) 필수 아님 — 업데이트해도 여전히 미만이 되는 루프를 막는다.
- 필수면 `mandatoryUpdateAction`:
  | 상황 | 동작 |
  |------|------|
  | 덮개 진행·실패 중 · 이번 문서에서 사람이 실패를 닫았음 | 아무것도 안 함(다음 부팅·다음 보임 때 다시) |
  | 셸 판단 전(`activeLoaded=false`) | 기다림 |
  | **운동 중**(셸 또는 기기 DB) | **기다림** — 운동을 끝낼 때까지 아무 화면도 끼어들지 않는다. 프로필 줄에 「필수 업데이트예요 · 운동을 끝내면 업데이트해요」 |
  | **운동 화면(/workout — 요약·완료 시트 포함)** | **기다림** — #64 와 같은 이유(완료 직후 결정 중). 떠나면(요약 닫기 → 홈) 시작 |
  | 그 밖 | 곧바로 덮개 → §5 절차(기다리는 워커가 없으면 `reg.update()` 후 설치를 기다림 · 15초) |
- 실패하면 일반 실패와 같은 화면(「다시 시도」·「닫기」). 닫기는 허용한다 — 기록은 기기 DB 에 있고 오프라인 우선 앱을 잠그는 것이 더 위험하다. 다음 부팅·다음 보임에 다시 시작한다.
- 운영 설정: 서버 `src/.env` 에 `MIN_CLIENT_VERSION=0.46.0` 처럼 적고 web 재시작. **이번 작업은 서버 .env 를 건드리지 않는다**(compose 가 `${MIN_CLIENT_VERSION:-}` 로 넘기기만 한다).

## 7. 화면 규칙 대조 (화면 정리 spec 공용 규칙)

- 색 의미 2개: 「업데이트」 버튼 = `Button variant="secondary" size="sm"`(회색 상자 · 프로필 화면엔 이미 빨강 주 행동이 없다 — 그래도 부가 설정 줄이라 회색) · 탭 점 `--color-ink2` · 덮개의 「다시 시도」만 빨강 채움(그 화면의 유일한 주 행동).
- 글자: 줄 제목 body · 보조 caption(ink3) · 덮개 문구 body/heading.
- 누르는 자리 44px: 버튼 `min-h-[44px]`(sm 36 → 44 로 감싼다).
- 새 색 토큰 없음.

## 8. 걷어내는 것 (코드 보존 규칙 §3.6)

| 무엇 | 처리 |
|------|------|
| 자동 적용 effect(`shouldAutoApplyUpdate` 호출) | 주석 처리 · [원본]/[개선] |
| 미룬 새로고침 effect(`pendingReload`·`isUpdateHoldPath`) | 주석 처리 |
| 하단 띠 렌더(`sw-update`·`sw-update-apply`) | 주석 처리(컴포넌트는 `null` 대신 덮개를 그린다) |
| controllerchange `controllerChangeAction` 호출 | 주석 처리 → `controllerChangeDecision` |
| core `isUpdateHoldPath`·`shouldAutoApplyUpdate`·`controllerChangeAction` | **함수 보존**(필수 업데이트가 `isUpdateHoldPath` 재사용) · 기존 테스트 유지 |
| `web.sw.updateReady`·`updateApply` 문구 | 보존(쓰지 않음) |
| `e2e/feedback-62-64.spec.ts` #64 2건 | 첫 건은 「요약에서 저절로 새로고침 없음」으로 그대로 성립(기대 유지 · 띠 0개 그대로) — 단 마지막 「홈 가면 새로고침」 기대는 **새 정책에서 틀린 기대** → 「홈에 가도 새로고침 없음」으로 바꾼다. 둘째 건(홈 가면 skip-waiting)도 「홈에 가도 skip-waiting 없음」으로 바꾼다. 바꾼 이유를 파일에 적는다 |
| `lib/schemaGuard.ts reloadToNewVersion` | **그대로** — 옛 번들이 새 스키마 DB 를 만나 이미 덮개로 막힌 화면의 복구 버튼(사람이 누름). 정책 밖 |

## 8.1 QA 반영(`.ouroboros/docs/qa/20261027_manual-update-spec_qa.md`)

- H-1 필수 판정에 서버 version ≥ 최소 조건 · H-2 redundant 워커 비우기·누른 순간 재조회 · M-1 새로고침 한 곳(`reloadOnce`) · M-2 실패·닫기 때 `applying=false` · L-3 보일 때 `reg.update()`(10분 간격) · L-5 운동 확인 실패 = 업데이트 안 함(실패 화면)

## 9. 테스트

### 9.1 core 단위(수정 전 실패 = 함수가 없어 import 실패)
- `compareVersions`: 0.45.0<0.46.0 · 0.9.0<0.10.0 · 1.0.0=1.0.0 · 접두 v 허용 · 비SemVer → null
- `isBelowMinVersion`: 빈 값·잘못된 값 → false · 0.45.0 vs 0.46.0 → true · 같으면 false
- `controllerChangeDecision`: 첫 설치 ignore · applying reload · 그 밖 mark(**/workout 이든 / 이든 새로고침 없음**)
- `updateRowState`: 대기 없음 none · 판단 전 checking · 운동 중 blocked · 업데이트 가능 ready
- `mandatoryUpdateAction`: 필수 아님 none · 운동 중 wait · /workout wait · 판단 전 wait · 닫음 none · 진행 중 none · 그 밖 start
- `readBootMarker`: 없음/깨짐/60초 지남 → null · 정상 → 객체

### 9.2 e2e(로컬 운영 빌드 — 진짜 서비스워커)
진짜 「새 워커 대기」: 테스트가 운영 빌드의 `public/sw.js` 를 **복사해 BUILD_ID·APP_VERSION 을 바꾼 내용으로 덮어쓰고**(Next 는 public 파일을 디스크에서 그때그때 읽는다 — 실측 확인) `registration.update()` → 진짜 install(정적 파일 미리 받기)까지 끝난 waiting 워커가 생긴다. 테스트가 끝나면 원본으로 되돌린다.

| # | 시나리오 | 확인 |
|---|----------|------|
| E1 | 대기 없음 | 프로필 「앱 버전 v0.46.0」 · 버튼 없음 · 탭 점 없음 |
| E2 | 새 워커 대기 → 버튼 | 탭 점 + 접근 이름 「새 버전 있음」 · 「새 버전 v0.46.0-e2e…」 · **띠 `sw-update` 0개** · 10초 기다려도 skip-waiting·새로고침 없음(pageId 유지) · 홈·기록 화면 이동해도 없음 |
| E3 | 버튼 → 덮개 → 새 버전 | 누르면 덮개(로고 스피너) · 덮개 위 클릭이 뒤 화면에 닿지 않음 · 새 문서(pageId 바뀜) · 새 controller 가 바꾼 build 를 답함 · 부팅 덮개가 첫 rAF 에 보이고 이후 사라짐 · 버튼·점 사라짐 |
| E4 | 운동 중 비활성 | 운동 시작 후 프로필 → 버튼 disabled + 「운동을 끝낸 뒤 업데이트할 수 있어요」 |
| E5 | 요약 화면에서 저절로 새로고침 없음 | 새 워커 대기 + 운동 완료 → 요약·완료 시트 10초 유지(pageId 동일) · 요약 닫고 홈 → 5초 동안도 새로고침 없음 |
| E6 | 15초 실패 | `skip-waiting` 을 무시하는 워커(테스트가 그 줄을 빼고 덮어씀) → 15초 뒤 「업데이트하지 못했어요」 · 다시 시도 · 닫기 → 덮개 사라지고 버튼 그대로 |
| E7 | 필수 업데이트 | `/app-version` 응답을 `minClientVersion: "99.0.0"` 으로(page.route) → 홈에 있으면 덮개가 저절로 → 새 문서 · 운동 중이면 덮개 없음 + 프로필 「필수 업데이트예요」 문구 |
| E8 | 서버 엔드포인트 | `GET /app-version` → 200 · `{version:"0.46.0", minClientVersion:""}` · `cache-control: no-store` |

수정 전 실패: 같은 e2e 를 수정 전 코드(1037250 · v0.45.0) 운영 빌드에 대고 돌려 E1~E8 이 실패하는 것을 기록한다(E2 는 홈에서 자동 skip-waiting 이 일어나 실패해야 한다).

### 9.3 그 밖
- `make verify` 통과 · 390px 라이트/다크 스크린샷(프로필 줄·탭 점·덮개·실패) → `.ouroboros/docs/spec/20261027_manual-update/shots/`
- 영향 e2e: `feedback-62-64`(#64 2건 · 수정) · `offline`(첫 설치 새로고침 없음 — 기존 가드 유지) · `profile` 재실행

## 10. 리스크

| # | 리스크 | 대응 |
|---|--------|------|
| R1 | **전환기**: 이번 배포를 받는 기존 기기는 아직 옛 번들(v0.45.0)이 돌고 있어 **옛 방식으로 한 번 더** 이 버전을 받는다 — 운동 화면 밖에 있으면 옛 규칙의 자동 적용(새로고침 1회), 운동 중·/workout 이면 떠날 때. 그 뒤부터 새 방식(QA M-4) | 보고서·릴리스 메모에 명시. 옛 번들의 /workout 보류는 그대로라 요약은 날아가지 않는다 |
| R2 | 사람이 끝내 누르지 않으면 오래 옛 버전 | 앱을 완전히 닫았다 열면 브라우저가 활성화(확정 3) · 꼭 필요하면 `MIN_CLIENT_VERSION` |
| R3 | 다른 탭 적용 후 이 탭이 옛 번들로 새 워커 아래에서 돈다 | 옛 정적 캐시 한 세대 보존 · 프로필 「업데이트」가 새로고침만 · 두 세대 이상 밀리면 조각 404 가능 → 화면 이동이 전체 이동으로 넘어감(Next 기본) |
| R4 | iOS PWA 는 백그라운드에서 문서를 오래 살려 둔다 → 「완전히 닫기」가 드묾 | 탭 점이 알린다 · 필수 경로 |
| R5 | 부팅 덮개가 남아 앱을 가림(표식 삭제 실패) | 표식 60초 TTL · 하이드레이션 effect 가 무조건 해제 · 인라인 스크립트 try/catch |
| R6 | flush 실패 상태로 새로고침하면 마지막 세트 유실 | "failed" 는 1회 재시도 후 실패 화면(새로고침하지 않음) · "unreachable" 은 0.6초 기다린 뒤 진행(자동 저장 주기 500ms) |
| R7 | `MIN_CLIENT_VERSION` 오타로 전원 강제 업데이트 반복 | 잘못된 값 = 필수 아님 · 한 문서에서 닫으면 그 문서에서는 다시 안 띄움 |
| R9 | 기다리던 워커가 redundant(더 새 배포·설치 실패) | QA H-2 — statechange 로 비우고 누른 순간 `reg.waiting` 을 다시 읽는다 |
| R10 | 덮개 중 뒤로 가기·가장자리 스와이프 | QA M-3 보류 — 곧 새로고침, 기록은 이미 내려씀 |
| R8 | e2e 의 sw.js 덮어쓰기가 다른 세션 빌드를 건드림 | worktree 의 자기 빌드(`../liftgram-wt-update/src/frontend/public/sw.js`)만 · finally 로 복원 |

## 11. 실행 중 발견(execute)

- **부팅 직후 skip-waiting 이 멈춤(크롬)**: 새로고침이 끝난 바로 그 순간 skip-waiting 을 보내면 페이지 코드와 무관하게(테스트가 직접 보내도 4번 중 1번) 새 워커가 `installed` 에 멈춰 활성화되지 않았다. 다시 보내도 풀리지 않는다. 3초 뒤는 매번 정상. → `startUpdate` 가 문서가 열린 지 3초(`BOOT_SETTLE_MS`)가 지나기 전엔 보내지 않는다(필수 업데이트가 부팅 직후 시작하는 경우에 해당 · 덮개는 이미 떠 있고 15초 상한 안).
- e2e 의 `/app-version` 바꿔 끼우기는 page.route 대신 문서 안 fetch 교체로 한다(라우트는 진단 중 변수를 늘렸다).
