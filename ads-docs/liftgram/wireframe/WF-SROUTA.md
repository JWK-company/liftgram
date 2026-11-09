# WF-SROUTA — S-155 SROUTA 루틴 미리보기

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-SROUTA.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-072, SRS-075, SRS-091, SRS-093, SRS-110

### 루틴 미리보기

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:e87a739d-462c-43d1-80bb-670e0c95e1f0`

screen_code: SROUTA · route: / 위

**노트: **S-155 · 종목마다 세트 요약(운동 화면과 같은 순서·슈퍼셋) · 「편집」 · 「이 루틴으로 시작」(v0.81.0 · SPEC-045)

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| SROUTA.01 | display | 루틴 미리보기 | 기본 |  | 종목마다 세트 요약(운동 화면과 같은 순서·슈퍼셋) · 「편집」 · 「이 루틴으로 시작 |
| SROUTA.02 | overlay | 패널 | 열림 / 닫힘 | 바깥 누름 | ⊕닫힘 |
| SROUTA.03 | display | S-155.1 시트 머리 | 기본 |  | 루틴 이름 |
| SROUTA.04 | display | S-155.2 종목 목록 | 기본 |  | 번호 · 이름 · 「n세트 · 횟수」 · 슈퍼셋 묶음 |
| SROUTA.05 | display | S-155.3 버튼 줄 | 기본 |  | 편집 · ▶ 시작 |
| SROUTA.06 | button | 이 루틴으로 시작 | 기본 | 누름 | →ACT 운동 중 |
| SROUTA.07 | button | 편집 | 기본 | 누름 | →RTE 루틴 편집 |
