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
    /**
     * 잠금 운동 화면에서 고르는 중인 값(SPEC-019 · REV-014 화면 H-4) — {token, v: {setId: {weight, reps}}}.
     * 화면이 다시 만들어져도 남게 저장소에 둔다. 단계(token)가 바뀌면 버리고 draftLost 를 한 번 켠다.
     */
    public JSONObject draft;
    public boolean draftLost;
    /**
     * 잠금에서 값을 고쳐 완료한 블록(weId → 그 조작 seq · REV-014 #37). 그 블록의 남은 처방 세트(refill)는 사본의 표시값이
     * 옛 계산이라, 완료할 때 보인 값을 그대로 values 로 싣는다. 웹이 그 seq 까지 반영한 스냅샷을 보내면 지운다.
     */
    public JSONObject editedWe;
    /**
     * 「남은 세트에도 적용」으로 완료한 값(SPEC-062 · REV-151) — weId → {seq, weight?, reps?, unit, oneSide}.
     * 웹은 그 조작을 반영할 때 같은 블록의 뒤 일반 세트에 같은 칸을 쓴다. 그 전까지 사본의 뒤 세트 표시값을 이 값으로 덮고
     * (applyCarry) 완료할 때 그 칸을 values 로 싣는다(「다름」 안내 없음). 웹이 그 seq 까지 반영한 스냅샷을 보내면 지운다.
     */
    public JSONObject carry;
    /**
     * 되돌릴 수 있게 붙잡아 둔 화면 완료(SPEC-060 · REV-146) — 한 번에 하나.
     * {actionId, seq, holdAt, holdUntil, step, rest(완료 전 · NULL 가능), restSetAt(완료가 건 휴식의 setAt · -1 = 안 걸음),
     *  draft, draftLost, edited({weId: 이전 seq 또는 NULL})}
     * 붙잡는 동안 drain 은 이 항목에서 멈추고(뒤 조작이 워터마크를 앞지르지 않게) 완료 전 휴식을 싣는다.
     */
    public JSONObject undo;
    /** 웹이 보낸 원래 단계 · 그때 워터마크 — 되돌릴 때 이것으로 다시 rebase 한다(REV-146 계약 2) */
    public JSONArray rawSteps;
    public long rawApplied;
    /** 붙잡기 상한 — 시계가 뒤로 가도 대기열이 오래 멈추지 않게(REV-146 계약 5) */
    public static final long HOLD_MAX_MS = 30_000L;

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
            s.draft = o.optJSONObject("draft");
            s.draftLost = o.optBoolean("draftLost");
            s.editedWe = o.optJSONObject("editedWe");
            s.carry = o.optJSONObject("carry");
            s.undo = o.optJSONObject("undo");
            s.rawSteps = o.optJSONArray("rawSteps");
            s.rawApplied = o.optLong("rawApplied");
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
            o.put("draft", draft == null ? JSONObject.NULL : draft);
            o.put("draftLost", draftLost);
            o.put("editedWe", editedWe == null ? JSONObject.NULL : editedWe);
            o.put("carry", carry == null ? JSONObject.NULL : carry);
            o.put("undo", undo == null ? JSONObject.NULL : undo);
            o.put("rawSteps", rawSteps == null ? JSONObject.NULL : rawSteps);
            o.put("rawApplied", rawApplied);
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
        rawSteps = new JSONArray(steps.toString());
        rawApplied = applied;
        if (sessionChanged) undo = null;
        if (sessionChanged) carry = null;
        else if (mine) pruneCarry(applied);
        s.put("steps", applyCarry(LockRules.rebase(steps, applied, pendingActions())));
        snapshot = s;
        if (mine) forgetCovered();
        endedSessionId = null;
        if (sessionChanged) editedWe = null;
        else if (mine) pruneEditedWe(applied);
        dropStaleDraft();
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
        draft = null;
        draftLost = false;
        editedWe = null;
        carry = null;
        undo = null;
        rawSteps = null;
    }

    /** 웹 drain — ack 안 된 조작 전부 · 지금 휴식 · storeId. */
    // [원본] public JSONObject drain() — 붙잡기가 없던 때. 지금 시각으로 drain(now) 를 부른다
    public JSONObject drain() throws JSONException {
        return drain(System.currentTimeMillis());
    }

    /**
     * 붙잡힌 화면 완료가 있으면 그 항목 앞에서 멈추고, 휴식은 완료 전 것을 싣는다(SPEC-060 · REV-146 계약 1).
     * 뒤 조작만 먼저 보내면 웹 워터마크가 앞질러 붙잡힌 조작이 「이미 반영」으로 버려진다.
     */
    public JSONObject drain(long now) throws JSONException {
        boolean held = held(now);
        // 끝난 붙잡기는 여기서 나간다 — 내보낸 뒤에는 되돌리지 못하게 지운다(시계가 다시 창 안으로 돌아와도 · REV-147 2)
        if (!held) undo = null;
        String heldId = held ? undo.optString("actionId") : null;
        JSONArray actions = new JSONArray();
        for (JSONObject e : queue) {
            if (e.optBoolean("acked")) continue;
            if (heldId != null && heldId.equals(e.getJSONObject("action").optString("id"))) break;
            actions.put(e.getJSONObject("action"));
        }
        JSONObject o = new JSONObject();
        o.put("actions", actions);
        JSONObject r = held ? undo.optJSONObject("rest") : rest;
        // 카드가 없으면(끝난 세션) 휴식도 없다 — 다음 세션으로 새지 않게(계약 M-2)
        o.put("rest", r == null || snapshot == null ? JSONObject.NULL : r);
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
        undo = null;
        carry = null; // 새 웹 DB — 이어 쓴 값을 반영할 곳이 없다(REV-152 계약 5)
    }

    /** 붙잡혀 있나 — holdAt ≤ now < holdUntil 이고 남은 시간이 상한 안(시계가 뒤로 가면 풀린 것으로 · REV-146 계약 5) */
    public boolean held(long now) {
        if (undo == null) return false;
        long at = undo.optLong("holdAt"), until = undo.optLong("holdUntil");
        return at <= now && now < until && until - now <= HOLD_MAX_MS;
    }

    /** 붙잡기를 푼다 — 되돌리기 끝 · 화면을 떠남 · 앱이 앞에 옴(REV-146 계약 3). 조작은 대기열에 그대로 남아 다음 drain 에 간다. */
    public boolean releaseHold() {
        boolean had = undo != null;
        undo = null;
        return had;
    }

    public static final String UNDONE = "UNDONE";
    public static final String EXPIRED = "EXPIRED";
    public static final String GONE = "GONE";

    /**
     * 붙잡은 화면 완료를 되돌린다(SPEC-060 2a). 대기열에서 빼고 단계를 다시 계산하고, 그 완료가 건 휴식·초안·고친 블록을 되돌린다.
     * seq 는 되돌리지 않는다(웹은 빈 번호를 문제 삼지 않는다 — alreadyApplied 는 ≤ 비교).
     */
    public String undoComplete(String actionId, long now) throws JSONException {
        if (undo == null || actionId == null || !actionId.equals(undo.optString("actionId"))) return GONE;
        if (!held(now)) {
            undo = null;
            return EXPIRED;
        }
        JSONObject u = undo;
        JSONObject found = null;
        for (JSONObject e : queue) if (actionId.equals(e.getJSONObject("action").optString("id"))) found = e;
        if (found == null || found.optBoolean("acked") || snapshot == null) {
            undo = null;
            return GONE;
        }
        queue.remove(found);
        // 이어 쓰기 — 이 완료가 만든 블록만 이전 값으로(SPEC-062 · edited 와 같은 방식)
        JSONObject carried = u.optJSONObject("carried");
        if (carried != null && carry != null) {
            long sq = u.optLong("seq");
            java.util.Iterator<String> ci = carried.keys();
            while (ci.hasNext()) {
                String we = ci.next();
                JSONObject now0 = carry.optJSONObject(we);
                if (now0 == null || now0.optLong("seq") != sq) continue;
                JSONObject prev = carried.optJSONObject(we);
                if (prev != null && prev.optLong("seq") > rawApplied) carry.put(we, prev);
                else carry.remove(we);
            }
            if (carry.length() == 0) carry = null;
        }
        // 단계 — 웹이 보낸 원래 단계로 다시 rebase(그 사이 온 스냅샷과 어긋나지 않게 · 계약 2)
        if (rawSteps != null) {
            // [원본] snapshot.put("steps", LockRules.rebase(new JSONArray(rawSteps.toString()), rawApplied, pendingActions()));
            snapshot.put("steps", applyCarry(LockRules.rebase(new JSONArray(rawSteps.toString()), rawApplied, pendingActions())));
        } else {
            JSONObject st = u.optJSONObject("step");
            JSONArray steps = snapshot.optJSONArray("steps");
            if (steps == null) steps = new JSONArray();
            if (st != null && !hasAnySet(steps, idSet(st.optJSONArray("setIds")))) {
                JSONArray out = new JSONArray().put(st);
                for (int i = 0; i < steps.length(); i++) out.put(steps.get(i));
                snapshot.put("steps", out);
            }
        }
        // 휴식 — 그 완료가 건 휴식이 그대로일 때만 · 새 기록으로(LWW 에서 이기게 · 계약 1·7)
        long restSetAt = u.optLong("restSetAt", -1);
        if (restSetAt >= 0 && rest != null && rest.optLong("setAt") == restSetAt) {
            JSONObject prev = u.optJSONObject("rest");
            long prevEnds = prev == null || prev.isNull("endsAt") ? 0 : prev.optLong("endsAt");
            if (prevEnds > now) rest = restAt(prevEnds, prev.optLong("totalSec"), now);
            else endRest(now);
        }
        // 고친 블록 — 이 완료가 바꾼 키만 이전 값으로(계약 7)
        JSONObject edited = u.optJSONObject("edited");
        long seqUndone = u.optLong("seq");
        if (edited != null && editedWe != null) {
            java.util.Iterator<String> it = edited.keys();
            while (it.hasNext()) {
                String we = it.next();
                if (editedWe.optLong(we, -1) != seqUndone) continue;
                long prevSeq = edited.isNull(we) ? -1 : edited.optLong(we, -1);
                if (prevSeq > rawApplied) editedWe.put(we, prevSeq);
                else editedWe.remove(we);
            }
            if (editedWe.length() == 0) editedWe = null;
        }
        // 초안 — 다시 계산한 지금 단계가 같은 단계일 때만(계약 11)
        JSONObject d = u.optJSONObject("draft");
        JSONObject cur = currentStep();
        if (d != null && cur != null && stepToken(cur).equals(d.optString("token"))) {
            draft = d;
            draftLost = u.optBoolean("draftLost");
        }
        // 되살린 초안도 지금 표시값과 다시 맞춘다 — 그 사이 처방이 바뀌었거나 다른 단계 초안이면 버린다(REV-147 3·4)
        dropStaleDraft();
        undo = null;
        return UNDONE;
    }

    private static boolean hasAnySet(JSONArray steps, Set<String> ids) {
        for (int i = 0; i < steps.length(); i++) {
            JSONArray s = steps.optJSONObject(i) == null ? null : steps.optJSONObject(i).optJSONArray("setIds");
            if (s != null) for (int j = 0; j < s.length(); j++) if (ids.contains(s.optString(j))) return true;
        }
        return false;
    }

    public boolean stalled(long now) {
        // [원본] return LockRules.queueStalled(unackedAts(), now);
        // [개선] 앱이 뒤에 있으면 웹이 조작을 못 받아 60초면 늘 「막힘」이 되어, 쉬는 시간 중 잠금 화면이 「앱에서 하기」로 바뀌었다. 개수만 본다.
        return LockRules.queueFull(unackedAts());
    }

    /** 대기열이 「앱 열기」로 바뀌는 시각(가장 오래된 미확인 + 60초) — 그때 다시 그리도록 알람을 건다(계약 M-4). 없으면 null. */
    public Long stallsAt() {
        // [원본] 가장 오래된 미확인 + 60_001L — 시간으로는 더 이상 막히지 않으니 다시 그릴 시각이 없다
        // [개선] 붙잡기 끝 — 그때 다시 그리고 웹 drain 을 깨운다(RestAlarm REDRAW · REV-146 계약 9)
        return undo == null ? null : undo.optLong("holdUntil");
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
     * 잠금 운동 화면에서 완료할 수 있나 — 카드와 달리 값이 크게 보이고 ± 로 고칠 수 있으니, 기본값 단계(openApp)도 사람이 본 값으로 친다.
     * 단 횟수가 없거나 시간·거리 종목이면 여기서 채울 수 없어 앱에서 한다.
     */
    public boolean canCompleteOnScreen(long now) {
        JSONObject st = currentStep();
        if (st == null || snapshot.optBoolean("paused") || stalled(now)) return false;
        if (!st.optBoolean("openApp")) return true;
        JSONArray ms = st.optJSONArray("members");
        if (ms == null || ms.length() == 0) return false;
        JSONObject dv = draftFor(stepToken(st));
        for (int i = 0; i < ms.length(); i++) {
            JSONObject m = ms.optJSONObject(i);
            JSONObject d = m == null ? null : m.optJSONObject("display");
            if (d == null || !d.isNull("seconds") || !d.isNull("distanceM")) return false;
            JSONObject e = dv.optJSONObject(m.optString("setId"));
            // [원본] if (d.isNull("reps") && (e == null || e.isNull("reps"))) return false; — 웹의 빈 횟수는 null 이 아니라 0 이다
            int reps = e != null && !e.isNull("reps") ? e.optInt("reps") : d.optInt("reps");
            if (reps <= 0) return false;
        }
        return true;
    }

    /** 이 웹이 조작의 values 를 아나(스냅샷 caps · REV-014 #40) — 옛 웹은 values 를 조용히 버리므로 조정을 끈다. */
    public boolean hasValuesCap() {
        JSONArray caps = snapshot == null ? null : snapshot.optJSONArray("caps");
        if (caps != null) for (int i = 0; i < caps.length(); i++) if ("values".equals(caps.optString(i))) return true;
        return false;
    }

    /** 무게·횟수 ± 를 켤 수 있나 — 완료할 수 있고(막힘 아님) 웹이 values 를 안다(REV-014 #34·#40). */
    public boolean canAdjust(long now) {
        // [원본] return canComplete(now) && hasValuesCap();
        return canCompleteOnScreen(now) && hasValuesCap();
    }

    /**
     * 잠금 중 「완료」 — 지금 보이는 단계의 setIds 를 조작에 고정하고 사본에서 뺀다(같은 rebase 함수) · 단계 휴식을 건다.
     * 누를 수 없는 상태면 null(낡은 알림의 버튼이 늦게 닿은 경우 — 화면이 바뀌었으니 아무것도 하지 않는다).
     */
    // [원본] return pressComplete(now, token, true); — 카드 버튼이 화면에 안 보이는 초안 값으로 완료했다(REV-015 정합성 #3)
    public JSONObject pressComplete(long now, String token) throws JSONException {
        return pressComplete(now, token, false);
    }

    /**
     * withDraft — 잠금 운동 화면에서 고른 값(draft · 같은 token 일 때만)을 조작의 values 로 싣는다(SPEC-019).
     * 바꾸지 않은 필드는 null · 바꾼 것이 하나도 없는 멤버는 빼고, 하나도 없으면 values 키 자체를 넣지 않는다(옛 조작과 같은 모양).
     */
    public JSONObject pressComplete(long now, String token, boolean withDraft) throws JSONException {
        return pressComplete(now, token, withDraft, 0);
    }

    /** holdMs > 0 — 잠금 운동 화면의 밀어서 완료: 그동안 되돌릴 수 있게 붙잡는다(SPEC-060 · 한 번에 하나 · 앞 붙잡기는 푼다). */
    public JSONObject pressComplete(long now, String token, boolean withDraft, long holdMs) throws JSONException {
        // [원본] if (!canComplete(now)) return null;
        if (withDraft ? !canCompleteOnScreen(now) : !canComplete(now)) return null;
        JSONObject st = currentStep();
        // 버튼이 본 단계와 지금 단계가 다르면(연타 두 번째 · 낡은 카드) 아무것도 하지 않는다
        if (token != null && !token.equals(stepToken(st))) return null;
        // 되돌릴 재료 — 바꾸기 전에 적어 둔다
        undo = null; // 붙잡기는 하나 — 앞 것은 풀려 다음 drain 에 간다(REV-146 계약 6)
        JSONObject before = null;
        if (holdMs > 0) {
            before = new JSONObject();
            before.put("step", new JSONObject(st.toString()));
            before.put("rest", rest == null ? JSONObject.NULL : new JSONObject(rest.toString()));
            before.put("draft", draft == null ? JSONObject.NULL : new JSONObject(draft.toString()));
            before.put("draftLost", draftLost);
        }
        JSONObject editedBefore = editedWe == null ? new JSONObject() : new JSONObject(editedWe.toString());
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
        // [원본] JSONArray values = withDraft ? draftValues(st) : null; — 옛 웹(caps 없음)에도 실었고, 낡은 처방값 멤버를 몰랐다
        // [개선] caps 가 있을 때만 · 고른 값(draft) + 같은 블록 앞 세트를 고쳤던 처방 세트의 보인 값(REV-014 #37·#40)
        Set<String> editedNow = new HashSet<>();
        JSONArray values = hasValuesCap() ? completeValues(st, withDraft, editedNow) : null;
        if (values != null && values.length() > 0) a.put("values", values);
        // 남은 세트에도 적용(SPEC-062) — 고른 칸만 forward 로 싣고, 사본의 뒤 세트 표시를 그 값으로(웹이 반영할 때까지)
        JSONObject carried = new JSONObject();
        if (values != null && withDraft && forwardOn(stepToken(st)) && hasCap("forward")) {
            String tk = stepToken(st);
            JSONObject dv = draftFor(stepToken(st));
            for (int i = 0; i < values.length(); i++) {
                JSONObject x = values.getJSONObject(i);
                JSONObject e = dv.optJSONObject(x.optString("setId"));
                JSONObject m = memberOf(st, x.optString("setId"));
                // 켬/끔은 멤버(블록)마다 — 슈퍼세트에서 A 만 켜면 B 는 이어 쓰지 않는다(REV-152 화면 1)
                if (e == null || m == null || !canForward(m) || !forwardOn(tk, m.optString("weId", ""))) continue;
                JSONArray fields = new JSONArray();
                JSONObject c = new JSONObject();
                c.put("seq", seq);
                if (e.has("weight")) {
                    fields.put("weight");
                    c.put("weight", e.get("weight"));
                }
                if (e.has("reps")) {
                    fields.put("reps");
                    c.put("reps", e.get("reps"));
                }
                if (fields.length() == 0) continue;
                x.put("forward", fields);
                c.put("unit", m.optString("unit", "kg"));
                c.put("oneSide", m.optBoolean("oneSide"));
                String we = m.optString("weId", "");
                if (carry == null) carry = new JSONObject();
                carried.put(we, carry.has(we) ? carry.get(we) : JSONObject.NULL);
                // 같은 블록의 앞 이어 쓰기와 칸을 합친다 — 무게 다음 횟수를 이어 써도 무게가 남게(REV-152 계약 1).
                // 단위·한쪽 입력이 같을 때만 · seq 는 새 것(웹은 seq 순서로 반영하므로 최대 seq 하나로 정리한다)
                JSONObject old = carry.optJSONObject(we);
                if (old != null && old.optString("unit").equals(c.optString("unit")) && old.optBoolean("oneSide") == c.optBoolean("oneSide")) {
                    if (!c.has("weight") && old.has("weight")) c.put("weight", old.get("weight"));
                    if (!c.has("reps") && old.has("reps")) c.put("reps", old.get("reps"));
                }
                carry.put(we, c);
            }
        }
        JSONObject edited = new JSONObject();
        if (!editedNow.isEmpty()) {
            if (editedWe == null) editedWe = new JSONObject();
            for (String we : editedNow) {
                edited.put(we, editedBefore.has(we) ? editedBefore.get(we) : JSONObject.NULL);
                editedWe.put(we, seq);
            }
        }
        draft = null;
        draftLost = false;
        JSONObject entry = new JSONObject();
        entry.put("action", a);
        entry.put("acked", false);
        queue.add(entry);
        JSONArray one = new JSONArray().put(a);
        // [원본] snapshot.put("steps", LockRules.rebase(snapshot.getJSONArray("steps"), seq - 1, one));
        snapshot.put("steps", applyCarry(LockRules.rebase(snapshot.getJSONArray("steps"), seq - 1, one)));
        long restSec = st.optLong("restAfterSec");
        if (restSec > 0) rest = restAt(now + restSec * 1000L, restSec, now);
        if (before != null) {
            before.put("actionId", a.getString("id"));
            before.put("seq", seq);
            before.put("holdAt", now);
            before.put("holdUntil", now + Math.min(holdMs, HOLD_MAX_MS));
            before.put("restSetAt", restSec > 0 ? now : -1);
            before.put("edited", edited);
            before.put("carried", carried);
            undo = before;
        }
        return a;
    }

    /** 고르는 중인 값 하나를 적는다 — 지금 단계(token)의 멤버만. 원래 값으로 돌아오면 그 필드는 지운다. 받으면 true. */
    public boolean setDraft(String token, String setId, Double weight, Integer reps) throws JSONException {
        JSONObject st = currentStep();
        if (st == null || token == null || !token.equals(stepToken(st))) return false;
        if (!hasValuesCap()) return false; // 옛 웹은 values 를 버린다(REV-014 #40)
        JSONObject m = memberOf(st, setId);
        if (m == null) return false;
        if (draft == null || !token.equals(draft.optString("token"))) {
            draft = new JSONObject();
            draft.put("token", token);
            draft.put("v", new JSONObject());
        }
        JSONObject d = m.optJSONObject("display");
        Double w0 = d == null || d.isNull("weight") ? null : d.optDouble("weight");
        Integer r0 = d == null || d.isNull("reps") ? null : d.optInt("reps");
        JSONObject e = new JSONObject();
        if (weight != null && !LockRules.sameWeight(weight, w0)) e.put("weight", weight);
        if (reps != null && !reps.equals(r0)) e.put("reps", reps);
        if (e.length() > 0) {
            // 고를 때 본 원래 값 — 같은 단계의 새 스냅샷이 표시값을 바꾸면 이 초안은 버린다(REV-014 #48)
            e.put("w0", w0 == null ? JSONObject.NULL : w0);
            e.put("r0", r0 == null ? JSONObject.NULL : r0);
        }
        JSONObject v = draft.getJSONObject("v");
        if (e.length() == 0) v.remove(setId);
        else v.put(setId, e);
        return true;
    }

    /** 이 단계의 고르는 중인 값(setId → {weight?, reps?}) — 다른 단계면 빈 것. */
    public JSONObject draftFor(String token) {
        if (draft == null || token == null || !token.equals(draft.optString("token"))) return new JSONObject();
        JSONObject v = draft.optJSONObject("v");
        return v == null ? new JSONObject() : v;
    }

    /** 완료 조작의 values — 멤버마다 고른 값(바꾼 칸만), 없으면 낡은 처방값 멤버의 보인 값. editedNow 에 고른 값이 있던 블록을 담는다. */
    private JSONArray completeValues(JSONObject st, boolean withDraft, Set<String> editedNow) throws JSONException {
        JSONObject v = withDraft ? draftFor(stepToken(st)) : new JSONObject();
        JSONArray out = new JSONArray();
        JSONArray members = st.optJSONArray("members");
        if (members == null) return out;
        for (int i = 0; i < members.length(); i++) {
            JSONObject m = members.getJSONObject(i);
            String id = m.getString("setId");
            String we = m.optString("weId", "");
            JSONObject e = v.optJSONObject(id);
            JSONObject x = new JSONObject();
            x.put("setId", id);
            if (m.has("unit")) x.put("unit", m.optString("unit")); // 없으면 웹이 블록 단위로(#41 · REV-015 정합성 #6)
            boolean drafted = e != null && (e.has("weight") || e.has("reps"));
            // 낡은 처방값 — 채우기는 무게만 바꾸므로 무게만 보인 값으로 싣는다(횟수는 정한 것만 · REV-015 정합성 #2·#4)
            boolean stale = m.optBoolean("refill") && !we.isEmpty() && editedWe != null && editedWe.has(we);
            JSONObject d = m.optJSONObject("display");
            Object shownW = d == null || d.isNull("weight") ? JSONObject.NULL : d.get("weight");
            // 이어 쓴 칸(SPEC-062) — 사본에 보인 값이 웹이 아직 모르는 값이라 그 칸을 늘 싣는다(우선순위 draft > carry > 낡은 처방)
            JSONArray cf = m.optJSONArray("carried");
            boolean carW = has(cf, "weight") && d != null && !d.isNull("weight");
            boolean carR = has(cf, "reps") && d != null && !d.isNull("reps");
            if (drafted) {
                // [원본] x.put("weight", e.has("weight") ? e.get("weight") : (stale ? shownW : JSONObject.NULL));
                // [원본] x.put("reps", e.has("reps") ? e.get("reps") : JSONObject.NULL);
                x.put("weight", e.has("weight") ? e.get("weight") : (carW || stale ? shownW : JSONObject.NULL));
                x.put("reps", e.has("reps") ? e.get("reps") : (carR ? d.get("reps") : JSONObject.NULL));
                out.put(x);
                if (!we.isEmpty()) editedNow.add(we);
            } else if (carW || carR) {
                x.put("weight", carW || stale ? shownW : JSONObject.NULL);
                x.put("reps", carR ? d.get("reps") : JSONObject.NULL);
                out.put(x);
            } else if (stale && shownW != JSONObject.NULL) {
                x.put("weight", shownW);
                x.put("reps", JSONObject.NULL);
                out.put(x);
            }
        }
        return out;
    }

    private static boolean has(JSONArray a, String k) {
        if (a != null) for (int i = 0; i < a.length(); i++) if (k.equals(a.optString(i))) return true;
        return false;
    }

    /** 스냅샷 caps 에 이 이름이 있나(values · forward) */
    public boolean hasCap(String name) {
        JSONArray caps = snapshot == null ? null : snapshot.optJSONArray("caps");
        return has(caps, name);
    }

    /** 일반 세트(라벨이 숫자)인가 — 워밍업 W · 드롭 D · 실패 F · 탑셋 T · 백오프 B · 피더 P 는 아니다(웹 isNumberedSet 과 같은 판정 · REV-151) */
    public static boolean numbered(JSONObject m) {
        String l = m == null ? "" : m.optString("label", "");
        return !l.isEmpty() && l.chars().allMatch(Character::isDigit);
    }

    /** 같은 블록 뒤의 이어 쓸 수 있는 세트(일반 · 같은 한쪽 입력 · 무게·횟수 세트)인가 */
    static boolean forwardTarget(JSONObject src, JSONObject m) {
        if (m == null || !numbered(m) || !src.optString("weId").equals(m.optString("weId"))) return false;
        if (src.optBoolean("oneSide") != m.optBoolean("oneSide")) return false;
        if (!src.optString("unit", "kg").equals(m.optString("unit", "kg"))) return false; // 단위가 다른 세트는 덮지 않는다(applyCarry 와 같게 · REV-152 화면 3)
        JSONObject d = m.optJSONObject("display");
        return d != null && d.isNull("seconds") && d.isNull("distanceM");
    }

    /** 이 멤버의 값을 「남은 세트에도 적용」할 수 있나 — 웹이 forward 를 알고, 일반 세트이고, 뒤에 같은 블록 일반 세트가 있다 */
    public boolean canForward(JSONObject m) {
        if (!hasCap("forward") || !numbered(m) || m.optString("weId", "").isEmpty()) return false;
        JSONArray steps = snapshot.optJSONArray("steps");
        if (steps != null) for (int i = 1; i < steps.length(); i++) {
            JSONArray ms = steps.optJSONObject(i) == null ? null : steps.optJSONObject(i).optJSONArray("members");
            if (ms != null) for (int k = 0; k < ms.length(); k++) if (forwardTarget(m, ms.optJSONObject(k))) return true;
        }
        return false;
    }

    /** 「남은 세트에도 적용」 켬/끔 — 고르는 중인 값(draft)의 표시로만 둔다(완료 전에는 carry 를 만들지 않는다 · REV-151 7) */
    public boolean setForward(String token, String weId, boolean on) throws JSONException {
        JSONObject st = currentStep();
        if (st == null || token == null || !token.equals(stepToken(st)) || !hasCap("forward")) return false;
        if (draft == null || !token.equals(draft.optString("token"))) {
            draft = new JSONObject();
            draft.put("token", token);
            draft.put("v", new JSONObject());
        }
        // fwd = {weId: true} — 멤버(블록)마다(REV-152 화면 1)
        JSONObject f = draft.optJSONObject("fwd");
        if (f == null) f = new JSONObject();
        if (on) f.put(weId == null ? "" : weId, true);
        else f.remove(weId == null ? "" : weId);
        if (f.length() == 0) draft.remove("fwd");
        else draft.put("fwd", f);
        return true;
    }

    /** 이 단계에서 어느 블록이든 켜져 있나 */
    public boolean forwardOn(String token) {
        return draft != null && token != null && token.equals(draft.optString("token")) && draft.optJSONObject("fwd") != null;
    }

    public boolean forwardOn(String token, String weId) {
        if (!forwardOn(token)) return false;
        return draft.optJSONObject("fwd").optBoolean(weId == null ? "" : weId);
    }

    /** 사본 단계의 뒤 세트 표시값을 이어 쓴 값으로 덮는다 — 덮은 칸은 멤버의 carried 에 적는다(완료 때 values 로 싣는 근거) */
    private JSONArray applyCarry(JSONArray steps) throws JSONException {
        if (carry == null || carry.length() == 0 || steps == null) return steps;
        for (int i = 0; i < steps.length(); i++) {
            JSONArray ms = steps.optJSONObject(i) == null ? null : steps.optJSONObject(i).optJSONArray("members");
            if (ms == null) continue;
            for (int k = 0; k < ms.length(); k++) {
                JSONObject m = ms.optJSONObject(k);
                JSONObject c = m == null ? null : carry.optJSONObject(m.optString("weId", ""));
                if (c == null || !numbered(m) || c.optBoolean("oneSide") != m.optBoolean("oneSide")) continue;
                if (!c.optString("unit", "kg").equals(m.optString("unit", "kg"))) continue; // 단위가 바뀐 블록 — 웹이 쓴 값을 기다린다
                JSONObject d = m.optJSONObject("display");
                if (d == null || !d.isNull("seconds") || !d.isNull("distanceM")) continue;
                JSONArray f = new JSONArray();
                if (c.has("weight") && !d.isNull("weight")) {
                    d.put("weight", c.get("weight"));
                    f.put("weight");
                }
                if (c.has("reps")) {
                    d.put("reps", c.get("reps"));
                    f.put("reps");
                }
                if (f.length() > 0) m.put("carried", f);
            }
        }
        return steps;
    }

    /** 웹이 반영한 seq 까지의 이어 쓰기는 지운다 — 새 스냅샷의 뒤 세트 값은 웹이 이미 바꿨다(REV-151 3) */
    private void pruneCarry(long applied) {
        if (carry == null) return;
        java.util.Iterator<String> it = carry.keys();
        while (it.hasNext()) if (carry.optJSONObject(it.next()).optLong("seq") <= applied) it.remove();
        if (carry.length() == 0) carry = null;
    }

    /** 웹이 반영한 seq 까지의 「고친 블록」은 지운다 — 새 스냅샷의 값은 웹이 다시 계산했다. */
    private void pruneEditedWe(long applied) {
        if (editedWe == null) return;
        java.util.Iterator<String> it = editedWe.keys();
        while (it.hasNext()) if (editedWe.optLong(it.next()) <= applied) it.remove();
        if (editedWe.length() == 0) editedWe = null;
    }

    // [원본] 첫 판 — completeValues 로 대신(caps · 낡은 처방값 · 단위). 되돌릴 수 있게 남긴다.
    @SuppressWarnings("unused")
    private JSONArray draftValues(JSONObject st) throws JSONException {
        JSONObject v = draftFor(stepToken(st));
        JSONArray out = new JSONArray();
        JSONArray members = st.optJSONArray("members");
        if (members == null) return out;
        for (int i = 0; i < members.length(); i++) {
            String id = members.getJSONObject(i).getString("setId");
            JSONObject e = v.optJSONObject(id);
            if (e == null || e.length() == 0) continue;
            JSONObject x = new JSONObject();
            x.put("setId", id);
            x.put("weight", e.has("weight") ? e.get("weight") : JSONObject.NULL);
            x.put("reps", e.has("reps") ? e.get("reps") : JSONObject.NULL);
            out.put(x);
        }
        return out;
    }

    private static JSONObject memberOf(JSONObject st, String setId) {
        JSONArray ms = st.optJSONArray("members");
        if (ms != null) for (int i = 0; i < ms.length(); i++) {
            JSONObject m = ms.optJSONObject(i);
            if (m != null && setId.equals(m.optString("setId"))) return m;
        }
        return null;
    }

    /** 새 스냅샷으로 단계가 바뀌었으면 고르던 값을 버린다 — 고른 것이 있었으면 한 번 알린다(화면 H-4). */
    private void dropStaleDraft() {
        if (draft == null) return;
        JSONObject st = currentStep();
        JSONObject v = draft.optJSONObject("v");
        if (st != null && stepToken(st).equals(draft.optString("token"))) {
            // 같은 단계 — 표시값이 바뀐 멤버의 초안만 버린다(REV-014 #48)
            if (v == null) return;
            java.util.Iterator<String> it = v.keys();
            while (it.hasNext()) {
                String id = it.next();
                JSONObject e = v.optJSONObject(id);
                JSONObject m = memberOf(st, id);
                JSONObject d = m == null ? null : m.optJSONObject("display");
                Double w = d == null || d.isNull("weight") ? null : d.optDouble("weight");
                Integer r = d == null || d.isNull("reps") ? null : d.optInt("reps");
                Double w0 = e == null || e.isNull("w0") ? null : e.optDouble("w0");
                Integer r0 = e == null || e.isNull("r0") ? null : e.optInt("r0");
                if (m == null || !LockRules.sameWeight(w, w0) || !java.util.Objects.equals(r, r0)) {
                    it.remove();
                    draftLost = true;
                }
            }
            return;
        }
        if (v != null && v.length() > 0) draftLost = true;
        draft = null;
    }

    /** +초 — 진행 중이면 끝 시각을 늘리고, 끝났으면 지금부터. */
    public void addRest(long sec, long now) throws JSONException {
        if (snapshot == null) return; // 끝난 세션의 카드 버튼(계약 M-2)
        long remain = LockRules.restRemainingSec(rest, now);
        // −초(SPEC-060 화면 −30초) — 쉬는 중이 아니면 아무것도 안 함 · 0 이하가 되면 끝내기와 같다
        if (sec < 0) {
            if (remain <= 0) return;
            long endsAt = rest.optLong("endsAt") + sec * 1000L;
            if (endsAt <= now) {
                endRest(now);
                return;
            }
            long total = Math.max(1, rest.optLong("totalSec") + sec);
            rest = restAt(endsAt, total, now);
            return;
        }
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
