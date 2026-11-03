// 잠금화면·다이내믹 아일랜드 운동 카드(SPEC-017 Phase 5 · SRS-096) — 안드로이드 진행 중 알림과 같은 글·버튼.
// 글은 앱이 만든 ContentState 를 그대로 그린다(카드에 보인 값 = 저장될 값). 값 줄이 가장 크게, 안내 줄은 그 아래 작게(REV-008 화면 M-5).
// 버튼: 휴식 중 [+30초][건너뛰기] · 아니면 [완료(단계 토큰)] 또는 「앱 열기」(값 확인 · 막힘 · 잘림). 일시정지면 버튼 없음(안드로이드와 같음 · 화면 M-1).
// staleDate = min(휴식 끝, 막힘) — 시각이 지나면 시스템이 다시 그린다: 휴식 끝이면 휴식 줄·버튼·「다음 · 」을 걷고, 막힘이면 값은 두고 「앱 열기」(계약 H-3 · 화면 H-1·L-2).
import ActivityKit
import AppIntents
import LiftgramLockCore
import LiftgramLockKit
import SwiftUI
import UIKit
import WidgetKit

enum LockColor {
    /// 면(막대·아이콘·버튼 바탕) — 브랜드 #FF5A36
    static let fill = Color(red: 1.0, green: 0x5A / 255.0, blue: 0x36 / 255.0)
    /// 글자 — 라이트는 #C8401E(흰 바탕 대비 약 5:1), 다크는 #FF5A36(화면 M-6)
    static let text = Color(UIColor { tr in
        tr.userInterfaceStyle == .dark ? UIColor(red: 1.0, green: 0x5A / 255.0, blue: 0x36 / 255.0, alpha: 1)
            : UIColor(red: 0xC8 / 255.0, green: 0x40 / 255.0, blue: 0x1E / 255.0, alpha: 1)
    })
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutAttributes.self) { context in
            LockCardView(state: context.state)
                .padding(16)
                .activityBackgroundTint(Color(.systemBackground).opacity(0.92))
                .activitySystemActionForegroundColor(LockColor.text)
                .widgetURL(URL(string: "liftgram://workout")) // 카드 본문을 눌러도 운동 화면(화면 M-9)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "dumbbell.fill").foregroundStyle(LockColor.fill).accessibilityHidden(true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestClock(state: context.state).font(.title3.monospacedDigit()).foregroundStyle(LockColor.text)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // 긴 제목이 가운데 좁은 칸에 잘리지 않게 아래 넓은 칸에(화면 M-4)
                    LockCardView(state: context.state, compact: true)
                }
            } compactLeading: {
                Image(systemName: context.state.paused ? "pause.fill" : "dumbbell.fill")
                    .foregroundStyle(LockColor.fill)
                    .accessibilityLabel(context.state.paused ? LockStrings.current().paused : LockStrings.current().titleFallback)
            } compactTrailing: {
                // 휴식이 아닐 때도 비우지 않는다 — 세트 배지(「2/4」 · 「W」 · 화면 M-3)
                TimelineSwitch(state: context.state) { resting in
                    if resting { RestClock(state: context.state).monospacedDigit().frame(maxWidth: 52) }
                    else { Text(context.state.paused ? "Ⅱ" : context.state.badge).monospacedDigit() }
                }
                .foregroundStyle(LockColor.text)
            } minimal: {
                TimelineSwitch(state: context.state) { resting in
                    if resting { RestClock(state: context.state).monospacedDigit().font(.caption2) }
                    else { Image(systemName: "dumbbell.fill").foregroundStyle(LockColor.fill) }
                }
            }
            .keylineTint(LockColor.fill)
            .widgetURL(URL(string: "liftgram://workout"))
        }
    }
}

/// 지금 휴식 중인지에 따라 다른 모양(휴식 끝 시각에 시스템이 staleDate 로 다시 그린다).
struct TimelineSwitch<Content: View>: View {
    let state: WorkoutAttributes.ContentState
    @ViewBuilder let content: (Bool) -> Content
    var body: some View { content(state.resting(at: Date())) }
}

struct LockCardView: View {
    let state: WorkoutAttributes.ContentState
    var compact = false

    var body: some View {
        let now = Date()
        let t = LockStrings.current()
        let resting = state.resting(at: now)
        let stalled = state.stalled(at: now)
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(resting ? state.title : (state.titleBare.isEmpty ? state.title : state.titleBare))
                    .font(.headline).lineLimit(1)
                Spacer(minLength: 8)
                if state.paused {
                    Label(t.paused, systemImage: "pause.fill").font(.subheadline.weight(.semibold)).foregroundStyle(LockColor.text)
                } else if resting {
                    RestClock(state: state).font(.title2.monospacedDigit().weight(.semibold)).foregroundStyle(LockColor.text)
                }
            }
            // 값 줄 — 들어야 할 무게×횟수를 본문 크기·기본 색으로(화면 M-5) · 슈퍼셋은 멤버마다 한 줄(4줄 상한에 안내가 묻히지 않게 · 화면 H-3)
            ForEach(Array(state.values.prefix(compact ? 2 : 3).enumerated()), id: \.offset) { _, v in
                Text(v).font(compact ? .subheadline : .body.weight(.medium)).lineLimit(1)
            }
            if state.values.isEmpty && !state.hasStep {
                Text(state.line).font(.subheadline)
            }
            ForEach(Array(notes(stalled, t).prefix(2).enumerated()), id: \.offset) { _, n in
                Text(n).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            if resting, let start = state.restStart, let end = state.restEnd, !compact {
                ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .tint(LockColor.fill)
                    .accessibilityHidden(true)
            }
            LockButtons(state: state, resting: resting, stalled: stalled)
        }
    }

    /// 막힘이면 값은 두고 안내만 바꾼다(화면 L-2)
    private func notes(_ stalled: Bool, _ t: LockStrings) -> [String] {
        stalled ? [t.openAppStalled] + state.notes.filter { $0 != t.openAppStalled && $0 != t.openAppValues } : state.notes
    }
}

/// 휴식 카운트다운 — 시스템이 그린다(앱이 잠들어도 흐른다). 휴식이 아니면 비운다.
struct RestClock: View {
    let state: WorkoutAttributes.ContentState

    var body: some View {
        if state.resting(at: Date()), let start = state.restStart, let end = state.restEnd {
            Text(timerInterval: start...end, countsDown: true)
                .accessibilityLabel(LockStrings.current().resting)
        } else {
            Text("")
        }
    }
}

struct LockButtons: View {
    let state: WorkoutAttributes.ContentState
    let resting: Bool
    let stalled: Bool

    var body: some View {
        let t = LockStrings.current()
        // 장갑 낀 손 — 높이 44 이상 · 주 동작 [완료]는 채운 버튼(화면 H-4)
        HStack(spacing: 8) {
            if state.paused {
                EmptyView() // 일시정지면 버튼 없음(안드로이드와 같음 · 화면 M-1)
            } else {
                if resting {
                    Button(intent: LockAddRestIntent()) { label(t.plus30) }.buttonStyle(.bordered)
                        .accessibilityLabel(t.plus30)
                    Button(intent: LockEndRestIntent()) { label(t.endRest) }.buttonStyle(.bordered)
                        .accessibilityLabel(t.endRest)
                }
                if state.completable(at: Date()) {
                    Button(intent: LockCompleteIntent(token: state.token)) { label(t.done).bold() }
                        .buttonStyle(.borderedProminent)
                        .tint(LockColor.fill)
                        .accessibilityLabel(t.done)
                } else if state.hasStep || state.openApp != LockOpenApp.none.rawValue || stalled {
                    Link(destination: URL(string: "liftgram://workout")!) {
                        label(t.openApp)
                            .background(LockColor.fill.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(LockColor.text)
                    }
                }
            }
        }
    }

    private func label(_ s: String) -> some View {
        Text(s).frame(maxWidth: .infinity, minHeight: 44)
    }
}
