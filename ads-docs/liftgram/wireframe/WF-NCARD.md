# WF-NCARD — S-174 NCARD 운동 카드 알림

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-NCARD.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-096

### 운동 카드 알림

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:c973c961-2b5d-40eb-bc67-51c521ca0bc5`

screen_code: NCARD

**노트: **S-174 · +30초, 건너뛰기, 완료, 앱 열기 · 조건: 운동 중, 알림 허용

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| NCARD.01 | display | 운동 카드 알림 | 기본 / 운동 중, 알림 허용 |  | +30초, 건너뛰기, 완료, 앱 열기 |
| NCARD.02 | button | 본문·앱 열기 | 기본 | 누름 | →ACT 운동 중 |
