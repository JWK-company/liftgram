// 위젯 확장 LiftgramWidgets(SPEC-017 Phase 5) — 지금은 잠금화면 운동 카드(Live Activity) 하나.
// Xcode 에서 「Widget Extension」 타깃(번들 org.tarae.liftgram.widgets · iOS 17)으로 이 폴더를 붙이고,
// 로컬 패키지는 CapApp-SPM 과 **같은 경로**(`../../node_modules/liftgram-native` — `src/mobile` 에서 bun install 로 복사됨)의 LiftgramLockKit 제품을 링크한다
// (경로가 다르면 같은 이름 패키지가 두 번 잡혀 충돌 · REV-008 플랫폼 M-1). App Group group.org.tarae.liftgram 양쪽 · 배포 목표 iOS 17.
import AppIntents
import LiftgramLockKit
import SwiftUI
import WidgetKit

/// 패키지 안 잠금 버튼 intent 를 이 확장에 등록한다(REV-008 플랫폼 H-1 · Xcode 26 이상)
@available(iOS 17.0, *)
struct LiftgramWidgetIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [LiftgramLockIntents.self] }
}

@main
struct LiftgramWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivity()
    }
}
