# WF-EXD — S-10 EXD 운동 상세

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-EXD.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-032, SRS-046, SRS-056, SRS-067, SRS-076, SRS-084, SRS-101

### 운동 상세

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:1a5ef2a4-4b30-49c6-a7b9-5ac2aa449ebd`

screen_code: EXD · route: /exercise/[id]

**노트: **S-10 · 종목 설명, 자세, 진행 그래프, 대체운동 · 조건: 없는 id는 404

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| EXD.01 | display | 운동 상세 | 기본 / 없는 id는 404 |  | 종목 설명, 자세, 진행 그래프, 대체운동 |
| EXD.02 | display | S-10.1 머리 | 기본 |  | ← · 「운동 상세」 |
| EXD.03 | display | S-10.2 이름·별칭 | 기본 |  | ⋯ 이름 바꾸기 |
| EXD.04 | display | S-10.3 내 기록 | 기본 |  | 추정 1RM 추세 |
| EXD.05 | display | S-10.4 자세 그림·영상 | 기본 |  |  |
| EXD.06 | display | S-10.5 시연 사진 | 기본 |  |  |
| EXD.07 | display | S-10.6 동작 주의 | 기본 |  |  |
| EXD.08 | display | S-10.7 자세 설명 | 기본 |  |  |
| EXD.09 | display | S-10.8 분류 | 기본 |  | 주동근 · 보조근 · 기구 · 하중 |
| EXD.10 | display | S-10.9 대체 운동 | 기본 |  |  |
| EXD.11 | display | S-10.10 관리 줄 | 기본 |  | 편집 · 보관 |
| EXD.12 | button | 대체운동 링크 | 기본 | 누름 | →EXD 운동 상세 |
| EXD.13 | nav | 뒤로 | 기본 | 누름 | →EXL 종목 목록 |
| EXD.14 | button | 보관 버튼 | 기본 | 누름 | →SARCHI 운동 보관 |
| EXD.15 | button | 이름 탭 | 기본 | 누름 | →SALIAS 이 종목을 무엇이라 부를까요? |
| EXD.16 | button | 확인 필요 목록 | 기본 | 누름 | →SCHECK 이 기록이 맞나요? |
