import Foundation
import XCTest
@testable import SuiteCore

final class WorkspaceTests: XCTestCase {
    func testWorkspaceViewerCannotEditExportOrManage() {
        XCTAssertTrue(WorkspaceRole.viewer.permits(.read))
        XCTAssertTrue(WorkspaceRole.viewer.permits(.select))
        for permission in WorkspacePermission.allCases where permission != .read && permission != .select {
            XCTAssertFalse(WorkspaceRole.viewer.permits(permission))
        }
    }
    func testWorkspaceEditorCannotChangeMembersOrBilling() {
        XCTAssertTrue(WorkspaceRole.editor.permits(.edit))
        XCTAssertTrue(WorkspaceRole.editor.permits(.export))
        XCTAssertFalse(WorkspaceRole.editor.permits(.manageMembers))
        XCTAssertFalse(WorkspaceRole.editor.permits(.owner))
        XCTAssertFalse(WorkspaceRole.editor.permits(.delete))
    }
    func testWorkspaceAdminCannotPerformOwnerOperation() {
        XCTAssertTrue(WorkspaceRole.admin.permits(.manageMembers))
        XCTAssertFalse(WorkspaceRole.admin.permits(.owner))
        XCTAssertTrue(WorkspaceRole.owner.permits(.owner))
    }
    func testWorkspaceUnknownRoleFailsClosed() {
        XCTAssertThrowsError(try JSONDecoder().decode(WorkspaceRole.self, from: Data("\"SUPERUSER\"".utf8)))
    }
    func testWorkspaceSwitchRejectsDelayedResponseIncludingReturnToSameWorkspace() throws {
        var state = WorkspaceSelectionState()
        let first = state.selectWorkspace("A")
        _ = try state.selectProject("A-project")
        state.selectWorkspace("B")
        XCTAssertNil(state.projectID)
        state.selectWorkspace("A")
        XCTAssertFalse(state.accepts(first, workspaceID: "A", projectID: nil))
        XCTAssertTrue(state.accepts(state.generation, workspaceID: "A", projectID: nil))
    }
    func testWorkspaceProjectCannotBeSelectedWithoutWorkspace() {
        var state = WorkspaceSelectionState()
        XCTAssertThrowsError(try state.selectProject("project"))
    }
    func testWorkspaceLogoutInvalidatesScope() throws {
        var state = WorkspaceSelectionState()
        state.selectWorkspace("A")
        let previous = try state.selectProject("project")
        state.selectWorkspace(nil)
        XCTAssertNil(state.workspaceID)
        XCTAssertNil(state.projectID)
        XCTAssertFalse(state.accepts(previous, workspaceID: "A", projectID: "project"))
    }
    func testWorkspaceTenAndTwentyTerabyteUsageDecodeWithoutOverflow() throws {
        for quota: Int64 in [100_000_000_000, 500_000_000_000, 1_000_000_000_000, 2_000_000_000_000, 5_000_000_000_000, 10_000_000_000_000, 20_000_000_000_000] {
            let usage = try usage(quota: quota, used: 99, available: quota - 99, over: false)
            try usage.validate()
            XCTAssertEqual(usage.quotaBytes, quota)
        }
    }
    func testWorkspaceDowngradeRetainsUsedBytesAndShowsOverQuota() throws {
        let usage = try usage(quota: 1_000_000_000_000, used: 1_600_000_000_000, available: 0, over: true)
        try usage.validate()
        XCTAssertEqual(usage.usedBytes, 1_600_000_000_000)
        XCTAssertTrue(usage.newUploadsBlocked)
    }
    func testWorkspaceInvalidStorageAccountingRejected() throws {
        XCTAssertThrowsError(try usage(quota: 100, used: 101, available: 1, over: false).validate())
    }
    private func usage(quota: Int64, used: Int64, available: Int64, over: Bool) throws -> WorkspaceStorageUsage {
        let json = """
        {"workspaceId":"A","planId":null,"configRevision":null,"quotaBytes":\(quota),"usedBytes":\(used),"reservedBytes":0,"availableBytes":\(available),"overQuota":\(over),"newUploadsBlocked":\(over),"categories":{"Original":\(used),"Proxy":0,"Generated":0,"Export":0,"Trash":0},"physicalAccountingObjectCount":1}
        """
        return try JSONDecoder().decode(WorkspaceStorageUsage.self, from: Data(json.utf8))
    }
}
