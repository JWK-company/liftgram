# 보고 — 앱 업데이트는 프로필 버튼 하나로 (SRS-085 · v0.48.0)

> 2026-10-27 · 등급 Feature · **커밋까지만**(push·배포 안 함 — 독립 검토자 qa code 뒤 main 이 배포)
> 브랜치 `feat/manual-update` · worktree `/Users/woobi/Desktop/tarae/liftgram-wt-update` · 기준 `feat/web-stack-tarae` 698f98d(병행 세션 v0.47.0 d29b92c 포함) 위로 rebase
> 커밋: 이 보고서와 같은 커밋(해시는 `git log -1 feat/manual-update`)
> 문서: 스펙 `.ouroboros/docs/spec/20261027_manual-update/spec.md` · QA spec `.ouroboros/docs/qa/20261027_manual-update-spec_qa.md` · 요구 `.ouroboros/docs/requirements/SRS-085.json`

## 1. 바뀐 것

| 전 (v0.47.0) | 후 (v0.48.0) |
|------|------|
| 하단 띠 「새 버전이 있어요 · 새로고침」 | 없음 — 프로필 「앱 버전 v0.48.0」 줄의 「업데이트」 버튼 한 곳 |
| 운동 중이 아니면 자동 적용(새로고침) · /workout 은 떠날 때 | 앱을 쓰는 동안 저절로 적용·새로고침 없음(어느 화면이든) |
| 다른 탭이 적용하면 이 탭도 새로고침 | 새로고침하지 않고 「새로고침하면 새 버전이 적용돼요」 + 버튼(새로고침만) |
| — | 누르면 로고 스피너 전체 화면 덮개(뒤 화면 inert) → DB 내려쓰기 → skip-waiting → 새 문서 첫 그림까지 덮개(sessionStorage 표식 + 첫 칠하기 전 스크립트) · 15초 넘으면 「업데이트하지 못했어요 · 다시 시도 · 닫기」 |
| — | 운동 중 버튼 비활성 + 「운동을 끝낸 뒤 업데이트할 수 있어요」(셸 상태 + 누른 순간 기기 DB 재확인) |
| — | 새 버전 대기 중이면 프로필 탭에 작은 회색 점(ink2) · 접근 이름 「새 버전 있음」 |
| — | 필수 업데이트: web 공개 `GET /app-version` → `{version, minClientVersion}`(no-store) · `MIN_CLIENT_VERSION`(기본 빈 값) · 현재 < 최소이고 서버가 그 버전을 가졌을 때만 운동 화면 밖에서 같은 덮개 |
| sw.js 에 버전 없음 | 빌드가 `APP_VERSION` 을 새김 · 워커가 `{type:"version"}` 에 `{version, build}` 로 답함 → 「새 버전 v0.49.0」 표시 |

앱을 완전히 닫았다 열 때 브라우저가 기다리던 워커를 활성화하는 것은 그대로(새 문서가 처음부터 새 워커 — controllerchange 없음).

코드 보존(§3.6): `ServiceWorker.tsx` 옛 본체(띠·자동 적용·미룬 새로고침)는 통째로 주석 + [원본]/[개선] · core 옛 판정 3함수·테스트 보존 · 옛 문구 키 보존.

## 2. 테스트

| 항목 | 결과 |
|------|------|
| core 단위 `swUpdatePolicy.test.ts` (+6건) | 수정 전 실패(새 export 없음 SyntaxError) → 통과 |
| `make verify` | 통과(core·도메인 507 pass · lint · typecheck · go · core/catalog/docs-check). 한 번 `exerciseSearch` 50ms 성능 테스트가 부하로 84ms 실패 → 재실행 통과(무관한 타이밍) |
| 새 e2e `src/frontend/e2e/manual-update.spec.ts` 8건(E1~E8 · 진짜 서비스워커: 디스크 sw.js 의 BUILD_ID·APP_VERSION 을 바꿔 진짜 설치된 waiting 워커) | 로컬 운영 빌드(웹 3500·API 3501·새 DB) **8/8 × 3회 + E7 ×4 통과** |
| 수정 전 실패 | 같은 e2e 를 수정 전 코드(1037250 · 별도 worktree `liftgram-wt-update-base` 운영 빌드 · 웹 3510)에 대고 **8/8 실패** — E2: 새 워커가 생기자마자 홈에서 자동 적용(waiting 을 볼 수 없음) · E5: 요약을 닫고 홈에 가자 새로고침 · E8 404 · 나머지는 버튼·덮개 없음 |
| 기존 e2e `feedback-62-64`(#64 두 건은 새 정책으로 기대 변경 — 「홈 가면 적용」 → 「홈에서도 없음 · 프로필 버튼으로만」) · offline · profile · workout · home-primary · data-safety | 30/30 통과 |
| 스크린샷 390px 라이트/다크 12장 | `.ouroboros/docs/spec/20261027_manual-update/shots/`(프로필 대기 없음·업데이트·운동 중 비활성 · 탭 점 · 덮개 진행·실패) |

## 3. 실행 중 발견 (중요)

- **크롬: 새로고침 직후 곧바로 보낸 skip-waiting 이 영영 활성화되지 않는 경우**가 있다. 테스트가 페이지 밖에서 직접 보내도 4번 중 1번, 앱 경로에선 8번 중 최대 6번 `installed` 에 멈췄고 다시 보내도 풀리지 않았다(옛 워커의 진행 중 fetch 는 비어 있었다 — 원인은 브라우저 쪽으로 추정). 3초 뒤는 매번 정상. → 문서가 열린 지 3초가 지나기 전엔 보내지 않게 했다(`lib/appUpdate.ts` `BOOT_SETTLE_MS`). 해당 경우는 부팅 직후 시작하는 필수 업데이트. 고친 뒤 E7 7/7 통과.
- 옛 띠 방식에서 「될 때도 안 될 때도」 의 한 원인이었을 수 있다(v0.45 부터 부팅 직후 자동 적용).

## 4. 남은 위험

| # | 내용 |
|---|------|
| R1 | **전환기(사용자 알림점)**: 이번 배포를 받는 기존 기기는 아직 옛 번들(v0.47.0)이 돌고 있어 **옛 방식으로 한 번 더** 업데이트된다 — 운동 화면 밖이면 옛 자동 적용(새로고침 1회), 운동 중·요약이면 떠날 때. 그 뒤부터 새 방식(프로필 버튼). 운영 확인은 「옛 기기 → 한 번 저절로 새로고침 → 프로필에 앱 버전 줄」 순서로 보면 된다 |
| R2 | 사람이 끝내 누르지 않으면 오래 옛 버전 — 앱을 완전히 닫았다 열면 브라우저가 활성화. 특히 iOS 홈 화면 앱은 완전히 닫히는 일이 드물다 → 탭 점이 알림 · 꼭 필요하면 `MIN_CLIENT_VERSION` |
| R3 | 다른 탭이 적용한 뒤 이 탭은 옛 번들로 새 워커 아래에서 돈다 — 옛 정적 캐시 한 세대 보존으로 버팀(두 세대 밀리면 조각 404 → Next 전체 이동) |
| R4 | 덮개 중 Android 뒤로 가기·iOS 가장자리 스와이프는 inert 로 못 막는다(QA M-3 보류 — 곧 새로고침, 기록은 이미 내려씀) |
| R5 | 느린 망에서 필수 경로의 첫 설치가 15초를 넘으면 실패 화면 → 다시 시도(설치는 뒤에서 계속) |
| R6 | 부팅 직후 3초 대기 규칙은 크롬 실측 근거 — 사파리·삼성 인터넷 실기기 미확인 |
| R7 | 실기기(iOS·Android 홈 화면 앱) 미확인 — 로컬 운영 빌드·데스크톱 크로미움 e2e 만 |

## 5. 배포·설정 메모 (검토자)

- 서버 `.env` 는 건드리지 않았다. 필수 업데이트를 켜려면 서버 `src/.env` 에 `MIN_CLIENT_VERSION=0.48.0` 등 → web 재시작(compose 가 `${MIN_CLIENT_VERSION:-}` 로 넘김 · README 설정 표에 추가). 배포된 버전보다 높게 적으면 무시된다.
- 배포 스크립트 변경 없음. `/app-version` 은 Next 를 거치지 않는 web 서버 경로라 헬스처럼 로그에서 뺐다.
- 검토 포인트: `src/frontend/lib/appUpdate.ts`(상태·절차) · `app/components/ServiceWorker.tsx` · `UpdateOverlay.tsx` · `profile/AppVersionRow.tsx` · `ui/TabBar.tsx` · `layout.tsx`(부팅 덮개) · `sw/sw.template.js`·`scripts/build-sw.mjs` · `server.mjs` · core `domain/swUpdatePolicy.ts`.
- 정리: 비교용 worktree `liftgram-wt-update-base` 는 제거했다. 로컬 e2e DB(`e2e_mu_*`)는 남겨 둠.
