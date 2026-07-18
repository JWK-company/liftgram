#!/usr/bin/env bash
# PreToolUse(AskUserQuestion) — 원격 채널 세션에서 AskUserQuestion 을 강제 차단한다.
#
# 근거: plm-channel 플러그인은 `claude --channels plugin:plm-channel` 로 기동할 때만 로드되므로,
#   이 hook 이 활성이면 = 원격(대시보드 구동) 세션이다. 터미널 대화형 질문(AskUserQuestion)은
#   원격 사용자에게 보이지 않고 세션을 무기한 블록시킨다(대시보드 메시지도 못 들어감 → 데드락).
#   릴레이의 REMOTE_ASK_RULE 은 텍스트 규칙이라 무시될 수 있어, 여기서 도구 자체를 deny 로 강제한다.
#
# 동작: AskUserQuestion 을 block 하고, message(kind="question") 로 대시보드에 묻도록 사유를 되돌린다.
# graceful: 항상 exit 0.
cat >/dev/null 2>&1  # stdin(tool input) 소진 — 파이프 블록 방지

cat <<'EOF'
{
  "decision": "block",
  "reason": "★ 원격 채널 세션에서는 AskUserQuestion 을 사용할 수 없습니다 — 터미널 선택 프롬프트는 대시보드 원격 사용자에게 보이지 않고 세션을 무기한 블록시켜 채널 메시지도 못 들어옵니다(데드락). 대신: (1) 스스로 판단 가능한 사항은 질문 없이 자율 진행하고, (2) 사용자의 결정·정보가 꼭 필요하면 plm-channel 의 message 도구로 body 에 '구체적 질문 + 선택지(번호/약칭 포함)'를 담아 kind=\"question\" 으로 대시보드에 묻고 즉시 턴을 종료(대기)하세요. 사용자가 대시보드에서 답하면 그 답이 [PLM 사용자 메시지]로 다시 도착하니 그때 이어가면 됩니다."
}
EOF
exit 0
