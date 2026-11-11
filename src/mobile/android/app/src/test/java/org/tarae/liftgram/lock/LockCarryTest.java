package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** 남은 세트에도 적용(SPEC-062 · REV-151) — forward 조작 · 사본 이어 쓰기 · 완료 때 싣기 · 되돌리기 · 웹 반영 뒤 정리 */
public class LockCarryTest {
    static final long HOLD = 5000;

    static JSONObject m(String id, String label, double kg, int reps) throws Exception {
        return LockRemainingTest.m(id, "A", "벤치", label, kg).put("display",
                new JSONObject().put("weight", kg).put("reps", reps).put("seconds", JSONObject.NULL).put("distanceM", JSONObject.NULL));
    }

    static JSONObject snap(LockState s, long applied, boolean fwdCap, JSONObject... steps) throws Exception {
        JSONObject sn = LockStoreTest.snap(applied, s.storeId, steps);
        JSONArray caps = new JSONArray().put("values");
        if (fwdCap) caps.put("forward");
        sn.put("caps", caps);
        return sn;
    }

    static LockState started(boolean cap) throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(s, 0, cap,
                LockRemainingTest.st(m("a1", "1", 80, 8)),
                LockRemainingTest.st(m("a2", "2", 80, 8)),
                LockRemainingTest.st(m("ab", "B", 70, 8)), // 백오프 — 대상 아님
                LockRemainingTest.st(m("a3", "3", 80, 8))), 1000);
        return s;
    }

    static String tok(LockState s) {
        return LockState.stepToken(s.currentStep());
    }

    static JSONObject disp(LockState s, int step) throws Exception {
        return s.snapshot.getJSONArray("steps").getJSONObject(step).getJSONArray("members").getJSONObject(0).getJSONObject("display");
    }

    @Test
    public void 켜고_완료하면_고른_칸만_forward_로_싣고_뒤_일반_세트_표시를_바꾼다() throws Exception {
        LockState s = started(true);
        assertTrue(s.canForward(s.currentStep().getJSONArray("members").getJSONObject(0)));
        assertTrue(s.setDraft(tok(s), "a1", 82.5, null));
        assertTrue(s.setForward(tok(s), "A", true));
        JSONObject a = s.pressComplete(10_000, tok(s), true, HOLD);
        JSONObject v = a.getJSONArray("values").getJSONObject(0);
        assertEquals("weight", v.getJSONArray("forward").getString(0));
        assertEquals(1, v.getJSONArray("forward").length()); // 횟수는 고르지 않았다(REV-151 4)
        assertEquals(82.5, disp(s, 0).getDouble("weight"), 0.001); // a2
        assertEquals(70, disp(s, 1).getDouble("weight"), 0.001); // 백오프는 그대로(REV-151 1)
        assertEquals(82.5, disp(s, 2).getDouble("weight"), 0.001); // a3
        assertEquals(8, disp(s, 0).getInt("reps"));
    }

    @Test
    public void 이어_쓴_세트를_완료하면_그_칸을_values_로_싣는다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, null);
        s.setForward(tok(s), "A", true);
        s.pressComplete(10_000, tok(s), true, 0);
        JSONObject a2 = s.pressComplete(11_000, tok(s), true, 0);
        JSONObject v = a2.getJSONArray("values").getJSONObject(0);
        assertEquals("a2", v.getString("setId"));
        assertEquals(82.5, v.getDouble("weight"), 0.001);
        assertTrue(v.isNull("reps"));
        assertFalse(v.has("forward"));
    }

    @Test
    public void 카드_완료도_이어_쓴_값을_싣는다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, 10);
        s.setForward(tok(s), "A", true);
        s.pressComplete(10_000, tok(s), true, 0);
        JSONObject a2 = s.pressComplete(11_000, tok(s)); // 알림 카드 버튼(withDraft false)
        JSONObject v = a2.getJSONArray("values").getJSONObject(0);
        assertEquals(82.5, v.getDouble("weight"), 0.001);
        assertEquals(10, v.getInt("reps"));
    }

    @Test
    public void 되돌리면_이어_쓰기도_사라지고_표시가_돌아온다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, null);
        s.setForward(tok(s), "A", true);
        JSONObject a = s.pressComplete(10_000, tok(s), true, HOLD);
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 11_000));
        assertNull(s.carry);
        assertEquals(80, disp(s, 1).getDouble("weight"), 0.001); // a2(지금 단계는 다시 a1)
        assertTrue(s.forwardOn(tok(s))); // 초안의 켬 표시도 돌아온다
    }

    @Test
    public void 웹이_반영한_스냅샷이_오면_지우고_웹_값을_쓴다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, null);
        s.setForward(tok(s), "A", true);
        JSONObject a = s.pressComplete(10_000, tok(s), true, 0);
        s.drain(10_500);
        // 웹이 a1 완료 + 뒤 세트 82.5 를 쓴 스냅샷(applied = 그 seq)
        assertTrue(s.update(snap(s, a.getLong("seq"), true,
                LockRemainingTest.st(m("a2", "2", 82.5, 8)),
                LockRemainingTest.st(m("ab", "B", 70, 8)),
                LockRemainingTest.st(m("a3", "3", 82.5, 8))), 12_000));
        assertNull(s.carry);
        JSONObject a2 = s.pressComplete(13_000, tok(s), true, 0);
        assertFalse(a2.has("values")); // 더 실을 것이 없다
    }

    @Test
    public void 웹이_반영하기_전_스냅샷에서도_이어_쓴_값이_남는다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, null);
        s.setForward(tok(s), "A", true);
        s.pressComplete(10_000, tok(s), true, 0);
        // 휴식 갱신 같은 옛 스냅샷(applied 0 · 웹은 아직 그 조작을 모름)
        s.update(snap(s, 0, true,
                LockRemainingTest.st(m("a1", "1", 80, 8)),
                LockRemainingTest.st(m("a2", "2", 80, 8)),
                LockRemainingTest.st(m("ab", "B", 70, 8)),
                LockRemainingTest.st(m("a3", "3", 80, 8))), 11_000);
        assertEquals("a2", s.currentStep().getJSONArray("setIds").getString(0));
        assertEquals(82.5, disp(s, 0).getDouble("weight"), 0.001);
    }

    @Test
    public void 옛_웹_cap_없음이면_켤_수_없고_forward_를_싣지_않는다() throws Exception {
        LockState s = started(false);
        assertFalse(s.canForward(s.currentStep().getJSONArray("members").getJSONObject(0)));
        assertFalse(s.setForward(tok(s), "A", true));
        s.setDraft(tok(s), "a1", 82.5, null);
        JSONObject a = s.pressComplete(10_000, tok(s), true, 0);
        assertFalse(a.getJSONArray("values").getJSONObject(0).has("forward"));
        assertNull(s.carry);
    }

    @Test
    public void 끄고_완료하면_이어_쓰지_않는다_운동이_끝나면_지운다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 82.5, null);
        s.setForward(tok(s), "A", true);
        s.setForward(tok(s), "A", false);
        s.pressComplete(10_000, tok(s), true, 0);
        assertNull(s.carry);
        assertEquals(80, disp(s, 0).getDouble("weight"), 0.001);

        LockState t = started(true);
        t.setDraft(tok(t), "a1", 82.5, null);
        t.setForward(tok(t), "A", true);
        t.pressComplete(10_000, tok(t), true, 0);
        LockState back = LockState.fromJson(t.toJson());
        assertTrue(back.carry != null);
        back.end();
        assertNull(back.carry);
    }

    @Test
    public void 표_미리보기는_켠_채_고르는_값을_뒤_일반_세트에_보인다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 85.0, null);
        s.setForward(tok(s), "A", true);
        LockView v = LockView.of(s, 2000);
        assertTrue(v.forwardOn);
        assertEquals(85.0, v.remaining.get(0).get(0).weight, 0.001);
        assertTrue(v.remaining.get(0).get(0).carried);
        assertEquals(70.0, v.remaining.get(1).get(0).weight, 0.001); // 백오프
        assertFalse(v.remaining.get(1).get(0).carried);
    }

    @Test
    public void 슈퍼세트는_켠_블록만_이어_쓴다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(s, 0, true,
                LockRemainingTest.st(m("a1", "1", 80, 8), LockRemainingTest.m("b1", "B", "로우", "1", 40)),
                LockRemainingTest.st(m("a2", "2", 80, 8), LockRemainingTest.m("b2", "B", "로우", "2", 40))), 1000);
        s.setDraft(tok(s), "a1", 85.0, null);
        s.setDraft(tok(s), "b1", 45.0, null);
        s.setForward(tok(s), "A", true);
        assertFalse(s.forwardOn(tok(s), "B"));
        LockView v = LockView.of(s, 2000);
        assertTrue(v.remaining.get(0).get(0).carried);
        assertFalse(v.remaining.get(0).get(1).carried);
        JSONObject a = s.pressComplete(10_000, tok(s), true, 0);
        JSONArray vals = a.getJSONArray("values");
        for (int i = 0; i < vals.length(); i++) {
            JSONObject x = vals.getJSONObject(i);
            assertEquals(x.getString("setId").equals("a1"), x.has("forward"));
        }
        JSONArray ms = s.currentStep().getJSONArray("members");
        assertEquals(85.0, ms.getJSONObject(0).getJSONObject("display").getDouble("weight"), 0.001);
        assertEquals(40.0, ms.getJSONObject(1).getJSONObject("display").getDouble("weight"), 0.001);
    }

    @Test
    public void 무게_다음_횟수를_이어_써도_두_칸이_남는다() throws Exception {
        LockState s = started(true);
        s.setDraft(tok(s), "a1", 85.0, null);
        s.setForward(tok(s), "A", true);
        s.pressComplete(10_000, tok(s), true, 0);
        s.setDraft(tok(s), "a2", null, 10);
        s.setForward(tok(s), "A", true);
        s.pressComplete(11_000, tok(s), true, 0);
        // 휴식 갱신 같은 옛 스냅샷(applied 0) — 사본을 원래 값에서 다시 계산해도 두 칸 다 남는다
        s.update(snap(s, 0, true,
                LockRemainingTest.st(m("a1", "1", 80, 8)),
                LockRemainingTest.st(m("a2", "2", 80, 8)),
                LockRemainingTest.st(m("ab", "B", 70, 8)),
                LockRemainingTest.st(m("a3", "3", 80, 8))), 12_000);
        assertEquals("ab", s.currentStep().getJSONArray("setIds").getString(0));
        s.pressComplete(13_000, tok(s), true, 0); // 백오프
        JSONObject a3 = s.pressComplete(14_000, tok(s), true, 0);
        JSONObject v = a3.getJSONArray("values").getJSONObject(0);
        assertEquals(85.0, v.getDouble("weight"), 0.001);
        assertEquals(10, v.getInt("reps"));
    }
}
