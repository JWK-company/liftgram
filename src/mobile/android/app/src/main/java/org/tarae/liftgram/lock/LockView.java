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
    }

    /** 「앱 열기」 이유 — 원인마다 안내가 다르다(REV-007 표시 M-5). */
    public enum OpenAppReason { NONE, VALUES, STALLED, TRUNCATED }

    public boolean active; // 카드가 있나(스냅샷 있음)
    public String title = "";
    public boolean paused;
    public boolean hasStep;
    public boolean truncated; // 12단계 상한으로 잘렸나 — 비었어도 「끝」이 아니다(REV-007 표시 H-1)
    public boolean canComplete;
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

    static Member member(JSONObject m) {
        Member x = new Member();
        x.name = m.optString("exerciseName", "");
        x.setNo = m.optInt("setNo");
        x.label = m.optString("label", String.valueOf(x.setNo));
        x.setTotal = m.optInt("setTotal");
        x.unit = m.optString("unit", "kg");
        x.oneSide = m.optBoolean("oneSide");
        JSONObject d = m.optJSONObject("display");
        if (d != null) {
            x.weight = d.isNull("weight") ? null : d.optDouble("weight");
            x.reps = d.isNull("reps") ? null : d.optInt("reps");
            x.seconds = d.isNull("seconds") ? null : d.optInt("seconds");
            x.distanceM = d.isNull("distanceM") ? null : d.optDouble("distanceM");
        }
        return x;
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
        JSONObject sound = snap.optJSONObject("sound");
        if (sound != null) {
            v.soundEnabled = sound.optBoolean("enabled", true);
            v.soundPreset = sound.optString("preset", "ding");
            v.soundVolume = sound.optInt("volume", 2);
        }
        JSONObject st = s.currentStep();
        v.hasStep = st != null;
        v.canComplete = s.canComplete(now);
        if (st != null) {
            v.stepToken = LockState.stepToken(st);
            JSONArray ms = st.optJSONArray("members");
            if (ms != null) for (int i = 0; i < ms.length(); i++) if (ms.optJSONObject(i) != null) v.members.add(member(ms.optJSONObject(i)));
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
        } else if (v.truncated && !v.paused) {
            v.openApp = OpenAppReason.TRUNCATED;
        }
        if (LockRules.restRemainingSec(s.rest, now) > 0) {
            v.restEndsAt = s.rest.optLong("endsAt");
            v.restSetAt = s.rest.optLong("setAt");
        }
        v.stalledAt = s.stallsAt();
        return v;
    }
}
