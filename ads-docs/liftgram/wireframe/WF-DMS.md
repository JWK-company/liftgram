# WF-DMS — S-22 DMS 메시지

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-DMS.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-066, SRS-071, SRS-080

### 메시지

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:e116cfcb-58c7-482d-9c6d-65def2ad3c8f`

screen_code: DMS · route: /messages

**노트: **S-22 · 대화 목록 · 조건: 로그인 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| DMS.01 | display | 메시지 | 기본 / 로그인 필요 |  | 대화 목록 |
| DMS.02 | button | 빈 목록 버튼 | 기본 | 누름 | →DISC 사람 찾기 |
| DMS.03 | button | 대화 줄 | 기본 | 누름 | →DMC 대화방 |
| DMS.04 | button | 머리 버튼 | 기본 | 누름 | →DMN 새 그룹 |
| DMS.05 | nav | 뒤로 | 기본 | 누름 | →FEED 피드 |
