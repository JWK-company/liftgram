<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->
## 활성 작업 — 없음 · 남은 피드백 보류 #55(파트너 운동 — 해석 미확정)·#25(팔로우 추천 — 사용자 늘면) · 다음 작업은 사용자 지시 대기
## 직전 작업 — 묶음 2 「기록 돌아보기·다시 하기」 (Feature · **완료** 2026-10-27 · v0.37.0 운영 build 331 · 9b726a2) · URS-021·SRS-064(총평 #52)·SRS-065(세트 조합·다시 시작·피드 바로 시작 #59)·SRS-066(하단 sticky #45·#43) · 스펙 `.ouroboros/docs/spec/20261027_history-replay/spec.md`
- /qa code 조치 `.ouroboros/docs/qa/20261027_history-replay-code_qa.md`: H-1(폐기·시작 한 batch)·M-1(공유 상한 앱+서버·바로 시작 미매칭 건너뜀)·M-2(막대 실측)·M-3(총평 숨김·멈춤 저장)·M-4(루틴 시작 회귀·슈퍼셋/워밍업 e2e)·L-1~L-5 수정 · L-6·L-7·L-8 보류
- 검증: core 280 · go · 로컬 운영 빌드 e2e 36+12 통과 · 운영 360×560 휴식 막대 bottom 544·요약 548 / 390×844(다크) 828·832 · 콘솔 오류 0 · PLM #52·#59·#45·#43 완료
## 직전 작업 — 묶음 1 「운동 중 보조」 (Feature · **완료** 2026-10-27 · v0.36.0 운영 build 328 · e53f2b8) · URS-020·SRS-061~063 · /qa code 조치 리포트 `.ouroboros/docs/qa/20261027_session-assist-code_qa.md`(H1·H2·M1~M6·L1·L4·L6·L8 수정, L2·L3·L5·L7·L9~L11 보류) · PLM #50·#51·#48·#56 완료
## 직전 작업 — 운동 완료 시 루틴 반영·루틴으로 저장 (Feature · **완료** 2026-10-27 · v0.35.0 운영 build 324 · bb53b04)
- 요구 URS-019·UCS-022·SRS-059(변경점 선택 반영)·SRS-060(루틴으로 저장) · 스펙 `.ouroboros/docs/spec/20261027_finish-routine-sync/spec.md` · 피드백 #46·#60·#59(일부) · 출시 v0.35.0
- 현재 위치: spec→qa spec→execute(6dd965c)→qa code(높음2·중간4·낮음6 전부 조치)→release v0.35.0 · 운영 빠른 운동→저장 시트·「루틴으로 저장했어요」 실확인 · PLM #46·#60 완료(#59 유지) · 리포트 `.ouroboros/docs/qa/20261027_finish-routine-sync-{spec,code}_qa.md`
## 직전 작업 — 종목 카탈로그 대개편 (Project · **완료** 2026-10-26 · v0.30.0~v0.34.1 운영)
- 요구 URS-018·UCS-020/021·SRS-055~058 · 결정 ADR-033~037(034=026·030 대체) · 스펙 `.ouroboros/docs/spec/20261026_exercise-catalog-revamp/`(spec.md·catalog-master.csv 480행·_context·_analysis)
- Phase: P0 기반(정본 CSV·gen-catalog·부팅 이관·동기 시드 무시)+P1 기록 칸 축 v0.30 → P2 카탈로그+운영 이관 v0.31 → P3 검색·별칭 v0.32 → P4 운동 중 UI v0.33 → P5 픽토그램 v0.34
- 작업 범위: src/core(seed·domain·migrations·sync·db) · src/frontend(Picker·CatalogClient·VariantSelector·session) · src/backend(exercise) · src/proto/exercise · src/database(0014·0015) · src/scripts/gen-catalog.mjs
- 현재 위치: **종목 개편 완료 — /qa code 조치 v0.34.1(build 317, 67b2b5e)** · H-1 옛 이름 심기 범위 제한(운영 잘못 심긴 행 0) · H-2 피드 가져오기 id/별칭 매칭 · M-1~M-4(한쪽 입력=안 한 세트만·선호 칸 단위 로컬 우선·생성기 새 번호·스키마 v23 숨김) · 리포트 `.ouroboros/docs/qa/20261026_catalog-revamp-code_qa.md` · 보류 L-1·L-4·L-7 · P2 백업 h2500-3:~/liftgram/backups/pre-catalog-revamp-20261026-122547.dump

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

## UI 이관 — "같은 앱으로 보이게" (2026-08-03)
**목표**: 픽셀 100%가 아니라 "같은 앱으로 보이고 같은 흐름"(다른 것 = 탭 내비→웹 라우팅·드래그/스와이프·네이티브 전용). **대조**: `npx expo export --platform web` → 4599 포트에 띄우고 나란히 비교(app/dist는 gitignore).
| 완료 | 내용 |
|------|------|
| ①~③ 토큰·컴포넌트·문구 | `theme/tokens.ts`→core→`make sync-core`가 CSS 생성(드리프트 검사) · `components/ui/` 15종(Icon 67 · Dialog · TextArea · Avatar…) · `lib/i18n.ts`가 core 로케일을 읽는다(한국어 하드코딩 금지) |
| ④ 셸 | 화면별 제목 헤더 + 하단 탭 바 · 폭 560px(폰) · **전역 운동 바**(탭 바 위, 누르면 세션 복귀) |
| ⑤~⑧ 종목·세션 | 카탈로그·스무고개·상세(2컷 시연·대체운동) · ActiveWorkoutScreen 1:1(가이드·종목블록·세트줄·메모이력·휴식바·PR 폭죽·완료 요약) |
| ⑨~⑪ 루틴 | 운동 탭(진행중·주간스케줄·콘셉트 루틴 4종·폴더 목록) · 편집기(스테퍼·변형칩·처방 W/T/B·슈퍼셋·대체·유산소 목표) |
| ⑫~⑬ 기록·분석·프로필 | `/history`(+상세) · `/calendar` · `/stats`(1RM·추세·분포·PR) · `/profile`(단위·언어·체중·기구·**알림음 4×3**) · `/gear` |
**RN→DOM 대체**: `Alert.alert`→`Dialog.tsx` 4종 · `Modal`→포털 · `Animated`→CSS keyframes · `utils/sound`→`lib/restSound.ts`(tanh 소프트클립) · `sync/prefs`→`lib/prefs.ts`(키 동일) · `expo-image-picker`→숨긴 file input+canvas 축소. 이름 표기는 도메인 `exerciseListName`('벤치프레스 (바벨)'). · **웹에서 달라진 판단**: ① 빈 초안 방지(첫 변경까지 루틴 생성 유예) ② flush 규율(`scheduleFlush`+`navigateAfterFlush`).
**IA**: 종목 탭 없음(피커 진입) → `/`=운동 탭, 카탈로그=`/exercises`. 탭 = 운동·**피드**·기록·캘린더·분석·프로필(app 6개 전부). · **화면 32/32 완료**. 그 밖: 유산소 세트행 · 온보딩 · 주간 스케줄 편집 모달 · 드래그 재배치 · 캐치업 카드 · 월 결산 자랑하기. 탭 바는 화면이 생길 때마다 늘린다(죽은 탭 금지).

## 소셜·동기·코칭 슬라이스 (2026-08-03) — 계정·피드·미디어·스토리·DM·알림·모더레이션·장비·발견·피드백·헬스장·동기 엔진·코칭 전부 완료. 설계 판단·밟은 함정은 git 로그(feat/web-stack-tarae)와 각 커밋 메시지에.

## 마무리 묶음 (2026-08-04)
- **브랜치 분리**: `feat/web-stack-tarae` — 층별 8커밋(골격·계약·DB·백엔드·core·화면·e2e·거버넌스). 각 커밋은 이식의 층을 나눈 것이라 **HEAD에서만 빌드된다** · 유산소 세트행(SRS-030): 무게·횟수 대신 **종목이 정한 지표**(러닝머신=시간·거리·경사·속도·줄넘기=시간만) · 저장 초·미터/입력 분·km(변환은 도메인 한 곳) · 볼륨 칩 대신 총 시간·거리
- 온보딩(SRS-045): 두 장·전부 건너뛸 수 있다 · 본 표시는 localStorage(서버면 로그인 전엔 모르고 로컬 DB면 계정 바꿀 때 지워진다) · **e2e 기본을 "이미 본"으로** 두지 않으면 전 테스트가 안내부터 닫아야 한다 · 저장을 **기다린 뒤** 닫는다(닫자마자 이동하면 사라진다)
- **refresh → httpOnly 쿠키**: 값이 브라우저 스크립트에 한 번도 나타나지 않는다(XSS가 나도 15분짜리 access뿐). 갱신·폐기는 `/api/session*` 라우트가 대신한다 · CSRF는 `SameSite=Strict`+커스텀 헤더 두 겹 · 옛 localStorage 토큰은 **한 번 이행**(없으면 기존 로그인이 전부 풀린다)
- 사진 메시지: 계약·서버는 이미 있었고 **보내는 절반만** 없었다 — 올린 뒤 보낸다(실패하면 아예 안 보낸다·빈 말풍선 방지) · **전체 e2e 86종 중 81통과·2 부하 flake(단독·소그룹 실행은 전부 통과)·3 env 게이트 skip**. 전체 실행이 17분으로 늘었고 CPU 10%(=대기) — e2e DB에 계정·동기행 5만이 쌓인 탓으로 보인다. 관찰: **시드 카탈로그 336종이 계정마다 서버로 올라간다**(app과 같은 동작이나 규모가 커지면 낭비 — 별도 판단 필요)

## 파리티 전수 점검 — 빠진 기능 채우기 (2026-08-04)
i18n 키를 app↔web으로 대조해 **화면 밖 갭**을 찾았다(화면 수는 32/32였지만 기능이 빠져 있었다).
- **주간 스케줄 편집** — 입구가 비활성이라 웹에서는 스케줄을 **만들 수조차 없었다**(요일 선택은 목록으로 — app은 Alert 8개 제한으로 잘렸다) · **캐치업 카드** · **루틴 순서 바꾸기**(드래그→위/아래 — 터치에서 길게 누르기는 스크롤과 싸운다) · **월 결산 자랑하기**
- **프로필 편집**(이름·사진) · **종목 보관·커스텀 편집 진입** · **그룹 나가기** — 셋 다 계약·폼은 있는데 들어갈 문이 없었다 · **오운완 공유** — 카드는 그리는데 만드는 길이 없었다(사진 메시지와 같은 패턴). 요약에 **종목별 분해**도 붙였다
- 웹에만 있는 문구는 `lib/i18n.ts`의 작은 덧사전에(app 사전이 원본이라 손댈 수 없다 — 제스처를 웹 조작으로 바꾸며 생긴 이름만)
- **밟은 것 2건**: ① 아바타가 어디서도 `mediaSrc`를 안 거쳐 **우리 저장소 사진이 전부 깨졌다** → `Avatar` 안에서 푼다(부르는 쪽마다 두면 한 곳만 빠뜨려도 그 화면만 조용히 깨진다) ② 커스텀 종목은 로컬에만 있어 **서버 렌더 상세가 404** → 편집 진입을 목록 행으로

## 이관 스크립트 (2026-08-04)
`src/scripts/migrate-legacy.sh` — 옛 DB → 새 스택, **전환 시점 1회**. 두 스키마는 컬럼을 맞췄지만 같지 않다(camelCase↔snake_case · 옛 `Post.data` JSON → 펼친 컬럼 · 좋아요·댓글 수는 새쪽만 컬럼 → 다시 센다 · `type`→`kind`).
- 안전: 옛 DB **읽기만** · 새 DB에 사람 있으면 정지 · 스테이징+`ON CONFLICT DO NOTHING`으로 **멱등** · 끝나면 행 수 대조표 · **가짜 옛 DB(21테이블)로 끝까지 돌려 확인**(20테이블 일치·오운완 JSON 펼침·답글 부모·재계산 카운트·2회 실행 불일치 0·가드 3종)
- 안 옮기는 것: 세션 토큰·푸시 토큰·카탈로그(시드). **사진은 DB에 없다** — 저장소를 따로 이어야 한다

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
- 「최근」 배지: 콜백 `&via=` → `setTokens(t, method)` → `/api/session` 이 HttpOnly `lg_last`(1년·로그아웃 유지) → 서버 페이지가 읽어 버튼에
- 고친 경합: 소셜 착지가 쿠키 저장 요청을 끊고 이동(→ 기다림) · e2e가 착지 직후 goto 로 refresh 를 끊던 것
- e2e 110: 102 통과 · dm·profile-edit 단독 통과(flake) · offline 3 = 운영 빌드 전용(운영 대상 4/4 통과) · 스크린샷 390px 라이트/다크 18장(스크래치패드)
- 보고서 `.ouroboros/docs/report/20261026_design-system_report.md`

## 화면 재설계 SRS-054 (2026-10-26) — P0 v0.24.0 `721dd5b` · P1 v0.25.0 `2f936e1` · P2 v0.26.0 `6c57d8a` · P3 v0.27.0 `84933a9` · P4 v0.28.0 `e917cf7` · P5 v0.29.0 `48e94e4` · v0.29.1 `0b3e8df` 운영(완료)
- 시안 D1~D6 전부 A · 스펙 docs/spec/20261026_srs-054-redesign-p0p1_spec.md · 보고 docs/report/20261026_redesign-p0p1_report.md
- P0: 앱바 2형·5탭 라인 아이콘·바닥 시트·공용 조각(rows·MoreMenu)·LogoSpinner · 속도: next/link+LinkInterceptor(탭 이동 21~36ms·새 요청 0) · 갱신 라우트 Me 동봉 · 사용자 캐시 첫 칠하기 · SW 탭 셸 SWR
- P1: 홈 요약형·운동 중 집중 모드(⋯)·운동 추가 시트·완료 화면·진행 중 막대 · loading.tsx 는 dev e2e 57건 깨져 철회(useLinkStatus 로 대체)
- P2: 기록 달별 묶음·휴지통→상세 ⋯ · 달력 주황 칸·목표 시트·자랑 ⋯ · 분석 구간 4칸·대표 숫자+8칸 추세 · 루틴 하단 시작 · 종목 줄 목록·내 1RM 추세 · 다크 --seg-on
- P3: 프로필 사람→설정 줄+시트(경력·의향은 편집 시트) · 로그인 전체 화면·탭 제거(mode-* 표식은 하단 링크) · /account 3구역·#backup · 온보딩 앱 아이콘
- P4: 피드 아이콘 3·팔로잉/발견 탭·+ 작성기 · DM/알림 줄 · 남의 프로필 머리·차단 ⋯
- P5: 데스크톱 세로 탭바 · 약관 앱바+사업자 정보 · 시드 카탈로그 동적 import(−13KB gz) · v0.29.1 첫 SW 설치 새로고침 제거 · 보고서 report/20261026_redesign-p2p5_report.md
- 남은: 완료 화면 공유→작성기 통합 · dm:157 등 불안정 e2e · CF 경로(사용자 결정)

## 다음 작업
1. **키 반영 완료(2026-10-26)**: 메일(smtp) · Turnstile(liftgram-auth 위젯 · 토큰 없는 가입 거절 확인) · 구글(OAuth 클라이언트 liftgram-web · start→accounts.google.com 정상) · v0.21 booktarae형 로그인/가입 화면 · v0.22 /privacy·/terms · OAUTH_PREVIEW_PROVIDERS=google,kakao,naver(카카오·네이버는 '설정 필요')