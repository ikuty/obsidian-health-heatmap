# Claude Code プロジェクトルール: Obsidian Google Health Sync

Google Health API のデータを取得し、cal-heatmap.js で可視化する Obsidian プラグイン開発プロジェクト。

## 🛠 コマンド
- **インストール:** `npm install`
- **ビルド (開発用):** `npm run dev`
- **ビルド (本番用):** `npm run build`
- **ユニットテスト:** `npm test` (Jest)
- **E2Eテスト:** `npx playwright test`
- **リンター実行:** `npm run lint`

## 🏗 アーキテクチャと設計指針
- **基本要求:** `requirement.md` を参照すること。
- **詳細設計:** `.designs/` フォルダ内の各 Markdown ファイルに機能別の設計を記述する。実装前に必ず該当する設計書を確認すること。
- **モジュール化 (テスト容易性):** 以下の役割を分離し、Obsidian API への依存を最小限に抑えた純粋なロジック層を構築する。
  - `OAuthManager`: トークン交換、リフレッシュ、認証フローの管理。
  - `HealthClient`: Google Health API との通信（Obsidian `requestUrl` のラッパーを使用）。
  - `DataProcessor`: API レスポンスを cal-heatmap 用のデータ構造に変換。
  - `HeatmapRenderer`: `cal-heatmap.js` を使用した DOM 描画処理。

## 🎨 コーディング規約
- **言語:** TypeScript (Strict モード推奨)。
- **命名規則:** - クラス・インターフェース: `PascalCase`
  - 変数・関数: `camelCase`
  - 定数: `UPPER_SNAKE_CASE`
- **非同期処理:** `Promise.then` を避け、`async/await` を使用する。
- **エラー処理:** UI への通知は Obsidian の `Notice` を使用。内部エラーは型定義されたエラークラスで管理する。
- **セキュリティ:** `client_secret` 等の機密情報はコード内にハードコードせず、プラグイン設定画面から入力・保存する。

## 🧪 テスト戦略
- **Unit Test (Jest):** `__tests__/` に配置。API 通信や Obsidian API はモック化し、ロジック単体で検証可能にすること。
- **E2E Test (Playwright):** `tests-e2e/` に配置。プラグインのロード、設定画面、描画のライフサイクルをテストする。

## 🗝 Obsidian 固有の実装
- **データ永続化:** 設定やトークンの保存には `this.saveData()` / `this.loadData()` を使用。
- **ビュー:** 可視化には `ItemView` または専用の `MarkdownRenderChild` を使用して描画領域を確保する。