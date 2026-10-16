import Foundation

/// In-memory only. Key MUST include original SHA, analysis-pixel digest, model
/// digest, preprocessing version, oriented dimensions, source/analysis transform,
/// and requested analysis kinds. Slider values unrelated to those pixels do not
/// belong in the key. No disk/cloud persistence or inference readiness is implied.
///
/// Byte limits cover retained successful values as reported by the loader, not
/// native inference working memory. The first caller's operation owns a flight;
/// callers using the same key must request exactly the same immutable analysis.
public actor LocalAnalysisCache<Key: Hashable & Sendable, Value: Sendable> {
    public enum CacheError: Error, Equatable, Sendable {
        case invalidLimits
        case inFlightLimit
        case waiterLimit
        case invalidByteCost
        case invalidated
    }

    public struct Loaded: Sendable {
        public let value: Value
        /// Include all retained buffers and feature arrays, not just image bytes.
        public let byteCost: Int
        public init(value: Value, byteCost: Int) { self.value = value; self.byteCost = byteCost }
    }

    public struct Statistics: Sendable {
        public let cachedEntries: Int
        public let cachedBytes: Int
        public let inFlight: Int
        /// Includes cancelled loaders until their cooperative work actually exits.
        public let activeOperations: Int
        public let generation: UUID
    }

    private struct Entry {
        let loaded: Loaded
        var access: UInt64
    }

    // onCancel cannot await the actor. Record cancellation synchronously so a
    // result racing the actor notification cannot populate cache for cancelled
    // waiters. The lock protects the only mutable property of this Sendable box.
    private final class CancellationFlag: @unchecked Sendable {
        private let lock = NSLock()
        private var cancelled = false
        func cancel() { lock.lock(); cancelled = true; lock.unlock() }
        var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    }

    private struct Waiter {
        let continuation: CheckedContinuation<Value, any Error>
        let flag: CancellationFlag
    }

    private struct Flight {
        let id: UUID
        let generation: UUID
        let task: Task<Void, Never>
        var waiters: [UUID: Waiter]
    }

    private let maximumEntries: Int
    private let maximumBytes: Int
    private let maximumInFlight: Int
    private let maximumWaitersPerFlight: Int
    private var entries: [Key: Entry] = [:]
    private var flights: [Key: Flight] = [:]
    private var activeOperations: Set<UUID> = []
    private var bytes = 0
    private var clock: UInt64 = 0
    private var generation = UUID()

    public init(maximumEntries: Int, maximumBytes: Int, maximumInFlight: Int,
                maximumWaitersPerFlight: Int = 128) throws {
        guard maximumEntries > 0, maximumBytes > 0, maximumInFlight > 0,
              maximumWaitersPerFlight > 0 else { throw CacheError.invalidLimits }
        self.maximumEntries = maximumEntries; self.maximumBytes = maximumBytes
        self.maximumInFlight = maximumInFlight
        self.maximumWaitersPerFlight = maximumWaitersPerFlight
    }

    public func statistics() -> Statistics {
        Statistics(cachedEntries: entries.count, cachedBytes: bytes,
                   inFlight: flights.count, activeOperations: activeOperations.count, generation: generation)
    }

    public func value(for key: Key,
                      operation: @escaping @Sendable () async throws -> Loaded) async throws -> Value {
        try Task.checkCancellation()
        if var entry = entries[key] {
            entry.access = nextAccess(); entries[key] = entry
            return entry.loaded.value
        }
        let waiterID = UUID()
        let flag = CancellationFlag()
        let value = try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                register(key: key, waiterID: waiterID, flag: flag,
                         continuation: continuation, operation: operation)
            }
        } onCancel: {
            flag.cancel()
            Task { await self.cancel(key: key, waiterID: waiterID) }
        }
        try Task.checkCancellation()
        return value
    }

    /// Invalidating cancels this flight and releases all waiters with an explicit
    /// error. A loader ignoring cancellation may finish, but its UUID is obsolete.
    public func invalidate(_ key: Key) {
        if let old = entries.removeValue(forKey: key) { bytes -= old.loaded.byteCost }
        guard let flight = flights.removeValue(forKey: key) else { return }
        flight.task.cancel()
        for waiter in flight.waiters.values {
            waiter.continuation.resume(throwing: CacheError.invalidated)
        }
    }

    @discardableResult
    public func beginNewGeneration() -> UUID {
        generation = UUID()
        entries.removeAll(); bytes = 0
        let old = flights; flights.removeAll()
        for flight in old.values {
            flight.task.cancel()
            for waiter in flight.waiters.values {
                waiter.continuation.resume(throwing: CacheError.invalidated)
            }
        }
        return generation
    }

    private func register(key: Key, waiterID: UUID, flag: CancellationFlag,
                          continuation: CheckedContinuation<Value, any Error>,
                          operation: @escaping @Sendable () async throws -> Loaded) {
        guard !flag.isCancelled else {
            continuation.resume(throwing: CancellationError()); return
        }
        if var entry = entries[key] {
            entry.access = nextAccess(); entries[key] = entry
            continuation.resume(returning: entry.loaded.value); return
        }
        let waiter = Waiter(continuation: continuation, flag: flag)
        if var flight = flights[key] {
            guard flight.waiters.count < maximumWaitersPerFlight else {
                continuation.resume(throwing: CacheError.waiterLimit); return
            }
            flight.waiters[waiterID] = waiter; flights[key] = flight
            return
        }
        guard activeOperations.count < maximumInFlight else {
            continuation.resume(throwing: CacheError.inFlightLimit); return
        }
        let id = UUID(), epoch = generation
        activeOperations.insert(id)
        // Detached from any one waiter's cancellation, never from this cache's
        // explicit flight ownership. No actor is blocked by inference work.
        let task = Task.detached { [weak self] in
            let result: Result<Loaded, any Error>
            do {
                try Task.checkCancellation()
                let loaded = try await operation()
                try Task.checkCancellation()
                result = .success(loaded)
            } catch { result = .failure(error) }
            await self?.finish(key: key, id: id, epoch: epoch, result: result)
        }
        flights[key] = Flight(id: id, generation: epoch, task: task, waiters: [waiterID: waiter])
    }

    private func cancel(key: Key, waiterID: UUID) {
        guard var flight = flights[key], let waiter = flight.waiters.removeValue(forKey: waiterID) else { return }
        waiter.continuation.resume(throwing: CancellationError())
        if flight.waiters.isEmpty {
            flights.removeValue(forKey: key); flight.task.cancel()
        } else { flights[key] = flight }
    }

    private func finish(key: Key, id: UUID, epoch: UUID, result: Result<Loaded, any Error>) {
        activeOperations.remove(id)
        guard epoch == generation, let flight = flights[key],
              flight.id == id, flight.generation == epoch else { return }
        flights.removeValue(forKey: key)
        var live: [Waiter] = []
        for waiter in flight.waiters.values {
            if waiter.flag.isCancelled { waiter.continuation.resume(throwing: CancellationError()) }
            else { live.append(waiter) }
        }
        guard !live.isEmpty else { return }
        switch result {
        case let .failure(error):
            for waiter in live { waiter.continuation.resume(throwing: error) }
        case let .success(loaded):
            guard loaded.byteCost > 0 else {
                for waiter in live { waiter.continuation.resume(throwing: CacheError.invalidByteCost) }
                return
            }
            // Oversized results may be delivered once, but never retained.
            if loaded.byteCost <= maximumBytes {
                while entries.count >= maximumEntries || bytes > maximumBytes - loaded.byteCost {
                    guard let oldest = entries.min(by: { $0.value.access < $1.value.access })?.key,
                          let removed = entries.removeValue(forKey: oldest) else { break }
                    bytes -= removed.loaded.byteCost
                }
                entries[key] = Entry(loaded: loaded, access: nextAccess())
                bytes += loaded.byteCost
            }
            for waiter in live { waiter.continuation.resume(returning: loaded.value) }
        }
    }

    private func nextAccess() -> UInt64 {
        if clock == UInt64.max {
            let ordered = entries.sorted { $0.value.access < $1.value.access }
            clock = 0
            for (key, var entry) in ordered {
                clock += 1; entry.access = clock; entries[key] = entry
            }
        }
        clock += 1
        return clock
    }
}
