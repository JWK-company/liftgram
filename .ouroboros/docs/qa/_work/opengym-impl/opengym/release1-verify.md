<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym 추천 첫 배포 직전 전체 검증 (2026-10-27)

- 대상: worktree `/Users/woobi/Desktop/tarae/liftgram-wt-opengym` · 브랜치 `feat/opengym-recs`(HEAD 02a36c4, 712a24c 위로 rebase된 상태)
- 환경: 운영 빌드 웹 3300 · API 3301 · DB `e2e_og_rel_10271738`(docker liftgram-db-1) · Redis 6381 · Mailpit 1026 · `AUTH_RATE_LIMIT=0`
  (env = 이전 세션 frs-env.sh에서 DB·포트만 바꿈). 3100·3200·3201은 건드리지 않음. 코드 수정 없음.

## 1. 정적 검사·유닛

| 항목 | 결과 |
|---|---|
| `make verify` | **통과(EXIT 0)** — lint: 오류 0(경고 3·정보 2, 기존 `scripts/gen-page.mjs` 템플릿 문자열 등) · tsc frontend/contracts/core · go build/vet · go test · core 테스트 **445/445** · core-check · catalog-check(480행) · docs-check(설정 키 47 · make 타깃 68) |
| `go test ./...`(-count=1) | **통과** — PASS 264 · SKIP 5(실제 Postgres 테스트, 주소 없어 건너뜀) |
| 같은 테스트 + `LIFTGRAM_TEST_DATABASE_URL`(마이그레이션 끝난 스크래치 DB) | **269/269 통과** — 건너뛰던 PG 5건(요약 흐름·큰 숫자/서로게이트·하루 상한 동시 요청·원본 레코드 SQL 필터·jsonb concat)도 통과. 「0017 늦게 적용」 DB에서도 PG 5건 통과 |
| `go vet ./...` | **통과** |
| `make proto-check` | **통과** — 「계약 생성물이 최신입니다」, git diff 없음 |
| `bun run build` | **통과** (Go server·migrate + next build + sw, 미리 받기 103개) |

## 2. e2e (운영 빌드 3300)

### opengym-*.spec.ts (opengym-rir + opengym-qa1, 15건)
- **14 통과 · 1 실패** — `opengym-rir.spec.ts:273 좌표 — 꺼짐 = 기준선 …`
- 단독 재실행 `--repeat-each=4`(360·390 각 4회): **4 통과 · 4 실패** → 고정 실패가 아니라 **약 50% 확률로 흔들림**
- 실패하는 곳은 늘 `offAgain`(켰다가 끈 뒤 다시 잰 값)이다. set2 333→371, addSet 385→461 = 칩 줄이 그대로 남아 있음. 실패 스크린샷에서도 「힘든 정도」 칩이 보인다.

### 원인 판정 — 테스트만의 문제가 아니라 **앱의 경합(실제 동작)**
- `setEffortLogging(false)`는 localStorage에 "0"을 바로 쓴다. 프로필 `app_prefs` 쓰기(`writeToProfile` → `updateUserSettings` → `flushLocalDb`)는 비동기로 따로 돈다.
- 이 쓰기가 끝나기 전에 페이지를 새로 불러오면 로컬 DB에는 옛 `app_prefs`("1")가 남아 있다. 그러면 `PrefsBridge` → `applyProfilePrefs`가 localStorage를 **"1"로 되돌린다**. 켤 때는 app_prefs가 비어 있어서 로컬 값을 올리는 쪽으로 가므로 이 문제가 없다. 그래서 「끌 때」만 실패한다.
- 확인용 임시 spec(실행 뒤 삭제)으로 검증함. 끄고 **곧바로** 새로고침하면 4회 중 1회 `localStorage=1 · 칩 1개`로 되돌아갔다. **1.5초 기다린 뒤** 새로고침하면 4/4 정상이었다.
- 사용자 영향: 스위치를 끄고 1초 안에 앱을 닫거나 새로고침하면 다음에 켜진 채로 돌아올 수 있다. 데이터 손실은 아니고 표시 설정이 되돌아가는 정도다(낮음~중간). 앱 안에서 화면을 옮기는 정상 흐름에서는 쓰기가 끝나므로 드러나지 않는다.
- 이전 보고서(p1-ui·qa1)에서는 이 spec이 9/9 통과였다. 이번 rebase(712a24c 세션 갱신 직렬화 등)로 시작 시점 타이밍이 바뀌어 드러났을 가능성이 있다. 이는 추정이고 검증하지 않았다.
- 고칠 방향(참고, 이번에 수정하지 않음): 쓰기가 진행 중인 키는 `applyProfilePrefs`가 덮지 않게 하거나, app_prefs 쓰기를 localStorage 쓰기와 같은 시점에 끝나게 한다. 테스트에는 끈 뒤 `내려쓰기_대기`를 넣는다.

### 전체 e2e 1회 (201건, 7.5분)
- **186 통과 · 3 실패 · 12 건너뜀**
- 실패 3건
  1. `dm.spec.ts:157` 알림 3건 — 단독 재실행에서도 같은 자리(`feed-notifications` 클릭 대기 30s)에서 실패. **기존에 알려진 환경 실패**(메모리·p1-ui 보고서와 같음). 이번 변경과 무관.
  2·3. `opengym-rir.spec.ts:273` 좌표(360×640 · 390×844) — 위의 경합과 같은 원인.
- auth-formal 메일 2건은 이번에는 **통과**했다(Mailpit 1026 연결됨). 「원래 실패하는 2건」에 해당하지 않음.
- 건너뜀 12 = 환경 게이트(구글·카카오 OAuth 4 · declutter-shots 캡처 5 · 피드백 내부자 1 · 제휴 링크 1 · 모더레이션 검토자 1)
- session·workout·analytics·stats·profile·offline·sync·data-safety·routines·feed·coaching·declutter(block·p3·p4·summary)·session-refresh-race 전부 통과.

## 3. 캡처 — `.ouroboros-work/shots/release1/` (28장, 2x)
데이터: 벤치프레스 3회 운동(세트 7개, RIR 0~3 기록) + 진행 중 운동(세트 4개, 1세트 완료·RIR 2).
각 항목은 `{360x640,390x844}-{light,dark}` 4장이다.

| 파일 | 내용 | 판정 |
|---|---|---|
| workout-rir-on-* | RIR 켬: 완료 세트 칩 「2」, 나머지 「힘든 정도」 칩 둘째 줄 | 겹침·잘림 없음. 360에서 종목명이 「바벨 벤치프…」로 줄임(기존 동작) |
| workout-rir-off-* | RIR 끔: 칩 없이 한 줄씩 | 정상 |
| stats-top-* / stats-full-* | 분석 첫 화면·전체 | 정상 |
| stats-1rm-* | 1RM 카드(80kg)·Epley 안내·근육군 분포 | 정상 |
| stats-effortcard-* | 「평균 여유 1.6개 · 여유 3개 이하 100%」·기록한 세트 7/7·구간 막대 5개 | 라이트·다크 대비 정상 |
| progress-full-* | 종목 상세: 추정 1RM 78kg/최고 80kg, 진척 막대 3개(가운데 채움)·범례 문구 | 정상. 전체 길이 캡처에서는 고정 「진행 중」 바가 중간에 찍히는데, fullPage 캡처 특성이라 버그가 아님 |

관찰(차단 아님)
- `workout-rir-on-360x640-light`: 세트 완료 직후 뜨는 「중량 PR 달성!」 토스트가 RIR/웜업 가이드 버튼 위에 겹친다. 캡처 시점이 사라지는 애니메이션 도중이라 반투명 상태여서 밑 글자가 비쳐 보인다. 일시적인 겹침이고 다른 캡처(0.6초 뒤)에서는 사라졌다. 기존 PR 토스트 동작이고 이번 변경과는 무관해 보인다.
- 화면 정리 P4 변경(회색 시작 버튼·버튼 꺾임 등)이 합쳐진 상태에서 세트 줄·분석 카드끼리의 겹침이나 깨짐은 찾지 못했다.

## 4. 서버 마이그레이션 (`bin/migrate`, 파일명 집합 기준 러너)
- 참고: 파일은 0000~0018이고 **0015는 없다**(번호 비어 있음, git 이력에도 없음). 총 18개.
- A. 빈 DB 전부 적용: **applied 18/18, EXIT 0**. 재실행하면 applied 0(멱등).
- B. 0017을 뺀 디렉터리로 먼저 적용(0018까지 17개) → 0017을 포함해 재실행: **0017만 apply, applied 1/18, EXIT 0**. `_migrations`에는 0018 다음에 0017이 기록된다.
- A와 B의 `pg_dump -s` 결과: **동일**(475줄, 무작위 `\restrict` 토큰만 다름). 두 DB 모두 exercises 480 · progress_summaries 테이블 · refresh_tokens.family_id/revoke_reason 있음.
- 각 DB에서 Go 실제-Postgres 테스트 통과(위 1절).

## 5. 정리
- 3300·3301 프로세스 종료(3100은 유지) · DB `e2e_og_rel_10271738`·`mig_og_rel_a_10271738`·`mig_og_rel_b_10271738` 삭제
- `.media/`·`src/frontend/test-results/` 삭제 · `next-env.d.ts` 빌드 부산물 원복 · 임시 spec 2개(설정 경합 확인·캡처) 삭제
- worktree에 남은 미추적 파일: `.ouroboros-work/`, `lefthook.yml`(작업 전부터 있었음)

## 배포 의견
**조건부 배포 가능.** 서버(마이그레이션 순서 무관·PG 통합)·정적 검사·핵심 e2e는 모두 깨끗하다. 다만 남은 한 건은 진짜 앱 경합이다. 「힘든 정도 기록」을 끄고 곧바로 새로고침하거나 앱을 닫으면 켜진 상태로 돌아올 수 있다.
- 영향이 표시 설정 하나에 그치고 데이터는 잃지 않으며, 기본값이 끔이라 대부분의 사용자는 아직 켜 본 적도 없다. 그래서 **배포를 막을 정도는 아니라고 본다.**
- 그래도 e2e가 50% 확률로 빨갛게 나오므로 둘 중 하나를 권한다. (a) 배포 전에 patch로 고친다(`applyProfilePrefs`가 진행 중인 쓰기를 덮지 않게, 또는 쓰기 완료 뒤 이동) — 권장. (b) 알려진 문제로 기록하고 다음 patch에서 고친다.
- dm:157은 기존 환경 실패라 배포 판단과 무관하다.
