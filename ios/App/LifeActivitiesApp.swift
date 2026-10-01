import SwiftUI

@main
struct LifeActivitiesApp: App {
    private let registrar = ActivityTokenRegistrar()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .task { await registrar.observe() }
                .task { await registrar.observeActivities() }
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "bolt.horizontal.circle")
                .font(.largeTitle)
            Text("Life Activities")
                .font(.title2.bold())
            Text("Notion controls your Current Activity.")
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
