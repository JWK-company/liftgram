package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** 네이티브 저장소 계약(SPEC-017 §6·§7) — 버튼·ack·스냅샷의 순서와 경합. 웹 쪽은 lockDrain 단위·lock-bridge e2e 가 맡는다. */
public class LockStoreTest {
    static final class Mem implements LockStore.Persist {
        volatile String data;
        int saves;
        volatile boolean fail;

        @Override
        public String load() {
            return data;
        }

        @Override
        public boolean save(String json) {
            if (fail) return false;
            data = json;
            saves++;
            return true;
        }
    }

    static JSONObject member(String id, double kg, int reps) throws Exception {
        return new JSONObject()
                .put("setId", id)
                .put("exerciseName", "벤치")
                .put("setNo", 1)
                .put("setTotal", 3)
                .put("label", "1")
                .put("unit", "kg")
                .put("oneSide", false)
                .put("display", new JSONObject().put("weight", kg).put("reps", reps).put("seconds", JSONObject.NULL).put("distanceM", JSONObject.NULL))
                .put("expect", new JSONObject().put("weightKg", kg).put("reps", reps).put("seconds", JSONObject.NULL));
    }

    static JSONObject step(double kg, String... ids) throws Exception {
        JSONArray ms = new JSONArray();
        for (String id : ids) ms.put(member(id, kg, 5));
        return new JSONObject().put("setIds", new JSONArray(ids)).put("members", ms).put("restAfterSec", 90).put("openApp", false);
    }

    static JSONObject snap(long applied, String storeId, JSONObject... steps) throws Exception {
        return new JSONObject()
                .put("v", 3)
                .put("sessionId", "w1")
                .put("title", "가슴")
                .put("steps", new JSONArray(steps))
                .put("rest", new JSONObject().put("endsAt", JSONObject.NULL).put("totalSec", JSONObject.NULL).put("setAt", 0).put("by", "web"))
                .put("appliedThroughSeq", applied)
                .put("storeId", storeId)
                .put("dbEpoch", "E")
                .put("paused", false)
                .put("sound", new JSONObject().put("enabled", true).put("preset", "ding").put("volume", 2))
                .put("updatedAt", 1)
                .put("truncated", false);
    }

    @Test
    public void 완료_버튼은_보이는_단계를_조작으로_고정하고_사본에서_뺀다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1000);
        JSONObject a = s.pressComplete(5000, "a1");
        assertNotNull(a);
        assertEquals(1, a.getLong("seq"));
        assertEquals("[\"a1\"]", a.getJSONArray("setIds").toString());
        assertEquals("E", a.getString("dbEpoch"));
        assertEquals(60.0, a.getJSONArray("expect").getJSONObject(0).getDouble("weightKg"), 0);
        assertEquals("a2", s.currentStep().getJSONArray("setIds").getString(0));
        // 단계 휴식(90초)이 걸린다 · by native
        assertEquals(5000 + 90_000, s.rest.getLong("endsAt"));
        assertEquals("native", s.rest.getString("by"));
        assertEquals(1, s.drain().getJSONArray("actions").length());
    }

    @Test
    public void ack_가_스냅샷보다_먼저_와도_덮이기_전에는_rebase_에_남는다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1000);
        JSONObject a = s.pressComplete(2000, null);
        s.ack(Collections.singleton(a.getString("id")));
        assertEquals(0, s.drain().getJSONArray("actions").length());
        assertEquals(1, s.queue.size());
        // 웹이 적용 전에 읽은 낡은 스냅샷(appliedThroughSeq 0 · a1 이 아직 남음)이 늦게 와도 a1 을 다시 보이지 않는다
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 3000);
        assertEquals("a2", s.currentStep().getJSONArray("setIds").getString(0));
        // 덮는 스냅샷이 오면 지운다
        s.update(snap(1, s.storeId, step(60, "a2")), 4000);
        assertEquals(0, s.queue.size());
    }

    @Test
    public void 거꾸로_가는_스냅샷은_버린다_dbEpoch_가_바뀌면_받는다() throws Exception {
        LockState s = LockState.fresh();
        assertTrue(s.update(snap(5, s.storeId, step(60, "a1")), 1));
        assertFalse(s.update(snap(4, s.storeId, step(60, "x")), 2));
        JSONObject other = snap(0, s.storeId, step(60, "b1")).put("dbEpoch", "E2");
        assertTrue(s.update(other, 3));
        assertEquals("b1", s.currentStep().getJSONArray("setIds").getString(0));
    }

    @Test
    public void 앱_열기_일시정지_대기열_막힘이면_완료를_만들지_않는다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1").put("openApp", true)), 1);
        assertNull(s.pressComplete(2, null));
        s.update(snap(0, s.storeId, step(60, "a1")).put("paused", true), 3);
        assertNull(s.pressComplete(4, null));
        // 60초 넘게 ack 가 없으면 막힘 → 앱 열기
        JSONObject[] steps = new JSONObject[5];
        for (int i = 0; i < 5; i++) steps[i] = step(60, "s" + i);
        s.update(snap(0, s.storeId, steps), 5);
        assertNotNull(s.pressComplete(10_000, null));
        assertTrue(s.canComplete(70_000));
        assertFalse(s.canComplete(70_001));
        assertNull(s.pressComplete(70_001, null));
    }

    @Test
    public void 휴식_LWW_더하기_끝내기() throws Exception {
        LockState s = LockState.fresh();
        s.addRest(30, 1000);
        assertNull("카드가 없으면 +30초는 아무것도 안 한다", s.rest);
        s.update(snap(0, s.storeId, step(60, "a1")), 1);
        s.rest = null;
        s.addRest(30, 1000);
        assertEquals(31_000, s.rest.getLong("endsAt"));
        s.addRest(30, 2000);
        assertEquals(61_000, s.rest.getLong("endsAt"));
        assertEquals(60, s.rest.getLong("totalSec"));
        // 웹의 더 이른 setAt 은 진다 · 더 늦은 setAt 은 이긴다
        s.setRest(new JSONObject().put("endsAt", 9).put("totalSec", 1).put("setAt", 1500).put("by", "web"));
        assertEquals(61_000, s.rest.getLong("endsAt"));
        s.setRest(new JSONObject().put("endsAt", 99_000).put("totalSec", 90).put("setAt", 3000).put("by", "web"));
        assertEquals(99_000, s.rest.getLong("endsAt"));
        s.endRest(4000);
        assertTrue(s.rest.isNull("endsAt"));
        assertEquals(0, LockRules.restRemainingSec(s.rest, 4000));
    }

    @Test
    public void 저장_왕복과_새_저장소() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1")), 1);
        s.pressComplete(2, null);
        LockState t = LockState.fromJson(s.toJson());
        assertEquals(s.storeId, t.storeId);
        assertEquals(1, t.seq);
        assertEquals(1, t.queue.size());
        LockState broken = LockState.fromJson("{깨짐");
        assertFalse(broken.storeId.isEmpty());
        assertFalse(broken.storeId.equals(s.storeId));
        s.clear();
        assertEquals(0, s.drain().getJSONArray("actions").length());
        assertEquals(1, s.seq); // seq 는 설치 단위 — 지워도 이어진다
    }

    @Test
    public void ack와_버튼_동시_직렬_실행기에서_seq_는_겹치지_않고_잃는_조작이_없다() throws Exception {
        Mem mem = new Mem();
        LockStore store = new LockStore(mem);
        // 30개 넘게 ack 없이 쌓이면 막힘(「앱 열기」)이라 버튼이 null — 경합만 보려고 상한 안쪽으로(Swift 검사와 같음)
        final int N = 28; // 스레드 4개로 나눠지게
        JSONObject[] steps = new JSONObject[N];
        for (int i = 0; i < N; i++) steps[i] = step(60, "s" + i);
        String storeId = store.write(s -> s.storeId);
        store.write(s -> s.update(snap(0, storeId, steps), 1));
        CountDownLatch go = new CountDownLatch(1);
        List<Thread> ts = new ArrayList<>();
        Set<Long> seqs = Collections.synchronizedSet(new HashSet<>());
        AtomicReference<Throwable> err = new AtomicReference<>();
        // 버튼 N 번(스레드 4개) + 웹이 같은 사이 drain→ack 를 계속
        for (int t = 0; t < 4; t++) {
            Thread th = new Thread(() -> {
                try {
                    go.await();
                    for (int i = 0; i < N / 4; i++) {
                        JSONObject a = store.write(s -> s.pressComplete(2, null));
                        if (a != null) seqs.add(a.getLong("seq"));
                    }
                } catch (Throwable e) {
                    err.set(e);
                }
            });
            ts.add(th);
            th.start();
        }
        Set<String> acked = Collections.synchronizedSet(new HashSet<>());
        Thread web = new Thread(() -> {
            try {
                go.await();
                for (int i = 0; i < 50; i++) {
                    JSONArray acts = store.write(s -> s.drain().getJSONArray("actions"));
                    Set<String> ids = new HashSet<>();
                    for (int j = 0; j < acts.length(); j++) ids.add(acts.getJSONObject(j).getString("id"));
                    acked.addAll(ids);
                    store.write(s -> {
                        s.ack(ids);
                        return null;
                    });
                }
            } catch (Throwable e) {
                err.set(e);
            }
        });
        web.start();
        go.countDown();
        for (Thread th : ts) th.join();
        web.join();
        if (err.get() != null) throw new AssertionError(err.get());
        assertEquals(N, seqs.size());
        for (long i = 1; i <= N; i++) assertTrue("seq " + i, seqs.contains(i));
        // 남은 조작 + ack 된 조작 = 전부(잃지 않음) · 단계는 전부 빠졌다
        int left = store.write(s -> s.drain().getJSONArray("actions").length());
        assertEquals(N, acked.size() + left);
        assertNull(store.write(LockState::currentStep));
        // 디스크 사본도 같은 내용
        LockState disk = LockState.fromJson(mem.data);
        assertEquals(N, disk.seq);
    }

    // ── REV-007 반영 ──

    @Test
    public void 연타_두번째와_낡은_카드_버튼은_조작을_만들지_않는다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1);
        assertNotNull(s.pressComplete(10, "a1"));
        assertNull("같은 토큰 두 번", s.pressComplete(11, "a1"));
        assertEquals("a2", s.currentStep().getJSONArray("setIds").getString(0));
        assertEquals(1, s.seq);
    }

    @Test
    public void 다른_storeId_스냅샷의_워터마크는_믿지_않는다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "b1"), step(60, "b2")), 1);
        s.pressComplete(2, "b1");
        assertTrue(s.update(snap(57, "OLD", step(60, "b1"), step(60, "b2")), 3));
        assertEquals("방금 누른 b1 이 되살아나지 않는다", "b2", s.currentStep().getJSONArray("setIds").getString(0));
        assertEquals("다른 저장소 기준으로 지우지 않는다", 1, s.queue.size());
        assertTrue("storeId 가 바뀌면 seq 0 도 받는다", s.update(snap(0, s.storeId, step(60, "b2")), 4));
    }

    @Test
    public void 운동_끝은_카드와_휴식만_내리고_대기열은_drain_에_남긴다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1);
        s.pressComplete(2, "a1");
        s.end();
        assertNull(s.currentStep());
        assertNull(s.rest);
        assertFalse(s.canComplete(3));
        assertEquals(1, s.drain().getJSONArray("actions").length());
        assertTrue("끝난 세션은 휴식 없음", s.drain().isNull("rest"));
        assertFalse("같은 세션의 늦은 스냅샷은 카드를 되살리지 않는다", s.update(snap(9, s.storeId, step(60, "a2")), 4));
        JSONObject w2 = snap(1, s.storeId, step(60, "c1")).put("sessionId", "w2");
        assertTrue(s.update(w2, 5));
        s.ack(Collections.singleton(s.queue.get(0).getJSONObject("action").getString("id")));
        assertEquals("새 세션 스냅샷이 덮은 ack 조작은 지운다", 0, s.queue.size());
    }

    @Test
    public void 완료_뒤_낡은_스냅샷의_휴식은_지고_새_휴식은_이긴다_거부돼도_합친다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1);
        s.pressComplete(5000, "a1");
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 5100);
        assertEquals(95_000, s.rest.getLong("endsAt"));
        s.update(snap(1, s.storeId, step(60, "a2")).put("rest", new JSONObject().put("endsAt", 99_000).put("totalSec", 90).put("setAt", 6000).put("by", "web")), 6100);
        assertEquals(99_000, s.rest.getLong("endsAt"));
        s.update(snap(1, s.storeId, step(60, "a2")).put("rest", JSONObject.NULL), 6200);
        assertEquals("rest 없는 스냅샷은 휴식을 지우지 않는다", 99_000, s.rest.getLong("endsAt"));
        JSONObject back = snap(0, s.storeId, step(60, "x")).put("rest", new JSONObject().put("endsAt", 120_000).put("totalSec", 60).put("setAt", 7000).put("by", "web"));
        assertFalse(s.update(back, 7100));
        assertEquals("거꾸로 가는 스냅샷이어도 휴식은 LWW", 120_000, s.rest.getLong("endsAt"));
    }

    @Test
    public void 두_조작을_ack_하면_더_큰_스냅샷_한_장이_둘_다_지운다() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2"), step(60, "a3")), 1);
        JSONObject a = s.pressComplete(2, "a1");
        JSONObject b = s.pressComplete(3, "a2");
        s.ack(new HashSet<>(java.util.Arrays.asList(a.getString("id"), b.getString("id"))));
        assertEquals(2, s.queue.size());
        s.update(snap(2, s.storeId, step(60, "a3")), 4);
        assertEquals(0, s.queue.size());
    }

    @Test
    public void 묶음_단계_완료는_모든_멤버의_expect_와_정체성_필드를_싣는다() throws Exception {
        LockState s = LockState.fresh();
        JSONObject st = step(60, "a1", "b1");
        st.getJSONArray("members").getJSONObject(1).put("expect", new JSONObject().put("weightKg", 40).put("reps", 10)); // seconds 키 없음
        s.update(snap(0, s.storeId, st), 1);
        JSONObject a = s.pressComplete(7000, "a1,b1");
        assertEquals(s.storeId, a.getString("storeId"));
        assertEquals("w1", a.getString("sessionId"));
        assertEquals("complete", a.getString("kind"));
        assertEquals(7000, a.getLong("at"));
        assertFalse(a.getString("id").isEmpty());
        assertEquals("[\"a1\",\"b1\"]", a.getJSONArray("setIds").toString());
        JSONArray ex = a.getJSONArray("expect");
        assertEquals(2, ex.length());
        assertEquals("b1", ex.getJSONObject(1).getString("setId"));
        assertEquals(40, ex.getJSONObject(1).getInt("weightKg"));
        assertTrue("빠진 키도 null 로 채운다", ex.getJSONObject(1).has("seconds") && ex.getJSONObject(1).isNull("seconds"));
        assertNull(s.currentStep());
    }

    @Test
    public void 휴식_가장자리_끝난_뒤_더하기와_휴식_0초_단계() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1").put("restAfterSec", 0), step(60, "a2")), 1);
        s.addRest(30, 1000);
        assertEquals(31_000, s.rest.getLong("endsAt"));
        s.addRest(30, 100_000); // 끝난 뒤 — 지금부터 30초 · 총 30
        assertEquals(130_000, s.rest.getLong("endsAt"));
        assertEquals(30, s.rest.getLong("totalSec"));
        JSONObject before = new JSONObject(s.rest.toString());
        s.pressComplete(110_000, "a1");
        assertEquals("휴식 0초 단계는 돌던 휴식을 그대로 둔다", before.toString(), s.rest.toString());
    }

    @Test
    public void 쓰기는_사본에서_조작이_던지거나_저장이_실패하면_상태_그대로() throws Exception {
        Mem mem = new Mem();
        LockStore store = new LockStore(mem);
        String sid = store.write(x -> x.storeId);
        store.write(x -> x.update(snap(0, sid, step(60, "a1"), step(60, "a2")), 1));
        String disk = mem.data;
        try {
            store.write(x -> {
                x.pressComplete(2, "a1");
                throw new IllegalStateException("중간 실패");
            });
            throw new AssertionError("던져야 한다");
        } catch (IllegalStateException expected) {
            // 그대로
        }
        assertEquals(0L, (long) store.read(x -> x.seq));
        assertEquals("a1", store.read(x -> x.currentStep().getJSONArray("setIds").getString(0)));
        mem.fail = true;
        try {
            store.write(x -> x.pressComplete(3, "a1"));
            throw new AssertionError("저장 실패는 던져야 한다");
        } catch (java.io.IOException expected) {
            // 그대로
        }
        assertEquals(0L, (long) store.read(x -> x.seq));
        assertEquals(disk, mem.data);
        mem.fail = false;
        assertNotNull(store.write(x -> x.pressComplete(4, "a1")));
        // 새 프로세스 흉내 — 디스크에서 다시 읽어도 메모리와 같다
        LockStore again = new LockStore(mem);
        assertEquals(store.read(LockState::toJson), again.read(LockState::toJson));
        assertTrue("쓰기마다 세대가 오른다", again.read(x -> x.gen) > 0);
    }

    @Test
    public void 막힘_시각은_가장_오래된_미확인_더하기_60초() throws Exception {
        LockState s = LockState.fresh();
        s.update(snap(0, s.storeId, step(60, "a1"), step(60, "a2")), 1);
        assertNull(s.stallsAt());
        s.pressComplete(1000, "a1");
        s.pressComplete(5000, "a2");
        assertEquals(Long.valueOf(61_001), s.stallsAt());
    }
}
