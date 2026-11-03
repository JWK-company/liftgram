package org.tarae.liftgram.update;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.tarae.liftgram.R;

/**
 * 업데이트가 끝났다(MY_PACKAGE_REPLACED · SPEC-018 §5 · 안드로이드 H-2) — 설치가 성공하면 앱 프로세스가 죽어 웹은 결과를 못 받는다.
 * 그래서 「업데이트 완료 — 눌러서 열기」 알림을 한 번 띄운다. 알림 권한이 없으면 아무것도 하지 않는다(다음에 열면 웹이 안내).
 * 우리 앱이 설치를 시작한 경우(표식 있음)에만 띄운다 — 다른 경로(adb·스토어)의 교체에는 조용히.
 */
public class PackageReplacedReceiver extends BroadcastReceiver {
    static final String CHANNEL = "app_update";
    static final int NOTIF_ID = 7401;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        // [원본] if (!UpdateInstaller.prefs(ctx).contains(UpdateInstaller.K_INSTALLING)) return;
        // [개선] 표식이 30분 안이고 지금 판이 표식 판 이상일 때만 — 남은 표식으로 adb·다른 경로 교체에 알리지 않게(P2 안드로이드 M-5)
        android.content.SharedPreferences sp = UpdateInstaller.prefs(ctx);
        long cur;
        try {
            cur = UpdateInstaller.versionCodeOf(ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0));
        } catch (Exception e) {
            return;
        }
        if (!ApkCheck.notifyOnReplaced(sp.contains(UpdateInstaller.K_INSTALLING), sp.getLong(UpdateInstaller.K_INSTALLING, Long.MAX_VALUE),
                cur, sp.getLong(UpdateInstaller.K_AT, 0), System.currentTimeMillis())) return;
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, ctx.getString(R.string.update_channel_name), NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) return;
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, NOTIF_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String version;
        try {
            version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            version = "";
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_workout)
                .setContentTitle(ctx.getString(R.string.update_done_title, version))
                .setContentText(ctx.getString(R.string.update_done_body))
                .setContentIntent(pi)
                .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, b.build());
        } catch (SecurityException ignore) {
            // 권한이 막 회수됨
        }
    }
}
