import Foundation
import SuiteCore

/// Foreground/manual development integration. NOT background sync or complete cross-device restoration.
actor CloudTransferCoordinator {
    private struct Link: Codable {var remote: RemoteAsset; var recipeRevision: Int}
    private let client: SuiteBackendClient
    private let root: URL
    init(client: SuiteBackendClient, root: URL) {self.client = client; self.root = root}
    private func linkURL(_ assetID: UUID) -> URL {root.appendingPathComponent("CloudLinks/\(assetID.uuidString).json")}
    private func load(_ assetID: UUID) throws -> Link? {
        let url = linkURL(assetID)
        guard FileManager.default.fileExists(atPath: url.path) else {return nil}
        return try JSONDecoder().decode(Link.self, from: Data(contentsOf: url))
    }
    private func persist(_ link: Link, assetID: UUID) throws {
        let url = linkURL(assetID)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(link).write(to: url, options: [.atomic, .completeFileProtection])
    }
    func uploadSelected(_ checkpoint: ProjectCheckpoint) async throws {
        try checkpoint.validate()
        let original = root.appendingPathComponent(checkpoint.asset.originalRelativePath)
        let attributes = try FileManager.default.attributesOfItem(atPath: original.path)
        guard let size = (attributes[.size] as? NSNumber)?.intValue else {throw BackendFailure.invalidResponse}
        var link: Link
        if let existing = try load(checkpoint.asset.id) {link = existing}
        else {
            link = Link(remote: try await client.createAsset(checkpoint.asset, size: size), recipeRevision: 0)
            try persist(link, assetID: checkpoint.asset.id)
        }
        let document = try RecipeDocument(parameters: checkpoint.history.current)
        // Reconcile lost response only for an identical immutable body. Do not overwrite a different remote edit.
        let latest = try await client.latestRecipe(remoteID: link.remote.id)
        if latest?.body == document {link.recipeRevision = latest!.revision}
        else {
            guard (latest?.revision ?? 0) == link.recipeRevision else {throw BackendFailure.conflict}
            let saved = try await client.saveRecipe(remoteID: link.remote.id, expectedRevision: link.recipeRevision, document: document)
            link.recipeRevision = saved.revision
        }
        try persist(link, assetID: checkpoint.asset.id)
        // P0 recipe precedes P2 original. Proxy transfer (P1) remains unimplemented, not claimed synced.
        link.remote = try await client.uploadOriginal(remote: link.remote, file: original)
        try persist(link, assetID: checkpoint.asset.id)
    }
    func fetchForFinal(asset: AssetRecord, format: ExportFormat, pipeline: PhotoPipeline) async throws {
        guard let link = try load(asset.id), link.remote.cloudSafe else {throw BackendFailure.originalUnavailable}
        let temporary = try await client.downloadOriginal(remoteID: link.remote.id, format: format)
        defer {try? FileManager.default.removeItem(at: temporary)}
        try await pipeline.installDownloadedOriginal(temporary, asset: asset)
    }
    /// Read-only binding admission. Never creates an asset, uploads an Original,
    /// or overwrites a remote Recipe merely to enable paid generation.
    func generationBinding(for checkpoint: ProjectCheckpoint) async throws -> ServerGenerationClient.Binding {
        try checkpoint.validate()
        guard let link = try load(checkpoint.asset.id), link.remote.deletedAt == nil,
              link.remote.sha256.lowercased() == checkpoint.asset.sha256.lowercased(),
              let latest = try await client.latestRecipe(remoteID: link.remote.id),
              latest.revision == link.recipeRevision,
              latest.body == (try RecipeDocument(parameters: checkpoint.history.current)) else { throw BackendFailure.conflict }
        guard let current = try load(checkpoint.asset.id), current.remote.id == link.remote.id,
              current.recipeRevision == link.recipeRevision,
              current.remote.sha256 == link.remote.sha256 else { throw BackendFailure.conflict }
        try Task.checkCancellation()
        return .init(assetID: link.remote.id.uuidString.lowercased(), originalSHA256: checkpoint.asset.sha256.lowercased(), recipeRevision: latest.revision)
    }
}
