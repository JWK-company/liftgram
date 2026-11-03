// 잠금화면 카드 규칙 — core `src/core/src/domain/lockScreen.ts` 의 순수 함수를 옮긴 것(SPEC-017 §6·§7 · Phase 5).
// 안드로이드 `LockRules.java` 와 같은 정답 파일(`src/mobile/native/fixtures/lock-rules.json`)로 검사한다 — 규칙을 여기서만 바꾸지 않는다.
// Foundation 만 쓴다(앱·위젯 확장·맥 검사 실행기 공용).
import Foundation

public typealias LockJSON = [String: Any]

public enum LockNum {
    /// JSON 숫자(Int·Double·NSNumber) → Int64. 없거나 null 이면 nil.
    public static func i64(_ v: Any?) -> Int64? {
        switch v {
        case let n as NSNumber where CFGetTypeID(n) != CFBooleanGetTypeID(): return n.int64Value
        case let i as Int: return Int64(i)
        case let i as Int64: return i
        case let d as Double: return Int64(d)
        default: return nil
        }
    }

    public static func dbl(_ v: Any?) -> Double? {
        switch v {
        case let n as NSNumber where CFGetTypeID(n) != CFBooleanGetTypeID(): return n.doubleValue
        case let d as Double: return d
        case let i as Int: return Double(i)
        default: return nil
        }
    }
}

public enum LockRules {
    /// id 기반 rebase — seq > appliedThroughSeq 인 조작의 세트를 단계에서 뺀다(빈 단계는 지움).
    public static func rebase(_ steps: [LockJSON], appliedThroughSeq: Int64, pending: [LockJSON]) -> [LockJSON] {
        var gone = Set<String>()
        for a in pending where (LockNum.i64(a["seq"]) ?? 0) > appliedThroughSeq {
            for id in (a["setIds"] as? [String]) ?? [] { gone.insert(id) }
        }
        if gone.isEmpty { return steps }
        var out: [LockJSON] = []
        for st in steps {
            let ids = (st["setIds"] as? [String]) ?? []
            let kept = ids.filter { !gone.contains($0) }
            if kept.isEmpty { continue }
            if kept.count == ids.count {
                out.append(st)
                continue
            }
            var copy = st
            copy["setIds"] = kept
            if let members = st["members"] as? [LockJSON] {
                copy["members"] = members.filter { !gone.contains(($0["setId"] as? String) ?? "") }
            }
            out.append(copy)
        }
        return out
    }

    private static func same(_ a: Any?, _ b: Any?) -> Bool {
        let na = a == nil || a is NSNull, nb = b == nil || b is NSNull
        if na || nb { return na && nb }
        return (a as? String) == (b as? String)
    }

    /// 새 스냅샷을 받을지 — 저장소·웹 DB·세션이 같을 때만 appliedThroughSeq 가 거꾸로 가는 것을 버린다.
    public static func acceptSnapshot(current: LockJSON?, next: LockJSON) -> Bool {
        guard let cur = current else { return true }
        for k in ["storeId", "dbEpoch", "sessionId"] where !same(cur[k], next[k]) { return true }
        return (LockNum.i64(next["appliedThroughSeq"]) ?? 0) >= (LockNum.i64(cur["appliedThroughSeq"]) ?? 0)
    }

    /// ack 된 조작을 지워도 되나 — 그 seq 이상을 담은 스냅샷이 덮은 뒤에만.
    public static func canForgetAcked(seq: Int64, snapshot: LockJSON?) -> Bool {
        guard let s = snapshot else { return false }
        return (LockNum.i64(s["appliedThroughSeq"]) ?? 0) >= seq
    }

    /// 휴식 LWW — setAt 이 늦은 쪽 · 같으면 native.
    public static func mergeRest(_ a: LockJSON?, _ b: LockJSON?) -> LockJSON? {
        guard let a else { return b }
        guard let b else { return a }
        let sa = LockNum.i64(a["setAt"]) ?? 0, sb = LockNum.i64(b["setAt"]) ?? 0
        if sa != sb { return sa > sb ? a : b }
        let ba = (a["by"] as? String) ?? "", bb = (b["by"] as? String) ?? ""
        if ba == bb { return a }
        return ba == "native" ? a : b
    }

    /// 대기열이 막혔나 — 30개 넘음 또는 가장 오래된 것이 60초 넘음 → 카드 버튼을 「앱 열기」로.
    public static func queueStalled(_ pendingAts: [Int64], now: Int64) -> Bool {
        if pendingAts.count > 30 { return true }
        guard let min = pendingAts.min() else { return false }
        return now - min > 60_000
    }

    /// 남은 휴식(초) — 지난 것은 0(계산한 상태 · 쓰기 아님).
    public static func restRemainingSec(_ rest: LockJSON?, now: Int64) -> Int64 {
        guard let r = rest, let endsAt = LockNum.i64(r["endsAt"]), endsAt != 0 else { return 0 }
        return max(0, Int64((Double(endsAt - now) / 1000.0).rounded(.up)))
    }
}
