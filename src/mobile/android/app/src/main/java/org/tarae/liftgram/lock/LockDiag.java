package org.tarae.liftgram.lock;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;

/**
 * 잠금 운동 화면 진단 기록(SPEC-020 · REV-016 플랫폼 H-1) — 화면 꺼짐·켜짐을 받은 시각 · 고른 길 · 결과 · 닫힌 이유를
 * 마지막 30줄만 남긴다(adb 없이 실기기에서 원인을 본다 · 프로필 「진단 기록」). 개인 정보(운동 이름·값)는 적지 않는다.
 */
public final class LockDiag {
    static final String PREFS = LockHub.PREFS + "_diag";
    static final int MAX = 30;
    private static final Object LOCK = new Object();

    private LockDiag() {}

    /** 쓰기 전용 스레드 — 메인 스레드(액티비티 onCreate 등)가 디스크를 기다리지 않게(REV-017 잠금 L-11) */
    private static final java.util.concurrent.ExecutorService W = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "liftgram-lock-diag");
        t.setDaemon(true);
        return t;
    });

    /** 줄 하나를 더한다(아무 스레드 · 쓰기는 전용 스레드에서) — 실패해도 조용히 */
    public static void add(Context ctx, String msg) {
        android.util.Log.i("LiftgramLock", msg);
        final Context app = ctx.getApplicationContext();
        final String stamp = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.ROOT).format(new Date());
        try {
            W.execute(() -> write(app, stamp + " " + msg));
        } catch (Exception ignored) {
            // 진단은 기능을 막지 않는다
        }
    }

    @android.annotation.SuppressLint("ApplySharedPref") // 전용 스레드라 commit — apply 는 onPause 의 QueuedWork 가 메인 스레드를 기다리게 한다
    private static void write(Context ctx, String line) {
        try {
            synchronized (LOCK) {
                SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                JSONArray a = new JSONArray(p.getString("lines", "[]"));
                JSONArray out = trim(a, line, MAX);
                p.edit().putString("lines", out.toString()).commit();
            }
        } catch (Exception ignored) {
            // 진단은 기능을 막지 않는다
        }
    }

    /** 순수(JUnit) — 끝에 붙이고 앞에서 잘라 max 줄만 */
    static JSONArray trim(JSONArray a, String line, int max) {
        JSONArray out = new JSONArray();
        int total = a.length() + 1;
        int skip = Math.max(0, total - max);
        for (int i = 0; i < a.length(); i++) {
            if (i >= skip) out.put(a.optString(i));
        }
        out.put(line);
        return out;
    }

    public static JSONArray lines(Context ctx) {
        try {
            synchronized (LOCK) {
                return new JSONArray(ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lines", "[]"));
            }
        } catch (Exception e) {
            return new JSONArray();
        }
    }
}
