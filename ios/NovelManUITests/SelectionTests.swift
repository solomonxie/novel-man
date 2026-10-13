import XCTest

final class SelectionTests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    // SCREENSHOTS builds seed the demo library and open this route.
    app.launchArguments = ["-screen", "/reader/@Moby-Dick"]
    app.launch()
  }

  // The page's read-only TextInput is not exposed as a text view, so touches go by position.
  private var screen: XCUIElement { app.windows.firstMatch }
  // The bar is Pressables, which are not exposed as buttons.
  private func labelled(_ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
  }
  private var copyButton: XCUIElement { labelled("Copy") }
  private var doneButton: XCUIElement { labelled("Done") }
  private var removeButton: XCUIElement { labelled("Remove") }

  private func shot(_ name: String) {
    try? XCUIScreen.main.screenshot().pngRepresentation
      .write(to: URL(fileURLWithPath: "/tmp/nm-drive/\(self.name.split(separator: " ").last!.dropLast())-\(name).png"))
  }

  private func waitForReader() {
    let open = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Loomings'")).firstMatch
    if !open.waitForExistence(timeout: 30) {
      print(app.debugDescription)
      XCTFail("reader did not open")
    }
    sleep(2)
  }

  private func select() {
    waitForReader()
    let from = screen.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.365))
    let to = screen.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.46))
    from.press(forDuration: 1.2, thenDragTo: to)
    shot("selected")
    XCTAssertTrue(copyButton.waitForExistence(timeout: 5), "selection bar did not appear")
  }

  private func assertStaysDismissed(_ what: String) {
    XCTAssertTrue(copyButton.waitForNonExistence(timeout: 3), "bar still up after \(what)")
    // A native selection left behind settles back into the bar after 150 ms.
    sleep(2)
    XCTAssertFalse(copyButton.exists, "bar came back after \(what)")
  }

  func testCopyDismissesBarAndSaysCopied() {
    select()
    copyButton.tap()
    XCTAssertTrue(labelled("Copied").waitForExistence(timeout: 1), "no Copied tip")
    shot("copied")
    assertStaysDismissed("Copy")
  }

  func testDoneDeselects() {
    select()
    doneButton.tap()
    assertStaysDismissed("Done")
  }

  func testSelectingAgainAfterDone() {
    select()
    doneButton.tap()
    assertStaysDismissed("Done")
    select()
  }

  /// Highlights the dragged passage with the first swatch; tests make their own, so none depends on another.
  private func highlightSelection() {
    select()
    screen.coordinate(withNormalizedOffset: CGVector(dx: 0.147, dy: 0.858)).tap()
    assertStaysDismissed("a swatch")
  }

  private var inPassage: XCUICoordinate {
    screen.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.4))
  }

  func testTapOnHighlightSelectsItAndRemoveTakesItOff() {
    waitForReader()
    highlightSelection()
    shot("highlighted")
    inPassage.tap()
    XCTAssertTrue(removeButton.waitForExistence(timeout: 3), "tap on a highlight did not select it")
    shot("tapped")
    removeButton.tap()
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 1), "a bare highlight should not ask")
    assertStaysDismissed("Remove")
    inPassage.tap()
    sleep(1)
    XCTAssertFalse(copyButton.exists, "removed highlight still selects on tap")
    shot("removed")
  }

  func testTapOutsideAHighlightOnlyTogglesTheBars() {
    waitForReader()
    screen.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    sleep(1)
    XCTAssertFalse(copyButton.exists, "plain text selected on a tap")
  }
}
