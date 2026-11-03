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
        // @plm SRS-042  낭독은 «듣는 앱」 의 소리다 — 무음 스위치에도 들리고, 화면을 끄거나 다른 앱으로 가도 이어진다
        //   (Info.plist UIBackgroundModes audio 와 짝). spokenAudio: 내비 안내가 끼어들면 낭독이 멈췄다 이어진다.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
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
