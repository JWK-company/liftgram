// 잠금 카드 그리기(SPEC-017 Phase 5) — 저장소 상태 → Live Activity + 휴식 끝 알림. 안드로이드 `LockHub.refresh` + `WorkoutNotification.render` + `RestAlarm` 자리.
// - 그리기는 한 줄로 이어 붙인 Task 체인에서 차례로 끝까지 돈다(actor 재진입으로 옛 그림이 새 그림 뒤에 착지하지 않게 · REV-008 계약 H-1).
//   세대(gen)가 낮은 그림은 버린다(늦게 온 옛 그림 · REV-007 계약 M-3).
// - staleDate = min(휴식 끝, 막힘 시각) — 그때 시스템이 카드를 「오래됨」으로 다시 그리고, 위젯이 시각으로 둘을 가린다(계약 H-3 · 화면 H-1).
// - 휴식 끝 소리 = time-sensitive 로컬 알림(무음 스위치는 따른다 · AlarmKit·사용자 프리셋 소리는 보류). 앱이 앞이면 Capacitor 브리지가 알림을 띄우지 않고 웹이 소리를 낸다.
#if os(iOS) && canImport(ActivityKit)
import ActivityKit
import Foundation
import LiftgramLockCore
import UserNotifications

public enum LockHubIOS {
    public static let store = LockStore.shared()
    /// 잠금 카드 버튼(intent)이 저장소를 바꿨다 — 플러그인이 웹에 「lockAction」을 알린다.
    public static let didAct = Notification.Name("org.tarae.liftgram.lock.didAct")
    public static let restNoticeId = "liftgram-lock-rest"

    static func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    /// 저장소를 고친다(쓴 뒤 상태로 그림을 줄 세운다 — 그리기는 기다리지 않는다: 웹 호출의 시간 상한과 분리 · 계약 M-2).
    @discardableResult
    public static func apply<T>(_ op: (inout LockState, Int64) throws -> T) throws -> T {
        let now = nowMs()
        let (out, s) = try store.writeState { s in try op(&s, now) }
        enqueueRender(s, now: now)
        return out
    }

    /// 저장소 그대로 다시 그리기(앱 복귀 · 권한 변경 뒤)
    public static func refresh() {
        let now = nowMs()
        guard let s = try? store.read({ $0 }) else { return }
        enqueueRender(s, now: now)
    }

    /// 버튼 intent 용 — 그림이 실제로 바뀐 뒤 돌아온다(intent 가 끝나면 시스템이 카드를 다시 읽는다).
    public static func applyAndRender<T>(_ op: (inout LockState, Int64) throws -> T) async throws -> T {
        let now = nowMs()
        let (out, s) = try store.writeState { s in try op(&s, now) }
        await enqueueRender(s, now: now).value
        return out
    }

    @discardableResult
    static func enqueueRender(_ s: LockState, now: Int64) -> Task<Void, Never> {
        let card = LockCard.of(s, now: now)
        let gen = s.gen
        let sid = s.snapshot?["sessionId"] as? String
        let store = s.storeId
        return RenderLine.shared.append {
            // 위젯 확장이 iOS 17 이라 카드·휴식 끝 알림도 17 부터(16.x 에 빈 카드를 띄우지 않게 · 플랫폼 M-2)
            if #available(iOS 17.0, *) { await LockLive.shared.render(card, gen: gen, sessionId: sid, storeId: store) }
        }
    }
}

/// 그리기 줄 — 앞 일이 끝나야 다음 일을 시작한다(직렬 · 순서 보존).
final class RenderLine: @unchecked Sendable {
    static let shared = RenderLine()
    private let lock = NSLock()
    private var tail: Task<Void, Never>?

    @discardableResult
    func append(_ job: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
        lock.lock()
        defer { lock.unlock() }
        let prev = tail
        let t = Task {
            await prev?.value
            await job()
        }
        tail = t
        return t
    }
}

@available(iOS 17.0, *)
public actor LockLive {
    public static let shared = LockLive()
    private var lastGen: Int64 = -1
    /// 세대는 저장소마다 — 저장소가 새로 만들어지면(gen 0) 처음부터(플랫폼 L-4)
    private var lastStore: String?
    /// 사용자가 밀어 없앤 카드의 세션 — 그 세션 동안은 다시 띄우지 않는다(플랫폼 L-3)
    private var dismissedSession: String?
    /// 마지막으로 예약한 휴식 끝 알림의 열쇠(끝 시각·소리·글). 처음엔 「모름」 — 새 프로세스의 첫 그림은 옛 대기 알림을 늘 지운다(계약 M-3).
    private var scheduledKey: String??

    public func render(_ card: LockCard, gen: Int64, sessionId: String?, storeId: String) async {
        if storeId != lastStore { lastStore = storeId; lastGen = -1 }
        if gen < lastGen { return }
        lastGen = gen
        await scheduleRest(card)
        let all = Activity<WorkoutAttributes>.activities
        guard card.active, let sid = sessionId else {
            for a in all { await a.end(nil, dismissalPolicy: .immediate) }
            return
        }
        let state = WorkoutAttributes.ContentState.of(card, gen: gen)
        let content = ActivityContent(state: state, staleDate: state.staleDate)
        var mine: Activity<WorkoutAttributes>?
        for a in all {
            // [원본] a.activityState == .active — staleDate 가 지난 카드(.stale)를 남의 것으로 보고 끝냈다(계약 H-2)
            let alive = a.activityState == .active || a.activityState == .stale
            if a.attributes.sessionId == sid && a.activityState == .dismissed { dismissedSession = sid }
            if a.attributes.sessionId == sid && mine == nil && alive { mine = a } else { await a.end(nil, dismissalPolicy: .immediate) }
        }
        if let mine {
            await mine.update(content)
        } else if dismissedSession != sid && ActivityAuthorizationInfo().areActivitiesEnabled {
            do {
                _ = try Activity.request(attributes: WorkoutAttributes(sessionId: sid), content: content, pushType: nil)
            } catch {
                NSLog("[lock] Live Activity 시작 실패: \(error.localizedDescription)") // 앱이 뒤에 있으면 시작할 수 없다 — 다음 앞 화면 때 다시
            }
        }
    }

    private func scheduleRest(_ card: LockCard) async {
        let center = UNUserNotificationCenter.current()
        let end = card.active && card.resting ? card.restEndsAt : nil
        let t = LockStrings.current()
        let notice = end == nil ? nil : LockFormat.restDoneNotice(card, t)
        let key: String? = end.map { "\($0)|\(card.soundEnabled)|\(notice!.title)|\(notice!.body)" }
        if case .some(let k) = scheduledKey, k == key { return }
        scheduledKey = .some(key)
        center.removePendingNotificationRequests(withIdentifiers: [LockHubIOS.restNoticeId])
        guard let end, let notice else { return }
        let c = UNMutableNotificationContent()
        // [원본] c.title = t.resting · c.body = 제목에서 머리말을 치환 — 무게×횟수가 없고 슈퍼셋이면 「다음: 슈퍼셋」뿐이었다(화면 H-2)
        c.title = notice.title
        c.body = notice.body
        c.sound = card.soundEnabled ? .default : nil
        c.interruptionLevel = .timeSensitive
        c.threadIdentifier = "liftgram-lock"
        let wait = max(1, TimeInterval(end - LockHubIOS.nowMs()) / 1000)
        let req = UNNotificationRequest(identifier: LockHubIOS.restNoticeId, content: c,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false))
        try? await center.add(req)
        // add 를 기다리는 사이 더 새 그림이 다른 열쇠를 예약했으면 이 요청은 지운다(재진입 · 계약 H-1)
        if case .some(let k) = scheduledKey, k != key { center.removePendingNotificationRequests(withIdentifiers: [LockHubIOS.restNoticeId]) }
    }
}
#endif
