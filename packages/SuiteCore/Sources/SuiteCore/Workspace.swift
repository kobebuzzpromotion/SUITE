import Foundation

/// UI hints only. Every operation must still pass live server membership checks.
public enum WorkspaceRole: String, Codable, CaseIterable, Sendable {
    case owner = "OWNER", admin = "ADMIN", editor = "EDITOR", viewer = "VIEWER"
    public func permits(_ permission: WorkspacePermission) -> Bool {
        switch permission {
        case .read, .select: true
        case .edit, .export: self != .viewer
        case .owner: self == .owner
        case .manageMembers, .manageProjects, .managePresets, .publishGallery, .delete, .audit:
            self == .owner || self == .admin
        }
    }
}
public enum WorkspacePermission: String, Codable, CaseIterable, Sendable {
    case read, edit, export, select, delete, owner, audit
    case manageMembers = "manage-members", manageProjects = "manage-projects"
    case managePresets = "manage-presets", publishGallery = "publish-gallery"
}
public struct WorkspaceSummary: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let createdBy: String
    public let createdAt: String
    public let deletedAt: String?
}
public struct WorkspaceMember: Codable, Identifiable, Equatable, Sendable {
    public var id: String { userId }
    public let workspaceId: String
    public let userId: String
    public let role: WorkspaceRole
    public let joinedAt: String
    public let removedAt: String?
}
public struct WorkspaceProject: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let workspaceId: String
    public let name: String
    public let createdBy: String
    public let createdAt: String
    public let deletedAt: String?
}
public struct WorkspaceAsset: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let tenantId: String
    public let name: String
    public let originalKey: String
    public let sha256: String
    public let size: Int64
    public let cloudSafe: Bool
    public let deletedAt: String?
}
public struct WorkspacePreset: Codable, Identifiable, Sendable {
    public let id: String
    public let workspaceId: String
    public let scope: String
    public let ownerUserId: String
    public let name: String
    public let version: Int64
    public let body: RecipeDocument
    public let createdAt: String
    public let updatedAt: String
    public let deletedAt: String?
}
public struct WorkspaceRecipeDifference: Codable, Sendable {
    public let path: String
    public let before: RecipeValue?
    public let after: RecipeValue?
}
public struct WorkspacePresetSnapshot: Codable, Sendable {
    public let id: String
    public let version: Int64
    public let body: RecipeDocument
}
public struct WorkspaceRecipeVersion: Codable, Identifiable, Sendable {
    public let id: String
    public let workspaceId: String
    public let projectId: String
    public let assetId: String
    public let editorUserId: String
    public let createdAt: String
    public let updatedAt: String
    public let version: Int64
    public let parentVersion: Int64
    public let branch: Bool
    public let body: RecipeDocument
    public let changedFields: [WorkspaceRecipeDifference]
    public let presetSnapshot: WorkspacePresetSnapshot?
}
public struct WorkspaceRecipeSaveResult: Codable, Sendable {
    public enum Outcome: String, Codable, Sendable { case saved, conflict }
    public let outcome: Outcome
    public let version: WorkspaceRecipeVersion
    public let currentVersion: Int64
    public let diff: [WorkspaceRecipeDifference]
}
public struct WorkspaceStorageUsage: Codable, Sendable {
    public let workspaceId: String
    public let planId: String?
    public let configRevision: String?
    public let quotaBytes: Int64
    public let usedBytes: Int64
    public let reservedBytes: Int64
    public let availableBytes: Int64
    public let overQuota: Bool
    public let newUploadsBlocked: Bool
    public let categories: [String: Int64]
    public let physicalAccountingObjectCount: Int64

    public func validate() throws {
        let maximum: Int64 = 9_007_199_254_740_991 // Existing JSON safe integer boundary, not a plan limit.
        let counts = [quotaBytes, usedBytes, reservedBytes, availableBytes, physicalAccountingObjectCount] + Array(categories.values)
        guard Set(categories.keys) == Set(["Original", "Proxy", "Generated", "Export", "Trash"]),
              counts.allSatisfy({ $0 >= 0 && $0 <= maximum }),
              usedBytes <= maximum - reservedBytes,
              availableBytes == max(0, quotaBytes - usedBytes - reservedBytes),
              overQuota == (usedBytes + reservedBytes > quotaBytes) else {
            throw SuiteValidationError.invalidValue("workspaceStorageUsage")
        }
    }
}

/// A fresh generation is issued even when A -> B -> A; delayed A responses cannot reappear.
/// Callers must clear visible data synchronously whenever this scope changes.
public struct WorkspaceSelectionState: Sendable {
    public private(set) var workspaceID: String?
    public private(set) var projectID: String?
    public private(set) var generation = UUID()
    public init() {}
    @discardableResult public mutating func selectWorkspace(_ id: String?) -> UUID {
        workspaceID = id; projectID = nil; generation = UUID(); return generation
    }
    @discardableResult public mutating func selectProject(_ id: String?) throws -> UUID {
        guard workspaceID != nil else { throw SuiteValidationError.invalidValue("workspaceRequired") }
        projectID = id; generation = UUID(); return generation
    }
    public func accepts(_ requestGeneration: UUID, workspaceID: String?, projectID: String?) -> Bool {
        generation == requestGeneration && self.workspaceID == workspaceID && self.projectID == projectID
    }
}
