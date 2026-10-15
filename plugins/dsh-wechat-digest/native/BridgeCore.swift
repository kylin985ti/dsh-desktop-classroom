import Foundation
import Security
import LocalAuthentication
import CryptoKit

let bridgeService = "io.github.kylin985ti.dsh-classroom.wechat.v1"
struct BridgeError: Error { let message: String }
func require(_ condition: Bool, _ message: String) throws { if !condition { throw BridgeError(message: message) } }
func digest(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
func object(_ data: Data) throws -> [String: Any] {
    guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw BridgeError(message: "本地连接数据无效") }; return value
}
func userHome() -> URL { URL(fileURLWithPath: String(cString: getpwuid(getuid())!.pointee.pw_dir)) }
func accountBase() -> URL { userHome().appendingPathComponent("Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files").resolvingSymlinksInPath() }
func checkedAccount(_ path: String) throws -> URL {
    let raw = URL(fileURLWithPath: path).standardizedFileURL, root = raw.resolvingSymlinksInPath()
    try require(raw == root && root.lastPathComponent == "db_storage" && root.deletingLastPathComponent().deletingLastPathComponent() == accountBase(), "请选择当前用户微信容器内的账号目录")
    let attributes = try FileManager.default.attributesOfItem(atPath: root.path)
    try require(attributes[.type] as? FileAttributeType == .typeDirectory && attributes[.ownerAccountID] as? UInt32 == getuid(), "微信账号目录身份不匹配")
    return root
}
func stateDirectory() -> URL {
    let arguments = CommandLine.arguments
    if let i = arguments.firstIndex(of: "--dsh-home"), i + 1 < arguments.count { return URL(fileURLWithPath: arguments[i+1]).appendingPathComponent("storages/wechat_digest/database") }
    let home = ProcessInfo.processInfo.environment["DSH_HOME"].map { URL(fileURLWithPath: $0) } ?? userHome().appendingPathComponent("Library/Application Support/dsh-desktop/harness")
    return home.appendingPathComponent("storages/wechat_digest/database")
}
func privateDirectory(_ path: URL) throws {
    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let attrs = try FileManager.default.attributesOfItem(atPath: path.path)
    try require(path.standardizedFileURL == path.resolvingSymlinksInPath() && attrs[.type] as? FileAttributeType == .typeDirectory && attrs[.ownerAccountID] as? UInt32 == getuid(), "连接目录身份无效")
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path.path)
}
func connection() throws -> [String: Any]? {
    let path = stateDirectory().appendingPathComponent("connection.json")
    if !FileManager.default.fileExists(atPath: path.path) { return nil }
    let attrs = try FileManager.default.attributesOfItem(atPath: path.path)
    try require(attrs[.type] as? FileAttributeType == .typeRegular && attrs[.ownerAccountID] as? UInt32 == getuid() && (attrs[.size] as? Int ?? 65537) < 65536 && ((attrs[.posixPermissions] as? Int ?? 511) & 0o077) == 0, "本地连接文件权限无效")
    return try object(Data(contentsOf: path))
}
func writeConnection(_ value: [String: Any]) throws {
    let root = stateDirectory(); try privateDirectory(root)
    let path = root.appendingPathComponent("connection.json")
    try json(value).write(to: path, options: [.atomic]); try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
}
func keyQuery(_ grant: String) throws -> [String: Any] {
    try require(UUID(uuidString: grant) != nil, "本地授权编号无效")
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: bridgeService, kSecAttrAccount as String: grant]
}
func secret(_ current: [String: Any]) throws -> [String: Any] {
    var query = try keyQuery(current["grant"] as? String ?? "")
    query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
    let context = LAContext(); context.interactionNotAllowed = true; query[kSecUseAuthenticationContext as String] = context
    var result: CFTypeRef?
    try require(SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, "本机钥匙串不可用，请在连接器中重新授权")
    guard let data = result as? Data else { throw BridgeError(message: "本机授权数据无效") }
    let value = try object(data)
    try require(value["accountHash"] as? String == current["accountHash"] as? String && value["revision"] as? String == current["revision"] as? String, "账号或授权范围已变化，请刷新连接")
    _ = try checkedAccount(value["accountRoot"] as? String ?? "")
    return value
}
func saveSecret(_ value: [String: Any], grant: String) throws {
    var query = try keyQuery(grant); let data = try json(value)
    let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if update == errSecItemNotFound {
        query[kSecValueData as String] = data; query[kSecAttrLabel as String] = "DSH 课堂版：本人授权的微信群数据库"
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        try require(SecItemAdd(query as CFDictionary, nil) == errSecSuccess, "本机钥匙串保存未完成")
    } else { try require(update == errSecSuccess, "本机钥匙串更新未完成") }
}
func resources() -> URL { URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources") }
func python() throws -> URL {
    let candidates = [ProcessInfo.processInfo.environment["DSH_DESKTOP_RESOURCES"].map { URL(fileURLWithPath: $0) },
        URL(fileURLWithPath: "/Applications/DSH Desktop.app/Contents/Resources"), userHome().appendingPathComponent("Applications/DSH Desktop.app/Contents/Resources")].compactMap { $0 }
    for candidate in candidates {
        let path = candidate.appendingPathComponent("office-runtime/primary-runtime/dependencies/python/bin/python3")
        if FileManager.default.isExecutableFile(atPath: path.path) { return path }
    }
    throw BridgeError(message: "未找到 DSH Desktop 自带 Python，请先完成教学包安装")
}
func reader(_ mode: String, _ value: [String: Any], _ args: [String: Any] = [:]) throws -> [String: Any] {
    let task = Process(), input = Pipe(), output = Pipe()
    task.executableURL = try python(); task.arguments = ["-I", "-B", resources().appendingPathComponent("read_wechat_db.py").path]
    task.standardInput = input; task.standardOutput = output; task.standardError = FileHandle.nullDevice
    var environment = ProcessInfo.processInfo.environment; environment.removeValue(forKey: "PYTHONPATH"); environment.removeValue(forKey: "PYTHONHOME"); task.environment = environment
    try task.run()
    let timeout = DispatchWorkItem { if task.isRunning { task.terminate() } }
    DispatchQueue.global().asyncAfter(deadline: .now() + 45, execute: timeout)
    defer { timeout.cancel(); if task.isRunning { task.terminate() } }
    try input.fileHandleForWriting.write(contentsOf: json(["action": mode, "secret": value, "groupId": args["groupId"] ?? NSNull(), "since": args["since"] ?? NSNull()]))
    try input.fileHandleForWriting.close()
    var bytes = Data()
    while let chunk = try output.fileHandleForReading.read(upToCount: 65536), !chunk.isEmpty {
        bytes.append(chunk); try require(bytes.count <= 8 * 1024 * 1024, "数据库读取结果超过限制")
    }
    task.waitUntilExit(); let result = try object(bytes)
    try require(task.terminationStatus == 0 && result["ok"] as? Bool == true, result["error"] as? String ?? "本地数据库读取未完成")
    return result
}
func currentConnection() throws -> [String: Any] {
    guard let current = try connection() else { throw BridgeError(message: "请先打开连接器并完成本人授权") }; return current
}
func expected(_ current: [String: Any], _ args: [String: Any]) throws {
    try require(args["revision"] as? String == current["revision"] as? String, "授权范围已变化，请刷新后重试")
}
func worker(_ mode: String, _ args: [String: Any]) throws -> [String: Any] {
    if mode == "status" { return ["ok": true, "connected": try connection() != nil, "connection": try connection() ?? [:]] }
    if mode == "store" {
        var value = args
        let root = try checkedAccount(value["accountRoot"] as? String ?? "")
        value["accountHash"] = digest(root.path); value["approvedGroups"] = []; value["revision"] = UUID().uuidString
        let validated = try reader("validate", value)
        let grant = UUID().uuidString
        try saveSecret(value, grant: grant)
        let old = try connection()
        let current: [String: Any] = ["grant": grant, "accountHash": digest(root.path), "accountRoot": root.path, "accountLabel": root.deletingLastPathComponent().lastPathComponent, "revision": value["revision"]!, "approvedGroups": [], "authorizedAt": ISO8601DateFormatter().string(from: Date())]
        do { try writeConnection(current) } catch { SecItemDelete(try keyQuery(grant) as CFDictionary); throw error }
        if let previous = old?["grant"] as? String { SecItemDelete(try keyQuery(previous) as CFDictionary) }
        return ["ok": true, "validatedDatabases": validated["validatedDatabases"] ?? 0, "chatRowsRead": 0]
    }
    var current = try currentConnection(); try expected(current, args)
    if mode == "disconnect" {
        let status = SecItemDelete(try keyQuery(current["grant"] as? String ?? "") as CFDictionary)
        try require(status == errSecSuccess || status == errSecItemNotFound, "钥匙串当前锁定，请解锁后再断开")
        try FileManager.default.removeItem(at: stateDirectory().appendingPathComponent("connection.json"))
        return ["ok": true]
    }
    var value = try secret(current)
    if mode == "groups" { return try reader("groups", value) }
    if mode == "select" {
        guard let ids = args["groupIds"] as? [String] else { throw BridgeError(message: "请选择群聊") }
        try require(!ids.isEmpty && ids.count <= 10 && Set(ids).count == ids.count, "请勾选1至10个群")
        let list = try reader("groups", value)["groups"] as? [[String: Any]] ?? []
        let selected = list.filter { ids.contains($0["id"] as? String ?? "") }
        try require(selected.count == ids.count, "群身份已变化，请重新加载群列表")
        value["approvedGroups"] = selected; value["revision"] = UUID().uuidString
        try saveSecret(value, grant: current["grant"] as? String ?? "")
        current["approvedGroups"] = selected; current["revision"] = value["revision"]
        try writeConnection(current); return ["ok": true, "connection": current]
    }
    try require(mode == "read", "不支持的本地操作")
    let result = try reader("read", value, args)
    let latest = try currentConnection(); try expected(latest, args)
    return result
}
