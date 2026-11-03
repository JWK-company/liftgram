package org.tarae.liftgram.lock;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/**
 * 웹 다리 `LiftgramLock`(SPEC-017 Phase 4) — 웹 `src/frontend/lib/native.ts` 의 `lock.*` 과 1:1.
 * 규칙은 웹(core)과 LockRules/LockState 에 있고, 여기는 저장소에 넘기고 알림·알람을 다시 맞추기만 한다.
 * 플러그인 메서드는 Capacitor 플러그인 스레드에서 돌아 저장소 실행기를 기다려도 화면이 멈추지 않는다.
 */
@CapacitorPlugin(name = "LiftgramLock")
public class LiftgramLockPlugin extends Plugin {
    // [원본] static final String VERSION = "1.1.0";
    // [원본] static final String VERSION = "1.2.0"; // SPEC-019 잠금화면 운동 화면(features lockScreen)
    static final String VERSION = "1.3.0"; // SPEC-020 운동 중 포그라운드 서비스 · 「다른 앱 위에 표시」(features lockService · info overlay·service)
    private static volatile java.lang.ref.WeakReference<LiftgramLockPlugin> instance = new java.lang.ref.WeakReference<>(null);
    /** 화면에 보이나(onStart~onStop) — 웹 visibilityState 와 같은 기준이라 소리 담당이 한쪽만(REV-007 플랫폼 M-5 · L-8 기본 false) */
    private static volatile boolean foreground = false;
    /** 마지막으로 뒤로 간 시각(onStop) — 화면 꺼짐 방송이 onStop 보다 늦게 와도 「앞이었나」를 안다(SPEC-019 · REV-015 플랫폼 M-3) */
    private static volatile long backgroundedAt = 0;
    private static final int REQ_NOTIF = 7302;

    @Override
    public void load() {
        instance = new java.lang.ref.WeakReference<>(this);
        WorkoutNotification.ensureChannel(getContext());
        LockScreenGate.ensureRegistered(getContext()); // 화면 꺼짐 → 잠금 운동 화면(SPEC-019)
    }

    /** 앱이 앞에 있나 — 앞이면 휴식 끝 소리는 웹이 낸다(두 번 울리지 않게). */
    public static boolean isForeground() {
        return foreground && instance.get() != null;
    }

    /** 앱이 살아 있으면 웹 drain 을 깨운다(앞이면 바로 · 뒤면 resume 때 웹이 어차피 drain). */
    public static void fireAction() {
        LiftgramLockPlugin p = instance.get();
        if (p != null) p.notifyListeners("lockAction", new JSObject());
    }

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        foreground = true;
        // 앞인 것이 확실한 때 — 운동 서비스를 바로 시작(뒤로 가기 전에 · SPEC-020 · REV-016 수명 M-9)
        WorkoutService.onAppForeground(getContext());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        foreground = true;
        // 권한 대화상자·설정 화면에서 돌아옴 — 허락한 카드·정확 알람을 바로 반영(플랫폼 L-4·L-6)
        LockHub.refreshAsync(getContext());
    }

    /** 지금 앞이거나, ms 안에 앞이었나 */
    public static boolean wasForegroundWithin(long ms) {
        return isForeground() || (backgroundedAt > 0 && android.os.SystemClock.elapsedRealtime() - backgroundedAt <= ms);
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        foreground = false;
        backgroundedAt = android.os.SystemClock.elapsedRealtime();
        // 보이지 않게 되는 순간 — 짧은 휴식이면 shortService 로 시각을 지킨다(메인 스레드는 기다리지 않는다 · 플랫폼 L-5)
        LockHub.refreshAsync(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance.get() == this) instance = new java.lang.ref.WeakReference<>(null);
        super.handleOnDestroy();
    }

    private LockStore store() {
        return LockHub.store(getContext());
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("version", VERSION);
        JSArray f = new JSArray();
        f.put("session");
        f.put("queue");
        f.put("rest");
        f.put("lockScreen");
        f.put("lockService");
        r.put("features", f);
        r.put("notifications", WorkoutNotification.enabled(getContext())); // 앱 알림 + 카드 채널(플랫폼 L-3)
        r.put("exactAlarm", RestAlarm.canExact(getContext()));
        // SPEC-019 — 잠금화면 운동 화면 설정 · 전체 화면 알림 허용(알림 · 채널 중요도 · Android 14+ 허용)
        r.put("lockScreen", LockScreenGate.enabled(getContext()));
        r.put("fullScreen", LockScreenGate.fullScreenAllowed(getContext()));
        // SPEC-020 — 「다른 앱 위에 표시」 허용 · 운동 서비스가 지금 도나(진단 전용 · 화면에는 안 보임)
        r.put("overlay", LockScreenGate.overlay(getContext()));
        r.put("service", WorkoutService.isRunning());
        // 배터리 최적화 제외(삼성 절전이 서비스까지 멈추지 않게 · REV-016 플랫폼 M-10) · 진단 기록(마지막 30줄)
        android.os.PowerManager pm = getContext().getSystemService(android.os.PowerManager.class);
        r.put("battery", Build.VERSION.SDK_INT < 23 || (pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())));
        JSArray diag = new JSArray();
        org.json.JSONArray lines = LockDiag.lines(getContext());
        for (int k = 0; k < lines.length(); k++) diag.put(lines.optString(k));
        r.put("diag", diag);
        call.resolve(r);
    }

    /** 잠금화면 운동 화면 켜기·끄기(프로필 · 기본 켜짐) */
    @PluginMethod
    public void setLockScreen(PluginCall call) {
        Boolean on = call.getBoolean("enabled");
        if (on == null) {
            call.reject("enabled 없음");
            return;
        }
        LockScreenGate.setEnabled(getContext(), on);
        JSObject r = new JSObject();
        r.put("lockScreen", on);
        call.resolve(r);
    }

    @PluginMethod
    public void sessionUpdate(PluginCall call) {
        JSObject snap = call.getObject("snapshot");
        if (snap == null) {
            call.reject("snapshot 없음");
            return;
        }
        try {
            JSONObject next = new JSONObject(snap.toString());
            boolean accepted = store().write(s -> s.update(next, System.currentTimeMillis()));
            LockScreenGate.ensureRegistered(getContext());
            LockHub.refresh(getContext());
            askNotificationsOnce();
            JSObject r = new JSObject();
            r.put("accepted", accepted);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("sessionUpdate 실패", e);
        }
    }

    @PluginMethod
    public void sessionSetRest(PluginCall call) {
        JSObject rest = call.getObject("rest");
        try {
            JSONObject r = rest == null ? null : new JSONObject(rest.toString());
            store().write(s -> {
                if (r != null) s.setRest(r);
                return null;
            });
            LockHub.refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("sessionSetRest 실패", e);
        }
    }

    @PluginMethod
    public void sessionEnd(PluginCall call) {
        try {
            store().write(s -> {
                s.end();
                return null;
            });
            LockHub.refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("sessionEnd 실패", e);
        }
    }

    @PluginMethod
    public void queueDrain(PluginCall call) {
        try {
            JSONObject d = store().read(LockState::drain);
            call.resolve(JSObject.fromJSONObject(d));
        } catch (Exception e) {
            call.reject("queueDrain 실패", e);
        }
    }

    @PluginMethod
    public void queueAck(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids");
            Set<String> set = new HashSet<>();
            if (ids != null) {
                List<String> l = ids.toList();
                set.addAll(l);
            }
            store().write(s -> {
                s.ack(set);
                return null;
            });
            // 대기열이 줄면 「앱 열기」(막힘)가 풀릴 수 있다
            LockHub.refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("queueAck 실패", e);
        }
    }

    @PluginMethod
    public void queueClear(PluginCall call) {
        try {
            store().write(s -> {
                s.clear();
                return null;
            });
            LockHub.refresh(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("queueClear 실패", e);
        }
    }

    /** 설정 화면 열기 — kind: notifications(앱 알림) · exactAlarm(정확한 알람) · fullScreen · overlay(다른 앱 위에 표시). 프로필의 「켜기」가 부른다. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        String kind = call.getString("kind", "notifications");
        Intent i;
        if ("battery".equals(kind) && Build.VERSION.SDK_INT >= 23) {
            // 배터리 최적화 제외를 바로 묻는 대화상자(REQUEST_IGNORE_BATTERY_OPTIMIZATIONS · 자체 배포) — 안 열리면 앱 정보로
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("overlay".equals(kind) && Build.VERSION.SDK_INT >= 23) {
            // 「다른 앱 위에 표시」(SPEC-020) — Android 11+ 은 package: 를 무시하고 목록을 연다(웹이 「리프트그램을 찾아 켜기」 토스트) ·
            // 안 열리면 아래 catch 가 앱 정보로 · 직접 받은 APK 는 「제한된 설정」으로 회색일 수 있다(앱 정보 ⋮ → 제한된 설정 허용)
            i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("exactAlarm".equals(kind) && Build.VERSION.SDK_INT >= 31) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("fullScreen".equals(kind) && Build.VERSION.SDK_INT >= 34 && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
                && !ctx.getSystemService(android.app.NotificationManager.class).canUseFullScreenIntent()) {
            // 전체 화면 알림 허용(SPEC-019 · REV-014 #27)
            i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("fullScreen".equals(kind) && Build.VERSION.SDK_INT >= 26 && NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            // 허용은 됐는데 채널 중요도가 낮다 — 그 채널 설정으로
            LockScreenGate.ensureChannel(ctx);
            i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                    .putExtra(Settings.EXTRA_CHANNEL_ID, LockScreenGate.CHANNEL);
        } else if (Build.VERSION.SDK_INT >= 26 && NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            // 앱 알림은 켜져 있고 카드 채널만 꺼짐 — 채널 설정으로 바로
            WorkoutNotification.ensureChannel(ctx);
            i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
                    .putExtra(Settings.EXTRA_CHANNEL_ID, WorkoutNotification.CHANNEL);
        } else if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        }
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            // 기기에 그 설정 화면이 없다 — 앱 정보 화면으로(SPEC-020)
            try {
                ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                call.resolve();
            } catch (Exception e2) {
                call.reject("설정을 열 수 없음", e2);
            }
        }
    }

    /** 첫 운동 시작 때 한 번만 알림 권한을 묻는다(Android 13+). 거부하면 다시 묻지 않는다 — 프로필에서 켠다. */
    private void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences p = ctx.getSharedPreferences(LockHub.PREFS + "_ui", Context.MODE_PRIVATE);
        if (p.getBoolean("askedNotif", false)) return;
        p.edit().putBoolean("askedNotif", true).apply();
        getActivity().runOnUiThread(() ->
                ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF));
    }
}
