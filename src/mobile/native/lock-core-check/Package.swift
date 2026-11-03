// swift-tools-version: 5.9
// 잠금 카드 Swift 규칙 검사(SPEC-017 Phase 5) — Xcode 없이 맥 명령줄 도구만으로 돈다(XCTest·Testing 모듈이 없어 실행 타깃으로 검사).
//   cd src/mobile/native/lock-core-check && swift run LockCoreCheck
// 규칙 소스는 앱 플러그인 패키지의 것을 심볼릭 링크로 그대로 쓴다(Sources/LiftgramLockCore → ../../liftgram-native/ios/Sources/LiftgramLockCore).
import PackageDescription

let package = Package(
    name: "LockCoreCheck",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "LiftgramLockCore", path: "Sources/LiftgramLockCore"),
        .executableTarget(name: "LockCoreCheck", dependencies: ["LiftgramLockCore"], path: "Sources/LockCoreCheck"),
    ]
)
