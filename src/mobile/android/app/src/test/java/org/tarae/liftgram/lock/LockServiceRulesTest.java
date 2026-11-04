package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.junit.Test;

/** 운동 중 포그라운드 서비스 · 휴식 시각 경로 · 직접 시작 판정(SPEC-020 · REV-016) — 순수 함수 표. */
public class LockServiceRulesTest {
    @Test
    public void 서비스_켜기_조건() {
        assertTrue(WorkoutService.shouldRun(true, true));
        assertFalse("설정 꺼짐", WorkoutService.shouldRun(true, false));
        assertFalse("운동 없음", WorkoutService.shouldRun(false, true));
        assertFalse(WorkoutService.shouldRun(false, false));
        // want, running, pending, foreground, blocked
        assertTrue(WorkoutService.shouldStart(true, false, false, true, false));
        assertFalse("이미 돎", WorkoutService.shouldStart(true, true, false, true, false));
        assertFalse("요청 중", WorkoutService.shouldStart(true, false, true, true, false));
        assertFalse("뒤에 있음 — 백그라운드 FGS 시작 금지", WorkoutService.shouldStart(true, false, false, false, false));
        assertFalse("시스템이 끝냄 — 앱이 앞에 올 때까지", WorkoutService.shouldStart(true, false, false, true, true));
        assertFalse(WorkoutService.shouldStart(false, false, false, true, false));
        assertTrue("운동 끝 — 카드도", WorkoutService.removeCardOnStop(false));
        assertFalse("설정만 끔 — 카드는 남김", WorkoutService.removeCardOnStop(true));
    }

    @Test
    public void 휴식_시각_경로_표() {
        long m = 60_000L;
        // canExact, serviceRunning, sdk, remain, foreground
        assertEquals(RestAlarm.Route.EXACT, RestAlarm.route(true, true, 34, 5 * m, false));
        assertEquals(RestAlarm.Route.SERVICE, RestAlarm.route(false, true, 34, 5 * m, false));
        assertEquals("앞이면 웹이 맡음", RestAlarm.Route.LOOSE, RestAlarm.route(false, true, 34, 5 * m, true));
        assertEquals("정확히 15분", RestAlarm.Route.SERVICE, RestAlarm.route(false, true, 34, WorkoutService.REST_MAX_MS, false));
        assertEquals("15분 초과", RestAlarm.Route.LOOSE, RestAlarm.route(false, true, 34, WorkoutService.REST_MAX_MS + 1, false));
        assertEquals("지난 끝 시각은 다시 잡지 않음", RestAlarm.Route.LOOSE, RestAlarm.route(false, true, 34, 0, false));
        assertEquals(RestAlarm.Route.SERVICE, RestAlarm.route(false, true, 29, 30_000L, false));
        assertEquals(RestAlarm.Route.SHORT, RestAlarm.route(false, false, 34, RestAlarm.SHORT_SERVICE_MAX_MS - 1, false));
        assertEquals("170초", RestAlarm.Route.LOOSE, RestAlarm.route(false, false, 34, RestAlarm.SHORT_SERVICE_MAX_MS, false));
        assertEquals("앞에 있음", RestAlarm.Route.LOOSE, RestAlarm.route(false, false, 34, 60_000L, true));
        assertEquals("33 이하 shortService 없음", RestAlarm.Route.LOOSE, RestAlarm.route(false, false, 33, 60_000L, false));
        assertEquals(RestAlarm.Route.EXACT, RestAlarm.route(true, false, 34, 60_000L, true));
        assertEquals("지남", RestAlarm.Route.LOOSE, RestAlarm.route(false, true, 34, -5_000L, false));
        assertEquals(RestAlarm.Route.LOOSE, RestAlarm.route(false, true, 29, WorkoutService.REST_MAX_MS + 1, false));
        assertEquals(RestAlarm.Route.LOOSE, RestAlarm.route(false, false, 34, 0, false));
    }

    @Test
    public void 직접_시작_판정() {
        // wasForeground, overlay, alive
        assertTrue(LockScreenGate.directStart(false, true, false));
        assertTrue(LockScreenGate.directStart(true, false, false));
        assertFalse(LockScreenGate.directStart(false, false, false));
        assertFalse("이미 보임", LockScreenGate.directStart(true, true, true));
        assertFalse(LockScreenGate.directStart(false, true, true));
        assertFalse(LockScreenGate.directStart(true, false, true));
        // 휴식 끝: interactive, fullScreen, overlay
        assertEquals(LockScreenGate.Route.FSI, LockScreenGate.restRoute(false, true, true));
        assertEquals(LockScreenGate.Route.DIRECT, LockScreenGate.restRoute(false, false, true));
        assertEquals(LockScreenGate.Route.DIRECT, LockScreenGate.restRoute(true, true, true));
        assertEquals(LockScreenGate.Route.FSI, LockScreenGate.restRoute(true, true, false));
        assertEquals(LockScreenGate.Route.FSI, LockScreenGate.restRoute(false, false, false));
        assertEquals(LockScreenGate.Route.DIRECT, LockScreenGate.restRoute(true, false, true));
        assertEquals(LockScreenGate.Route.FSI, LockScreenGate.restRoute(true, false, false));
    }

    @Test
    public void 진단_기록은_마지막_줄만() {
        JSONArray a = new JSONArray();
        for (int i = 0; i < 5; i++) a = LockDiag.trim(a, "l" + i, 3);
        assertEquals(3, a.length());
        assertEquals("l2", a.optString(0));
        assertEquals("l4", a.optString(2));
        assertEquals(1, LockDiag.trim(new JSONArray(), "x", 3).length());
        JSONArray one = LockDiag.trim(a, "y", 1);
        assertEquals(1, one.length());
        assertEquals("y", one.optString(0));
        // 이미 max 보다 긴 옛 기록(상한을 줄인 뒤) — 끝의 것만
        JSONArray two = LockDiag.trim(a, "z", 2);
        assertEquals(2, two.length());
        assertEquals("l4", two.optString(0));
    }
}
