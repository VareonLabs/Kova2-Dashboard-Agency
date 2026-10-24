import Foundation
import Security

// Credentials arrive over stdin, never in command arguments or logs.
guard CommandLine.arguments.count == 2 || CommandLine.arguments.count == 3 else { exit(2) }
let reading = CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--read"
let account = CommandLine.arguments.last!
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.vareonhq.local-dashboard",
    kSecAttrAccount as String: account
]
if reading {
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecItemNotFound { exit(3) }
    guard status == errSecSuccess, let value = result as? Data else { exit(1) }
    FileHandle.standardOutput.write(value)
    exit(0)
}
let data = FileHandle.standardInput.readDataToEndOfFile()
guard !data.isEmpty && data.count < 8_000_000 else { exit(2) }
var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
if status == errSecItemNotFound {
    var trusted: [SecTrustedApplication] = []
    var current: SecTrustedApplication?
    if SecTrustedApplicationCreateFromPath(nil, &current) == errSecSuccess, let app = current { trusted.append(app) }
    var reader: SecTrustedApplication?
    if SecTrustedApplicationCreateFromPath("/usr/bin/security", &reader) == errSecSuccess, let app = reader { trusted.append(app) }
    var access: SecAccess?
    let accessStatus = SecAccessCreate("VareonHQ local credentials" as CFString, trusted as CFArray, &access)
    guard accessStatus == errSecSuccess, let acl = access else {
        FileHandle.standardError.write(Data("Keychain access policy could not be created.\n".utf8)); exit(1)
    }
    var item = query
    item[kSecValueData as String] = data
    item[kSecAttrAccess as String] = acl
    status = SecItemAdd(item as CFDictionary, nil)
}
guard status == errSecSuccess else {
    let message = SecCopyErrorMessageString(status, nil) as String? ?? "Keychain write failed"
    FileHandle.standardError.write(Data("\(message) (\(status))\n".utf8))
    exit(1)
}
