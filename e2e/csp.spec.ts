import { test, expect } from '@playwright/test'

const pages = [
  '/',
  '/dashboard',
  '/contracts',
  '/contracts/new',
  '/contracts/csp-test',
  '/settings',
]

test('production pages load without Content Security Policy violations', async ({
  page,
}) => {
  const cspConsoleErrors: string[] = []

  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /content security policy|refused to (load|execute|apply|connect)/i.test(
        message.text()
      )
    ) {
      cspConsoleErrors.push(message.text())
    }
  })

  for (const path of pages) {
    const response = await page.goto(path)
    expect(response, `${path} should return a document`).not.toBeNull()

    const policy = response!.headers()['content-security-policy']
    expect(policy, `${path} should include a CSP header`).toContain(
      "default-src 'self'"
    )
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("img-src 'self' data:")
    expect(policy).toContain("font-src 'self'")
  }

  expect(cspConsoleErrors).toEqual([])
})
