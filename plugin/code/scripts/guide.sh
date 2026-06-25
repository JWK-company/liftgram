#!/bin/bash
# guide.sh — Ouroboros 워크플로우 가이드 (토큰 소비 없음)
# 사용법: make guide / make guide TOPIC=skills

TOPIC="${1:-overview}"

case "$TOPIC" in
overview)
cat << 'EOF'
🔮 Ouroboros 워크플로우 시스템

당신의 모든 작업 경험이 서버에 축적되어, 같은 실수를 반복하지 않고
프로젝트 지식이 자동으로 공유되는 AI 코딩 워크플로우입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 구성 요소

  MCP 서버 (Ouroboros)
    ├─ Neo4j     — 메모리 + 지식 그래프 (벡터 검색)
    ├─ ClickHouse — 대화 기록 + 이벤트 로그
    ├─ Ollama    — GPU 임베딩 (qwen3-embedding 1024d)
    └─ Dashboard — 웹 대시보드

  Template (이 프로젝트에 설치됨)
    ├─ 13개 스킬    — /patch, /spec, /execute, /fix, /qa 등
    ├─ 6개 Hook     — 자동 가이드, 범위 감시, 대화 동기화
    ├─ 10개 프로토콜 — Auto-collection, Signal, RRF 검색
    └─ 동적 전문가   — 작업 성격에 맞는 전문가를 Claude가 자동 구성

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 기본 사용법 (Claude Code 내에서)

  /patch "설명"         → 단순 수정 즉시 실행 (spec 불필요)
  /spec "기능 설명"     → 복잡도 분석 + 설계 문서 생성
  /execute              → 설계 기반 구현 (자동 메모리 수집)
  /fix                  → 에스컬레이션 디버깅 (5단계)
  /qa                   → 전문가 패널 리뷰
  /suggest              → 현재 상태 분석 + 다음 액션 추천

  /reflect              → 회고 + 인사이트 저장
  /onboarding           → 프로젝트 구조/선호 동기화
  /ask "질문"           → 전문가 팀 질문 (경량)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 상세 가이드 (터미널에서 실행, 토큰 소비 없음)

  make guide                    전체 개요 (지금 보는 것)
  make guide TOPIC=skills       13개 스킬 상세
  make guide TOPIC=memory       메모리 시스템
  make guide TOPIC=hooks        Hook 시스템
  make guide TOPIC=tiers        5-Tier 복잡도
  make guide TOPIC=agents       동적 전문가
  make guide TOPIC=dashboard    대시보드 사용법
  make guide TOPIC=recovery     CC 복구 프로토콜
  make guide TOPIC=config       설정 파일
  make guide TOPIC=suggest      /suggest 사용법
EOF
;;

skills)
cat << 'EOF'
📋 13개 스킬 상세

━━ Core (매일 사용) ━━

  /patch "설명"
    spec 없이 파일 1-2개 단순 수정을 즉시 실행합니다.
    범위가 커지면 자동으로 /spec으로 에스컬레이션합니다.

  /spec "설명"
    복잡도를 자동 분석하고 등급별 설계 문서를 생성합니다.
    Patch(0-1점) → Task(2-3) → Feature(4-6) → Project(7-9) → Epic(10+)
    예: /spec "로그인 폼에 유효성 검사 추가"

  /execute
    /spec으로 생성한 설계 문서를 기반으로 구현합니다.
    작업 중 gotcha/pattern/insight를 자동 감지하여 메모리에 저장합니다.
    --continue 옵션으로 다음 Phase로 진행합니다.

  /fix
    버그를 점진적으로 디버깅합니다. 6단계 에스컬레이션:
    히스토리 검색 → 빠른 진단 → 심화 분석 → 외부 조사 → 전략 전환 → 완료
    5회 hard limit으로 무한 루프 방지.

  /qa
    동적 전문가 패널이 코드/설계를 리뷰합니다.
    /qa spec (설계 리뷰) / /qa code (코드 리뷰)
    Feature 등급: 3인, Project+: 5인.

━━ Periodic (주기적) ━━

  /reflect      — 작업 회고 + 인사이트 메모리 저장
  /onboarding   — 프로젝트 구조/사용자 선호 동기화
  /housekeeping — 메모리 정리 (중복 제거, stale 검증)

━━ On-demand ━━

  /ask "질문"   — 전문가 팀에 경량 질문 (문서 생성 안 함)
  /suggest      — 현재 상태 분석 + 다음 액션 추천
  /guide        — 워크플로우 가이드
  /study "주제" — 수준별 맞춤 교육 자료 생성

━━ Extended ━━

  /evolve       — 메모리 → 지식 그래프 일반화

━━ Meta (토큰 소비 없이 터미널에서: make guide TOPIC=skills) ━━

  make guide TOPIC=skills — 이 가이드 (터미널 직접 출력, LLM 불필요)
EOF
;;

memory)
cat << 'EOF'
🧠 메모리 시스템

━━ 저장 ━━

  memory_store로 저장됩니다. 6가지 타입:
    gotcha     — 삽질/함정 (예: "이 API는 null을 빈 배열로 반환")
    pattern    — 재사용 패턴 (예: "에러는 Result 타입으로 통일")
    decision   — 기술 결정 (예: "ORM 대신 raw SQL 사용")
    insight    — 비자명한 원리 (예: "미들웨어 순서가 중요")
    domain     — 도메인 지식
    preference — 사용자/프로젝트 선호 (예: "탭 대신 스페이스 2칸")

━━ 자동 수집 ━━

  /execute 중 Claude가 gotcha/pattern/insight를 감지하면:
  1. memory_search로 중복 확인 (유사도 >=0.90 → 스킵)
  2. memory_store로 저장
  3. 1줄 보고
  세션당 최대 5건.

━━ 검색 ━━

  memory_search: Ollama GPU 임베딩(1024d) + Neo4j 벡터 검색
  4축 RRF 리랭킹: semantic(0.4) + recency(0.3) + access(0.15) + source(0.15)
  개인 메모리 > 프로젝트 메모리 우선

━━ 라이프사이클 ━━

  active → stale_candidate → archived
  - 관련 파일 변경 시 stale_candidate로 전환
  - 6개월 미접근 시 자동 감쇠
  - /housekeeping으로 주기적 정리
EOF
;;

hooks)
cat << 'EOF'
🪝 Hook 시스템 (6개)

  자동으로 동작하며 사용자 개입이 필요 없습니다.

  1. user-prompt-reminder (UserPromptSubmit)
     → 매 프롬프트마다 가이드라인 5줄 주입 + 미완료 작업 경고

  2. knowledge-signal (PostToolUse: AskUserQuestion)
     → 사용자 응답에서 선호/패턴 감지 → KG 저장 유도

  3. event-capture (PostToolUse + UserPromptSubmit)
     → 도구 호출/프롬프트를 서버에 기록

  4. conversation-sync (UserPromptSubmit + PreCompact)
     → JSONL 대화 전체를 서버에 자동 동기화
     → 대시보드 Sessions에서 전체 기록 조회 가능

  5. context-compact-recovery (PreCompact)

  6. git-guard (PreToolUse: Bash)
     → git commit, push, reset 등 파일 변경 명령어 실행 전 사용자 확인
     → CC 발생 시 state.json 기반 복구 지침 주입
EOF
;;

tiers)
cat << 'EOF'
📊 5-Tier 복잡도 체계

  /spec 실행 시 자동 분석됩니다.

  ┌────────┬───────┬──────────────────────────────┐
  │ 등급    │ 점수  │ 기준                          │
  ├────────┼───────┼──────────────────────────────┤
  │ Patch  │ 0-1   │ 파일 1-2, 단순 수정            │
  │ Task   │ 2-3   │ 파일 2-5, 단일 관심사          │
  │ Feature│ 4-6   │ 파일 5+, FE+BE, 새 API        │
  │ Project│ 7-9   │ 멀티 도메인, DB 변경           │
  │ Epic   │ 10+   │ 멀티 프로젝트                  │
  └────────┴───────┴──────────────────────────────┘

  등급에 따라 달라지는 것:
  - 동적 전문가: Patch/Task=선택 / Feature+=필수
  - 설계 문서 상세도: Patch=~20줄 / Epic=~500줄
EOF
;;

agents)
cat << 'EOF'
👥 동적 전문가 시스템

  /qa 또는 /ask 실행 시 Claude가 작업 성격을 분석하여
  적합한 전문가를 자동으로 구성합니다.

  예시:
    API 설계 리뷰 → API 아키텍트, 보안 감사관, DX 전문가
    DB 마이그레이션 → DBA, 성능 분석가, 데이터 무결성 전문가
    프론트엔드 구현 → UX 전문가, 접근성 감사관, 성능 최적화 전문가

  전문가 수: 등급에 따라 자동 조절
    Task: 1-2명 / Feature: 2-3명 / Project+: 3-5명

  결과물에 참여 전문가의 역할과 전문 분야가 명시됩니다.
EOF
;;

dashboard)
cat << 'EOF'
📊 대시보드 사용법

  URL: .ouroboros/env/.env의 EVENT_LOG_URL 도메인
  로그인: API 키 (OUROBOROS_API_KEY)

  탭:
  ┌──────────┬──────────────────────────────┐
  │ Overview │ 메모리 수, 활성 수, 세션, 도구 호출 │
  │ Memories │ 메모리 목록 + 벡터 검색          │
  │ Sessions │ 세션 목록 → 클릭 시 전체 대화    │
  │ Admin    │ 라이센스 관리 (발급/폐기/갱신)   │
  └──────────┴──────────────────────────────┘

  Sessions에서 세션을 클릭하면:
  - 👤 USER: 사용자 입력
  - 🤖 ASSISTANT: Claude 응답
  - 🔧 TOOL: 도구 호출 (파일 경로, 코드 diff)
  - 📋 RESULT: 도구 실행 결과
  긴 내용은 "더보기" 버튼으로 펼침
EOF
;;

recovery)
cat << 'EOF'
🔄 Context Compact 복구

  컨텍스트가 압축되면 Hook이 자동으로 복구를 안내합니다.

  1. context-compact-recovery Hook이 state.json을 읽음
  2. 현재 active_skill에 따라 최소 읽기 세트 안내
  3. 안내대로 읽고 이어서 작업

  스킬별 복구:
    spec/reflect/fix → current.md만 (~200 토큰)
    execute Step 1-3  → current.md + spec (~400 토큰)
    execute Step 4+   → current.md + spec + phase (~600 토큰)

  금지:
    ✗ "어디까지 했나요?" 질문
    ✗ 문서 미확인 후 추측 진행
EOF
;;

config)
cat << 'EOF'
⚙️ 설정 파일

  .ouroboros/env/.env
    OUROBOROS_URL      — MCP 서버 URL
    OUROBOROS_API_KEY  — API 키
    DEVELOPER_USER_ID  — 사용자 ID
    PROJECT_ID         — 프로젝트 ID
    EVENT_LOG_URL      — 대시보드 URL (대화 동기화)

  .mcp.json
    ouroboros          — MCP 서버 연결 (type: "http", URL에 key 포함)
    sequential-thinking — 단계적 사고
    context7           — 라이브러리 문서
    serena             — 코드 구조 분석

  ${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json
    Hook 설정 (수정 불필요)

  확인: make doctor
EOF
;;

suggest)
cat << 'EOF'
🧭 /suggest — 다음 액션 추천

  현재 프로젝트 상태를 분석하고 어떤 스킬을 써야 할지 추천합니다.
  "뭐 해야 하지?" 싶을 때 사용하세요.

  사용법 (Claude Code 내에서):
    /suggest             → 상태 분석 + 추천

  분석하는 것:
    - state.json (활성 스킬, 등급, Phase)
    - current.md (작업 상태, 차단 요소)
    - git status (커밋 안 된 변경)
    - 최근 메모리

  추천 예시:
    📍 idle 상태        → /spec 또는 /housekeeping
    📍 spec 완료        → /execute 또는 /qa (설계 리뷰)
    📍 구현 중          → /execute --continue 또는 /fix
    📍 Phase 완료       → /execute --continue (다음 Phase)
    📍 전체 완료        → /reflect + /housekeeping
    📍 정리 필요        → 커밋 → /housekeeping → /onboarding

  추천 결과에서 번호를 말하면 바로 실행됩니다.
EOF
;;

*)
echo "알 수 없는 주제: $TOPIC"
echo ""
echo "사용 가능한 주제:"
echo "  overview, skills, memory, hooks, tiers, agents, dashboard, recovery, config, suggest"
echo ""
echo "예: make guide TOPIC=skills"
;;
esac
