import ActivityKit
import Foundation

enum Backend {
    // Configure these locally after the Cloudflare Worker is claimed/deployed.
    static let baseURL = URL(string: "https://REPLACE_ME.workers.dev")!
    static let apiSecret = "REPLACE_ME"
}

actor ActivityTokenRegistrar {
    private let session = URLSession.shared
    private let deviceId: String = {
        let key = "lifeActivities.deviceId"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = UUID().uuidString
        UserDefaults.standard.set(value, forKey: key)
        return value
    }()

    func observe() async {
        if #available(iOS 17.2, *) {
            for await token in Activity<CurrentActivityAttributes>.pushToStartTokenUpdates {
                try? await post("/v1/devices", body: [
                    "deviceId": deviceId,
                    "pushToStartToken": token.hex
                ])
            }
        }
    }

    func observeActivities() async {
        while !Task.isCancelled {
            for activity in Activity<CurrentActivityAttributes>.activities {
                if let token = activity.pushToken {
                    try? await post("/v1/activity-token", body: [
                        "notionPageId": activity.attributes.notionPageId,
                        "activityPushToken": token.hex
                    ])
                }
                Task {
                    for await token in activity.pushTokenUpdates {
                        try? await self.post("/v1/activity-token", body: [
                            "notionPageId": activity.attributes.notionPageId,
                            "activityPushToken": token.hex
                        ])
                    }
                }
            }
            try? await Task.sleep(for: .seconds(5))
        }
    }

    private func post(_ path: String, body: [String: String]) async throws {
        var request = URLRequest(url: Backend.baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("Bearer \(Backend.apiSecret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
    }
}

private extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
