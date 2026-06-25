프로젝트 코드 구조, 사용자 선호, 딥 분석을 3가지 모드로 동기화한다. --mode 플래그로 project/user/knowledge 중 선택하여 실행한다.

## 파라미터

- `--mode` (필수): `project` / `user` / `knowledge`
- `$ARGUMENTS` (선택): 모드별 추가 인자

---

## --mode project (코드 구조 동기화)

프로젝트 파일 구조, 심볼, 의존성을 스캔하여 코드 구조 그래프에 동기화.

### Step 1: 프로젝트 파일 스캔
```bash
git ls-files  # 500개 제한
```

### Step 2: 언어 매핑
확장자 → 언어 자동 매핑 (.ts → TypeScript, .rs → Rust 등)

### Step 3: 심볼 추출 (serena 활용)
```
mcp__serena__get_symbols_overview(relative_path="{파일}")
```
→ 정규식 대신 serena의 심볼 분석 도구로 정확한 함수/클래스/인터페이스 추출
→ 100개 코드 파일 제한 내에서 토큰 효율적 처리
- 파일 전체 Read 대신 심볼 단위 분석 원칙 적용
- **fallback:** serena MCP 미연결 시 정규식 기반 심볼 추출로 대체

### Step 4: 의존성 추출
import/require 패턴에서 파일 간 의존성 추출.

**심볼 참조 기반 의존성 보강 (serena):**
```
mcp__serena__find_referencing_symbols(symbol_name="{핵심 심볼}")
```
→ import 패턴 외에 실제 함수 호출/상속 관계까지 파악

**프로젝트 기술 스택 문서 확인 (context7):**
```
mcp__context7__resolve-library-id(library="{주요 프레임워크}")
→ mcp__context7__query-docs(library_id="{id}", query="architecture project structure")
```
→ 프레임워크 공식 구조와 프로젝트 구조 대조
- **fallback:** context7 MCP 미연결 시 WebSearch로 대체

**대규모 프로젝트 분석 시 (sequential-thinking):**
```
mcp__sequential-thinking__sequentialthinking(thought="프로젝트 구조를 레이어별로 분석: 진입점 → 라우팅 → 비즈니스 로직 → 데이터 접근")
```
→ 체계적 온보딩 순서 수립
- **fallback:** sequential-thinking MCP 미연결 시 직접 분석

### Step 5: 배치 전송
**MCP 도구:**
```
project_sync(files=[...], dependencies=[...])   # 50개씩 배치
```

### Step 6: Staleness 감지

**changed_files 전송 방식:**
1. `git diff`로 마지막 동기화 이후 변경 파일 추출
2. Memory의 `related_files`와 매칭
3. 매칭된 메모리 → `stale_candidate` 상태 자동 전환

**Fuzzy matching (파일 리네이밍 대응):**
- 1단계: 정확 매칭 (경로 동일)
- 2단계: 파일명 매칭 (디렉토리 변경 감지)
- 3단계: 상위 2단계 디렉토리 패턴 매칭

### Step 7: 결과 보고
- 동기화된 파일 수, 심볼 수, 의존성 수
- stale_candidate로 전환된 메모리 수

---

## --mode user (사용자 선호 동기화)

JSONL 트랜스크립트 + 이벤트 데이터 분석 → 사용자 선호도 저장.

### Step 1: 이벤트 분석
**MCP 도구:**
```
event_query(type="tools", limit=20)
event_query(type="sessions", limit=20)
```

### Step 2: JSONL 트랜스크립트 샘플링
최근 10세션, 각 head -100줄 분석.

### Step 3: 기존 preference/workflow 메모리 조회
```
memory_search(query="preference workflow style", limit=10)
```
중복 방지용.

### Step 4: 4개 카테고리 분석

| 카테고리 | 분석 대상 |
|---------|----------|
| 코딩 스타일 | 네이밍 컨벤션, 주석 스타일, 코드 구조 |
| 도구 사용 패턴 | 도구 조합, 작업 순서, 빈도 |
| 커뮤니케이션 스타일 | 사용 언어, 상세도, 질문 방식 |
| 작업 방식 | spec 빈도, 작업 단위 크기, 리뷰 활용 |

### Step 5: AskUserQuestion으로 확인 후 저장
카테고리당 1개 메모리. `auto-synced` 태그 부여.
**scope:** 항상 `"personal"` (사용자 선호는 개인 메모리).

### Step 6: 결과 리포트

---

## --mode knowledge (딥 분석, /memorize 흡수)

프로젝트 소스 코드 깊이 분석 → 시맨틱 메모리로 저장.

### Step 1: 분석 대상 선정
`$ARGUMENTS` 또는 AskUserQuestion으로 분석 범위 확인.

### Step 2: 소스 코드 읽기 + 아키텍처 파악 (serena + context7)
- `mcp__serena__get_symbols_overview(relative_path="{파일}")` → 파일별 심볼 구조
- `mcp__serena__find_referencing_symbols(symbol_name="{핵심 심볼}")` → 모듈 간 의존성
- 새 라이브러리 발견 시 `mcp__context7__resolve-library-id` → `mcp__context7__query-docs`로 문서 확인
- 파일 전체 Read 대신 심볼 단위 분석으로 토큰 절약
- **fallback:** serena/context7 MCP 미연결 시 기존 Read + WebSearch로 대체

대상 파일/디렉토리를 Read하여 구조 파악 (serena로 파악 불가능한 부분만).

### Step 3: 기존 메모리 중복 확인
```
memory_search(query="{분석 대상 키워드}", limit=10)
```

### Step 4: 인사이트 추출
- gotcha: 예상 외 동작, 함정
- pattern: 재사용 가능한 패턴
- decision: 설계 결정과 근거
- domain-knowledge: 도메인 특화 지식

### Step 5: 메모리 저장 + 프로젝트 공유 판단
```
memory_store(type="{유형}", title="{제목}", content="{내용}", tags="{태그}")
```
프로젝트 특유 지식 → `knowledge_store` (프로젝트 공유)
범용 지식 → 개인 `memory_store`

**Idea-Only 준수:** content에 파일 경로, 코드 스니펫, 라인 번호 포함 금지. related_files로 별도 첨부.
**scope 규칙:** 프로젝트 특유 지식은 scope: "project", 범용 지식은 scope: "personal".
**user_id/project_id:** .env의 DEVELOPER_USER_ID, PROJECT_ID 사용.

### Step 6: 결과 보고

---

## staleness 감지 상세 (project 모드)

**라이프사이클:**
```
active → stale_candidate → archived
              ^
  코드 변경 / 상충 감지 / 6개월 미접근
```

- stale_candidate: 검색 결과에 포함되지만 "최신이 아닐 수 있음" 경고 첨부
- 30일 미확인 stale → 자동 archived 전환

---

## 등급별 차이

없음 (독립 실행)

---

## 실패/fallback

- **MCP 미연결:** project 모드는 REST API fallback, user/knowledge 모드는 로컬 파일 기반 저장
- **이벤트 데이터 부족 (user 모드):** JSONL만으로 분석
- **분석 대상 불명확 (knowledge 모드):** AskUserQuestion으로 범위 확인
