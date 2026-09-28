import { chromium, type Page } from 'playwright'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

declare const chrome: typeof import('wxt/browser').browser
type Node = { title: string; url?: string; children?: Node[] }

const ext = realpathSync(resolve('.output/chrome-mv3'))
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('')

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'shelf-')), {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
const page = await ctx.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`chrome-extension://${id}/newtab.html`)

const tree = (p: Page) =>
  p.evaluate(async () => {
    const out: Record<string, string> = {}
    const walk = (n: Node, path: string) => {
      if (n.url) out[n.title] = path
      n.children?.forEach((c) => walk(c, n.title ? `${path}/${n.title}` : path))
    }
    ;((await chrome.bookmarks.getTree()) as Node[]).forEach((n) => walk(n, ''))
    return out
  })
const order = (p: Page, folderId: string) =>
  p.evaluate(async (fid) => ((await chrome.bookmarks.getChildren(fid)) as Node[]).map((c) => c.title), folderId)

const folders = await page.evaluate(async () => {
  const b = chrome.bookmarks
  const work = await b.create({ parentId: '1', title: 'Work' })
  for (const [t, u] of [
    ['Alpha', 'https://alpha.test/'],
    ['Beta', 'https://beta.test/'],
    ['Gamma', 'https://gamma.test/'],
  ])
    await b.create({ parentId: work.id, title: t, url: u })
  await b.create({ parentId: '1', title: 'Delta', url: 'https://delta.test/' })
  return { work: work.id }
})
await page.waitForTimeout(200)
const tile = (href: string) => page.locator(`a[href="${href}"]`).first()
const step = async (name: string, fn: () => Promise<void>) => {
  await fn()
  console.log('✓', name)
}

await step('renders seeded bookmarks from live tree', async () => {
  await tile('https://alpha.test/').waitFor()
  assert.equal(await page.locator('h1').textContent(), 'All bookmarks')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'list')
})

await step('edit title and URL', async () => {
  await tile('https://beta.test/').click({ button: 'right' })
  await page.keyboard.press('e')
  await page.getByLabel('Name').fill('Beta 2')
  await page.getByLabel('URL').fill('beta2.test')
  await page.getByRole('button', { name: 'Save' }).click()
  await tile('https://beta2.test/').waitFor()
  assert.equal(await tile('https://beta2.test/').locator('.font-medium').textContent(), 'Beta 2')
})

await step('delete + undo restores the bookmark in place', async () => {
  await tile('https://alpha.test/').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByText('Deleted “Alpha”').waitFor()
  await tile('https://alpha.test/').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Undo' }).click()
  await tile('https://alpha.test/').waitFor()
  assert.deepEqual(await order(page, folders.work), ['Alpha', 'Beta 2', 'Gamma'])
})

await step('drag to reorder within a folder', async () => {
  await tile('https://gamma.test/').dragTo(tile('https://alpha.test/'))
  await page.waitForTimeout(200)
  assert.deepEqual(await order(page, folders.work), ['Gamma', 'Alpha', 'Beta 2'])
})

await step('drag onto a sidebar folder moves it', async () => {
  await tile('https://delta.test/').dragTo(page.locator('nav [role=button]', { hasText: 'Work' }))
  await page.waitForTimeout(200)
  assert.equal((await tree(page))['Delta'], '/Bookmarks bar/Work')
})

await step('move via context submenu', async () => {
  await tile('https://delta.test/').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to' }).hover()
  await page.getByRole('menuitem', { name: 'Other bookmarks' }).click()
  await page.waitForTimeout(200)
  assert.equal((await tree(page))['Delta'], '/Other bookmarks')
})

await step('pin puts a bookmark first', async () => {
  await tile('https://beta2.test/').click({ button: 'right' })
  await page.keyboard.press('p')
  await page.waitForTimeout(100)
  const first = await page.locator('section', { hasText: 'Work' }).locator('a').first().getAttribute('href')
  assert.equal(first, 'https://beta2.test/')
})

await step('hide removes it from the page and settings can unhide', async () => {
  await tile('https://gamma.test/').click({ button: 'right' })
  await page.keyboard.press('h')
  await tile('https://gamma.test/').waitFor({ state: 'detached' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Unhide' }).click()
  await page.keyboard.press('Escape')
  await tile('https://gamma.test/').waitFor()
})

await step('new folder, rename, delete folder with confirm', async () => {
  await page.locator('nav [role=button]', { hasText: 'Bookmarks bar' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'New folder…' }).click()
  await page.getByLabel('Name').fill('Temp')
  await page.getByRole('button', { name: 'Save' }).click()
  const row = page.locator('nav [role=button]', { hasText: 'Temp' })
  await row.waitFor()
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await page.getByLabel('Name').fill('Temp 2')
  await page.getByRole('button', { name: 'Save' }).click()
  const row2 = page.locator('nav [role=button]', { hasText: 'Temp 2' })
  await row2.waitFor()
  await row2.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete folder' }).click()
  await row2.waitFor({ state: 'detached' })
})

await step('arrow keys move focus, Delete removes with undo', async () => {
  await page.locator('nav [role=button]', { hasText: 'All bookmarks' }).click()
  await page.locator('body').click({ position: { x: 700, y: 880 } })
  await page.keyboard.press('ArrowDown')
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('href'))
  const first = await focused()
  assert.ok(first)
  await page.keyboard.press('ArrowDown')
  const second = await focused()
  assert.ok(second && second !== first)
  await page.keyboard.press('Delete')
  await page.getByText(/^Deleted “/).waitFor()
  await tile(second!).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Undo' }).click()
  await tile(second!).waitFor()
})

await step('paste a URL opens a prefilled new bookmark', async () => {
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'epsilon.test/path')
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))
  })
  assert.equal(await page.getByLabel('URL').inputValue(), 'https://epsilon.test/path')
  assert.equal(await page.getByLabel('Name').inputValue(), 'epsilon.test')
  await page.getByRole('button', { name: 'Save' }).click()
  await tile('https://epsilon.test/path').waitFor()
})

await step('warm-up adds dns-prefetch only when enabled', async () => {
  const hints = () => page.locator('link[rel=dns-prefetch]').count()
  await tile('https://alpha.test/').hover()
  await page.waitForTimeout(150)
  assert.equal(await hints(), 0)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Warm up links on hover/ }).click()
  await page.keyboard.press('Escape')
  await tile('https://beta2.test/').hover()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('link[rel=dns-prefetch][href="https://beta2.test"]').count(), 1)
})

await step('cleanup removes duplicates with undo', async () => {
  await page.evaluate(() =>
    chrome.bookmarks.create({ parentId: '2', title: 'Alpha copy', url: 'https://www.alpha.test' }),
  )
  const row = page.locator('nav [role=button]', { hasText: 'Cleanup' })
  await row.click()
  assert.equal(await page.locator('h1').textContent(), 'Cleanup')
  await page.getByRole('button', { name: 'Remove 1 extra copy' }).click()
  await page.getByText('Deleted 1 bookmark').waitFor()
  assert.equal((await tree(page))['Alpha copy'], undefined)
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(300)
  assert.equal((await tree(page))['Alpha copy'], '/Other bookmarks')
})

await step('narrow width centers content', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Narrow' }).click()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 2000, height: 900 })
  const w = await page
    .locator('main .wrap')
    .last()
    .evaluate((el) => el.getBoundingClientRect().width)
  assert.ok(w <= 1200, `wrap is ${w}px`)
  await page.setViewportSize({ width: 1400, height: 900 })
})

await step('palette search opens folder', async () => {
  await page.keyboard.press('Control+k')
  await page.keyboard.type('work')
  await page.getByRole('option', { name: /Work/ }).first().waitFor()
  await page.getByRole('option').filter({ hasText: 'Bookmarks bar' }).filter({ hasText: 'Work' }).click()
  assert.equal(await page.locator('h1').textContent(), 'Work')
})

await step('settings persist across reload', async () => {
  await page.getByRole('radio', { name: 'Tiles' }).click()
  await page.reload()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'tiles')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.width), 'narrow')
  assert.equal(await page.locator('h1').textContent(), 'Work')
})

assert.deepEqual(errors, [])
console.log('all flows passed')
await ctx.close()
