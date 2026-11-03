package org.tarae.liftgram.lock;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 잠금화면 카드 규칙 — core `src/core/src/domain/lockScreen.ts` 의 순수 함수를 그대로 옮긴 것(SPEC-017 §6·§7).
 * 같은 정답 파일(`src/mobile/native/fixtures/lock-rules.json`)을 JUnit 이 읽어 core 와 같은 답을 내는지 본다 — 규칙을 여기서만 바꾸지 않는다.
 * 안드로이드 API 를 쓰지 않는다(JVM 단위 테스트).
 */
public final class LockRules {
    private LockRules() {}

    /** id 기반 rebase — seq > appliedThroughSeq 인 조작의 세트를 단계에서 뺀다(빈 단계는 지움). */
    public static JSONArray rebase(JSONArray steps, long appliedThroughSeq, JSONArray pending) throws JSONException {
        Set<String> gone = new HashSet<>();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject a = pending.getJSONObject(i);
            if (a.getLong("seq") > appliedThroughSeq) {
                JSONArray ids = a.getJSONArray("setIds");
                for (int j = 0; j < ids.length(); j++) gone.add(ids.getString(j));
            }
        }
        if (gone.isEmpty()) return steps;
        JSONArray out = new JSONArray();
        for (int i = 0; i < steps.length(); i++) {
            JSONObject st = steps.getJSONObject(i);
            JSONArray ids = st.getJSONArray("setIds");
            JSONArray kept = new JSONArray();
            for (int j = 0; j < ids.length(); j++) if (!gone.contains(ids.getString(j))) kept.put(ids.getString(j));
            if (kept.length() == 0) continue;
            if (kept.length() == ids.length()) {
                out.put(st);
                continue;
            }
            JSONObject copy = new JSONObject(st.toString());
            copy.put("setIds", kept);
            JSONArray members = st.optJSONArray("members");
            if (members != null) {
                JSONArray km = new JSONArray();
                for (int j = 0; j < members.length(); j++) {
                    JSONObject m = members.getJSONObject(j);
                    if (!gone.contains(m.getString("setId"))) km.put(m);
                }
                copy.put("members", km);
            }
            out.put(copy);
        }
        return out;
    }

    /** 새 스냅샷을 받을지 — 저장소·웹 DB·세션이 같을 때만 appliedThroughSeq 가 거꾸로 가는 것을 버린다. */
    public static boolean acceptSnapshot(JSONObject current, JSONObject next) {
        if (current == null) return true;
        for (String k : new String[] {"storeId", "dbEpoch", "sessionId"}) {
            if (!Objects.equals(current.opt(k), next.opt(k))) return true;
        }
        return next.optLong("appliedThroughSeq") >= current.optLong("appliedThroughSeq");
    }

    /** ack 된 조작을 지워도 되나 — 그 seq 이상을 담은 스냅샷이 덮은 뒤에만. */
    public static boolean canForgetAcked(long seq, JSONObject snapshot) {
        return snapshot != null && snapshot.optLong("appliedThroughSeq") >= seq;
    }

    /** 휴식 LWW — setAt 이 늦은 쪽 · 같으면 native. */
    public static JSONObject mergeRest(JSONObject a, JSONObject b) {
        if (a == null) return b;
        if (b == null) return a;
        long sa = a.optLong("setAt"), sb = b.optLong("setAt");
        if (sa != sb) return sa > sb ? a : b;
        String ba = a.optString("by"), bb = b.optString("by");
        if (ba.equals(bb)) return a;
        return "native".equals(ba) ? a : b;
    }

    /** 대기열이 막혔나 — 30개 넘음 또는 가장 오래된 것이 60초 넘음 → 카드 버튼을 「앱 열기」로. */
    public static boolean queueStalled(long[] pendingAts, long now) {
        if (pendingAts.length > 30) return true;
        if (pendingAts.length == 0) return false;
        long min = Long.MAX_VALUE;
        for (long t : pendingAts) min = Math.min(min, t);
        return now - min > 60_000L;
    }

    /** 남은 휴식(초) — 지난 것은 0(계산한 상태 · 쓰기 아님). */
    public static long restRemainingSec(JSONObject rest, long now) {
        if (rest == null || rest.isNull("endsAt")) return 0;
        long endsAt = rest.optLong("endsAt");
        if (endsAt == 0) return 0;
        return Math.max(0, (long) Math.ceil((endsAt - now) / 1000.0));
    }
}
