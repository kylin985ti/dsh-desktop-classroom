import AppKit
@preconcurrency import WebKit
import Foundation

struct BrowserError: Error { let message: String }
func require(_ condition: Bool,_ text: String) throws { if !condition { throw BrowserError(message:text) } }
func limited(_ text:String,_ count:Int)->String {
    var output = ""
    for scalar in text.unicodeScalars { if output.utf16.count + scalar.utf16.count > count { break }; output.unicodeScalars.append(scalar) }
    return output
}
func homeDirectory() -> URL { URL(fileURLWithPath:String(cString:getpwuid(getuid())!.pointee.pw_dir)) }
func documentURL(_ value: String, home: Bool = false) throws -> URL {
    guard var parts = URLComponents(string:value), parts.scheme == "https", parts.host == "docs.qq.com", parts.port == nil, parts.user == nil, parts.password == nil else { throw BrowserError(message:"请使用腾讯文档的 HTTPS 链接") }
    if home && ["/","/desktop","/desktop/"].contains(parts.path) { return URL(string:"https://docs.qq.com/desktop/")! }
    try require(parts.path.range(of:"^/(doc|sheet|slide|form|mind|flowchart|smartsheet|smartcanvas)/[^/]{1,300}/?$",options:.regularExpression) != nil,"请先打开一份腾讯文档")
    parts.queryItems = parts.queryItems?.filter { ["tab","sheet"].contains($0.name) && ($0.value?.count ?? 0) <= 160 }; parts.fragment = nil
    guard let url = parts.url else { throw BrowserError(message:"文档链接无效") }; return url
}
func privateDirectory(_ url: URL) throws {
    try FileManager.default.createDirectory(at:url,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
    let attrs = try FileManager.default.attributesOfItem(atPath:url.path)
    try require(url.standardizedFileURL == url.resolvingSymlinksInPath() && attrs[.type] as? FileAttributeType == .typeDirectory && attrs[.ownerAccountID] as? UInt32 == getuid(),"本地接收目录身份无效")
    try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:url.path)
}
final class BrowserDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!, web: WKWebView!, quote: NSButton!, whole: NSButton!
    let address = NSTextField(), status = NSTextField(labelWithString:"在网页正常登录。只在点击引用后读取选区；接收内容先留在本机，尚未发送给模型。")
    var frames: [WKFrameInfo] = [], destination: URL!, initial = URL(string:"https://docs.qq.com/desktop/")!
    var taking = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        do { try configureDestination() } catch { fatal((error as? BrowserError)?.message ?? "无法读取本机浏览请求"); return }
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .default()
        let script = WKUserScript(source:"window.webkit.messageHandlers.dshFrame.postMessage('ready');",injectionTime:.atDocumentEnd,forMainFrameOnly:false,in:.defaultClient)
        configuration.userContentController.addUserScript(script); configuration.userContentController.add(self,contentWorld:.defaultClient,name:"dshFrame")
        web = WKWebView(frame:.zero,configuration:configuration); web.navigationDelegate = self; web.uiDelegate = self; web.allowsBackForwardNavigationGestures = true
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1160,height:820),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title = "腾讯文档 · DSH 文档浏览器"; window.center(); window.isReleasedWhenClosed = false
        let back = NSButton(title:"后退",target:self,action:#selector(goBack)), forward = NSButton(title:"前进",target:self,action:#selector(goForward)), reload = NSButton(title:"刷新",target:self,action:#selector(refresh))
        let home = NSButton(title:"文档首页",target:self,action:#selector(goHome)); address.placeholderString = "粘贴腾讯文档链接"; address.target = self; address.action = #selector(navigate)
        quote = NSButton(title:"选区加入 DSH",target:self,action:#selector(captureSelection)); quote.bezelStyle = .rounded; quote.keyEquivalent = "j"; quote.keyEquivalentModifierMask = [.command,.shift]
        whole = NSButton(title:"引用整篇",target:self,action:#selector(captureDocument)); whole.bezelStyle = .rounded
        let tools = NSStackView(views:[back,forward,reload,home,address,whole,quote]); tools.spacing = 8; tools.orientation = .horizontal
        address.setContentHuggingPriority(.defaultLow,for:.horizontal); address.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
        status.font = .systemFont(ofSize:11); status.textColor = .secondaryLabelColor; status.lineBreakMode = .byTruncatingTail
        for view in [tools,web!,status] { view.translatesAutoresizingMaskIntoConstraints = false; window.contentView!.addSubview(view) }
        NSLayoutConstraint.activate([tools.topAnchor.constraint(equalTo:window.contentView!.topAnchor,constant:12),tools.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor,constant:12),tools.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor,constant:-12),web.topAnchor.constraint(equalTo:tools.bottomAnchor,constant:12),web.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor),web.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor),web.bottomAnchor.constraint(equalTo:status.topAnchor,constant:-8),status.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor,constant:14),status.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor,constant:-14),status.bottomAnchor.constraint(equalTo:window.contentView!.bottomAnchor,constant:-8)])
        window.minSize = NSSize(width:900,height:620); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        #if DEBUG_PREVIEW
        window.title = "腾讯文档浏览器验收 · 本地合成页面"
        web.loadHTMLString("<html lang='zh-CN'><head><meta charset='utf-8'><style>body{font:17px/1.9 -apple-system;padding:40px 70px;color:#25282d}h1{font-size:27px}p{max-width:700px}aside{color:#777;font-size:13px}</style></head><body><aside>仅合成验收，不连接腾讯、不读取真实账号</aside><h1>本周工作安排</h1><p>周三完成方案初稿，周五安排评审。请王同学汇总风险，李同学核对时间。</p><p>这段用于验证选区引用，未选中的段落不应被加入 DSH。</p></body></html>",baseURL:URL(string:"https://docs.qq.com/doc/synthetic-verification"))
        #else
        web.load(URLRequest(url:initial))
        #endif
    }
    func configureDestination() throws {
        #if DEBUG_PREVIEW
        let root = Bundle.main.object(forInfoDictionaryKey:"DSHVerificationHome") as? String ?? ""
        try require(!root.isEmpty,"未提供合成验收目录"); destination = URL(fileURLWithPath:root).appendingPathComponent("storages/tencent_docs/web-inbox"); try privateDirectory(destination); return
        #else
        let args = CommandLine.arguments
        if let index = args.firstIndex(of:"--request"),index+1<args.count {
            let file = URL(fileURLWithPath:args[index+1]).standardizedFileURL, attrs = try FileManager.default.attributesOfItem(atPath:file.path)
            try require(file == file.resolvingSymlinksInPath() && file.lastPathComponent == "browser-request.json" && file.deletingLastPathComponent().path.hasSuffix("/storages/tencent_docs/web-inbox") && attrs[.type] as? FileAttributeType == .typeRegular && attrs[.ownerAccountID] as? UInt32 == getuid() && ((attrs[.posixPermissions] as? Int ?? 511)&0o077) == 0 && (attrs[.size] as? Int ?? 8193)<8192,"本机浏览请求无效")
            guard let value = try JSONSerialization.jsonObject(with:Data(contentsOf:file)) as? [String:Any],let url = value["url"] as? String else { throw BrowserError(message:"浏览请求格式无效") }
            initial = try documentURL(url,home:true); destination = file.deletingLastPathComponent()
        } else { destination = homeDirectory().appendingPathComponent("Library/Application Support/dsh-desktop/harness/storages/tencent_docs/web-inbox") }
        try privateDirectory(destination)
        #endif
    }
    func fatal(_ text: String) { let alert = NSAlert(); alert.messageText = text; alert.runModal(); NSApp.terminate(nil) }
    func userContentController(_ controller: WKUserContentController,didReceive message: WKScriptMessage) { if message.name == "dshFrame" && message.frameInfo.securityOrigin.host == "docs.qq.com" && frames.count < 32 { frames.append(message.frameInfo) } }
    func webView(_ webView: WKWebView,didStartProvisionalNavigation navigation: WKNavigation!) { frames.removeAll(); quote.isEnabled = false; whole.isEnabled = false }
    func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) { address.stringValue = (try? documentURL(webView.url?.absoluteString ?? "",home:true).absoluteString) ?? "https://docs.qq.com/desktop/"; quote.isEnabled = true; whole.isEnabled = true }
    func webView(_ webView: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) { status.stringValue = "网页未能加载，请检查网络后刷新。不会导入登录或授权信息。" }
    func webView(_ webView: WKWebView,decidePolicyFor action: WKNavigationAction,decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" { decisionHandler(.allow); return }
        let host = url.host ?? ""
        let allowed = url.scheme == "https" && (host == "docs.qq.com" || host == "graph.qq.com" || host == "open.weixin.qq.com" || host == "wx.qq.com" || host == "mp.weixin.qq.com" || host == "ui.ptlogin2.qq.com" || host == "xui.ptlogin2.qq.com" || host == "ssl.ptlogin2.qq.com" || host == "ptlogin2.qq.com")
        if allowed { if action.targetFrame == nil { webView.load(URLRequest(url:url)); decisionHandler(.cancel) } else { decisionHandler(.allow) } }
        else { decisionHandler(.cancel); if action.navigationType == .linkActivated && ["https","http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) } }
    }
    @objc func goBack(){if web.canGoBack { web.goBack() }}
    @objc func goForward(){if web.canGoForward { web.goForward() }}
    @objc func refresh(){web.reload()}
    @objc func goHome(){web.load(URLRequest(url:URL(string:"https://docs.qq.com/desktop/")!))}
    @objc func navigate(){do{web.load(URLRequest(url:try documentURL(address.stringValue,home:true)))}catch{status.stringValue = (error as? BrowserError)?.message ?? "链接不可用"}}
    @objc func captureDocument(){do{let url = try documentURL(web.url?.absoluteString ?? ""); present(text:"",url:url,kind:"document")}catch{status.stringValue = "请先打开具体文档，再引用整篇；网页登录页不作为文档引用。"}}
    @objc func captureSelection(){
        guard !taking else { return }; taking = true
        guard let url = try? documentURL(web.url?.absoluteString ?? "") else { status.stringValue = "请先打开具体文档并选中文字，登录页不会被读取。"; taking = false; return }
        let script = "(()=>{const selected=String(window.getSelection()?.toString()||'').trim();if(selected)return selected;const e=document.activeElement;if(e&&e.tagName==='TEXTAREA'&&e.selectionEnd>e.selectionStart)return e.value.slice(e.selectionStart,e.selectionEnd).trim();return '';})()"
        let targets: [WKFrameInfo?] = [nil]+frames.map{Optional($0)}; var selection = "", remaining = targets.count
        for frame in targets {
            web.evaluateJavaScript(script,in:frame,in:.defaultClient){ result in
                if case .success(let value) = result,let text = value as? String,!text.isEmpty,selection.isEmpty { selection = text }
                remaining -= 1
                if remaining == 0 {
                    self.taking = false
                    guard (try? documentURL(self.web.url?.absoluteString ?? "")) == url else { self.status.stringValue = "文档已经切换，请重新选择。"; return }
                    guard !selection.isEmpty else { self.status.stringValue = "未检测到文字选区。请先选择正文；表格可使用“引用整篇”再在 DSH 选择内容。"; return }
                    guard selection.utf16.count<=11000 else { self.status.stringValue = "所选文字超过11000字，请缩小选区。"; return }
                    self.present(text:selection,url:url,kind:"selection")
                }
            }
        }
    }
    func present(text:String,url:URL,kind:String){
        let alert = NSAlert(); alert.messageText = kind == "selection" ? "将选区加入 DSH" : "引用当前腾讯文档"
        alert.informativeText = kind == "selection" ? "仅接收所选文字和文档来源，先放入 DSH 待引用区，不自动发送给模型。" : "接收文档链接；回到 DSH 后通过已有文档权限读取正文，再选择引用。"
        alert.addButton(withTitle:"接收到 DSH"); alert.addButton(withTitle:"取消")
        let title = limited(web.title?.isEmpty == false ? web.title! : "腾讯文档",160)
        let view = NSView(frame:NSRect(x:0,y:0,width:480,height:260)); let source = NSTextField(wrappingLabelWithString:title+"\n"+url.absoluteString); source.frame = NSRect(x:0,y:210,width:480,height:50); source.font = .systemFont(ofSize:12); view.addSubview(source)
        let preview = NSTextField(wrappingLabelWithString:kind == "selection" ? String(text.prefix(360)) : "当前文档链接，正文将在你确认时读取。"); preview.frame = NSRect(x:0,y:105,width:480,height:100); preview.font = .systemFont(ofSize:12); view.addSubview(preview)
        let label = NSTextField(labelWithString:"附加评论（可选）"); label.frame = NSRect(x:0,y:80,width:480,height:22); view.addSubview(label)
        let comment = NSTextView(frame:NSRect(x:0,y:0,width:480,height:74)); comment.font = .systemFont(ofSize:13); comment.isRichText = false; comment.drawsBackground = true; comment.backgroundColor = .textBackgroundColor
        let scroll = NSScrollView(frame:comment.frame); scroll.documentView = comment; scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder; view.addSubview(scroll); alert.accessoryView = view
        alert.beginSheetModal(for:window){ response in
            guard response == .alertFirstButtonReturn else { return }
            guard comment.string.utf16.count<=4000 else { self.status.stringValue = "评论超过4000字，请缩短后重试。"; return }
            do {
                let count = try FileManager.default.contentsOfDirectory(atPath:self.destination.path).filter { $0.hasSuffix(".json") && $0 != "browser-request.json" }.count
                try require(count < 50,"待处理选区超过50条，请先在 DSH 处理")
                let id = UUID().uuidString.lowercased(), value: [String:Any] = ["id":id,"kind":kind,"url":url.absoluteString,"title":title,"text":text,"comment":comment.string,"receivedAt":ISO8601DateFormatter().string(from:Date())]
                let data = try JSONSerialization.data(withJSONObject:value), temporary = self.destination.appendingPathComponent(id+".tmp"), file = self.destination.appendingPathComponent(id+".json")
                try data.write(to:temporary,options:.atomic); try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:temporary.path); try FileManager.default.moveItem(at:temporary,to:file)
                self.status.stringValue = "已接收到 DSH，尚未发送。回到会话后点击“预览并引用”。"
                #if !DEBUG_PREVIEW
                let apps = [URL(fileURLWithPath:"/Applications/DSH Desktop.app"),homeDirectory().appendingPathComponent("Applications/DSH Desktop.app")]
                if let app = apps.first(where:{FileManager.default.fileExists(atPath:$0.path)}) { NSWorkspace.shared.openApplication(at:app,configuration:NSWorkspace.OpenConfiguration(),completionHandler:nil) }
                #endif
            } catch { self.status.stringValue = "本机接收未完成，请检查 DSH 接收目录权限后重试。" }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
}
@main struct Main {
    static func installMenus(_ app: NSApplication) {
        let bar = NSMenu(), appItem = NSMenuItem(), editItem = NSMenuItem()
        let application = NSMenu(title:"DSH 腾讯文档浏览器")
        application.addItem(withTitle:"退出 DSH 腾讯文档浏览器",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        appItem.submenu = application; bar.addItem(appItem)
        let edit = NSMenu(title:"编辑")
        for (title,action,key) in [("撤销","undo:","z"),("剪切","cut:","x"),("复制","copy:","c"),("粘贴","paste:","v"),("全选","selectAll:","a")] {
            edit.addItem(withTitle:title,action:NSSelectorFromString(action),keyEquivalent:key)
        }
        editItem.submenu = edit; bar.addItem(editItem); app.mainMenu = bar
    }
    static func main(){
        if CommandLine.arguments.contains("--self-test") {
            do {
                let clean = try documentURL("https://docs.qq.com/sheet/synthetic?tab=test&access_token=synthetic#private")
                try require(clean.absoluteString == "https://docs.qq.com/sheet/synthetic?tab=test", "URL 清理失败")
                for bad in ["https://example.com/doc/synthetic", "http://docs.qq.com/doc/synthetic", "https://user:pass@docs.qq.com/doc/synthetic", "https://docs.qq.com:123/doc/synthetic", "https://docs.qq.com/openapi/oauth/authorize"] {
                    do { _ = try documentURL(bad); exit(1) } catch {}
                }
                try require(limited("a😀b", 3) == "a😀", "选区长度校验失败")
                print("{\"ok\":true,\"version\":\"0.1.1\",\"cookieReads\":0,\"networkCalls\":0}"); return
            } catch { exit(1) }
        }
        let app = NSApplication.shared, delegate = BrowserDelegate(); app.delegate = delegate; app.setActivationPolicy(.regular); installMenus(app); app.run(); withExtendedLifetime(delegate){}
    }
}
