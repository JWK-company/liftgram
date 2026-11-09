# WF-RTN — S-13 RTN 새 루틴

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-RTN.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-043, SRS-056, SRS-057, SRS-063, SRS-072, SRS-093

### 새 루틴

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:603aee6f-e6b6-499e-8eac-74d44063cdb6`

screen_code: RTN · route: /routines/new

**노트: **S-13 · 새 루틴 만들기 · 조건: 누구나

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| RTN.01 | display | 새 루틴 | 기본 / 누구나 |  | 새 루틴 만들기 |
| RTN.02 | display | 저장·나가기 | 기본 | 자동 | →WKT 운동 |
| RTN.03 | button | 종목 추가 | 기본 | 누름 | →SPICKE 운동 추가·바꾸기(종목 피커) |
| RTN.04 | button | 뒤로 | 기본 | 누름 | →SREXIT 저장하지 않고 나갈까요? |
| RTN.05 | button | 처방 줄 | 기본 | 누름 | →SRXTYP 세트 타입(처방) |
| RTN.06 | button | 세트 방식 | 기본 | 누름 | →SRXSCH 세트 방식(루틴 편집) |
| RTN.07 | button | 조건 충족 때 자동 | 기본 | 누름 | →SRXTYA 첫 안내: 세트 번호 누르기 |
