#!/bin/bash
# context-compact-recovery.sh -- CC 발생 시 state.json 기반 정밀 복구 + current.md 주입
# 트리거: PreCompact (matcher: "")
# 출력: stdout -> Claude 컨텍스트 주입 (CC 후 가장 먼저 읽는 정보)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

debug_log "시작"

echo ""
echo "[Context Compact Recovery]"
echo ""

# --- current.md 활성 작업 섹션 출력 ---
if [ -f "$CURRENT_MD" ]; then
  echo "## 활성 작업"
  ACTIVE=$(read_current_section "ACTIVE_TASK" "활성 작업")
  [ -n "$ACTIVE" ] && echo "$ACTIVE"
  echo ""

  # 작업 범위 출력
  SCOPE=$(read_current_section "SCOPE" "작업 범위")
  if [ -n "$SCOPE" ]; then
    echo "## 작업 범위"
    echo "$SCOPE"
    echo ""
  fi

  # 줄 수 경고
  LINE_COUNT=$(wc -l < "$CURRENT_MD" 2>/dev/null | tr -d ' ')
  if [ "$LINE_COUNT" -gt 100 ] 2>/dev/null; then
    echo "[경고] current.md: ${LINE_COUNT}줄. 정리 필요."
    echo ""
  fi
fi

# --- state.json 기반 정밀 복구 ---
ACTIVE_SKILL=$(read_state '.active_skill')
SKILL_STEP=$(read_state '.skill_step')
GRADE=$(read_first_task '.grade')
PHASE=$(read_first_task '.phase')
PLAN_PATH=$(read_first_task '.plan_path')

if [ -n "$ACTIVE_SKILL" ]; then
  echo "## 실행 상태"
  echo "Skill: /$ACTIVE_SKILL (Step ${SKILL_STEP:-?})"
  [ -n "$PHASE" ] && echo "Phase: $PHASE | Grade: ${GRADE:-?}"
  [ -n "$PLAN_PATH" ] && echo "Spec: $PLAN_PATH"
  echo ""

  echo "## 복구 지침"
  echo ""

  case "$ACTIVE_SKILL" in
    execute)
      if [ -n "$SKILL_STEP" ] && [ "$SKILL_STEP" -ge 4 ] 2>/dev/null; then
        echo "1. current.md 읽기"
        echo "2. spec 문서 읽기 ($PLAN_PATH)"
        echo "3. 현재 phase 문서 읽기"
        echo "4. TodoWrite 비어있으면 미완료 항목 재등록 -> 이어서 진행"
        # active_files 출력
        ACTIVE_FILES=$(read_state_lines '.active_files[]')
        if [ -n "$ACTIVE_FILES" ]; then
          echo ""
          echo "## 수정 중 파일 (Re-read 필요)"
          echo "$ACTIVE_FILES" | while IFS= read -r af; do
            [ -n "$af" ] && echo "- $af"
          done
        fi
      else
        echo "1. current.md 읽기"
        echo "2. spec 문서 읽기 ($PLAN_PATH)"
        echo "3. 해당 Step부터 재개"
      fi
      ;;
    spec)
      echo "1. current.md 읽기"
      echo "2. 진행 중인 spec 문서 읽기"
      echo "3. 해당 분석 단계부터 재개"
      ;;
    fix)
      echo "1. current.md 읽기"
      echo "2. 에러 로그/스택트레이스 재확인"
      echo "3. 진행 중인 디버깅 단계에서 재개"
      ;;
    qa)
      echo "1. current.md 읽기"
      echo "2. 리뷰 대상 문서/코드 읽기"
      echo "3. 진행 중인 리뷰 단계에서 재개"
      ;;
    reflect|onboarding|housekeeping|ask|suggest|study|patch|guide|evolve)
      echo "1. current.md 읽기"
      echo "2. 현재 스킬 절차 재개 (spec 문서 읽기 불필요)"
      ;;
    *)
      echo "1. current.md 읽기"
      echo "2. 활성 작업의 spec 문서 읽기"
      echo "3. 이어서 진행"
      ;;
  esac

  debug_log "정밀 복구: skill=$ACTIVE_SKILL step=$SKILL_STEP"
else
  # --- Fallback: state.json 없거나 active_skill 없음 ---
  if [ -f "$CURRENT_MD" ]; then
    echo "## current.md 전문"
    cat "$CURRENT_MD"
    echo ""
  fi

  echo "## 복구 절차 (일반)"
  echo ""
  echo "1. CC summary에서 진행 중이던 작업 파악"
  echo "2. 활성 작업 테이블의 진행 상태와 매칭"
  echo "3. 일치하면 해당 작업의 spec 문서를 읽고 이어서 수행"
  echo "4. 매칭이 불확실하면 AskUserQuestion으로 확인"
  echo "5. '어디까지 했나요?' 묻지 않기"

  debug_log "Fallback 복구 (active_skill 없음)"
fi

# --- 연속 CC 감지 ---
CC_MARKER="/tmp/claude_cc_${PROJECT_NAME}"
CC_COUNT=0

# [M8] idle 상태에서 CC 발생 시 카운터 리셋
if [ -z "$ACTIVE_SKILL" ] || [ "$ACTIVE_SKILL" = "null" ]; then
  # idle 상태: 이전 스킬 정상 완료 후 CC가 발생한 것
  # CC 카운터를 1로 시작 (이전 카운트 무시)
  echo "1" > "$CC_MARKER" 2>/dev/null
  CC_COUNT=1
  debug_log "idle 상태 CC -> 카운터 리셋 (1)"
else
  if [ -f "$CC_MARKER" ]; then
    CC_COUNT=$(cat "$CC_MARKER" 2>/dev/null | tr -d ' ')
    CC_COUNT=$((CC_COUNT + 1))
  else
    CC_COUNT=1
  fi
  echo "$CC_COUNT" > "$CC_MARKER" 2>/dev/null
fi

if [ "$CC_COUNT" -ge 3 ] 2>/dev/null; then
  echo ""
  echo "[경고] CC ${CC_COUNT}회 연속 발생. 작업을 더 작은 단위로 분할하세요."
  debug_log "CC ${CC_COUNT}회 연속 경고"
fi

debug_log "완료 (CC count=$CC_COUNT)"
exit 0
