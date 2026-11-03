package org.tarae.liftgram.lock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Locale;
import org.tarae.liftgram.MainActivity;
import org.tarae.liftgram.R;

/**
 * 잠금화면 운동 카드 = 진행 중 알림(SPEC-017 §11 안드로이드).
 * - 채널 무음(IMPORTANCE_DEFAULT + 소리·진동 끔 — LOW 는 「무음 알림 숨기기」 잠금화면에서 빠진다 · REV-007 플랫폼 M-2) · VISIBILITY_PUBLIC
 * - 표준 스타일만(커스텀 레이아웃·colorized 없음) — Android 16 promoted(Live Update) 요청 · 상태 칩 글
 * - 표기는 웹 세션 화면과 같게(라벨·한쪽·유산소 시계·km · REV-007 표시 M-1·M-3·M-4)
 * - 밀어 지우면(Android 14+) 다음 상태 변화 때 다시 낸다(즉시 되살리지 않음 · 플랫폼 L-1)
 */
public final class WorkoutNotification {
    public static final String CHANNEL = "workout_v2";
    static final String OLD_CHANNEL = "workout"; // 1.1.0 개발판(IMPORTANCE_LOW) — 중요도는 코드로 못 올려 새 id 로
    public static final int ID = 7301;

    private WorkoutNotification() {}

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(OLD_CHANNEL) != null) nm.deleteNotificationChannel(OLD_CHANNEL);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, ctx.getString(R.string.lock_channel_name), NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(ctx.getString(R.string.lock_channel_desc));
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    /** 알림이 실제로 보이나 — 앱 알림 + 이 채널(사용자가 채널만 끈 경우 · 플랫폼 L-3). */
    public static boolean enabled(Context ctx) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < 26) return true;
        ensureChannel(ctx);
        NotificationChannel ch = ctx.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
        return ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static PendingIntent action(Context ctx, String act, int req, String token) {
        Intent i = new Intent(ctx, LockActionReceiver.class).setAction(act).setPackage(ctx.getPackageName());
        if (token != null) {
            // 단계 토큰은 data 로 구분한다 — extras 만 바꾸면 FLAG_UPDATE_CURRENT 가 옛 알림의 버튼에도 새 토큰을 실어 버린다(계약 H-1)
            i.setData(Uri.parse("liftgram-lock://complete/" + Uri.encode(token)));
            i.putExtra(LockActionReceiver.EXTRA_TOKEN, token);
        }
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String num(double d) {
        if (Math.abs(d - Math.rint(d)) < 1e-9) return String.valueOf((long) Math.rint(d));
        String s = String.format(Locale.ROOT, "%.2f", d);
        return s.replaceAll("0+$", "").replaceAll("\\.$", "");
    }

    /** 웹 formatDurationClock — MM:SS(1시간 넘으면 H:MM:SS) */
    static String clock(int sec) {
        int s = Math.max(0, sec), h = s / 3600, m = (s % 3600) / 60, ss = s % 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, ss) : String.format(Locale.ROOT, "%02d:%02d", m, ss);
    }

    /** 웹 formatDistanceKm — 늘 km · 소수 둘째 자리 · 뒤 0 정리 */
    static String km(double m) {
        return num(Math.round(m / 10.0) / 100.0) + "km";
    }

    /** 세트 이름 — 번호 세트는 「2/4세트」, 라벨 세트는 「워밍업」 등(웹 배지 W·D·F·T · 표시 M-1). */
    static String setName(Context ctx, LockView.Member m) {
        switch (m.label) {
            case "W": return ctx.getString(R.string.lock_label_warmup);
            case "D": return ctx.getString(R.string.lock_label_drop);
            case "F": return ctx.getString(R.string.lock_label_failure);
            case "T": return ctx.getString(R.string.lock_label_top);
            default: return ctx.getString(R.string.lock_set_of, m.label, m.setTotal);
        }
    }

    /** 한 멤버의 값 — 카드에 보인 값 = 저장될 값(웹이 시뮬레이션한 표시값을 그대로 쓴다). */
    static String valueLine(Context ctx, LockView.Member m) {
        StringBuilder b = new StringBuilder();
        if (m.weight != null) {
            b.append(num(m.weight)).append(m.unit);
            if (m.oneSide) b.append(' ').append(ctx.getString(R.string.lock_one_side)); // 「20kg 한쪽」 — 앱 표식과 같은 순서(표시 M-4)
        }
        if (m.reps != null) {
            if (b.length() > 0) b.append(" × ");
            b.append(ctx.getResources().getQuantityString(R.plurals.lock_reps, m.reps, m.reps));
        }
        if (m.seconds != null) {
            if (b.length() > 0) b.append(" · ");
            b.append(clock(m.seconds));
        }
        if (m.distanceM != null) {
            if (b.length() > 0) b.append(" · ");
            b.append(km(m.distanceM));
        }
        return b.toString();
    }

    static Notification build(Context ctx, LockView v) {
        ensureChannel(ctx);
        NotificationCompat.Builder nb = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_workout)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setContentIntent(openApp(ctx))
                .setDeleteIntent(action(ctx, LockActionReceiver.ACTION_DELETED, 4, null))
                .setRequestPromotedOngoing(true);
        String fallback = ctx.getString(R.string.lock_title_fallback);
        String title;
        String first;
        StringBuilder big = new StringBuilder();
        boolean group = v.members.size() > 1;
        boolean resting = v.restEndsAt != null && !v.paused;
        if (!v.hasStep) {
            title = v.title.isEmpty() ? fallback : v.title;
            first = ctx.getString(v.truncated ? R.string.lock_truncated : R.string.lock_no_steps);
            big.append(first);
        } else {
            if (group) {
                title = ctx.getString(R.string.lock_superset);
                StringBuilder c = new StringBuilder();
                for (LockView.Member m : v.members) {
                    if (c.length() > 0) c.append(" · ");
                    c.append(m.name).append(' ').append(valueLine(ctx, m));
                    if (big.length() > 0) big.append('\n');
                    big.append(m.name).append(" · ").append(setName(ctx, m)).append('\n').append("  ").append(valueLine(ctx, m));
                }
                first = c.toString();
            } else {
                LockView.Member m = v.members.get(0);
                title = m.name + " · " + setName(ctx, m);
                first = valueLine(ctx, m);
                big.append(first);
            }
            if (v.openApp == LockView.OpenAppReason.VALUES) {
                // 값은 보이되(무엇을 확인할지 알게) 누르기 전에 앱에서 확인 — 기본값이라 사람이 본 적 없다(§8)
                first = ctx.getString(R.string.lock_open_app_values) + " · " + first;
                big.append('\n').append(ctx.getString(R.string.lock_open_app_values));
            } else if (v.openApp == LockView.OpenAppReason.STALLED) {
                first = ctx.getString(R.string.lock_open_app_stalled);
                big.append('\n').append(first);
            }
            if (v.next != null) big.append('\n').append(ctx.getString(R.string.lock_next, v.next.name + " · " + setName(ctx, v.next)));
            if (resting) title = ctx.getString(R.string.lock_next_prefix) + title;
        }
        if (v.paused) first = ctx.getString(R.string.lock_paused) + " · " + first; // 접힌 카드에서도 보이게(표시 H-4)
        nb.setContentTitle(title);
        nb.setContentText(first);
        nb.setStyle(new NotificationCompat.BigTextStyle().bigText((v.paused ? ctx.getString(R.string.lock_paused) + "\n" : "") + big));
        if (v.paused) nb.setSubText(ctx.getString(R.string.lock_paused));
        else if (resting) nb.setSubText(ctx.getString(R.string.lock_resting));
        else if (!v.title.isEmpty() && !v.title.equals(fallback)) nb.setSubText(v.title);
        if (resting) {
            // 휴식 카운트다운 — 0 이 지나면 크로노미터가 음수로 세므로 알람이 「다음 세트」로 다시 게시한다(RestAlarm)
            nb.setUsesChronometer(true).setChronometerCountDown(true).setWhen(v.restEndsAt).setShowWhen(true);
            long remain = Math.max(0, (v.restEndsAt - System.currentTimeMillis()) / 1000);
            nb.setShortCriticalText(clock((int) remain));
        } else if (v.hasStep && !group) {
            nb.setShortCriticalText(setName(ctx, v.members.get(0)));
        }
        if (resting) {
            // 휴식 중엔 휴식 버튼이 먼저(가장 자주 누른다 · 표시 L-1)
            nb.addAction(0, ctx.getString(R.string.lock_action_plus30), action(ctx, LockActionReceiver.ACTION_PLUS30, 2, null));
            nb.addAction(0, ctx.getString(R.string.lock_action_end_rest), action(ctx, LockActionReceiver.ACTION_END_REST, 3, null));
        }
        if (!v.paused && (v.hasStep || v.truncated)) {
            if (v.canComplete) nb.addAction(0, ctx.getString(R.string.lock_action_done), action(ctx, LockActionReceiver.ACTION_COMPLETE, 1, v.stepToken));
            else nb.addAction(0, ctx.getString(R.string.lock_action_open_app), openApp(ctx));
        }
        return nb.build();
    }

    private static final Object RENDER_LOCK = new Object();
    private static long lastGen = -1;
    private static volatile Notification lastBuilt;

    /** 마지막으로 게시한 카드(shortService 의 startForeground 용) */
    static Notification last() {
        return lastBuilt;
    }

    /** 지금 상태로 게시하거나 내린다. 옛 세대의 그림은 버린다(계약 M-3). 알림이 꺼져 있으면 넘어간다(웹 프로필이 안내). */
    public static void render(Context ctx, LockView v) {
        synchronized (RENDER_LOCK) {
            if (v.gen < lastGen) return;
            lastGen = v.gen;
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            if (!v.active) {
                lastBuilt = null;
                nm.cancel(ID);
                return;
            }
            if (!enabled(ctx)) return;
            try {
                Notification n = build(ctx, v);
                lastBuilt = n;
                nm.notify(ID, n);
            } catch (SecurityException e) {
                android.util.Log.w("LiftgramLock", "알림 권한 없음", e);
            }
        }
    }
}
