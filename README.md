# Google Health Heatmap

An Obsidian plugin that visualizes health data from the Google Health API as a time-based heatmap (SVG).

## Features

- **Panel view** — Dockable panel with one-click metric switching (Steps / Calories / Sleep / Active)
- **Google Health API integration** — Secure authentication via OAuth 2.0 (PKCE)
- **5 metrics supported** — Steps, heart rate, calories, sleep, and active minutes
- **Flexible aggregation** — 1–24 hours per time slot (Y-axis), any number of days (X-axis)
- **Local cache** — Minimizes API calls with LRU + TTL caching
- **Code block syntax** — Embed a heatmap inline in any note with a ` ```health-heatmap ` block

## Requirements

- Obsidian v1.4.0 or later (desktop only)
- A Google account
- A Google Cloud project with the Fitness API enabled

## Setup

### 1. Google Cloud Console

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Fitness API** under **APIs & Services > Library**
3. Create an OAuth 2.0 client ID under **APIs & Services > Credentials**
   - Application type: **Desktop app**
4. Note your client ID and client secret

### 2. Install the plugin

For manual installation:

```bash
# Create the plugin directory in your Vault
mkdir -p <your-vault>/.obsidian/plugins/health-api-heatmap-plugin

# Copy the build artifacts
cp main.js manifest.json styles.css <your-vault>/.obsidian/plugins/health-api-heatmap-plugin/
```

Then enable the plugin under **Settings > Community plugins**.

### 3. Authenticate

1. Open **Settings > Google Health Heatmap**
2. Enter your client ID and client secret, then save
3. Click **"OAuth Test"** to run the authentication flow

> The secret is never shown again after saving. The client ID is displayed with only the last 4 characters visible.

## Usage

### Panel view

Open the panel using either method:

- Click the **activity icon** in the left ribbon
- Run **"Health Heatmap パネルを開く"** from the command palette (`Cmd/Ctrl+P`)

The panel docks in the right sidebar and shows:

```
[ Steps ] [ Calories ] [ Sleep ] [ Active ]   ← click to switch metric
─────────────────────────────────────────────
          heatmap  (past 14 days, 2-hour slots)
```

The default metric is **Steps**. Clicking a button immediately refetches (or loads from cache) and redraws the heatmap.

### Code block

Add a `health-heatmap` code block to any note:

````markdown
```health-heatmap
metric: steps
range: 30
agg: 24
theme: light
```
````

#### Parameters

| Parameter | Type / Values | Default | Description |
|---|---|---|---|
| `metric` | `steps` \| `heart_rate` \| `calories` \| `sleep` \| `active_minutes` | — **(required)** | Metric to display |
| `range` | number (days) | `7` | Number of days shown on the X-axis |
| `agg` | integer 1–24 | `1` | Hours per time slot on the Y-axis (`24` = daily, `1` = hourly) |
| `startDate` | `YYYY-MM-DD` | today − (range − 1) days | Start date of the range |
| `theme` | `light` \| `dark` | `light` | Color theme |
| `heartRateMetric` | `average` \| `min` \| `max` \| `all` | `average` | Heart rate statistic |
| `calorieMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | `sum` | Calorie statistic |
| `sleepMetric` | `minutes_asleep` \| `efficiency` | `minutes_asleep` | Sleep statistic |
| `activeMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | `sum` | Active minutes statistic |

#### Examples

**Daily steps for the past 30 days:**
````markdown
```health-heatmap
metric: steps
range: 30
agg: 24
```
````

**Hourly heart rate (2-hour slots) for the past 2 weeks:**
````markdown
```health-heatmap
metric: heart_rate
heartRateMetric: average
range: 14
agg: 2
```
````

**Sleep duration (daily) for the past 90 days:**
````markdown
```health-heatmap
metric: sleep
sleepMetric: minutes_asleep
range: 90
agg: 24
```
````

**Total calories per 2-hour block for the past week:**
````markdown
```health-heatmap
metric: calories
calorieMetric: sum
range: 7
agg: 2
```
````

## Architecture

```
Google Health API
       │ OAuth 2.0 (PKCE)
  OAuthManager
       │
  HealthClient          ← wrapper around Obsidian requestUrl
       │
  DataProcessor         ← converts API response to heatmap data points
       │          ↕ cache (LRU + TTL)
  HeatmapRenderer       ← SVG rendering (custom, no external dependency)
       │
  ┌────┴──────────────┐
  │                   │
  HealthHeatmapView   HeatmapBlock
  (panel / ItemView)  (code block / MarkdownRenderChild)
```

Cache is stored in `.obsidian/plugins/health-api-heatmap-plugin/data.json`. Default TTL is 24 hours with a 10 MB maximum (auto-evicted via LRU).

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Unit tests
npm test

# Linter
npm run lint
```

Tests live in `__tests__/` and mock the Obsidian API with Jest.

## License

MIT
