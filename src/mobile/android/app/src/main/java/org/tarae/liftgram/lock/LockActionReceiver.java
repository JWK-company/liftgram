package org.tarae.liftgram.lock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 카드 버튼 → 저장소(SPEC-017 §11). 소리 재생·저장이 onReceive 뒤에도 이어지게 goAsync() 로 받는다.
 * 완료는 조작(대기열)을 만들고, +30초·건너뛰기는 조작 없이 rest 만 바꾼다(§7). 앱이 살아 있으면 웹 drain 을 깨운다.
 */
public class LockActionReceiver extends BroadcastReceiver {
    public static final String ACTION_COMPLETE = "org.tarae.liftgram.lock.COMPLETE";
    public static final String ACTION_PLUS30 = "org.tarae.liftgram.lock.PLUS30";
    public static final String ACTION_END_REST = "org.tarae.liftgram.lock.END_REST";
    public static final String ACTION_DELETED = "org.tarae.liftgram.lock.DELETED";
    public static final String ACTION_REST_DONE = "org.tarae.liftgram.lock.REST_DONE";
    public static final String ACTION_REDRAW = "org.tarae.liftgram.lock.REDRAW";
    public static final String EXTRA_TOKEN = "token";
    /** 잠금 운동 화면 전용(SPEC-060) — 알림 카드에는 없다 */
    public static final String ACTION_UNDO = "org.tarae.liftgram.lock.UNDO";
    public static final String ACTION_MINUS30 = "org.tarae.liftgram.lock.MINUS30";
    /** 밀어서 완료를 되돌릴 수 있게 붙잡는 시간(기본 · 화면이 접근성 권장값으로 늘릴 수 있다) */
    public static final long UNDO_MS = 5000;
    /** handle(ACTION_COMPLETE) 의 결과 — 조작을 만들었다 */
    public static final String DONE = "DONE";

    @Override
    public void onReceive(Context context, Intent intent) {
        final Context ctx = context.getApplicationContext();
        final String act = intent.getAction();
        final String token = intent.getStringExtra(EXTRA_TOKEN);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                handle(ctx, act, token);
            } catch (Exception e) {
                // 저장 실패 등 — 카드는 바꾸지 않는다(완료된 것처럼 보이지 않게 · 계약 H-2)
                android.util.Log.w("LiftgramLock", "버튼 처리 실패 " + act, e);
            } finally {
                pr.finish();
            }
        }, "liftgram-lock-action").start();
    }

    static void handle(Context ctx, String act, String token) throws Exception {
        handle(ctx, act, token, false);
    }

    /** withDraft — 잠금 운동 화면의 완료만 고른 값(초안)을 싣는다. 카드 버튼은 화면에 초안이 안 보이므로 싣지 않는다(REV-015 정합성 #3). */
    static void handle(Context ctx, String act, String token, boolean withDraft) throws Exception {
        handle(ctx, act, token, withDraft, 0);
    }

    /**
     * holdMs — 화면의 밀어서 완료는 그동안 붙잡는다(SPEC-060). 붙잡은 완료는 바로 웹을 깨우지 않는다 — 깨우면 drain 이 붙잡힌 항목 앞에서 멈출 뿐이고,
     * 끝 시각에 RestAlarm 의 REDRAW 알람이 깨운다(REV-146 계약 9).
     * @return ACTION_UNDO 의 결과(LockState.UNDONE·EXPIRED·GONE) · 그 밖에는 null
     */
    static String handle(Context ctx, String act, String token, boolean withDraft, long holdMs) throws Exception {
        // 프로세스가 죽었다 이 방송(휴식 끝·카드 버튼)으로 되살아났으면 화면 방송 등록이 없다 — 다음 잠금부터 다시 뜨게 한다. 실패해도 본 처리는 계속.
        try {
            LockScreenGate.ensureRegistered(ctx);
        } catch (Exception e) {
            android.util.Log.w("LiftgramLock", "화면 방송 등록 실패", e);
        }
        if (ACTION_REST_DONE.equals(act)) {
            RestAlarm.onRestDone(ctx);
            return null;
        }
        if (ACTION_DELETED.equals(act)) return null; // 밀어 지움 — 다음 상태 변화 때 다시 낸다(플랫폼 L-1)
        LockStore store = LockHub.store(ctx);
        long now = System.currentTimeMillis();
        boolean fire = false;
        String result = null;
        if (ACTION_COMPLETE.equals(act)) {
            // [원본] fire = store.write(s -> s.pressComplete(now, token, withDraft)) != null;
            boolean made = store.write(s -> s.pressComplete(now, token, withDraft, holdMs)) != null;
            fire = made && holdMs <= 0;
            result = made ? DONE : null; // 화면이 실제로 완료됐을 때만 「직전 완료」로 센다(REV-148 4)
        } else if (ACTION_UNDO.equals(act)) {
            result = store.write(s -> s.undoComplete(token, System.currentTimeMillis())); // 시각은 실행기 안에서(REV-147 2)
        } else if (ACTION_MINUS30.equals(act)) {
            store.write(s -> {
                if (s.snapshot == null) return false;
                s.addRest(-30, now);
                return true;
            });
            fire = true;
        } else if (ACTION_PLUS30.equals(act)) {
            fire = store.write(s -> {
                if (s.snapshot == null) return false;
                s.addRest(30, now);
                return true;
            });
        } else if (ACTION_END_REST.equals(act)) {
            fire = store.write(s -> {
                if (s.snapshot == null) return false;
                s.endRest(now);
                return true;
            });
        }
        // ACTION_REDRAW(막힘 시각 · 붙잡기 끝) 포함 — 지금 상태로 다시 그린다
        LockHub.refresh(ctx);
        // 붙잡기가 끝나면 웹을 깨워 그 완료를 가져가게 한다(REV-146 계약 9)
        if (ACTION_REDRAW.equals(act)) fire = true;
        if (fire) LiftgramLockPlugin.fireAction();
        return result;
    }
}
