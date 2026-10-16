import Foundation

/// Process-local bounded pool. Store actor identity deliberately prevents sharing
/// across independently created stores, even if their filesystem roots look alike.
/// Whole manifests (including rights metadata) and every inference option must match.
/// Capacity counts native contexts, not model bytes; hosts still gate working RAM.
actor LocalFaceInferencePool {
    static let shared = LocalFaceInferencePool()
    enum PoolError: Error { case capacityReached }
    private struct Entry {
        let id: UUID
        let store: LocalAIModelStore
        let configuration: LocalFaceInference.Configuration
        let worker: LocalFaceInference
        var active: Bool
        var discardOnReturn: Bool
    }
    private var entries: [Entry] = []
    /// One active request per worker, two contexts maximum. No unbounded waiter
    /// array retaining photos: callers retry explicitly after capacity pressure.
    private let maximumContexts = 2

    func analyze(store: LocalAIModelStore, configuration: LocalFaceInference.Configuration,
                 bgr: Data, width: Int, height: Int, stride: Int,
                 pixelPreparationVersion: String) async throws -> [LocalFaceInference.DetectedFace] {
        try Task.checkCancellation()
        let index: Int
        if let match = entries.firstIndex(where: { $0.store === store && $0.configuration == configuration }) {
            guard !entries[match].active, !entries[match].discardOnReturn else { throw PoolError.capacityReached }
            index = match
        } else {
            if entries.count >= maximumContexts {
                guard let idle = entries.firstIndex(where: { !$0.active }) else { throw PoolError.capacityReached }
                entries.remove(at: idle)
            }
            let worker = try LocalFaceInference(poolWorkerStore: store, configuration: configuration)
            entries.append(Entry(id: UUID(), store: store, configuration: configuration,
                                 worker: worker, active: false, discardOnReturn: false))
            index = entries.count - 1
        }
        entries[index].active = true
        let id = entries[index].id, worker = entries[index].worker
        do {
            let result = try await worker.analyze(bgr: bgr, width: width, height: height,
                stride: stride, pixelPreparationVersion: pixelPreparationVersion)
            try Task.checkCancellation()
            finish(id: id, failed: false)
            return result
        } catch {
            // Failed loads and cancelled requests never leave a cached native
            // context. The await has completed before the last worker is released.
            finish(id: id, failed: true)
            throw error
        }
    }

    /// Explicit release / memory-pressure entry. In-flight native work cannot be
    /// interrupted; keep its owner alive until it returns, then release it safely.
    /// A purged active key refuses new callers instead of creating a second context.
    func purge() {
        entries.removeAll(where: { !$0.active })
        for index in entries.indices { entries[index].discardOnReturn = true }
    }

    func release(store: LocalAIModelStore) {
        entries.removeAll(where: { $0.store === store && !$0.active })
        for index in entries.indices where entries[index].store === store {
            entries[index].discardOnReturn = true
        }
    }

    private func finish(id: UUID, failed: Bool) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        if failed || entries[index].discardOnReturn { entries.remove(at: index) }
        else { entries[index].active = false }
    }
}
