package org.tarae.liftgram.update;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** 앱 설치 파일 업데이트 판정(SPEC-018 §5 · REV-009 보안 H-3·M-1·M-2) */
public class ApkCheckTest {
    static final String A = "7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8";
    static final String B = "50ef6650b9c6345aacbde2e998fb1808c3f9be0dd41790b5b46435b926ac91a4";
    static final String OK_PATH = "/downloads/liftgram-1.2.1-4-1a534e70.apk";

    @Test
    public void 허용되는_주소() {
        assertEquals("https://liftgram.tarae.org" + OK_PATH, ApkCheck.resolveDownloadUrl(OK_PATH).toString());
        assertNotNull(ApkCheck.resolveDownloadUrl("https://liftgram.tarae.org" + OK_PATH));
        assertNotNull(ApkCheck.resolveDownloadUrl("https://LIFTGRAM.tarae.org" + OK_PATH));
        assertNotNull(ApkCheck.resolveDownloadUrl("https://liftgram.tarae.org:443" + OK_PATH));
    }

    @Test
    public void 막는_주소() {
        List<String> bad = Arrays.asList(
                null,
                "",
                "http://liftgram.tarae.org" + OK_PATH, // https 아님
                "https://liftgram.tarae.org@evil.com" + OK_PATH, // userInfo
                "https://evil.com@liftgram.tarae.org" + OK_PATH, // userInfo
                "https://liftgram.tarae.org.evil.com" + OK_PATH, // 접미 호스트
                "https://evil.com" + OK_PATH,
                "//evil.com" + OK_PATH, // 스킴 생략 상대 주소
                "https://liftgram.tarae.org:8443" + OK_PATH, // 포트
                "/downloads/../api/x.apk", // ..
                "/downloads/liftgram-1.2.1-4-1a534e70.apk/../../x", // ..
                "/downloads/%2e%2e/liftgram-1-1-1a534e70.apk", // 인코딩
                "/downloads/liftgram-1.2.1-4-1a534e70.apk?x=1", // 쿼리
                "/downloads/liftgram-1.2.1-4-1a534e70.apk#f", // 조각
                "/downloads/other.apk", // 이름 규칙 밖
                "/downloads/liftgram-1.2.1-4-1A534E70.apk", // 대문자 해시
                "/downloads/sub/liftgram-1.2.1-4-1a534e70.apk", // 하위 경로
                "/media/file/liftgram-1.2.1-4-1a534e70.apk", // 다른 경로(사용자 업로드)
                "javascript:alert(1)",
                "file:///data/local/tmp/liftgram-1.2.1-4-1a534e70.apk",
                "content://x/liftgram-1.2.1-4-1a534e70.apk");
        for (String u : bad) assertNull(String.valueOf(u), ApkCheck.resolveDownloadUrl(u));
    }

    @Test
    public void 해시_이름_크기() {
        assertTrue(ApkCheck.isSha256(A));
        assertFalse(ApkCheck.isSha256(A.toUpperCase()));
        assertFalse(ApkCheck.isSha256(A.substring(1)));
        assertFalse(ApkCheck.isSha256("../" + A.substring(3)));
        assertFalse(ApkCheck.isSha256(null));
        assertTrue(ApkCheck.sizeOk(3_227_336));
        assertFalse(ApkCheck.sizeOk(0));
        assertFalse(ApkCheck.sizeOk(-1));
        assertFalse(ApkCheck.sizeOk(ApkCheck.MAX_SIZE + 1));
        assertFalse(ApkCheck.exceeds(100, 100));
        assertTrue(ApkCheck.exceeds(101, 100));
        assertTrue(ApkCheck.spaceOk(200, 100));
        assertFalse(ApkCheck.spaceOk(199, 100));
        assertTrue(ApkCheck.isRedirect(301));
        assertTrue(ApkCheck.isRedirect(302));
        assertFalse(ApkCheck.isRedirect(200));
        assertFalse(ApkCheck.isRedirect(404));
        assertEquals("00ff10", ApkCheck.hex(new byte[] {0, (byte) 0xff, 0x10}));
    }

    @Test
    public void 설치_판정() {
        List<String> a = Collections.singletonList(A);
        List<String> b = Collections.singletonList(B);
        String colonA = "7D:12:4A:8D:64:E3:8B:3F:2E:D6:E4:30:81:88:D3:36:D1:8F:87:F2:3F:0A:42:A3:FA:7E:1E:23:FA:E7:80:B8";
        // 통과
        assertNull(ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, a, a, A));
        assertNull(ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, Collections.singletonList(colonA), a, colonA));
        // 설치본 서명을 못 읽음 → 상수 지문으로
        assertNull(ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, a, Collections.<String>emptyList(), A));
        // 상수가 비었음(키 전 빌드) → 설치본 집합으로
        assertNull(ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, a, a, ""));
        // 실패
        assertEquals("package", ApkCheck.installVerdict("org.evil", 4, 3, a, a, A));
        assertEquals("downgrade", ApkCheck.installVerdict("org.tarae.liftgram", 3, 3, a, a, A));
        assertEquals("downgrade", ApkCheck.installVerdict("org.tarae.liftgram", 2, 3, a, a, A));
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, b, a, A)); // 다른 키
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, b, b, A)); // 설치본도 다른 키(옛 디버그) → 상수와 다름
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, Collections.<String>emptyList(), a, A)); // 서명 못 읽음
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, a, Collections.<String>emptyList(), "")); // 근거 없음
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, Arrays.asList(A, B), a, A)); // 서명자 하나 더
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, a, Arrays.asList(A, B), A)); // 설치본 집합과 다름
        // P2 보안 L-3 — 설치본을 못 읽었을 때 서명자를 하나 더 붙인 APK
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, Arrays.asList(A, B), Collections.<String>emptyList(), A));
        assertEquals("signature", ApkCheck.installVerdict("org.tarae.liftgram", 4, 3, b, Collections.<String>emptyList(), A));
    }

    @Test
    public void 호출_화면_출처() {
        assertTrue(ApkCheck.fromOrigin("https://liftgram.tarae.org/"));
        assertTrue(ApkCheck.fromOrigin("https://liftgram.tarae.org/workout?x=1#y"));
        assertTrue(ApkCheck.fromOrigin("https://LIFTGRAM.tarae.org:443/"));
        for (String u : Arrays.asList(null, "", "http://liftgram.tarae.org/", "https://liftgram.tarae.org.evil.com/",
                "https://evil.com/?liftgram.tarae.org", "https://liftgram.tarae.org@evil.com/", "https://u@liftgram.tarae.org/",
                "https://liftgram.tarae.org:8443/", "http://localhost:3100/", "file:///android_asset/offline.html", "about:blank",
                "javascript:alert(1)")) {
            assertFalse(String.valueOf(u), ApkCheck.fromOrigin(u));
        }
    }

    @Test
    public void 크기_읽기() {
        // 브리지는 작은 수를 Integer 로 준다 — getLong 은 null 이었다(P2 시험 H-1)
        assertEquals(3_227_336L, ApkCheck.parseSize(Integer.valueOf(3_227_336)));
        assertEquals(3_227_336L, ApkCheck.parseSize(Long.valueOf(3_227_336L)));
        assertEquals(3_227_336L, ApkCheck.parseSize(Double.valueOf(3_227_336d)));
        assertEquals(-1, ApkCheck.parseSize(Double.valueOf(1.5)));
        assertEquals(-1, ApkCheck.parseSize(Double.NaN));
        assertEquals(-1, ApkCheck.parseSize(0));
        assertEquals(-1, ApkCheck.parseSize(-5));
        assertEquals(-1, ApkCheck.parseSize(ApkCheck.MAX_SIZE + 1));
        assertEquals(-1, ApkCheck.parseSize("3227336"));
        assertEquals(-1, ApkCheck.parseSize(null));
        // JSONObject 가 실제로 주는 형(웹 JSON → 브리지)
        org.json.JSONObject j = new org.json.JSONObject();
        try {
            j = new org.json.JSONObject("{\"size\":3227336,\"big\":5000000000}");
        } catch (org.json.JSONException e) {
            throw new AssertionError(e);
        }
        assertEquals(3_227_336L, ApkCheck.parseSize(j.opt("size")));
        assertEquals(-1, ApkCheck.parseSize(j.opt("big"))); // 200MB 초과
    }

    @Test
    public void 받기_응답과_예외_코드() {
        assertNull(ApkCheck.httpVerdict(200));
        assertEquals("origin", ApkCheck.httpVerdict(301));
        assertEquals("origin", ApkCheck.httpVerdict(307));
        assertEquals("network", ApkCheck.httpVerdict(206));
        assertEquals("network", ApkCheck.httpVerdict(404));
        assertEquals("network", ApkCheck.httpVerdict(503));
        assertEquals("space", ApkCheck.ioCode("write failed: ENOSPC (No space left on device)"));
        assertEquals("network", ApkCheck.ioCode("timeout"));
        assertEquals("network", ApkCheck.ioCode(null));
    }

    @Test
    public void 닫힌_실패_코드표() {
        for (String c : Arrays.asList("origin", "invalid", "busy", "cancelled", "network", "size", "hash", "space", "storage",
                "missing", "store", "package", "downgrade", "signature", "notAllowed", "failure")) {
            assertEquals(c, ApkCheck.code(c));
        }
        assertEquals("failure", ApkCheck.code("incompatible"));
        assertEquals("failure", ApkCheck.code(null));
        assertEquals("failure", ApkCheck.code("HTTP 500"));
        // installVerdict 가 내는 값은 모두 표 안
        for (String v : Arrays.asList("package", "downgrade", "signature")) assertTrue(ApkCheck.ERROR_CODES.contains(v));
    }

    @Test
    public void 설치_표식_판정() {
        long at = 1_000_000L;
        assertEquals("none", ApkCheck.markVerdict(false, 4, 4, at, at));
        assertEquals("updated", ApkCheck.markVerdict(true, 4, 4, at, at + 1)); // 경계(=)
        assertEquals("updated", ApkCheck.markVerdict(true, 4, 5, at, at + ApkCheck.MARK_TTL_MS * 10)); // 오래돼도 바뀌었으면
        assertEquals("waiting", ApkCheck.markVerdict(true, 4, 3, at, at + ApkCheck.MARK_TTL_MS));
        assertEquals("stale", ApkCheck.markVerdict(true, 4, 3, at, at + ApkCheck.MARK_TTL_MS + 1));
        assertEquals("stale", ApkCheck.markVerdict(true, 4, 3, at, at - 1)); // 시계 역행
        // 완료 알림 — 표식 · 30분 안 · 판이 맞을 때만
        assertTrue(ApkCheck.notifyOnReplaced(true, 4, 4, at, at + 1000));
        assertFalse(ApkCheck.notifyOnReplaced(false, 4, 4, at, at + 1000));
        assertFalse(ApkCheck.notifyOnReplaced(true, 5, 4, at, at + 1000)); // 다른 판으로 교체(adb 등)
        assertFalse(ApkCheck.notifyOnReplaced(true, 4, 4, at, at + ApkCheck.MARK_TTL_MS + 1));
        assertFalse(ApkCheck.notifyOnReplaced(true, 4, 4, at, at - 1));
    }

    @Test
    public void 서명자_고르기() {
        byte[] c1 = {1, 2, 3};
        byte[] c2 = {4, 5, 6};
        byte[] old = {9, 9};
        String h1 = sha(c1);
        String h2 = sha(c2);
        // 하나 · 회전 기록이 있으면 마지막(지금 서명자)
        assertEquals(Collections.singletonList(h2), ApkCheck.pickSigners(true, false, null, new byte[][] {c1, c2}, null));
        // 여럿이면 그 전부
        assertEquals(Arrays.asList(h1, h2), ApkCheck.pickSigners(true, true, new byte[][] {c1, c2}, null, null));
        // signingInfo 를 못 읽음 → 옛 signatures(P2 안드로이드 H-1)
        assertEquals(Collections.singletonList(h1), ApkCheck.pickSigners(false, false, null, null, new byte[][] {c1}));
        // signingInfo 는 있는데 기록이 비었음 → 옛 signatures
        assertEquals(Collections.singletonList(h1), ApkCheck.pickSigners(true, false, null, new byte[0][], new byte[][] {c1}));
        // signingInfo 가 있으면 옛 값보다 우선
        assertEquals(Collections.singletonList(h2), ApkCheck.pickSigners(true, false, null, new byte[][] {c2}, new byte[][] {old}));
        // 아무것도 없음 = 모름
        assertTrue(ApkCheck.pickSigners(false, false, null, null, null).isEmpty());
    }

    private static String sha(byte[] b) {
        try {
            return ApkCheck.hex(java.security.MessageDigest.getInstance("SHA-256").digest(b));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new AssertionError(e);
        }
    }

    @Test
    public void 플레이_설치본은_자체_업데이트_안_함() {
        assertFalse(ApkCheck.selfUpdateAllowed("com.android.vending"));
        assertTrue(ApkCheck.selfUpdateAllowed("com.android.chrome"));
        assertTrue(ApkCheck.selfUpdateAllowed(null));
        assertTrue(ApkCheck.selfUpdateAllowed("org.tarae.liftgram"));
    }

    @Test
    public void 설치_상태_이름() {
        assertEquals("success", ApkCheck.statusName(0));
        assertEquals("pending", ApkCheck.statusName(-1));
        assertEquals("aborted", ApkCheck.statusName(3));
        assertEquals("blocked", ApkCheck.statusName(2));
        assertEquals("conflict", ApkCheck.statusName(5));
        assertEquals("storage", ApkCheck.statusName(6));
        assertEquals("invalid", ApkCheck.statusName(4));
        assertEquals("incompatible", ApkCheck.statusName(7));
        assertEquals("timeout", ApkCheck.statusName(8));
        assertEquals("failure", ApkCheck.statusName(1));
        assertEquals("failure", ApkCheck.statusName(99));
    }
}
