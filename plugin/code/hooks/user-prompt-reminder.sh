#!/bin/bash
# user-prompt-reminder.sh -- 모든 사용자 프롬프트에 가이드라인 리마인더 주입
# 트리거: UserPromptSubmit (matcher: "")
# 출력: stdout -> Claude 컨텍스트 주입

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

debug_log "시작"

# 고정 가이드라인 5줄
cat << 'EOF'
[SYSTEM REMINDER]
1. 불확실/애매한 부분 -> AskUserQuestion (추측 금지)
2. 작업 범위: current.md의 "작업 범위" 내 파일만 수정
3. 코드 수정 전 -> 해당 파일 Read 필수
4. 작업 완료 시 -> current.md 즉시 업데이트
5. 컨텍스트: .ouroboros/context/current.md 확인
EOF

# 미완료 작업 경고 (state.json 기반)
ACTIVE_SKILL=$(read_state '.active_skill')
if [ -n "$ACTIVE_SKILL" ]; then
  SKILL_STEP=$(read_state '.skill_step')
  echo "[진행 중] /$ACTIVE_SKILL (Step ${SKILL_STEP:-?})"
  debug_log "active_skill=$ACTIVE_SKILL step=$SKILL_STEP"
fi

# BUG-③: 미완료 task만(closed 제외) + phase 필드는 .current_phase(존재 필드). 과거: read_first_task가
# 끝난 task도 반환 + 없는 .phase 참조로 "Phase 0" 고정 오표기 → 완료 task를 매번 [미완료]로 표시.
TASK_NAME=$(read_first_open_task '.name')
if [ -n "$TASK_NAME" ]; then
  TASK_PHASE=$(read_first_open_task '.current_phase')
  TASK_GRADE=$(read_first_open_task '.grade')
  echo "[미완료] $TASK_NAME ($TASK_GRADE / Phase ${TASK_PHASE:-0})"
  debug_log "task=$TASK_NAME grade=$TASK_GRADE phase=$TASK_PHASE"
fi

# current.md 줄 수 경고
if [ -f "$CURRENT_MD" ]; then
  LINE_COUNT=$(wc -l < "$CURRENT_MD" 2>/dev/null | tr -d ' ')
  if [ "$LINE_COUNT" -gt 120 ] 2>/dev/null; then
    echo "[경고] current.md: ${LINE_COUNT}줄 (제한 100줄). 즉시 정리 필요."
    debug_log "current.md ${LINE_COUNT}줄 - 즉시 정리 필요"
  elif [ "$LINE_COUNT" -gt 100 ] 2>/dev/null; then
    echo "[주의] current.md: ${LINE_COUNT}줄 (제한 100줄). 정리 권장."
    debug_log "current.md ${LINE_COUNT}줄 - 정리 권장"
  fi
fi

debug_log "완료"
exit 0
