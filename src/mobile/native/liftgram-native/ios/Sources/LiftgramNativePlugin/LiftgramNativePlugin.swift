// @plm SRS-028 SRS-042 [ADR-025]  리프트그램 앱 전용 네이티브 — 시스템 인증 창 · Apple 로그인
//
// 웹 화면(liftgram.tarae.org)이 `window.Capacitor.Plugins.LiftgramNative` 로 부른다(frontend lib/native.ts).
//   authSession({url, scheme}) → {url}   : 구글·카카오·네이버 로그인 — 구글은 앱 웹뷰 로그인을 막는다.
//                                         끝나면 서버가 liftgram://auth?code= 로 돌려보내고, 그 URL 을 그대로 돌려준다.
//   signInWithApple() → {code}           : 「Apple로 계속」(심사 4.8). 서버가 code 를 번들 ID 로 백채널 교환한다.
// 취소는 reject(code "CANCELED") — 화면은 조용히 원래대로 둔다.
import AuthenticationServices
import Capacitor
import Foundation

@objc(LiftgramNativePlugin)
public class LiftgramNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiftgramNativePlugin"
    public let jsName = "LiftgramNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
    ]

    private var webSession: ASWebAuthenticationSession?
    private var appleCall: CAPPluginCall?
    private let anchorProvider = AnchorProvider()

    @objc func authSession(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https" else {
            call.reject("https 주소가 필요합니다")
            return
        }
        let scheme = call.getString("scheme") ?? "liftgram"
        DispatchQueue.main.async {
            self.anchorProvider.window = self.bridge?.webView?.window
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.webSession = nil
                if let callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("취소", "CANCELED")
                } else {
                    call.reject(error?.localizedDescription ?? "로그인 창을 열 수 없습니다")
                }
            }
            session.presentationContextProvider = self.anchorProvider
            // 사파리와 로그인 상태를 나눠 쓴다(이미 구글에 로그인돼 있으면 한 번 누르면 끝).
            session.prefersEphemeralWebBrowserSession = false
            self.webSession = session
            if !session.start() {
                self.webSession = nil
                call.reject("로그인 창을 열 수 없습니다")
            }
        }
    }

    @objc func signInWithApple(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.anchorProvider.window = self.bridge?.webView?.window
            let request = ASAuthorizationAppleIDProvider().createRequest()
            // 이름은 받지 않는다 — 닉네임은 가입 완료 화면이 받는다(서버 apple.go 와 같은 원칙).
            request.requestedScopes = [.email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self.anchorProvider
            controller.presentationContextProvider = self.anchorProvider
            self.anchorProvider.onApple = { [weak self] result in
                guard let self, let call = self.appleCall else { return }
                self.appleCall = nil
                switch result {
                case .success(let code): call.resolve(["code": code])
                case .canceled: call.reject("취소", "CANCELED")
                case .failure(let msg): call.reject(msg)
                }
            }
            self.appleCall = call
            controller.performRequests()
        }
    }
}

enum AppleResult {
    case success(String)
    case canceled
    case failure(String)
}

/// 표시 기준 창 + Apple 로그인 대리자 — NSObject 여야 해서 플러그인과 나눴다.
final class AnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding,
    ASAuthorizationControllerPresentationContextProviding, ASAuthorizationControllerDelegate
{
    weak var window: UIWindow?
    var onApple: ((AppleResult) -> Void)?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        window ?? ASPresentationAnchor()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        window ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.authorizationCode, let code = String(data: data, encoding: .utf8)
        else {
            onApple?(.failure("Apple 이 인가 코드를 주지 않았습니다"))
            return
        }
        onApple?(.success(code))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            onApple?(.canceled)
        } else {
            onApple?(.failure(error.localizedDescription))
        }
    }
}
