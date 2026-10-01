import ActivityKit
import SwiftUI
import WidgetKit

struct CurrentActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CurrentActivityAttributes.self) { context in
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("CURRENT ACTIVITY").font(.caption2).foregroundStyle(.secondary)
                    Text(context.state.title).font(.headline).lineLimit(2)
                }
                Spacer()
                Text(Date(timeIntervalSince1970: TimeInterval(context.state.startedAt)), style: .timer)
                    .monospacedDigit()
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "bolt.fill")
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(Date(timeIntervalSince1970: TimeInterval(context.state.startedAt)), style: .timer)
                        .monospacedDigit()
                }
            } compactLeading: {
                Image(systemName: "bolt.fill")
            } compactTrailing: {
                Text(Date(timeIntervalSince1970: TimeInterval(context.state.startedAt)), style: .timer)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "bolt.fill")
            }
        }
    }
}
