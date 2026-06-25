#!/bin/bash
# claude-new-doc.sh -- 워크플로우 문서 생성 스크립트
#
# 사용법:
#   bash ${CLAUDE_PLUGIN_ROOT}/scripts/claude-new-doc.sh <TYPE> <NAME>
#
# TYPE: spec | review | knowledge
# NAME: 문서 식별자 (영문 소문자, 하이픈 허용)
#
# 예시:
#   bash ${CLAUDE_PLUGIN_ROOT}/scripts/claude-new-doc.sh spec auth-system
#   bash ${CLAUDE_PLUGIN_ROOT}/scripts/claude-new-doc.sh review auth-system_spec-review

set -e

# =============================================================================
# 인자 검증
# =============================================================================

TYPE="${1:-}"
NAME="${2:-}"

VALID_TYPES="spec review knowledge"

if [ -z "$TYPE" ]; then
  echo "오류: TYPE이 지정되지 않았습니다."
  echo ""
  echo "사용법: $(basename "$0") <TYPE> <NAME>"
  echo "유효한 TYPE: $VALID_TYPES"
  exit 1
fi

if [ -z "$NAME" ]; then
  echo "오류: NAME이 지정되지 않았습니다."
  echo ""
  echo "사용법: $(basename "$0") $TYPE <NAME>"
  exit 1
fi

# TYPE 유효성 검증
VALID=false
for t in $VALID_TYPES; do
  if [ "$TYPE" = "$t" ]; then
    VALID=true
    break
  fi
done

if [ "$VALID" = false ]; then
  echo "오류: 유효하지 않은 TYPE '$TYPE'"
  echo "유효한 TYPE: $VALID_TYPES"
  exit 1
fi

# NAME 형식 검증 (영문 소문자, 숫자, 하이픈, 언더스코어만)
if ! echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9_-]*$'; then
  echo "오류: NAME은 영문 소문자, 숫자, 하이픈, 언더스코어만 허용됩니다."
  echo "예시: auth-system, chat-ux, payment_v2"
  exit 1
fi

# =============================================================================
# 프로젝트 루트 탐색
# =============================================================================

# CLAUDE_PROJECT_DIR이 있으면 사용, 없으면 git root나 현재 디렉토리
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  PROJECT_DIR="$CLAUDE_PROJECT_DIR"
elif git rev-parse --show-toplevel >/dev/null 2>&1; then
  PROJECT_DIR="$(git rev-parse --show-toplevel)"
else
  PROJECT_DIR="$(pwd)"
fi

# =============================================================================
# 경로 및 파일명 생성
# =============================================================================

DATE=$(date +%Y%m%d)
FILENAME="${DATE}_${NAME}.md"
DOC_DIR="$PROJECT_DIR/.ouroboros/docs/$TYPE"
DOC_PATH="$DOC_DIR/$FILENAME"

# 중복 확인
if [ -f "$DOC_PATH" ]; then
  echo "오류: 이미 존재합니다: $DOC_PATH"
  exit 1
fi

# 디렉토리 생성
mkdir -p "$DOC_DIR"

# =============================================================================
# 템플릿 복사 또는 기본 골격 생성
# =============================================================================

TEMPLATE_DIR="${CLAUDE_PLUGIN_ROOT}/workflow/templates"

case "$TYPE" in
  spec)
    TEMPLATE_FILE="$TEMPLATE_DIR/spec_task.md"
    DEFAULT_TITLE="$NAME 스펙"
    ;;
  review)
    TEMPLATE_FILE="$TEMPLATE_DIR/review_report.md"
    DEFAULT_TITLE="$NAME 리뷰"
    ;;
  knowledge)
    TEMPLATE_FILE=""
    DEFAULT_TITLE="$NAME"
    ;;
esac

if [ -n "$TEMPLATE_FILE" ] && [ -f "$TEMPLATE_FILE" ]; then
  # 템플릿 파일이 존재하면 복사 후 메타데이터 추가
  {
    echo "---"
    echo "type: $TYPE"
    echo "name: $NAME"
    echo "created: $(date '+%Y-%m-%d %H:%M')"
    echo "status: draft"
    echo "---"
    echo ""
    cat "$TEMPLATE_FILE"
  } > "$DOC_PATH"
else
  # 템플릿이 없으면 기본 골격 생성
  {
    echo "---"
    echo "type: $TYPE"
    echo "name: $NAME"
    echo "created: $(date '+%Y-%m-%d %H:%M')"
    echo "status: draft"
    echo "---"
    echo ""
    echo "# $DEFAULT_TITLE"
    echo ""
    echo "> Created: $(date '+%Y-%m-%d %H:%M')"
    echo ""

    case "$TYPE" in
      spec)
        echo "## 목적"
        echo ""
        echo "## 범위"
        echo ""
        echo "## 요구사항"
        echo ""
        echo "## 구현 계획"
        echo ""
        echo "## 검증 기준"
        echo ""
        ;;
      review)
        echo "## 대상"
        echo ""
        echo "## 요약"
        echo ""
        echo "## 발견 사항"
        echo ""
        echo "### 긍정적"
        echo ""
        echo "### 개선 필요"
        echo ""
        echo "## 권장 사항"
        echo ""
        ;;
      knowledge)
        echo "## 요약"
        echo ""
        echo "## 상세"
        echo ""
        echo "## 관련 컨텍스트"
        echo ""
        echo "## 참고"
        echo ""
        ;;
    esac
  } > "$DOC_PATH"
fi

# =============================================================================
# 결과 출력
# =============================================================================

# 절대 경로와 상대 경로 모두 출력
REL_PATH=".ouroboros/docs/$TYPE/$FILENAME"

echo "문서 생성 완료:"
echo "  경로: $DOC_PATH"
echo "  상대: $REL_PATH"
echo ""
echo "편집: $REL_PATH"
