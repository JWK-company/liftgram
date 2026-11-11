package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** 밀어서 완료의 붙잡기·되돌리기(SPEC-060 · REV-146) — 웹 계약(대기열 → drain → ack)은 그대로, 붙잡기는 대기열 안에서만. */
public class LockUndoTest {
    static final long HOLD = 5000;

    static LockState started() throws Exception {
        LockState s = LockState.fresh();
        JSONObject sn = LockStoreTest.snap(0, s.storeId, LockStoreTest.step(60, "a1"), LockStoreTest.step(60, "a2"), LockStoreTest.step(60, "a3"));
        sn.put("caps", new JSONArray().put("values"));
        s.update(sn, 1000);
        return s;
    }

    static String firstId(LockState s) {
        return s.currentStep().optJSONArray("setIds").optString(0);
    }

    @Test
    public void 붙잡는_동안_drain_은_그_완료를_싣지_않고_시간이_지나면_싣는다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        assertNotNull(a);
        assertEquals("a2", firstId(s));
        assertEquals(0, s.drain(12_000).getJSONArray("actions").length());
        assertEquals(Long.valueOf(15_000), s.stallsAt());
        assertEquals(1, s.drain(15_000).getJSONArray("actions").length());
        // 내보낸 뒤에는 시계가 창 안으로 돌아와도 되돌리지 못한다(REV-147 2)
        assertEquals(LockState.GONE, s.undoComplete(a.getString("id"), 12_000));
        assertNull(s.stallsAt());
    }

    @Test
    public void 되돌린_초안도_그_사이_바뀐_처방과_맞지_않으면_버린다() throws Exception {
        LockState s = started();
        assertTrue(s.setDraft("a1", "a1", 62.5, null));
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        JSONObject sn = LockStoreTest.snap(0, s.storeId, LockStoreTest.step(65, "a1"), LockStoreTest.step(60, "a2"));
        sn.put("caps", new JSONArray().put("values"));
        s.update(sn, 11_000);
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 12_000));
        assertEquals(0, s.draftFor("a1").length());
        assertTrue(s.draftLost);
    }

    @Test
    public void 붙잡힌_완료_뒤의_카드_완료도_함께_기다린다_워터마크가_앞지르지_않게() throws Exception {
        LockState s = started();
        s.pressComplete(10_000, "a1", true, HOLD);
        assertNotNull(s.pressComplete(11_000, "a2", false));
        // 카드 완료(holdMs 0)는 앞 붙잡기를 푼다 — 둘 다 순서대로 나간다
        assertEquals(2, s.drain(11_500).getJSONArray("actions").length());
    }

    @Test
    public void 붙잡기는_하나_새_밀기가_앞_붙잡기를_푼다() throws Exception {
        LockState s = started();
        JSONObject a1 = s.pressComplete(10_000, "a1", true, HOLD);
        JSONObject a2 = s.pressComplete(11_000, "a2", true, HOLD);
        JSONArray out = s.drain(12_000).getJSONArray("actions");
        assertEquals(1, out.length());
        assertEquals(a1.getString("id"), out.getJSONObject(0).getString("id"));
        assertEquals(LockState.GONE, s.undoComplete(a1.getString("id"), 12_000));
        assertEquals(LockState.UNDONE, s.undoComplete(a2.getString("id"), 12_000));
        assertEquals("a2", firstId(s));
    }

    @Test
    public void 되돌리면_단계_휴식_초안이_돌아오고_대기열에서_빠진다() throws Exception {
        LockState s = started();
        // 쉬는 중(완료 전 휴식 끝 20초)
        s.setRest(new JSONObject().put("endsAt", 20_000).put("totalSec", 90).put("setAt", 5000).put("by", "native"));
        assertTrue(s.setDraft("a1", "a1", 62.5, null));
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        assertEquals(100_000, s.rest.optLong("endsAt")); // 새 휴식 90초
        assertEquals(20_000, s.drain(11_000).getJSONObject("rest").optLong("endsAt")); // 붙잡는 동안은 완료 전 휴식
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 12_000));
        assertEquals("a1", firstId(s));
        assertEquals(0, s.queue.size());
        assertEquals(20_000, s.rest.optLong("endsAt"));
        assertEquals(12_000, s.rest.optLong("setAt")); // 새 기록 — LWW 에서 이긴다
        assertEquals(62.5, s.draftFor("a1").getJSONObject("a1").getDouble("weight"), 0.001);
        assertNull(s.undo);
        assertEquals(0, s.drain(30_000).getJSONArray("actions").length());
    }

    @Test
    public void 완료_전에_쉬지_않았으면_되돌리면_휴식이_꺼진다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 11_000));
        assertEquals(0, LockRules.restRemainingSec(s.rest, 11_000));
    }

    @Test
    public void 그_사이_사람이_바꾼_휴식은_되돌리지_않는다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        s.addRest(30, 11_000); // +30초 — setAt 이 바뀐다
        long ends = s.rest.optLong("endsAt");
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 12_000));
        assertEquals(ends, s.rest.optLong("endsAt"));
    }

    @Test
    public void 시간이_지나거나_ack_되면_되돌리지_못한다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        assertEquals(LockState.EXPIRED, s.undoComplete(a.getString("id"), 15_000));
        assertEquals(1, s.queue.size());

        LockState t = started();
        JSONObject b = t.pressComplete(10_000, "a1", true, HOLD);
        t.ack(Collections.singleton(b.getString("id")));
        assertEquals(LockState.GONE, t.undoComplete(b.getString("id"), 11_000));
    }

    @Test
    public void 붙잡는_중_스냅샷이_와도_완료한_단계는_빠져_있고_되돌리면_원래_단계로_다시_계산한다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        // 웹이 단계 구성을 바꾼 새 스냅샷(아직 그 완료는 모름 · applied 0) — a1 의 무게가 65 로 바뀜
        JSONObject sn = LockStoreTest.snap(0, s.storeId, LockStoreTest.step(65, "a1"), LockStoreTest.step(60, "a2"));
        sn.put("caps", new JSONArray().put("values"));
        assertTrue(s.update(sn, 11_000));
        assertEquals("a2", firstId(s));
        assertEquals(LockState.UNDONE, s.undoComplete(a.getString("id"), 12_000));
        JSONArray steps = s.snapshot.getJSONArray("steps");
        assertEquals(2, steps.length()); // 겹치지 않는다
        assertEquals(65, steps.getJSONObject(0).getJSONArray("members").getJSONObject(0).getJSONObject("display").getDouble("weight"), 0.001);
    }

    @Test
    public void 시계가_뒤로_가면_붙잡기는_풀린_것으로_본다() throws Exception {
        LockState s = started();
        s.pressComplete(10_000, "a1", true, HOLD);
        assertFalse(s.held(9_000));
        assertEquals(1, s.drain(9_000).getJSONArray("actions").length());
        assertFalse("내보낸 뒤에는 다시 붙잡히지 않는다(REV-147 2)", s.held(10_001));
    }

    @Test
    public void 붙잡기는_저장_왕복에_남는다() throws Exception {
        LockState s = started();
        JSONObject a = s.pressComplete(10_000, "a1", true, HOLD);
        LockState back = LockState.fromJson(s.toJson());
        assertTrue(back.held(11_000));
        assertEquals(0, back.drain(11_000).getJSONArray("actions").length());
        assertEquals(LockState.UNDONE, back.undoComplete(a.getString("id"), 11_000));
        assertEquals("a1", firstId(back));
    }

    @Test
    public void 풀거나_운동이_끝나면_붙잡기가_사라진다() throws Exception {
        LockState s = started();
        s.pressComplete(10_000, "a1", true, HOLD);
        assertTrue(s.releaseHold());
        assertEquals(1, s.drain(11_000).getJSONArray("actions").length());
        s.pressComplete(12_000, "a2", true, HOLD);
        s.end();
        assertNull(s.undo);
        assertNull(s.stallsAt());
    }

    @Test
    public void 빼기_30초는_쉬는_중에만_0_이하면_끝() throws Exception {
        LockState s = started();
        s.addRest(-30, 1000);
        assertEquals(0, LockRules.restRemainingSec(s.rest, 1000));
        s.addRest(90, 1000); // 90초 시작
        s.addRest(-30, 2000);
        assertEquals(60, s.rest.optLong("totalSec"));
        assertEquals(61_000, s.rest.optLong("endsAt"));
        s.addRest(-30, 50_000); // 남은 11초 → 끝
        assertEquals(0, LockRules.restRemainingSec(s.rest, 50_000));
    }

    @Test
    public void 화면_보기용_되돌리기_값은_고른_값을_싣는다() throws Exception {
        LockState s = started();
        s.setDraft("a1", "a1", 70.0, 8);
        s.pressComplete(10_000, "a1", true, HOLD);
        LockView v = LockView.of(s, 11_000);
        assertEquals(Long.valueOf(15_000), v.undoUntil);
        assertEquals(1, v.undoMembers.size());
        assertEquals(70.0, v.undoMembers.get(0).draftWeight, 0.001);
        assertEquals(Integer.valueOf(8), v.undoMembers.get(0).draftReps);
        assertNull(LockView.of(s, 16_000).undoUntil);
    }
}
