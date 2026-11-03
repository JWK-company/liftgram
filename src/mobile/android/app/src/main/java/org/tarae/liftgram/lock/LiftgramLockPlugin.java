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
    static final String VERSION = "1.1.0";
    private static volatile java.lang.ref.WeakReference<LiftgramLockPlugin> instance = new java.lang.ref.WeakReference<>(null);
    /** 화면에 보이나(onStart~onStop) — 웹 visibilityState 와 같은 기준이라 소리 담당이 한쪽만(REV-007 플랫폼 M-5 · L-8 기본 false) */
    private static volatile boolean foreground = false;
    private static final int REQ_NOTIF = 7302;

    @Override
    public void load() {
        instance = new java.lang.ref.WeakReference<>(this);
        WorkoutNotification.ensureChannel(getContext());
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
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        foreground = true;
        // 권한 대화상자·설정 화면에서 돌아옴 — 허락한 카드·정확 알람을 바로 반영(플랫폼 L-4·L-6)
        LockHub.refreshAsync(getContext());
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        foreground = false;
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
        r.put("features", f);
        r.put("notifications", WorkoutNotification.enabled(getContext())); // 앱 알림 + 카드 채널(플랫폼 L-3)
        r.put("exactAlarm", RestAlarm.canExact(getContext()));
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

    /** 설정 화면 열기 — kind: notifications(앱 알림) · exactAlarm(정확한 알람). 프로필의 「켜기」가 부른다. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        String kind = call.getString("kind", "notifications");
        Intent i;
        if ("exactAlarm".equals(kind) && Build.VERSION.SDK_INT >= 31) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.getPackageName()));
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
            call.reject("설정을 열 수 없음", e);
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
