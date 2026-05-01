# Google Health Heatmap

An Obsidian plugin that visualizes health data from the Google Health API as a heatmap using [Cal-Heatmap.js](https://cal-heatmap.com/).

## Features

- **Google Health API integration** — Secure authentication via OAuth 2.0 (PKCE)
- **5 metrics supported** — Steps, heart rate, calories, sleep, and active minutes
- **Flexible aggregation** — Daily, hourly, or custom millisecond intervals
- **Local cache** — Minimizes API calls with LRU + TTL caching
- **Code block syntax** — Just write a ` ```health-heatmap ` block in any note

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

> Once published to the Obsidian Community Plugins directory, you can install it directly from the plugin browser.

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

Add a code block to any note to render a heatmap:

````markdown
```health-heatmap
metric: steps
range: 365
startDate: 2025-04-28
aggregationPeriod: daily
theme: dark
```
````

### Parameters

| Parameter | Values | Description |
|---|---|---|
| `metric` | `steps` \| `heart_rate` \| `calories` \| `sleep` \| `active_minutes` | Metric to display |
| `range` | number (days) | Number of days to show |
| `startDate` | `YYYY-MM-DD` | Start date |
| `aggregationPeriod` | `daily` \| `hourly` \| milliseconds | Aggregation interval |
| `theme` | `light` \| `dark` | Color theme |
| `heartRateMetric` | `average` \| `min` \| `max` \| `all` | Heart rate statistic |
| `calorieMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | Calorie statistic |
| `sleepMetric` | `average` \| `min` \| `max` \| `sleep_ratio` | Sleep statistic |
| `activeMetric` | `sum` \| `average` \| `min` \| `max` \| `all` | Active minutes statistic |

### Examples

**Heart rate (hourly average):**
````markdown
```health-heatmap
metric: heart_rate
heartRateMetric: average
aggregationPeriod: hourly
range: 30
```
````

**Sleep ratio:**
````markdown
```health-heatmap
metric: sleep
sleepMetric: sleep_ratio
aggregationPeriod: daily
range: 90
```
````

**Total calories burned (hourly):**
````markdown
```health-heatmap
metric: calories
calorieMetric: sum
aggregationPeriod: 3600000
range: 7
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
  DataProcessor         ← converts API response to Cal-Heatmap format
       │          ↕ cache (LRU + TTL)
  HeatmapRenderer       ← Canvas rendering via cal-heatmap.js
       │
  Obsidian Note
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
