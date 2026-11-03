package org.tarae.liftgram.update;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.util.Collections;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * 실제 PackageManager 로 업데이트 검사(SPEC-018 Phase 2 · P2 시험 M-2·M-8 · 안드로이드 H-1).
 *
 * <p>디버그 빌드에서만 돈다(run-as 로 파일을 심는다). 출시 키는 시험에 들이지 않는다 — 출시 서명 APK 는 「서명자를 읽는가」만 본다.
 * 심는 법(src/scripts 밖 · 사람이 돌리는 확인 · EXE-007 에 명령):
 * <pre>
 *   adb push rel4.apk dbg4.apk /data/local/tmp/
 *   adb shell run-as org.tarae.liftgram sh -c 'mkdir -p cache/updates; cp /data/local/tmp/rel4.apk cache/updates/&lt;sha&gt;.apk; …'
 *   adb shell am instrument -w -e rel &lt;sha&gt; -e dbg &lt;sha&gt; -e relCert &lt;fp&gt; org.tarae.liftgram.test/androidx.test.runner.AndroidJUnitRunner
 * </pre>
 */
@RunWith(AndroidJUnit4.class)
public class UpdateInstallerDeviceTest {
    private static Context ctx() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static String arg(String k) {
        Bundle b = InstrumentationRegistry.getArguments();
        return b.getString(k);
    }

    private static File planted(String key) {
        String id = arg(key);
        assumeTrue("인자 " + key + " 없음 — 심은 파일이 없으면 건너뛴다", id != null);
        try {
            File f = UpdateInstaller.fileFor(ctx(), id);
            assumeTrue("심은 파일 없음: " + f, f.isFile());
            return f;
        } catch (UpdateInstaller.Failure e) {
            throw new AssertionError(e);
        }
    }

    /** 이 기기·API 에서 받은 APK(보관 파일)의 서명자를 읽는다 — 못 읽으면 정상 업데이트가 영구히 막힌다(안드로이드 H-1) */
    @Test
    public void 받은_APK_서명자를_읽는다() {
        File rel = planted("rel");
        List<String> s = UpdateInstaller.signers(UpdateInstaller.archive(ctx(), rel));
        assertEquals(Collections.singletonList(ApkCheck.normFp(arg("relCert"))), s);
    }

    @Test
    public void 설치본_서명자를_읽는다() throws Exception {
        List<String> s = UpdateInstaller.signers(UpdateInstaller.self(ctx()));
        assertEquals(1, s.size());
        assertEquals(64, s.get(0).length());
    }

    /** 디버그 설치본(3) 위에 같은 키·더 높은 판(4) → 통과 · 출시 키 APK → signature · 같은 판 → downgrade */
    @Test
    public void 실제_판정() throws Exception {
        String mine = UpdateInstaller.signers(UpdateInstaller.self(ctx())).get(0);
        File dbg = planted("dbg");
        assertEquals(4, UpdateInstaller.check(ctx(), dbg, mine));
        try {
            UpdateInstaller.check(ctx(), planted("rel"), mine);
            fail("다른 키 APK 가 통과");
        } catch (UpdateInstaller.Failure f) {
            assertEquals("signature", f.code);
        }
        // 상수 지문(출시 키)으로는 디버그 키 APK 를 거절 — 디버그 빌드가 늘 「다시 설치」인 이유(P2 시험 H-2)
        try {
            UpdateInstaller.check(ctx(), dbg, arg("relCert"));
            fail("상수와 다른 키가 통과");
        } catch (UpdateInstaller.Failure f) {
            assertEquals("signature", f.code);
        }
        try {
            UpdateInstaller.check(ctx(), new File(dbg.getParentFile(), "없음.apk"), mine);
            fail("없는 파일");
        } catch (UpdateInstaller.Failure f) {
            assertEquals("missing", f.code);
        }
    }

    /** 세션에 쓰고 commit 까지(확인 화면은 시험 밖) → 표식·세션 id → 취소하면 지워진다 */
    @Test
    public void 세션_설치_시작과_취소() throws Exception {
        String mine = UpdateInstaller.signers(UpdateInstaller.self(ctx())).get(0);
        File dbg = planted("dbg");
        int sid = UpdateInstaller.install(ctx(), dbg.getName().replace(".apk", ""), mine);
        assertTrue(sid > 0);
        assertEquals(sid, UpdateInstaller.currentSession(ctx()));
        UpdateInstaller.cancel(ctx());
        assertEquals(-1, UpdateInstaller.currentSession(ctx()));
        assertFalse(UpdateInstaller.prefs(ctx()).contains(UpdateInstaller.K_INSTALLING));
    }

    @Test
    public void 없는_id_형식() {
        try {
            UpdateInstaller.fileFor(ctx(), "../x");
            fail();
        } catch (UpdateInstaller.Failure f) {
            assertEquals("invalid", f.code);
        }
        assertNotNull(UpdateInstaller.dir(ctx()));
    }
}
