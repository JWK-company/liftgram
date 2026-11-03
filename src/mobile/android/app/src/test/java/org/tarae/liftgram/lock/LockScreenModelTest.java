package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * 잠금화면 운동 화면의 순수 모델(SPEC-019 · REV-014 #4·#37·#40·#45·#48 · L-4) —
 * 초안(바꾼 칸만 · 원래 값이면 지움 · 단계·표시값이 바뀌면 버림+안내) · 완료 values · caps · ± 계산 · 켜기 조건.
 */
public class LockScreenModelTest {
    static JSONObject member(String id, String weId, double kg, int reps, boolean refill) throws Exception {
        return LockStoreTest.member(id, kg, reps).put("weId", weId).put("refill", refill);
    }

    static JSONObject step(JSONObject... ms) throws Exception {
        JSONArray ids = new JSONArray();
        JSONArray arr = new JSONArray();
        for (JSONObject m : ms) {
            ids.put(m.getString("setId"));
            arr.put(m);
        }
        return new JSONObject().put("setIds", ids).put("members", arr).put("restAfterSec", 0).put("openApp", false);
    }

    static JSONObject snap(LockState s, long applied, boolean caps, JSONObject... steps) throws Exception {
        JSONObject o = LockStoreTest.snap(applied, s.storeId, steps);
        if (caps) o.put("caps", new JSONArray().put("values"));
        return o;
    }

    @Test
    public void 초안은_바꾼_칸만_싣고_원래_값으로_돌아오면_지운다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(s, 0, true, step(member("a1", "A", 60, 8, false)), step(member("a2", "A", 60, 8, false))), 1);
        assertTrue(s.setDraft("a1", "a1", 62.5, 8));
        JSONObject d = s.draftFor("a1").getJSONObject("a1");
        assertEquals(62.5, d.getDouble("weight"), 0);
        assertFalse("횟수는 그대로라 싣지 않는다", d.has("reps"));
        // 원래 값으로 → 지움
        assertTrue(s.setDraft("a1", "a1", 60.0, 8));
        assertEquals(0, s.draftFor("a1").length());
        // 다른 단계 토큰은 받지 않는다
        assertFalse(s.setDraft("a2", "a2", 70.0, 8));

        assertTrue(s.setDraft("a1", "a1", 60.0, 6));
        // 카드 버튼(초안 없음)은 싣지 않는다
        LockState card = LockState.fromJson(s.toJson());
        assertFalse(card.pressComplete(10, "a1").has("values"));
        JSONObject a = s.pressComplete(10, "a1", true);
        JSONArray v = a.getJSONArray("values");
        assertEquals(1, v.length());
        assertTrue(v.getJSONObject(0).isNull("weight"));
        assertEquals(6, v.getJSONObject(0).getInt("reps"));
        assertEquals("kg", v.getJSONObject(0).getString("unit"));
        // lb 멤버는 lb 로 싣는다
        LockState l = LockState.fresh();
        l.update(snap(l, 0, true, step(member("p", "P", 100, 5, false).put("unit", "lb"))), 1);
        assertTrue(l.setDraft("p", "p", 105.0, 5));
        assertEquals("lb", l.pressComplete(2, "p", true).getJSONArray("values").getJSONObject(0).getString("unit"));
        assertNull("완료하면 초안은 비운다", s.draft);
    }

    @Test
    public void 옛_웹_caps_없으면_조정도_values도_없다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(s, 0, false, step(member("a1", "A", 60, 8, false))), 1);
        assertFalse(s.hasValuesCap());
        assertFalse(s.canAdjust(1));
        assertTrue(s.canComplete(1));
        assertFalse(s.setDraft("a1", "a1", 62.5, 8));
        JSONObject a = s.pressComplete(10, "a1");
        assertNotNull(a);
        assertFalse(a.has("values"));
    }

    @Test
    public void 앞_세트를_고쳤으면_같은_블록의_처방_세트는_보인_값을_싣는다() throws Exception {
        LockState s = LockState.fresh();
        s.update(
                snap(s, 0, true,
                        step(member("t", "A", 100, 5, false)),
                        step(member("b1", "A", 90, 5, true)),
                        step(member("x", "B", 50, 10, true))),
                1);
        assertTrue(s.setDraft("t", "t", 105.0, 5));
        assertNotNull(s.pressComplete(10, "t", true));
        // 웹이 아직 그 seq 를 반영하지 않은 스냅샷 — 「고친 블록」은 남는다
        s.update(snap(s, 0, true, step(member("b1", "A", 90, 5, true)), step(member("x", "B", 50, 10, true)), step(member("b2", "A", 80, 5, true))), 15);
        assertTrue(s.editedWe.has("A"));
        // 처방 세트에서 횟수만 고쳐도 무게는 보인 값으로 함께 싣는다
        assertTrue(s.setDraft("b1", "b1", 90.0, 6));
        JSONObject b = s.pressComplete(20, "b1", true);
        JSONArray v = b.getJSONArray("values");
        assertEquals(1, v.length());
        assertEquals(90.0, v.getJSONObject(0).getDouble("weight"), 0);
        assertEquals(6, v.getJSONObject(0).getInt("reps"));
        // 다른 블록(B)은 고친 적이 없다 — values 없음
        JSONObject x = s.pressComplete(30, "x", true);
        assertFalse(x.has("values"));
        // 초안 없는 처방 세트(카드 버튼 포함) — 무게만 보인 값 · 횟수 null
        JSONObject b2 = s.pressComplete(35, "b2");
        JSONObject v2 = b2.getJSONArray("values").getJSONObject(0);
        assertEquals(80.0, v2.getDouble("weight"), 0);
        assertTrue(v2.isNull("reps"));
        // 웹이 그 seq 까지 반영한 스냅샷을 보내면 「고친 블록」은 잊는다
        assertNotNull(s.editedWe);
        s.update(snap(s, 4, true, step(member("b3", "A", 94.5, 5, true))), 40);
        assertNull(s.editedWe);
        assertFalse(s.pressComplete(50, "b3").has("values"));
        // 세션이 바뀌면 지운다
        s.editedWe = new JSONObject().put("A", 99);
        s.update(snap(s, 0, true, step(member("n", "A", 1, 1, true))).put("sessionId", "w2"), 60);
        assertNull(s.editedWe);
    }

    @Test
    public void 단계가_바뀌거나_표시값이_바뀌면_초안을_버리고_한번_알린다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(s, 0, true, step(member("a1", "A", 60, 8, false), member("c1", "C", 20, 12, false))), 1);
        assertTrue(s.setDraft("a1,c1", "a1", 62.5, 8));
        assertTrue(s.setDraft("a1,c1", "c1", 20.0, 10));
        // 같은 단계 · a1 표시값만 바뀜 → a1 초안만 버림
        s.update(snap(s, 0, true, step(member("a1", "A", 65, 8, false), member("c1", "C", 20, 12, false))), 2);
        assertFalse(s.draftFor("a1,c1").has("a1"));
        assertTrue(s.draftFor("a1,c1").has("c1"));
        assertTrue(s.draftLost);
        s.draftLost = false;
        // 단계가 바뀜 → 전부 버림
        s.update(snap(s, 0, true, step(member("z", "Z", 1, 1, false))), 3);
        assertNull(s.draft);
        assertTrue(s.draftLost);
        // 저장소 왕복에도 남는다
        LockState back = LockState.fromJson(s.toJson());
        assertTrue(back.draftLost);
    }

    @Test
    public void 증감_계산() {
        assertEquals(62.5, LockRules.nudgeWeight(60.0, "kg", 1), 0);
        assertEquals(0.0, LockRules.nudgeWeight(1.0, "kg", -1), 0);
        assertEquals(105.0, LockRules.nudgeWeight(100.0, "lb", 1), 0);
        assertEquals(2.5, LockRules.nudgeWeight(null, "kg", 1), 0);
        assertEquals(63.73, LockRules.nudgeWeight(61.23, "kg", 1), 1e-9);
        assertEquals(1, LockRules.nudgeReps(1, -1));
        assertEquals(1, LockRules.nudgeReps(null, -1));
        assertEquals(999, LockRules.nudgeReps(999, 1));
        assertTrue(LockRules.sameWeight(61.234, 61.23));
        assertFalse(LockRules.sameWeight(61.24, 61.23));
    }

    @Test
    public void 켜기_조건_표() {
        // enabled, active, paused, interactive, locked, visible
        assertTrue(LockScreenGate.shouldShow(true, true, false, false, false, false)); // 화면 꺼짐
        assertTrue(LockScreenGate.shouldShow(true, true, false, true, true, false)); // 켜져 있고 잠김
        assertFalse("잠금 풀린 채 켜져 있음", LockScreenGate.shouldShow(true, true, false, true, false, false));
        assertFalse("설정 꺼짐", LockScreenGate.shouldShow(false, true, false, false, true, false));
        assertFalse("운동 없음", LockScreenGate.shouldShow(true, false, false, false, true, false));
        assertFalse("일시정지", LockScreenGate.shouldShow(true, true, true, false, true, false));
        assertFalse("이미 보임", LockScreenGate.shouldShow(true, true, false, true, true, true));
    }
}
