#!/usr/bin/env bash
# smoke test — 두 실행 단위의 헬스와 세 채널을 각각 확인한다
#
# 전부 **frontend(:3100)를 통해** 부른다 — 브라우저가 보는 경로와 같게 하기 위해서다.
# backend는 호스트에 열려 있지 않으므로 이 스크립트가 도는 것 자체가 프록시·터널이 산다는 증거다.
#
# 채널 convention(ADR-011): unary는 Connect(POST + JSON) · 구독은 Connect 서버 스트리밍 ·
# 양방향은 WebSocket. 셋 다 "스냅샷 먼저, 이후 델타"라는 같은 convention을 따른다.
#
# 검사가 만든 커스텀 종목은 끝에서 치운다(trap) — 안 그러면 카탈로그가 실행할 때마다 불어난다.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:3100}"
SVC="exercise.v1.ExerciseService"
META="meta.v1.MetaService"
fail=0
ok(){ echo "  ✅ $1"; }
ng(){ echo "  ❌ $1"; fail=1; }

# Connect unary 호출 — 평범한 POST라 curl로 충분하다.
rpc(){ curl -sf -X POST "$BASE/api/$SVC/$1" -H 'content-type: application/json' -d "$2"; }
# 표준입력의 JSON에서 값 하나를 꺼낸다. 인자는 `j`를 루트로 하는 JS 식이다.
jqn(){ node -pe 'const j=JSON.parse(require("fs").readFileSync(0));'"$1"; }

# 정리 대상 — 만든 것이 있으면 어떻게 끝나든 치운다.
PROBE_ID=""
cleanup(){ [ -n "$PROBE_ID" ] && curl -sf -X POST "$BASE/api/$SVC/ArchiveCustomExercise" \
  -H 'content-type: application/json' -d "{\"id\":\"$PROBE_ID\"}" >/dev/null 2>&1; }
trap cleanup EXIT

echo "[1] 헬스 — 두 단위를 따로 본다(경로가 다르다)"
curl -sf "$BASE/healthz" >/dev/null && ok "frontend healthz 200 (프로세스 생존)" || ng "frontend healthz 실패"
curl -sf "$BASE/readyz"  >/dev/null && ok "frontend readyz 200 (backend 도달 확인)" || ng "frontend readyz 실패"
curl -sf "$BASE/api/healthz" >/dev/null && ok "backend healthz 200 (프록시 경유)" || ng "backend healthz 실패"
curl -sf "$BASE/api/readyz"  >/dev/null && ok "backend readyz 200 (DB 연결 확인)" || ng "backend readyz 실패"

echo "[2] unary — 시드 카탈로그가 실려 있다"
n=$(rpc ListExercises '{"limit":50}' | jqn 'j.items.length')
[ "${n:-0}" -eq 50 ] && ok "목록 한 페이지 50종" || ng "목록 실패 (받은 수: ${n:-0})"
name=$(rpc GetExercise '{"id":"seed-barbell-bench-press"}' | jqn 'j.exercise.nameKo')
[ "$name" = "바벨 벤치프레스" ] && ok "단건 조회 — 결정적 id로 '$name'" || ng "단건 조회 실패 ($name)"

# 배포 채널 — 기기가 로컬 저장소를 세울 때 쓰는 경로(ADR-002: 읽기 정본은 로컬).
# 목록(요약)과 달리 **행 전부**를 줘야 한다. 대체운동이 비어 오면 로컬 카탈로그가 반쪽이 된다.
pull=$(rpc PullCatalog '{"limit":500}')
n=$(echo "$pull" | jqn 'j.items.length')
subs=$(echo "$pull" | jqn 'j.items.filter(i=>(i.substituteIds||[]).length>0).length')
rev=$(echo "$pull" | jqn 'Number(j.revision?.count ?? 0)')
if [ "${n:-0}" -ge 336 ] && [ "${subs:-0}" -gt 200 ] && [ "${rev:-0}" -ge 336 ]; then
  ok "배포(PullCatalog) — ${n}종 전량 · 대체운동 보유 ${subs}종 · 개정 ${rev}"
else
  ng "배포 실패 (items=${n:-0} 대체운동=${subs:-0} 개정=${rev:-0})"
fi

echo "[3] unary — 커서 페이지네이션이 겹치지도 건너뛰지도 않는다"
p1=$(rpc ListExercises '{"limit":5}')
cur=$(echo "$p1" | jqn 'j.nextCursor')
last1=$(echo "$p1" | jqn 'j.items[j.items.length-1].nameKo')
first2=$(rpc ListExercises "{\"limit\":5,\"cursor\":\"$cur\"}" | jqn 'j.items[0].nameKo')
if [ "$cur" = "$last1" ] && [ -n "$first2" ] && [ "$first2" != "$last1" ]; then
  ok "커서 이어짐 ('$last1' → '$first2')"
else
  ng "커서 실패 (cursor=$cur last1=$last1 first2=$first2)"
fi

echo "[4] unary — 검색·필터"
q=$(rpc ListExercises '{"limit":50,"query":"벤치"}' | jqn 'j.items.length')
[ "${q:-0}" -gt 0 ] && ok "한글 검색 '벤치' → ${q}종" || ng "검색 실패"
# 필터가 도는지만이 아니라 **결과가 전건 일치하는지**까지 본다(필터가 무시돼도 목록은 온다).
b=$(rpc ListExercises '{"limit":50,"equipment":"EQUIPMENT_BAND"}' \
  | jqn 'j.items.length>0 && j.items.every(i=>i.equipment==="EQUIPMENT_BAND") ? j.items.length : 0')
[ "${b:-0}" -gt 0 ] && ok "기구 필터(밴드) → ${b}종, 전건 일치" || ng "기구 필터 실패"

echo "[5] 계약 검증 — 잘못된 입력은 400"
code=$(curl -s -o /tmp/smoke-err.json -w '%{http_code}' -X POST "$BASE/api/$SVC/ListExercises" \
  -H 'content-type: application/json' -d '{"limit":999}')
if [ "$code" = "400" ] && grep -q 'invalid_argument' /tmp/smoke-err.json; then
  ok "limit 상한 위반 → 400 invalid_argument (.proto 선언만으로)"
else
  ng "검증 실패 convention 어긋남 (code=$code)"
fi

echo "[6] unary — 커스텀 종목 생성 + idempotency key 재전송은 1회만 반영"
# 이름에 unique 제약이 있어 실행마다 새 이름을 쓴다(고정 이름이면 두 번째 실행부터 항상 실패한다).
PROBE=$(node -e 'console.log(`zz-smoke-${Date.now()}-${Math.floor(Math.random()*1e6)}`)')
KEY="smoke-$(date +%s)-$RANDOM"
BODY="{\"nameKo\":\"$PROBE\",\"primaryMuscles\":[\"MUSCLE_BICEPS\"],\"equipment\":\"EQUIPMENT_DUMBBELL\",\"idempotencyKey\":\"$KEY\"}"
r1=$(rpc CreateCustomExercise "$BODY")
PROBE_ID=$(echo "$r1" | jqn 'j.exercise.id')
r2=$(rpc CreateCustomExercise "$BODY")
id2=$(echo "$r2" | jqn 'j.exercise.id')
replayed=$(echo "$r2" | jqn 'j.replayed===true')
if [ -n "$PROBE_ID" ] && [ "$PROBE_ID" = "$id2" ] && [ "$replayed" = "true" ]; then
  ok "재전송이 같은 종목을 돌려주고 replayed=true"
else
  ng "idempotency 실패 (id1=$PROBE_ID id2=$id2 replayed=$replayed)"
fi

echo "[7] 규칙 — 기본 카탈로그(시드)는 치울 수 없다"
code=$(curl -s -o /tmp/smoke-arch.json -w '%{http_code}' -X POST "$BASE/api/$SVC/ArchiveCustomExercise" \
  -H 'content-type: application/json' -d '{"id":"seed-barbell-bench-press"}')
if [ "$code" = "400" ] && grep -q 'invalid_argument' /tmp/smoke-arch.json; then
  ok "시드 보관 시도 → 거절 (규칙은 service가 지킨다)"
else
  ng "시드 보호 실패 (code=$code)"
fi

echo "[8] 운영 메타 — 어느 인스턴스가 어떤 propagation 방식으로 도는가"
curl -sf -X POST "$BASE/api/$META/GetMeta" -H 'content-type: application/json' -d '{}' \
  | grep -q '"bus"' && ok "meta 응답" || ng "meta 실패"

echo "[9] 서버 스트리밍 — 스냅샷 먼저, 카탈로그가 바뀌면 델타"
node scripts/check-stream.mjs "$BASE" && ok "스트림 스냅샷+델타 수신" || ng "스트림 실패"

echo "[10] WebSocket — 구독·생성 왕복"
node scripts/check-ws.mjs "$BASE" && ok "WS 스냅샷+델타 왕복" || ng "WS 실패"

echo
[ $fail -eq 0 ] && echo "smoke test 전부 통과" || echo "smoke test 실패 항목 있음"
exit $fail
