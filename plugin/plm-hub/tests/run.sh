#!/usr/bin/env bash
# 플러그인 테스트 스위트 러너 — 단위(codescan·lib) + 페이지 스코핑 회귀(wfanno·wfscan) 실행.
# 전부 스텁/픽스처 기반 — 라이브 penpot/PLM 무접촉.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0
echo "═══ PLM-Hub 플러그인 테스트 ═══"
python3 "$HERE/test_codescan.py" || fail=1
bash "$HERE/test_lib.sh" || fail=1
python3 "$HERE/test_wfanno_page.py" || fail=1
python3 "$HERE/test_wfanno_stale.py" || fail=1
# 감사 H-6 — `sync --force` 가 두 갈래(render·extract) 모두에 전달되는가.
python3 "$HERE/test_wfanno_force.py" || fail=1
# 감사 H-4 — sync_bulk 의 type→dir 매핑(Wireframe 왕복) + 사본 스테이징 누출 차단.
python3 "$HERE/test_sync_bulk_category.py" || fail=1
python3 "$HERE/test_wfscan_page.py" || fail=1
python3 "$HERE/test_wfgen_layout.py" || fail=1
# 불변식 5종(빌드 게이트) — 유실0·순차==일괄·이웃삭제0·멱등·왕복무손실. 깨지면 즉시 실패.
python3 "$HERE/test_wf_invariants.py" || fail=1
# 목업 제자리 교체(사본 페이지 in-place remock) — 릴레이 지시문 ③-c 의 실행 근거.
python3 "$HERE/test_wf_inplace.py" || fail=1
# 변경 칩(chg:<CODE>) — 바뀐 프레임 표시. 생성·멱등·이웃무피해·겹침·정리·역할가드.
python3 "$HERE/test_wf_mark.py" || fail=1
echo "─────────────────────────────"
[[ $fail -eq 0 ]] && echo "✅ 전체 통과" || echo "❌ 실패 있음"
exit $fail
