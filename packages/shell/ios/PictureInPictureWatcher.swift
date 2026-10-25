import AppKit

final class PictureInPictureWatcher {
  static let shared = PictureInPictureWatcher()

  private static let title = "Picture in Picture"
  private static let steps = 8
  private static let minimumWidth: CGFloat = 180
  private static let largestShareOfScreen: CGFloat = 0.75
  private static let screenMargin: CGFloat = 12
  private static let pinchGain: CGFloat = 0.9
  private static let settleSeconds = 0.35
  private static let edgeBand: CGFloat = 6
  private static let cornerBand: CGFloat = 12

  private struct Pinch {
    let window: NSWindow
    let start: NSRect
    let aspect: CGFloat
    let growsLeft: Bool
    let growsDown: Bool
    var width: CGFloat
    var step: Int
    var atLimit: Bool
  }

  private struct EdgeDrag {
    let window: NSWindow
    let start: NSRect
    let mouse: NSPoint
    let dx: Int
    let dy: Int
    let aspect: CGFloat
    var step: Int
    var atLimit: Bool
  }

  private var monitor: Any?
  private var mouseMonitor: Any?
  private var edgeDrag: EdgeDrag?
  private var restoreFrames: [ObjectIdentifier: NSRect] = [:]
  private var observers: [(NotificationCenter, NSObjectProtocol)] = []
  private var pinch: Pinch?

  func start() {
    guard monitor == nil else { return }
    monitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] event in
      guard let self, let window = event.window, Self.isPictureInPicture(window) else { return event }
      self.track(event, in: window)
      return nil
    }
    mouseMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .leftMouseDragged, .leftMouseUp]) { [weak self] event in
      self?.mouse(event) ?? event
    }
    let app = NotificationCenter.default
    let workspace = NSWorkspace.shared.notificationCenter
    observe(app, NSApplication.didChangeScreenParametersNotification) { [weak self] in self?.keepAllOnScreen() }
    observe(workspace, NSWorkspace.activeSpaceDidChangeNotification) { [weak self] in self?.keepAllOnScreen() }
    observe(app, NSWindow.didExitFullScreenNotification) { [weak self] in self?.keepAllOnScreen() }
    observe(app, NSWindow.didChangeScreenNotification) { [weak self] in self?.keepAllOnScreen() }
  }

  func stop() {
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
    if let mouseMonitor { NSEvent.removeMonitor(mouseMonitor) }
    mouseMonitor = nil
    edgeDrag = nil
    for (center, token) in observers { center.removeObserver(token) }
    observers = []
    pinch = nil
  }

  static func isPictureInPicture(_ window: NSWindow) -> Bool {
    guard window.parent == nil, window.isVisible, WindowManager.shared.id(of: window) == nil else { return false }
    guard NSStringFromClass(type(of: window)).hasPrefix("NativeWidgetMac") else { return false }
    return window.title == title
  }

  static var windows: [NSWindow] { NSApp.windows.filter(isPictureInPicture) }

  private func observe(_ center: NotificationCenter, _ name: Notification.Name, _ run: @escaping () -> Void) {
    let token = center.addObserver(forName: name, object: nil, queue: .main) { _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: run)
    }
    observers.append((center, token))
  }

  private func visibleFrame(of window: NSWindow) -> NSRect? {
    (window.screen ?? NSScreen.main)?.visibleFrame.insetBy(dx: Self.screenMargin, dy: Self.screenMargin)
  }

  func keepAllOnScreen() {
    guard pinch == nil else { return }
    for window in Self.windows { keepOnScreen(window) }
  }

  private func keepOnScreen(_ window: NSWindow) {
    guard let area = visibleFrame(of: window) else { return }
    let inside = Self.fitted(window.frame, in: area)
    guard inside != window.frame else { return }
    NSAnimationContext.runAnimationGroup { context in
      context.duration = Self.settleSeconds
      context.timingFunction = CAMediaTimingFunction(name: .easeOut)
      window.animator().setFrame(inside, display: true)
    }
  }

  static func fitted(_ frame: NSRect, in area: NSRect) -> NSRect {
    var f = frame
    if f.width > area.width { f.size = NSSize(width: area.width, height: area.width * f.height / max(f.width, 1)) }
    if f.height > area.height { f.size = NSSize(width: area.height * f.width / max(f.height, 1), height: area.height) }
    f.origin.x = min(max(f.minX, area.minX), area.maxX - f.width)
    f.origin.y = min(max(f.minY, area.minY), area.maxY - f.height)
    return f.integral
  }

  private func limits(for window: NSWindow) -> (min: CGFloat, max: CGFloat) {
    let area = visibleFrame(of: window) ?? window.frame
    let lower = max(window.minSize.width, Self.minimumWidth)
    let screenCap = area.width * Self.largestShareOfScreen
    let ownCap = window.maxSize.width > 0 && window.maxSize.width < 100_000 ? window.maxSize.width : screenCap
    return (lower, max(lower, min(ownCap, screenCap)))
  }

  private func stepIndex(_ width: CGFloat, _ range: (min: CGFloat, max: CGFloat)) -> Int {
    guard range.max > range.min else { return 0 }
    return Int(((width - range.min) / (range.max - range.min) * CGFloat(Self.steps)).rounded(.down))
  }

  private func track(_ event: NSEvent, in window: NSWindow) {
    if event.phase.contains(.began) || pinch?.window !== window {
      let frame = window.frame
      let area = visibleFrame(of: window) ?? frame
      let range = limits(for: window)
      pinch = Pinch(
        window: window, start: frame, aspect: frame.width / max(frame.height, 1),
        growsLeft: frame.midX > area.midX, growsDown: frame.midY > area.midY,
        width: frame.width, step: stepIndex(frame.width, range), atLimit: false)
    }
    guard var p = pinch else { return }
    if !event.phase.contains(.began) { resize(&p, by: event.magnification) }
    pinch = p
    if event.phase.contains(.ended) || event.phase.contains(.cancelled) {
      pinch = nil
      keepOnScreen(window)
    }
  }

  private func resize(_ p: inout Pinch, by magnification: CGFloat) {
    let range = limits(for: p.window)
    let wanted = p.width * (1 + magnification * Self.pinchGain)
    let width = min(max(wanted, range.min), range.max)
    let clamped = width != wanted
    if clamped && !p.atLimit { Self.haptic(.levelChange) }
    p.atLimit = clamped
    let step = stepIndex(width, range)
    if step != p.step && !clamped { Self.haptic(.alignment) }
    p.step = step
    p.width = width
    p.window.setFrame(frame(for: p), display: true)
  }

  private func frame(for p: Pinch) -> NSRect {
    let width = p.width.rounded()
    let height = (p.width / p.aspect).rounded()
    let x = p.growsLeft ? p.start.maxX - width : p.start.minX
    let y = p.growsDown ? p.start.maxY - height : p.start.minY
    let frame = NSRect(x: x, y: y, width: width, height: height)
    guard let area = visibleFrame(of: p.window) else { return frame }
    return Self.fitted(frame, in: area)
  }

  private static func zone(at point: NSPoint, in size: NSSize) -> (dx: Int, dy: Int)? {
    let band = { (value: CGFloat, length: CGFloat, width: CGFloat) -> Int in value <= width ? -1 : value >= length - width ? 1 : 0 }
    let corner = (band(point.x, size.width, cornerBand), band(point.y, size.height, cornerBand))
    if corner.0 != 0 && corner.1 != 0 { return corner }
    let edge = (band(point.x, size.width, edgeBand), band(point.y, size.height, edgeBand))
    return edge.0 == 0 && edge.1 == 0 ? nil : edge
  }

  private static func cursor(dx: Int, dy: Int) -> NSCursor {
    if #available(macOS 15.0, *) {
      let position: NSCursor.FrameResizePosition =
        switch (dx, dy) {
        case (-1, 1): .topLeft
        case (1, 1): .topRight
        case (-1, -1): .bottomLeft
        case (1, -1): .bottomRight
        case (-1, _): .left
        case (1, _): .right
        case (_, 1): .top
        default: .bottom
        }
      return .frameResize(position: position, directions: .all)
    }
    return dx != 0 ? .resizeLeftRight : .resizeUpDown
  }

  private func mouse(_ event: NSEvent) -> NSEvent? {
    if event.type == .leftMouseDragged, var drag = edgeDrag {
      resize(&drag, to: NSEvent.mouseLocation)
      edgeDrag = drag
      return nil
    }
    if event.type == .leftMouseUp, let drag = edgeDrag {
      edgeDrag = nil
      keepOnScreen(drag.window)
      return nil
    }
    guard let window = event.window, Self.isPictureInPicture(window),
      let zone = Self.zone(at: event.locationInWindow, in: window.frame.size)
    else { return event }
    switch event.type {
    case .mouseMoved:
      Self.cursor(dx: zone.dx, dy: zone.dy).set()
      return event
    case .leftMouseDown where event.clickCount == 2:
      toggleLargest(window)
      return nil
    case .leftMouseDown:
      let frame = window.frame
      edgeDrag = EdgeDrag(
        window: window, start: frame, mouse: NSEvent.mouseLocation, dx: zone.dx, dy: zone.dy,
        aspect: frame.width / max(frame.height, 1), step: stepIndex(frame.width, limits(for: window)), atLimit: false)
      Self.cursor(dx: zone.dx, dy: zone.dy).set()
      return nil
    default:
      return event
    }
  }

  private func resize(_ drag: inout EdgeDrag, to point: NSPoint) {
    let range = limits(for: drag.window)
    let s = drag.start
    let fromX = drag.dx == 0 ? nil : s.width + CGFloat(drag.dx) * (point.x - drag.mouse.x)
    let fromY = drag.dy == 0 ? nil : (s.height + CGFloat(drag.dy) * (point.y - drag.mouse.y)) * drag.aspect
    let wanted = [fromX, fromY].compactMap { $0 }.max { abs($0 - s.width) < abs($1 - s.width) } ?? s.width
    let width = min(max(wanted, range.min), range.max)
    let clamped = width != wanted
    if clamped && !drag.atLimit { Self.haptic(.levelChange) }
    drag.atLimit = clamped
    let step = stepIndex(width, range)
    if step != drag.step && !clamped { Self.haptic(.alignment) }
    drag.step = step
    let height = width / drag.aspect
    let x = drag.dx < 0 ? s.maxX - width : drag.dx > 0 ? s.minX : s.midX - width / 2
    let y = drag.dy < 0 ? s.maxY - height : drag.dy > 0 ? s.minY : s.midY - height / 2
    let frame = NSRect(x: x, y: y, width: width, height: height).integral
    drag.window.setFrame(visibleFrame(of: drag.window).map { Self.fitted(frame, in: $0) } ?? frame, display: true)
  }

  private func toggleLargest(_ window: NSWindow) {
    let key = ObjectIdentifier(window)
    let target: NSRect
    if let previous = restoreFrames.removeValue(forKey: key) {
      target = previous
    } else {
      restoreFrames[key] = window.frame
      let frame = window.frame
      let area = visibleFrame(of: window) ?? frame
      let width = limits(for: window).max
      let height = width * frame.height / max(frame.width, 1)
      let x = frame.midX > area.midX ? frame.maxX - width : frame.minX
      let y = frame.midY > area.midY ? frame.maxY - height : frame.minY
      target = Self.fitted(NSRect(x: x, y: y, width: width, height: height), in: area)
    }
    Self.haptic(.levelChange)
    NSAnimationContext.runAnimationGroup { context in
      context.duration = Self.settleSeconds
      context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      window.animator().setFrame(target, display: true)
    }
  }

  private static func haptic(_ pattern: NSHapticFeedbackManager.FeedbackPattern) {
    NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
  }

  #if DEBUG
  func devDescribe() -> [[String: Any]] {
    NSApp.windows.filter { WindowManager.shared.id(of: $0) == nil && $0.isVisible }.map { w in
      [
        "class": NSStringFromClass(type(of: w)), "title": w.title, "level": w.level.rawValue, "styleMask": w.styleMask.rawValue,
        "resizable": w.styleMask.contains(.resizable), "parent": w.parent != nil, "pip": Self.isPictureInPicture(w),
        "frame": [w.frame.minX, w.frame.minY, w.frame.width, w.frame.height], "minSize": [w.minSize.width, w.minSize.height],
        "maxSize": [w.maxSize.width, w.maxSize.height], "visible": visibleFrame(of: w).map { [$0.minX, $0.minY, $0.width, $0.height] } ?? [],
      ]
    }
  }

  func devPinch(_ magnifications: [Double]) -> [[Double]] {
    guard let window = Self.windows.first else { return [] }
    let frame = window.frame
    let area = visibleFrame(of: window) ?? frame
    let range = limits(for: window)
    var p = Pinch(
      window: window, start: frame, aspect: frame.width / max(frame.height, 1),
      growsLeft: frame.midX > area.midX, growsDown: frame.midY > area.midY,
      width: frame.width, step: stepIndex(frame.width, range), atLimit: false)
    var out: [[Double]] = []
    for m in magnifications {
      resize(&p, by: CGFloat(m))
      out.append([Double(window.frame.minX), Double(window.frame.minY), Double(window.frame.width), Double(window.frame.height), p.atLimit ? 1 : 0])
    }
    return out
  }

  func devEdgeDrag(_ values: [Double]) -> [Double] {
    guard let window = Self.windows.first, values.count == 4 else { return [] }
    let frame = window.frame
    var drag = EdgeDrag(
      window: window, start: frame, mouse: NSPoint(x: frame.midX, y: frame.midY), dx: Int(values[0]), dy: Int(values[1]),
      aspect: frame.width / max(frame.height, 1), step: stepIndex(frame.width, limits(for: window)), atLimit: false)
    resize(&drag, to: NSPoint(x: frame.midX + values[2], y: frame.midY + values[3]))
    return [Double(window.frame.minX), Double(window.frame.minY), Double(window.frame.width), Double(window.frame.height), drag.atLimit ? 1 : 0]
  }

  func devToggleLargest() {
    if let window = Self.windows.first { toggleLargest(window) }
  }

  func devZone(_ values: [Double]) -> [Int] {
    guard values.count == 4, let zone = Self.zone(at: NSPoint(x: values[0], y: values[1]), in: NSSize(width: values[2], height: values[3])) else { return [] }
    return [zone.dx, zone.dy]
  }

  func devPlace(_ frame: [Double]) {
    guard let window = Self.windows.first, frame.count == 4 else { return }
    window.setFrame(NSRect(x: frame[0], y: frame[1], width: frame[2], height: frame[3]), display: true)
  }
  #endif
}
