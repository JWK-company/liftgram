#!/bin/bash
# knowledge-signal.sh -- 사용자 AskUserQuestion 응답에서 암시적 선호 감지
# 트리거: PostToolUse (matcher: AskUserQuestion)
# 출력: stdout -> Claude 컨텍스트 주입 (선호 감지 지시)
# [M6] T1 키워드 2-gram + 부정 패턴 적용

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"

debug_log "시작"

MARKER="/tmp/claude_ks_${PROJECT_NAME}"

# stdin에서 사용자 응답 추출
RESPONSE=""
if has_jq; then
  RESPONSE=$(cat | jq -r '.tool_result // empty' 2>/dev/null || echo "")
else
  RESPONSE=$(cat)
fi

debug_stdin "$RESPONSE"

# [M6] T1 키워드 패턴 (2-gram 이상)
# 의도적 선호 표현만 매칭하도록 문맥 포함
# bash 3.2 호환: 배열 선언은 ()로
T1_POSITIVE_PATTERNS=(
  '항상[[:space:]]+.{1,20}(해|해줘|하세요|해야|으로)'
  '절대[[:space:]]+.{1,20}(마|않|말|금지|하지)'
  '매번[[:space:]]+.{1,20}(해|해줘|하세요|해야)'
  '선호[[:space:]]*[는은이가]'
  '싫어[[:space:]]*[하해]'
  '하지[[:space:]]*마'
  'always[[:space:]]+use'
  'never[[:space:]]+use'
  'prefer[[:space:]]+(to|using|the)'
  'don.t[[:space:]]+(ever|use|do)'
)

# [M6] T1 부정 패턴: 기술적 설명은 선호가 아님
T1_NEGATIVE_PATTERNS=(
  '항상[[:space:]]+(null|undefined|0|false|true|에러|오류|실패)'
  '절대[[:space:]]+(값|경로|주소|좌표|위치)'
  '항상[[:space:]]+(반환|리턴|return|throw|발생)'
  '절대[[:space:]]+(좌표|값)[[:space:]]*(이|가|을|를)'
)

# T1 키워드 사전 감지 (2-gram + 부정 패턴)
T1_HINT=""
if [ -n "$RESPONSE" ]; then
  MATCHED=false

  # 긍정 패턴 매칭
  for pattern in "${T1_POSITIVE_PATTERNS[@]}"; do
    if echo "$RESPONSE" | grep -qE "$pattern"; then
      MATCHED=true
      debug_log "T1 긍정 패턴 매치: $pattern"
      break
    fi
  done

  # 부정 패턴으로 오탐 필터링
  if [ "$MATCHED" = true ]; then
    for neg_pattern in "${T1_NEGATIVE_PATTERNS[@]}"; do
      if echo "$RESPONSE" | grep -qE "$neg_pattern"; then
        MATCHED=false
        debug_log "T1 부정 패턴 매치 (오탐 필터): $neg_pattern"
        break
      fi
    done
  fi

  if [ "$MATCHED" = true ]; then
    # [M6] 변경: "즉시 저장" -> "확인 후 저장"
    T1_HINT="[KS-T1] 선호 키워드 감지됨. 사용자에게 선호(preference)인지 확인 후 knowledge_store 호출."
    debug_log "T1 힌트 생성"
  fi
fi

# Progressive Disclosure
LAST_MOD=0
if [ -f "$MARKER" ]; then
  # macOS: stat -f %m, Linux: stat -c %Y
  LAST_MOD=$(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null || echo 0)
fi
NOW=$(date +%s)
ELAPSED=$((NOW - LAST_MOD))

if [ -f "$MARKER" ] && [ "$ELAPSED" -lt 1800 ]; then
  # Compact (1줄 + T1 힌트): 30분 이내 재발동
  echo "[KS] 선호 감지 -> T1(명시적)=확인 후 저장 | T2(구조적)=query 확인 | T3(상황적)=무시"
  [ -n "$T1_HINT" ] && echo "$T1_HINT"
  debug_log "Compact 모드 (경과: ${ELAPSED}초)"
else
  # Full (4줄 + T1 힌트): 첫 발동 또는 30분 경과
  touch "$MARKER" 2>/dev/null
  cat << 'REMINDER'
[KS] 사용자 응답 분석 -> 선호 신호 감지 시 knowledge_store 저장.
T1(명시적/오버라이드): 키워드 감지 시 선호인지 확인 후 저장. 패턴: "항상 ~해", "절대 ~하지", "매번 ~해줘"
T2(구조적 선택): knowledge_query로 기존 값 확인 후 저장. 복잡도/브랜치/접근방식/스타일 질문.
T3(상황적/사실확인): 무시. 범위확인/차단/검증 질문.
REMINDER
  [ -n "$T1_HINT" ] && echo "$T1_HINT"
  echo "참조: ${CLAUDE_PLUGIN_ROOT}/workflow/protocols/knowledge-signal.md"
  debug_log "Full 모드 (경과: ${ELAPSED}초)"
fi

debug_log "완료"
exit 0
