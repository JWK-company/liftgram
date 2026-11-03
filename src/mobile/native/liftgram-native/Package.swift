// swift-tools-version: 5.9
import PackageDescription

// [원본] 플러그인 타깃 하나(LiftgramNativePlugin)뿐이었다.
// [개선] 잠금 카드(SPEC-017 Phase 5): 규칙·저장소(LiftgramLockCore · 맥에서도 검사) → Live Activity·버튼(LiftgramLockKit · 위젯 확장도 링크) → 플러그인.
let package = Package(
    name: "LiftgramNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "LiftgramNative", targets: ["LiftgramNativePlugin"]),
        // 위젯 확장(src/mobile/ios/App/LiftgramWidgets)이 Live Activity 모양·버튼 intent 를 함께 쓴다
        .library(name: "LiftgramLockKit", targets: ["LiftgramLockKit", "LiftgramLockCore"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(name: "LiftgramLockCore", path: "ios/Sources/LiftgramLockCore"),
        .target(name: "LiftgramLockKit", dependencies: ["LiftgramLockCore"], path: "ios/Sources/LiftgramLockKit"),
        .target(
            name: "LiftgramNativePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "LiftgramLockCore",
                "LiftgramLockKit"
            ],
            path: "ios/Sources/LiftgramNativePlugin")
    ]
)
