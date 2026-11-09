# WF-GSYNC — S-51 GSYNC 백업 경고 띠

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-GSYNC.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-053, SRS-086

### 백업 경고 띠

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:6dd32e02-75fb-48a5-aa27-41186e4450e5`

screen_code: GSYNC

**노트: **S-51 · 기록이 서버에 백업되지 않을 때 안내. 하루 접기 가능 · 조건: /account 제외

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| GSYNC.01 | display | 백업 경고 띠 | 기본 / /account 제외 |  | 기록이 서버에 백업되지 않을 때 안내. 하루 접기 가능 |
| GSYNC.02 | button | 경고 띠 | 기본 | 누름 | →AUTH 계정·로그인 |
