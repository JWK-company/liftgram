package org.tarae.liftgram.lock;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.tarae.liftgram.R;

/**
 * 잠금화면 위 운동 화면을 띄우는 길(SPEC-019 §3 · ADR-048 · REV-014).
 * - 화면 꺼짐(앱이 살아 있을 때 동적 등록 — 오래 뒤에 있던 cached 앱은 늦게 받거나 못 받는다 · 알려진 한계)
 * - 휴식 끝(RestAlarm.onRestDone — 실제로 울릴 때)
 * 둘 다 전체 화면 알림(FSI · 채널 workout_fullscreen)으로 LockWorkoutActivity 를 띄운다. 포그라운드 서비스는 없다(ADR-046 유지).
 */
public final class LockScreenGate {
    static final String UI_PREFS = LockHub.PREFS + "_ui";
    static final String KEY_ENABLED = "lockScreen";
    public static final String CHANNEL = "workout_fullscreen";
    static final int ID = 2002;
    static final String EXTRA_WAKE = "wake";
    private static volatile boolean registered;
    private static final ExecutorService BG = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "liftgram-lock-gate");
        t.setDaemon(true);
        return t;
    });

    private LockScreenGate() {}

    /**
     * 켜기 조건(순수 · JUnit) — 설정 켜짐 · 카드 있음 · 일시정지 아님 · 잠겼거나 화면 꺼짐(REV-014 #21) · 이미 보이는 화면 아님.
     * 보이고 있으면(visible) 새로 띄우지 않는다 — 1초 틱이 다시 그린다(#1 반복 켜짐 방지).
     */
    public static boolean shouldShow(boolean enabled, boolean active, boolean paused, boolean interactive, boolean locked, boolean visible) {
        return enabled && active && !paused && (!interactive || locked) && !visible;
    }

    public static boolean enabled(Context ctx) {
        return ctx.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true);
    }

    public static void setEnabled(Context ctx, boolean on) {
        SharedPreferences p = ctx.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean(KEY_ENABLED, on).apply();
        if (!on) {
            cancel(ctx);
            LockWorkoutActivity.finishIfAlive();
        }
    }

    /** 화면 꺼짐·잠금 해제 방송을 한 번만 등록한다(앱 프로세스가 살아 있는 동안 · REV-014 #24). */
    public static void ensureRegistered(Context ctx) {
        if (registered) return;
        synchronized (LockScreenGate.class) {
            if (registered) return;
            final Context app = ctx.getApplicationContext();
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_SCREEN_OFF);
            f.addAction(Intent.ACTION_SCREEN_ON);
            f.addAction(Intent.ACTION_USER_PRESENT);
            BroadcastReceiver r = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    if (Intent.ACTION_USER_PRESENT.equals(i.getAction())) {
                        // 다른 길로 잠금을 풀었다 — 운동 화면은 할 일이 끝났다(#19).
                        // 미뤄 둔 옛 방송(cached 앱)일 수 있어 지금 잠겨 있으면 무시한다(REV-015 플랫폼 M-4)
                        if (locked(app)) return;
                        LockWorkoutActivity.finishIfAlive();
                        cancel(app);
                        return;
                    }
                    if (Intent.ACTION_SCREEN_ON.equals(i.getAction())) {
                        BG.execute(() -> onScreenOn(app));
                        return;
                    }
                    // 앞에 있었나 — onStop 이 화면 꺼짐 방송보다 먼저 올 수 있어 2초 안이면 앞으로 본다(M-3)
                    final boolean wasForeground = LiftgramLockPlugin.wasForegroundWithin(2000);
                    BG.execute(() -> onScreenOff(app, wasForeground));
                }
            };
            ContextCompat.registerReceiver(app, r, f, ContextCompat.RECEIVER_NOT_EXPORTED);
            registered = true;
        }
    }

    static boolean interactive(Context ctx) {
        PowerManager pm = ctx.getSystemService(PowerManager.class);
        return pm == null || pm.isInteractive();
    }

    static boolean locked(Context ctx) {
        KeyguardManager km = ctx.getSystemService(KeyguardManager.class);
        return km != null && km.isKeyguardLocked();
    }

    private static LockView view(Context ctx) throws Exception {
        return LockHub.store(ctx).read(s -> LockView.of(s, System.currentTimeMillis()));
    }

    /**
     * 화면이 꺼졌다 — 앱을 보고 있었으면 바로 띄워 둔다(#2). 아니면 아무것도 하지 않는다.
     * [원본] 막히면 FSI 를 게시했다 — 화면이 꺼진 기기에 FSI 를 쏘면 SystemUI 가 화면을 다시 켠다(REV-015 플랫폼 H-1).
     *   그래서 FSI 는 화면이 다시 켜졌을 때(onScreenOn · 잠금화면이 보이는 중)에 쏜다.
     */
    static void onScreenOff(Context ctx, boolean wasForeground) {
        try {
            LockView v = view(ctx);
            if (!shouldShow(enabled(ctx), v.active, v.paused, interactive(ctx), locked(ctx), LockWorkoutActivity.isVisible())) return;
            if (wasForeground && !LockWorkoutActivity.isAlive()) {
                try {
                    ctx.startActivity(LockWorkoutActivity.intent(ctx, false).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception e) {
                    android.util.Log.w("LiftgramLock", "운동 화면 직접 시작 실패 — 화면 켤 때 FSI 로", e);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "화면 꺼짐 처리 실패", e);
        }
    }

    /** 화면이 켜졌다 — 잠겨 있고 운동 화면이 없으면 FSI 로 띄운다(이미 켜진 화면이라 깨움 문제가 없다). */
    static void onScreenOn(Context ctx) {
        try {
            LockView v = view(ctx);
            if (!locked(ctx) || LockWorkoutActivity.isAlive()) return;
            if (!shouldShow(enabled(ctx), v.active, v.paused, interactive(ctx), true, false)) return;
            post(ctx, v, false);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "화면 켜짐 처리 실패", e);
        }
    }

    /** 휴식 끝 — 실제로 울릴 때 RestAlarm 이 부른다. 잠겼거나 꺼져 있을 때만 화면을 켜서 띄운다(#11). 소리는 RestAlarm 이 낸다. */
    static void onRestDone(Context ctx, LockView v) {
        try {
            if (!shouldShow(enabled(ctx), v.active, v.paused, interactive(ctx), locked(ctx), LockWorkoutActivity.isVisible())) return;
            post(ctx, v, true);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "휴식 끝 화면 실패", e);
        }
    }

    /** 전체 화면 알림을 쓸 수 있나 — 앱 알림 · 채널 중요도 HIGH 이상 · Android 14+ 허용(REV-014 #12). */
    public static boolean fullScreenAllowed(Context ctx) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            ensureChannel(ctx);
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL);
            if (ch != null && ch.getImportance() < NotificationManager.IMPORTANCE_HIGH) return false;
        }
        return Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, ctx.getString(R.string.lock_fullscreen_channel), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(ctx.getString(R.string.lock_fullscreen_channel_desc));
        // 소리·진동은 채널에서 끈다 — 알림에 setSilent 를 걸면 FSI 가 막히는 기기가 있다(#23). 휴식 끝 소리는 RestSound.
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    /** FSI 게시 — 지우고 다시(같은 id 갱신은 FSI 를 다시 쏘지 않는다) · 30초 뒤 저절로 사라짐(#25). */
    static void post(Context ctx, LockView v, boolean wake) {
        if (!fullScreenAllowed(ctx)) {
            android.util.Log.i("LiftgramLock", "전체 화면 알림 허용 안 됨 — 카드만");
            return;
        }
        Intent i = LockWorkoutActivity.intent(ctx, wake);
        PendingIntent pi = PendingIntent.getActivity(ctx, wake ? 21 : 20, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = v.title == null || v.title.isEmpty() ? ctx.getString(R.string.lock_title_fallback) : v.title;
        String text = v.members.isEmpty() ? "" : v.members.get(0).name + " · " + WorkoutNotification.setName(ctx, v.members.get(0));
        Notification n = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_workout)
                .setContentTitle(title)
                .setContentText(text)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setTimeoutAfter(30_000L)
                .build();
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            nm.cancel(ID);
            nm.notify(ID, n);
        } catch (SecurityException e) {
            android.util.Log.w("LiftgramLock", "알림 권한 없음", e);
        }
    }

    static void cancel(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(ID);
    }
}
