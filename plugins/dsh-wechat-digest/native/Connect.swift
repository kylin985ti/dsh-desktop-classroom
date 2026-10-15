import AppKit
import Foundation
import Darwin

final class ConnectionDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let accounts = NSPopUpButton(frame: .zero, pullsDown: false)
    let status = NSTextField(wrappingLabelWithString: "默认关闭。这里只保存本人账号的授权；完成后回到 DSH 勾选群聊并开启同步。")
    var roots: [URL] = []
    var capture: NSButton!
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 470), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "DSH 课堂版 · 微信群连接"; window.center(); window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: "连接自己的微信群")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        let help = NSTextField(wrappingLabelWithString: "实验功能，已参考 macOS 微信 4.1.13 的 WCDB 布局。请选择你自己的账号目录；点击后由 macOS 申请管理员授权。不会修改微信程序、退出登录或发送消息。")
        let privacy = NSTextField(wrappingLabelWithString: "授权步骤只匹配联系人和消息数据库的密钥并验证数据库结构，不读取聊天正文。密钥仅存本机钥匙串；群名列表和所选群消息之后在 DSH 本机处理，只有点击“整理”才发送给你配置的模型。系统拒绝访问或版本不兼容时停止，可继续使用手动导入。")
        help.textColor = .secondaryLabelColor; privacy.textColor = .secondaryLabelColor
        capture = NSButton(title: "授权所选账号并存入本机钥匙串", target: self, action: #selector(connect))
        let reload = NSButton(title: "刷新账号目录", target: self, action: #selector(refresh))
        let stack = NSStackView(views: [title, help, accounts, reload, capture, privacy, status])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18; stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 26), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -26), stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 26)])
        refresh(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc func refresh() {
        roots = ((try? FileManager.default.contentsOfDirectory(at: accountBase(), includingPropertiesForKeys: nil)) ?? []).compactMap { try? checkedAccount($0.appendingPathComponent("db_storage").path) }.sorted { $0.path < $1.path }
        accounts.removeAllItems(); accounts.addItems(withTitles: roots.map { $0.deletingLastPathComponent().lastPathComponent })
        capture.isEnabled = !roots.isEmpty
        if roots.isEmpty { status.stringValue = "未找到当前用户的微信账号目录，请先登录电脑版微信后刷新。" }
    }
    func setStatus(_ text: String) { DispatchQueue.main.async { self.status.stringValue = text } }
    @objc func connect() {
        guard accounts.indexOfSelectedItem >= 0, accounts.indexOfSelectedItem < roots.count,
              let process = NSRunningApplication.runningApplications(withBundleIdentifier: "com.tencent.xinWeChat").first else { status.stringValue = "请先打开并登录自己的微信。"; return }
        let root = roots[accounts.indexOfSelectedItem]
        capture.isEnabled = false; accounts.isEnabled = false
        status.stringValue = "请在 macOS 系统窗口完成管理员授权。之后限时只读匹配，最长90秒；不需要退出微信。"
        DispatchQueue.global(qos: .userInitiated).async {
            defer { DispatchQueue.main.async { self.capture.isEnabled = true; self.accounts.isEnabled = true } }
            do {
                let temporary = FileManager.default.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("dsh-wechat-auth-" + UUID().uuidString)
                try privateDirectory(temporary)
                defer { try? FileManager.default.removeItem(at: temporary) }
                var names = ["contact/contact.db"]
                let message = root.appendingPathComponent("message")
                names += try FileManager.default.contentsOfDirectory(atPath: message.path).filter { $0.range(of: "^message_([0-9]|[12][0-9]|3[01])\\.db$", options: .regularExpression) != nil }.sorted().map { "message/" + $0 }
                try require(names.count > 1 && names.count <= 32, "联系人或消息分片目录尚未适配")
                var targets = ""
                for name in names {
                    let path = root.appendingPathComponent(name)
                    try require(path.resolvingSymlinksInPath() == path, "数据库目录包含不支持的链接")
                    let fd = open(path.path, O_RDONLY | O_NOFOLLOW)
                    try require(fd >= 0, "无法读取数据库页头，请检查本机文件权限")
                    var header = [UInt8](repeating: 0, count: 16); var info = stat()
                    let valid = fstat(fd, &info) == 0 && info.st_uid == getuid() && (info.st_mode & S_IFMT) == S_IFREG && Darwin.read(fd, &header, 16) == 16
                    close(fd); try require(valid, "数据库页头不可用")
                    targets += name + "\t" + header.map { String(format: "%02x", $0) }.joined() + "\n"
                }
                let targetFile = temporary.appendingPathComponent("targets.tsv")
                try Data(targets.utf8).write(to: targetFile); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: targetFile.path)
                let fifo = temporary.appendingPathComponent("keys.pipe")
                try require(mkfifo(fifo.path, 0o600) == 0, "无法创建本机私有授权通道")
                let descriptor = open(fifo.path, O_RDWR | O_NONBLOCK | O_NOFOLLOW)
                try require(descriptor >= 0, "无法打开本机私有授权通道"); defer { close(descriptor) }
                let scanner = resources().appendingPathComponent("wechat-config-scan")
                func quote(_ text: String) -> String { "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'" }
                let command = quote(scanner.path) + " " + String(process.processIdentifier) + " " + quote(temporary.path)
                let literal = command.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
                var error: NSDictionary?
                let receipt = NSAppleScript(source: "do shell script \"" + literal + "\" with administrator privileges")?.executeAndReturnError(&error)
                try require(error == nil, "系统授权已取消或拒绝。未读取聊天；可以继续使用手动导入。")
                let response = try object(Data((receipt?.stringValue ?? "").utf8))
                try require(response["ok"] as? Bool == true, "系统拒绝读取微信缓存。不会修改或重新签名微信；请使用手动导入。")
                try require(response["matchedKeys"] as? Int == names.count, "当前版本或账号未匹配全部数据库密钥，未保存不完整授权。请使用手动导入。")
                let count = response["keyBytes"] as? Int ?? 0
                try require(count > 0 && count <= 16384, "授权通道结果无效")
                var bytes = [UInt8](repeating: 0, count: count); defer { _ = bytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
                var offset = 0
                while offset < count {
                    let n = bytes.withUnsafeMutableBytes { Darwin.read(descriptor, $0.baseAddress!.advanced(by: offset), count-offset) }
                    try require(n > 0, "私有授权通道未完成"); offset += n
                }
                let keys = try object(Data(bytes))
                // Store from the same signed CLI that later reads the Keychain item.
                let task = Process(), input = Pipe(), output = Pipe()
                task.executableURL = resources().deletingLastPathComponent().appendingPathComponent("MacOS/wechat-db-worker")
                task.arguments = ["store", "--dsh-home", stateDirectory().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path]
                task.standardInput = input; task.standardOutput = output; task.standardError = FileHandle.nullDevice
                try task.run(); try input.fileHandleForWriting.write(contentsOf: json(["accountRoot": root.path, "keys": keys])); try input.fileHandleForWriting.close()
                let saved = try object(output.fileHandleForReading.readDataToEndOfFile()); task.waitUntilExit()
                try require(task.terminationStatus == 0 && saved["ok"] as? Bool == true, saved["error"] as? String ?? "本机钥匙串保存未完成")
                self.setStatus("已验证 \(saved["validatedDatabases"] ?? 0) 个数据库并保存本机钥匙串。没有读取聊天。回到 DSH 点击“刷新连接”，选择群聊后开启同步。")
            } catch { self.setStatus((error as? BridgeError)?.message ?? "本机授权未完成；未读取聊天。请检查微信版本和本机文件访问权限。") }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
@main struct Connect {
    static func main() {
        let delegate = ConnectionDelegate(); NSApplication.shared.delegate = delegate
        NSApplication.shared.setActivationPolicy(.regular); NSApplication.shared.run()
        withExtendedLifetime(delegate) {}
    }
}
