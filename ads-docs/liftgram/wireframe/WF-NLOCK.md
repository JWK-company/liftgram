# WF-NLOCK — S-172 NLOCK 잠금 운동 화면

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-NLOCK.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-100

### 잠금 운동 화면

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:ed2ee281-c2c8-4c2f-9ef3-94b60f774992`

screen_code: NLOCK

**노트: **S-172 · 운동 시간, 쉬는 시간 링(끝나면 총시간), 무게·횟수, 꾹 눌러 세트 완료, 잠금 해제 · 조건: 설정 켬, 운동 중, 잠금

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| NLOCK.01 | display | 잠금 운동 화면 | 기본 / 설정 켬, 운동 중, 잠금 |  | 운동 시간, 쉬는 시간 링(끝나면 총시간), 무게·횟수, 꾹 눌러 세트 완료, 잠금 해 |
| NLOCK.02 | button | 잠금 해제 | 기본 | 누름 | →ACT 운동 중 |
