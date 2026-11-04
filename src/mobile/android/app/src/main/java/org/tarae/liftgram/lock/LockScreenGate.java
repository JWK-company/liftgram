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
 * 둘 다 전체 화면 알림(FSI · 채널 workout_fullscreen)으로 LockWorkoutActivity 를 띄운다.
 * [개선] SPEC-020 · ADR-049: 운동 중 포그라운드 서비스(WorkoutService)가 프로세스를 살려 방송이 제때 오고,
 * 「다른 앱 위에 표시」 허용이면 화면 꺼짐·휴식 끝에 직접 시작한다(BAL 예외).
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
        // 운동 서비스를 맞춘다 — 끄면 멈추고(카드는 남김) · 켜면 앱이 앞일 때 시작(SPEC-020 §4)
        LockHub.refreshAsync(ctx);
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
                        LockDiag.add(app, "잠금 해제됨" + (LockWorkoutActivity.isAlive() ? " → 운동 화면 닫음" : ""));
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
            LockDiag.add(app, "앱 프로세스 시작 · 화면 방송 등록"); // 프로세스가 죽었다 살았는지 보인다(REV-017 잠금 M-9)
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
        onScreenOff(ctx, wasForeground, false);
    }

    /** retry: 자동 잠금이 늦게 걸리는 기기(삼성 「화면 꺼진 후 n초 뒤 잠금」 · Smart Lock)에서 6초 뒤 한 번 더 본다(REV-017 잠금 H-2) */
    static void onScreenOff(Context ctx, boolean wasForeground, boolean retry) {
        try {
            LockView v = view(ctx);
            boolean ov = overlay(ctx);
            boolean inter = interactive(ctx);
            boolean lk = locked(ctx);
            boolean alive = LockWorkoutActivity.isAlive();
            if (v.active) {
                LockDiag.add(ctx, "화면 꺼짐" + (retry ? "(다시 봄)" : "") + " · 앞=" + yn(wasForeground) + " 켜짐=" + yn(inter) + " 잠김=" + yn(lk)
                        + " 다른앱위=" + yn(ov) + " 전체화면=" + yn(fullScreenAllowed(ctx)) + " 떠있음=" + yn(alive));
            }
            if (!shouldShow(enabled(ctx), v.active, v.paused, inter, lk, LockWorkoutActivity.isVisible())) {
                if (v.active) LockDiag.add(ctx, "→ 띄우지 않음(" + (!enabled(ctx) ? "설정 꺼짐" : v.paused ? "일시정지" : inter && !lk ? "화면 켜짐·안 잠김" : "이미 보임") + ")");
                return;
            }
            // 화면은 꺼졌는데 아직 잠금이 안 걸렸다 — 지금 띄우면 잠금 풀린 화면 위에 떴다가 닫히며 깜빡인다 → 6초 뒤 다시(한 번)
            if (!lk) {
                if (retry) {
                    LockDiag.add(ctx, "→ 잠금이 안 걸림 — 띄우지 않음");
                    return;
                }
                final Context app = ctx.getApplicationContext();
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                        () -> BG.execute(() -> onScreenOff(app, wasForeground, true)), LOCK_DELAY_RECHECK_MS);
                LockDiag.add(ctx, "→ 잠금 대기(6초 뒤 다시)");
                return;
            }
            // [원본] if (wasForeground && !LockWorkoutActivity.isAlive()) {
            // [개선] 「다른 앱 위에 표시」 허용이면 앱이 뒤에 있어도 직접 시작(BAL 예외 · SPEC-020 §3).
            //   허용 없이 앞이었던 길은 「시도는 하되 막힐 수 있다」(화면이 잠들면 TOP_SLEEPING · REV-016 플랫폼 H-2) — 막혀도 예외가 없어
            //   화면이 켜질 때 onScreenOn 의 FSI 가 대신한다.
            // [원본] if (directStart(wasForeground, ov, alive)) {
            // [개선] 살아 있어도 다른 앱에 가려져 멈춘 화면이면 다시 앞으로 올린다(이미 있으면 singleTask 라 onNewIntent 만 온다).
            if (alive && inCall(ctx)) {
                LockDiag.add(ctx, "→ 통화 중 — 떠 있는 운동 화면을 올리지 않음"); // 통화 중 근접 센서로 화면이 꺼져도 통화를 덮지 않게
            } else if (directStart(wasForeground, ov, LockWorkoutActivity.isVisible())) {
                requestStart(ctx, false, "화면 꺼짐" + (alive ? "(떠 있는 화면 다시 올림)" : ""), false);
            } else {
                LockDiag.add(ctx, "→ 직접 시작 안 함(다른 앱 위 허용 없음 · 뒤에 있었음) — 켤 때 전체 화면 알림");
            }
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "화면 꺼짐 처리 실패", e);
        }
    }

    static final long LOCK_DELAY_RECHECK_MS = 6_000L;
    static final long START_CHECK_MS = 1_500L;
    /** 화면이 켜진 뒤 운동 화면의 onResume 을 기다리는 시간 — 이 뒤에도 안 보이면 가려진 것으로 본다 */
    static final long SCREEN_ON_RESUME_WAIT_MS = 800L;
    /** 직접 시작을 요청한 시각(elapsedRealtime) — onScreenOn 이 그 직후엔 FSI 를 서두르지 않는다(REV-017 잠금 L-12) */
    private static volatile long lastStartRequestAt;

    private static String yn(boolean b) {
        return b ? "예" : "아니오";
    }

    /**
     * 직접 시작을 요청하고 1.5초 뒤 「요청 뒤 한 번이라도 만들어졌나」로 판정해 진단에 남긴다(BAL 은 막혀도 예외가 없다 · REV-017 잠금 H-1·H-3).
     * fsiFallback: 안 열렸거나(막힘) wake 인데 화면이 안 켜졌으면 — 그때도 띄울 조건이면 FSI 로 넘긴다(M-6).
     */
    private static void requestStart(Context ctx, boolean wake, String what, boolean fsiFallback) {
        final Context app = ctx.getApplicationContext();
        final long at = android.os.SystemClock.elapsedRealtime();
        lastStartRequestAt = at;
        try {
            ctx.startActivity(LockWorkoutActivity.intent(ctx, wake).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            LockDiag.add(ctx, "→ " + what + " 직접 시작 실패: " + e.getClass().getSimpleName());
            if (fsiFallback) postIfStill(app, wake);
            return;
        }
        LockDiag.add(ctx, "→ " + what + " 직접 시작 요청" + (wake ? "(화면 켜기)" : ""));
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> BG.execute(() -> {
            boolean opened = LockWorkoutActivity.createdSince(at) || LockWorkoutActivity.newIntentSince(at);
            boolean screenOn = interactive(app);
            LockDiag.add(app, "→ " + what + " " + (opened ? "열림 확인" : "안 열림(막힘)") + (wake ? (screenOn ? " · 화면 켜짐" : " · 화면 안 켜짐") : ""));
            if (fsiFallback && (!opened || (wake && !screenOn))) postIfStill(app, wake);
        }), START_CHECK_MS);
    }

    /** 대체 FSI — 그새 운동이 끝났거나 잠금이 풀렸으면 쏘지 않는다(REV-017 잠금 H-1) */
    private static void postIfStill(Context app, boolean wake) {
        try {
            LockView v = view(app);
            if (!shouldShow(enabled(app), v.active, v.paused, interactive(app), locked(app), LockWorkoutActivity.isVisible())) return;
            if (!wake && !interactive(app)) return; // 화면을 켜려는 요청이 아니면 꺼진 화면에 FSI 를 쏘지 않는다(REV-015 H-1)
            post(app, v, wake);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "대체 FSI 실패", e);
        }
    }

    /**
     * 직접 시작해도 되나(순수 · JUnit) — 지금 보이지 않고, 앱을 보고 있었거나 「다른 앱 위에 표시」 허용(SPEC-020 §3).
     * [원본] 셋째 인자는 alive(isAlive)였다 — 다른 앱에 가려져 멈춘 화면도 alive 라, 그 뒤로 잠금화면에 다시 뜨지 않았다.
     */
    public static boolean directStart(boolean wasForeground, boolean overlay, boolean visible) {
        return !visible && (wasForeground || overlay);
    }

    /** 통화 중인가 — 가려진 운동 화면을 통화 위로 올리지 않는다 */
    private static boolean inCall(Context ctx) {
        android.media.AudioManager am = ctx.getSystemService(android.media.AudioManager.class);
        return am != null && am.getMode() != android.media.AudioManager.MODE_NORMAL;
    }

    /** 「다른 앱 위에 표시」 허용(SYSTEM_ALERT_WINDOW) — 백그라운드 액티비티 시작 예외 */
    public static boolean overlay(Context ctx) {
        return Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(ctx);
    }

    /** 화면이 켜졌다 — 잠겨 있고 운동 화면이 없으면 FSI 로 띄운다(이미 켜진 화면이라 깨움 문제가 없다). */
    static void onScreenOn(Context ctx) {
        try {
            LockView v = view(ctx);
            if (!v.active) return;
            if (!locked(ctx)) {
                LockDiag.add(ctx, "화면 켜짐 · 안 잠김 — 할 일 없음");
                return;
            }
            // 방금 직접 시작을 요청했다 — 만들어지는 중일 수 있어 잠깐 기다린다(FSI 가 겹치지 않게 · L-12)
            long since = android.os.SystemClock.elapsedRealtime() - lastStartRequestAt;
            if (since < 3_000L && !LockWorkoutActivity.isAlive()) Thread.sleep(Math.max(0, 1_000L - since)); // BG 전용 스레드
            // [원본] if (LockWorkoutActivity.isAlive()) { LockDiag.add(ctx, "화면 켜짐 · 운동 화면 떠 있음"); return; }
            // [개선] 살아 있다고 보이는 것은 아니다 — onResume 이 올 시간을 준 뒤에도 안 보이면 가려진 것이니 다시 올린다.
            if (LockWorkoutActivity.isAlive()) {
                if (!LockWorkoutActivity.isVisible()) Thread.sleep(SCREEN_ON_RESUME_WAIT_MS); // BG 전용 스레드
                if (LockWorkoutActivity.isVisible()) {
                    LockDiag.add(ctx, "화면 켜짐 · 운동 화면 보임");
                    return;
                }
                // sleep 사이에 바뀌었을 수 있다 — 다시 읽는다. 그새 화면이 꺼졌으면 FSI 가 화면을 다시 켜므로 쏘지 않는다(REV-015 H-1). 통화는 덮지 않는다.
                v = view(ctx);
                if (!interactive(ctx) || inCall(ctx) || !locked(ctx) || !shouldShow(enabled(ctx), v.active, v.paused, true, true, false)) {
                    LockDiag.add(ctx, "화면 켜짐 · 운동 화면 가려짐 · 띄우지 않음");
                    return;
                }
                if (overlay(ctx)) {
                    requestStart(ctx, false, "화면 켜짐(가려진 화면 올림)", true);
                } else {
                    LockDiag.add(ctx, "화면 켜짐 · 운동 화면 가려짐 → 전체 화면 알림" + (fullScreenAllowed(ctx) ? "" : "(허용 안 됨 — 못 띄움)"));
                    post(ctx, v, false);
                }
                return;
            }
            if (!shouldShow(enabled(ctx), v.active, v.paused, interactive(ctx), true, false)) {
                LockDiag.add(ctx, "화면 켜짐 · 띄우지 않음(" + (!enabled(ctx) ? "설정 꺼짐" : "일시정지") + ")");
                return;
            }
            LockDiag.add(ctx, "화면 켜짐 · 운동 화면 없음 → 전체 화면 알림" + (fullScreenAllowed(ctx) ? "" : "(허용 안 됨 — 못 띄움)"));
            post(ctx, v, false);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "화면 켜짐 처리 실패", e);
        }
    }

    /** 휴식 끝 — 실제로 울릴 때 RestAlarm 이 부른다. 잠겼거나 꺼져 있을 때만 화면을 켜서 띄운다(#11). 소리는 RestAlarm 이 낸다. */
    static void onRestDone(Context ctx, LockView v) {
        try {
            if (!shouldShow(enabled(ctx), v.active, v.paused, interactive(ctx), locked(ctx), LockWorkoutActivity.isVisible())) return;
            // [원본] post(ctx, v, true);
            // [개선] SPEC-020 · REV-016 플랫폼 H-3·M-4 — 화면이 꺼져 있고 FSI 가 허용되면 FSI(SystemUI 가 화면을 켠다 · 화면 켜기 제약 없음).
            //   아니면 「다른 앱 위에 표시」 허용으로 직접 시작(wake) → 막혀도 예외가 없으니 1.5초 뒤 떠 있는지 보고 FSI 로.
            Route r = restRoute(interactive(ctx), fullScreenAllowed(ctx), overlay(ctx));
            LockDiag.add(ctx, "휴식 끝 · " + (r == Route.DIRECT ? "직접 시작" : fullScreenAllowed(ctx) ? "전체 화면 알림" : "허용 없음 — 카드만"));
            if (r == Route.DIRECT) {
                requestStart(ctx, true, "휴식 끝", true);
                return;
            }
            post(ctx, v, true);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "휴식 끝 화면 실패", e);
        }
    }

    /** 휴식 끝에 무엇으로 띄우나 */
    enum Route { FSI, DIRECT }

    /** 순수(JUnit) — 꺼진 화면 + FSI 허용 → FSI · 아니면 다른 앱 위 허용 → 직접 시작(확인 뒤 FSI) · 둘 다 없으면 FSI(카드만이라도) */
    public static Route restRoute(boolean interactive, boolean fullScreen, boolean overlay) {
        if (!interactive && fullScreen) return Route.FSI;
        return overlay ? Route.DIRECT : Route.FSI;
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
            LockDiag.add(ctx, "전체 화면 알림 허용 안 됨 — 카드만");
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
            LockDiag.add(ctx, "전체 화면 알림 실패: 알림 권한 없음");
        }
    }

    static void cancel(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(ID);
    }
}
