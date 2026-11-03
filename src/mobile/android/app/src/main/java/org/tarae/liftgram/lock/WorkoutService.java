package org.tarae.liftgram.lock;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.lang.ref.WeakReference;

/**
 * 운동 중에만 도는 포그라운드 서비스(SPEC-020 · ADR-049 · foregroundServiceType=specialUse).
 * - 목적: 앱 프로세스가 cached(얼림)가 되지 않게 — 화면 꺼짐·켜짐 방송을 제때 받아 잠금화면 위 운동 화면을 띄운다.
 * - 포그라운드 알림 = 운동 카드(WorkoutNotification.ID) 그대로(카드가 두 장 생기지 않게).
 * - 휴식 끝 시각도 여기서 지킨다(정확 알람 권한이 없을 때 · 핸들러 + 시간 제한 PARTIAL_WAKE_LOCK · RestAlarm.route SERVICE).
 * 크래시 방지(RestShortService 와 같은 순서): onStartCommand 는 무엇보다 먼저 startForeground — 밖에서 멈출 때는 돌고 있는 인스턴스에만.
 */
public class WorkoutService extends Service {
    /** 서비스가 지키는 휴식 상한 — 이보다 길면 느슨한 알람에 맡기고, 「끝−15분」에 다시 맞춘다(wake lock 을 오래 쥐지 않게) */
    static final long REST_MAX_MS = 15 * 60_000L;
    private static volatile WeakReference<WorkoutService> instance = new WeakReference<>(null);
    /** 시작을 요청했고 아직 onStartCommand 전 — 같은 요청을 되풀이하지 않는다 */
    private static volatile boolean starting;
    /** 시작을 요청한 시각(elapsedRealtime) — 10초 넘게 응답이 없으면 다시 시도한다(요청이 사라진 경우) */
    private static volatile long startingAt;
    /** 지금 돌아야 하나 — sync 가 늘 기록한다. 시작 요청과 onStartCommand 사이의 멈춤을 잃지 않게(REV-016 수명 H-1) */
    private static volatile boolean desired;
    /** 마지막으로 본 「운동 중」 — handleOnStart 가 저장소를 읽지 않고 바로 시작할 때 쓴다(REV-016 수명 M-9) */
    private static volatile boolean lastActive;
    /** 시스템이 끝냈다(시간 초과·예기치 않은 종료) — 다음에 앱이 앞에 올 때까지 다시 시작하지 않는다(되풀이 고리 방지 · H-3) */
    private static volatile boolean blocked;
    private final Handler h = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock lock;
    private long restEndsAt;
    private volatile boolean foregroundDone;
    private volatile boolean finishing;

    /** 켜기 조건(순수 · JUnit) — 운동 중이고 잠금 운동 화면 설정이 켜져 있다(일시정지 중에도 돈다 — 이어 할 때 방송을 받아야). */
    public static boolean shouldRun(boolean active, boolean lockScreenEnabled) {
        return active && lockScreenEnabled;
    }

    /** 시작 요청을 보내나(순수 · JUnit) — 돌아야 하고 · 안 돌고 · 요청 중 아님 · 앱이 앞 · 막히지 않음 */
    public static boolean shouldStart(boolean want, boolean running, boolean pending, boolean foreground, boolean blocked) {
        return want && !running && !pending && foreground && !blocked;
    }

    /** 멈출 때 카드를 지우나(순수 · JUnit) — 운동이 끝났을 때만(설정만 끄면 카드는 남긴다 · 새 운동이 이미 시작됐으면 남긴다 · M-5) */
    public static boolean removeCardOnStop(boolean active) {
        return !active;
    }

    /** 돌고 있거나 시작을 요청해 둔 상태(10초 안) — 휴식 경로가 shortService 를 함께 켜지 않게(REV-017 서비스 M-1) */
    static boolean isRunningOrStarting() {
        return isRunning() || (starting && android.os.SystemClock.elapsedRealtime() - startingAt < 10_000L);
    }

    /** 지금 돌고 있나(startForeground 를 마친 인스턴스가 있나) */
    public static boolean isRunning() {
        WorkoutService s = instance.get();
        return s != null && s.foregroundDone && !s.finishing;
    }

    /** 상태에 맞춘다 — LockHub.refresh 가 그린 뒤 부른다(아무 스레드). 시작은 앱이 앞일 때만(백그라운드 FGS 시작 금지). 멈춤 진입점도 이것 하나(M-4). */
    static void sync(Context ctx, LockView v) {
        boolean want = shouldRun(v.active, LockScreenGate.enabled(ctx));
        desired = want;
        lastActive = v.active;
        if (want) {
            boolean pending = starting && android.os.SystemClock.elapsedRealtime() - startingAt < 10_000L;
            if (!shouldStart(true, isRunning(), pending, LiftgramLockPlugin.isForeground(), blocked)) return;
            // 짧은 휴식 서비스가 같은 카드 id 를 쥐고 있다 — 먼저 끝내고, 그 onDestroy 의 refresh 에서 시작한다(두 FGS 가 한 알림을 나눠 쥐면
            // 먼저 끝난 쪽의 DETACH 가 FGS 표시를 벗길 수 있다 · REV-016 플랫폼 H-5)
            if (RestShortService.isRunningOrRequested()) {
                RestShortService.stop(ctx);
                return;
            }
            start(ctx);
        } else {
            stop();
        }
    }

    /** 앱이 막 앞에 왔다(handleOnStart · 메인 스레드) — 막힘을 풀고, 마지막으로 본 운동이면 저장소를 기다리지 않고 바로 시작(M-9). */
    static void onAppForeground(Context ctx) {
        blocked = false;
        // desired 는 쓰지 않고 읽기만 — 렌더 스레드의 「운동 끝」과 겹쳐 끝난 운동에 서비스가 켜지지 않게(REV-017 서비스 L-5)
        if (desired && lastActive) {
            boolean pending = starting && android.os.SystemClock.elapsedRealtime() - startingAt < 10_000L;
            if (shouldStart(true, isRunning(), pending, true, false) && !RestShortService.isRunningOrRequested()) start(ctx);
        }
    }

    private static void start(Context ctx) {
        final Context app = ctx.getApplicationContext();
        starting = true;
        startingAt = android.os.SystemClock.elapsedRealtime();
        LockDiag.add(app, "서비스 시작 요청");
        LockHub.onMain(() -> {
            try {
                androidx.core.content.ContextCompat.startForegroundService(app, new Intent(app, WorkoutService.class));
            } catch (RuntimeException e) {
                // 백그라운드 시작 금지(ForegroundServiceStartNotAllowedException) 등 — 다음에 앱이 앞에 오면 다시
                starting = false;
                LockDiag.add(app, "서비스 시작 실패: " + e.getClass().getSimpleName());
            }
        });
    }

    /** 멈춘다 — 메인 스레드에서 그때의 상태로 카드를 지울지 정한다(M-5). startForeground 를 마친 인스턴스에만(크래시 방지). */
    private static void stop() {
        LockHub.onMain(() -> {
            WorkoutService s = instance.get();
            if (s != null && !desired) s.finish(removeCardOnStop(lastActive), false);
        });
    }

    /** 서비스가 휴식 끝 시각을 지킨다(RestAlarm.route SERVICE). 메인 스레드로 넘긴다 · 같은 끝 시각이면 그대로(M-6). */
    static void scheduleRest(long endsAt) {
        LockHub.onMain(() -> {
            WorkoutService s = instance.get();
            if (s != null && !s.finishing) s.armRest(endsAt);
        });
    }

    static void cancelRest() {
        LockHub.onMain(() -> {
            WorkoutService s = instance.get();
            if (s != null) s.disarmRest();
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // ① 무조건 먼저 포그라운드로 — 그 뒤에 무엇이 던져도 크래시가 아니다
        try {
            Notification n = WorkoutNotification.last();
            if (n == null) n = WorkoutNotification.build(this, new LockView());
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(WorkoutNotification.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(WorkoutNotification.ID, n);
            }
        } catch (RuntimeException e) {
            // 최소 카드로 한 번 더 — 포그라운드 없이 내려가면 시스템이 앱을 죽인다(REV-017 서비스 L-3)
            boolean ok = false;
            try {
                Notification m = WorkoutNotification.build(this, new LockView());
                if (Build.VERSION.SDK_INT >= 34) startForeground(WorkoutNotification.ID, m, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
                else startForeground(WorkoutNotification.ID, m);
                ok = true;
            } catch (RuntimeException e2) {
                android.util.Log.w("LiftgramLock", "운동 서비스 startForeground 실패", e2);
            }
            starting = false;
            LockDiag.add(this, "서비스 startForeground 실패: " + e.getClass().getSimpleName());
            if (ok) stopForeground(STOP_FOREGROUND_DETACH);
            stopSelf();
            LockHub.refreshAsync(this);
            return START_NOT_STICKY;
        }
        foregroundDone = true;
        instance = new WeakReference<>(this);
        starting = false;
        // 요청 사이에 운동이 끝났거나 설정을 껐다 — 바로 정리(H-1)
        if (!desired) {
            finish(removeCardOnStop(lastActive), false);
            return START_NOT_STICKY;
        }
        LockScreenGate.ensureRegistered(this);
        LockDiag.add(this, "서비스 켜짐");
        // ② 지금 상태로 다시 맞춘다 — 그새 운동이 끝났으면 여기서 멈추고, 휴식이면 타이머를 건다
        LockHub.refreshAsync(this);
        return START_NOT_STICKY;
    }

    private void armRest(long endsAt) {
        if (endsAt == restEndsAt && lock != null && lock.isHeld()) return; // 같은 휴식 — 다시 걸지 않는다
        disarmRest();
        long wait = Math.max(0, endsAt - System.currentTimeMillis());
        restEndsAt = endsAt;
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null) {
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "liftgram:workout-rest");
            lock.setReferenceCounted(false);
            lock.acquire(wait + 10_000L); // 시간 제한 — 무엇이 빠져도 저절로 풀린다
        }
        h.postDelayed(() -> {
            // 핸들러가 일찍 깨 「아직」이면 같은 끝 시각으로 다시 걸 수 있게 비운다(REV-017 서비스 L-2)
            restEndsAt = 0;
            final PowerManager.WakeLock held = lock;
            new Thread(() -> {
                try {
                    RestAlarm.onRestDone(getApplicationContext());
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "휴식 끝 처리 실패", e);
                }
                // onRestDone 이 다음 휴식을 걸었으면(새 lock) 그것은 두고, 이 휴식의 것만 푼다
                h.post(() -> {
                    if (lock == held) disarmRest();
                });
            }, "liftgram-workout-rest").start();
        }, wait);
    }

    private void disarmRest() {
        h.removeCallbacksAndMessages(null);
        restEndsAt = 0;
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
    }

    /** 끝낸다(두 번 불려도 안전 · L-11). bySystem: 시간 초과 — 다음에 앱이 앞에 올 때까지 다시 시작하지 않는다(H-3). */
    private void finish(boolean removeCard, boolean bySystem) {
        if (finishing) return;
        finishing = true;
        if (bySystem) blocked = true;
        LockDiag.add(this, "서비스 끝: " + (bySystem ? "시간 초과" : removeCard ? "운동 끝" : "설정 끔"));
        disarmRest();
        foregroundDone = false;
        if (instance.get() == this) instance = new WeakReference<>(null);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(removeCard ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH);
        else stopForeground(removeCard);
        stopSelf();
        // 늘 다시 그린다 — 남긴 카드는 보통 알림으로, 지운 사이 새 운동이 시작됐으면 그 카드를 다시(M-5) · 휴식 경로도 다시 고른다
        LockHub.refreshAsync(this);
    }

    /** 시간 초과(specialUse 에는 없지만 방어 · Android 15+) — 곧바로 끝낸다(안 끝내면 ANR). 카드는 남긴다. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        finish(false, true);
    }

    @Override
    public void onDestroy() {
        // 우리가 끝낸 것이 아니다(시스템이 서비스를 내림) — 되풀이 고리를 막고 휴식 경로를 다시 고른다
        if (!finishing) {
            blocked = true;
            LockDiag.add(this, "서비스 끝: 시스템");
            LockHub.refreshAsync(this);
        }
        finishing = true;
        disarmRest();
        foregroundDone = false;
        if (instance.get() == this) instance = new WeakReference<>(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
