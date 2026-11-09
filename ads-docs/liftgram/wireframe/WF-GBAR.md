# WF-GBAR — S-50 GBAR 운동 진행 막대

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-GBAR.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-066, SRS-068

### 운동 진행 막대

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:355b0ab3-b757-491e-af54-bcd5ee03ec4c`

screen_code: GBAR

**노트: **S-50 · 「{name} 진행 중」. 운동으로 복귀, 취소 · 조건: 활성 운동이 있고 /workout이 아닐 때

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| GBAR.01 | display | 운동 진행 막대 | 기본 / 활성 운동이 있고 /workout이 아닐 때 |  | 「{name} 진행 중」. 운동으로 복귀, 취소 |
| GBAR.02 | button | 막대 누르기 | 기본 | 누름 | →ACT 운동 중 |
| GBAR.03 | button | 취소 | 기본 | 누름 | →SDISCA 운동 취소 |
