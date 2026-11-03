package org.tarae.liftgram.lock;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 네이티브 잠금 카드 저장소의 내용(SPEC-017 §6) — 사본(스냅샷) · 대기열 · seq 카운터 · 휴식 · storeId.
 * 이 클래스는 직렬 실행기(LockStore) 안에서만 고친다. 안드로이드 API 를 쓰지 않는다(JVM 단위 테스트).
 *
 * 대기열 항목 = { action, acked } — ack 됐지만 그보다 큰 appliedThroughSeq 스냅샷이 아직 덮지 않은 조작은
 * 지우지 않고 rebase 대상에 계속 넣는다(ack 가 스냅샷보다 먼저 닿는 경우 · REV-003 동시성 H-2).
 */
public final class LockState {
    public String storeId;
    public long seq;
    public JSONObject snapshot; // 받은 스냅샷 + 남은 단계(steps 는 rebase 한 결과)
    public final List<JSONObject> queue = new ArrayList<>(); // {action, acked}
    public JSONObject rest;
    /** 끝낸 세션 — 같은 세션의 늦은 스냅샷이 카드를 되살리지 않게(REV-007 계약 L-4) */
    public String endedSessionId;
    /** 마지막으로 울린 휴식의 끝 시각 — 알람·서비스·늦은 느슨한 알람이 겹쳐도 한 번만 울린다(REV-007 플랫폼 H-2) */
    public long rungEndsAt;
    /** 그리기 세대 — 쓰기마다 오른다(늦게 온 옛 그림을 버린다 · 계약 M-3) */
    public long gen;

    public static LockState fresh() {
        LockState s = new LockState();
        s.storeId = UUID.randomUUID().toString();
        return s;
    }

    public static LockState fromJson(String json) {
        if (json == null || json.isEmpty()) return fresh();
        try {
            JSONObject o = new JSONObject(json);
            LockState s = new LockState();
            s.storeId = o.optString("storeId", "");
            if (s.storeId.isEmpty()) s.storeId = UUID.randomUUID().toString();
            s.seq = o.optLong("seq");
            s.snapshot = o.optJSONObject("snapshot");
            s.rest = o.optJSONObject("rest");
            s.endedSessionId = o.isNull("endedSessionId") ? null : o.optString("endedSessionId", null);
            s.rungEndsAt = o.optLong("rungEndsAt");
            s.gen = o.optLong("gen");
            JSONArray q = o.optJSONArray("queue");
            if (q != null) for (int i = 0; i < q.length(); i++) s.queue.add(q.getJSONObject(i));
            return s;
        } catch (JSONException e) {
            // 깨진 파일 — 새 저장소(새 storeId 라 웹의 워터마크가 0 으로 본다)
            return fresh();
        }
    }

    public String toJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("storeId", storeId);
            o.put("seq", seq);
            o.put("snapshot", snapshot == null ? JSONObject.NULL : snapshot);
            o.put("rest", rest == null ? JSONObject.NULL : rest);
            o.put("endedSessionId", endedSessionId == null ? JSONObject.NULL : endedSessionId);
            o.put("rungEndsAt", rungEndsAt);
            o.put("gen", gen);
            JSONArray q = new JSONArray();
            for (JSONObject e : queue) q.put(e);
            o.put("queue", q);
            return o.toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private JSONArray pendingActions() {
        JSONArray a = new JSONArray();
        for (JSONObject e : queue) a.put(e.optJSONObject("action"));
        return a;
    }

    private long[] unackedAts() {
        List<Long> ats = new ArrayList<>();
        for (JSONObject e : queue) if (!e.optBoolean("acked")) ats.add(e.optJSONObject("action").optLong("at"));
        long[] out = new long[ats.size()];
        for (int i = 0; i < out.length; i++) out[i] = ats.get(i);
        return out;
    }

    /** 덮인 ack 조작을 지운다. */
    private void forgetCovered() {
        queue.removeIf(e -> e.optBoolean("acked") && LockRules.canForgetAcked(e.optJSONObject("action").optLong("seq"), snapshot));
    }

    /**
     * 웹이 보낸 스냅샷 — 받으면 true. 남은 단계는 아직 덮이지 않은 조작으로 rebase 한다.
     * - 휴식은 seq 와 무관한 LWW 라 받을지와 상관없이 먼저 합친다(§7 · REV-007 계약 L-1). 세션이 바뀌면 옛 휴식은 버린다(M-2).
     * - 다른 storeId(저장소가 새로 만들어짐)의 appliedThroughSeq 는 믿지 않는다 — 0 으로 보고 대기열 전부로 rebase · 지우지 않음(M-1).
     * - 끝낸 세션의 늦은 스냅샷은 버린다(L-4).
     */
    public boolean update(JSONObject next, long now) throws JSONException {
        String sid = next.optString("sessionId", null);
        if (endedSessionId != null && endedSessionId.equals(sid)) return false;
        boolean sessionChanged = snapshot == null || !java.util.Objects.equals(snapshot.optString("sessionId", null), sid);
        JSONObject r = next.optJSONObject("rest");
        if (r != null) rest = sessionChanged ? r : LockRules.mergeRest(rest, r);
        if (!LockRules.acceptSnapshot(snapshot, next)) return false;
        boolean mine = storeId.equals(next.optString("storeId", null));
        long applied = mine ? next.optLong("appliedThroughSeq") : 0;
        JSONObject s = new JSONObject(next.toString());
        JSONArray steps = s.optJSONArray("steps");
        if (steps == null) steps = new JSONArray();
        s.put("steps", LockRules.rebase(steps, applied, pendingActions()));
        snapshot = s;
        if (mine) forgetCovered();
        endedSessionId = null;
        return true;
    }

    public void setRest(JSONObject r) {
        rest = LockRules.mergeRest(rest, r);
    }

    /** 운동 끝 — 카드를 내린다. 대기열은 남긴다(웹이 버림으로 세고 ack 한다). */
    public void end() {
        if (snapshot != null) endedSessionId = snapshot.optString("sessionId", null);
        snapshot = null;
        rest = null;
    }

    /** 웹 drain — ack 안 된 조작 전부 · 지금 휴식 · storeId. */
    public JSONObject drain() throws JSONException {
        JSONArray actions = new JSONArray();
        for (JSONObject e : queue) if (!e.optBoolean("acked")) actions.put(e.getJSONObject("action"));
        JSONObject o = new JSONObject();
        o.put("actions", actions);
        // 카드가 없으면(끝난 세션) 휴식도 없다 — 다음 세션으로 새지 않게(계약 M-2)
        o.put("rest", rest == null || snapshot == null ? JSONObject.NULL : rest);
        o.put("storeId", storeId);
        return o;
    }

    public void ack(Set<String> ids) {
        for (JSONObject e : queue) {
            if (ids.contains(e.optJSONObject("action").optString("id"))) {
                try {
                    e.put("acked", true);
                } catch (JSONException ignored) {
                    // put(boolean) 은 던지지 않는다
                }
            }
        }
        forgetCovered();
    }

    /** 리셋(새 웹 DB) — 옛 DB 의 조작을 지운다. */
    public void clear() {
        queue.clear();
    }

    public boolean stalled(long now) {
        return LockRules.queueStalled(unackedAts(), now);
    }

    /** 대기열이 「앱 열기」로 바뀌는 시각(가장 오래된 미확인 + 60초) — 그때 다시 그리도록 알람을 건다(계약 M-4). 없으면 null. */
    public Long stallsAt() {
        long[] ats = unackedAts();
        if (ats.length == 0) return null;
        long min = Long.MAX_VALUE;
        for (long t : ats) min = Math.min(min, t);
        return min + 60_001L;
    }

    /** 단계 토큰 — 버튼에 실어 「누른 순간 보이던 단계」를 고정한다(계약 H-1). */
    public static String stepToken(JSONObject step) {
        if (step == null) return "";
        JSONArray ids = step.optJSONArray("setIds");
        StringBuilder b = new StringBuilder();
        if (ids != null) for (int i = 0; i < ids.length(); i++) {
            if (i > 0) b.append(',');
            b.append(ids.optString(i));
        }
        return b.toString();
    }

    /** 지금 보일 단계(없으면 null). */
    public JSONObject currentStep() {
        if (snapshot == null) return null;
        JSONArray steps = snapshot.optJSONArray("steps");
        return steps == null || steps.length() == 0 ? null : steps.optJSONObject(0);
    }

    /** 카드 버튼을 「완료」로 둘 수 있나 — 일시정지·앱 열기·대기열 막힘이면 아니다. */
    public boolean canComplete(long now) {
        JSONObject st = currentStep();
        return st != null && !snapshot.optBoolean("paused") && !st.optBoolean("openApp") && !stalled(now);
    }

    /**
     * 잠금 중 「완료」 — 지금 보이는 단계의 setIds 를 조작에 고정하고 사본에서 뺀다(같은 rebase 함수) · 단계 휴식을 건다.
     * 누를 수 없는 상태면 null(낡은 알림의 버튼이 늦게 닿은 경우 — 화면이 바뀌었으니 아무것도 하지 않는다).
     */
    public JSONObject pressComplete(long now, String token) throws JSONException {
        if (!canComplete(now)) return null;
        JSONObject st = currentStep();
        // 버튼이 본 단계와 지금 단계가 다르면(연타 두 번째 · 낡은 카드) 아무것도 하지 않는다
        if (token != null && !token.equals(stepToken(st))) return null;
        seq += 1;
        JSONObject a = new JSONObject();
        a.put("id", UUID.randomUUID().toString());
        a.put("storeId", storeId);
        a.put("dbEpoch", snapshot.optString("dbEpoch"));
        a.put("seq", seq);
        a.put("kind", "complete");
        a.put("sessionId", snapshot.optString("sessionId"));
        a.put("setIds", new JSONArray(st.getJSONArray("setIds").toString()));
        JSONArray expect = new JSONArray();
        JSONArray members = st.optJSONArray("members");
        if (members != null) {
            for (int i = 0; i < members.length(); i++) {
                JSONObject m = members.getJSONObject(i);
                JSONObject ex = m.optJSONObject("expect");
                JSONObject e = new JSONObject();
                e.put("setId", m.getString("setId"));
                // 키를 늘 채운다 — put(key, null) 은 키를 지워 웹 비교가 undefined 로 거짓 「다름」을 낸다(계약 L-6)
                for (String k : new String[] {"weightKg", "reps", "seconds"}) e.put(k, ex == null || !ex.has(k) ? JSONObject.NULL : ex.get(k));
                expect.put(e);
            }
        }
        a.put("expect", expect);
        a.put("at", now);
        JSONObject entry = new JSONObject();
        entry.put("action", a);
        entry.put("acked", false);
        queue.add(entry);
        JSONArray one = new JSONArray().put(a);
        snapshot.put("steps", LockRules.rebase(snapshot.getJSONArray("steps"), seq - 1, one));
        long restSec = st.optLong("restAfterSec");
        if (restSec > 0) rest = restAt(now + restSec * 1000L, restSec, now);
        return a;
    }

    /** +초 — 진행 중이면 끝 시각을 늘리고, 끝났으면 지금부터. */
    public void addRest(long sec, long now) throws JSONException {
        if (snapshot == null) return; // 끝난 세션의 카드 버튼(계약 M-2)
        long remain = LockRules.restRemainingSec(rest, now);
        long total = rest == null ? 0 : rest.optLong("totalSec");
        long endsAt = remain > 0 ? rest.optLong("endsAt") + sec * 1000L : now + sec * 1000L;
        rest = restAt(endsAt, remain > 0 ? total + sec : sec, now);
    }

    public void endRest(long now) throws JSONException {
        if (snapshot == null) return;
        JSONObject r = new JSONObject();
        r.put("endsAt", JSONObject.NULL);
        r.put("totalSec", JSONObject.NULL);
        r.put("setAt", now);
        r.put("by", "native");
        rest = r;
    }

    private static JSONObject restAt(long endsAt, long totalSec, long now) throws JSONException {
        JSONObject r = new JSONObject();
        r.put("endsAt", endsAt);
        r.put("totalSec", totalSec);
        r.put("setAt", now);
        r.put("by", "native");
        return r;
    }

    public static Set<String> idSet(JSONArray ids) {
        Set<String> s = new HashSet<>();
        if (ids != null) for (int i = 0; i < ids.length(); i++) s.add(ids.optString(i));
        return s;
    }
}
