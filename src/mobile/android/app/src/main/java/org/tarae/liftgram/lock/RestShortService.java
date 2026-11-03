package org.tarae.liftgram.lock;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * 정확 알람 권한이 없을 때 3분 미만 휴식의 끝 시각을 지키는 짧은 포그라운드 서비스(foregroundServiceType=shortService · API 34+).
 * 카드 알림 자체를 포그라운드 알림으로 쓴다(카드가 두 장 생기지 않게). ADR-046: 카드는 포그라운드 서비스 없음 · 이 3분 이하 예외만.
 *
 * 크래시 방지(REV-007 플랫폼 H-1): startForegroundService 로 시작된 서비스는 startForeground 전에 멈추면 앱이 죽는다 →
 * onStartCommand 는 무엇보다 먼저 startForeground 를 부르고, 밖에서는 stopService 대신 ACTION_STOP 을 보내 서비스 안에서 정리한다.
 */
public class RestShortService extends Service {
    static final String EXTRA_ENDS_AT = "endsAt";
    static final String ACTION_STOP = "org.tarae.liftgram.lock.STOP_REST_SERVICE";
    private static volatile boolean running;
    private static volatile long firstStartedAt;
    private static volatile long runningEndsAt;
    private final Handler h = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock lock;

    /** 지금 도나 — 운동 서비스가 같은 카드 id 로 시작하기 전에 이것이 끝나기를 기다린다(SPEC-020 · REV-016 플랫폼 H-5) */
    static boolean isRunning() {
        return running;
    }

    /** 시작을 요청한 시각 — onStartCommand 전에도 「곧 돈다」로 본다(REV-017 서비스 M-1) */
    private static volatile long requestedAt;

    static boolean isRunningOrRequested() {
        return running || android.os.SystemClock.elapsedRealtime() - requestedAt < 10_000L;
    }

    static void start(Context ctx, long endsAt) {
        if (Build.VERSION.SDK_INT < 34) return; // shortService 는 Android 14+
        // 다시 시작해도 3분 타임아웃은 처음부터가 아닐 수 있다 — 처음 시작 + 170초를 넘는 끝이면 느슨한 알람에 맡긴다(M-1)
        if (running && endsAt > firstStartedAt + RestAlarm.SHORT_SERVICE_MAX_MS) {
            stop(ctx);
            return;
        }
        if (running && endsAt == runningEndsAt) return; // 같은 휴식 — 다시 시작하지 않는다(refresh 되풀이 방지)
        requestedAt = android.os.SystemClock.elapsedRealtime();
        LockHub.onMain(() -> {
            try {
                ctx.startForegroundService(new Intent(ctx, RestShortService.class).putExtra(EXTRA_ENDS_AT, endsAt));
            } catch (RuntimeException e) {
                // 백그라운드 시작 금지 등 — 느슨한 알람이 대신한다
                requestedAt = 0;
                android.util.Log.w("LiftgramLock", "shortService 시작 실패", e);
            }
        });
    }

    /** 돌고 있을 때만 — 안에서 startForeground → 정리 → stopSelf 순서로 끝낸다. */
    static void stop(Context ctx) {
        if (!running || Build.VERSION.SDK_INT < 34) return;
        LockHub.onMain(() -> {
            try {
                ctx.startService(new Intent(ctx, RestShortService.class).setAction(ACTION_STOP));
            } catch (RuntimeException ignored) {
                // 이미 끝남
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // ① 무조건 먼저 포그라운드로(최소 알림이라도) — 그 뒤에 무엇이 던져도 크래시가 아니다
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // 마지막으로 그린 카드를 그대로(없으면 최소 카드) — 메인 스레드에서 저장소를 기다리지 않는다
                android.app.Notification n = WorkoutNotification.last();
                if (n == null) n = WorkoutNotification.build(this, new LockView());
                startForeground(WorkoutNotification.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            }
        } catch (RuntimeException e) {
            android.util.Log.w("LiftgramLock", "startForeground 실패", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) firstStartedAt = System.currentTimeMillis();
        running = true;
        requestedAt = 0;
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            finish();
            return START_NOT_STICKY;
        }
        long endsAt = intent.getLongExtra(EXTRA_ENDS_AT, 0);
        runningEndsAt = endsAt;
        // ② 실제 카드로 바꿔 그린다(같은 알림 id)
        LockHub.refreshAsync(this);
        long wait = Math.max(0, endsAt - System.currentTimeMillis());
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            if (lock == null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "liftgram:rest");
                lock.setReferenceCounted(false);
            }
            lock.acquire(wait + 10_000L); // 다시 시작하면 시간을 새로 잡는다(M-1)
        }
        h.removeCallbacksAndMessages(null);
        h.postDelayed(() -> new Thread(() -> {
            try {
                RestAlarm.onRestDone(this);
            } catch (Exception e) {
                android.util.Log.w("LiftgramLock", "휴식 끝 처리 실패", e);
            }
            h.post(this::finish);
        }).start(), wait);
        return START_NOT_STICKY;
    }

    private void finish() {
        running = false; // stopSelf ~ onDestroy 사이에 stop 이 새 서비스를 띄우지 않게(REV-017 서비스 L-9)
        requestedAt = 0;
        h.removeCallbacksAndMessages(null);
        stopForeground(STOP_FOREGROUND_DETACH);
        stopSelf();
    }

    /** shortService 시간 초과(3분) — 곧바로 끝낸다(안 끝내면 ANR). 느슨한 알람이 남아 있다. */
    @Override
    public void onTimeout(int startId) {
        finish();
    }

    @Override
    public void onDestroy() {
        running = false;
        runningEndsAt = 0;
        h.removeCallbacksAndMessages(null);
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        // 카드는 남긴다(DETACH) — 지금 상태로 다시 맞춘다
        LockHub.refreshAsync(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
