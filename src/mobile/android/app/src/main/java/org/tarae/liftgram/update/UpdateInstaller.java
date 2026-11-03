package org.tarae.liftgram.update;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.tarae.liftgram.BuildConfig;

/**
 * 받은 APK 의 검사와 PackageInstaller 세션 설치(SPEC-018 §5 · REV-009 보안 H-3 · 안드로이드 H-1·M-1·M-2).
 *
 * <p>설치는 **매번** 여기서 다시 검사한다 — 웹은 경로를 주지 못하고 받은 파일의 id(= sha256)만 준다. 파일은 앱 전용
 * 캐시(`cacheDir/updates/<sha256>.apk`)라 다른 앱이 바꿀 수 없지만, 세션에 쓰는 바이트의 해시를 다시 계산해 commit 직전에
 * 대조한다(검사와 쓰기 사이에 파일이 바뀌어도 설치되지 않게).
 */
// commit()(동기) 은 일부러 쓴다 — 설치에 성공하면 프로세스가 곧 죽어 apply() 는 디스크에 닿지 못할 수 있다(안드로이드 H-2)
@SuppressLint("ApplySharedPref")
public final class UpdateInstaller {
    private UpdateInstaller() {}

    static final String PREFS = "liftgram_update";
    static final String K_INSTALLING = "installing"; // 설치를 시작한 versionCode(다시 열린 앱이 「업데이트됐습니다」를 한 번 보인다)
    static final String K_FROM = "installingFrom";
    static final String K_AT = "installingAt";
    static final String K_SESSION = "installingSession"; // 지금 시도의 세션 id — 옛 세션의 결과를 버린다(P2 계약 H-4)
    static final String ACTION_RESULT = "org.tarae.liftgram.update.INSTALL_RESULT";

    public static final class Failure extends Exception {
        public final String code;

        Failure(String code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    static File dir(Context ctx) {
        return new File(ctx.getCacheDir(), "updates");
    }

    /** id 를 검사해 파일 경로로 — 웹이 경로를 줄 수 없게 한다 */
    static File fileFor(Context ctx, String id) throws Failure {
        if (!ApkCheck.isSha256(id)) throw new Failure("invalid", "id 형식");
        return new File(dir(ctx), id + ".apk");
    }

    static long versionCodeOf(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
    }

    /**
     * 서명 읽기 플래그 — 28+ 는 GET_SIGNING_CERTIFICATES 에 **GET_SIGNATURES 도 함께**(P2 안드로이드 H-1: 일부 API 의
     * 보관 파일 읽기에서 signingInfo 가 비는 경우 옛 signatures 로 받는다).
     */
    @SuppressWarnings("deprecation")
    static int signFlags() {
        // [원본] return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return Build.VERSION.SDK_INT >= 28
                ? PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES
                : PackageManager.GET_SIGNATURES;
    }

    /** 지금 설치된 앱 */
    static PackageInfo self(Context ctx) throws PackageManager.NameNotFoundException {
        return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), signFlags());
    }

    /** 받은 APK 의 PackageInfo(서명 포함) — 못 읽으면 null */
    static PackageInfo archive(Context ctx, File apk) {
        return ctx.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signFlags());
    }

    private static byte[][] bytes(Signature[] sigs) {
        if (sigs == null) return null;
        byte[][] out = new byte[sigs.length][];
        for (int i = 0; i < sigs.length; i++) out[i] = sigs[i] == null ? null : sigs[i].toByteArray();
        return out;
    }

    /** 서명자 지문들 — 읽지 못하면 빈 목록(= 모름 · 안드로이드 M-2). 규칙은 ApkCheck.pickSigners(JUnit). */
    @SuppressWarnings("deprecation")
    static List<String> signers(PackageInfo p) {
        if (p == null) return new ArrayList<>();
        boolean has = false;
        boolean multi = false;
        byte[][] contents = null;
        byte[][] history = null;
        if (Build.VERSION.SDK_INT >= 28 && p.signingInfo != null) {
            SigningInfo si = p.signingInfo;
            has = true;
            multi = si.hasMultipleSigners();
            if (multi) contents = bytes(si.getApkContentsSigners());
            else history = bytes(si.getSigningCertificateHistory());
        }
        return ApkCheck.pickSigners(has, multi, contents, history, bytes(p.signatures));
    }

    @SuppressWarnings("deprecation")
    static String installer(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            if (Build.VERSION.SDK_INT >= 30) return pm.getInstallSourceInfo(ctx.getPackageName()).getInstallingPackageName();
            return pm.getInstallerPackageName(ctx.getPackageName());
        } catch (Exception e) {
            return null;
        }
    }

    /** 설치 전 검사 — 통과하면 받은 APK 의 versionCode */
    static long check(Context ctx, File apk) throws Failure {
        return check(ctx, apk, BuildConfig.RELEASE_CERT_SHA256);
    }

    /** 기대 지문을 넘기는 판(계측 시험이 디버그 지문으로 실제 PackageManager 를 돌린다 · P2 시험 M-8) */
    static long check(Context ctx, File apk, String expected) throws Failure {
        if (!apk.isFile()) throw new Failure("missing", "받은 파일이 없다");
        if (!ApkCheck.selfUpdateAllowed(installer(ctx))) throw new Failure("store", "플레이 설치본");
        PackageInfo a = archive(ctx, apk);
        // [원본] if (a == null) throw new Failure("invalid", "APK 를 읽지 못했다");
        if (a == null) throw new Failure("missing", "APK 를 읽지 못했다"); // 깨진 파일 = 다시 받기(invalid 는 인자 형식 전용 · 계약 H-3)
        PackageInfo cur;
        try {
            cur = self(ctx);
        } catch (PackageManager.NameNotFoundException e) {
            throw new Failure("failure", "설치본을 찾지 못했다");
        }
        String v = ApkCheck.installVerdict(a.packageName, versionCodeOf(a), versionCodeOf(cur), signers(a), signers(cur), expected);
        if (v != null) throw new Failure(v, "검사 실패: " + v);
        return versionCodeOf(a);
    }

    static String sha256(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            return ApkCheck.hex(md.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    /** 검사 → 세션에 쓰며 해시 재계산 → 대조 → commit. 결과는 InstallResultReceiver 로 온다. */
    static int install(Context ctx, String id) throws Failure {
        return install(ctx, id, BuildConfig.RELEASE_CERT_SHA256);
    }

    /** 기대 지문을 넘기는 판(계측 시험 전용 — 플러그인은 위의 것만 부른다) */
    static int install(Context ctx, String id, String expected) throws Failure {
        File apk = fileFor(ctx, id);
        long newVc = check(ctx, apk, expected);
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        abandonMine(pi); // 확인 화면을 두고 나간 옛 세션 — 다시 누르면 확인 화면이 두 번 뜨지 않게(P2 안드로이드 M-2)
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ApkCheck.PACKAGE);
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= 31) {
            // [원본] 설치기 자신의 업데이트는 확인 화면 없이도 된다(가능할 때만 · 안 되면 시스템이 묻는다 — 안드로이드 L-6)
            // [원본] params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            // [개선] 언제나 시스템 확인 화면 — 원격 화면이 확인 없이 설치·재시작을 일으키지 못하게(P2 보안 M-1 · 설계의 「확인 한 번」)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        }
        int sid;
        PackageInstaller.Session s = null;
        try {
            sid = pi.createSession(params);
            s = pi.openSession(sid);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("base.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                }
                s.fsync(out);
            }
            if (!id.equals(ApkCheck.hex(md.digest()))) {
                s.abandon();
                throw new Failure("hash", "세션에 쓴 바이트가 받은 파일과 다르다");
            }
            long fromVc = versionCodeOf(self(ctx));
            prefs(ctx).edit().putLong(K_INSTALLING, newVc).putLong(K_FROM, fromVc).putLong(K_AT, System.currentTimeMillis())
                    .putInt(K_SESSION, sid).commit();
            // 결과 PendingIntent — 명시적 Intent(우리 리시버만) + 시스템이 결과를 채우므로 31+ 는 FLAG_MUTABLE(안드로이드 H-1)
            Intent i = new Intent(ACTION_RESULT).setPackage(ctx.getPackageName()).setClass(ctx, InstallResultReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getBroadcast(ctx, sid, i, flags);
            s.commit(pend.getIntentSender());
            s.close();
            return sid;
        } catch (Failure f) {
            throw f;
        } catch (Exception e) {
            if (s != null) {
                try {
                    s.abandon();
                } catch (Exception ignore) {
                    // 이미 닫힘
                }
            }
            clearInstalling(ctx); // commit 전에 실패 — 표식이 남지 않게(P2 안드로이드 M-5)
            throw new Failure("failure", "세션 설치 실패");
        }
    }

    /** 우리가 만든 끝나지 않은 세션을 모두 버린다 */
    static void abandonMine(PackageInstaller pi) {
        try {
            for (PackageInstaller.SessionInfo si : pi.getMySessions()) {
                try {
                    pi.abandonSession(si.getSessionId());
                } catch (Exception ignore) {
                    // 이미 끝남
                }
            }
        } catch (Exception ignore) {
            // 목록을 못 읽음 — 새 세션은 그대로 만든다
        }
    }

    /** 설치 취소(웹 cancelInstall) — 지금 세션을 버리고 표식을 지운다 */
    static void cancel(Context ctx) {
        abandonMine(ctx.getPackageManager().getPackageInstaller());
        clearInstalling(ctx);
    }

    /** 지금 시도의 세션 id(없으면 -1) */
    static int currentSession(Context ctx) {
        return prefs(ctx).getInt(K_SESSION, -1);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void clearInstalling(Context ctx) {
        prefs(ctx).edit().remove(K_INSTALLING).remove(K_FROM).remove(K_AT).remove(K_SESSION).commit();
    }
}
