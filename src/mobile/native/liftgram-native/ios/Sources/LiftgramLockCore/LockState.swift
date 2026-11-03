// 네이티브 잠금 카드 저장소의 내용(SPEC-017 §6 · Phase 5) — 안드로이드 `LockState.java` 와 같은 의미.
// 사본(스냅샷) · 대기열({action, acked}) · seq 카운터(설치 단위) · 휴식 · storeId. LockStore 의 파일 조정(NSFileCoordinator) 안에서만 고친다.
import Foundation

public struct LockState {
    public var storeId: String
    public var seq: Int64 = 0
    public var snapshot: LockJSON?
    public var queue: [LockJSON] = [] // {action, acked}
    public var rest: LockJSON?
    /// 끝낸 세션 — 같은 세션의 늦은 스냅샷이 카드를 되살리지 않게(REV-007 계약 L-4)
    public var endedSessionId: String?
    /// 쓰기 세대 — 바뀐 쓰기마다 저장소가 +1(늦게 온 옛 그림을 버린다 · REV-007 계약 M-3 · 안드로이드 gen 과 같음)
    public var gen: Int64 = 0

    public init(storeId: String = UUID().uuidString) {
        self.storeId = storeId
    }

    public static func fromJSON(_ data: Data?) -> LockState {
        guard let data, !data.isEmpty,
              let o = (try? JSONSerialization.jsonObject(with: data)) as? LockJSON
        else { return LockState() }
        var s = LockState(storeId: (o["storeId"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? UUID().uuidString)
        s.seq = LockNum.i64(o["seq"]) ?? 0
        s.snapshot = o["snapshot"] as? LockJSON
        s.rest = o["rest"] as? LockJSON
        s.queue = (o["queue"] as? [LockJSON]) ?? []
        s.endedSessionId = o["endedSessionId"] as? String
        s.gen = LockNum.i64(o["gen"]) ?? 0
        return s
    }

    public func toJSON() -> Data {
        let o: LockJSON = [
            "storeId": storeId, "seq": seq,
            "snapshot": snapshot ?? NSNull(), "rest": rest ?? NSNull(), "queue": queue,
            "endedSessionId": endedSessionId ?? NSNull(), "gen": gen,
        ]
        return (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])) ?? Data()
    }

    private static func action(_ e: LockJSON) -> LockJSON { (e["action"] as? LockJSON) ?? [:] }
    private static func acked(_ e: LockJSON) -> Bool { (e["acked"] as? Bool) ?? false }

    private mutating func forgetCovered() {
        let snap = snapshot
        queue.removeAll { e in Self.acked(e) && LockRules.canForgetAcked(seq: LockNum.i64(Self.action(e)["seq"]) ?? 0, snapshot: snap) }
    }

    /// 웹이 보낸 스냅샷 — 받으면 true. 남은 단계는 아직 덮이지 않은 조작으로 rebase 한다.
    /// - 휴식은 seq 와 무관한 LWW 라 받을지와 상관없이 먼저 합친다(§7 · REV-007 계약 L-1) — 세션이 바뀌면 옛 휴식은 버린다(M-2).
    /// - 다른 storeId(저장소가 새로 만들어짐)의 appliedThroughSeq 는 믿지 않는다 — 0 으로 보고 대기열 전부로 rebase(M-1).
    @discardableResult
    public mutating func update(_ next: LockJSON) -> Bool {
        let sid = next["sessionId"] as? String
        if let ended = endedSessionId, sid == ended { return false }
        let sessionChanged = (snapshot?["sessionId"] as? String) != sid
        if let r = next["rest"] as? LockJSON { rest = sessionChanged ? r : LockRules.mergeRest(rest, r) }
        guard LockRules.acceptSnapshot(current: snapshot, next: next) else { return false }
        let mine = (next["storeId"] as? String) == storeId
        let applied = mine ? (LockNum.i64(next["appliedThroughSeq"]) ?? 0) : 0
        var s = next
        s["steps"] = LockRules.rebase((next["steps"] as? [LockJSON]) ?? [], appliedThroughSeq: applied, pending: queue.map(Self.action))
        snapshot = s
        if mine { forgetCovered() }
        endedSessionId = nil
        return true
    }

    public mutating func setRest(_ r: LockJSON) { rest = LockRules.mergeRest(rest, r) }

    /// 운동 끝 — 카드를 내린다. 대기열은 남긴다(웹이 버림으로 세고 ack 한다).
    public mutating func end() {
        // [원본] endedSessionId = snapshot?["sessionId"] as? String — 두 번째 end() 가 표식을 nil 로 지웠다(REV-008 계약 M-1)
        // [개선] 카드가 있을 때만 표식을 바꾼다(안드로이드와 같음)
        if let sid = snapshot?["sessionId"] as? String { endedSessionId = sid }
        snapshot = nil
        rest = nil
    }

    public func drain() -> LockJSON {
        // 카드가 없으면(끝난 세션) 휴식도 없다 — 다음 세션으로 새지 않게(M-2)
        ["actions": queue.filter { !Self.acked($0) }.map(Self.action), "rest": (snapshot == nil ? nil : rest) ?? NSNull(), "storeId": storeId]
    }

    public mutating func ack(_ ids: Set<String>) {
        for i in queue.indices where ids.contains((Self.action(queue[i])["id"] as? String) ?? "") { queue[i]["acked"] = true }
        forgetCovered()
    }

    public mutating func clear() { queue.removeAll() }

    public func stalled(now: Int64) -> Bool {
        LockRules.queueStalled(queue.filter { !Self.acked($0) }.map { LockNum.i64(Self.action($0)["at"]) ?? 0 }, now: now)
    }

    /// 대기열이 막히는 시각(가장 오래된 미확인 조작 + 60초 + 1ms) — Live Activity staleDate 로 쓴다(REV-007 계약 M-4 · 안드로이드 stallsAt 과 같음)
    public func stallsAt() -> Int64? {
        let ats = queue.filter { !Self.acked($0) }.map { LockNum.i64(Self.action($0)["at"]) ?? 0 }
        guard let oldest = ats.min() else { return nil }
        return oldest + 60_001
    }

    public var currentStep: LockJSON? { (snapshot?["steps"] as? [LockJSON])?.first }

    public func canComplete(now: Int64) -> Bool {
        guard let st = currentStep, let snap = snapshot else { return false }
        return !((snap["paused"] as? Bool) ?? false) && !((st["openApp"] as? Bool) ?? false) && !stalled(now: now)
    }

    /// 단계 토큰 — 버튼에 실어 「누른 순간 보이던 단계」를 고정한다(REV-007 계약 H-1).
    public static func stepToken(_ step: LockJSON?) -> String { ((step?["setIds"] as? [String]) ?? []).joined(separator: ",") }

    /// 잠금 중 「완료」 — 버튼에 실린 단계(token)가 지금 보이는 단계와 같을 때만 조작을 만든다(연타·낡은 카드 버튼은 nil).
    /// 보이는 단계의 setIds 를 고정하고 사본에서 뺀다 · 단계 휴식을 건다.
    public mutating func pressComplete(now: Int64, token: String?) -> LockJSON? {
        guard canComplete(now: now), let st = currentStep, var snap = snapshot else { return nil }
        if let token, token != Self.stepToken(st) { return nil }
        seq += 1
        let members = (st["members"] as? [LockJSON]) ?? []
        let expect: [LockJSON] = members.map { m in
            let ex = (m["expect"] as? LockJSON) ?? [:]
            return ["setId": m["setId"] ?? "", "weightKg": ex["weightKg"] ?? NSNull(), "reps": ex["reps"] ?? NSNull(), "seconds": ex["seconds"] ?? NSNull()]
        }
        let a: LockJSON = [
            "id": UUID().uuidString, "storeId": storeId, "dbEpoch": snap["dbEpoch"] ?? "", "seq": seq,
            "kind": "complete", "sessionId": snap["sessionId"] ?? "", "setIds": st["setIds"] ?? [String](),
            "expect": expect, "at": now,
        ]
        queue.append(["action": a, "acked": false])
        snap["steps"] = LockRules.rebase((snap["steps"] as? [LockJSON]) ?? [], appliedThroughSeq: seq - 1, pending: [a])
        snapshot = snap
        let restSec = LockNum.i64(st["restAfterSec"]) ?? 0
        if restSec > 0 { rest = Self.restAt(endsAt: now + restSec * 1000, totalSec: restSec, now: now) }
        return a
    }

    public mutating func addRest(_ sec: Int64, now: Int64) {
        guard snapshot != nil else { return } // 끝난 세션의 카드 버튼(M-2)
        let remain = LockRules.restRemainingSec(rest, now: now)
        let total = LockNum.i64(rest?["totalSec"]) ?? 0
        let endsAt = remain > 0 ? (LockNum.i64(rest?["endsAt"]) ?? now) + sec * 1000 : now + sec * 1000
        rest = Self.restAt(endsAt: endsAt, totalSec: remain > 0 ? total + sec : sec, now: now)
    }

    public mutating func endRest(now: Int64) {
        guard snapshot != nil else { return }
        rest = ["endsAt": NSNull(), "totalSec": NSNull(), "setAt": now, "by": "native"]
    }

    static func restAt(endsAt: Int64, totalSec: Int64, now: Int64) -> LockJSON {
        ["endsAt": endsAt, "totalSec": totalSec, "setAt": now, "by": "native"]
    }
}
