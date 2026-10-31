import UIKit
import CoreSpotlight
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // The window belongs to the scene now; see `SceneDelegate`.
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: nil, sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

/**
 iOS 27 traps at the moment it creates the first scene unless the app adopts
 the scene lifecycle, so the window is built here rather than in the app
 delegate, and the two doors a link comes through are here with it: UIKit
 stops calling `application(_:open:)` once a scene delegate exists.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let factory = (UIApplication.shared.delegate as? AppDelegate)?.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      initialProperties: screenshotProps(),
      launchOptions: launchOptions(from: connectionOptions))
  }

  private func screenshotProps() -> [AnyHashable: Any]? {
    #if SCREENSHOTS
    let defaults = UserDefaults.standard
    guard let screen = defaults.string(forKey: "screen") else { return nil }
    var props: [AnyHashable: Any] = ["screen": screen]
    for key in ["seed", "lang"] { props[key] = defaults.string(forKey: key) }
    return props
    #else
    return nil
    #endif
  }

  // "Open in Novel Man", and the novelman:// scheme.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(.shared, open: readable(context), options: [:])
    }
  }

  /**
   A file opened in place lives in another app's folder and is readable only
   while its security scope is held, so it is copied somewhere ours first.
   */
  private func readable(_ context: UIOpenURLContext) -> URL {
    let url = context.url
    guard url.isFileURL, context.options.openInPlace else { return url }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "Opened/\(UUID().uuidString)", isDirectory: true)
    let copy = folder.appendingPathComponent(url.lastPathComponent)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var failure: NSError?
      var copied = false
      NSFileCoordinator().coordinate(readingItemAt: url, options: .withoutChanges, error: &failure) { at in
        copied = (try? FileManager.default.copyItem(at: at, to: copy)) != nil
      }
      return copied ? copy : url
    } catch {
      return url
    }
  }

  // Universal Links, and a tapped Spotlight result.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    if let url = spotlightLink(userActivity) {
      _ = RCTLinkingManager.application(.shared, open: url, options: [:])
      return
    }
    _ = RCTLinkingManager.application(.shared, continue: userActivity) { _ in }
  }

  /** A Spotlight item's identifier is the route it opens; see `Spotlight.m`. */
  private func spotlightLink(_ activity: NSUserActivity) -> URL? {
    guard activity.activityType == CSSearchableItemActionType,
      let route = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String
    else { return nil }
    var link = URLComponents()
    link.scheme = "novelman"
    link.host = "open"
    link.queryItems = [URLQueryItem(name: "path", value: route)]
    return link.url
  }

  /**
   `Linking.getInitialURL` answers out of the bridge's launch options, which a
   scene launch no longer fills in — the URL arrives on the connection options
   instead. Rebuild the two keys it reads, so a cold "Open in Novel Man" still
   imports the file it was handed.
   */
  private func launchOptions(
    from options: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any] {
    if let context = options.urlContexts.first {
      return [.url: readable(context)]
    }
    if let activity = options.userActivities.first, let url = spotlightLink(activity) {
      return [.url: url]
    }
    if let activity = options.userActivities.first {
      let dictionary: [AnyHashable: Any] = [
        "UIApplicationLaunchOptionsUserActivityKey": activity,
        UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
      ]
      return [.userActivityDictionary: dictionary]
    }
    return [:]
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  /**
   The bundle inside the app, in every configuration. There is no development
   server to fall back to and nothing here looks for one: the build phase
   bundles `index.js` into `main.jsbundle` and this reads that.
   */
  override func bundleURL() -> URL? {
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
  }
}
