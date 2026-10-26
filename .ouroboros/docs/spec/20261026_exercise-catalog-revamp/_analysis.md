# _analysis — 리스크·메모리·검증 전략

## 메모리 조회 결과(반영)
- liftgram-exercise-catalog-variants: nameKo 는 KEY(13곳) · nameEn 충돌 3연쇄 · 시드 추가와 FINDER_TREE 편입은 원자 · 테스트 선행 → Phase 0.3·2.2.
- liftgram-variant-bucket-invariant: 읽기/쓰기 키 파생이 달라 깨지기 쉬움 · 키 의미 변경 시 멱등 백필 · machine_variant 미러 비우기 → Phase 1·2.4 (이 메모리는 ADR-034 로 갱신 대상).
- liftgram-offline-data-loss-lessons: 서버 레코드의 `_status` 하나가 동기 전체를 죽임 → 0015 는 payload 의 `_status`/`_changed` 를 건드리지 않고, 쓰기 전에 그 키가 없는지 검사.
- liftgram-plm-sync-fallback: Bash 로 만든 아티팩트는 훅 미발동 → Write/Edit 로 마무리.
- liftgram-browser-verify-gotchas: LokiJS 비동기 flush → 부팅 이관 뒤 flushLocalDb.
- liftgram-gpu-shared-ask-first: 픽토그램은 GPU 없이(ADR-036).

## 리스크 상세 · 대응
1. **이관 정확성** — 운영 기록은 두 사용자 1,514 세트. 매핑 대상(§H.3): implement 변형 22블록 · 비머신+브랜드 ~30블록 · merge 종목(로프 푸시다운 52세트 등). 대응: 매핑 표 하나(생성) → 드라이런 리포트(블록·세트·볼륨 전후) → 운영 0015(합계 불일치 시 ROLLBACK) → 기기 부팅 이관(같은 표). 백업 `backups/pre-catalog-revamp-<ts>.dump`.
2. **동기 경합** — 기기에 미동기 변경이 있는 같은 레코드를 서버가 고치면 pull 시 Watermelon 은 로컬 변경 컬럼을 유지한다 → 부팅 이관이 다시 같은 결과를 만들고 push → 수렴. 순서: 부팅 이관은 **첫 pull 전** 1회 + pull 뒤 1회(빠른 no-op).
3. **시드 행 무시(D10)의 부작용** — 기존 기기에 시드 행이 sync 로 들어와 있던 것은 로컬에 그대로 있음(정상) · 다른 사용자 데이터 아님. 커스텀 판정은 `is_custom` 컬럼 — 운영 커스텀 4종 is_custom=true 확인됨.
4. **표시 이름 범위** — 피드에서 남이 본인 게시물의 종목을 볼 때는 보는 사람 선호 → 없으면 대표 이름(UCS-020). 공유 루틴 가져오기는 종목 id 만 옮긴다.
5. **스무고개 완결성** — 신규 143종을 트리 슬롯에 넣어야 테스트 통과. 생성기가 family → 기존 슬롯 매핑 제안, 남는 것은 수동 배치.
6. **성능** — 별칭 1,000+ 정규화 색인은 앱 시작 시 1회(≈ms). 초성 키는 이름당 1회 계산.

## 검증 전략(게이트가 진짜 막는지)
- 무결성 테스트는 **현재 시드로 먼저 돌려 실패**함을 확인한 뒤 데이터 반영(gate-must-fail-without-the-fix).
- 이관 테스트 픽스처는 운영 실제 패턴을 축약해 만든다(로프 푸시다운·해머스트렝스·인클라인+덤벨·OHE+newtech·원암 랫풀다운·레그 컬).
- 운영 검증은 DB 합계 대조 + 운영 화면(390 라이트/다크) + 이전 기록 표시.
