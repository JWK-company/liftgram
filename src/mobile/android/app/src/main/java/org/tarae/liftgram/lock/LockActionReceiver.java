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
        if (ACTION_REST_DONE.equals(act)) {
            RestAlarm.onRestDone(ctx);
            return;
        }
        if (ACTION_DELETED.equals(act)) return; // 밀어 지움 — 다음 상태 변화 때 다시 낸다(플랫폼 L-1)
        LockStore store = LockHub.store(ctx);
        long now = System.currentTimeMillis();
        boolean fire = false;
        if (ACTION_COMPLETE.equals(act)) {
            fire = store.write(s -> s.pressComplete(now, token)) != null;
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
        // ACTION_REDRAW(막힘 시각) 포함 — 지금 상태로 다시 그린다
        LockHub.refresh(ctx);
        if (fire) LiftgramLockPlugin.fireAction();
    }
}
