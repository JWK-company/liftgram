// 잠금 카드 버튼(SPEC-017 Phase 5) — Live Activity 의 [완료]·[+30초]·[건너뛰기]. iOS 17 LiveActivityIntent 는 앱 프로세스에서 돈다
// (이 파일은 앱 타깃과 위젯 확장 양쪽에 링크된다 — 확장은 버튼 모양만, 실행은 앱). 잠금을 풀지 않는다.
#if os(iOS) && canImport(ActivityKit) && canImport(AppIntents)
import AppIntents
import Foundation
import LiftgramLockCore

/// 이 패키지의 intent 를 앱·위젯 확장이 등록하게 한다(정적 라이브러리 안 intent 는 그대로는 안 보인다 · REV-008 플랫폼 H-1).
/// 앱(`src/mobile/ios/App/App/AppDelegate.swift`)과 위젯(`src/mobile/ios/App/LiftgramWidgets/LiftgramWidgetsBundle.swift`)이 includedPackages 로 가리킨다 — Xcode 26 이상.
@available(iOS 17.0, *)
public struct LiftgramLockIntents: AppIntentsPackage {}

@available(iOS 17.0, *)
public struct LockCompleteIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "세트 완료"
    public static let isDiscoverable = false

    /// 누른 순간 보이던 단계(setIds 를 「,」로 이음) — 지금 단계와 다르면 아무것도 안 한다(연타·낡은 카드 · REV-007 계약 H-1)
    @Parameter(title: "단계")
    public var token: String

    public init() {}
    public init(token: String) { self.token = token }

    public func perform() async throws -> some IntentResult {
        let a = try await LockHubIOS.applyAndRender { s, now in s.pressComplete(now: now, token: token) }
        if a != nil { NotificationCenter.default.post(name: LockHubIOS.didAct, object: nil) }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct LockAddRestIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "휴식 30초 더하기"
    public static let isDiscoverable = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        try await LockHubIOS.applyAndRender { s, now in s.addRest(30, now: now) }
        NotificationCenter.default.post(name: LockHubIOS.didAct, object: nil)
        return .result()
    }
}

@available(iOS 17.0, *)
public struct LockEndRestIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "휴식 건너뛰기"
    public static let isDiscoverable = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        try await LockHubIOS.applyAndRender { s, now in s.endRest(now: now) }
        NotificationCenter.default.post(name: LockHubIOS.didAct, object: nil)
        return .result()
    }
}
#endif
