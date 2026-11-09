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

    // Keep ActivityKit work off the Capacitor bridge callback. The JS call
    // resolves immediately; ActivityKit runs independently on the main actor.
    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["available": false])
            return
        }
        guard
            let gameId = call.getString("gameId"),
            let opponent = call.getString("opponent"),
            !gameId.isEmpty
        else {
            call.resolve(["available": false])
            return
        }

        let state = LiveGameActivityAttributes.ContentState(
            opponent: opponent,
            ourGoals: max(0, call.getInt("ourGoals") ?? 0),
            theirGoals: max(0, call.getInt("theirGoals") ?? 0),
            quarter: min(max(call.getInt("quarter") ?? 1, 1), 4)
        )

        call.resolve(["available": true])

        Task { @MainActor in
            await Self.syncActivity(gameId: gameId, state: state)
        }
    }

    @available(iOS 16.1, *)
    @MainActor
    private static func syncActivity(
        gameId: String,
        state: LiveGameActivityAttributes.ContentState
    ) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        if let activity = Activity<LiveGameActivityAttributes>.activities.first(where: {
            $0.attributes.gameId == gameId
        }) {
            await activity.update(using: state)
            return
        }

        do {
            let attributes = LiveGameActivityAttributes(gameId: gameId)
            _ = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
        } catch {
            NSLog("Beautiful Game IQ: Live Activity request failed: %@", error.localizedDescription)
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        guard let gameId = call.getString("gameId"), !gameId.isEmpty else {
            call.resolve()
            return
        }

        call.resolve()
        Task { @MainActor in
            await Self.endActivities(gameId: gameId)
        }
    }

    @available(iOS 16.1, *)
    @MainActor
    private static func endActivities(gameId: String) async {
        for activity in Activity<LiveGameActivityAttributes>.activities where activity.attributes.gameId == gameId {
            await activity.end(using: nil, dismissalPolicy: .immediate)
        }
    }
}