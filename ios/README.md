# Life Activities iOS spike

This directory contains the source needed for the native ActivityKit vertical slice. It is intentionally not an Xcode project yet because signing, Team ID, Bundle ID and the Widget Extension must be created under the owner's Apple Developer account.

Minimum target: iOS 17.2+ for push-to-start Live Activities.

When creating the Xcode project:
1. Add an iOS App target and Widget Extension with Live Activity support.
2. Add `CurrentActivityAttributes.swift` to both targets.
3. Add `LifeActivitiesApp.swift` and `ActivityTokenRegistrar.swift` to the app target.
4. Add `CurrentActivityWidget.swift` to the widget extension.
5. Enable Push Notifications and Live Activities.
6. Set `NSSupportsLiveActivities = YES`.
7. Configure `Backend.baseURL` and `Backend.apiSecret` locally; do not commit secrets.
