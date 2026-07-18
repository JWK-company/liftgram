# HTML 보고서 공통 규약 (전 타입 공통 — 타입별 가이드보다 먼저 읽기)

> `/plan:report <type>`이 참조하는 공통 계약. 타입별 상세는 같은 디렉토리의 `governance.md` · `survey.md` · `analysis.md` · `verification.md` · `showcase.md`.

## 1. 파일 규약
- 저장: `.ouroboros/docs/report/YYYYMMDD_{slug}_{type}.html`
- **자기완결(self-contained)**: 외부 CDN·폰트·스크립트 의존 0. CSS·JS 전부 인라인. 오프라인에서 열려야 함.
- 다크 테마 기본 + `@media print` 라이트 오버라이드(인쇄 친화). 모바일 반응형(max-width 컨테이너).
- 헤더 필수: 프로젝트명 · 생성일 · 범위/출처 · (설문이면) 문항 수.

## 2. 전달 방법 (사용자에게 도달하는 경로)
1. **메신저 첨부(기본)**: `plm_upload.py`(또는 `/plm-hub:upload`)로 업로드 → `message` 도구 `files` 인자(릴레이 0.1.4+) 또는 attachments로 전송. 사용자는 대시보드 메신저에서 클릭 즉시 열람.
2. **아티팩트 본문 임베드**: 업로드가 반환한 file 노드를 CODE.json `doc.content`에 삽입.
3. (개발자 로컬 한정) Tailscale 정적 서빙 — 일반 사용자 전달용으로 쓰지 말 것.

## 3. HTML 서빙 제약 (대시보드 /api/files — 반드시 준수)
- **CSP `sandbox allow-scripts`로 서빙됨**: JS는 실행되지만 문서가 **opaque origin**에서 돎.
  - `document.cookie` / `localStorage` / 인증 fetch **불가** — 시도하면 예외. try/catch 없이 쓰지 말 것.
  - **폼 submit 불가**(allow-forms 없음) — 서버 전송 대신 "텍스트 생성→복사→메신저 붙여넣기" 패턴 사용.
  - clipboard API는 실패할 수 있음 → `execCommand("copy")` 폴백 + "전체 선택됨, Ctrl+C" 안내 필수.
  - 입력값은 저장 불가(새로고침=소실) — 문서 상단에 명시 안내.
- 접근은 로그인 사용자(쿠키) 또는 단기 서명 URL만 — 링크 공유 대신 첨부로 전달.
- 25MB 상한. 이미지가 크면 별도 업로드 후 `<img src="/api/files/<key>">` 참조(같은 게이트 하에서 로딩됨 — 단 opaque origin 특성상 인라인 data URI가 더 안전).

## 4. 품질 게이트 — 3사이클 검증 (제출 전 필수)
- **C1 정확성**: 모든 수치·사실을 수집 데이터/코드와 교차 대조. 추측·날조 0. 개수 집계는 재계산으로 검증.
- **C2 완전성·정합**: 요구된 항목 누락 0(원문 문장 단위 매핑), HTML 태그 균형(파서 검사), 플레이스홀더/TODO 0, 앵커·내부 링크 유효.
- **C3 적대적 리뷰**: "최고 컨설팅펌 파트너라면 뭘 지적할까" — 서사·시각 완성도·의사결정 유용성. 인터랙티브면 **실제 브라우저에서 조작 검증**(chrome-devtools 등).
- 검증 로그를 부록에 1~3줄로 기록. 결함 발견 시 사이클 추가(결함 0까지).

## 5. 공통 디자인 토큰 (권장)
```css
:root{--bg:#0e1117;--surface:#161b24;--surface2:#1d2430;--ink:#e6e9f0;--mut:#9aa4b5;
--line:#2a3342;--acc:#6c8bff;--ok:#3fca7d;--warn:#e6b23f;--bad:#e0605f;}
```
- 상태 칩(구현됨/Draft/갭/OK 등)·KPI 카드·zebra 표·접이식 details는 타입 가이드의 마크업 재사용.
- 차트는 인라인 SVG/CSS 바만(외부 라이브러리 금지). 색+레이블 병기(접근성).
