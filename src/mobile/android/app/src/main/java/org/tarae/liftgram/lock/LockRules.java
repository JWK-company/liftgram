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

    /** 운동 시간(초) · null = 숨김 — core lockElapsedSec 와 같은 정답 파일로 시험한다(SPEC-021). */
    public static Long elapsedSec(JSONObject clock, boolean paused, long now) {
        if (clock == null) return null;
        long started = clock.optLong("startedAt");
        if (started <= 0) return null;
        long pausedAt = clock.optLong("pausedAt");
        long end = paused && pausedAt != 0 ? pausedAt : now;
        return Math.max(0L, Math.round((end - started - clock.optLong("accumulatedPauseMs")) / 1000.0));
    }

    /** 앱과 같은 시계 형식 — 42:18 · 1:02:18 */
    public static String clockText(long sec) {
        long h = sec / 3600, m = sec % 3600 / 60, s = sec % 60;
        return h > 0
                ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, s)
                : String.format(java.util.Locale.ROOT, "%d:%02d", m, s);
    }

    /** 휴식 링 비율 0~1 — 총량을 모르면 가득 · +30초로 총량을 넘어도 1 을 넘지 않는다. */
    public static float restFraction(long remainSec, Long totalSec) {
        if (totalSec == null || totalSec <= 0) return 1f;
        return Math.max(0f, Math.min(1f, (float) remainSec / totalSec));
    }

    /** 모르는 값은 system — 기기 설정을 따른다. */
    public static String normalizeTheme(String t) {
        return "light".equals(t) || "dark".equals(t) ? t : "system";
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

    /** 대기열이 가득 찼나 — 잠금 중 완료는 앱이 앞에 올 때까지 쌓이는 것이 정상이라 시간으로는 막지 않는다 */
    public static boolean queueFull(long[] pendingAts) {
        return pendingAts.length > 30;
    }

    /** 남은 휴식(초) — 지난 것은 0(계산한 상태 · 쓰기 아님). */
    public static long restRemainingSec(JSONObject rest, long now) {
        if (rest == null || rest.isNull("endsAt")) return 0;
        long endsAt = rest.optLong("endsAt");
        if (endsAt == 0) return 0;
        return Math.max(0, (long) Math.ceil((endsAt - now) / 1000.0));
    }

    /** 화면 무게 비교(소수 둘째 자리 — 카드 표시와 같은 정밀도 · SPEC-019) */
    public static boolean sameWeight(Double a, Double b) {
        if (a == null || b == null) return a == b;
        return Math.round(a * 100) == Math.round(b * 100);
    }

    /** 무게 한 칸(SPEC-019) — kg 2.5 · lb 5 */
    public static double weightStep(String unit) {
        return "lb".equals(unit) ? 5.0 : 2.5;
    }

    /** ± 한 번 — 최소 0 · 소수 둘째 자리. 값이 없으면(null) + 는 한 칸부터, - 는 0. */
    public static double nudgeWeight(Double cur, String unit, int dir) {
        double base = cur == null ? 0 : cur;
        double next = base + dir * weightStep(unit);
        return Math.max(0, Math.round(next * 100) / 100.0);
    }

    // [원본] 최소 0 — 「완료 + 0회」가 출처 user 로 남았다(REV-014 #45)
    // public static int nudgeReps(Integer cur, int dir) { int base = cur == null ? 0 : cur; return Math.max(0, Math.min(999, base + dir)); }
    /** 횟수 ± 한 번 — 1~999. */
    public static int nudgeReps(Integer cur, int dir) {
        int base = cur == null ? 0 : cur;
        return Math.max(1, Math.min(999, base + dir));
    }
}
