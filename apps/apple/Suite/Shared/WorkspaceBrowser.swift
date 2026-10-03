import SwiftUI
import SuiteCore

@MainActor
private final class WorkspaceBrowserModel: ObservableObject {
    @Published var workspaces: [WorkspaceSummary] = []
    @Published var projects: [WorkspaceProject] = []
    @Published var members: [WorkspaceMember] = []
    @Published var presets: [WorkspacePreset] = []
    @Published var assets: [WorkspaceAsset] = []
    @Published var storage: WorkspaceStorageUsage?
    @Published var scope = WorkspaceSelectionState()
    @Published var loading = false
    @Published var message: String?
    let client: WorkspaceClient?
    init(client: WorkspaceClient?) { self.client = client }
    func clear() {
        scope.selectWorkspace(nil)
        workspaces = []; clearWorkspaceData(); loading = false; message = nil
    }
    private func clearWorkspaceData() {
        projects = []; members = []; presets = []; assets = []; storage = nil
    }
    func reload() async {
        clear()
        guard let client else { message = "未接続：認証セッションとHTTPSバックエンドの注入が必要です。"; return }
        let generation = scope.generation
        loading = true
        do {
            let result = try await client.workspaces()
            guard scope.accepts(generation, workspaceID: nil, projectID: nil) else { return }
            workspaces = result; loading = false
            if result.isEmpty { message = "所属Workspaceはありません。" }
        } catch {
            guard scope.accepts(generation, workspaceID: nil, projectID: nil) else { return }
            loading = false; message = error.localizedDescription
        }
    }
    func select(_ workspace: WorkspaceSummary) async {
        // Synchronous invalidation precedes every await: no old Workspace metadata remains visible.
        let generation = scope.selectWorkspace(workspace.id)
        clearWorkspaceData(); message = nil; loading = true
        guard let client else { loading = false; return }
        do {
            async let projectResult = client.projects(workspace: workspace.id)
            async let memberResult = client.members(workspace: workspace.id)
            async let presetResult = client.presets(workspace: workspace.id)
            async let storageResult = client.storage(workspace: workspace.id)
            let (p, m, look, usage) = try await (projectResult, memberResult, presetResult, storageResult)
            guard scope.accepts(generation, workspaceID: workspace.id, projectID: nil) else { return }
            projects = p; members = m; presets = look; storage = usage; loading = false
        } catch {
            guard scope.accepts(generation, workspaceID: workspace.id, projectID: nil) else { return }
            clearWorkspaceData(); loading = false; message = error.localizedDescription
        }
    }
    func selectProject(_ project: WorkspaceProject) async {
        guard let client, let workspace = scope.workspaceID, project.workspaceId == workspace else { return }
        do {
            let generation = try scope.selectProject(project.id)
            assets = []; message = nil; loading = true
            do {
                let result = try await client.assets(workspace: workspace, project: project.id)
                guard scope.accepts(generation, workspaceID: workspace, projectID: project.id) else { return }
                assets = result; loading = false
            } catch {
                guard scope.accepts(generation, workspaceID: workspace, projectID: project.id) else { return }
                // A revoked membership must not leave the rest of this Workspace's data on screen.
                clearWorkspaceData(); loading = false; message = error.localizedDescription
            }
        } catch { message = error.localizedDescription }
    }
}

/// A bounded metadata browser candidate, NOT a completed shared-photo editing workflow.
/// Default entry is deliberately disconnected; it does not seed fake Workspaces or claim Cloud Safe.
struct WorkspaceBrowser: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model: WorkspaceBrowserModel
    init(client: WorkspaceClient? = nil) {
        _model = StateObject(wrappedValue: WorkspaceBrowserModel(client: client))
    }
    var body: some View {
        Group {
            if sizeClass == .regular {
                NavigationSplitView {
                    workspaceList.navigationTitle("Workspace")
                } content: {
                    projectList.navigationTitle("Projects")
                } detail: {
                    details.navigationTitle("Cloud Library")
                }
            } else {
                NavigationStack {
                    List {
                        status
                        Section("Project") { projectRows }
                        detailRows
                    }
                    .navigationTitle(selectedName)
                    .safeAreaInset(edge: .bottom) { phoneControls }
                }
            }
        }
        .task { await model.reload() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.reload() } }
            else { model.clear() }
        }
    }
    private var selectedName: String {
        model.workspaces.first(where: { $0.id == model.scope.workspaceID })?.name ?? "Workspace"
    }
    private var workspaceList: some View {
        List {
            status
            ForEach(model.workspaces) { workspace in
                Button {
                    Task { await model.select(workspace) }
                } label: {
                    HStack {
                        Text(workspace.name)
                        if model.scope.workspaceID == workspace.id { Image(systemName: "checkmark") }
                    }.frame(minHeight: 44)
                }
            }
            Button("再読込み", systemImage: "arrow.clockwise") { Task { await model.reload() } }
                .disabled(model.client == nil)
        }
    }
    private var projectList: some View { List { projectRows } }
    @ViewBuilder private var projectRows: some View {
        if model.scope.workspaceID == nil { Text("Workspaceを選択してください。").foregroundStyle(.secondary) }
        else if model.projects.isEmpty && !model.loading { Text("表示できるProjectはありません。").foregroundStyle(.secondary) }
        ForEach(model.projects) { project in
            Button {
                Task { await model.selectProject(project) }
            } label: {
                HStack {
                    Text(project.name)
                    if model.scope.projectID == project.id { Image(systemName: "checkmark") }
                }.frame(minHeight: 44)
            }
        }
    }
    private var details: some View { List { status; detailRows } }
    @ViewBuilder private var status: some View {
        if model.loading { ProgressView("Workspace情報を取得中") }
        if let message = model.message { Text(message).foregroundStyle(.secondary) }
        Text("接続候補・未検証。認証UI、写真Proxy転送、共同編集からExportまでの導線は未接続です。")
            .font(.footnote).foregroundStyle(.secondary)
    }
    @ViewBuilder private var detailRows: some View {
        if let usage = model.storage {
            Section("Storage — Server集計") {
                Text("\(bytes(usage.usedBytes)) / \(bytes(usage.quotaBytes))")
                Text("利用可能 \(bytes(usage.availableBytes))・予約 \(bytes(usage.reservedBytes))")
                ForEach(["Original", "Proxy", "Generated", "Export", "Trash"], id: \.self) { category in
                    HStack { Text(category); Spacer(); Text(bytes(usage.categories[category] ?? 0)) }
                }
                if usage.newUploadsBlocked { Text("新規Upload制限中。原本は自動削除しません。").foregroundStyle(.orange) }
                Text("料金・購入・プラン変更は未接続です。").font(.footnote)
            }
        }
        Section("Cloud Library情報") {
            if model.scope.projectID == nil { Text("Projectを選択してください。") }
            ForEach(model.assets) { asset in
                VStack(alignment: .leading) {
                    Text(asset.name)
                    Text("\(bytes(asset.size))・\(asset.cloudSafe ? "サーバー検証フラグあり" : "検証待ち")").font(.caption)
                    Text("Proxy画像表示・編集・Export接続は未実装").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        Section("Members") {
            ForEach(model.members) { member in
                HStack { Text(member.userId); Spacer(); Text(member.role.rawValue) }
            }
        }
        Section("Shared Presets — メタデータ閲覧") {
            ForEach(model.presets) { preset in
                HStack { Text(preset.name); Spacer(); Text("v\(preset.version)") }
            }
            Text("適用・管理UIは未接続です。").font(.footnote).foregroundStyle(.secondary)
        }
    }
    private var phoneControls: some View {
        HStack {
            Menu {
                ForEach(model.workspaces) { workspace in
                    Button(workspace.name) { Task { await model.select(workspace) } }
                }
            } label: { Label("Workspace切替", systemImage: "person.3").frame(minHeight: 44) }
            .disabled(model.workspaces.isEmpty)
            Spacer()
            Button { Task { await model.reload() } } label: {
                Label("再読込み", systemImage: "arrow.clockwise").frame(minHeight: 44)
            }.disabled(model.client == nil)
        }
        .padding(.horizontal).background(.bar)
    }
    private func bytes(_ value: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: value, countStyle: .decimal)
    }
}
