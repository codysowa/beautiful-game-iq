import ActivityKit
import Capacitor
import Foundation

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["available": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["available": false])
            return
        }

        guard
            let gameId = call.getString("gameId"),
            let opponent = call.getString("opponent")
        else {
            call.reject("Missing game information")
            return
        }

        let state = LiveGameActivityAttributes.ContentState(
            opponent: opponent,
            ourGoals: call.getInt("ourGoals") ?? 0,
            theirGoals: call.getInt("theirGoals") ?? 0,
            quarter: min(max(call.getInt("quarter") ?? 1, 1), 4)
        )
        let attributes = LiveGameActivityAttributes(gameId: gameId)

        Task {
            do {
                if let activity = Activity<LiveGameActivityAttributes>.activities.first(where: { $0.attributes.gameId == gameId }) {
                    await activity.update(using: state)
                } else {
                    _ = try Activity.request(
                        attributes: attributes,
                        contentState: state,
                        pushType: nil
                    )
                }
                call.resolve(["available": true])
            } catch {
                call.reject("Could not update Live Activity: \(error.localizedDescription)")
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        guard let gameId = call.getString("gameId") else {
            call.reject("Missing game ID")
            return
        }

        Task {
            for activity in Activity<LiveGameActivityAttributes>.activities where activity.attributes.gameId == gameId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
