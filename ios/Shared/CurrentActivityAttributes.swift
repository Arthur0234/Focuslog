import ActivityKit
import Foundation

struct CurrentActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var startedAt: Int
    }

    var notionPageId: String
}
