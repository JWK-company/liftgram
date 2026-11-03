// 안드로이드 LockRulesFixtureTest·LockStoreTest 와 같은 항목을 Swift 로 — 실패하면 종료 코드 1.
import Foundation
import LiftgramLockCore

var passed = 0
var failed: [String] = []
func check(_ ok: Bool, _ name: String) {
    if ok { passed += 1 } else { failed.append(name) }
}

let here = URL(fileURLWithPath: #filePath)
let fixtureURL = here.deletingLastPathComponent().appendingPathComponent("../../../fixtures/lock-rules.json").standardized
let fx = try! JSONSerialization.jsonObject(with: Data(contentsOf: fixtureURL)) as! LockJSON
func cases(_ k: String) -> [LockJSON] { fx[k] as! [LockJSON] }
func obj(_ v: Any?) -> LockJSON? { v as? LockJSON }
func canon(_ v: Any?) -> String {
    guard let v, !(v is NSNull) else { return "null" }
    return String(data: try! JSONSerialization.data(withJSONObject: v, options: [.sortedKeys, .fragmentsAllowed]), encoding: .utf8)!
}

// ── 공용 픽스처 ──
for c in cases("rebase") {
    let out = LockRules.rebase(c["steps"] as! [LockJSON], appliedThroughSeq: LockNum.i64(c["appliedThroughSeq"])!, pending: c["pending"] as! [LockJSON])
    let got = out.map { ["setIds": $0["setIds"]!, "members": ($0["members"] as? [LockJSON]).map { $0.map { $0["setId"]! } } ?? NSNull()] as LockJSON }
    check(canon(got) == canon(c["expect"]), "rebase: \(c["name"]!)")
}
for c in cases("acceptSnapshot") {
    check(LockRules.acceptSnapshot(current: obj(c["current"]), next: c["next"] as! LockJSON) == (c["expect"] as! Bool), "accept: \(c["name"]!)")
}
for c in cases("canForgetAcked") {
    check(LockRules.canForgetAcked(seq: LockNum.i64(c["seq"])!, snapshot: obj(c["snapshot"])) == (c["expect"] as! Bool), "forget: \(c["name"]!)")
}
for c in cases("mergeRest") {
    check(canon(LockRules.mergeRest(obj(c["a"]), obj(c["b"]))) == canon(c["expect"]), "mergeRest: \(c["name"]!)")
}
for c in cases("queueStalled") {
    let ats = (c["pendingAts"] as! [Any]).map { LockNum.i64($0)! }
    check(LockRules.queueStalled(ats, now: LockNum.i64(c["now"])!) == (c["expect"] as! Bool), "stalled: \(c["name"]!)")
}
for c in cases("restRemainingSec") {
    check(LockRules.restRemainingSec(obj(c["rest"]), now: LockNum.i64(c["now"])!) == LockNum.i64(c["expect"])!, "remain: \(c["name"]!)")
}

// ── 저장소 계약(안드로이드 LockStoreTest 와 같은 시나리오) ──
func member(_ id: String, _ kg: Double) -> LockJSON {
    ["setId": id, "exerciseName": "벤치", "setNo": 1, "setTotal": 3, "label": "1", "unit": "kg", "oneSide": false,
     "display": ["weight": kg, "reps": 5, "seconds": NSNull(), "distanceM": NSNull()],
     "expect": ["weightKg": kg, "reps": 5, "seconds": NSNull()]]
}
func step(_ ids: String...) -> LockJSON { ["setIds": ids, "members": ids.map { member($0, 60) }, "restAfterSec": 90, "openApp": false] }
func snap(_ applied: Int64, _ store: String, _ steps: [LockJSON]) -> LockJSON {
    ["v": 3, "sessionId": "w1", "title": "가슴", "steps": steps,
     "rest": ["endsAt": NSNull(), "totalSec": NSNull(), "setAt": 0, "by": "web"],
     "appliedThroughSeq": applied, "storeId": store, "dbEpoch": "E", "paused": false,
     "sound": ["enabled": true, "preset": "ding", "volume": 2], "updatedAt": 1, "truncated": false]
}
func firstId(_ s: LockState) -> String? { (s.currentStep?["setIds"] as? [String])?.first }

do {
    var s = LockState()
    s.update(snap(0, s.storeId, [step("a1"), step("a2")]))
    let a = s.pressComplete(now: 5000, token: "a1")!
    check(LockNum.i64(a["seq"]) == 1 && (a["setIds"] as! [String]) == ["a1"] && (a["dbEpoch"] as! String) == "E", "완료 조작 고정")
    check(firstId(s) == "a2", "완료 뒤 사본에서 뺌")
    check(LockNum.i64(s.rest?["endsAt"]) == 95_000 && (s.rest?["by"] as? String) == "native", "단계 휴식")
    // ack 먼저 → 낡은 스냅샷이 와도 a1 다시 안 보임 → 덮는 스냅샷이 오면 지움
    s.ack([a["id"] as! String])
    check((s.drain()["actions"] as! [Any]).isEmpty && s.queue.count == 1, "ack 됐지만 덮이기 전")
    s.update(snap(0, s.storeId, [step("a1"), step("a2")]))
    check(firstId(s) == "a2", "낡은 스냅샷 rebase")
    s.update(snap(1, s.storeId, [step("a2")]))
    check(s.queue.isEmpty, "덮이면 지움")
    check(!s.update(snap(0, s.storeId, [step("x")])), "거꾸로 가는 스냅샷 버림")
    var other = snap(0, s.storeId, [step("b1")])
    other["dbEpoch"] = "E2"
    check(s.update(other) && firstId(s) == "b1", "dbEpoch 바뀌면 받음")
}
do {
    var s = LockState()
    var st = step("a1")
    st["openApp"] = true
    s.update(snap(0, s.storeId, [st]))
    check(s.pressComplete(now: 2, token: nil) == nil, "앱 열기면 완료 없음")
    s.update(snap(0, s.storeId, (0..<5).map { step("s\($0)") }))
    _ = s.pressComplete(now: 10_000, token: nil)
    check(s.canComplete(now: 70_000) && !s.canComplete(now: 70_001), "60초 막힘 경계")
}
do {
    var s = LockState()
    s.addRest(30, now: 1000)
    check(s.rest == nil, "카드 없으면 +30초 무시")
    s.update(snap(0, s.storeId, [step("a1")]))
    s.addRest(30, now: 1000)
    s.addRest(30, now: 2000)
    check(LockNum.i64(s.rest?["endsAt"]) == 61_000 && LockNum.i64(s.rest?["totalSec"]) == 60, "+30초 두 번")
    s.setRest(["endsAt": 9, "totalSec": 1, "setAt": 1500, "by": "web"])
    check(LockNum.i64(s.rest?["endsAt"]) == 61_000, "이른 웹 휴식은 진다")
    s.endRest(now: 4000)
    check(LockRules.restRemainingSec(s.rest, now: 4000) == 0, "끝내기")
    let t = LockState.fromJSON(s.toJSON())
    check(t.storeId == s.storeId, "저장 왕복")
    check(LockState.fromJSON(Data("{깨짐".utf8)).storeId != s.storeId, "깨진 파일은 새 저장소")
}
// 계약 리뷰(REV-007) — 단계 토큰 · 다른 storeId · 끝난 세션 · 거부돼도 휴식 합침
do {
    var s = LockState()
    s.update(snap(0, s.storeId, [step("a1"), step("a2")]))
    check(s.pressComplete(now: 1, token: "a1") != nil, "토큰 맞음")
    check(s.pressComplete(now: 2, token: "a1") == nil, "같은 토큰 두 번(연타) → 한 번만")
    check(firstId(s) == "a2", "연타 뒤에도 a2 남음")
    // 저장소가 새로 만들어진 뒤 옛 storeId·큰 워터마크 스냅샷 → 0 으로 보고 rebase(방금 누른 a1 되살아나지 않음)
    var t = LockState()
    t.update(snap(0, t.storeId, [step("b1"), step("b2")]))
    _ = t.pressComplete(now: 1, token: "b1")
    t.update(snap(57, "OLD", [step("b1"), step("b2")]))
    check(firstId(t) == "b2", "다른 storeId 워터마크 무시")
    check(t.queue.count == 1, "다른 storeId 로는 지우지 않음")
    // 끝난 세션: 늦은 같은 세션 스냅샷 거부 · drain rest 없음 · 다른 세션은 받음
    t.end()
    check(!t.update(snap(9, t.storeId, [step("b2")])), "끝난 세션 스냅샷 거부")
    check(t.drain()["rest"] is NSNull, "끝난 세션 rest 없음")
    var n2 = snap(0, t.storeId, [step("c1")])
    n2["sessionId"] = "w2"
    check(t.update(n2) && firstId(t) == "c1", "새 세션 받음")
    // 거부된 스냅샷이어도 휴식은 합친다
    var u = LockState()
    u.update(snap(5, u.storeId, [step("a1")]))
    var old = snap(4, u.storeId, [step("a1")])
    old["rest"] = ["endsAt": 99_000, "totalSec": 90, "setAt": 50, "by": "web"]
    check(!u.update(old) && LockNum.i64(u.rest?["endsAt"]) == 99_000, "거부돼도 휴식 LWW")
}
// 파일 조정 저장소 — 여러 스레드의 버튼·ack 가 겹쳐도 seq 가 겹치지 않고 잃지 않는다
do {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("lockcheck-\(UUID().uuidString)")
    try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = LockStore(url: dir.appendingPathComponent("s.json"))
    // 30개 넘게 ack 없이 쌓이면 막힘(「앱 열기」)이라 버튼이 nil 을 낸다 — 경합만 보려고 상한 안쪽(30)으로
    let n = 30
    let sid = try! store.write { $0.storeId }
    try! store.write { $0.update(snap(0, sid, (0..<n).map { step("s\($0)") })) }
    let lock = NSLock()
    var seqs = Set<Int64>()
    var acked = Set<String>()
    DispatchQueue.concurrentPerform(iterations: n + 20) { i in
        if i < n {
            if let a = try! store.write({ $0.pressComplete(now: 2, token: nil) }) {
                lock.lock(); seqs.insert(LockNum.i64(a["seq"])!); lock.unlock()
            }
        } else {
            let ids = Set(try! store.read { ($0.drain()["actions"] as! [LockJSON]).map { $0["id"] as! String } })
            lock.lock(); acked.formUnion(ids); lock.unlock()
            try! store.write { $0.ack(ids) }
        }
    }
    let left = try! store.read { ($0.drain()["actions"] as! [Any]).count }
    check(seqs == Set((1...Int64(n)).map { $0 }), "seq 1…N 겹침 없음")
    check(acked.count + left == n, "잃은 조작 없음")
    check(LockState.fromJSON(try? Data(contentsOf: store.url)).seq == Int64(n), "디스크 사본")
}

// ── 저장소 세대·원자성 ──
do {
    struct Boom: Error {}
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("lock-gen-\(UUID().uuidString).json")
    let st = LockStore(url: url)
    let sid = try! st.write { $0.storeId }
    let (_, s1) = try! st.writeState { $0.update(snap(0, sid, [step("a1"), step("a2")])) }
    let (_, s2) = try! st.writeState { _ = $0.drain() }
    check(s1.gen >= 1 && s2.gen == s1.gen, "바뀐 쓰기만 세대 +1")
    do {
        try st.write { s -> Void in _ = s.pressComplete(now: 2, token: "a1"); throw Boom() }
        check(false, "던져야 한다")
    } catch {
        check(try! st.read { $0.seq } == 0 && (try! st.read { firstId($0) }) == "a1", "조작이 던지면 상태 그대로")
    }
    check(try! st.read { $0.gen } == s1.gen, "읽기는 세대를 올리지 않는다")
    try? FileManager.default.removeItem(at: url)
}

// ── 카드 글(안드로이드 WorkoutNotification 과 같은 규칙) ──
do {
    let ko = LockStrings.ko, en = LockStrings.en
    check(LockFormat.num(20) == "20" && LockFormat.num(22.5) == "22.5" && LockFormat.num(1.25) == "1.25", "숫자 뒤 0 정리")
    check(LockFormat.clock(65) == "01:05" && LockFormat.clock(3725) == "1:02:05" && LockFormat.clock(-3) == "00:00", "웹 시계")
    check(LockFormat.km(1234) == "1.23km" && LockFormat.km(5000) == "5km", "km")
    var m = LockMember(); m.name = "덤벨 컬"; m.label = "2"; m.setNo = 2; m.setTotal = 4; m.weight = 12; m.oneSide = true; m.reps = 10
    check(LockFormat.valueLine(m, ko) == "12kg 한쪽 × 10회", "한쪽은 무게 뒤")
    check(LockFormat.setName(m, en) == "Set 2 of 4" && LockFormat.valueLine(m, en) == "12kg per side × 10 reps", "영어 어순")
    m.label = "W"; check(LockFormat.setName(m, ko) == "워밍업", "라벨 W")
    var s = LockState(storeId: "S")
    s.update(snap(0, "S", [step("a1"), step("b1", "b2")]))
    var card = LockCard.of(s, now: 1000)
    check(card.canComplete && card.stepToken == "a1" && card.next == nil, "같은 종목 다음은 「다음」 없음")
    var t = LockFormat.text(card, ko)
    check(t.title == "벤치 · 1/3세트" && t.line == "60kg × 5회", "한 멤버 제목·첫 줄")
    _ = s.pressComplete(now: 1000, token: "a1")
    card = LockCard.of(s, now: 2000)
    t = LockFormat.text(card, ko)
    check(card.members.count == 2 && t.title == "다음 · 슈퍼셋" && t.line == "벤치 60kg × 5회 · 벤치 60kg × 5회", "슈퍼셋 · 휴식 중 「다음 · 」")
    check(card.restEndsAt == 91_000 && card.stalledAt == 61_001, "휴식 끝 · 막힘 시각")
    check(LockCard.of(s, now: 61_001).openApp == .stalled && LockFormat.text(LockCard.of(s, now: 61_001), ko).line == "앱을 열어 기록을 반영하세요", "60초 넘게 막히면 「앱 열기」")
    var p = snap(1, "S", [step("b1", "b2")]); p["paused"] = true
    s.update(p)
    t = LockFormat.text(LockCard.of(s, now: 3000), ko)
    check(t.line.hasPrefix("일시정지됨 · ") && t.detail.hasPrefix("일시정지됨\n"), "일시정지는 첫 줄·자세히 둘 다")
    var tr = snap(1, "S", []); tr["truncated"] = true
    s.update(tr)
    let ct = LockCard.of(s, now: 3000)
    check(ct.openApp == .truncated && LockFormat.text(ct, ko).line == "앱을 열어 다음 세트를 보세요", "잘림 안내")
    s.end()
    check(!LockCard.of(s, now: 4000).active, "끝나면 카드 없음")
    check(LockStrings.current(["en-US"]).done == "Done" && LockStrings.current(["ko-KR"]).done == "완료", "언어 고르기")
}

// ── REV-008 반영 ──
do {
    // 문구 = 안드로이드 strings_lock.xml(두 벌) — 한쪽만 고치는 드리프트를 막는다(화면 M-10)
    func xml(_ rel: String) -> [String: String] {
        let u = here.deletingLastPathComponent().appendingPathComponent(rel).standardized
        let t = try! String(contentsOf: u, encoding: .utf8)
        var out: [String: String] = [:]
        let re = try! NSRegularExpression(pattern: "<string name=\"(lock_[a-z0-9_]+)\"[^>]*>([^<]*)</string>")
        for m in re.matches(in: t, range: NSRange(t.startIndex..., in: t)) {
            out[String(t[Range(m.range(at: 1), in: t)!])] = String(t[Range(m.range(at: 2), in: t)!])
        }
        return out
    }
    let base = "../../../../android/app/src/main/res/"
    for (lang, t) in [("values", LockStrings.ko), ("values-en", LockStrings.en)] {
        let x = xml(base + lang + "/strings_lock.xml")
        let pairs: [(String, String)] = [
            ("lock_title_fallback", t.titleFallback), ("lock_no_steps", t.noSteps), ("lock_truncated", t.truncated),
            ("lock_superset", t.superset), ("lock_one_side", t.oneSide), ("lock_paused", t.paused), ("lock_resting", t.resting),
            ("lock_action_done", t.done), ("lock_action_open_app", t.openApp), ("lock_action_plus30", t.plus30),
            ("lock_action_end_rest", t.endRest), ("lock_open_app_values", t.openAppValues), ("lock_open_app_stalled", t.openAppStalled),
            ("lock_next_prefix", t.nextPrefix), ("lock_label_warmup", t.warmup), ("lock_label_drop", t.drop),
            ("lock_label_failure", t.failure), ("lock_label_top", t.top),
        ]
        for (k, v) in pairs { check(x[k] == v, "문구 \(lang) \(k): 안드로이드 「\(x[k] ?? "없음")」 ≠ iOS 「\(v)」") }
        check(x["lock_next"]?.replacingOccurrences(of: "%1$s", with: "X") == t.next("X"), "문구 \(lang) lock_next")
        check(x["lock_set_of"]?.replacingOccurrences(of: "%1$s", with: "2").replacingOccurrences(of: "%2$d", with: "4") == t.setOf("2", 4), "문구 \(lang) lock_set_of")
    }
    // 휴식 끝 알림 글(화면 H-2)
    var s = LockState(storeId: "S")
    s.update(snap(0, "S", [step("a1"), step("b1", "b2")]))
    var n = LockFormat.restDoneNotice(LockCard.of(s, now: 1), .ko)
    check(n.title == "휴식 끝" && n.body == "다음 세트: 벤치 · 1/3세트 · 60kg × 5회", "알림 한 종목: \(n.body)")
    _ = s.pressComplete(now: 2, token: "a1")
    n = LockFormat.restDoneNotice(LockCard.of(s, now: 3), .ko)
    check(n.body == "다음 세트: 슈퍼셋 · 벤치 · 60kg × 5회 · 벤치 · 60kg × 5회", "알림 슈퍼셋: \(n.body)")
    let tx = LockFormat.text(LockCard.of(s, now: 3), .ko)
    check(tx.title.hasPrefix("다음 · ") && tx.titleBare == "슈퍼셋" && tx.values.count == 2 && tx.badge == "1/3", "머리말 없는 제목·값 줄·배지")
    check(LockFormat.restDoneNotice(LockCard.of(s, now: 61_001), .ko).body == "앱을 열어 기록을 반영하세요", "알림 막힘")
    // end 두 번(계약 M-1)
    s.end(); s.end()
    check(!s.update(snap(9, "S", [step("b1")])), "end 두 번 뒤에도 끝난 세션의 늦은 스냅샷은 버린다")
    // 묶음 expect · 두 조작 ack · 휴식 0초(계약 L-6 — 안드로이드 LockStoreTest 와 같은 시나리오)
    var g = LockState(storeId: "S")
    var st = step("a1", "b1"); var ms = st["members"] as! [LockJSON]; ms[1]["expect"] = ["weightKg": 40, "reps": 10]; st["members"] = ms
    g.update(snap(0, "S", [st, step("c1"), step("c2")]))
    let a = g.pressComplete(now: 7000, token: "a1,b1")!
    let ex = a["expect"] as! [LockJSON]
    check(ex.count == 2 && ex[1]["setId"] as? String == "b1" && ex[1]["seconds"] is NSNull, "묶음 expect 멤버 전부 · 빠진 키는 null")
    let b = g.pressComplete(now: 7001, token: "c1")!
    g.ack([a["id"] as! String, b["id"] as! String])
    check(g.queue.count == 2, "ack 만으로는 안 지움")
    g.update(snap(2, "S", [step("c2")]))
    check(g.queue.isEmpty, "더 큰 스냅샷 한 장이 둘 다 지운다")
    var z = LockState(storeId: "S")
    var zs = step("a1"); zs["restAfterSec"] = 0
    z.update(snap(0, "S", [zs, step("a2")]))
    z.addRest(30, now: 1000)
    let before = canon(z.rest)
    _ = z.pressComplete(now: 2000, token: "a1")
    check(canon(z.rest) == before, "휴식 0초 단계는 돌던 휴식을 그대로")
    // 깨진 저장 파일은 옮겨 두고 새로(계약 M-4)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("lock-bad-\(UUID().uuidString).json")
    try! Data("{깨짐".utf8).write(to: url)
    let bad = LockStore(url: url)
    check((try? bad.write { $0.seq }) == 0 && FileManager.default.fileExists(atPath: url.path + ".corrupt"), "깨진 파일은 .corrupt 로 옮긴다")
    try? FileManager.default.removeItem(at: url)
    try? FileManager.default.removeItem(atPath: url.path + ".corrupt")
}

print("LockCoreCheck: \(passed) 통과 · \(failed.count) 실패")
for f in failed { print("  ✗ \(f)") }
exit(failed.isEmpty ? 0 : 1)
