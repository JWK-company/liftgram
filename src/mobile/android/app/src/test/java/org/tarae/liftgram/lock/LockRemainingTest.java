package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** 남은 세트 표(SPEC-062) — 재료(fillRemaining)와 높이 맞춤 계획(fit) */
public class LockRemainingTest {
    static JSONObject m(String setId, String weId, String name, String label, double kg) throws Exception {
        return LockStoreTest.member(setId, kg, 8).put("weId", weId).put("exerciseName", name).put("label", label);
    }

    static JSONObject st(JSONObject... ms) throws Exception {
        JSONArray ids = new JSONArray();
        JSONArray arr = new JSONArray();
        for (JSONObject x : ms) {
            ids.put(x.getString("setId"));
            arr.put(x);
        }
        return new JSONObject().put("setIds", ids).put("members", arr).put("restAfterSec", 90).put("openApp", false);
    }

    static LockView view(boolean truncated, JSONObject... steps) throws Exception {
        LockState s = LockState.fresh();
        JSONObject sn = LockStoreTest.snap(0, s.storeId, steps);
        sn.put("truncated", truncated);
        s.update(sn, 1000);
        return LockView.of(s, 2000);
    }

    @Test
    public void 지금_블록의_뒤_세트만_싣고_블록이_끝나면_다음_운동_이름() throws Exception {
        LockView v = view(false,
                st(m("a1", "A", "벤치", "1", 60)),
                st(m("a2", "A", "벤치", "2", 60)),
                st(m("a3", "A", "벤치", "3", 65)),
                st(m("b1", "B", "로우", "1", 40)),
                st(m("a9", "A", "벤치", "4", 60))); // 다른 운동 뒤에 다시 나와도 싣지 않는다
        assertEquals(2, v.remaining.size());
        assertEquals("a2", v.remaining.get(0).get(0).setId);
        assertEquals(65, v.remaining.get(1).get(0).weight, 0.001);
        assertEquals("로우", v.nextName);
        assertFalse(v.remainingCut);
    }

    @Test
    public void 슈퍼세트는_묶음_멤버를_한_줄에() throws Exception {
        LockView v = view(false,
                st(m("a1", "A", "벤치", "1", 60), m("b1", "B", "로우", "1", 40)),
                st(m("a2", "A", "벤치", "2", 60), m("b2", "B", "로우", "2", 40)));
        assertEquals(1, v.remaining.size());
        assertEquals(2, v.remaining.get(0).size());
        assertNull(v.nextName);
    }

    @Test
    public void 마지막_세트면_표는_비고_잘린_스냅샷은_표시한다() throws Exception {
        LockView last = view(false, st(m("a3", "A", "벤치", "3", 60)), st(m("b1", "B", "로우", "1", 40)));
        assertTrue(last.remaining.isEmpty());
        LockView cut = view(true, st(m("a1", "A", "벤치", "1", 60)), st(m("a2", "A", "벤치", "2", 60)));
        assertTrue(cut.remainingCut);
    }

    @Test
    public void 높이_맞춤_다_들어가면_전부_넘치면_접고_머리만_들어가면_감춘다() {
        assertEquals(0, LockRemainingView.fit(10, 0)); // 남은 세트 없음
        assertEquals(3, LockRemainingView.fit(4, 3)); // 머리 + 3줄
        assertEquals(3, LockRemainingView.fit(9, 3));
        assertEquals(3, LockRemainingView.fit(4, 5)); // 머리(「… · +2세트 더」) + 3줄
        assertEquals(2, LockRemainingView.fit(3, 5)); // 작은 화면 — 머리 + 2줄
        assertEquals(1, LockRemainingView.fit(2, 5)); // 머리 + 1줄
        assertEquals(0, LockRemainingView.fit(1, 5)); // 머리만 들어감 → 감춤
        assertEquals(1, LockRemainingView.fit(2, 1)); // 하나 남았고 들어가면 보인다
        assertEquals(0, LockRemainingView.fit(1, 1));
        assertTrue(LockRemainingView.showsNext(5, 3, true));
        assertFalse(LockRemainingView.showsNext(4, 3, true)); // 자리가 없으면 「다음」은 뺀다
        assertFalse(LockRemainingView.showsNext(9, 3, false));
    }
}
