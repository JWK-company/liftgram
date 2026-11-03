package org.tarae.liftgram.update;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import androidx.core.content.IntentCompat;

/**
 * PackageInstaller 세션 결과(SPEC-018 §5 · 안드로이드 H-1·H-4).
 *
 * <p>⚠ 이 클래스 이름은 다음 판에서도 바꾸지 않는다 — 성공 결과는 **새 판 프로세스**로 배달된다(P2 안드로이드 L-6).
 *
 * <ul>
 *   <li>지금 시도의 세션이 아니면 버린다 — 옛 세션의 aborted 가 새 시도의 결과처럼 보이지 않게(P2 계약 H-4).</li>
 *   <li>{@code STATUS_PENDING_USER_ACTION} — 시스템 확인 화면. 실행할 대상이 **시스템 설치기**인지 확인하고 권한 위임 플래그를
 *       지운 뒤(P2 보안 L-2), 앱이 앞에 있으면 바로, 뒤에 있으면 앞으로 올 때 띄운다. 띄우지 못하면 pending 없이 failure 하나만
 *       (P2 계약 H-5).</li>
 *   <li>성공 — 프로세스가 곧 죽는다. 표식은 다시 열린 앱이 읽는다(state·ackJustUpdated).</li>
 *   <li>실패·취소 — 표식을 지우고 웹에 알린다. 시스템 메시지 원문(내부 경로 포함)은 넘기지 않는다(P2 보안 L-7).</li>
 * </ul>
 */
public class InstallResultReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        int sid = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
        int cur = UpdateInstaller.currentSession(ctx);
        if (sid != -1 && cur != -1 && sid != cur) return; // 옛 세션
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // [원본] Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : legacyIntent(intent)
            // [개선] API 33 typed getter 버그를 피한다(P2 시험 M-3 · 안드로이드 L-1)
            Intent confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent.class);
            if (confirm == null || !isSystemInstaller(ctx, confirm)) {
                UpdateInstaller.clearInstalling(ctx);
                LiftgramUpdatePlugin.emitResult("failure", sid);
                return;
            }
            confirm.setFlags((confirm.getFlags()
                            & ~(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                                    | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION))
                    | Intent.FLAG_ACTIVITY_NEW_TASK);
            LiftgramUpdatePlugin.flushCookiesAsync(); // 확인 화면이 떠 있는 동안의 쿠키도 디스크로(P2 안드로이드 M-4)
            if (LiftgramUpdatePlugin.offerConfirm(ctx, confirm, sid)) LiftgramUpdatePlugin.emitResult("pending", sid);
            else {
                UpdateInstaller.clearInstalling(ctx);
                LiftgramUpdatePlugin.emitResult("failure", sid);
            }
            return;
        }
        String name = ApkCheck.statusName(status);
        if (status != PackageInstaller.STATUS_SUCCESS) UpdateInstaller.clearInstalling(ctx);
        LiftgramUpdatePlugin.emitResult(name, sid);
    }

    /** 확인 화면 Intent 가 시스템 앱(패키지 설치기)으로 가는가 */
    static boolean isSystemInstaller(Context ctx, Intent confirm) {
        try {
            PackageManager pm = ctx.getPackageManager();
            ComponentName c = confirm.resolveActivity(pm);
            if (c == null) return false;
            ApplicationInfo ai = pm.getApplicationInfo(c.getPackageName(), 0);
            return (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        } catch (Exception e) {
            return false;
        }
    }
}
