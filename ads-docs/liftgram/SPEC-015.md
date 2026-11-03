# SPEC-015 — 종목 갭 보강 — 오픈짐 대조로 찾은 없는 동작 106종목 추가

> 타입 Spec · 그룹 liftgram · ADStudio가 `SPEC-015.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

## 종목 갭 보강 — 오픈짐 대조로 찾은 없는 동작 106종목 추가

- 등급: **Task**(데이터 중심 · 스키마 변경 없음) · 요구: URS-030 → SRS-094
- 브랜치 `feat/catalog-gap` · worktree `../liftgram-wt-catalog` · 버전 v0.56.0(기능 = minor)
- 근거 데이터: `candidates.json`(최종 106) · `candidates.md`(표) · `existing_aliases.json`(기존 종목에 단 별칭) · `judgments/*.json`(오픈짐 4,073줄 전수 판정) · `brief.md`(판정 규칙) · `build_rows.py`·`apply.py`(변경안 생성·반영 — git HEAD 원본에서 매번 다시 만든다)
- qa spec: `docs/qa/20261030_catalog-gap-spec_qa.md`(조건부 승인 · H-1·H-2·M-1~7 조치 — 끝의 「조치」 절)

### 1. 대조 결과

| 분류 | 오픈짐 줄 | 비고 |
| --- | --- | --- |
| 이름 그대로 일치 | 308 | 풀 4,381 중 자동 일치 |
| 이미 있음(그립·손잡이·버전·한 팔·사소한 자세) | 2,161 | 우리 종목에 접힘 |
| 넣지 않음 | 1,487 | 스트레칭성·스포츠 드릴·이어 붙인 조합·드문 도구 |
| 없는 동작 | 425 → 183종목 | A 10 · B 104 · C 69 |

**사용자 결정(2026-10-30): A+B(114)** → 손 정리 113 → qa spec 반영 **106종목**. 풀 = 오픈짐 유형 strength·olympic·calisthenics·plyometrics·isometric, 도구 roller·massage ball·bosu·유산소 기구 제외.

### 2. 손 정리와 qa spec 반영

1. 맨몸 「싱글 레그 데드리프트」 = 「싱글 레그 루마니안 데드리프트」 → 하나로(뒤 이름은 별칭).
2. 「바벨 핀 프레스」 주동근 = 가슴. 별칭 `pin bench press` 는 「bench press」 검색을 가로채 뺐다.
3. 목 운동 주동근 = `other`(기존 라잉 넥 컬·익스텐션과 같게).
4. 같은 family 기존 종목과 주동근 맞춤: 덤벨·스미스 커시 런지·리버스 핵 스쿼트 → quads.
5. **같은 동작은 새 종목 대신 기존 종목의 별칭으로(qa H-2·L-9)** — 바벨 인클라인 클로즈그립 벤치프레스(인클라인 프레스 + 그립 칸) · 바벨/스미스 비하인드 백 슈러그 · L-싯 풀업 · 바벨 스모 데드리프트 하이 풀(기존 「데드리프트 하이 풀」, 별칭 「하이 풀」이 이미 그 동작) · 행잉 오블리크 니 레이즈. 기존 행에는 **별칭 추가만** 허용(`existing_aliases.json` 7행 — 「인클라인 로우」를 덤벨 체스트 서포티드 로우에 단 것 포함, qa M-7).
6. 넥 브릿지 제외(경추 부하 — qa L-4).
7. 대표 이름: 「시티드 니업」(니 턱은 별칭) · 「복부 배큠」(스토머크 배큠은 별칭) — qa L-5·L-6.
8. 너무 일반적인 별칭 `triceps press` 삭제(qa M-7).

### 3. family 규칙 — 「family 안 기구 하나」(qa H-1)

`catalogIntegrity`·기록 이관(`buildCatalogIndex` 의 family×기구 형제 맵 — 마지막 행이 이긴다)·「기구 바꾸기」가 모두 family×기구 = 종목 하나를 전제로 한다. 기존 종목과 같은 family·같은 기구가 되는 새 종목은 **제 family 로 떼고**(30종목 · 예: 인클라인 스컬크러셔 3종 → `incline_skull_crusher`), 원형·스무고개·패턴·그립·부착물·적재 축은 원래 family 를 잇고 similar 첫 칸에 원래 family 를 둔다. 랜드마인·플랭크 풀 스루·45도(로만체어) 사이드 벤드도 셋업이 달라 「기구 바꾸기」 형제로 두지 않는다(랜드마인 별도 family 관례 — qa M-4).

### 4. 바꾼 곳

| 파일 | 변경 |
| --- | --- |
| `core/src/data/catalog/catalog.master.csv` | 106행 덧붙임(status=new · media=gen · note=등급·이유) · 기존 7행 별칭 추가 |
| `core/src/data/catalog/catalog.families.csv` | 새 family 62(새 동작 + 떼어 낸 family) · 기존 30 family 의 `equipments` 넓힘(런타임 소비처 없음 — qa 확인) · 앱 코스터 적재 기본 plate(qa L-8) |
| `core/src/data/pictograms/render.ts` `FAMILY_ARCH` | 새 family 62 → 원형 |
| `core/src/data/pictograms/poses.ts` | **원형 3개 추가**(qa M-5) — `back_lever`(프론트 레버를 뒤집음) · `tibialis_raise`(발끝 들기) · `vacuum`(선 자세) — 가까운 원형이 반대 동작을 그렸다 |
| `core/src/domain/exerciseFinder.ts` | 트리 있는 부위의 새 근력 종목 91개를 세부 질문에 |
| `core/src/domain/movementPatterns.ts` | 새 종목 63개 패턴 — **현재 런타임 소비처 없음**(qa M-1 · 테스트·장래 대비). 티비알리스는 `calf` 패턴을 주지 않는다(반대 동작 — qa L-2) |
| `core/src/domain/__tests__/catalogRevamp.test.ts` | 개수 단정 480·469 → 586·575(원본 주석 보존) |
| `core/src/domain/__tests__/catalogGapOpengym.test.ts` (새) | 106 존재 · 기존 480행 = 별칭 추가 말고 불변(지문) · 이름 겹침 0 · family×기구 형제 맵 유일 · 원형·적재 기본 · 스무고개 · 검색 첫 결과 표 |
| `frontend/e2e/catalog-gap.spec.ts` (새) | 검색해 넣고 세트 저장 · 별칭(Z 프레스·SDHP) · 스무고개 |
| 생성물 | `make catalog` → `catalog.generated.ts`·`catalogRevision.ts`·`database/migrations/0021_catalog_rev_*.sql`(합치기 직전 다시 만들어 번호 확정 — qa L-13) |
| `frontend/package.json` | 0.55.0 → 0.56.0 |
| (별도 커밋) `frontend/lib/appUpdate.ts` | v0.55.0 이 남긴 lint 오류 2건(void 반환) — 동작 같음, 이 작업과 무관(qa M-6) |

### 5. 데이터 경로·운영 확인

- 서버: 생성 SQL 이 카탈로그 전체 멱등 upsert. 서버 `exercises` 에 커스텀 0 → name_ko UNIQUE 충돌 없음.
- 커스텀 종목(qa M-2): 사용자 커스텀은 `sync_records(collection='exercises')`에 있다 — 운영 4건(레그 프레스 (호이스트) 등) 모두 새 이름·별칭과 겹치지 않음(2026-10-30 조회). 비로그인 기기의 로컬 커스텀은 볼 수 없다 — 겹치면 목록에 두 줄(기록은 각자) · 허용.
- 기록 이관(qa M-3): 운영 workout·routine 블록 774개에 옛 표·새 표로 `planBlockMigration` 을 돌려 **결과가 달라지는 블록 0**(새 형제 행이 옛 기록을 옮기지 않는다).
- 기기: 부팅마다 `topUpSeedCatalog`(nameEn 기준 미보유 추가) + 판 해시가 바뀌면 `refreshSeedCatalog`. 카탈로그 받기는 처음 500행을 넘어 **두 페이지**가 된다 — 로컬 운영 빌드에서 586건·중복 0 확인(qa L-10).
- 대체 운동(qa M-1): 새 종목은 서버 `substitute_ids` 가 비어 있고 기기 `SUBSTITUTES` 에도 없다 → 상세 「대체 운동」은 비거나 같은 주동근 폴백. 이번엔 허용(§7).

### 6. 검증

- `make verify` 통과(단위 553 · catalog-check 586행·family 320).
- 로컬 운영 빌드(3200/3201 · 새 DB): 서버 종목 586(활성 575) · 카탈로그 2페이지 586 · e2e catalog-gap·pictogram·routine-picker·catalog-revamp 18/18 · 전체 e2e 회귀.
- 운영: 배포 전 pg_dump · 배포 뒤 `count(*) FROM exercises` = 586 · /app-version 0.56.0 · 운영 e2e(catalog-gap).

### 7. 하지 않는 것

드묾(C) 69종목 · 스트레칭·요가·재활 · 오픈짐 사진/영상(Gym visual 유료) · 새 종목의 대체 운동 큐레이션(qa M-1) · 기존 행의 similar 역링크(qa L-11 — 무변경 원칙) · 스무고개 「힙 신전」 질문 신설(qa L-12).

#### 옮김 정보 (PLM)

- 원본: `.ouroboros/docs/spec/20261030_catalog-gap`(PLM식 md 스펙 폴더 — _intent·_context·_analysis·phase-*.md를 이어 붙임)
