// 잠금 카드에 그릴 값(SPEC-017 Phase 5) — 안드로이드 `LockView.java` + `WorkoutNotification.java` 의 글 만들기와 같은 규칙.
// UIKit·ActivityKit 없음(맥에서 `swift run LockCoreCheck` 로 검사) — Live Activity(ContentState)·알림은 이 값을 그대로 옮겨 싣는다.
// 표기는 웹 세션 화면과 같게: 라벨 W·D·F·T · 「20kg 한쪽」 · 유산소 시계(MM:SS · H:MM:SS) · km(REV-007 표시 M-1·M-3·M-4).
import Foundation

public enum LockOpenApp: String, Codable, Sendable { case none, values, stalled, truncated }

public struct LockMember: Equatable, Sendable {
    public var name = ""
    public var label = ""
    public var setNo = 0
    public var setTotal = 0
    public var unit = "kg"
    public var oneSide = false
    public var weight: Double?
    public var reps: Int?
    public var seconds: Int?
    public var distanceM: Double?

    public init() {}

    static func of(_ m: LockJSON) -> LockMember {
        var x = LockMember()
        x.name = (m["exerciseName"] as? String) ?? ""
        x.setNo = Int(LockNum.i64(m["setNo"]) ?? 0)
        x.label = (m["label"] as? String) ?? String(x.setNo)
        x.setTotal = Int(LockNum.i64(m["setTotal"]) ?? 0)
        x.unit = (m["unit"] as? String) ?? "kg"
        x.oneSide = (m["oneSide"] as? Bool) ?? false
        if let d = m["display"] as? LockJSON {
            x.weight = LockNum.dbl(d["weight"])
            x.reps = LockNum.i64(d["reps"]).map { Int($0) }
            x.seconds = LockNum.i64(d["seconds"]).map { Int($0) }
            x.distanceM = LockNum.dbl(d["distanceM"])
        }
        return x
    }
}

/// 카드 문구 — 기기 언어가 한국어면 ko, 아니면 en(안드로이드 `strings_lock.xml` 두 벌과 같은 글).
public struct LockStrings: Sendable {
    public var titleFallback, noSteps, truncated, superset, oneSide, paused, resting: String
    public var done, openApp, plus30, endRest, openAppValues, openAppStalled, nextPrefix: String
    public var warmup, drop, failure, top: String
    /// 휴식 끝 알림 제목 · 본문 머리말(REV-008 화면 H-2 — 안드로이드는 소리만 내고 카드를 다시 그린다)
    public var restDone, upNext: String
    public var setOf: @Sendable (String, Int) -> String
    public var reps: @Sendable (Int) -> String
    public var next: @Sendable (String) -> String

    public static let ko = LockStrings(
        titleFallback: "운동 중", noSteps: "남은 세트가 없어요 — 앱에서 마무리하세요", truncated: "앱을 열어 다음 세트를 보세요",
        superset: "슈퍼셋", oneSide: "한쪽", paused: "일시정지됨", resting: "휴식",
        done: "완료", openApp: "앱 열기", plus30: "+30초", endRest: "건너뛰기",
        openAppValues: "기본값이에요 — 앱에서 확인하세요", openAppStalled: "앱을 열어 기록을 반영하세요", nextPrefix: "다음 · ",
        warmup: "워밍업", drop: "드롭 세트", failure: "실패 세트", top: "탑셋",
        restDone: "휴식 끝", upNext: "다음 세트: ",
        setOf: { "\($0)/\($1)세트" }, reps: { "\($0)회" }, next: { "다음: \($0)" })

    public static let en = LockStrings(
        titleFallback: "Workout", noSteps: "No sets left — finish in the app", truncated: "Open the app to see the next sets",
        superset: "Superset", oneSide: "per side", paused: "Paused", resting: "Rest",
        done: "Done", openApp: "Open app", plus30: "+30s", endRest: "Skip",
        openAppValues: "Default values — check in the app", openAppStalled: "Open the app to save your sets", nextPrefix: "Next · ",
        warmup: "Warm-up", drop: "Drop set", failure: "Failure set", top: "Top set",
        restDone: "Rest over", upNext: "Up next: ",
        setOf: { "Set \($0) of \($1)" }, reps: { $0 == 1 ? "1 rep" : "\($0) reps" }, next: { "Next: \($0)" })

    public static func current(_ langs: [String] = Locale.preferredLanguages) -> LockStrings {
        (langs.first ?? "ko").hasPrefix("ko") ? .ko : .en
    }
}

/// 그릴 값 한 벌 — 저장소 안에서 상태를 복사해 만든다(그리기는 저장소 밖에서).
public struct LockCard: Equatable, Sendable {
    public var active = false
    public var title = ""
    public var paused = false
    public var hasStep = false
    public var truncated = false
    public var canComplete = false
    public var openApp: LockOpenApp = .none
    public var members: [LockMember] = []
    public var next: LockMember?
    public var stepToken = ""
    public var restEndsAt: Int64?
    public var restTotalSec: Int64?
    public var restSetAt: Int64?
    public var stalledAt: Int64?
    public var soundEnabled = true

    public static func of(_ s: LockState, now: Int64) -> LockCard {
        var v = LockCard()
        guard let snap = s.snapshot else { return v }
        v.active = true
        v.title = (snap["title"] as? String) ?? ""
        v.paused = (snap["paused"] as? Bool) ?? false
        v.truncated = (snap["truncated"] as? Bool) ?? false
        if let sound = snap["sound"] as? LockJSON { v.soundEnabled = (sound["enabled"] as? Bool) ?? true }
        let st = s.currentStep
        v.hasStep = st != nil
        v.canComplete = s.canComplete(now: now)
        if let st {
            v.stepToken = LockState.stepToken(st)
            v.members = ((st["members"] as? [LockJSON]) ?? []).map(LockMember.of)
            if !v.paused && !v.canComplete { v.openApp = s.stalled(now: now) ? .stalled : .values }
            let steps = (snap["steps"] as? [LockJSON]) ?? []
            if steps.count > 1, let first = ((steps[1]["members"] as? [LockJSON]) ?? []).first {
                let n = LockMember.of(first)
                if !v.members.contains(where: { $0.name == n.name }) { v.next = n }
            }
        } else if v.truncated && !v.paused {
            v.openApp = .truncated
        }
        if LockRules.restRemainingSec(s.rest, now: now) > 0 {
            v.restEndsAt = LockNum.i64(s.rest?["endsAt"])
            v.restTotalSec = LockNum.i64(s.rest?["totalSec"])
            v.restSetAt = LockNum.i64(s.rest?["setAt"])
        }
        v.stalledAt = s.stallsAt()
        return v
    }

    public var resting: Bool { restEndsAt != nil && !paused }
}

/// 카드 글 — 제목 · 첫 줄(접힌 카드) · 자세히(펼친 카드).
public struct LockText: Equatable, Sendable {
    public var title: String
    public var line: String
    public var detail: String
    /// 「다음 · 」 머리말 없는 제목 — 휴식이 끝난 카드(staleDate 뒤)는 이것을 쓴다(REV-008 계약 H-3)
    public var titleBare: String = ""
    /// 값 줄(한 종목이면 1줄 · 슈퍼셋이면 멤버마다) — 카드에서 가장 잘 보여야 할 글(REV-008 화면 M-5·H-3)
    public var values: [String] = []
    /// 안내 줄(「앱 열기」 이유 · 다음 종목) — 값 아래 작은 글
    public var notes: [String] = []
    /// 다이내믹 아일랜드 접힌 칸용 짧은 표시(「2/4」 · 「W」) — 휴식이 아닐 때(화면 M-3)
    public var badge: String = ""
}

public enum LockFormat {
    public static func num(_ d: Double) -> String {
        if abs(d - d.rounded()) < 1e-9 { return String(Int64(d.rounded())) }
        var s = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), d)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }

    /// 웹 formatDurationClock — MM:SS(1시간 넘으면 H:MM:SS)
    public static func clock(_ sec: Int) -> String {
        let s = max(0, sec), h = s / 3600, m = (s % 3600) / 60, ss = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, ss) : String(format: "%02d:%02d", m, ss)
    }

    /// 웹 formatDistanceKm — 늘 km · 소수 둘째 자리 · 뒤 0 정리
    public static func km(_ m: Double) -> String { num((m / 10).rounded() / 100) + "km" }

    public static func setName(_ m: LockMember, _ t: LockStrings) -> String {
        switch m.label {
        case "W": return t.warmup
        case "D": return t.drop
        case "F": return t.failure
        case "T": return t.top
        default: return t.setOf(m.label, m.setTotal)
        }
    }

    public static func valueLine(_ m: LockMember, _ t: LockStrings) -> String {
        var b = ""
        if let w = m.weight {
            b += num(w) + m.unit
            if m.oneSide { b += " " + t.oneSide }
        }
        if let r = m.reps { b += (b.isEmpty ? "" : " × ") + t.reps(r) }
        if let s = m.seconds { b += (b.isEmpty ? "" : " · ") + clock(s) }
        if let d = m.distanceM { b += (b.isEmpty ? "" : " · ") + km(d) }
        return b
    }

    public static func text(_ v: LockCard, _ t: LockStrings) -> LockText {
        var title: String
        var first: String
        var big: [String] = []
        var values: [String] = []
        var notes: [String] = []
        if !v.hasStep {
            title = v.title.isEmpty ? t.titleFallback : v.title
            first = v.truncated ? t.truncated : t.noSteps
            big.append(first)
        } else {
            if v.members.count > 1 {
                title = t.superset
                first = v.members.map { "\($0.name) \(valueLine($0, t))" }.joined(separator: " · ")
                for m in v.members {
                    big.append("\(m.name) · \(setName(m, t))\n  \(valueLine(m, t))")
                    values.append("\(m.name) · \(valueLine(m, t))")
                }
            } else if let m = v.members.first {
                title = "\(m.name) · \(setName(m, t))"
                first = valueLine(m, t)
                big.append(first)
                values.append(first)
            } else {
                title = v.title.isEmpty ? t.titleFallback : v.title
                first = ""
            }
            switch v.openApp {
            case .values:
                first = t.openAppValues + " · " + first
                big.append(t.openAppValues)
                notes.append(t.openAppValues)
            case .stalled:
                first = t.openAppStalled
                big.append(first)
                notes.append(first)
            default: break
            }
            if let n = v.next {
                big.append(t.next("\(n.name) · \(setName(n, t))"))
                notes.append(t.next("\(n.name) · \(setName(n, t))"))
            }
        }
        let bare = title
        if v.hasStep && v.resting { title = t.nextPrefix + title }
        if v.paused { first = t.paused + " · " + first }
        if !v.hasStep { notes = [first] }
        var badge = ""
        if let m = v.members.first { badge = ["W", "D", "F", "T"].contains(m.label) ? m.label : "\(m.label)/\(m.setTotal)" }
        return LockText(title: title, line: first, detail: (v.paused ? t.paused + "\n" : "") + big.joined(separator: "\n"),
                        titleBare: bare, values: values, notes: notes, badge: badge)
    }

    /// 휴식 끝 알림 글(REV-008 화면 H-2) — 치환 없이 카드 값으로 만든다. 한 종목 「다음 세트: 벤치 · 2/4세트 · 60kg × 8회」.
    public static func restDoneNotice(_ v: LockCard, _ t: LockStrings) -> (title: String, body: String) {
        let x = text(v, t)
        if !v.hasStep { return (t.restDone, v.truncated ? t.truncated : t.noSteps) }
        if v.openApp == .stalled { return (t.restDone, t.openAppStalled) }
        var body: String
        if v.members.count > 1 {
            body = t.upNext + t.superset + " · " + x.values.joined(separator: " · ")
        } else if let m = v.members.first {
            body = t.upNext + "\(m.name) · \(setName(m, t)) · \(valueLine(m, t))"
        } else {
            body = x.titleBare
        }
        if v.openApp == .values { body += " — " + t.openAppValues }
        return (t.restDone, body)
    }
}
