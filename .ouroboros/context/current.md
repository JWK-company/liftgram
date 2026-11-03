<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->
## 활성 작업 — 전용 앱(안드로이드·iOS): 껍데기 · 잠금화면 운동 카드 · 홈 위젯 (Project · 2026-11-03)
- 기획: BS-006 · URS-031·032 · SRS-095(껍데기)·096(잠금화면)·097(위젯)·098(광고 · 이번 범위 밖) · ADR-046(Capacitor+네이티브 확장 · 세션 정본=웹 로컬 기록) · PRD 무광고 방침 변경 · 전부 PLM 동기
- 스펙 `docs/spec/20261103_native-app/spec.md` · phase = qa spec 진행 중 → execute(P0 껍데기·시범 → P1 잠금화면 → P2 위젯 → P3 출시 준비)
- 확정: 앱 ID org.tarae.liftgram · 동업자 계정(북타래와 같음) · 안드로이드 먼저 출시 · 아이폰 실기기 없음(시뮬레이터) · 북타래 feat/ios-app 의 src/mobile 구조 복사(북타래 저장소 수정 금지)
- 작업 범위: `src/mobile/**`(새) · `src/frontend/lib/{native,platform}.ts` · SessionProvider·세션 화면 · `src/core/src/domain/lockScreen.ts` · 백엔드 oauth(apple)·auth(계정 삭제) · proto
- 차단: Xcode 26 미설치(iOS 빌드 보류) · Play 계정 유형(개인이면 테스터 12명·14일) · Apple 로그인 키
- 수익 모델 보고서 `docs/report/20261103_monetization-ads-subscription_report.html` · https://claude.ai/artifact/6WR1JNBCHr6XLbr96GvdRP
## 직전 작업(완료) — 종목 갭 보강: 오픈짐 대조로 없는 동작 106종목 (Task · URS-030 · SRS-094) · 2026-10-30
- **v0.56.0 운영 배포 완료**(build 430 · 8782ecd · tag) · 서버 종목 480 → 587(활성 575 · 통합 행 1) · 배포 전 `pre-catalog-gap-20261030-073147.dump`
- 오픈짐 근력 4,073줄 전수 대조(이미 있음 2,161 · 넣지 않음 1,487 · 없는 동작 183 = A10·B104·C69) → 사용자 A+B 선택 → qa 반영 106 · 같은 동작 6종은 기존 별칭(인클라인 클로즈그립은 통합 행 grip=close)
- family 안 기구 유일(형제 맵) 때문에 30종목 제 family · 새 family 62 · 전용 픽토그램 원형 7(백 레버·티비알리스·배큠·크랩 워크·버트 킥·스탠딩 니 투 엘보·닐링 힙 쓰러스트)
- 근거·스크립트 `docs/spec/20261030_catalog-gap/`(build_rows·apply = 8ba8a60 기준 재생성) · qa `docs/qa/20261030_catalog-gap-{spec,code}_qa.md` · 운영 dry-run 기록 블록 774 변화 0
- 검증: make verify 554 · 로컬 전체 e2e 284/305(실패 4 = 환경 기지) · 카탈로그 e2e 29 · 운영 e2e catalog-gap 4/4 · 카탈로그 받기 첫 2페이지 경로
- 보류: C등급 69 · 새 종목 대체 운동 큐레이션 · 기존 행 similar 역링크 · qa L(원암 풀업 예외 메모·케이블 사이드 크런치 영상 확인 등) · worktree `../liftgram-wt-catalog`
## 직전 작업(완료) — 루틴 만들기 입구·전체 화면 종목 고르기 (Task · URS-029 · SRS-093) · 2026-10-30
- **v0.54.0 운영 배포 완료**(build 422 · 25f9d2b · tag) · 홈 「새 루틴 만들기」=「빠른 운동 시작」 같은 크기(루틴 0개면 빨강) · 루틴 편집 「운동 추가」=전체 화면 피커(검색·도우미·근육군·기구 · 다중 선택 「N개 추가」 · 교체 즉시) `ExercisePickerScreen.tsx`
- qa code `docs/qa/20261030_routine-picker-code_qa.md`(H 없음 · M-1~6 조치: batch 추가 `addExercisesToRoutine`·순서값 최댓값+1·포커스·뒤로=닫기·memo) · 운영 e2e routine-picker 7/7 · 로컬 회귀 73+28 · 단위 545
- **v0.54.1 운영 배포 완료**(build 424 · 327ae68 · tag) — 홈 순서 오늘 할 운동 → 놓친 루틴 → 새 루틴·빠른 운동 · homeReady 에 사용자 로딩·열쇠별 완료일 · qa `docs/qa/20261030_home-card-order-code_qa.md`(M-1·2 조치 · 원격 동기로 스케줄이 새로 생기는 경우 보류) · 운영 e2e 17/17
- **v0.55.0 운영 배포 완료**(build 426 · 9e67a97 · tag) — 운동 중 「종목 추가」도 전체 화면 다중 선택 · 업데이트 점 버그(새로고침으로 이미 새 번들인데 같은 버전 대기 워커 때문에 점) → 같은 버전은 조용히 넘김·낮은 버전 무시(SRS-085 후속) · qa `docs/qa/20261030_update-dot-workout-picker-code_qa.md`(M-1~4·L-7 조치) · 전체 e2e 282/301(실패 4 = 환경 기지) · worktree `../liftgram-wt-picker`
## 직전 작업(완료) — 기록 보호 2차 (Project · URS-027 · SRS-086~089) · 2026-10-28
- 스펙 `.ouroboros/docs/spec/20261028_data-safety-2/spec.md`(§11 rev2·rev3 가 앞을 덮어씀) · qa spec `qa/20261028_data-safety-2-spec_qa.md`(조건부) · P4 재검토 `qa/20261028_data-safety-2-p4-respec_qa.md`(조건부 → rev3 「트랜잭션 안 거부 + 모듈 문」 채택)
- worktree `../liftgram-wt-safety` · 브랜치 `feat/data-safety-2` · 로컬 운영 빌드 3200/3201 (`scratchpad/ds2/up.sh`)
- **P1 = v0.50.0 운영 배포 완료**(build 403 · e06e59a · tag v0.50.0 · 병행 세션이 v0.49.0 근육 지도를 먼저 배포) — 로그인 유도 + 피드백(운동 헤더 sticky·순서 버튼 왼쪽) · qa code `qa/20261028_data-safety-2-p1-code_qa.md`(H 없음·M-1~3 조치) · e2e 32+9 · 운영 스모크 2/2 · 남은 L(슈퍼셋 머리 순서 버튼·접근 이름·데스크톱 문구) 보류
- **P2+P3 = v0.51.0 운영 배포 완료**(build 406 · e231a56 · tag) · qa code `qa/20261028_data-safety-2-p2p3-code_qa.md`(H-1 72h 창·M-1~4 조치) · 배포 전 `pre-ops-0020-20261028-021756.dump` · 첫 backup·restore-test 손으로 OK(users 3·sync 6890 일치) · cron 04:17 daily·매월 1일 04:47 복원 시험 · 테스트 계정 2개는 다른 세션이 01:26 삭제(`pre-delete-test-accounts-*` 백업)
- **P4 = v0.52.0 운영 배포 완료**(build 413 · a359f3e · tag) — lokijs 패치(트랜잭션 안 거부 LOKI_STALE)+쓰기 문+주인 잠금·덮개 · qa code `qa/20261028_data-safety-2-p4-code_qa.md`(H 없음·M-1~5 조치) · 로컬 e2e 36/36 · 운영 스모크 multi-tab ①③④⑦⑨⑩ 통과(④-2 는 운영 Turnstile 로 가입 불가) · 남은 L-3~L-6 · 후속: 빈 DB 첫 실행 시드·카탈로그 Duplicate key 경합(부하 1회 재현) 조사
- 운영진: jh21star@gmail.com admin 부여(직전 백업 `pre-admin-grant-20261028-004109.dump`) · 백업 디스크 = /home(sda) ≠ DB(sdb) · /m2 는 동업자 영역이라 안 씀
## 크리에이터 루틴 — v0.53.0 운영 배포 완료 (세션 6710ac69 · 2026-10-28)
- SRS-091·092 · ADR-045 · build 420 · e69c7b5 · 콘셉트 루틴 = 주제 3(어깨깡패·3대 500·퇴근 후 짧게) × 유튜버 영상 버전 6(이장민·킹유진·Chris Bumstead / 메루치 5×5 / 핏블리·덕코치) · MQ 5×5 draft · 옛 AI 콘셉트 4개 화면 제외(데이터 보존)
- 근거 = 공식 Data API 설명란(키 `src/.env` YOUTUBE_API_KEY · 보관 안 함) · 씨범은 Fitness Volt 분석 기사 basis · 점검 `node src/scripts/check-creator-routines.mjs`(30일마다) · 설명란 읽기 `src/scripts/youtube-describe.mjs`
- 운영 확인: /app-version 0.53.0 · 운영 e2e(씨범 근거 링크) 통과 · qa `docs/qa/20261028_creator-routines-{spec,code}_qa.md`
- 이전: v0.49.0 근육 지도 MuscleMap 교체(SRS-090) · 운영 테스트 계정 2개 삭제(`pre-delete-test-accounts-20261028-012646.dump`)
## 세션 상태 (2026-10-30)
- 운영 = `https://liftgram.tarae.org` **v0.56.0 (build 430)** · 질문·보고는 터미널 · 배포마다 SemVer+태그
- 팀원 기록 복구 완료(운동 36→73 · 8/25~10/26 이어짐 · 오늘 0볼륨 2건은 팀원이 지우면 됨) · 보고서 Docs `https://claude.ai/artifact/NfDMSjDGLLfARSpTuNNa54`
- 보류: 수동 업데이트 L-2·L-3·L-4·L-7·iOS/삼성 실기기 · #63 L-2~L-10 · #55·#25 · 홈 M-3 a/M-1 4안
## 최근 완료 (2026-10-26~28 · 상세는 각 spec/qa/report 와 git 로그)
- v0.48.0 수동 업데이트(SRS-085): 띠·자동 적용 제거(주석 보존) · 프로필 「업데이트」 버튼+덮개(15초 실패) · 운동 중 비활성 · 탭 점 · `/app-version`+`MIN_CLIENT_VERSION`(비어 있음=꺼짐) · 크롬 load 직후 skip-waiting 멈춤 → `lib/swActivate.ts` · 스펙 `docs/spec/20261027_manual-update/` · QA `docs/qa/20261027_manual-update-{spec,code}_qa.md`
- v0.45.0 피드백 #62~#64(SRS-084): 블록 도구 줄 · 플레이트 한쪽 기본(family `load_default`·미정 1회 질문) · 완료 직후 새 버전 보류 · PLM #62~#64 완료 · `docs/spec/20261027_feedback-62-64/`
- v0.42.0~v0.47.0 openGym 추천 P1~P5(URS-024~026·SRS-073~082) · `docs/spec/20261027_opengym-recs/`
- v0.39.0~v0.41.3 화면 정리 P1~P4(URS-023·SRS-069~072) · 세션 refresh 경합(SRS-083) · 홈 주 행동
- v0.35.0~v0.38.0 루틴 반영·저장(SRS-059·060) · 운동 중 보조(SRS-061~063) · 기록 돌아보기(SRS-064~066) · kg/lb 토글
- v0.30.0~v0.34.4 종목 카탈로그 대개편(URS-018·SRS-055~058·ADR-033~037) · 백업 `pre-catalog-revamp-20261026-122547.dump`
## 채널 담당 (2026-07-28 지시) — **세션 281e6e0e 단독**. 다른 세션은 채널 메시지를 받아도 대기(동시 편집 레이스 방지).
## 세션 상태 — 웹 스택 교체 진행 중 (모든 소셜 슬라이스는 2026-08-03 작업)
**기획(완료)**: BS-004 구현(SRS-043~048) · 와이어프레임 42화면 · BP-001(bpcheck PASS) · 출시 준비 RM-019 Draft — 상세는 PLM 대시보드. · **지난 이력**: autorun SRS-043~047 125테스트 ✓ · v0.10.0~v0.14.1 배포 · **배포마다 SemVer 필수**(app.json + appInfo.ts 2곳).
## 웹 스택 교체(tarae-web-stack → src/) — 이식 완료·푸시됨
**방향 확정(사용자 2026-08-01)**: 웹 스택 전부 교체하되 **현재 임시 배포는 유지** → **ADR-031**(supersedes ADR-018 · informs SAD-001/004/011/013). 이행은 병존(strangler). 오프라인 우선은 **ADR-032**.
| 항목 | 상태 |
|------|------|
| 이식·정체성 | 템플릿 → `src/`(**.git 미포함**) · 포트 3100/3101/5434/6381 · Go 모듈 liftgram화(buf 재생성 — 텍스트 치환은 .pb.go 디스크립터를 깨뜨림) |
| 고친 템플릿 결함 | macOS `timeout` 부재 · `server.mjs` HMR 업그레이드 절단 · Next16 dev origin 가드 · Dockerfile 워크스페이스 누락 (**원본에도 있는 결함 — 역이식 대상**) |
| @plm 오염·무변경 | 템플릿 주석 76개 → 루트 `.plmignore`의 `src/**`(인프라 SRS 결정 후 해제) · `app/`·`server/` **무변경** |
## 프로덕션 교체 — **완료** (2026-10-26) · 운영 = `https://liftgram.tarae.org` · v0.16.0 (`4612735`)
**구성**: h2500-3 docker compose(`-p liftgram -f compose.yaml -f compose.prod.yaml`) + booktarae CF 터널 공개 호스트명 → `localhost:3410` · **DB = 같은 서버 compose db**(Neon에서 이전 · 왕복 220ms→7ms · origin 화면 ~15ms) · 배포 = `src/scripts/deploy-h2500-3.sh` · 백업 = cron 04:17 `backup-h2500-3.sh`(DB 매일 14·사진 매주 4)
**질문은 터미널에서**(PLM 채널 금지 — 사용자 2026-10-26)

## 이관 진행 (ADR-031 · ADR-032)
**전략**: 오프라인 우선. domain·data·db·i18n·theme·state는 **이전(재작성 금지)** → `src/core`(68파일). `features/*`·`components`만 재작성(RN→DOM). **Go로 도메인 재구현 금지.** 원본=`app/src/` · `make core-check`가 드리프트 차단. **완료**: 카탈로그(336종·app 시드와 기구분포 일치) · domain 154테스트 · db 스키마 v20·Repository 7종 · 화면 4개 영역 5,500여 LOC 동형 재현.
**밟은 함정(실측·수정)**: `.pb.go` 디스크립터 · `@plm` 오염 · 생성기 앵커 · 404 상태 · macOS `timeout` · dev 하이드레이션 · SWC 데코레이터 · `Q.like` 한글 미필터 · **LokiJS 비동기 flush** · 개정번호 게이팅 · 마운트 중복조회 · flex `min-w-0` · dash `wait -n` · 공통 로더의 비밀 검증 · **named volume 소유자** · **화면 마운트 직후의 익명 요청**(스트림·역할 게이트 둘 다 여기서 깨졌다)
**검증(매 슬라이스)**: `make verify` · **e2e 94종** · **smoke 10종** — dev·프로덕션·합본 컨테이너 · `app/`·`server/` 변경 0건

## 기록 손실 복구 · 데이터 보호 (2026-10-26 · v0.18.0 `14b078c` 운영)
- **사고**: 옛 앱 동기가 8월부터 조용히 실패(서버 레코드 65건의 `_status`가 pull을 죽임) → 운동 32건 등 2,343행이 폰 IndexedDB에만. 옛 주소에 `recover.html`(IndexedDB 덤프)을 올려 회수 → 서버에 합침(전 행 일치 검증) · 오염 65건 정리 · 설정 3종 복원(주간목표 6·주말제외·볼륨 mid)
- **방지(SRS-053)**: 동기 건강 경고 띠 · 계정 전환 가드(미동기 있으면 지우지 않음) · 백업 파일 내보내기/가져오기(옛 복구 파일 호환) · 설정 프로필 동기(로컬 스키마 v21 app_prefs) · 첫 동기 전 빈 프로필 생성 금지(+single-flight) · e2e data-safety 4종
- **app/ 은퇴 → core가 원본**(sync-core는 토큰 CSS만) · 버전 규칙: 배포 스크립트가 같은 버전 재배포 거부·build 번호·git 태그·프로필 하단 표시
- e2e 전체: 88 통과 · 실패 6 중 profile 2건은 회귀(수정함) · 나머지 DM·스토리는 부하 flake(단독 재실행 통과)
## 정식 계정 (SRS-052) — v0.19.0 `fe616c4` 운영 · 키 대기
- 구현·배포 완료: 이메일 확인(24h·재발송 60초) · 비밀번호 찾기/재설정(30분·1회·전 세션 끊김) · 변경/설정 · 소셜(구글·카카오·네이버 · state·PKCE · 일회용 로그인 코드 → /auth/complete · 같은 주소 자동 합병 금지 · 2분 연결 표 · 마지막 수단 해제 금지) · Turnstile · 인증 IP당 10회/분 · **XFF 위조 구멍 수정**(운영 실측: 위조 XFF로도 11번째 차단)
- **메일 켜짐(2026-10-26)**: CF Email Sending tarae.org(SPF·DKIM·DMARC PASS — 사용자 Gmail 원본 확인) · 토큰 IP 118.128.43.242 제한 · 465 implicit TLS · 배포 점검이 SMTP 로그인 확인
- v0.20.0 `cc74e3d`: 미확인 72h 뒤 소셜 쓰기 제한(VerifiedGate) · 운영 .env TRUST_CF_CONNECTING_IP=1 · AUTH_RATE_LIMIT=10
- 테스트: Go 계정 규칙 11 · e2e auth-formal 7(Mailpit 실메일 · 가짜 제공자는 `-tags=oauthfake`, BASE=http://localhost:3100 필요 — state 쿠키가 APP_URL 호스트에 묶임)

## 디자인 시스템 (2026-10-26) — v0.23.0 `fc479ba` 운영
- 사용자 확정: 로고 B1(사선 L) · 주황 · 라이트+다크 · 회사 정보 booktarae 동일(같은 회사 제품). 기준 = booktarae 피그마 v2.0, **브랜드만 주황**
- 토큰 2층(`--p-*`→`--color-*`, core `tokens.ts` colors/darkColors → `make sync-core`) · 테마 = 시스템 기본 + 프로필 [화면 테마](키 `liftgram.theme` · 계정 동기) · head 스크립트로 첫 페인트 전 적용
- AA 때문에 브랜드 2색: 글자·버튼 #C8381C / 로고·장식 #FF5A36 · 다크 #FF7A57+#161616 글자 · Pretendard 자체 호스팅
- 「최근」 배지: 콜백 `&via=` → `/api/session` 이 HttpOnly `lg_last`(1년) → 서버 페이지가 버튼에 · 고친 경합: 소셜 착지가 쿠키 저장을 끊고 이동 · e2e 착지 직후 goto
- e2e 110: 102 통과 · dm·profile-edit 단독 통과(flake) · offline 3 = 운영 빌드 전용(운영 대상 4/4 통과) · 스크린샷 390px 라이트/다크 18장(스크래치패드)
- 지난 이관 기록(UI 이관·마무리 묶음·파리티 점검·이관 스크립트·소셜 슬라이스)은 git 로그 feat/web-stack-tarae 와 e30345a 이전 current.md 에.
