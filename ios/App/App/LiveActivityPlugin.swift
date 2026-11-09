@preconcurrency import ActivityKit
@preconcurrency import Capacitor
import Foundation

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @MainActor
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
            let opponent = call.getString("opponent"),
            !gameId.isEmpty
        else {
            call.reject("Missing game information")
            return
        }

        let state = LiveGameActivityAttributes.ContentState(
            opponent: opponent,
            ourGoals: max(0, call.getInt("ourGoals") ?? 0),
            theirGoals: max(0, call.getInt("theirGoals") ?? 0),
            quarter: min(max(call.getInt("quarter") ?? 1, 1), 4)
        )

        // Resolve the web call independently of ActivityKit's asynchronous update.
        // A Live Activity must never block or interrupt the underlying game.
        if Activity<LiveGameActivityAttributes>.activities.contains(where: { $0.attributes.gameId == gameId }) {
            call.resolve(["available": true])
            Task { @MainActor in
                await Self.updateExistingActivity(gameId: gameId, state: state)
            }
            return
        }

        do {
            let attributes = LiveGameActivityAttributes(gameId: gameId)
            _ = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
            call.resolve(["available": true])
        } catch {
            NSLog("Beautiful Game IQ: Live Activity request failed: %@", error.localizedDescription)
            call.resolve(["available": false])
        }
    }

    @MainActor
    private static func updateExistingActivity(
        gameId: String,
        state: LiveGameActivityAttributes.ContentState
    ) async {
        guard #available(iOS 16.1, *) else { return }
        guard let activity = Activity<LiveGameActivityAttributes>.activities.first(where: {
            $0.attributes.gameId == gameId
        }) else { return }

        await activity.update(using: state)
    }

    @MainActor
    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        guard let gameId = call.getString("gameId"), !gameId.isEmpty else {
            call.reject("Missing game ID")
            return
        }

        call.resolve()
        Task { @MainActor in
            await Self.endActivities(gameId: gameId)
        }
    }

    @MainActor
    private static func endActivities(gameId: String) async {
        guard #available(iOS 16.1, *) else { return }
        for activity in Activity<LiveGameActivityAttributes>.activities where activity.attributes.gameId == gameId {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }
    }
}
