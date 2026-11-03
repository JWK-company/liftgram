// 잠금 카드 저장소(SPEC-017 §6 네이티브 원자성 · Phase 5) — App Group 파일 하나를 NSFileCoordinator 쓰기 블록 안에서
// 「읽고-고치고-쓰기」한다(앱 프로세스와 위젯 확장 프로세스 사이에서도 직렬). 같은 프로세스 안은 직렬 큐로 한 번 더 묶는다.
import Foundation

public final class LockStore {
    public let url: URL
    private let queue = DispatchQueue(label: "org.tarae.liftgram.lock-store")

    public init(url: URL) {
        self.url = url
    }

    /// App Group 컨테이너의 저장소 — 그룹이 없으면(서명 전 · 시뮬레이터 설정 누락) 앱 지원 폴더로.
    public static func shared(appGroup: String = "group.org.tarae.liftgram") -> LockStore {
        let fm = FileManager.default
        let base = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
            ?? fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? fm.createDirectory(at: base, withIntermediateDirectories: true)
        return LockStore(url: base.appendingPathComponent("liftgram-lock.json"))
    }

    /// 읽고-고치고-쓰기 한 번. 바뀌었으면 원자적으로 쓴다.
    @discardableResult
    public func write<T>(_ op: (inout LockState) throws -> T) throws -> T {
        try writeState(op).0
    }

    /// write 와 같고, 쓴 뒤의 상태(세대 포함)도 돌려준다 — 그림은 이 상태로 만든다(세대가 정확히 맞게).
    public func writeState<T>(_ op: (inout LockState) throws -> T) throws -> (T, LockState) {
        try queue.sync {
            var result: Result<(T, LockState), Error>?
            var coordErr: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: [], error: &coordErr) { u in
                do {
                    // [원본] var s = LockState.fromJSON(try? Data(contentsOf: u)) — 읽기 실패를 빈 파일로 보고 덮어썼다(REV-008 계약 M-4)
                    var s = try Self.load(u)
                    let before = s.toJSON()
                    let out = try op(&s) // 던지면 아무것도 쓰지 않는다(사본 s 는 버려짐)
                    if s.toJSON() != before {
                        s.gen += 1
                        try s.toJSON().write(to: u, options: [.atomic])
                    }
                    result = .success((out, s))
                } catch {
                    result = .failure(error)
                }
            }
            if let coordErr { throw coordErr }
            return try result!.get()
        }
    }

    /// 파일 없음만 새 상태 · 그 밖의 읽기 실패는 던진다(쓰기 취소) · 깨진 JSON 은 `.corrupt` 로 옮겨 둔 뒤 새 상태(대기열을 몰래 덮지 않게).
    static func load(_ u: URL) throws -> LockState {
        let data: Data
        do {
            data = try Data(contentsOf: u)
        } catch let e as CocoaError where e.code == .fileReadNoSuchFile {
            return LockState()
        }
        if data.isEmpty { return LockState() }
        guard (try? JSONSerialization.jsonObject(with: data)) is LockJSON else {
            let bad = u.appendingPathExtension("corrupt")
            try? FileManager.default.removeItem(at: bad)
            try FileManager.default.moveItem(at: u, to: bad)
            return LockState()
        }
        return LockState.fromJSON(data)
    }

    // [원본] public func read<T>(_ op: (LockState) throws -> T) throws -> T { try write { s in try op(s) } }
    // [개선] 읽기는 읽기 조정으로 — 쓰기 잠금·직렬화 비용 없이(REV-007 계약 L-7 · 안드로이드와 같음)
    public func read<T>(_ op: (LockState) throws -> T) throws -> T {
        try queue.sync {
            var result: Result<T, Error>?
            var coordErr: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordErr) { u in
                result = Result { try op(try Self.load(u)) }
            }
            if let coordErr { throw coordErr }
            return try result!.get()
        }
    }
}
