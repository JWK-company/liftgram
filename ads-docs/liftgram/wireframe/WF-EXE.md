# WF-EXE — S-12 EXE 운동 수정

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-EXE.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-031, SRS-056, SRS-071, SRS-072, SRS-076

### 운동 수정

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:6ccbc45f-6153-4cde-8069-eb0d31678ae2`

screen_code: EXE · route: /exercises/[id]/edit

**노트: **S-12 · 내 종목 고치기 · 조건: 없는 id는 오류 토스트

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| EXE.01 | display | 운동 수정 | 기본 / 없는 id는 오류 토스트 |  | 내 종목 고치기 |
| EXE.02 | display | 저장 후 | 기본 | 자동 | →EXL 종목 목록 |
| EXE.03 | nav | 뒤로 | 기본 | 누름 | →EXL 종목 목록 |
