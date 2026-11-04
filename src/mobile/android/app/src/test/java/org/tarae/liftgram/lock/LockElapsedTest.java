package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.junit.Test;

/** 잠금 운동 화면 C안의 순수 규칙(SPEC-021). 운동 시간 정답은 LockRulesFixtureTest 가 core 와 같은 파일로 본다. */
public class LockElapsedTest {
    @Test
    public void 깨진_시각은_숨긴다() throws Exception {
        assertNull(LockRules.elapsedSec(null, false, 1000));
        assertNull(LockRules.elapsedSec(new JSONObject(), false, 1000));
        assertNull(LockRules.elapsedSec(new JSONObject("{\"startedAt\":\"x\"}"), false, 1000));
    }

    @Test
    public void 시계_형식은_앱과_같다() {
        assertEquals("0:00", LockRules.clockText(0));
        assertEquals("42:18", LockRules.clockText(42 * 60 + 18));
        assertEquals("59:59", LockRules.clockText(3599));
        assertEquals("1:00:00", LockRules.clockText(3600));
        assertEquals("1:02:18", LockRules.clockText(3738));
    }

    @Test
    public void 링_비율은_0에서_1_사이() {
        assertEquals(1f, LockRules.restFraction(50, null), 0f);
        assertEquals(1f, LockRules.restFraction(50, 0L), 0f);
        assertEquals(0.5f, LockRules.restFraction(45, 90L), 0.001f);
        assertEquals(1f, LockRules.restFraction(120, 90L), 0f);
        assertEquals(0f, LockRules.restFraction(0, 90L), 0f);
    }

    @Test
    public void 모르는_테마는_system() {
        assertEquals("light", LockRules.normalizeTheme("light"));
        assertEquals("dark", LockRules.normalizeTheme("dark"));
        assertEquals("system", LockRules.normalizeTheme("system"));
        assertEquals("system", LockRules.normalizeTheme("blue"));
        assertEquals("system", LockRules.normalizeTheme(null));
    }
}
