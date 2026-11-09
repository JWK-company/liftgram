# WF-SCHECK — S-158 SCHECK 이 기록이 맞나요?

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-SCHECK.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-061, SRS-065, SRS-067, SRS-069, SRS-084

### 이 기록이 맞나요?

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:edfe01e2-3d38-4519-9506-4c8f14ca63d3`

screen_code: SCHECK · route: /workout 위

**노트: **S-158 · 튀는 기록 확인 — 「lb로 적었어요」 · 「제대로 적었어요」 · 「직접 고치기」 · 되돌리기 토스트(v0.80.0 · SPEC-044) · 조건: 평소보다 1.3배 넘게 튐

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| SCHECK.01 | display | 이 기록이 맞나요? | 기본 / 평소보다 1.3배 넘게 튐 |  | 튀는 기록 확인 — 「lb로 적었어요」 · 「제대로 적었어요」 · 「직접 고치기」 · |
| SCHECK.02 | overlay | 패널 | 열림 / 닫힘 | 바깥 누름 | ⊕닫힘 |
| SCHECK.03 | display | S-158.1 시트 머리 | 기본 |  | 「이 기록이 맞나요?」 |
| SCHECK.04 | display | S-158.2 본문 | 기본 |  | 종목 · 무게×횟수 · 평소 값 |
| SCHECK.05 | display | S-158.3 안내 | 기본 |  | 확인 전까지 PR·1RM 계산에서 빠짐 |
| SCHECK.06 | display | S-158.4 버튼 | 기본 |  | lb로 적었어요 · 제대로 적었어요 · 직접 고치기 |
