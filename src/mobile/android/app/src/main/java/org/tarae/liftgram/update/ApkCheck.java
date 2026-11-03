package org.tarae.liftgram.update;

import java.net.URI;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 앱 설치 파일 업데이트의 순수 판정(SPEC-018 §5 · REV-009 보안 H-3·M-1·M-2) — 안드로이드 API 없이 JUnit 으로 본다.
 *
 * <p>신뢰 근거는 **설치된 앱의 서명 집합 + 앱 안 상수 지문**(BuildConfig.RELEASE_CERT_SHA256)뿐이다. 웹(원격 JS)이 주는
 * url·sha256·size 는 「무엇을 받을지」 고르는 값일 뿐이라, 여기서 출처·형식을 좁히고 설치 직전 네이티브가 다시 검사한다.
 */
public final class ApkCheck {
    private ApkCheck() {}

    public static final String ORIGIN = "https://liftgram.tarae.org";
    public static final String HOST = "liftgram.tarae.org";
    public static final String PACKAGE = "org.tarae.liftgram";
    /** 받을 크기 상한 — json 의 size 가 이보다 크면 받지 않는다(디스크 고갈 방지) */
    public static final long MAX_SIZE = 200L * 1024 * 1024;

    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    // /downloads/liftgram-<이름>-<코드>-<sha8>.apk — 배포 스크립트가 만드는 이름만(%·..·하위 경로 없음)
    private static final Pattern APK_PATH = Pattern.compile("^/downloads/liftgram-[0-9A-Za-z.]+-[0-9]+-[0-9a-f]{8}\\.apk$");

    /** 64자리 소문자 hex 인가 — 저장 파일 이름·설치 id 로 쓰기 전에 반드시 통과시킨다. */
    public static boolean isSha256(String s) {
        return s != null && SHA256.matcher(s).matches();
    }

    /**
     * 받을 주소를 고정 기준(상수 ORIGIN)으로 풀고 좁힌다. 허용되지 않으면 null.
     * 문자열 접두 비교를 쓰지 않는다(`https://liftgram.tarae.org@evil.com` · `liftgram.tarae.org.evil.com` 우회 — 보안 M-1).
     */
    public static URI resolveDownloadUrl(String url) {
        if (url == null || url.isEmpty() || url.length() > 512) return null;
        final URI u;
        try {
            u = URI.create(ORIGIN + "/").resolve(url);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (!"https".equals(u.getScheme())) return null;
        if (u.getRawUserInfo() != null) return null;
        String host = u.getHost();
        if (host == null || !HOST.equals(host.toLowerCase(Locale.ROOT))) return null;
        if (u.getPort() != -1 && u.getPort() != 443) return null;
        if (u.getRawQuery() != null || u.getRawFragment() != null) return null;
        String path = u.getRawPath();
        if (path == null || path.contains("..") || path.contains("%")) return null;
        if (!APK_PATH.matcher(path).matches()) return null;
        return u;
    }

    /** 호출한 화면(메인 프레임 URL)이 우리 출처인가 — https · 정확한 호스트 · userInfo 없음 · 기본 포트 */
    public static boolean fromOrigin(String url) {
        if (url == null) return false;
        try {
            URI u = URI.create(url);
            return "https".equals(u.getScheme()) && u.getHost() != null && HOST.equals(u.getHost().toLowerCase(Locale.ROOT))
                    && u.getRawUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443);
        } catch (Exception e) {
            return false;
        }
    }

    /** 리다이렉트는 따라가지 않는다 — 3xx 는 출처 실패(origin)로 본다. */
    public static boolean isRedirect(int status) {
        return status >= 300 && status < 400;
    }

    /** json 의 size 가 받을 만한가 */
    public static boolean sizeOk(long size) {
        return size > 0 && size <= MAX_SIZE;
    }

    /** 받는 중 — 약속한 크기를 넘으면 즉시 끊는다(Content-Length 를 믿지 않는다). */
    public static boolean exceeds(long received, long size) {
        return received > size;
    }

    /** 빈 공간이 크기의 두 배는 있어야 한다(받기 + 설치 세션 복사). */
    public static boolean spaceOk(long usable, long size) {
        return usable >= size * 2;
    }

    public static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    /**
     * 서명자 고르기(P2 시험 M-1 · 안드로이드 H-1) — 안드로이드 API 없이 시험하려고 인증서 바이트로 받는다.
     * signingInfo 가 있으면: 여러 서명자면 그 전부, 하나면 회전 기록(history)의 **마지막**(= 지금 서명자).
     * signingInfo 를 못 읽었으면(일부 API 의 보관 파일 읽기) 옛 signatures 로. 둘 다 없으면 빈 목록(= 모름 → 받은 APK 면 실패).
     */
    public static java.util.List<String> pickSigners(
            boolean hasSigningInfo, boolean multiple, byte[][] contents, byte[][] history, byte[][] legacy) {
        byte[][] pick = null;
        if (hasSigningInfo) {
            if (multiple) pick = contents;
            else if (history != null && history.length > 0) pick = new byte[][] {history[history.length - 1]};
        }
        if ((pick == null || pick.length == 0) && legacy != null && legacy.length > 0) pick = legacy;
        java.util.List<String> out = new java.util.ArrayList<>();
        if (pick == null) return out;
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            for (byte[] b : pick) if (b != null) out.add(hex(md.digest(b)));
        } catch (java.security.NoSuchAlgorithmException e) {
            out.clear();
        }
        return out;
    }

    /** 지문 문자열을 비교용으로(소문자 · 콜론 없음) */
    public static String normFp(String fp) {
        return fp == null ? "" : fp.replace(":", "").trim().toLowerCase(Locale.ROOT);
    }

    public static Set<String> normSet(Collection<String> fps) {
        Set<String> out = new HashSet<>();
        if (fps != null) for (String f : fps) {
            String n = normFp(f);
            if (!n.isEmpty()) out.add(n);
        }
        return out;
    }

    /**
     * 설치 판정 — null 이면 설치해도 된다. 아니면 실패 코드(package · downgrade · signature).
     *
     * @param apkPackage   받은 APK 의 패키지 이름
     * @param apkVersion   받은 APK 의 versionCode
     * @param currentVersion 지금 설치된 versionCode
     * @param apkSigners   받은 APK 서명자 지문들(비면 서명을 읽지 못함 → 실패)
     * @param installedSigners 설치된 앱 서명자 지문들(비면 「모름」 — 상수 지문만으로 판정)
     * @param expected     앱 안 상수 지문(비면 「모름」 — 설치본 집합만으로 판정 · 둘 다 모르면 실패)
     */
    public static String installVerdict(
            String apkPackage,
            long apkVersion,
            long currentVersion,
            Collection<String> apkSigners,
            Collection<String> installedSigners,
            String expected) {
        if (!PACKAGE.equals(apkPackage)) return "package";
        if (apkVersion <= currentVersion) return "downgrade";
        Set<String> apk = normSet(apkSigners);
        Set<String> inst = normSet(installedSigners);
        String exp = normFp(expected);
        if (apk.isEmpty()) return "signature";
        if (inst.isEmpty() && exp.isEmpty()) return "signature";
        // 서명자 집합이 설치본과 **같아야** 한다(안드로이드가 같은 패키지 업데이트에서 강제하는 것과 같은 규칙 · 여러 서명자 포함)
        if (!inst.isEmpty() && !apk.equals(inst)) return "signature";
        // [원본] 앱 안 상수 지문은 그 집합에 들어 있어야 한다(설치본을 읽지 못했을 때의 근거이기도 하다)
        // [원본] if (!exp.isEmpty() && !apk.contains(exp)) return "signature";
        // [개선] 설치본을 읽지 못했으면 받은 APK 의 서명자는 **상수 하나뿐**이어야 한다 — 서명자를 하나 더 붙인 APK 를 막는다(P2 보안 L-3)
        if (!exp.isEmpty() && inst.isEmpty() && !apk.equals(Collections.singleton(exp))) return "signature";
        if (!exp.isEmpty() && !apk.contains(exp)) return "signature";
        return null;
    }

    /** 설치기가 플레이면 자체 업데이트를 하지 않는다(플레이 정책 · 안드로이드 M-10). */
    public static boolean selfUpdateAllowed(String installer) {
        return !"com.android.vending".equals(installer);
    }

    /**
     * 웹이 받는 **닫힌 실패 코드 표**(P2 계약 H-3) — 웹 `src/frontend/lib/appDistribution.ts` 문구표와 1:1.
     * 이 밖의 값은 {@link #code} 가 failure 로 바꾼다. 뜻이 겹치지 않게 나눈다:
     * origin(호출 화면·주소·리다이렉트) · invalid(인자 형식) · busy(이미 받는 중) · cancelled(사용자가 받기 취소) ·
     * network(연결·HTTP) · size(약속한 크기와 다름) · hash(받은 바이트가 sha256 과 다름) · space(빈 공간 부족) ·
     * storage(파일 쓰기·옮기기) · missing(받은 파일 없음 — 다시 받기) · store(플레이 설치본) · package · downgrade(같거나 낮은 판 — 「이미 최신」) ·
     * signature · notAllowed(출처를 알 수 없는 앱 설치 허용 꺼짐) · failure(그 밖).
     */
    public static final Set<String> ERROR_CODES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "origin", "invalid", "busy", "cancelled", "network", "size", "hash", "space", "storage", "missing", "store",
            "package", "downgrade", "signature", "notAllowed", "failure")));

    /** 표 밖의 코드를 failure 로 */
    public static String code(String c) {
        return c != null && ERROR_CODES.contains(c) ? c : "failure";
    }

    /**
     * 웹이 보낸 size — 브리지가 작은 수를 Integer 로, 큰 수를 Long·Double 로 풀어 준다(P2 시험 H-1: getLong 은 Integer 면 null).
     * 정수인 양수만 받는다. 아니면 -1.
     */
    public static long parseSize(Object o) {
        if (!(o instanceof Number)) return -1;
        double d = ((Number) o).doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d) || d <= 0 || d != Math.floor(d) || d > MAX_SIZE) return -1;
        return (long) d;
    }

    /** 받기 응답 판정 — null 이면 계속. 3xx 는 origin, 200 밖은 network(P2 시험 M-4). */
    public static String httpVerdict(int status) {
        if (isRedirect(status)) return "origin";
        if (status != 200) return "network";
        return null;
    }

    /** 받기 IO 예외의 코드 — 공간 부족은 space, 나머지는 network */
    public static String ioCode(String message) {
        return message != null && (message.contains("ENOSPC") || message.contains("No space left")) ? "space" : "network";
    }

    /** 설치 표식 수명 — 이보다 오래된 표식은 「업데이트됐습니다」·완료 알림에 쓰지 않는다(P2 안드로이드 M-5) */
    public static final long MARK_TTL_MS = 30 * 60_000L;

    /**
     * 다시 열린 앱의 판정(P2 시험 M-6) — "updated"(표식 판 이상으로 바뀜 · 시간 무관) · "stale"(바뀌지 않았고 오래됨 → 지움) ·
     * "waiting"(아직 설치 중일 수 있음) · "none"(표식 없음).
     */
    public static String markVerdict(boolean hasMark, long markTo, long currentVc, long markAt, long nowMs) {
        if (!hasMark) return "none";
        if (currentVc >= markTo) return "updated";
        if (nowMs < markAt || nowMs - markAt > MARK_TTL_MS) return "stale"; // 시계 역행도 오래된 것으로
        return "waiting";
    }

    /** 업데이트 완료 알림 — 표식이 있고, 30분 안이고, 지금 판이 표식 판 이상일 때만(adb·다른 경로 교체에는 조용히) */
    public static boolean notifyOnReplaced(boolean hasMark, long markTo, long currentVc, long markAt, long nowMs) {
        return hasMark && currentVc >= markTo && nowMs >= markAt && nowMs - markAt <= MARK_TTL_MS;
    }

    /** PackageInstaller 상태 코드 → 화면이 쓰는 이름 */
    public static String statusName(int status) {
        switch (status) {
            case 0: return "success"; // STATUS_SUCCESS
            case -1: return "pending"; // STATUS_PENDING_USER_ACTION
            case 3: return "aborted"; // STATUS_FAILURE_ABORTED
            case 2: return "blocked"; // STATUS_FAILURE_BLOCKED
            case 5: return "conflict"; // STATUS_FAILURE_CONFLICT
            case 7: return "incompatible"; // STATUS_FAILURE_INCOMPATIBLE
            case 4: return "invalid"; // STATUS_FAILURE_INVALID
            case 6: return "storage"; // STATUS_FAILURE_STORAGE
            case 8: return "timeout"; // STATUS_FAILURE_TIMEOUT (API 34)
            default: return "failure"; // STATUS_FAILURE(1) 등
        }
    }
}
