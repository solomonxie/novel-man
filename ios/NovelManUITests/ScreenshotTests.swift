import XCTest

/// Listing screenshots from the sample book, story bible first. Needs a SCREENSHOTS build;
/// shots are attachments in the result bundle. Ends by switching the app back to the real library.
final class ScreenshotTests: XCTestCase {
  private let shots: [(name: String, route: String)] = [
    ("01-cast", "/entity/@sample~Elizabeth_Bennet"),
    ("02-graph", "/book/@sample/graph"),
    ("03-continuity", "/book/@sample/cast"),
    ("04-structure", "/book/@sample/structure"),
    ("05-place", "/place/@sample~Pemberley"),
    ("06-book", "/book/@sample"),
  ]

  override func setUp() {
    continueAfterFailure = true
  }

  private func launch(_ route: String, seed: String, lang: String? = nil) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-screen", route, "-seed", seed] + (lang.map { ["-lang", $0] } ?? [])
    app.launch()
    return app
  }

  private func capture(lang: String, fresh: Bool) {
    let ready = launch("/book/@sample/cast", seed: fresh ? "sample-fresh" : "sample", lang: lang)
    let elizabeth = ready.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Elizabeth'")).firstMatch
    XCTAssertTrue(elizabeth.waitForExistence(timeout: 180), "sample never analysed")
    for shot in shots {
      _ = launch(shot.route, seed: "sample", lang: lang)
      sleep(6)
      let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      attachment.name = "\(lang)-\(shot.name)"
      attachment.lifetime = .keepAlways
      add(attachment)
    }
  }

  func test1English() { capture(lang: "en", fresh: true) }
  func test2Chinese() { capture(lang: "zh-Hans", fresh: false) }
  func test3BackToRealLibrary() {
    let app = launch("/", seed: "off")
    sleep(5)
    app.terminate()
  }
}
