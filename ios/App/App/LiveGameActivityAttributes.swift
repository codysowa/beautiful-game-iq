import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct LiveGameActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var opponent: String
        public var ourGoals: Int
        public var theirGoals: Int
        public var quarter: Int

        public init(opponent: String, ourGoals: Int, theirGoals: Int, quarter: Int) {
            self.opponent = opponent
            self.ourGoals = ourGoals
            self.theirGoals = theirGoals
            self.quarter = quarter
        }
    }

    public var gameId: String

    public init(gameId: String) {
        self.gameId = gameId
    }
}
