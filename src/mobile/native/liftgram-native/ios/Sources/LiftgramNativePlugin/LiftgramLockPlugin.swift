// 잠금화면 운동 카드 플러그인(SPEC-017 Phase 5 · SRS-096) — 웹 `window.Capacitor.Plugins.LiftgramLock`(frontend lib/native.ts `lock`).
// 안드로이드 `LiftgramLockPlugin.java` 와 같은 메서드·반환 키:
//   info → {version, features, notifications, exactAlarm}     sessionUpdate({snapshot}) → {accepted}
//   sessionSetRest({rest}) · sessionEnd() · queueDrain() → {actions, rest, storeId} · queueAck({ids}) · queueClear() · openSettings({kind})
//   이벤트 「lockAction」 — 잠금 카드 버튼(intent)이 저장소를 바꿨다(웹이 drain).
// 저장소는 App Group 파일(LockStore · NSFileCoordinator) — 위젯 확장과 같은 파일. iOS 16.2 미만은 카드 없이 대기열만(기능 확인으로 알 수 있다).
import ActivityKit
import Capacitor
import Foundation
import LiftgramLockCore
import LiftgramLockKit
import UIKit
import UserNotifications

@objc(LiftgramLockPlugin)
public class LiftgramLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiftgramLockPlugin"
    public let jsName = "LiftgramLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sessionUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sessionSetRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sessionEnd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueDrain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueAck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    static let version = "1.1.0"
    private static let askedKey = "liftgram_lock_ui.askedNotifications"
    private var observers: [NSObjectProtocol] = []
    /// 웹 호출을 도착 순서대로 하나씩(스냅샷과 sessionEnd 가 뒤바뀌지 않게 · REV-008 계약 M-2)
    private let calls = DispatchQueue(label: "org.tarae.liftgram.lock-calls")

    override public func load() {
        // [원본] UNUserNotificationCenter delegate 를 직접 잡았다 — Capacitor 브리지(NotificationRouter)가 이미 delegate 라 돌지 않았다(계약 L-1 · 플랫폼 M-5).
        // [개선] 브리지 기본값(알림 플러그인이 없으면 앞 화면에서 알림을 띄우지 않음)에 맡긴다 — 앱이 앞이면 웹이 휴식 끝 소리를 낸다.
        //   알림 플러그인(@capacitor/local-notifications 등)을 더하면 휴식 끝 id(LockHubIOS.restNoticeId)를 앞 화면에서 숨기는 처리를 그 쪽에 더해야 한다.
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: LockHubIOS.didAct, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("lockAction", data: [:])
        })
        observers.append(nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            LockHubIOS.refresh() // 권한·시간이 바뀌었을 수 있다(막힘 · 휴식 끝)
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    // ── 공통 ──

    /// 저장소 일을 직렬 줄에서, 앱이 뒤로 가는 중이어도 끝까지(beginBackgroundTask · 만료되면 바로 끝낸다).
    /// 저장소 쓰기가 끝나면 바로 resolve — 카드 그리기는 그리기 줄에서 따로(웹 5초 상한과 분리 · 계약 M-2).
    private func run(_ call: CAPPluginCall, _ body: @escaping () throws -> Void) {
        calls.async {
            var task = UIBackgroundTaskIdentifier.invalid
            DispatchQueue.main.sync {
                task = UIApplication.shared.beginBackgroundTask(withName: "liftgram-lock") {
                    UIApplication.shared.endBackgroundTask(task)
                    task = .invalid
                }
            }
            defer { DispatchQueue.main.async { if task != .invalid { UIApplication.shared.endBackgroundTask(task) } } }
            do { try body() } catch { call.reject("잠금 카드 저장소: \(error.localizedDescription)") }
        }
    }

    private static func json(_ o: Any?) -> LockJSON? {
        guard let o, JSONSerialization.isValidJSONObject(o),
              let d = try? JSONSerialization.data(withJSONObject: o) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? LockJSON // JSValue → 순수 Foundation 값
    }

    private func notificationsEnabled() async -> Bool {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        let allowed = [.authorized, .provisional, .ephemeral].contains(s.authorizationStatus)
        // 알림과 「실시간 현황」 둘 다 — 둘 다 같은 앱 설정 화면에서 켠다(openSettings · 계약 M-5)
        if #available(iOS 17.0, *) { return allowed && ActivityAuthorizationInfo().areActivitiesEnabled }
        return allowed
    }

    /// 첫 운동 사본 때 한 번만 묻는다(안드로이드와 같음 · 거절하면 다시 묻지 않고 프로필 줄이 설정을 연다).
    private func askNotificationsOnce() {
        let d = UserDefaults.standard
        guard !d.bool(forKey: Self.askedKey) else { return }
        d.set(true, forKey: Self.askedKey)
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            LockHubIOS.refresh()
        }
    }

    // ── 메서드 ──

    @objc func info(_ call: CAPPluginCall) {
        Task {
            // 카드·휴식 끝 알림은 iOS 17 부터(위젯 확장 목표) — 그 아래는 대기열만(플랫폼 M-2·L-1)
            var features = ["session", "queue"]
            if #available(iOS 17.0, *) { features += ["rest", "liveActivity"] }
            call.resolve([
                "version": Self.version,
                "features": features,
                "notifications": await notificationsEnabled(),
                "exactAlarm": true, // iOS 는 시각 알림이 늘 정확하다 — 프로필의 「정확한 알람」 줄은 안 보인다
            ])
        }
    }

    @objc func sessionUpdate(_ call: CAPPluginCall) {
        guard let snap = Self.json(call.getObject("snapshot")) else { return call.reject("snapshot 이 필요합니다") }
        run(call) {
            let accepted = try LockHubIOS.apply { s, _ in s.update(snap) }
            call.resolve(["accepted": accepted])
            if accepted { DispatchQueue.main.async { self.askNotificationsOnce() } }
        }
    }

    @objc func sessionSetRest(_ call: CAPPluginCall) {
        guard let rest = Self.json(call.getObject("rest")) else { return call.reject("rest 가 필요합니다") }
        run(call) {
            try LockHubIOS.apply { s, _ in s.setRest(rest) }
            call.resolve()
        }
    }

    @objc func sessionEnd(_ call: CAPPluginCall) {
        run(call) {
            try LockHubIOS.apply { s, _ in s.end() }
            call.resolve()
        }
    }

    @objc func queueDrain(_ call: CAPPluginCall) {
        run(call) {
            // write — 파일이 아직 없으면 이때 만들어 storeId 를 고정한다(읽을 때마다 바뀌지 않게 · 계약 L-4). drain 은 상태를 바꾸지 않는다.
            let d = try LockHubIOS.store.write { $0.drain() }
            call.resolve(JSTypes.coerceDictionaryToJSObject(d) ?? [:])
        }
    }

    @objc func queueAck(_ call: CAPPluginCall) {
        let ids = Set((call.getArray("ids") ?? []).compactMap { $0 as? String })
        run(call) {
            try LockHubIOS.apply { s, _ in s.ack(ids) }
            call.resolve()
        }
    }

    @objc func queueClear(_ call: CAPPluginCall) {
        run(call) {
            try LockHubIOS.apply { s, _ in s.clear() }
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // [원본] iOS 16+ 는 알림 설정만 열었다 — 「실시간 현황」 스위치는 앱 설정 화면에 있어 고칠 길이 없었다(계약 M-5)
            // [개선] 앱 설정 화면(알림 · 실시간 현황 둘 다 있음)
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }
}
