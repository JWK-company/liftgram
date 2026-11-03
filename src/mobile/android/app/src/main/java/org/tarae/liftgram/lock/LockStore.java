package org.tarae.liftgram.lock;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 잠금 카드 저장소 — 단일 직렬 실행기로만 고친다(SPEC-017 §6 네이티브 원자성 · REV-003 동시성 M-7).
 * 버튼(리시버)·웹 다리(플러그인)·알람이 동시에 와도 읽고-고치고-쓰기가 한 줄로 돈다. 쓰기는 동기 저장(commit)이다.
 * 저장 방식은 주입한다(앱 = SharedPreferences · JVM 테스트 = 메모리).
 */
public final class LockStore {
    public interface Persist {
        String load();

        /** 디스크에 닿을 때까지 기다린다(SharedPreferences.commit) — 실패하면 false. */
        boolean save(String json);
    }

    public interface Op<T> {
        T run(LockState s) throws Exception;
    }

    private final Persist persist;
    private final ExecutorService exec = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "liftgram-lock-store");
        t.setDaemon(true);
        return t;
    });
    private LockState state; // 실행기 스레드에서만 만진다

    public LockStore(Persist persist) {
        this.persist = persist;
    }

    private LockState loaded() {
        if (state == null) state = LockState.fromJson(persist.load());
        return state;
    }

    /**
     * 읽고-고치고-쓰기 한 번(실행기 안) — 사본에서 고치고, 디스크에 닿은 뒤에만 메모리를 바꾼다(REV-007 계약 H-2).
     * 조작이 던지거나 저장이 실패하면 상태는 그대로이고 예외가 호출자에게 간다(카드가 「완료됨」처럼 보이지 않게).
     */
    public <T> T write(Op<T> op) throws Exception {
        return run(() -> {
            LockState cur = loaded();
            String before = cur.toJson();
            LockState work = LockState.fromJson(before);
            T out = op.run(work);
            String after = work.toJson();
            if (!after.equals(before)) {
                work.gen = cur.gen + 1;
                after = work.toJson();
                if (!persist.save(after)) throw new java.io.IOException("잠금 카드 저장 실패(commit false)");
                state = work;
            }
            return out;
        });
    }

    /** 읽기만(실행기 안 · 사본·저장 없음 — 상태를 고치지 않는 조작만). */
    public <T> T read(Op<T> op) throws Exception {
        return run(() -> op.run(loaded()));
    }

    private <T> T run(java.util.concurrent.Callable<T> c) throws Exception {
        try {
            return exec.submit(c).get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            throw e;
        }
    }
}
