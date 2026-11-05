package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * 휴식 끝 소리가 음악 앱을 멈추지 않는가 — 이 시험이 음악 앱처럼 AUDIOFOCUS_GAIN 을 쥐고 받은 변화를 기록한다.
 * LOSS(영구)를 받으면 유튜브 뮤직·멜론은 멈추고 다시 틀지 않는다(사용자 보고 2026-11-05).
 */
@RunWith(AndroidJUnit4.class)
public class RestSoundFocusDeviceTest {
    private static final String TAG = "RestSoundFocus";
    private final List<Integer> changes = Collections.synchronizedList(new ArrayList<>());
    private AudioManager am;
    private AudioFocusRequest music;
    private HandlerThread thread;

    private Context ctx() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Before
    public void holdFocusLikeMusicApp() throws Exception {
        Assume.assumeTrue(android.os.Build.VERSION.SDK_INT >= 26);
        // 앞에 있는 앱만 포커스를 받는다 — 시험 프로세스가 곧 앱이라 화면을 먼저 띄운다
        android.content.Intent open = new android.content.Intent(ctx(), org.tarae.liftgram.MainActivity.class)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        InstrumentationRegistry.getInstrumentation().startActivitySync(open);
        Thread.sleep(1500);
        am = ctx().getSystemService(AudioManager.class);
        thread = new HandlerThread("music");
        thread.start();
        music = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build())
                .setOnAudioFocusChangeListener(c -> {
                    Log.i(TAG, "focus change " + c);
                    changes.add(c);
                }, new Handler(thread.getLooper()))
                .build();
        assertEquals(AudioManager.AUDIOFOCUS_REQUEST_GRANTED, am.requestAudioFocus(music));
    }

    @After
    public void release() {
        if (am != null && music != null) am.abandonAudioFocusRequest(music);
        if (thread != null) thread.quitSafely();
    }

    private void assertNeverLostForGood() {
        assertFalse("음악 앱이 영구 상실을 받았다: " + changes, changes.contains(AudioManager.AUDIOFOCUS_LOSS));
        assertFalse("음악 앱이 멈춤 상실을 받았다: " + changes, changes.contains(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT));
    }

    @Test
    public void 네이티브_소리는_음악을_멈추지_않고_돌려준다() throws Exception {
        RestSound.play(ctx(), "ding", 2);
        Thread.sleep(500);
        Log.i(TAG, "native changes=" + changes);
        assertNeverLostForGood();
        assertTrue("잠깐 줄였다가 돌려줘야 한다: " + changes, changes.contains(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK));
        assertEquals(AudioManager.AUDIOFOCUS_GAIN, (int) changes.get(changes.size() - 1));
    }

    /** 앱이 앞일 때의 옛 경로 — 웹뷰 AudioContext. 쓰지 않게 됐어도 어떤 웹뷰에서 무슨 일이 나는지 기록한다. */
    @Test
    public void 웹뷰_오디오_측정() throws Exception {
        final WebView[] web = new WebView[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            web[0] = new WebView(ctx());
            web[0].getSettings().setJavaScriptEnabled(true);
            web[0].getSettings().setMediaPlaybackRequiresUserGesture(false);
            web[0].loadDataWithBaseURL("https://liftgram.tarae.org/", "<html></html>", "text/html", "utf-8", null);
        });
        Thread.sleep(1500);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web[0].evaluateJavascript(
                "window.c=new AudioContext();var o=c.createOscillator();o.connect(c.destination);o.start();o.stop(c.currentTime+1);c.resume();",
                null));
        Thread.sleep(800);
        int active = am.getActivePlaybackConfigurations().size();
        Thread.sleep(2500);
        Log.i(TAG, "webview ua=" + WebView.getCurrentWebViewPackage().versionName + " active=" + active + " changes=" + changes);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web[0].destroy());
        assertNeverLostForGood();
    }
}
