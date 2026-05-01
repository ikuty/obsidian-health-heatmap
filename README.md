# Google Health Heatmap

Google Health API から取得した健康データを [Cal-Heatmap.js](https://cal-heatmap.com/) でヒートマップ表示する Obsidian プラグインです。

## 機能

- **Google Health API 連携** — OAuth 2.0 (PKCE) による安全な認証
- **5 種類のメトリクス対応** — ステップ数・心拍数・消費カロリー・睡眠・アクティブ時間
- **柔軟な集計期間** — 日次・時間単位・ミリ秒単位でカスタム指定
- **ローカルキャッシュ** — LRU + TTL により API 呼び出しを最小化
- **コードブロック記法** — ノート内に ` ```health-heatmap ` ブロックを書くだけで表示

## 前提条件

- Obsidian v1.4.0 以上（デスクトップ版のみ）
- Google アカウント
- Google Cloud Console でのプロジェクト・Fitness API の有効化

## セットアップ

### 1. Google Cloud Console の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **API とサービス > ライブラリ** から **Fitness API** を有効化
3. **API とサービス > 認証情報** で OAuth 2.0 クライアント ID を作成
   - アプリケーションの種類: **デスクトップアプリ**
4. クライアント ID とクライアントシークレットを控えておく

### 2. プラグインのインストール

> Obsidian Community Plugins に公開後は、プラグインブラウザからインストールできます。

手動インストールの場合:

```bash
# Obsidian の Vault にプラグインディレクトリを作成
mkdir -p <your-vault>/.obsidian/plugins/health-api-heatmap-plugin

# ビルド成果物をコピー
cp main.js manifest.json styles.css <your-vault>/.obsidian/plugins/health-api-heatmap-plugin/
```

その後、Obsidian の **設定 > コミュニティプラグイン** でプラグインを有効化してください。

### 3. プラグインの認証設定

1. **設定 > Google Health Heatmap** を開く
2. クライアント ID とクライアントシークレットを入力して保存
3. **「OAuth テスト」** ボタンで認証フローを実行

> シークレットは設定画面に再表示されません。クライアント ID は末尾 4 文字のみ表示されます。

## 使い方

ノートに以下のコードブロックを記述すると、ヒートマップが描画されます。

````markdown
```health-heatmap
metric: steps
range: 365
startDate: 2025-04-28
aggregationPeriod: daily
theme: dark
```
````

### パラメータ一覧

| パラメータ | 値 | 説明 |
|---|---|---|
| `metric` | `steps` \| `heart_rate` \| `calories` \| `sleep` \| `active_minutes` | 表示するメトリクス |
| `range` | 数値（日数） | 表示期間 |
| `startDate` | `YYYY-MM-DD` | 開始日 |
| `aggregationPeriod` | `daily` \| `hourly` \| ミリ秒数 | 集計単位 |
| `theme` | `light` \| `dark` | カラーテーマ |
| `heartRateMetric` | `average` \| `min` \| `max` \| `all` | 心拍数の集計方法 |
| `calorieMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | カロリーの集計方法 |
| `sleepMetric` | `average` \| `min` \| `max` \| `sleep_ratio` | 睡眠の集計方法 |
| `activeMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | アクティブ時間の集計方法 |

### 使用例

**心拍数（時間単位・平均）:**
````markdown
```health-heatmap
metric: heart_rate
heartRateMetric: average
aggregationPeriod: hourly
range: 30
```
````

**睡眠（睡眠率）:**
````markdown
```health-heatmap
metric: sleep
sleepMetric: sleep_ratio
aggregationPeriod: daily
range: 90
```
````

**消費カロリー合計（1 時間ごと）:**
````markdown
```health-heatmap
metric: calories
calorieMetric: sum
aggregationPeriod: 3600000
range: 7
```
````

## アーキテクチャ

```
Google Health API
       │ OAuth 2.0 (PKCE)
  OAuthManager
       │
  HealthClient          ← Obsidian requestUrl のラッパー
       │
  DataProcessor         ← API レスポンス → Cal-Heatmap 形式に変換
       │          ↕ キャッシュ (LRU + TTL)
  HeatmapRenderer       ← cal-heatmap.js による Canvas 描画
       │
  Obsidian Note
```

キャッシュは `.obsidian/plugins/health-api-heatmap-plugin/data.json` に保存されます。デフォルト TTL は 24 時間で、最大 10 MB まで保持します（LRU で自動削除）。

## 開発

```bash
# 依存関係のインストール
npm install

# 開発ビルド（watch モード）
npm run dev

# プロダクションビルド
npm run build

# ユニットテスト
npm test

# リンター
npm run lint
```

テストは `__tests__/` に配置し、Obsidian API は Jest でモック化しています。

## ライセンス

MIT
