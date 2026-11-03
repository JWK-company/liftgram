package org.tarae.liftgram.lock;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * 휴식 끝 소리 — 웹 `src/frontend/lib/restSound.ts` 의 프리셋 4종(ding·chime·triad·buzz) × 음량 3단계를 같은 음으로 합성한다
 * (웹 마스터 버스와 같은 소프트클립 tanh(2.5·x) — 입력은 [-1,1]로 자른 뒤 · 지수 여닫이). wav 12개를 싣는 대신 같은 식으로 만들어
 * 웹과 소리가 어긋나지 않게 했다(REV-007 표시 H-5 — 처음엔 곡선이 달라 mid 가 4.6dB 작았다). 사각파는 대역 제한이 없어 웹보다 조금 거칠다.
 * USAGE_ALARM 이라 무음 모드·미디어 음량과 무관하게 알람 음량으로 난다. 호출한 스레드에서 끝날 때까지 기다린다(리시버 goAsync 안).
 */
public final class RestSound {
    static final int RATE = 44_100;

    private RestSound() {}

    static final class Note {
        final double freq, at, dur, peak;
        final boolean square;

        Note(double freq, double at, double dur, double peak, boolean square) {
            this.freq = freq;
            this.at = at;
            this.dur = dur;
            this.peak = peak;
            this.square = square;
        }
    }

    static Note[] preset(String kind) {
        switch (kind == null ? "ding" : kind) {
            case "chime":
                return new Note[] {new Note(659, 0, 0.32, 0.9, false), new Note(988, 0.16, 0.4, 0.9, false), new Note(1318.5, 0.34, 0.6, 0.85, false)};
            case "triad":
                return new Note[] {new Note(523.25, 0, 0.5, 0.6, false), new Note(659.25, 0, 0.5, 0.55, false), new Note(784, 0, 0.55, 0.55, false)};
            case "buzz":
                return new Note[] {new Note(196, 0, 0.14, 0.5, true), new Note(196, 0.22, 0.14, 0.5, true), new Note(196, 0.44, 0.2, 0.5, true)};
            default:
                return new Note[] {new Note(880, 0, 0.2, 1, false), new Note(1318.5, 0.2, 0.28, 1, false)};
        }
    }

    /** 웹 VOLUME_DRIVE(mid 0.6 · loud 1.3 · max 3.0) — 스냅샷 sound.volume 1·2·3 */
    static double drive(int volume) {
        return volume <= 1 ? 0.6 : volume == 2 ? 1.3 : 3.0;
    }

    /** PCM 16bit 모노 — 순수 계산(JVM 테스트 가능). */
    public static short[] render(String kind, int volume) {
        Note[] notes = preset(kind);
        double end = 0;
        for (Note n : notes) end = Math.max(end, n.at + n.dur + 0.05);
        int len = (int) (end * RATE);
        double[] mix = new double[len];
        double d = drive(volume);
        for (Note n : notes) {
            int s0 = (int) (n.at * RATE);
            int sn = (int) ((n.dur + 0.05) * RATE);
            double peak = Math.max(0.0002, n.peak * d);
            for (int i = 0; i < sn && s0 + i < len; i++) {
                double t = i / (double) RATE;
                double env;
                if (t < 0.02) env = 0.0001 * Math.pow(peak / 0.0001, t / 0.02);
                else if (t < n.dur) env = peak * Math.pow(0.0001 / peak, (t - 0.02) / (n.dur - 0.02));
                else env = 0;
                double ph = 2 * Math.PI * n.freq * t;
                double w = n.square ? Math.signum(Math.sin(ph)) : (2 / Math.PI) * Math.asin(Math.sin(ph)); // 사각 · 삼각
                mix[s0 + i] += w * env;
            }
        }
        short[] pcm = new short[len];
        // [원본] pcm[i] = tanh(mix[i]) * 0.9 — 웹 곡선(TANH_CURVE = tanh(2.5x) · WaveShaper 가 [-1,1] 로 자름)과 달랐다
        for (int i = 0; i < len; i++) pcm[i] = (short) Math.round(shape(mix[i]) * 0.9 * Short.MAX_VALUE);
        return pcm;
    }

    /** 웹 src/frontend/lib/restSound.ts 의 TANH_CURVE — WaveShaper 는 곡선 밖 입력을 끝값으로 자른다. */
    static double shape(double x) {
        double c = Math.max(-1, Math.min(1, x));
        return Math.tanh(2.5 * c);
    }

    public static void play(Context ctx, String kind, int volume) {
        try {
            vibrate(ctx);
            short[] pcm = render(kind, volume);
            AudioTrack tr = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.length * 2)
                    .build();
            tr.write(pcm, 0, pcm.length);
            tr.play();
            Thread.sleep((long) (pcm.length * 1000.0 / RATE) + 100);
            tr.release();
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "휴식 끝 소리 실패", e);
        }
    }

    static void vibrate(Context ctx) {
        try {
            Vibrator v = ctx.getSystemService(Vibrator.class);
            if (v == null) return;
            long[] pattern = {0, 120, 60, 120};
            // 백그라운드 진동은 용도가 알람이어야 버려지지 않는다(REV-007 플랫폼 M-3)
            AudioAttributes alarm = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
            if (Build.VERSION.SDK_INT >= 33) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1), android.os.VibrationAttributes.createForUsage(android.os.VibrationAttributes.USAGE_ALARM));
            } else if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1), alarm);
            } else {
                v.vibrate(pattern, -1, alarm);
            }
        } catch (Exception ignored) {
            // 진동 없음
        }
    }
}
