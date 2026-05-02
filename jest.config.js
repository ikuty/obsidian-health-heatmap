module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/__mocks__/obsidian.ts",
    "^cal-heatmap$": "<rootDir>/__mocks__/cal-heatmap.ts",
    "^cal-heatmap/plugins/Tooltip$": "<rootDir>/__mocks__/cal-heatmap-tooltip.ts",
    "^highcharts$": "<rootDir>/__mocks__/highcharts.ts",
    "^highcharts/highcharts-more$": "<rootDir>/__mocks__/highcharts-more.ts",
  },
};
