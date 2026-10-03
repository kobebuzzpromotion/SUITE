# 構成と実装境界

SwiftUIネイティブのiPhone/iPadアプリ。UI非依存の汎用METISMobileCoreとSuiteCoreを分離する。TypeScript APIは将来Webでも共用するが、Web画面は作らない。

- packages/METISMobileCore: Capability、実行経路、端末負荷/熱、Proxy選択、復旧checkpoint、証拠付きgateの汎用契約。
- packages/SuiteCore: 非破壊Recipe、編集履歴、CAS/atomic checkpoint、Asset表現、原本取得/退避/Final待ちの判断。
- apps/apple/Suite: File import、Core Image RAW候補adapter、Proxy preview、UIの状態接続と別iPhone/iPad layout。
- apps/backend: 認証境界、tenant隔離、SQLiteメタデータ、別オブジェクト保存、原本取得目的の制約、METISゲート適応。
- contracts: 永続化/通信のschema契約とProvider境界。
- docs: 84節原本/16節override/変更指示/要件追跡/6領域設計/実行結果/引継ぎ。

難所の詳細はPHOTO_ARCHITECTURE.md。Storage/RAW/Camera/生成/課金は差替境界。既存生成GatewayやCreditの完成済み機能を独断で重複実装しない。今回生成・課金・カメラは未接続とする。

アプリの既定最低OSは骨組み用iOS17。商用互換性と最低対応OSの確定ではない。Core Image RAW対応は公式カメラ一覧と実機で検証してから対応を表示する。

文書/Swiftコード/TypeScriptテストの存在と、実機上の品質・本番接続・商用リリースは別の検証状態として扱う。
