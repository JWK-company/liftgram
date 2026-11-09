# WF-DMC — S-23 DMC 대화방

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-DMC.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-080

### 대화방

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:765bf8bf-d4de-48cd-8b95-ebfa8b3a1339`

screen_code: DMC · route: /messages/[id]

**노트: **S-23 · 대화, 요약 카드 · 조건: 로그인·참여자

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| DMC.01 | display | 대화방 | 기본 / 로그인·참여자 |  | 대화, 요약 카드 |
| DMC.02 | display | 방 나간 후 | 기본 | 자동 | →DMS 메시지 |
| DMC.03 | nav | 뒤로 | 기본 | 누름 | →DMS 메시지 |
| DMC.04 | button | 그룹 메뉴 | 기본 | 누름 | →SLEAVE 그룹 나가기 |
| DMC.05 | button | 요약 카드 | 기본 | 누름 | →SSUMOP 성과 요약 |
