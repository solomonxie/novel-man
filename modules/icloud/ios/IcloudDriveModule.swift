import Foundation
import React

/**
 The app's own iCloud Drive container — the one destination that outlives the
 app. Deleting Novel Man leaves the folder and every bundle in it, which is
 what makes an automatic restore on a fresh install possible at all.

 Only exported snapshots go here. The live SQLite database must never be
 pointed at a cloud drive: it syncs file-at-a-time and knows nothing about
 write-ahead logs, so it would collect `novel-man 2.db` conflict copies.
 */
@objc(IcloudDrive)
public class IcloudDrive: NSObject {

  /// Nothing here touches the UI, and asking for the container blocks on the
  /// file coordination daemon for long enough to drop frames.
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(status:reject:)
  func status(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(driveStatus())
  }

  @objc(copyIn:name:resolve:reject:)
  func copyIn(
    _ fromPath: String, name: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock
  ) {
    guard let documents = documentsURL() else { return reject(UNAVAILABLE, UNAVAILABLE_TEXT, nil) }
    let target = documents.appendingPathComponent(name)
    do {
      try FileManager.default.createDirectory(
        at: target.deletingLastPathComponent(), withIntermediateDirectories: true
      )
      // The JS side names the file for its day, so this only replaces a copy
      // taken earlier the same day; the days before it are left alone and
      // pruned by count, not by being written over.
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      try FileManager.default.copyItem(at: URL(fileURLWithPath: fromPath), to: target)
      resolve(Date().timeIntervalSince1970 * 1000)
    } catch {
      reject("copy_failed", error.localizedDescription, error)
    }
  }

  @objc(latest:reject:)
  func latest(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let newest = newestBundle() else { return resolve(nil) }
    resolve(["name": newest.name, "modifiedAt": newest.at.timeIntervalSince1970 * 1000])
  }

  // Retention is decided in JS, which knows what the policy is; this only
  // reports what is there and removes what it is told to.
  @objc(list:reject:)
  func list(_ resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(bundles().map { ["name": $0.name, "modifiedAt": $0.at.timeIntervalSince1970 * 1000] })
  }

  @objc(remove:resolve:reject:)
  func remove(
    _ name: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock
  ) {
    guard let documents = documentsURL() else { return reject(UNAVAILABLE, UNAVAILABLE_TEXT, nil) }
    let target = documents.appendingPathComponent(name)
    do {
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      resolve(nil)
    } catch {
      reject("remove_failed", error.localizedDescription, error)
    }
  }

  @objc(copyOut:toPath:resolve:reject:)
  func copyOut(
    _ name: String, toPath: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock
  ) {
    guard let documents = documentsURL() else { return reject(UNAVAILABLE, UNAVAILABLE_TEXT, nil) }
    let source = documents.appendingPathComponent(name)
    do {
      try download(source)
      let target = URL(fileURLWithPath: toPath)
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      try FileManager.default.copyItem(at: source, to: target)
      resolve(nil)
    } catch {
      reject("download_failed", error.localizedDescription, error)
    }
  }

  // MARK: - Container

  private func containerURL() -> URL? {
    return FileManager.default.url(forUbiquityContainerIdentifier: nil)
  }

  /// `Documents` is the only subfolder the Files app shows, so a backup the
  /// user can't reach is a backup that isn't there.
  private func documentsURL() -> URL? {
    guard let container = containerURL() else { return nil }
    let documents = container.appendingPathComponent("Documents")
    try? FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
    return documents
  }

  /**
   Four unrelated reasons return nil, and reporting them as one is how a user
   who is already signed in gets told to sign in. The order matters:
   `ubiquityIdentityToken` itself needs the entitlement, so in an unentitled
   build it reads nil and is indistinguishable from a signed-out account.
   */
  private func driveStatus() -> String {
    if containerURL() != nil { return "available" }
    if !isEntitled() { return "notEntitled" }
    if FileManager.default.ubiquityIdentityToken == nil { return "driveOff" }
    return "notReady"
  }

  /// `SecTaskCopyValueForEntitlement` isn't in the iOS SDK, so the signed
  /// entitlements are read out of the embedded provisioning profile. An App
  /// Store build carries no profile — nothing to doubt, assume entitled.
  private func isEntitled() -> Bool {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let raw = try? Data(contentsOf: url),
          let text = String(data: raw, encoding: .isoLatin1),
          let start = text.range(of: "<?xml"),
          let end = text.range(of: "</plist>")
    else { return true }

    let plist = String(text[start.lowerBound..<end.upperBound])
    guard let data = plist.data(using: .isoLatin1),
          let parsed = try? PropertyListSerialization.propertyList(from: data, format: nil),
          let profile = parsed as? [String: Any],
          let entitlements = profile["Entitlements"] as? [String: Any]
    else { return true }

    return entitlements["com.apple.developer.icloud-container-identifiers"] != nil
  }

  // MARK: - Files

  private func newestBundle() -> (name: String, at: Date)? {
    return bundles().max { left, right in left.at < right.at }
  }

  /// Every bundle in the container, placeholders included — a file not yet
  /// pulled down is still a backup that exists, and still counts against
  /// whatever retention the JS side is applying.
  private func bundles() -> [(name: String, at: Date)] {
    guard let documents = documentsURL(),
          let walker = FileManager.default.enumerator(
            at: documents, includingPropertiesForKeys: [.contentModificationDateKey]
          )
    else { return [] }

    var found: [(name: String, at: Date)] = []
    for case let url as URL in walker {
      // A bundle not yet pulled down is listed as `.name.zip.icloud`, and its
      // real name is what a later copyOut has to ask for. `.nmbak` is what
      // the bundle was called before it was named for the zip it always was.
      let placeholder = url.lastPathComponent.hasPrefix(".")
        && url.pathExtension == "icloud"
      guard ["zip", "nmbak"].contains(url.pathExtension) || placeholder else { continue }

      let name = placeholder
        ? String(url.lastPathComponent.dropFirst().dropLast(".icloud".count))
        : url.lastPathComponent
      let folder = url.deletingLastPathComponent().lastPathComponent
      let key = folder == "Documents" ? name : "\(folder)/\(name)"
      let at = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
        .contentModificationDate ?? Date(timeIntervalSince1970: 0)
      found.append((key, at))
    }
    return found
  }

  /// On a fresh install the file is usually still a placeholder: asking for
  /// the bytes without waiting reads an empty zip.
  private func download(_ url: URL) throws {
    if FileManager.default.fileExists(atPath: url.path) { return }
    try FileManager.default.startDownloadingUbiquitousItem(at: url)
    let deadline = Date().addingTimeInterval(60)
    while Date() < deadline {
      if FileManager.default.fileExists(atPath: url.path) { return }
      Thread.sleep(forTimeInterval: 0.25)
    }
    throw DownloadTimedOut()
  }
}

private let UNAVAILABLE = "drive_unavailable"
private let UNAVAILABLE_TEXT = "iCloud Drive is not available on this device"

/// The bytes are still in the cloud; asking for them without waiting reads an
/// empty zip.
struct DownloadTimedOut: LocalizedError {
  var errorDescription: String? { "The backup is still downloading from iCloud" }
}
