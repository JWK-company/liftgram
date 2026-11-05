import AppIntents
import AVFoundation
import Capacitor
import LiftgramLockKit
import UIKit

/// SPEC-017 Phase 5  잠금 카드 버튼 intent(LiveActivityIntent)를 앱 프로세스에 등록한다 — 버튼을 누르면 앱 프로세스에서 저장소를 고친다.
/// 정적 라이브러리 안 intent 는 이렇게 가리켜야 보인다(REV-008 플랫폼 H-1 · Xcode 26 이상).
@available(iOS 17.0, *)
struct LiftgramAppIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [LiftgramLockIntents.self] }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // [원본] @plm SRS-042  낭독은 «듣는 앱」 의 소리다 — 템플릿 잔재(이 앱에는 낭독·백그라운드 오디오 설정이 없다)
        // [원본] try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        // [개선] 음악 위에 섞는다 — 섞기 옵션이 없으면 알림음이 음악 앱을 끊고 돌려주지 않는다(사용자 보고 2026-11-05 · ADR-056)
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
