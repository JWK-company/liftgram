# WF-GBOOT — S-53 GBOOT 앱 시작(모든 화면 위)

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-GBOOT.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-066, SRS-073, SRS-085, SRS-089

### 앱 시작(모든 화면 위)

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:20c7fabf-2f24-4c0a-a347-320f4a5d75c3`

screen_code: GBOOT

**노트: **S-53 · 첫 실행과 저장소 상태에 따라 전체 화면 가드가 뜨는 자리

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| GBOOT.01 | display | 앱 시작(모든 화면 위) | 기본 |  | 첫 실행과 저장소 상태에 따라 전체 화면 가드가 뜨는 자리 |
| GBOOT.02 | button | 조건 충족 때 자동 | 기본 | 누름 | →SONBOA 온보딩 |
| GBOOT.03 | button | 조건 충족 때 자동 | 기본 | 누름 | →SSCHEM 새 버전으로 새로고침해 주세요 |
| GBOOT.04 | button | 조건 충족 때 자동 | 기본 | 누름 | →STABSE 다른 탭에서 열려 있어요 |
| GBOOT.05 | button | 조건 충족 때 자동 | 기본 | 누름 | →STABOL 옛 버전 탭 띠 |
| GBOOT.06 | button | 조건 충족 때 자동 | 기본 | 누름 | →STABIM 다른 탭에서 기록을 가져오는 중이에요 |
| GBOOT.07 | button | 업데이트 시작 | 기본 | 누름 | →SUPDAT 업데이트하는 중이에요 |
| GBOOT.08 | button | 조건 충족 때 자동 | 기본 | 누름 | →SOWNER 이 기기에 다른 계정의 기록이 있어요 |
| GBOOT.09 | button | 조건 충족 때 | 기본 | 누름 | →YERROR 오류 화면(문제가 발생했습니다) |
| GBOOT.10 | button | 조건 충족 때 | 기본 | 누름 | →YX 404(Next 기본) |
| GBOOT.11 | button | 조건 충족 때 | 기본 | 누름 | →YBOOT 부팅 덮개 |
| GBOOT.12 | button | 조건 충족 때 | 기본 | 누름 | →YUPDBO 업데이트 직후 덮개 |
| GBOOT.13 | button | 조건 충족 때 | 기본 | 누름 | →YSW 서비스 워커 최후 대체(글자 offline) |
| GBOOT.14 | button | 조건 충족 때 | 기본 | 누름 | →YAPPOF 앱 오프라인: 인터넷에 연결되어 있지 않아요 |
| GBOOT.15 | button | 조건 충족 때 | 기본 | 누름 | →YAPK APK 404(글자 not found) |
| GBOOT.16 | button | 조건 충족 때 | 기본 | 누름 | →YSTATE 화면별 로딩·오류 상태 |
