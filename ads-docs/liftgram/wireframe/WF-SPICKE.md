# WF-SPICKE — S-63 SPICKE 운동 추가·바꾸기(종목 피커)

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-SPICKE.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-056, SRS-057, SRS-063, SRS-072, SRS-093

### 운동 추가·바꾸기(종목 피커)

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:c4b704b7-c12a-436a-9096-102ff0da537a`

screen_code: SPICKE · route: /workout 위

**노트: **S-63 · 전체 화면 종목 선택

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| SPICKE.01 | display | 운동 추가·바꾸기(종목 피커) | 기본 |  | 전체 화면 종목 선택 |
| SPICKE.02 | overlay | 패널 | 열림 / 닫힘 | 바깥 누름 | ⊕닫힘 |
| SPICKE.03 | display | S-63.1 머리 | 기본 |  | ✕ · 제목 |
| SPICKE.04 | display | S-63.2 검색칸 | 기본 |  |  |
| SPICKE.05 | display | S-63.3 스무고개·초기화 | 기본 |  |  |
| SPICKE.06 | display | S-63.4 근육군 칩 | 기본 |  |  |
| SPICKE.07 | display | S-63.5 기구 칩 | 기본 |  |  |
| SPICKE.08 | display | S-63.6 종목 목록 | 기본 |  | 이름 · 별칭 · 고른 순서 |
| SPICKE.09 | display | S-63.7 비슷한 종목 | 기본 |  | 검색 중 |
| SPICKE.10 | display | S-63.8 하단 「n개 추가」 | 기본 |  |  |
| SPICKE.11 | button | 찾기 버튼 | 기본 | 누름 | →SFINDE 스무고개 찾기 |
