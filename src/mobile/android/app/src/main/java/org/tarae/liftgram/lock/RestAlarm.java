package org.tarae.liftgram.lock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 휴식 끝 알람(SPEC-017 §11) — 권한이 있으면 정확 알람, 없으면(Android 14+ 새 설치 기본) 남은 시간이 2분 50초 미만일 때만
 * shortService(+PARTIAL_WAKE_LOCK)로 시각을 지키고, 그 밖은 느슨한 알람(setAndAllowWhileIdle — 몇 분 늦을 수 있음)이다.
 * 대기열이 막히는 시각(60초)에도 다시 그리는 느슨한 알람을 건다(REV-007 계약 M-4).
 */
public final class RestAlarm {
    static final long SHORT_SERVICE_MAX_MS = 170_000L; // 2분 50초 — shortService 상한(3분) 안쪽
    static final long DONE_SLACK_MS = 500L; // 이만큼 남았으면 끝난 것으로 본다(핸들러가 몇 ms 일찍 깨는 경우)

    private RestAlarm() {}

    static PendingIntent pi(Context ctx, String act, int req) {
        Intent i = new Intent(ctx, LockActionReceiver.class).setAction(act).setPackage(ctx.getPackageName());
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    public static void schedule(Context ctx, LockView v) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        // 대기열 막힘 → 그 시각에 「앱 열기」로 다시 그린다
        PendingIntent redraw = pi(ctx, LockActionReceiver.ACTION_REDRAW, 11);
        if (v.active && v.stalledAt != null && v.stalledAt > System.currentTimeMillis()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, v.stalledAt, redraw);
        else am.cancel(redraw);

        PendingIntent p = pi(ctx, LockActionReceiver.ACTION_REST_DONE, 10);
        if (!v.active || v.restEndsAt == null || v.paused) {
            am.cancel(p);
            RestShortService.stop(ctx);
            return;
        }
        long endsAt = v.restEndsAt;
        long remain = endsAt - System.currentTimeMillis();
        if (canExact(ctx)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, p);
                RestShortService.stop(ctx);
                return;
            } catch (SecurityException e) {
                // 권한이 막 회수됨 — 아래 느슨한 길로
            }
        }
        // 느슨한 알람은 늘 걸어 둔다(서비스가 거부·중단돼도 언젠가는 울린다)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, p);
        if (Build.VERSION.SDK_INT >= 34 && remain > 0 && remain < SHORT_SERVICE_MAX_MS && !LiftgramLockPlugin.isForeground()) {
            RestShortService.start(ctx, endsAt);
        } else {
            // 늘어나 상한을 넘었거나 앱이 앞 — 돌던 서비스는 정리(옛 끝 시각에 울지 않게 · 플랫폼 H-2)
            RestShortService.stop(ctx);
        }
    }

    /**
     * 휴식 끝 — 정말 끝났는지 다시 보고(+30초로 늘었으면 다시 건다), 같은 휴식은 한 번만 울린다(플랫폼 H-2).
     * 소리는 앱이 뒤에 있을 때만(앞이면 웹이 낸다). 카드는 「다음 세트」로 다시 게시.
     */
    static void onRestDone(Context ctx) throws Exception {
        final long now = System.currentTimeMillis();
        Long ring = LockHub.store(ctx).write(s -> {
            if (s.snapshot == null || s.rest == null || s.rest.isNull("endsAt")) return null;
            long endsAt = s.rest.optLong("endsAt");
            if (endsAt - now > DONE_SLACK_MS) return null; // 아직 — 아래 refresh 가 새 끝 시각으로 다시 건다
            if (s.rungEndsAt == endsAt) return null; // 이미 울림
            s.rungEndsAt = endsAt;
            return endsAt;
        });
        LockView v = LockHub.store(ctx).read(s -> LockView.of(s, now + DONE_SLACK_MS));
        WorkoutNotification.render(ctx, v);
        schedule(ctx, v);
        if (ring != null && !LiftgramLockPlugin.isForeground() && v.soundEnabled) RestSound.play(ctx, v.soundPreset, v.soundVolume);
    }
}
