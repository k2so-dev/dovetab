import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

declare const chrome: typeof import('wxt/browser').browser

const ext = realpathSync(resolve('.output/chrome-mv3'))
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('')
const out = resolve(process.argv[2] ?? 'tests/e2e/.shots')
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'shelf-')), {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
const page = await ctx.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(`chrome-extension://${id}/newtab.html`)
await page.waitForTimeout(500)
console.log('url', page.url())

await page.evaluate(async () => {
  const b = chrome.bookmarks
  const mk = (parentId: string, title: string, url?: string) => b.create({ parentId, title, url })
  const bar = '1'
  const other = '2'
  const work = await mk(bar, 'Work')
  const dev = await mk(work.id, 'Development')
  const docs = await mk(work.id, 'Docs')
  const read = await mk(bar, 'Reading')
  const design = await mk(other, 'Design')
  const data: [string, string, string][] = [
    [bar, 'Gmail', 'https://mail.google.com'],
    [bar, 'Calendar', 'https://calendar.google.com'],
    [bar, 'Claude', 'https://claude.ai'],
    [work.id, 'Linear', 'https://linear.app'],
    [work.id, 'Figma', 'https://figma.com'],
    [dev.id, 'GitHub', 'https://github.com'],
    [dev.id, 'npm', 'https://npmjs.com'],
    [dev.id, 'Can I use', 'https://caniuse.com'],
    [dev.id, 'regex101', 'https://regex101.com'],
    [docs.id, 'MDN Web Docs', 'https://developer.mozilla.org'],
    [docs.id, 'Vue', 'https://vuejs.org'],
    [docs.id, 'Tailwind CSS', 'https://tailwindcss.com'],
    [read.id, 'Hacker News', 'https://news.ycombinator.com'],
    [read.id, 'Lobsters', 'https://lobste.rs'],
    [design.id, 'Dribbble', 'https://dribbble.com'],
    [design.id, 'Coolors', 'https://coolors.co'],
  ]
  for (const [p, t, u] of data) await mk(p, t, u)
  const big = await mk(bar, 'Archive')
  for (let i = 1; i <= 60; i++) await mk(big.id, `Archived page ${i}`, `https://example${i % 7}.org/p/${i}`)
  await mk(other, 'GitHub again', 'https://www.github.com/')
  localStorage.setItem(
    'shelf:stats',
    JSON.stringify({
      'https://github.com/': [40, Date.now() - 3e6],
      'https://claude.ai/': [25, Date.now() - 9e6],
      'https://news.ycombinator.com/': [12, Date.now() - 9e7],
    }),
  )
})
await page.reload()
await page.waitForTimeout(800)
const shot = async (name: string) => {
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${name}.png` })
}

await page.getByRole('radio', { name: 'Tiles' }).click()
await page.emulateMedia({ colorScheme: 'dark' })
await shot('01-all-dark-tiles')
await page.emulateMedia({ colorScheme: 'light' })
await shot('02-all-light-tiles')
await page.emulateMedia({ colorScheme: 'dark' })
await page.getByRole('radio', { name: 'List' }).click()
await shot('03-list')
await page.getByRole('radio', { name: 'Columns' }).click()
await shot('04-columns')
await page.setViewportSize({ width: 2000, height: 1100 })
await shot('04b-columns-wide')
await page.locator('a[href="https://github.com/"]').last().hover()
await shot('04c-columns-hover')
await page.emulateMedia({ colorScheme: 'light' })
await shot('04d-columns-hover-light')
await page.emulateMedia({ colorScheme: 'dark' })
await page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('shelf:settings') ?? '{}')
  await chrome.storage.sync.set({ settings: { ...s, width: 'narrow' } })
})
await page.waitForTimeout(300)
await page.waitForTimeout(500)
await shot('04e-columns-narrow')
await page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('shelf:settings') ?? '{}')
  await chrome.storage.sync.set({ settings: { ...s, width: 'full' } })
})
await page.waitForTimeout(300)
await page.locator('nav [role=button]', { hasText: 'Cleanup' }).click()
await shot('04f-cleanup')
await page.setViewportSize({ width: 1400, height: 900 })
await page.locator('nav [role=button]', { hasText: 'All bookmarks' }).click()
await page.getByRole('radio', { name: 'Tiles' }).click()
await page.getByRole('button', { name: /^Work/ }).first().click()
await page.waitForTimeout(200)
await shot('05-folder-work')
await page.locator('a[href="https://linear.app/"]').click({ button: 'right' })
await page.waitForTimeout(200)
await shot('06-menu')
await page.keyboard.press('Escape')
await page.keyboard.press('Meta+k')
await page.keyboard.type('git')
await page.waitForTimeout(200)
await shot('07-palette')
await page.keyboard.press('Escape')
await page.locator('a[href="https://linear.app/"]').click({ button: 'right' })
await page.getByRole('menuitem', { name: /Edit/ }).click()
await page.waitForTimeout(200)
await shot('08-edit')
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Settings' }).click()
await page.waitForTimeout(200)
await shot('09-settings')
await page.keyboard.press('Escape')
await page
  .getByRole('button', { name: /^Recommended/ })
  .first()
  .click()
await page.waitForTimeout(200)
await shot('10-reco')

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors')
await ctx.close()
