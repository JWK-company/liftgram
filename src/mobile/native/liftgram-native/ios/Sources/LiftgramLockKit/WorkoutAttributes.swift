// Live Activity 모양(SPEC-017 Phase 5) — 앱(플러그인)과 위젯 확장(LiftgramWidgets)이 같은 정의를 쓴다.
// ContentState 는 그릴 글과 버튼 재료만 싣는다(4KB 상한 · 값 계산은 저장소 안 LockCard 에서 끝낸다).
#if os(iOS) && canImport(ActivityKit)
import ActivityKit
import Foundation
import LiftgramLockCore

@available(iOS 16.1, *)
public struct WorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var title: String
        public var line: String
        public var detail: String
        /// 휴식 중이면 시작·끝(카운트다운은 시스템이 그린다 — 앱이 잠들어도 흐른다)
        public var restStart: Date?
        public var restEnd: Date?
        public var paused: Bool
        public var canComplete: Bool
        /// 완료 버튼에 싣는 단계 토큰(누른 순간 보이던 단계 · REV-007 계약 H-1)
        public var token: String
        /// LockOpenApp 원시값 — none · values · stalled · truncated
        public var openApp: String
        public var hasStep: Bool
        public var gen: Int64
        /// 「다음 · 」 머리말 없는 제목 · 값 줄 · 안내 줄 · 접힌 칸 배지(REV-008 화면 H-3·M-3·M-5)
        public var titleBare: String = ""
        public var values: [String] = []
        public var notes: [String] = []
        public var badge: String = ""
        /// 대기열이 막히는 시각 — staleDate 는 min(휴식 끝, 막힘)이라 위젯이 둘을 이것으로 가린다(계약 H-3)
        public var stallAt: Date?

        public init(title: String, line: String, detail: String, restStart: Date?, restEnd: Date?, paused: Bool,
                    canComplete: Bool, token: String, openApp: String, hasStep: Bool, gen: Int64) {
            self.title = title
            self.line = line
            self.detail = detail
            self.restStart = restStart
            self.restEnd = restEnd
            self.paused = paused
            self.canComplete = canComplete
            self.token = token
            self.openApp = openApp
            self.hasStep = hasStep
            self.gen = gen
        }

        public static func of(_ card: LockCard, gen: Int64, strings: LockStrings = .current()) -> ContentState {
            let t = LockFormat.text(card, strings)
            var start: Date?
            var end: Date?
            if card.resting, let e = card.restEndsAt {
                let endD = Date(timeIntervalSince1970: TimeInterval(e) / 1000)
                let total = TimeInterval(card.restTotalSec ?? 0)
                // [원본] start = total > 0 ? end!.addingTimeInterval(-total) : Date() — 다시 그릴 때마다 막대가 처음부터 찼다(화면 L-3)
                let setAt = Date(timeIntervalSince1970: TimeInterval(card.restSetAt ?? e) / 1000)
                end = endD
                start = min(total > 0 ? endD.addingTimeInterval(-total) : setAt, endD)
            }
            var st = ContentState(title: cap(t.title, 80), line: cap(t.line, 160), detail: cap(t.detail, 400), restStart: start, restEnd: end,
                                  paused: card.paused, canComplete: card.canComplete, token: card.stepToken, openApp: card.openApp.rawValue,
                                  hasStep: card.hasStep, gen: gen)
            // 4KB 상한(넘으면 갱신이 조용히 버려진다 · 플랫폼 L-5) — 줄 수·길이를 자른다
            st.titleBare = cap(t.titleBare, 80)
            st.values = t.values.prefix(4).map { cap($0, 100) }
            st.notes = t.notes.prefix(3).map { cap($0, 100) }
            st.badge = cap(t.badge, 8)
            st.stallAt = card.stalledAt.map { Date(timeIntervalSince1970: TimeInterval($0) / 1000) }
            return st
        }

        static func cap(_ s: String, _ n: Int) -> String { s.count <= n ? s : String(s.prefix(n - 1)) + "…" }

        /// staleDate — 휴식 끝과 막힘 중 먼저 오는 것(그때 시스템이 카드를 다시 그린다 · 계약 H-3)
        public var staleDate: Date? { [restEnd, stallAt].compactMap { $0 }.min() }

        /// 지금 휴식 중인가 — 끝 시각이 지났으면 위젯이 휴식 줄·버튼·머리말을 걷는다(화면 H-1)
        public func resting(at now: Date) -> Bool {
            guard !paused, let s = restStart, let e = restEnd else { return false }
            return s < e && now < e // 범위가 뒤집히면(1초 미만) 그리지 않는다(플랫폼 M-4)
        }

        /// 지금 대기열이 막혔나 — 「앱 열기」(값은 남긴다 · 화면 L-2)
        public func stalled(at now: Date) -> Bool { hasStep && (stallAt.map { $0 <= now } ?? false) }

        /// 지금 누를 수 있나 — 막힘 시각이 지났으면 아니다(앱이 다시 그리기 전이라도)
        public func completable(at now: Date) -> Bool { canComplete && !stalled(at: now) }
    }

    /// 운동(세션) — 세션이 바뀌면 새 Live Activity
    public var sessionId: String

    public init(sessionId: String) {
        self.sessionId = sessionId
    }
}
#endif
