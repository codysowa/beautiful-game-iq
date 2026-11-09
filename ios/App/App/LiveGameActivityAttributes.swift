import ActivityKit
import Foundation

struct LiveGameActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var opponent: String
        var ourGoals: Int
        var theirGoals: Int
        var quarter: Int
    }

    var gameId: String
}
