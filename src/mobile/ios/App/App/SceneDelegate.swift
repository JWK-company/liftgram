import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // [원본] window?.rootViewController = CAPBridgeViewController()
        // [개선] 웹뷰 바탕을 시작 화면 색으로 — 스플래시가 내려간 뒤 웹 덮개가 그려지기 전 빈 흰 화면이 비치지 않게(SPEC-017 Phase 5 · REV-004 iOS 보류분)
        window?.rootViewController = LiftgramBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// 시작 화면과 이어지는 웹뷰 바탕(SPEC-017 Phase 5) — LaunchScreen 의 SplashBackground 색(라이트·다크)을 웹뷰·뷰에 칠한다.
/// 웹이 첫 프레임에 같은 색 덮개(#app-boot-cover)를 그리므로 스플래시 → 덮개 사이에 다른 색이 끼지 않는다.
/// 새 파일 대신 이 파일에 둔다 — Xcode 프로젝트(pbxproj)에 파일을 더하지 않아도 빌드에 들어간다.
class LiftgramBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let bg = UIColor(named: "SplashBackground") ?? .systemBackground
        view.backgroundColor = bg
        webView?.isOpaque = false
        webView?.backgroundColor = bg
        webView?.scrollView.backgroundColor = bg
    }
}
