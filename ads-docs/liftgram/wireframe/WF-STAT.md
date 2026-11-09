# WF-STAT — S-04 STAT 분석

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-STAT.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-033, SRS-054, SRS-074, SRS-076, SRS-078, SRS-079, SRS-090, SRS-101

### 분석

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:69418340-0858-481e-82d5-ad629a5962b2`

screen_code: STAT · route: /stats

**노트: **S-04 · 기간별 집계, 1RM, 근육 분포, 최근 PR(› 누르면 그 운동 기록), 체중 그래프(「그래프를 눌러 값 보기」) · 조건: 누구나

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| STAT.01 | display | 분석 | 기본 / 누구나 |  | 기간별 집계, 1RM, 근육 분포, 최근 PR(› 누르면 그 운동 기록), 체중 그래프 |
| STAT.02 | display | S-04.1 앱바 | 기본 |  | 「분석」 |
| STAT.03 | display | S-04.2 기간 선택 | 기본 |  |  |
| STAT.04 | display | S-04.3 대표 카드 | 기본 |  | 볼륨 · 증감 · 주별 막대 |
| STAT.05 | display | S-04.4 숫자 줄 | 기본 |  | 세션 · 세트 · 평균 + 증감 |
| STAT.06 | display | S-04.5 추정 1RM 목록 | 기본 |  |  |
| STAT.07 | display | S-04.6 1RM 변화 | 기본 |  |  |
| STAT.08 | display | S-04.7 근육 균형 | 기본 |  |  |
| STAT.09 | display | S-04.8 세트 힘든 정도 | 기본 |  |  |
| STAT.10 | display | S-04.9 최근 PR | 기본 |  | 1RM 목록에 없는 PR · 줄을 누르면 그 기록 |
| STAT.11 | display | S-04.10 광고 자리 | 기본 |  |  |
| STAT.12 | display | S-04.11 그대로인 종목 | 기본 |  |  |
| STAT.13 | display | S-04.12 근육별 주간 세트 | 기본 |  |  |
| STAT.14 | display | S-04.13 체중 | 기본 |  |  |
| STAT.15 | display | S-04.14 의료 아님 고지 | 기본 |  |  |
| STAT.16 | button | 안 한 근육 칩 | 기본 | 누름 | →EXL 종목 목록 |
| STAT.17 | button | 1RM 줄, 변화 카드 | 기본 | 누름 | →EXD 운동 상세 |
| STAT.18 | button | 기록 버튼 | 기본 | 누름 | →SBW 체중 기록 |
| STAT.19 | button | 목표 탭 | 기본 | 누름 | →SBWGOA 목표 체중 |
| STAT.20 | button | 미리 보기 | 기본 | 누름 | →SAD 광고 자리 |
| STAT.21 | button | 최근 PR 줄 › | 기본 | 누름 | →WDT 기록 상세 |
