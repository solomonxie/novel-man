// swift tools/caption-screenshot.swift <in> <out.jpg> "<caption>"
import AppKit

let args = CommandLine.arguments
guard args.count == 4, let shot = NSImage(contentsOfFile: args[1]) else {
  FileHandle.standardError.write("usage: caption-screenshot.swift <in> <out.jpg> <caption>\n".data(using: .utf8)!)
  exit(1)
}
let (width, height, band, inset) = (1320, 2868, 440.0, 90.0)

let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
  samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
  bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

NSColor(red: 0.11, green: 0.11, blue: 0.10, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

let style = NSMutableParagraphStyle()
style.alignment = .center
let caption = NSAttributedString(string: args[3], attributes: [
  .font: NSFont(name: "Georgia-Bold", size: 84) ?? NSFont.boldSystemFont(ofSize: 84),
  .foregroundColor: NSColor.white,
  .paragraphStyle: style,
])
let textBox = NSRect(x: inset, y: Double(height) - band, width: Double(width) - 2 * inset, height: band - 60)
let fitted = caption.boundingRect(with: textBox.size, options: [.usesLineFragmentOrigin])
caption.draw(with: NSRect(x: textBox.minX, y: textBox.midY - fitted.height / 2, width: textBox.width, height: fitted.height),
             options: [.usesLineFragmentOrigin])

let room = NSSize(width: Double(width) - 2 * inset, height: Double(height) - band - inset)
let scale = min(room.width / shot.size.width, room.height / shot.size.height)
let size = NSSize(width: shot.size.width * scale, height: shot.size.height * scale)
let frame = NSRect(x: (Double(width) - size.width) / 2, y: room.height - size.height + inset / 2, width: size.width, height: size.height)
NSGraphicsContext.saveGraphicsState()
NSBezierPath(roundedRect: frame, xRadius: 56, yRadius: 56).addClip()
shot.draw(in: frame)
NSGraphicsContext.restoreGraphicsState()

NSGraphicsContext.current = nil
try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!.write(to: URL(fileURLWithPath: args[2]))
