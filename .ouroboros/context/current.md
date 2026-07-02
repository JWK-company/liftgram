<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->

## 세션 상태

| 상태 | 시작 |
|------|------|
| 완료 — 풀 기획 파이프라인 (plan→requirement→design→decision→trace) ✓ | 2026-06-23 |
| 구현 착수 — Phase 0 코어(RM-001) RN 앱 스캐폴딩·핵심 구현 ✓ | 2026-06-25 |
| 기획 정정 — 웹 우선(PWA) 전환: ADR-012 발급(supersedes ADR-001), 브라우저 렌더 확인 ✓ | 2026-06-25 |
| 결제·정산 모델 결정 — ADR-013 발급(supersedes ADR-009): 글로벌 MoR 수금(웹 Paddle/Lemon Squeezy) + 유튜브식 구독풀 User-centric 트레이너 수익배분 + 글로벌 Payout(원천징수·세무서류). informs SRS-014·SRS-016 | 2026-06-26 |
| 결제·정산 요구 캐스케이드 발급 — 공급 측(트레이너) 신규 이해관계자: URS-009·UCS-009 신설, SRS-016(트레이너 수익배분·정산·지급) 신설, SRS-014(글로벌 MoR 수금) 수정 → /trace 재검증 | 2026-06-26 |
| 구현(코어 마감/한국로컬) — ①i18n(ko/en) 도입·언어 토글 활성화(전 UI t() 외부화 266키·운동명 KO/EN·웰니스 다국어) ②대체운동 큐레이션(116종·평균4.76) ③가용기구 기반 추천 필터(SRS-013, 스키마v2). 결제 구현은 앱 완성 후 보류(기획만 유지) | 2026-06-29 |
| 구현(온디바이스 차별화) — ④점진적 과부하(SRS-010 더블 프로그레션·정체감지) ⑤규칙기반 프로그램 생성(SRS-009 목표·경력·장비·일수→요일별 루틴). 도메인테스트 26/26·typecheck·웹export·잔여한글0 PASS. SRS-012 자동카운팅은 센서/CV·네이티브 의존이라 보류(모바일 우선순위 때) | 2026-06-29 |
| 기획 보완 — 소셜 고도화(인스타 통합): Hevy 피드 + 인스타식 DM(PT문의·만남)·미디어·스토리·탐색·알림. /plan→/requirement→/design→/decision→/trace 풀 파이프라인. PRD 보완·RM-008 발급. 신규 URS-010·UCS-010/011·SRS-017~020·SAD-011/012·ADR-014~017 + SRS-007/008 갱신. 베이스=운동앱 유지·ADR-007 좁은부족 해자 보존(ADR-014 하이브리드). 구현은 백엔드 페이즈 편성 | 2026-06-30 |
| 백엔드 준비·착수 — 기획: SAD-013(결제 아키텍처)·ADR-018(스택 Node/TS+Postgres). 구현: `server/` 스캐폴드(NestJS 모듈러 모놀리스 + PostgreSQL/Prisma) — 계정·인증(JWT)·오프라인-우선 동기(ADR-002 last-write-wins) 토대. E2E(health/signup/login/me/sync push·pull/401) 전부 통과 | 2026-06-30 |

> PLM 바인딩: `health-practice-wbi` @ https://jwk-plm.shoi.ch — 토큰 설정됨, plm-sync 활성. (초기 401·일괄 검증 이력은 git/PLM)

## 활성 기획

| 이름 | 단계 | 비고 |
|------|------|------|
| 헬스앱 (Hevy 클론 → 차별화) | 구현(Phase 0~) + 소셜/백엔드 기획 | G1·G2 pass(2026-06-30 재검증). 노드 80 (URS10·UCS11·SRS20·SAD13·ADR18·RM8) · 소셜 고도화 + 백엔드 준비(SAD-013·ADR-018) 발급 완료(orphan 0·dangling 0) |

## 작업 범위 (발급 예정/진행 요구사항)

> 본 기획 사이클에서 다루는 문서만 수정. 코드 구현·테스트는 범위 밖.

**산출물**
- PRD: `docs/product/PRD.md` (비추적, 완료)
- Roadmap: RM-001(코어) · RM-002(소셜) · RM-003(AI프로그래밍) · RM-004(책임감루프) · RM-005(카운팅) · RM-006(한국로컬) · RM-007(수익·성장·웰니스) (완료)

**발급된 요구사항**: URS 10·UCS 11·SRS 20 (코어·소셜·소셜고도화·AI·카운팅·한국로컬·수익화/결제). 전건 발급 완료 — 상세는 PLM·matrix.

**발급된 설계 (SAD)**
- SAD (10): SAD-001 시스템개요/스택 · SAD-002 기록코어 · SAD-003 분석엔진 · SAD-004 오프라인싱크 · SAD-005 소셜·책임감 · SAD-006 AI프로그래밍 · SAD-007 자동카운팅 · SAD-008 한국로컬 · SAD-009 수익화 · SAD-010 웰니스가드레일

**발급된 결정 (ADR)**
- ADR (13): ADR-001 RN채택(→ADR-012가 supersede) · ADR-002 오프라인싱크/충돌 · ADR-003 로컬DB(WatermelonDB·어댑터 분기) · ADR-004 AI하이브리드 · ADR-005 카운팅 온디바이스 · ADR-006 웰니스강제·카피게이트 · ADR-007 좁은부족 책임감해자 · ADR-008 무료+그룹가치 수익화 · ADR-009 구독 RevenueCat(→ADR-013이 supersede) · ADR-010 1RM Epley · ADR-011 모듈러모놀리스 · ADR-012 웹우선(PWA)·Expo Web · **ADR-013 글로벌 결제·정산(MoR+유튜브식 구독풀 User-centric 배분)**

**소셜 고도화 사이클 (인스타 통합) — 2026-06-30 발급/갱신**
> RM-008 발급·PRD 소셜 고도화 섹션 보완 완료. 베이스=운동앱 유지, ADR-007 좁은부족 해자 보존 + DM/미디어/탐색 옵트인 공개 레이어(하이브리드). 구현은 백엔드 페이즈 편성(현재 동기엔진 0%).
- URS: **URS-010** 동료·트레이너 직접 연결(DM·PT문의·만남)
- UCS: **UCS-010** DM으로 PT문의·만남·동료 소통(1:1·그룹) · **UCS-011** 미디어·스토리 게시 + 탐색/검색 발견
- SRS 신설: **SRS-017** 다이렉트 메시지 · **SRS-018** 소셜그래프·탐색·검색 · **SRS-019** 미디어 게시물·스토리 · **SRS-020** 통합 알림센터
- SRS 갱신: **SRS-007** 피드(미디어 포스트·발견 확장) · **SRS-008** 프로필(공개 프로필·DM진입·PT CTA)
- SAD: **SAD-011** 소셜·실시간 메시징 백엔드 · **SAD-012** 미디어 파이프라인·모더레이션
- ADR: **ADR-014** 포지셔닝(ADR-007 확장·하이브리드) · **ADR-015** 메시징 기술 · **ADR-016** 미디어/CDN · **ADR-017** 모더레이션·안전·민감정보

**백엔드 준비 — 2026-06-30 발급**
> 온디바이스 구현 소진 → 백엔드 착수 전 설계 공백 보완. (구현은 백엔드 페이즈)
- SAD: **SAD-013** 결제·정산 아키텍처(refs SRS-014/016 — G2 공백 해소, ADR-013 구현 설계: MoR 수금·User-centric 배분·글로벌 Payout)
- ADR: **ADR-018** 백엔드 스택·배포(**Node.js/TS 모듈러 모놀리스 + PostgreSQL** · 매니지드 인증/호스팅·실시간/미디어 위임 · informs SAD-001/004/011/013)

## 게이트 (요구→설계)

| 게이트 | 상태 |
|--------|------|
| G1 요구 (모든 SRS가 URS에 연결) | **pass** (trace_validate 재확정 · 2026-06-30, 노드 80) |
| G2 설계 (모든 SAD가 SRS에 연결) | **pass** (trace_validate 재확정 · 2026-06-30, 노드 80) |

> 추적 매트릭스: `docs/traceability/matrix.md` (orphan 0 · dangling 0). Approved 전이는 PLM 대시보드에서 사람이 수동(plm-dash.shoi.ch).
>
> 커버리지(사람판단): ① ✅ **해소** — SRS-014/016 결제·정산 SAD 발급(**SAD-013**, refs SRS-014/016). ② ⚠️ **URS-009·SRS-016이 Roadmap 미커버**(비차단) → RM-007(수익·성장)에 `covers` 확장 또는 신규 RM 권고(`/plan`).
> 후속 PLM: ADR-009 → Superseded 전이(대시보드, 사람), G1·G2 pass → Approved 전이 검토.
>
> **PLM 동기 + verify 정합 (2026-06-30)**: 소셜 고도화 신규 14 + 갱신 2(SRS-007/008)를 라이브 PLM(jwk-plm.shoi.ch)에 동기 완료. `/plm-hub:verify` 결과 **문서 드리프트 0**(로컬 78 == PLM active 78·타입별 전건 일치·local_only/plm_only 없음), **관계 전건 그래프 존재**(artifact_links: SAD refs·ADR informs·RM covers·SRS derives_from·UCS elaborates 모두 확인), **PLM 게이트 정합 `{gates: []}`**(G1/G2/G3 orphan 0). 로컬 trace_validate도 G1·G2 pass(노드 78).
> 🐞 **잡은 도구 버그**(보고 권고): ① `plm_sync_one.py` import는 관계를 그래프엔 넣으나 **게이트 인덱스를 갱신 안 함** → 처음 `/gates`가 신규 SRS-017~020·SAD-011/012를 오표시. **MCP `relation_link`로 게이트 관계 재링크해 정합**. ② `plm_sync_one.py`가 `supersedes: null`을 문자열로 파싱→글자(n·u·l·l) 가짜 관계(dst 미존재 skip·무해). ③ `sync_bulk.py`는 GET에 auth 미부착(401)·env 변수명 불일치(PLM_API_URL/PLM_TOKEN) → per-file `plm_sync_one.py` 경로로 동기. ④ per-file hook이 이번 세션 조용히 실패(PLM_API_URL/PLM_PROJECT env 미주입) → 수동 동기로 보완.

## 구현 (Phase 0 — RM-001 코어 클론) · 2026-06-25

> 코드는 `app/`(이 repo 내, 사용자 결정). `.ouroboros/docs`=기획 SSOT, `app/`=구현 분리. CLAUDE.md §8(코드 범위 밖)에 대해 사용자 승인하에 동일 repo `app/`에 배치.

- 스택(ADR 준수): Expo SDK56 RN + WatermelonDB(ADR-003) + react-navigation + Epley 1RM(ADR-010) + 오프라인-우선(ADR-002, 동기 엔진은 Phase1).
- 구조: `app/src/` domain(순수·테스트됨)·db(스키마+7모델)·data(repo 5종+시드)·components·navigation·state·features(12화면).
- 구현 범위: 운동DB(SRS-001)·루틴빌더(SRS-002)·세트로깅/세션(SRS-003/004)·분석(SRS-005)·프로필/인증스텁(SRS-006)·웰니스 가드레일(SRS-015 라벨).
- 검증(Phase 0): typecheck 0·도메인테스트 15/15·적대 리뷰 6건 수정·`expo export` 빌드 성공(ios/web, 빌드버그 2건 수정).
- **웹 우선(PWA) 전환·실행 확인 (ADR-012)**: DB 어댑터 플랫폼 분기(웹=LokiJS/IndexedDB `adapter.web.ts`, 네이티브=SQLite/JSI `adapter.ts`) → `expo export --platform web` 번들 성공, **브라우저 렌더 확인**(홈·기록·분석·운동선택 36종 시드 정상). Xcode/CocoaPods 불필요.
- **웹 confirm 버그 수정·검증(2026-06-26)**: react-native-web의 `Alert.alert`가 confirm 콜백 미동작 → 테마 모달 호스트(`components/AlertHost.tsx`)로 라우팅(`utils/alert.installWebAlert`, 호출부 무수정). 브라우저에서 운동완료(완료→요약 이동) end-to-end 검증, 취소·삭제·로그아웃·루틴삭제·세트메뉴 일괄 해소. 언어 토글은 i18n 미도입(Phase1+)이라 '준비 중' 비활성 처리.
- **카탈로그 확장·드래그 reorder(2026-06-26)**: 운동 시드 36→116종(멱등 top-up — 기존 IndexedDB도 보강). 루틴 종목 순서변경에 reanimated v4 + `react-native-reorderable-list` 드래그 핸들(☰, onPressIn) 추가, 화살표(▲▼) 폴백 유지. tsc 0·웹 번들·렌더·콘솔에러 0 검증. ⚠️ 실제 드래그 제스처는 헤드리스 자동화로 트리거 불가 → 실기기/마우스 테스트 필요(화살표는 보장 동작). 미적용: 대체운동 큐레이션 substituteIds(현재 같은 근육군 폴백).
- **i18n(ko/en) 도입·언어 토글 활성화 (2026-06-29, SRS-013/006)**: 순수 React i18n 레이어(`src/i18n/` — `useT()` 훅 + imperative `t()`, userContext.language SSOT·토글 시 자동 리렌더). 인벤토리(병렬 24파일·271문자열)→결정적 번들 생성(`locales/ko.ts`·`en.ts` 229키, 충돌 자동검출)→16화면 병렬 치환(apply+verify 워크플로우)→공유모듈(labels lang대응·alert·wellness 고지 번들 이관·운동명 `exerciseDisplayName`). 프로필 언어 토글 `disabled` 해제→실동작. 운동명 KO/EN 117/117 커버. 검증: typecheck 0·도메인테스트 15/15·`expo export --platform web` PASS(3MB)·잔여 비주석 한글 0. ⚠️ 라이브 토글 전환 렌더는 브라우저 육안 확인 권장(헤드리스 한계).
- **대체운동 큐레이션 (2026-06-29, SRS-001/013)**: 116종 전체에 대체운동 명시(평균 4.76개). DB id가 기기마다 랜덤이라 안정 키(nameKo)로 표현(`seed/substitutes.seed.ts`) → seedRunner가 시드 시점 nameKo→id 해소·멱등 적용(기존 IndexedDB top-up 포함). 큐레이션=권역별 병렬(push/pull/legs/core)+적대 리뷰(무브먼트/주근육 불일치 14건 정정: 헤비힌지↔트랩고립·후면델트↔측면레이즈·전완↔이두·등척코어↔동적복근 등). `getSubstitutes` 랭킹 순서 보존(oneOf 재정렬). 검증: 무효참조 0·자기참조 0·typecheck·테스트15·웹export PASS. 빈 substituteIds→근육군 폴백 유지.
- **가용 기구 기반 추천 필터 (2026-06-29, SRS-013)**: 프로필에 '내 가용 기구' 멀티셀렉트(스키마 v2 — `available_equipment` 컬럼 추가·마이그레이션 배선, 빈=전체). ExerciseDetail 대체운동을 보유 기구(+맨몸 항상)로 필터, '내 기구만' 토글(기본 ON)·필터결과 0 빈상태 처리. UserProfile/userRepo/userContext 배선. 검증: typecheck·테스트15·웹export·잔여한글0 PASS. (SRS-013 잔여=오운완 인증 — 소셜 백엔드 의존)
- **점진적 과부하 (2026-06-29, SRS-010)**: 순수 도메인 `progression.ts` — 더블 프로그레션 제안(직전 수행+목표 반복범위→다음 무게/반복, reasonKey로 투명 설명) + 정체 감지(최근 추정1RM 향상 없음→디로드/회복 권고, 웰니스 범위·진단 없음). 라이브 세션 ExerciseBlock에 '다음 목표' 탭형 제안 칩(입력 자동적용), ExerciseDetail에 정체 노트. 루틴 목표 미설정 시 기본범위(8~12). 검증: 도메인테스트 22/22(점진 7건)·typecheck·웹export·잔여한글0 PASS. (멀티주차 프로그램 자동 디로드 편성은 SRS-009 프로그램 구조와 함께 — 후속)
- **규칙기반 프로그램 생성 (2026-06-29, SRS-009)**: LLM 없이 온디바이스 결정적 생성 — 목표(근력/근비대/체중관리)·경력·가용장비·주당일수 → 분할(2일 전신·3일 PPL·4일 상하체·5일 PPL+상하체·6일 PPL2회전) + 근육군별 컴파운드 우선·장비필터 종목 선택 + 목표별 세트/반복/휴식 스킴. 순수 도메인 `programGenerator.ts`(카탈로그 주입). 화면: 폼→편집가능 미리보기(교체=대체후보 회전·제외)→채택(folder로 묶어 요일별 Routine 생성, 스키마 무변경). 점진 과부하는 세션별 progression(SRS-010)으로 실현. 웰니스: 고정 카피·'의학적 조언 아님' 명시. 검증: 도메인테스트 26/26(프로그램 4건)·typecheck·웹export·잔여한글0 PASS.
- 네이티브(iOS/Android)는 후순위 옵션 — `expo prebuild` 시 simdjson pod 중복·full Xcode 필요 등 별도 정비 필요.

### 백엔드 착수 (2026-06-30, `server/` · SRS-006·ADR-002·ADR-018)
- **스택·모듈**: **NestJS 모듈러 모놀리스 + PostgreSQL(Prisma)** (ADR-018, 모노레포). 모듈: health·auth(email/pw+JWT·어댑터)·users·sync(오프라인-우선·last-write-wins)·social·media·dm. Prisma: User/Device/RefreshToken/SyncRecord/Follow/Post/MediaAsset/Story/Conversation/Participant/Message/PostLike/Comment.- **앱↔서버 동기 연동 (2026-06-30)**: 서버 sync를 WatermelonDB 프로토콜로 개편(pull→`{changes,timestamp}`·비삭제 전부 updated·push upsert). 앱 `src/sync/`(tokenStore 플랫폼분기·serverApi JWT·`synchronize()` sendCreatedAsUpdated) + ProfileTab `ServerSyncCard`(로그인/가입·지금 동기). 앱 typecheck·웹export·잔여한글0 PASS. 서버를 사용자 로컬 PG16(`127.0.0.1:5432`·role `wbi`·DB `liftgram`)에 연결·기동, 전체 서버 E2E(signup→push→pull) PASS·데이터 5432 `SyncRecord` 적재 확인. 앱 UI 동기 최종 확인은 사용자(pgAdmin).
- **앱 가명 = Liftgram (2026-06-30)**: app.json(name/slug/scheme/bundleId `com.liftgram.app`)·i18n 태그라인 반영, 서버 DB명 `repset`→`liftgram` 통일. 내부 저장 식별자(WatermelonDB `dbName`·토큰 키)는 로컬 데이터 보존 위해 `repset` 유지. 루트 `README.md`를 제품·구동(백엔드 DB 생성→마이그레이션→기동, 앱 실행, 동기, pgAdmin 확인) 중심으로 재작성.
- **소셜 코어 착수 (2026-07-02, `feat/social-core` · SAD-011)**: 크로스유저 공유 데이터 → **서버 관계형+REST**(ADR-014 옵트인 공개 레이어, 오프라인-우선 개인 코어와 분리). Prisma `Follow`/`Post` + `social` 모듈(follow·createPost·feed·discover·profile) 마이그레이션·빌드 0에러. 서버 E2E(2유저 팔로우→포스트→피드 노출→언팔 사라짐→무토큰401) PASS. 앱: `serverApi` 소셜 메서드 + **피드 탭**(작성·새로고침) + **발견 스크린**(검색·팔로우) + 네비 연결. typecheck·웹export PASS. 미디어(SAD-012)·DM(실시간, SRS-017)은 후속.
- **백엔드 토대 마감 (2026-07-02, `feat/backend-hardening`)**: **refresh 토큰 회전**(login/signup→access+refresh 발급·`/auth/refresh` 회전=옛 토큰 폐기·`/auth/logout`·앱 401 시 자동 재발급) + **시드 멀티기기 dedup**(운동 시드 결정적 id=nameEn 슬러그 → 동기 recordId 병합). 서버 refresh E2E(회전→옛토큰401·logout→401)·소셜 회귀·앱 typecheck·웹export PASS. **인증 어댑터 추상화**(ADR-018 — `AuthProvider` 포트·`LocalAuthProvider` 기본·config `AUTH_PROVIDER` 선택·`/auth/exchange` 매니지드 확장 지점; 세션=우리 JWT+refresh 유지, 신원 소스만 교체 가능). 로컬 회귀·exchange→501 확인. 매니지드 제공자 실연동은 계정·키 준비 후 드롭인.
- **미디어 파이프라인 착수 (2026-07-02, `feat/media-pipeline` · SAD-012)**: **스토리지 어댑터**(`StorageProvider` 포트·`LocalStorageProvider` 디스크 기본·config `STORAGE_PROVIDER`·클라우드 S3/R2 드롭인 ADR-016) + `MediaAsset` 모델 + `media` 모듈(`POST /media/upload` 멀티파트·이미지검증·10MB·`GET /media/file/:key` 공개 서브). 서버 E2E(업로드→URL 서브 바이트일치→이미지 포스트→피드 노출→비이미지400) PASS. 앱: `serverApi.uploadImage`(웹 Blob/네이티브 FormData 분기) + 피드 탭 **사진 첨부·업로드·이미지 렌더**(expo-image-picker). typecheck·웹export PASS. **스토리(24h)** 추가: `Story` 모델 + `/social/stories`(생성·작성자별 활성 그룹, `expiresAt>now` 필터) + 앱 **스토리 트레이·뷰어·올리기**(미디어 업로드 재사용). 서버 E2E(생성→활성 노출→만료 제외) PASS. 트랜스코딩·모더레이션·정리잡은 후속. **적대적 리뷰(다중에이전트 22·4차원 발견→반증검증)로 15결함 확정·전량 수정**: JWT 시크릿 fail-closed(getOrThrow·prod 기본값 금지)·refresh 원자적 회전+재사용감지(패밀리 무효화)·미디어 소유검증(스토리/이미지=업로더 소유 MediaAsset만)·상대 미디어URL(호스트 비종속)·피드 커서검증/id타이브레이크/자기비공개 포함·이메일 열거 제거·CORS allowlist·발견 경합/중복탭 가드. 전체 E2E+보안회귀(외부URL·무단미디어 400) PASS.
- **DM 착수 (2026-07-02, `feat/dm` · SRS-017)**: 크로스유저 관계형+REST. `Conversation`/`Participant`/`Message` + `dm` 모듈(1:1 find-or-create·송수신·읽음·unread) — **모든 대화 접근 participant authz**. 앱: 대화목록·쓰레드(간이 폴링·자동스크롤)·발견에서 DM 시작·피드헤더 진입. 서버 E2E(송수신·unread·**비참여자403**·자기DM400·멱등) PASS. **적대적 리뷰(다중에이전트 20)로 10결함 확정·수정**: 중복대화 레이스→`directKey` unique+P2002 재조회·폴링 경합가드·userId UUID검증·전송실패 피드백·KAV. **그룹 대화(`feat/dm-groups`)**: `isGroup`/`title` + `POST /dm/groups`(**팔로우한 사람만** 추가)·`POST /…/leave`(마지막 멤버 나가면 대화·메시지 cascade 삭제). 앱: 새 그룹 화면(팔로우 대상 다중선택·제목)·그룹 스레드 발신자명·나가기·멤버명 헤더 폴백. 서버 E2E(생성·authz·미팔로우403·고아정리·1:1나가기400·ArrayMaxSize)·1:1 회귀 PASS. **적대적 리뷰(다중에이전트 11)로 5결함 수정**: 그룹 생성/나가기 실패 무음→에러 배너·팔로우 게이트(낯선사람 대량편입 차단)·고아 대화 정리·제목없는 그룹 헤더 폴백·`@ArrayMaxSize`. **실시간 전송(`feat/dm-realtime` · ADR-015 자체호스팅 WebSocket)**: NestJS `DmGateway`(namespace `/dm`, 핸드셰이크 미들웨어 JWT 검증→user룸) — sendMessage가 참여자 user룸으로 `dm:message` push, 타이핑 relay(참여자 검증+소켓당 1초 스로틀·maxHttpBufferSize). 앱 `realtime.ts`(단일 소켓·함수형 auth 최신토큰·리스너 레지스트리 재부착) → 쓰레드 라이브 수신(폴 15s 폴백·id병합)·타이핑 표시, 대화목록 라이브 갱신, 로그아웃 소켓 정리. WS E2E(인증거부·라이브·echo·타이핑·비참여자차단·스로틀)·REST 회귀·typecheck·웹export PASS. **적대적 리뷰(에이전트 11)로 5결함 수정**: 타이핑 DoS 스로틀·소켓 재생성 리스너 고아화·만료토큰 재연결(auth 콜백)·폴 레이스 덮어씀·unread 신원 레이스.
- **좋아요·댓글 (2026-07-02, `feat/likes-comments` · SRS-007)**: `PostLike`(멱등)/`Comment` + social 엔드포인트(like/unlike·댓글 CRUD). PostView에 `likeCount`·`commentCount`·`likedByMe`(뷰어 필터 include). **가시성 authz**(볼 수 있는 포스트에만 좋아요/댓글) + 댓글 삭제=작성자. 앱: PostCard 좋아요(하트 토글·낙관적)·댓글수→댓글 화면(작성·본인삭제). 서버 E2E(토글·멱등·likedByMe·댓글·비작성자삭제403·가시성403) PASS. **적대적 리뷰(다중에이전트 17)로 9결함 수정**: `unlikePost` 가시성 누락(카운트 누출)·좋아요 연타/스냅샷/리로드 경합(per-post in-flight 가드·델타 롤백·낙관적 보존)·댓글 에러 피드백. typecheck·웹export PASS. **오운완 공유 (`feat/workout-share`)**: 운동 완료(WorkoutSummary)→피드 `workout` 포스트(원시 kg/초/카운트 저장→뷰어 단위 렌더, PostCard 운동 요약 카드). 서버 무변경(createPost 재사용). 라운드트립 E2E·typecheck·웹export PASS.
- **공개 프로필 (2026-07-02, `feat/profile` · SRS-008)**: 서버 기존 `getProfile`/`getUserPosts` 재사용 + 앱 `UserProfileScreen`(아바타·카운트·팔로우/DM·게시물, 피드/발견에서 유저 탭→프로필). **적대적 리뷰 6→실질 3 수정**: 게시물 수 가시성 스코프(숨은 글 개수 누출 차단·헤더=목록 일치)·로드 실패 에러/재시도·DM 더블탭 가드. 서버 카운트 E2E·typecheck·웹export PASS. · **내 프로필 편집 (`feat/profile-edit`)**: `User.avatarUrl` + `PATCH /users/me`(이름·아바타=소유 미디어만) + author avatarUrl(피드/프로필/발견) + 앱 `Avatar` 컴포넌트·ProfileTab 편집. **적대적 리뷰 5→실질 4 수정**: 🔴 `assertOwnedMedia` 정규식 `^`앵커(외부호스트 URL 우회→stored-SSRF/추적비콘 차단, users·social·dm 3곳)·Avatar onError 폴백·에러 현지화·아바타 더블탭 가드. E2E(exploit 400 검증)·회귀·typecheck·웹export PASS.
- **알림 (2026-07-02, `feat/notifications` · SRS-020)**: 팔로우/좋아요/댓글 이벤트 **fan-out**(`Notification` 모델, `notify()` **best-effort** — 알림 실패가 본 액션 안 깨뜨림) + `notifications` 모듈(list·unread·markAllRead, 수신자 스코프). 자기이벤트 제외·재팔로우/재좋아요 중복 없음(P2002). 앱: **알림 센터** + 피드헤더 **벨 unread 배지** + 탭 라우팅(follow→프로필·like/comment→댓글). DM은 unread 별도라 제외. 서버 E2E(알림·자기제외·중복없음·읽음·401)·리뷰(notify best-effort 격리) PASS·앱 typecheck·웹export PASS. · **콘텐츠 모더레이션 (2026-07-02, `feat/media-moderation` · SAD-012·ADR-017)**: 신고→모더레이터 큐→소프트 제거 + 이미지 자동스캔 어댑터. 스키마: `User.role`·`Post/Story/Comment.moderationStatus`(+removedAt/reason)·`MediaAsset.flagged`·`Report`(신고자당 대상 1건 unique). **역할 가드**(`RolesGuard` DB role 대조·JwtAuthGuard 뒤) + `moderation` 모듈(`POST /reports` 누구나·`GET /queue`·`POST /resolve` 모더레이터). **제거=불가시 전파**: 피드·프로필·프로필카운트·가시성검증(assertCanViewPost 404)·댓글목록·commentCount·활성스토리 전 쿼리 `moderationStatus:'approved'` 필터. **이미지 자동스캔 어댑터**(`ImageScanner` 포트·`NoopImageScanner` 기본·config `IMAGE_SCANNER`·클라우드 드롭인 ADR-016) → 위반 미디어 `MediaAsset.flagged` → 게시 시 `pending`(숨김·큐 auto). 앱: 신고 시트(피드·프로필·스토리·댓글, 본인 콘텐츠 제외) + **모더레이터 큐 화면**(제거/승인) + ProfileTab 진입(role 기반) + `serverApi.report/moderationQueue/resolveReport`·`PublicUser.role`. 모더레이터 승격=`node scripts/grant-moderator.mjs <email>`. 서버 E2E(신고·역할게이트403·제거 전파숨김·댓글·승인)·미디어/가시성 E2E(flagged 바이트404·자동보류 포스트/스토리·제거 시 백킹미디어404·신고 가시성게이트)·7개 회귀·앱 typecheck·웹export PASS. **적대적 리뷰(에이전트 9)로 5결함 수정**: 🔴 createStory가 flagged 무시(자동보류 우회)·🟠 제거/flagged 미디어 바이트 여전히 공개(→resolve가 백킹 `MediaAsset.flagged` 토글·`GET /media/file/:key` flagged면 404)·신고 가시성 게이트(존재 오라클 차단)·큐 버튼 스핀 대상·me() 실패 시 피드 신고 숨김.
- **후속/미구현**: 매니지드 인증 실연동(어댑터 준비됨) · 모더레이션 클라우드 스캔 실연동(어댑터 준비됨·noop 기본) · 푸시 알림 · 결제(SAD-013, 앱 완성 후) · 자동카운팅(SRS-012, 보류). 실행: `server/README.md`.
## 차단 요소
(없음) — IP 귀속 점검(reference/risks.md)은 코딩 착수 전 별도 진행 권고.
