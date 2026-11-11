package org.tarae.liftgram.lock;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** 알림을 그릴 재료 — 저장소 실행기 안에서 상태를 복사한 불변 값(그리기는 실행기 밖에서). 안드로이드 API 없음. */
public final class LockView {
    public static final class Member {
        public String name;
        public String label; // 번호("2") 또는 W·D·F·T
        public int setNo;
        public int setTotal;
        public String unit;
        public boolean oneSide;
        public Double weight;
        public Integer reps;
        public Integer seconds;
        public Double distanceM;
        /** SPEC-019 잠금 운동 화면 — 세트 id · 블록 · 고르는 중인 값(없으면 null = 원래 값) */
        public String setId = "";
        public String weId = "";
        public Double draftWeight;
        public Integer draftReps;
        /** 시간·거리 종목 — 조정하지 않는다 */
        public boolean cardio;
        /** 「남은 세트에도 적용」으로 바뀐 값(사본 이어 쓰기 · 켠 채 고르는 중인 값의 미리보기) — 표에서 굵게 + ↻(SPEC-062) */
        public boolean carried;
        /** 이 멤버 값을 남은 세트에도 적용할 수 있나(편집 줄의 켬/끔 단추를 보일지) */
        public boolean canForward;
    }

    /** 「앱 열기」 이유 — 원인마다 안내가 다르다(REV-007 표시 M-5). */
    public enum OpenAppReason { NONE, VALUES, STALLED, TRUNCATED }

    public boolean active; // 카드가 있나(스냅샷 있음)
    public String title = "";
    public boolean paused;
    public boolean hasStep;
    public boolean truncated; // 12단계 상한으로 잘렸나 — 비었어도 「끝」이 아니다(REV-007 표시 H-1)
    public boolean canComplete;
    /** 잠금 운동 화면에서 완료할 수 있나(LockState.canCompleteOnScreen) */
    public boolean screenCanComplete;
    public OpenAppReason openApp = OpenAppReason.NONE;
    public List<Member> members = new ArrayList<>();
    public Member next; // 다음 단계 첫 멤버(종목이 바뀔 때만 · 표시 M-6)
    public String stepToken = ""; // 완료 버튼에 싣는 단계 토큰(계약 H-1)
    public Long restEndsAt; // 진행 중인 휴식 끝(epoch ms) · 없으면 null
    public long restSetAt;
    public boolean soundEnabled = true;
    public String soundPreset = "ding";
    public int soundVolume = 2;
    public long gen; // 그리기 세대(실행기 안에서 매김 · 늦게 온 옛 그림을 버린다 · 계약 M-3)
    public Long stalledAt; // 대기열이 막히는 시각(가장 오래된 미확인 + 60초) — 그때 다시 그린다(계약 M-4)
    /** 무게·횟수 ± 를 켤 수 있나(SPEC-019 · 완료 가능 + 웹 caps values) */
    public boolean canAdjust;
    /** 단계가 바뀌어 고른 값을 버렸다 — 화면이 한 번 알린다 */
    public boolean draftLost;
    /** 운동 시간(초) · null = 숨김(SPEC-021) */
    public Long elapsedSec;
    /** 고른 테마 — system · light · dark(SPEC-021) */
    public String theme = "system";
    public Long restTotalSec;
    /** 쉬는 시간이 안 돌 때 시계 자리에 보일 총시간(초) — 다음 휴식 길이, 없으면 지난 휴식 길이 */
    public long restIdleSec;
    /** 되돌릴 수 있는 화면 완료(SPEC-060) — 붙잡혀 있을 때만. 끝 시각(epoch ms) · 조작 id · 완료한 멤버(고른 값 반영) */
    public Long undoUntil;
    public String undoActionId;
    public List<Member> undoMembers = new ArrayList<>();
    /** 이 운동(지금 블록 — 슈퍼세트면 묶음 전체)의 남은 단계들 — 단계마다 그 블록 멤버만(SPEC-062 남은 세트 표) */
    public List<List<Member>> remaining = new ArrayList<>();
    /** 지금 블록 다음 운동 이름(스냅샷 안에 있으면) — 표 끝 「다음: …」 */
    public String nextName;
    /** 스냅샷이 12단계 상한으로 잘려 표가 끝까지가 아닐 수 있다 */
    public boolean remainingCut;
    /** 지금 단계에서 「남은 세트에도 적용」이 켜져 있나 */
    public boolean forwardOn;
    /** 켜진 블록(weId) — 슈퍼세트에서 멤버마다(REV-152 화면 1) */
    public java.util.Set<String> forwardWe = new java.util.HashSet<>();

    static Member member(JSONObject m) {
        Member x = new Member();
        x.name = m.optString("exerciseName", "");
        x.setNo = m.optInt("setNo");
        x.label = m.optString("label", String.valueOf(x.setNo));
        x.setTotal = m.optInt("setTotal");
        x.unit = m.optString("unit", "kg");
        x.oneSide = m.optBoolean("oneSide");
        x.setId = m.optString("setId", "");
        x.weId = m.optString("weId", "");
        JSONObject d = m.optJSONObject("display");
        if (d != null) {
            x.weight = d.isNull("weight") ? null : d.optDouble("weight");
            x.reps = d.isNull("reps") ? null : d.optInt("reps");
            x.seconds = d.isNull("seconds") ? null : d.optInt("seconds");
            x.distanceM = d.isNull("distanceM") ? null : d.optDouble("distanceM");
        }
        x.cardio = x.seconds != null || x.distanceM != null;
        x.carried = m.optJSONArray("carried") != null && m.optJSONArray("carried").length() > 0;
        return x;
    }

    /** 남은 세트 표 재료(SPEC-062) — 지금 단계 뒤에서 지금 블록(weId)의 멤버만, 블록이 끝나면 다음 운동 이름 하나 */
    static void fillRemaining(LockView v, JSONArray steps) {
        java.util.Set<String> block = new java.util.HashSet<>();
        for (Member m : v.members) if (m.weId != null && !m.weId.isEmpty()) block.add(m.weId);
        if (block.isEmpty() || steps == null) return;
        for (int i = 1; i < steps.length(); i++) {
            JSONObject st = steps.optJSONObject(i);
            JSONArray ms = st == null ? null : st.optJSONArray("members");
            if (ms == null) continue;
            List<Member> row = new ArrayList<>();
            String other = null;
            for (int k = 0; k < ms.length(); k++) {
                if (ms.optJSONObject(k) == null) continue;
                Member m = member(ms.optJSONObject(k));
                if (block.contains(m.weId)) row.add(m);
                else if (other == null) other = m.name;
            }
            if (row.isEmpty()) {
                v.nextName = other;
                return;
            }
            v.remaining.add(row);
        }
        v.remainingCut = v.truncated;
    }

    /** 켠 채 고르는 중 — 표의 뒤 세트에 고른 값을 미리 보인다(완료하면 이 값으로 바뀐다 · REV-151 7) */
    static void previewForward(LockView v, JSONObject st, JSONObject dv) {
        JSONArray ms = st.optJSONArray("members");
        if (ms == null) return;
        for (int i = 0; i < ms.length(); i++) {
            JSONObject src = ms.optJSONObject(i);
            JSONObject e = src == null ? null : dv.optJSONObject(src.optString("setId"));
            if (e == null || !LockState.numbered(src) || !v.forwardWe.contains(src.optString("weId"))) continue;
            for (List<Member> row : v.remaining) {
                for (Member m : row) {
                    if (!m.weId.equals(src.optString("weId")) || m.cardio || m.oneSide != src.optBoolean("oneSide") || !isDigits(m.label)) continue;
                    if (!m.unit.equals(src.optString("unit", "kg"))) continue; // applyCarry 와 같은 조건(REV-152 화면 3)
                    // 같은 값이면 「바뀐 값」으로 표시하지 않는다(REV-152 낮음)
                    if (e.has("weight") && m.weight != null && !LockRules.sameWeight(e.optDouble("weight"), m.weight)) {
                        m.weight = e.optDouble("weight");
                        m.carried = true;
                    }
                    if (e.has("reps") && (m.reps == null || m.reps != e.optInt("reps"))) {
                        m.reps = e.optInt("reps");
                        m.carried = true;
                    }
                }
            }
        }
    }

    private static boolean isDigits(String l) {
        return l != null && !l.isEmpty() && l.chars().allMatch(Character::isDigit);
    }

    public static LockView of(LockState s, long now) {
        LockView v = new LockView();
        v.gen = s.gen;
        JSONObject snap = s.snapshot;
        if (snap == null) return v;
        v.active = true;
        v.title = snap.optString("title", "");
        v.paused = snap.optBoolean("paused");
        v.truncated = snap.optBoolean("truncated");
        v.elapsedSec = LockRules.elapsedSec(snap.optJSONObject("clock"), v.paused, now);
        v.theme = LockRules.normalizeTheme(snap.optString("theme", "system"));
        JSONObject sound = snap.optJSONObject("sound");
        if (sound != null) {
            v.soundEnabled = sound.optBoolean("enabled", true);
            v.soundPreset = sound.optString("preset", "ding");
            v.soundVolume = sound.optInt("volume", 2);
        }
        JSONObject st = s.currentStep();
        v.hasStep = st != null;
        v.canComplete = s.canComplete(now);
        v.screenCanComplete = s.canCompleteOnScreen(now);
        if (st != null) {
            v.stepToken = LockState.stepToken(st);
            JSONArray ms = st.optJSONArray("members");
            JSONObject dv = s.draftFor(v.stepToken);
            if (ms != null) for (int i = 0; i < ms.length(); i++) {
                if (ms.optJSONObject(i) == null) continue;
                Member m = member(ms.optJSONObject(i));
                JSONObject e = dv.optJSONObject(m.setId);
                if (e != null) {
                    if (e.has("weight") && !e.isNull("weight")) m.draftWeight = e.optDouble("weight");
                    if (e.has("reps") && !e.isNull("reps")) m.draftReps = e.optInt("reps");
                }
                m.canForward = s.canForward(ms.optJSONObject(i));
                v.members.add(m);
            }
            v.forwardOn = s.forwardOn(v.stepToken);
            for (Member m : v.members) if (s.forwardOn(v.stepToken, m.weId)) v.forwardWe.add(m.weId);
            v.canAdjust = s.canAdjust(now);
            if (!v.paused && !v.canComplete) v.openApp = s.stalled(now) ? OpenAppReason.STALLED : OpenAppReason.VALUES;
            JSONArray steps = snap.optJSONArray("steps");
            JSONObject nx = steps != null && steps.length() > 1 ? steps.optJSONObject(1) : null;
            JSONArray nms = nx == null ? null : nx.optJSONArray("members");
            if (nms != null && nms.length() > 0) {
                Member n = member(nms.optJSONObject(0));
                boolean same = false;
                for (Member m : v.members) same |= m.name.equals(n.name);
                if (!same) v.next = n;
            }
            fillRemaining(v, steps);
            if (v.forwardOn) previewForward(v, st, dv);
        } else if (v.truncated && !v.paused) {
            v.openApp = OpenAppReason.TRUNCATED;
        }
        if (LockRules.restRemainingSec(s.rest, now) > 0) {
            v.restEndsAt = s.rest.optLong("endsAt");
            v.restSetAt = s.rest.optLong("setAt");
            long total = s.rest.optLong("totalSec");
            v.restTotalSec = total > 0 ? total : null;
        }
        // 일시정지 중에도 쓰이므로 쉬는 시간이 도는 중에도 계산해 둔다
        v.restIdleSec = st == null ? 0 : st.optLong("restAfterSec");
        if (v.restIdleSec <= 0 && s.rest != null) v.restIdleSec = Math.max(0, s.rest.optLong("totalSec"));
        v.stalledAt = s.stallsAt();
        if (s.held(now)) {
            v.undoUntil = s.undo.optLong("holdUntil");
            v.undoActionId = s.undo.optString("actionId");
            JSONObject ust = s.undo.optJSONObject("step");
            JSONArray ums = ust == null ? null : ust.optJSONArray("members");
            JSONObject ud = s.undo.optJSONObject("draft");
            JSONObject uv = ud == null || ust == null || !LockState.stepToken(ust).equals(ud.optString("token")) ? null : ud.optJSONObject("v");
            if (ums != null) for (int i = 0; i < ums.length(); i++) {
                if (ums.optJSONObject(i) == null) continue;
                Member m = member(ums.optJSONObject(i));
                JSONObject e = uv == null ? null : uv.optJSONObject(m.setId);
                if (e != null) {
                    if (e.has("weight") && !e.isNull("weight")) m.draftWeight = e.optDouble("weight");
                    if (e.has("reps") && !e.isNull("reps")) m.draftReps = e.optInt("reps");
                }
                v.undoMembers.add(m);
            }
        }
        v.draftLost = s.draftLost;
        return v;
    }
}
