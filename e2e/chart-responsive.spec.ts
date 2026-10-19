import { test, expect } from '@playwright/test'

test.describe('Dashboard Chart Visual & Responsive Labels (#225, #226)', () => {
  test('chart axis labels render in HTML without SVG stretching and are responsive', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard')

    // Expect the chart containers to be present
    const dailyChart = page.getByRole('img', { name: /alerts \(last 7 days\) bar chart/i }).first()
    await expect(dailyChart).toBeVisible()

    // Ensure the SVG itself does not contain stretched text nodes
    const svgTextElements = dailyChart.locator('text')
    await expect(svgTextElements).toHaveCount(0)

    // Test responsive mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    const hourlyChart = page.getByRole('img', { name: /alerts \(last 24 hours\) bar chart/i }).first()
    await expect(hourlyChart).toBeVisible()

    // Take visual snapshot if screenshot comparison is enabled
    // await expect(page).toHaveScreenshot('dashboard-charts-mobile.png')
  })
})
