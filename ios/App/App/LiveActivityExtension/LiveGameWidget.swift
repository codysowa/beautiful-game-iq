import ActivityKit
import SwiftUI
import WidgetKit
import UIKit

private func actionURL(_ action: String, gameId: String) -> URL {
    var components = URLComponents()
    components.scheme = "beautifulgameiq"
    components.host = "live-game"
    components.queryItems = [
        URLQueryItem(name: "gameId", value: gameId),
        URLQueryItem(name: "action", value: action)
    ]
    return components.url ?? URL(string: "beautifulgameiq://live-game")!
}

struct LiveGameWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveGameActivityAttributes.self) { context in
            VStack(spacing: 6) {
                HStack {
                    Text("BEAUTIFUL GAME IQ")
                        .font(.caption.bold())
                        .foregroundStyle(Color.white)
                    Spacer()
                    Text("Q\(context.state.quarter)")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }

                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("US")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("\(context.state.ourGoals)")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                    }
                    Spacer()
                    Text("–")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(context.state.opponent.uppercased())
                            .font(.caption2)
                            .lineLimit(1)
                            .foregroundStyle(.secondary)
                        Text("\(context.state.theirGoals)")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                    }
                }

                HStack(spacing: 8) {
                    actionButton("⚽ OUR GOAL", action: "our_goal", gameId: context.attributes.gameId, tint: .green)
                    actionButton("THEIR GOAL", action: "their_goal", gameId: context.attributes.gameId, tint: .red)
                }
                HStack(spacing: 8) {
                    actionButton("SAVE", action: "save", gameId: context.attributes.gameId, tint: .blue)
                    actionButton("OUR SHOT", action: "our_shot", gameId: context.attributes.gameId, tint: .blue)
                    actionButton("NEXT Q →", action: "next_quarter", gameId: context.attributes.gameId, tint: .gray)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .activityBackgroundTint(Color(red: 0.06, green: 0.10, blue: 0.18))
            .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text("US").font(.caption2)
                        Text("\(context.state.ourGoals)").font(.title.bold())
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text(context.state.opponent).font(.caption2).lineLimit(1)
                        Text("\(context.state.theirGoals)").font(.title.bold())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text("Q\(context.state.quarter)").font(.caption.bold())
                        Spacer()
                        Link("GOAL", destination: actionURL("our_goal", gameId: context.attributes.gameId))
                        Link("THEIR GOAL", destination: actionURL("their_goal", gameId: context.attributes.gameId))
                        Link("SAVE", destination: actionURL("save", gameId: context.attributes.gameId))
                        Link("SHOT", destination: actionURL("our_shot", gameId: context.attributes.gameId))
                    }
                    .font(.caption.bold())
                }
            } compactLeading: {
                Text("\(context.state.ourGoals)")
            } compactTrailing: {
                Text("\(context.state.theirGoals)")
            } minimal: {
                Image(systemName: "soccerball")
            }
            .keylineTint(.green)
        }
    }

    @ViewBuilder
    private func actionButton(_ title: String, action: String, gameId: String, tint: Color) -> some View {
        Link(destination: actionURL(action, gameId: gameId)) {
            Text(title)
                .font(.caption.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(tint.opacity(0.30), in: RoundedRectangle(cornerRadius: 9))
        }
        .foregroundStyle(tint)
    }
}

@main
struct BeautifulGameIQWidgetBundle: WidgetBundle {
    var body: some Widget {
        LiveGameWidget()
    }
}
