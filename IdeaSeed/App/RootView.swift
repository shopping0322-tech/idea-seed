import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            GeneratorView()
                .tabItem { Label("生成", systemImage: "sparkles") }
            HistoryView()
                .tabItem { Label("履歴", systemImage: "clock") }
        }
        .frame(minWidth: 360, minHeight: 520)
    }
}

private struct GeneratorView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let result = model.currentResult {
                        ForEach(result.items.sorted { $0.displayOrder < $1.displayOrder }) { item in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.categoryLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(item.value)
                                    .font(.title2)
                                    .textSelection(.enabled)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    } else {
                        ContentUnavailableView(
                            "発想の種を生成",
                            systemImage: "dice",
                            description: Text("各カテゴリから独立してランダムに抽選します")
                        )
                        .frame(maxWidth: .infinity)
                    }

                    if let status = model.statusMessage {
                        Text(status)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let error = model.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    model.generate()
                } label: {
                    if model.isGenerating {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("生成").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!model.isReady || model.isGenerating)
                .padding()
                .background(.bar)
            }
            .navigationTitle("発想の種")
        }
    }
}

private struct HistoryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            Group {
                if model.history.isEmpty {
                    ContentUnavailableView(
                        "履歴はありません",
                        systemImage: "clock",
                        description: Text("生成した結果が古い順に表示されます")
                    )
                } else {
                    List(model.history) { record in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(record.createdAt, format: .dateTime.year().month().day().hour().minute())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            ForEach(record.items.sorted { $0.displayOrder < $1.displayOrder }) { item in
                                HStack(alignment: .firstTextBaseline) {
                                    Text(item.categoryLabel)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .frame(width: 72, alignment: .leading)
                                    Text(item.value)
                                        .textSelection(.enabled)
                                }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }
            }
            .navigationTitle("履歴")
            .onAppear { model.reloadHistory() }
        }
    }
}
