package org.tarae.liftgram.update;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.CookieManager;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.tarae.liftgram.BuildConfig;

/**
 * 웹 다리 `LiftgramUpdate`(SPEC-018 §5) — 앱 설치 파일(APK) 업데이트. 웹 `src/frontend/lib/appDistribution.ts` 와 1:1.
 *
 * <p>메서드: info · state · ackJustUpdated · download · cancelDownload · install · cancelInstall · openInstallSettings.
 * 이벤트: progress {received,total} · installResult {status, sessionId} · resume.
 *
 * <p>**경로는 받지 않는다** — download 가 돌려준 id(= sha256)로만 설치하고, 설치 직전 네이티브가 패키지·서명 집합·버전·해시를
 * 다시 본다(보안 H-3). 웹 화면이 원격(liftgram.tarae.org)이라 호출은 메인 프레임이 그 출처일 때만, 그리고 새 브리지
 * (WebMessageListener)일 때만 받는다 — 옛 브리지(addJavascriptInterface)는 iframe 의 호출을 가리지 못한다(P2 보안 M-2).
 *
 * <p>실행기는 **둘이고 static**(P2 계약 H-1 · 안드로이드 M-3): 받기는 한 줄(DL), 나머지는 따로(IO) — 받는 동안에도 info·
 * openInstallSettings 가 바로 답한다. 플러그인이 다시 만들어져도 받기 상태가 이어진다.
 *
 * <p>실패 코드는 닫힌 표(ApkCheck.ERROR_CODES)만 — 시스템 메시지 원문·예외 이름은 웹으로 보내지 않는다(P2 보안 L-7).
 */
@CapacitorPlugin(name = "LiftgramUpdate")
// commit()(동기) 은 일부러 쓴다 — 설치에 성공하면 프로세스가 곧 죽어 apply() 는 디스크에 닿지 못할 수 있다(안드로이드 H-2)
@SuppressLint("ApplySharedPref")
public class LiftgramUpdatePlugin extends Plugin {
    private static volatile WeakReference<LiftgramUpdatePlugin> instance = new WeakReference<>(null);
    private static volatile boolean foreground = false;

    /** 앱이 뒤에 있을 때 온 시스템 확인 화면 — 앞으로 오면 띄운다(30분 넘은 것·다른 세션 것은 버린다 · P2 안드로이드 M-2) */
    private static volatile Intent pendingConfirm = null;
    private static volatile int pendingSid = -1;
    private static volatile long pendingAt = 0;

    private static final ExecutorService DL = Executors.newSingleThreadExecutor();
    private static final ExecutorService IO = Executors.newCachedThreadPool();
    private static final AtomicBoolean downloading = new AtomicBoolean(false);
    private static final AtomicBoolean cancelDl = new AtomicBoolean(false);
    private static volatile long dlReceived = 0;
    private static volatile long dlTotal = 0;
    private static volatile String dlSha = null;
    /** 마지막 설치 결과 — 리스너를 달기 전·화면을 새로 고친 뒤에도 state() 로 읽는다(P2 계약 H-2·M-7) */
    private static volatile JSObject lastResult = null;
    /** 해시가 틀렸던 sha256 → 다시 받을 수 있는 시각(10분 · 같은 틀린 값으로 데이터를 거듭 쓰지 않게 — P2 보안 M-4) */
    private static final Map<String, Long> badHash = new ConcurrentHashMap<>();
    private static final long BAD_HASH_MS = 10 * 60_000L;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        foreground = true;
        Intent c = pendingConfirm;
        int sid = pendingSid;
        long at = pendingAt;
        pendingConfirm = null;
        if (c != null) {
            boolean fresh = System.currentTimeMillis() - at <= ApkCheck.MARK_TTL_MS && sid == UpdateInstaller.currentSession(getContext());
            if (fresh && !startConfirm(getContext(), c)) {
                UpdateInstaller.clearInstalling(getContext());
                emitResult("failure", sid);
            }
        }
        emit("resume", new JSObject()); // 설정(설치 허용)에서 돌아옴 — 웹이 canInstall 을 다시 읽는다(안드로이드 M-3)
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        foreground = false;
        flushCookiesAsync(); // 확인 화면·설정으로 나갈 때(P2 안드로이드 M-4)
    }

    @Override
    protected void handleOnDestroy() {
        if (instance.get() == this) instance = new WeakReference<>(null);
        // [원본] io.shutdownNow(); — 실행기는 이제 static 이라 닫지 않는다(새 플러그인 인스턴스가 이어 쓴다 · P2 안드로이드 M-3)
        super.handleOnDestroy();
    }

    /** 확인 화면 — 띄웠거나 맡겼으면 true, 띄우다 실패하면 false(P2 계약 H-5) */
    static boolean offerConfirm(Context ctx, Intent confirm, int sid) {
        if (foreground && instance.get() != null) return startConfirm(ctx, confirm);
        pendingConfirm = confirm;
        pendingSid = sid;
        pendingAt = System.currentTimeMillis();
        return true;
    }

    private static boolean startConfirm(Context ctx, Intent confirm) {
        try {
            ctx.startActivity(confirm);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static void emitResult(String status, int sessionId) {
        JSObject r = new JSObject();
        r.put("status", status);
        r.put("sessionId", sessionId);
        r.put("at", System.currentTimeMillis());
        lastResult = r;
        LiftgramUpdatePlugin p = instance.get();
        if (p != null) p.emit("installResult", r);
    }

    /** 이벤트는 메인 스레드에서(Capacitor 리스너 목록 경합 · P2 안드로이드 L-3) */
    private void emit(String name, JSObject data) {
        MAIN.post(() -> notifyListeners(name, data));
    }

    /**
     * 메인 프레임이 우리 출처이고 새 브리지일 때만 일을 한다(웹뷰 URL 은 메인 스레드에서만 읽힌다).
     *
     * @param ex 일을 돌릴 실행기(받기는 DL, 나머지는 IO)
     */
    private void guarded(PluginCall call, ExecutorService ex, Runnable work) {
        guarded(call, ex, work, null);
    }

    /** @param onReject 출처에서 거절됐을 때(받기의 busy 표시를 되돌린다) */
    private void guarded(PluginCall call, ExecutorService ex, Runnable work, Runnable onReject) {
        MAIN.post(() -> {
            String url = null;
            boolean modern = false;
            try {
                url = getBridge().getWebView().getUrl();
                modern = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                        && !getBridge().getConfig().isUsingLegacyBridge();
            } catch (Exception ignore) {
                // 웹뷰 없음
            }
            if (!modern || !fromOrigin(url)) {
                if (onReject != null) onReject.run();
                call.reject("허용되지 않은 화면", "origin");
                return;
            }
            try {
                ex.execute(work);
            } catch (Exception e) {
                if (onReject != null) onReject.run();
                call.reject("실행할 수 없다", "failure");
            }
        });
    }

    static boolean fromOrigin(String url) {
        return ApkCheck.fromOrigin(url); // 규칙은 ApkCheck(JUnit · P2 시험 L-1)
    }

    private static void reject(PluginCall call, String code) {
        call.reject(code, ApkCheck.code(code));
    }

    // ── 읽기 ─────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void info(PluginCall call) {
        guarded(call, IO, () -> {
            Context ctx = getContext();
            JSObject r = new JSObject();
            long now = -1;
            try {
                PackageInfo p = UpdateInstaller.self(ctx);
                now = UpdateInstaller.versionCodeOf(p);
                r.put("versionName", p.versionName);
                r.put("versionCode", now);
                List<String> s = UpdateInstaller.signers(p);
                JSArray arr = new JSArray();
                for (String x : s) arr.put(x);
                r.put("certs", arr);
                r.put("certSha256", s.size() == 1 ? s.get(0) : null); // 여럿·못 읽음 = 모름(null)
            } catch (Exception e) {
                r.put("versionCode", null);
                r.put("certSha256", null);
            }
            r.put("expectedCertSha256", BuildConfig.RELEASE_CERT_SHA256.isEmpty() ? null : BuildConfig.RELEASE_CERT_SHA256);
            r.put("debug", BuildConfig.DEBUG); // 개발 빌드 — 웹이 「다시 설치」 대신 개발 표시를 한다(P2 계약 M-6)
            String inst = UpdateInstaller.installer(ctx);
            r.put("installer", inst);
            r.put("selfUpdate", ApkCheck.selfUpdateAllowed(inst));
            r.put("canInstall", canInstall(ctx));
            r.put("sdk", Build.VERSION.SDK_INT);
            r.put("metered", metered(ctx)); // 데이터 요금 회선 — 웹이 받기 전에 크기를 알린다(P2 보안 M-4)
            // [원본] 읽는 순간 justUpdated 표식을 지웠다 → 여러 곳이 info() 를 부르면 안내가 사라졌다(P2 계약 M-2 · 보안 L-6)
            // [개선] info 는 부수효과 없이 알리기만 — 지우는 것은 ackJustUpdated()
            JSObject mark = markInfo(ctx, now);
            if (mark != null) r.put(mark.getString("kind"), mark);
            call.resolve(r);
        });
    }

    /** 설치 표식 판정 — justUpdated(바뀜) · installStarted(설치를 시작했는데 아직 그 판이 아님 · 30분 안) · 오래된 표식은 지운다 */
    private static JSObject markInfo(Context ctx, long currentVc) {
        SharedPreferences sp = UpdateInstaller.prefs(ctx);
        String v = ApkCheck.markVerdict(sp.contains(UpdateInstaller.K_INSTALLING), sp.getLong(UpdateInstaller.K_INSTALLING, 0),
                currentVc, sp.getLong(UpdateInstaller.K_AT, 0), System.currentTimeMillis());
        if ("stale".equals(v)) {
            // 30분 지난 표식 — 지우되 웹이 「설치를 시작했었다」는 것을 한 번은 알게 lastResult 로 남긴다(P2 계약 M-3)
            UpdateInstaller.clearInstalling(ctx);
            if (lastResult == null) emitResultQuiet("expired");
            return null;
        }
        if ("none".equals(v)) return null;
        JSObject j = new JSObject();
        j.put("kind", "updated".equals(v) ? "justUpdated" : "installStarted");
        j.put("from", sp.getLong(UpdateInstaller.K_FROM, 0));
        j.put("to", "updated".equals(v) ? currentVc : sp.getLong(UpdateInstaller.K_INSTALLING, 0));
        return j;
    }

    private static void emitResultQuiet(String status) {
        JSObject r = new JSObject();
        r.put("status", status);
        r.put("sessionId", -1);
        r.put("at", System.currentTimeMillis());
        lastResult = r;
    }

    /** 「업데이트됐습니다」를 보였다 — 표식을 지운다 */
    @PluginMethod
    public void ackJustUpdated(PluginCall call) {
        guarded(call, IO, () -> {
            Context ctx = getContext();
            long cur;
            try {
                cur = UpdateInstaller.versionCodeOf(UpdateInstaller.self(ctx));
            } catch (Exception e) {
                cur = -1;
            }
            SharedPreferences sp = UpdateInstaller.prefs(ctx);
            if ("updated".equals(ApkCheck.markVerdict(sp.contains(UpdateInstaller.K_INSTALLING), sp.getLong(UpdateInstaller.K_INSTALLING, 0),
                    cur, sp.getLong(UpdateInstaller.K_AT, 0), System.currentTimeMillis()))) {
                UpdateInstaller.clearInstalling(ctx);
            }
            call.resolve();
        });
    }

    /** 화면을 새로 고친 뒤 이어 보기 — 받는 중·설치 중·확인 화면 대기·마지막 결과(P2 계약 H-2) */
    @PluginMethod
    public void state(PluginCall call) {
        guarded(call, IO, () -> {
            Context ctx = getContext();
            JSObject r = new JSObject();
            if (downloading.get()) {
                JSObject d = new JSObject();
                d.put("id", dlSha);
                d.put("received", dlReceived);
                d.put("total", dlTotal);
                r.put("downloading", d);
            } else r.put("downloading", null);
            SharedPreferences sp = UpdateInstaller.prefs(ctx);
            if (sp.contains(UpdateInstaller.K_INSTALLING)) {
                JSObject i = new JSObject();
                i.put("to", sp.getLong(UpdateInstaller.K_INSTALLING, 0));
                i.put("sessionId", sp.getInt(UpdateInstaller.K_SESSION, -1));
                i.put("at", sp.getLong(UpdateInstaller.K_AT, 0));
                r.put("installing", i);
            } else r.put("installing", null);
            r.put("confirmWaiting", pendingConfirm != null);
            r.put("lastResult", lastResult);
            call.resolve(r);
        });
    }

    @SuppressWarnings("deprecation")
    static boolean canInstall(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) return ctx.getPackageManager().canRequestPackageInstalls();
        // 24~25: 전역 「출처를 알 수 없는 앱」 설정
        return Settings.Secure.getInt(ctx.getContentResolver(), Settings.Secure.INSTALL_NON_MARKET_APPS, 0) == 1;
    }

    static boolean metered(Context ctx) {
        try {
            ConnectivityManager cm = ctx.getSystemService(ConnectivityManager.class);
            return cm != null && cm.isActiveNetworkMetered();
        } catch (Exception e) {
            return false;
        }
    }

    // ── 받기 ─────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha256");
        // [원본] Long sizeL = call.getLong("size"); — 브리지가 작은 수를 Integer 로 풀어 늘 null → 받기가 전부 invalid(P2 시험 H-1)
        long size = ApkCheck.parseSize(call.getData().opt("size"));
        URI u = ApkCheck.resolveDownloadUrl(url);
        if (u == null) {
            reject(call, "origin");
            return;
        }
        if (!ApkCheck.isSha256(sha) || size < 0) {
            reject(call, "invalid");
            return;
        }
        Long until = badHash.get(sha);
        if (until != null && System.currentTimeMillis() < until) {
            reject(call, "hash");
            return;
        }
        // 줄 세우지 않는다 — 받는 중이면 바로 busy(P2 계약 H-1 · 보안 M-4: 호출이 무한히 쌓이지 않게)
        if (!downloading.compareAndSet(false, true)) {
            reject(call, "busy");
            return;
        }
        cancelDl.set(false);
        dlSha = sha;
        dlReceived = 0;
        dlTotal = size;
        guarded(call, DL, () -> {
            try {
                JSObject r = new JSObject();
                r.put("id", fetch(u, sha, size));
                call.resolve(r);
            } catch (UpdateInstaller.Failure f) {
                if ("hash".equals(f.code)) badHash.put(sha, System.currentTimeMillis() + BAD_HASH_MS);
                reject(call, f.code);
            } finally {
                dlSha = null;
                downloading.set(false);
            }
        }, () -> {
            dlSha = null;
            downloading.set(false);
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        guarded(call, IO, () -> {
            cancelDl.set(true);
            call.resolve();
        });
    }

    private void progress(long got, long total) {
        dlReceived = got;
        JSObject p = new JSObject();
        p.put("received", got);
        p.put("total", total);
        emit("progress", p);
    }

    private String fetch(URI u, String sha, long size) throws UpdateInstaller.Failure {
        Context ctx = getContext();
        File dir = UpdateInstaller.dir(ctx);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new UpdateInstaller.Failure("storage", "폴더를 만들지 못했다");
        File done = new File(dir, sha + ".apk");
        // 다른 파일은 치운다(옛 버전·끊긴 조각) — 설치가 진행 중(표식 30분 안)이면 그 파일을 지우지 않게 건너뛴다(P2 보안 M-4)
        SharedPreferences sp = UpdateInstaller.prefs(ctx);
        boolean installing = "waiting".equals(ApkCheck.markVerdict(sp.contains(UpdateInstaller.K_INSTALLING),
                sp.getLong(UpdateInstaller.K_INSTALLING, 0), -1, sp.getLong(UpdateInstaller.K_AT, 0), System.currentTimeMillis()));
        if (!installing) {
            File[] olds = dir.listFiles();
            if (olds != null) for (File f : olds) if (!f.getName().equals(done.getName())) f.delete();
        }
        try {
            if (done.isFile() && done.length() == size && sha.equals(UpdateInstaller.sha256(done))) {
                progress(size, size); // 이미 받은 파일 — 진행 이벤트를 한 번 보낸다(P2 계약 M-8)
                return sha;
            }
        } catch (Exception ignore) {
            // 다시 받는다
        }
        done.delete();
        if (!ApkCheck.spaceOk(dir.getUsableSpace(), size)) throw new UpdateInstaller.Failure("space", "저장 공간 부족");
        File part = new File(dir, sha + ".part");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) u.toURL().openConnection();
            c.setInstanceFollowRedirects(false); // 리다이렉트는 따라가지 않는다(보안 M-1)
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("Accept-Encoding", "identity");
            String v = ApkCheck.httpVerdict(c.getResponseCode());
            if (v != null) throw new UpdateInstaller.Failure(v, "HTTP");
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long got = 0;
            long lastEmit = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelDl.get()) throw new UpdateInstaller.Failure("cancelled", "취소");
                    got += n;
                    if (ApkCheck.exceeds(got, size)) throw new UpdateInstaller.Failure("size", "약속한 크기를 넘었다");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 200) {
                        lastEmit = now;
                        progress(got, size);
                    }
                }
                out.flush();
            }
            if (got != size) throw new UpdateInstaller.Failure("size", "크기가 다르다");
            if (!sha.equals(ApkCheck.hex(md.digest()))) throw new UpdateInstaller.Failure("hash", "해시가 다르다");
            if (!part.renameTo(done)) throw new UpdateInstaller.Failure("storage", "파일을 옮기지 못했다");
            progress(got, size);
            return sha;
        } catch (UpdateInstaller.Failure f) {
            part.delete();
            throw f;
        } catch (java.io.IOException e) {
            part.delete();
            throw new UpdateInstaller.Failure(ApkCheck.ioCode(e.getMessage()), "IO");
        } catch (Exception e) {
            part.delete();
            throw new UpdateInstaller.Failure("failure", "받기 실패");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ── 설치 ─────────────────────────────────────────────────────────────────────

    @PluginMethod
    public void install(PluginCall call) {
        String id = call.getString("id");
        String mode = call.getString("mode", "session");
        guarded(call, IO, () -> {
            Context ctx = getContext();
            if (!canInstall(ctx)) {
                reject(call, "notAllowed");
                return;
            }
            // 설치가 성공하면 프로세스가 죽는다 — 웹 쿠키(로그인)를 먼저 디스크로(안드로이드 H-2 · 웹 저장은 호출 전에 웹이 한다)
            flushCookies();
            lastResult = null;
            try {
                if ("view".equals(mode)) {
                    openViewInstaller(id);
                    call.resolve(new JSObject().put("mode", "view"));
                } else {
                    int sid = UpdateInstaller.install(ctx, id);
                    call.resolve(new JSObject().put("mode", "session").put("sessionId", sid));
                }
            } catch (UpdateInstaller.Failure f) {
                reject(call, f.code);
            }
        });
    }

    @PluginMethod
    public void cancelInstall(PluginCall call) {
        guarded(call, IO, () -> {
            pendingConfirm = null;
            UpdateInstaller.cancel(getContext());
            call.resolve();
        });
    }

    /**
     * 세션 설치가 막히는 기기(일부 제조사)용 — 같은 검사를 거친 뒤 **시스템 설치기에만** 읽기 권한을 준다(P2 보안 L-1).
     * 결과 이벤트는 오지 않는다 — 웹은 resume 뒤 info() 의 versionCode·justUpdated 로 판단한다(P2 계약 M-4).
     */
    private void openViewInstaller(String id) throws UpdateInstaller.Failure {
        Context ctx = getContext();
        File apk = UpdateInstaller.fileFor(ctx, id);
        long vc = UpdateInstaller.check(ctx, apk);
        try {
            if (!id.equals(UpdateInstaller.sha256(apk))) throw new UpdateInstaller.Failure("hash", "해시가 다르다");
        } catch (java.io.IOException e) {
            throw new UpdateInstaller.Failure("missing", "읽지 못했다");
        }
        // [원본] FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk) — 캐시 전체·외부 저장소를 덮는 공용 provider
        // [개선] cache/updates/ 만 덮는 업데이트 전용 provider(P2 보안 M-3 · 안드로이드 L-2)
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + UpdateFileProvider.SUFFIX, apk);
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
        PackageManager pm = ctx.getPackageManager();
        ComponentName target = i.resolveActivity(pm);
        try {
            if (target == null || (pm.getApplicationInfo(target.getPackageName(), 0).flags & ApplicationInfo.FLAG_SYSTEM) == 0) {
                throw new UpdateInstaller.Failure("failure", "시스템 설치기가 없다");
            }
        } catch (PackageManager.NameNotFoundException e) {
            throw new UpdateInstaller.Failure("failure", "시스템 설치기가 없다");
        }
        i.setPackage(target.getPackageName()).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            long from = UpdateInstaller.versionCodeOf(UpdateInstaller.self(ctx));
            UpdateInstaller.prefs(ctx).edit().putLong(UpdateInstaller.K_INSTALLING, vc).putLong(UpdateInstaller.K_FROM, from)
                    .putLong(UpdateInstaller.K_AT, System.currentTimeMillis()).remove(UpdateInstaller.K_SESSION).commit();
            ctx.startActivity(i);
        } catch (Exception e) {
            UpdateInstaller.clearInstalling(ctx);
            throw new UpdateInstaller.Failure("failure", "설치 화면을 열지 못했다");
        }
    }

    /** 쿠키를 디스크로 — 메인 스레드 작업을 최대 2초 기다린다(IO 스레드에서 부른다) */
    private void flushCookies() {
        final Object lock = new Object();
        final boolean[] done = {false};
        MAIN.post(() -> {
            try {
                CookieManager.getInstance().flush();
            } catch (Exception ignore) {
                // 웹뷰 없음
            }
            synchronized (lock) {
                done[0] = true;
                lock.notifyAll();
            }
        });
        synchronized (lock) {
            long until = System.currentTimeMillis() + 2000;
            while (!done[0] && System.currentTimeMillis() < until) {
                try {
                    lock.wait(200);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }
    }

    /** 기다리지 않는 쿠키 flush(리시버·onPause) */
    static void flushCookiesAsync() {
        MAIN.post(() -> {
            try {
                CookieManager.getInstance().flush();
            } catch (Exception ignore) {
                // 웹뷰 없음
            }
        });
    }

    /** 설치 허용 설정 — 이미 허용이면 열지 않는다(「출처 허용」을 켜게 하는 반복 유도 방지 · P2 보안 L-8) */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        guarded(call, IO, () -> {
            Context ctx = getContext();
            if (canInstall(ctx)) {
                call.resolve(new JSObject().put("opened", false));
                return;
            }
            Intent i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()))
                    : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(i);
                call.resolve(new JSObject().put("opened", true));
            } catch (Exception e) {
                reject(call, "failure");
            }
        });
    }
}
