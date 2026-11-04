package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** 휴식 끝 소리 합성 — 4종 × 음량 3 이 비어 있지 않고, 클립 없이(tanh) 음량 순서대로 커진다. */
public class RestSoundTest {
    static double rms(short[] p) {
        double s = 0;
        for (short v : p) s += (double) v * v;
        return Math.sqrt(s / p.length);
    }

    @Test
    public void 이어폰이면_미디어_없으면_알람() {
        assertEquals(android.media.AudioAttributes.USAGE_MEDIA, RestSound.usageFor(true));
        assertEquals(android.media.AudioAttributes.USAGE_ALARM, RestSound.usageFor(false));
        assertTrue(RestSound.isPersonalOutput(android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES));
        assertTrue(RestSound.isPersonalOutput(android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP));
        assertTrue(RestSound.isPersonalOutput(android.media.AudioDeviceInfo.TYPE_BLE_HEADSET));
        assertFalse(RestSound.isPersonalOutput(android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER));
        assertFalse(RestSound.isPersonalOutput(android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO));
    }

    @Test
    public void 프리셋_4종_음량_3단계() {
        for (String k : new String[] {"ding", "chime", "triad", "buzz", "모름"}) {
            double prev = 0;
            for (int vol = 1; vol <= 3; vol++) {
                short[] p = RestSound.render(k, vol);
                assertTrue(k + " 길이", p.length > RestSound.RATE / 4 && p.length < RestSound.RATE * 2);
                double r = rms(p);
                assertTrue(k + " 음량 " + vol + " > " + (vol - 1), r > prev);
                prev = r;
                for (short v : p) assertTrue(Math.abs(v) <= (int) (0.9 * Short.MAX_VALUE) + 1);
            }
        }
    }
}
