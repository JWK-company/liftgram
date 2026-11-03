package org.tarae.liftgram.lock;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 앱 프로세스에 하나뿐인 잠금 카드 저장소(SharedPreferences `liftgram_lock` · commit) — 플러그인·리시버·알람·서비스가 같은 것을 쓴다.
 * 이 파일은 백업에서 뺀다(`res/xml/backup_rules.xml` · `res/xml/data_extraction_rules.xml`) — 복원된 기기에서 옛 storeId·대기열이 살아나지 않게(§6).
 */
public final class LockHub {
    public static final String PREFS = "liftgram_lock";
    private static volatile LockStore store;
    /** 그리기 전용 직렬 스레드 — 메인 스레드가 저장소(commit)를 기다리지 않게(REV-007 플랫폼 L-5) */
    private static final ExecutorService RENDER = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "liftgram-lock-render");
        t.setDaemon(true);
        return t;
    });

    private LockHub() {}

    public static LockStore store(Context ctx) {
        LockStore s = store;
        if (s != null) return s;
        synchronized (LockHub.class) {
            if (store == null) {
                final SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                store = new LockStore(new LockStore.Persist() {
                    @Override
                    public String load() {
                        return p.getString("state", null);
                    }

                    @android.annotation.SuppressLint("ApplySharedPref") // 일부러 commit — 버튼 직후 프로세스가 죽어도 조작이 디스크에
                    @Override
                    public boolean save(String json) {
                        return p.edit().putString("state", json).commit();
                    }
                });
            }
            return store;
        }
    }

    /** 알림·알람을 지금 상태로 다시 맞춘다(호출한 스레드에서 · 저장소 실행기 안에서 상태를 복사해 그린다). */
    public static void refresh(Context ctx) {
        try {
            LockView v = store(ctx).read(s -> LockView.of(s, System.currentTimeMillis()));
            WorkoutNotification.render(ctx, v);
            RestAlarm.schedule(ctx, v);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "refresh 실패", e);
        }
    }

    /** 기다리지 않고 다시 맞춘다(메인 스레드용). 서비스 시작은 메인 스레드로 넘긴다. */
    public static void refreshAsync(Context ctx) {
        final Context app = ctx.getApplicationContext();
        RENDER.execute(() -> refresh(app));
    }

    static void onMain(Runnable r) {
        new Handler(Looper.getMainLooper()).post(r);
    }
}
