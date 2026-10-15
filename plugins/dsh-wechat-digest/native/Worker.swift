import Foundation

@main struct Worker {
    static func main() {
        do {
            let mode = CommandLine.arguments.dropFirst().first ?? "status"
            if mode == "--self-test" { print("{\"ok\":true,\"version\":\"0.2.0\",\"databaseReads\":0,\"keychainReads\":0}"); return }
            let bytes = mode == "status" ? Data() : FileHandle.standardInput.readDataToEndOfFile()
            try require(bytes.count <= 32768, "本地请求超过限制")
            let args = bytes.isEmpty ? [:] : try object(bytes)
            let result = try worker(mode, args)
            FileHandle.standardOutput.write(try json(result))
        } catch {
            let message = (error as? BridgeError)?.message ?? "本地连接未完成，请检查权限或重新授权"
            if let bytes = try? json(["ok": false, "error": message]) { FileHandle.standardOutput.write(bytes) }; exit(1)
        }
    }
}
