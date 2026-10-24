import AppKit

final class PinchWatcher {
  static let shared = PinchWatcher()
  static let threshold: CGFloat = 0.3

  var emit: ((String, [String: Any]) -> Void)?
  private var enabled = false
  private var monitor: Any?
  private var total: CGFloat = 0
  private var fired = false

  func watch(_ on: Bool) {
    enabled = on
    if on, monitor == nil {
      monitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] event in
        self?.track(event)
        return event
      }
    } else if !on, let monitor {
      NSEvent.removeMonitor(monitor)
      self.monitor = nil
    }
  }

  private func track(_ event: NSEvent) {
    if event.phase.contains(.began) {
      total = 0
      fired = false
    }
    total += event.magnification
    if !fired, abs(total) >= Self.threshold, let window = event.window, let id = WindowManager.shared.id(of: window) {
      fired = true
      emit?("onWindowEvent", ["type": "pinch", "id": id, "direction": total < 0 ? "in" : "out"])
    }
    if event.phase.contains(.ended) || event.phase.contains(.cancelled) {
      total = 0
      fired = false
    }
  }
}
