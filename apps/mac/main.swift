// Citea Motors team portal for Mac: a small window that opens teams.citeamotors.com.
// The portal itself lives on the web, so this app never needs updating for portal changes.
import Cocoa
import WebKit

let HOME = URL(string: "https://teams.citeamotors.com/")!
let OWN_HOSTS: Set<String> = ["teams.citeamotors.com"]

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ n: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()                 // stay logged in between launches
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsMagnification = true
        web.customUserAgent = nil

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Citea Motors"
        window.minSize = NSSize(width: 420, height: 500)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("CiteaMain")
        window.makeKeyAndOrderFront(nil)

        // reopen the page you were on last time
        var start = HOME
        if let s = UserDefaults.standard.string(forKey: "lastURL"), let u = URL(string: s), let h = u.host, OWN_HOSTS.contains(h) { start = u }
        web.load(URLRequest(url: start))
        buildMenu()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ n: Notification) {
        if let u = web.url?.absoluteString { UserDefaults.standard.set(u, forKey: "lastURL") }
    }

    // ---- menus (Edit menu is what makes copy/paste work)
    func buildMenu() {
        let main = NSMenu()
        func sub(_ title: String, _ items: [NSMenuItem]) { let i = NSMenuItem(); let m = NSMenu(title: title); items.forEach { m.addItem($0) }; i.submenu = m; main.addItem(i) }
        func it(_ t: String, _ a: Selector?, _ k: String, _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem { let x = NSMenuItem(title: t, action: a, keyEquivalent: k); x.keyEquivalentModifierMask = mods; return x }
        sub("Citea", [it("About Citea Motors", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""), .separator(),
                      it("Hide Citea", #selector(NSApplication.hide(_:)), "h"), .separator(),
                      it("Quit Citea", #selector(NSApplication.terminate(_:)), "q")])
        sub("Edit", [it("Undo", Selector(("undo:")), "z"), it("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                     it("Cut", #selector(NSText.cut(_:)), "x"), it("Copy", #selector(NSText.copy(_:)), "c"),
                     it("Paste", #selector(NSText.paste(_:)), "v"), it("Select All", #selector(NSText.selectAll(_:)), "a")])
        sub("View", [it("Reload", #selector(reload), "r"), it("Home", #selector(goHome), "h", [.command, .shift]), .separator(),
                     it("Back", #selector(goBack), "["), it("Forward", #selector(goForward), "]"), .separator(),
                     it("Zoom In", #selector(zoomIn), "+"), it("Zoom Out", #selector(zoomOut), "-"), it("Actual Size", #selector(zoomReset), "0"), .separator(),
                     it("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
        sub("Window", [it("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"), it("Close", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }
    @objc func reload() { web.reload() }
    @objc func goHome() { web.load(URLRequest(url: HOME)) }
    @objc func goBack() { if web.canGoBack { web.goBack() } }
    @objc func goForward() { if web.canGoForward { web.goForward() } }
    @objc func zoomIn() { web.pageZoom = min(web.pageZoom + 0.1, 2) }
    @objc func zoomOut() { web.pageZoom = max(web.pageZoom - 0.1, 0.5) }
    @objc func zoomReset() { web.pageZoom = 1 }

    // ---- links: portal pages stay here, everything else opens in the normal browser
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if a.shouldPerformDownload { decisionHandler(.download); return }
        guard let u = a.request.url else { decisionHandler(.allow); return }
        let s = u.scheme ?? ""
        if ["mailto", "tel", "sms", "facetime"].contains(s) { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        if a.targetFrame?.isMainFrame == true, ["http", "https"].contains(s), let h = u.host, !OWN_HOSTS.contains(h), a.navigationType == .linkActivated {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url {
            if let h = u.host, OWN_HOSTS.contains(h) { w.load(URLRequest(url: u)) } else { NSWorkspace.shared.open(u) }
        }
        return nil
    }
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { if let u = w.url?.absoluteString { UserDefaults.standard.set(u, forKey: "lastURL") } }

    // ---- downloads (receipts, exports) go to the Downloads folder
    func webView(_ w: WKWebView, navigationAction a: WKNavigationAction, didBecome d: WKDownload) { d.delegate = self }
    func webView(_ w: WKWebView, navigationResponse r: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = self }
    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename name: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var dest = dir.appendingPathComponent(name); var n = 1
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        while FileManager.default.fileExists(atPath: dest.path) { n += 1; dest = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)") }
        completionHandler(dest)
    }
    func downloadDidFinish(_ d: WKDownload) {
        if let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first { NSWorkspace.shared.open(dir) }
    }

    // ---- file pickers (photos, receipts) and camera/mic
    func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let o = NSOpenPanel(); o.canChooseFiles = true; o.canChooseDirectories = false; o.allowsMultipleSelection = p.allowsMultipleSelection
        o.beginSheetModal(for: window) { r in completionHandler(r == .OK ? o.urls : nil) }
    }
    @available(macOS 12.0, *)
    func webView(_ w: WKWebView, requestMediaCapturePermissionFor o: WKSecurityOrigin, initiatedByFrame f: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(OWN_HOSTS.contains(o.host) ? .grant : .prompt)
    }

    // ---- alert / confirm / prompt boxes
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }
    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText d: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = p; let t = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24)); t.stringValue = d ?? ""
        a.accessoryView = t; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? t.stringValue : nil) }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
