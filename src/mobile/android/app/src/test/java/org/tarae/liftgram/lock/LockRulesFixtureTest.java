package org.tarae.liftgram.lock;

import static org.junit.Assert.assertEquals;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * core 와 같은 정답 파일로 규칙을 검사한다(SPEC-017 Phase 4 · REV-005 테스트 M-6).
 * 정답은 `src/core/src/domain/__tests__/lockFixtures.test.ts` 가 만든다 — 여기서 고치지 않는다.
 */
public class LockRulesFixtureTest {
    static JSONObject fixtures() throws Exception {
        // gradle 단위 테스트의 작업 폴더 = android/app
        File f = new File("../../native/fixtures/lock-rules.json");
        return new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
    }

    static Object nul(Object o) {
        return o == JSONObject.NULL ? null : o;
    }

    @Test
    public void rebase() throws Exception {
        JSONArray cases = fixtures().getJSONArray("rebase");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            // 정답의 members 는 setId 만 — 입력도 {setId} 객체로
            JSONArray out = LockRules.rebase(c.getJSONArray("steps"), c.getLong("appliedThroughSeq"), c.getJSONArray("pending"));
            JSONArray got = new JSONArray();
            for (int j = 0; j < out.length(); j++) {
                JSONObject st = out.getJSONObject(j);
                JSONArray m = st.optJSONArray("members");
                Object ms = JSONObject.NULL; // members 없는 단계(core 타입은 선택) — 정답도 null
                if (m != null) {
                    JSONArray ids = new JSONArray();
                    for (int k = 0; k < m.length(); k++) ids.put(m.getJSONObject(k).getString("setId"));
                    ms = ids;
                }
                got.put(new JSONObject().put("setIds", st.getJSONArray("setIds")).put("members", ms));
            }
            assertEquals(c.getString("name"), c.getJSONArray("expect").toString(), got.toString());
        }
    }

    @Test
    public void acceptSnapshot() throws Exception {
        JSONArray cases = fixtures().getJSONArray("acceptSnapshot");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.getString("name"), c.getBoolean("expect"),
                    LockRules.acceptSnapshot(c.optJSONObject("current"), c.getJSONObject("next")));
        }
    }

    @Test
    public void canForgetAcked() throws Exception {
        JSONArray cases = fixtures().getJSONArray("canForgetAcked");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.getString("name"), c.getBoolean("expect"),
                    LockRules.canForgetAcked(c.getLong("seq"), c.optJSONObject("snapshot")));
        }
    }

    @Test
    public void mergeRest() throws Exception {
        JSONArray cases = fixtures().getJSONArray("mergeRest");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            JSONObject got = LockRules.mergeRest(c.optJSONObject("a"), c.optJSONObject("b"));
            Object want = nul(c.opt("expect"));
            assertEquals(c.getString("name"), want == null ? null : want.toString(), got == null ? null : got.toString());
        }
    }

    @Test
    public void queueStalled() throws Exception {
        JSONArray cases = fixtures().getJSONArray("queueStalled");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            JSONArray ats = c.getJSONArray("pendingAts");
            long[] a = new long[ats.length()];
            for (int j = 0; j < a.length; j++) a[j] = ats.getLong(j);
            assertEquals(c.getString("name"), c.getBoolean("expect"), LockRules.queueStalled(a, c.getLong("now")));
        }
    }

    @Test
    public void elapsedSec() throws Exception {
        JSONArray cases = fixtures().getJSONArray("elapsedSec");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            Long want = c.isNull("expect") ? null : c.getLong("expect");
            assertEquals(c.getString("name"), want,
                    LockRules.elapsedSec(c.optJSONObject("clock"), c.getBoolean("paused"), c.getLong("now")));
        }
    }

    @Test
    public void restRemainingSec() throws Exception {
        JSONArray cases = fixtures().getJSONArray("restRemainingSec");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.getString("name"), c.getLong("expect"), LockRules.restRemainingSec(c.optJSONObject("rest"), c.getLong("now")));
        }
    }
}
