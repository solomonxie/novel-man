import ExpoModulesCore

/**
 The app's own iCloud Drive container — the one destination that outlives the
 app. Deleting Novel Man leaves the folder and every bundle in it, which is
 what makes an automatic restore on a fresh install possible at all.

 Only exported snapshots go here. The live SQLite database must never be
 pointed at a cloud drive: it syncs file-at-a-time and knows nothing about
 write-ahead logs, so it would collect `novel-man 2.db` conflict copies.
 */
public class IcloudDriveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IcloudDrive")

    // Every call is async: asking for the container touches the file
    // coordination daemon and blocks for long enough to drop frames.
    AsyncFunction("status") { () -> String in
      return self.status()
    }

    AsyncFunction("copyIn") { (fromPath: String, name: String) -> Double in
      guard let documents = self.documentsURL() else {
        throw DriveUnavailable()
      }
      let target = documents.appendingPathComponent(name)
      try FileManager.default.createDirectory(
        at: target.deletingLastPathComponent(), withIntermediateDirectories: true
      )
      // One bundle per day: replacing today's file keeps the folder a history
      // rather than a pile of near-identical zips.
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      try FileManager.default.copyItem(at: URL(fileURLWithPath: fromPath), to: target)
      return Date().timeIntervalSince1970 * 1000
    }

    AsyncFunction("latest") { () -> DriveFile? in
      guard let newest = self.newestBundle() else { return nil }
      let file = DriveFile()
      file.name = newest.name
      file.modifiedAt = newest.at.timeIntervalSince1970 * 1000
      return file
    }

    AsyncFunction("copyOut") { (name: String, toPath: String) -> Void in
      guard let documents = self.documentsURL() else { throw DriveUnavailable() }
      let source = documents.appendingPathComponent(name)
      try self.download(source)
      let target = URL(fileURLWithPath: toPath)
      if FileManager.default.fileExists(atPath: target.path) {
        try FileManager.default.removeItem(at: target)
      }
      try FileManager.default.copyItem(at: source, to: target)
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
  private func status() -> String {
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
    guard let documents = documentsURL(),
          let walker = FileManager.default.enumerator(
            at: documents, includingPropertiesForKeys: [.contentModificationDateKey]
          )
    else { return nil }

    var newest: (name: String, at: Date)?
    for case let url as URL in walker {
      // A bundle not yet pulled down is listed as `.name.nmbak.icloud`, and
      // its real name is what a later copyOut has to ask for.
      let placeholder = url.lastPathComponent.hasPrefix(".")
        && url.pathExtension == "icloud"
      guard url.pathExtension == "nmbak" || placeholder else { continue }

      let name = placeholder
        ? String(url.lastPathComponent.dropFirst().dropLast(".icloud".count))
        : url.lastPathComponent
      let folder = url.deletingLastPathComponent().lastPathComponent
      let key = folder == "Documents" ? name : "\(folder)/\(name)"
      let at = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
        .contentModificationDate ?? Date(timeIntervalSince1970: 0)
      if newest == nil || at > newest!.at { newest = (key, at) }
    }
    return newest
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

/// The newest bundle in the folder, named by the key a `copyOut` asks for.
internal struct DriveFile: Record {
  @Field var name: String = ""
  @Field var modifiedAt: Double = 0
}

internal final class DriveUnavailable: Exception, @unchecked Sendable {
  override var reason: String { "iCloud Drive is not available on this device" }
}

internal final class DownloadTimedOut: Exception, @unchecked Sendable {
  override var reason: String { "The backup is still downloading from iCloud" }
}
