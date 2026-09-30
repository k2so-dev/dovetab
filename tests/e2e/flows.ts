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

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'dovetab-')), {
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
  assert.equal(await page.locator('nav [role=button]', { hasText: 'Cleanup' }).count(), 1)
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
  assert.equal(await tile('https://beta2.test/').locator('i.pin').isVisible(), true)
  assert.equal(await tile('https://alpha.test/').locator('i.pin').isVisible(), false)
})

await step('hover shows one floating more button that opens the menu', async () => {
  assert.equal(await page.locator('button[data-more]').count(), 1)
  await tile('https://alpha.test/').hover()
  const more = page.locator('button[data-more]')
  await more.waitFor()
  const a = (await tile('https://alpha.test/').boundingBox())!
  const m = (await more.boundingBox())!
  assert.ok(m.x > a.x + a.width / 2 && m.x + m.width <= a.x + a.width && m.y >= a.y && m.y + m.height <= a.y + a.height)
  await more.click()
  await page.getByRole('menuitem', { name: 'Delete' }).waitFor()
  await page.keyboard.press('Escape')
  await page.mouse.move(5, 5)
  await more.waitFor({ state: 'hidden' })
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
  assert.ok(w <= 1360, `wrap is ${w}px`)
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

await step('custom sidebar title, tab title stays New Tab', async () => {
  const brand = page.locator('aside').getByText('Dovetab', { exact: true })
  await brand.waitFor()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByPlaceholder('Dovetab').fill('My links')
  await page.keyboard.press('Escape')
  await page.locator('aside').getByText('My links', { exact: true }).waitFor()
  await page.reload()
  await page.locator('aside').getByText('My links', { exact: true }).waitFor()
  assert.equal(await page.title(), 'New Tab')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByPlaceholder('Dovetab').fill('')
  await page.keyboard.press('Escape')
  await brand.waitFor()
})

await step('show icons off hides icons but keeps the glow', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Show icons/ }).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.icons), 'off')
  const row = tile('https://alpha.test/')
  assert.equal(await row.locator('.ico').isVisible(), false)
  assert.equal(await row.locator('img').getAttribute('src'), null)
  assert.match((await row.locator('.glow-tile, .glow-row').getAttribute('style')) ?? '', /--c/)
  await page.reload()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.icons), 'off')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Show icons/ }).click()
  await page.keyboard.press('Escape')
  await row.locator('.ico').waitFor()
})

await step('cached history visits render in the first frame', async () => {
  await page.evaluate(async () => {
    localStorage.setItem('dovetab:visits', JSON.stringify([['https://alpha.test/', [3, Date.now() - 5 * 36e5]]]))
    const { settings } = (await chrome.storage.sync.get('settings')) as { settings: object }
    await chrome.storage.sync.set({ settings: { ...settings, history: true, density: 'list' } })
  })
  await page.locator('nav [role=button]', { hasText: 'All bookmarks' }).click()
  await page.reload()
  const meta = tile('https://alpha.test/').locator('.font-mono')
  assert.match((await meta.textContent({ timeout: 500 })) ?? '', /5h ago/)
  await page.waitForFunction(() => !localStorage.getItem('dovetab:visits'), null, { timeout: 5000 })
  await page.evaluate(async () => {
    const { settings } = (await chrome.storage.sync.get('settings')) as { settings: object }
    await chrome.storage.sync.set({ settings: { ...settings, history: false } })
  })
})

await step('recently visited pages lead All bookmarks when enabled', async () => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(() => {
    const now = Date.now()
    type Api = { permissions: { contains: unknown }; history: unknown }
    const g = globalThis as unknown as { chrome: Api; browser?: Api }
    for (const c of [g.chrome, g.browser]) {
      if (!c) continue
      c.permissions.contains = async () => true
      c.history = {
        search: async () => [
          { url: 'https://visited-a.test/', title: 'Visited A', lastVisitTime: now - 60e3, visitCount: 1 },
          { url: 'chrome://settings/', title: 'Settings', lastVisitTime: now - 50e3, visitCount: 1 },
          { url: 'https://visited-b.test/page', title: '', lastVisitTime: now - 3 * 36e5, visitCount: 2 },
        ],
      }
    }
  })
  await p.goto(`chrome-extension://${id}/newtab.html`)
  await p.evaluate(async () => {
    const { settings } = (await chrome.storage.sync.get('settings')) as { settings: object }
    await chrome.storage.sync.set({ settings: { ...settings, history: true, recent: true, density: 'list' } })
  })
  await p.locator('nav [role=button]', { hasText: 'All bookmarks' }).click()
  await p.reload()
  const first = p.locator('section').first()
  assert.match((await first.textContent({ timeout: 500 })) ?? '', /Recently visited/)
  const rows = first.locator('a[data-bid]')
  assert.deepEqual(await rows.evaluateAll((as) => as.map((a) => a.getAttribute('href'))), [
    'https://visited-a.test/',
    'https://visited-b.test/page',
  ])
  assert.match((await rows.nth(1).textContent()) ?? '', /visited-b\.test[\s\S]*3h ago/)
  await rows.first().click({ button: 'right' })
  assert.equal(await p.locator('[role=menu]').count(), 0)
  await p.evaluate(async () => {
    const { settings } = (await chrome.storage.sync.get('settings')) as { settings: object }
    await chrome.storage.sync.set({ settings: { ...settings, recent: false } })
  })
  await p.getByText('Recently visited').waitFor({ state: 'detached' })
  await p.evaluate(async () => {
    const { settings } = (await chrome.storage.sync.get('settings')) as { settings: object }
    await chrome.storage.sync.set({ settings: { ...settings, history: false } })
  })
  await p.close()
})

await step('site icons render from one atlas on the next open', async () => {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    g.fillStyle = '#e11d48'
    g.fillRect(0, 0, 32, 32)
    return c.toDataURL('image/png').split(',')[1]!
  })
  await ctx.route(/^http:\/\/ico\d\.test\//, (r) =>
    r.request().url().endsWith('/i.png')
      ? r.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') })
      : r.fulfill({ contentType: 'text/html', body: '<link rel=icon href=/i.png><title>x</title>' }),
  )
  const v = await ctx.newPage()
  for (let i = 0; i < 3; i++) {
    await v.goto(`http://ico${i}.test/`)
    await v.waitForTimeout(300)
  }
  await v.close()
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++)
      await chrome.bookmarks.create({ parentId: '1', title: `Ico ${i}`, url: `http://ico${i}.test/` })
  })
  await page.reload()
  await page.waitForFunction(() => localStorage.getItem('dovetab:atlas'), null, { timeout: 15000 })
  const favicons: string[] = []
  page.on('request', (r) => r.url().includes('/_favicon/') && favicons.push(r.url()))
  await page.reload()
  const row = tile('http://ico1.test/')
  assert.equal(await row.locator('.ico.atl').count(), 1)
  assert.match((await row.locator('.ico').getAttribute('style')) ?? '', /--p/)
  assert.ok(!favicons.some((u) => u.includes('ico1.test')), favicons.join())
  page.removeAllListeners('request')
})

await step('falls back to letters when the browser has no favicon endpoint', async () => {
  await page.evaluate(() => {
    localStorage.setItem('dovetab:nofavicon', String(Date.now()))
    localStorage.removeItem('dovetab:atlas')
  })
  const favicons: string[] = []
  page.on('request', (r) => r.url().includes('/_favicon/') && favicons.push(r.url()))
  await page.reload()
  await tile('https://alpha.test/').waitFor()
  await page.waitForTimeout(300)
  assert.deepEqual(favicons, [])
  assert.equal(((await tile('https://alpha.test/').locator('.ico').textContent()) ?? '').trim(), 'A')
  page.removeAllListeners('request')
  await page.evaluate(() => localStorage.removeItem('dovetab:nofavicon'))
})

const snapshotTree = () =>
  page.evaluate(async () => {
    const walk = (n: Node): unknown => (n.url ? [n.title, n.url] : [n.title, (n.children ?? []).map(walk)])
    return ((await chrome.bookmarks.getTree()) as Node[]).map(walk)
  })

await step('sync file: export, import restores the tree, undo reverts', async () => {
  const before = await snapshotTree()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Export file…' }).click()
  await page.getByPlaceholder('New password for the file').fill('hunter2')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ])
  const file = join(mkdtempSync(join(tmpdir(), 'dovetab-sync-')), 'backup.dovetab')
  await download.saveAs(file)
  await page.evaluate(async () => {
    const b = chrome.bookmarks
    await b.create({ parentId: '1', title: 'Extra', url: 'https://extra.test/' })
    const [delta] = await b.search({ url: 'https://delta.test/' })
    await b.remove(delta!.id)
  })
  await page.getByRole('button', { name: 'Import file…' }).click()
  await page.getByPlaceholder('File password').fill('wrong')
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByText('Wrong key or password').waitFor()
  await page.getByPlaceholder('File password').fill('hunter2')
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByText(/^From Chrome/).waitFor()
  assert.match((await page.getByText(/new item/).textContent()) ?? '', /\+1 new item, −1 removed item/)
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByText('Synced from Chrome').waitFor()
  assert.deepEqual(await snapshotTree(), before)
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForFunction(async () => (await chrome.bookmarks.search({ url: 'https://extra.test/' })).length === 1)
  assert.equal((await page.evaluate(() => chrome.bookmarks.search({ url: 'https://delta.test/' }))).length, 0)
  await page.evaluate(async () => {
    const b = chrome.bookmarks
    const [extra] = await b.search({ url: 'https://extra.test/' })
    await b.remove(extra!.id)
    await b.create({ parentId: '1', title: 'Delta', url: 'https://delta.test/' })
  })
})

await step('sync key: upload and download through relays', async () => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(() => {
    const store = new Map<string, { id: string; pubkey: string; tags: string[][] }>()
    class Relay {
      onopen?: () => void
      onmessage?: (m: { data: string }) => void
      onerror?: () => void
      constructor() {
        setTimeout(() => this.onopen?.())
      }
      reply(m: unknown) {
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(m) }))
      }
      send(raw: string) {
        const d = JSON.parse(raw)
        if (d[0] === 'EVENT') {
          store.set(`${d[1].pubkey}:${d[1].tags.find((t: string[]) => t[0] === 'd')[1]}`, d[1])
          this.reply(['OK', d[1].id, true, ''])
        } else if (d[0] === 'REQ') {
          for (const e of store.values()) this.reply(['EVENT', d[1], e])
          this.reply(['EOSE', d[1]])
        }
      }
      close() {}
    }
    Object.assign(window, { WebSocket: Relay })
  })
  await p.goto(`chrome-extension://${id}/newtab.html`)
  const snap = () =>
    p.evaluate(async () => {
      const walk = (n: Node): unknown => (n.url ? [n.title, n.url] : [n.title, (n.children ?? []).map(walk)])
      return ((await chrome.bookmarks.getTree()) as Node[]).map(walk)
    })
  const before = await snap()
  await p.getByRole('button', { name: 'Settings' }).click()
  await p.getByPlaceholder('Dovetab').fill('Synced')
  await p.getByRole('button', { name: 'Create sync key' }).click()
  await p.getByRole('button', { name: 'Upload', exact: true }).click()
  await p.getByText('Uploaded to 4 relays').waitFor()
  await p.getByPlaceholder('Dovetab').fill('Changed')
  await p.evaluate(() => chrome.bookmarks.create({ parentId: '1', title: 'Extra 2', url: 'https://extra2.test/' }))
  await p.getByRole('button', { name: 'Download', exact: true }).click()
  await p.getByText(/−1 removed item, 1 setting/).waitFor()
  await p.getByRole('button', { name: 'Apply' }).click()
  await p.getByText('Synced from Chrome').waitFor()
  assert.deepEqual(await snap(), before)
  await p.getByRole('button', { name: 'Settings' }).click()
  assert.equal(await p.getByPlaceholder('Dovetab').inputValue(), 'Synced')
  await p.getByPlaceholder('Dovetab').fill('')
  await p.getByRole('button', { name: 'Forget' }).click()
  await p.close()
})

await step('sync file carries icons and colors', async () => {
  await page.reload()
  await tile('http://ico1.test/').waitFor()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Export file…' }).click()
  await page.getByPlaceholder('New password for the file').fill('pw')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ])
  const file = join(mkdtempSync(join(tmpdir(), 'dovetab-sync-')), 'icons.dovetab')
  await download.saveAs(file)
  await page.getByRole('button', { name: 'Clear icon cache' }).click()
  await page.getByRole('button', { name: 'Import file…' }).click()
  await page.getByPlaceholder('File password').fill('pw')
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByText(/\d+ icons?$/).waitFor()
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByText('Synced from Chrome').waitFor()
  const stored = await page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const r = indexedDB.open('dovetab-icons', 1)
        r.onsuccess = () => {
          const q = r.result.transaction('icons').objectStore('icons').getAllKeys()
          q.onsuccess = () => res(q.result.map(String))
        }
      }),
  )
  assert.ok(stored.includes('ico1.test'), stored.join())
  await page.waitForFunction(() => (localStorage.getItem('dovetab:colors') ?? '').includes('ico1.test'))
})

await step('cleanup count is in the first frame and dialogs load on demand', async () => {
  const p = await ctx.newPage()
  await p.goto(`chrome-extension://${id}/newtab.html`)
  await p.evaluate(async () => {
    for (const t of ['Twin', 'Twin copy'])
      await chrome.bookmarks.create({ parentId: '2', title: t, url: 'https://twin.test/' })
  })
  await p.waitForFunction(() => Number(localStorage.getItem('dovetab:cleanup')) > 0, null, { timeout: 8000 })
  const saved = await p.evaluate(() => localStorage.getItem('dovetab:cleanup'))
  const loaded: string[] = []
  p.on('request', (r) => loaded.push(r.url()))
  await p.reload()
  const row = p.locator('nav [role=button]', { hasText: 'Cleanup' })
  await row.waitFor()
  assert.ok((await row.textContent())!.includes(saved!))
  assert.ok((await p.evaluate(() => performance.now())) < 1500)
  await p.waitForTimeout(3500)
  assert.deepEqual(
    loaded.filter((u) => /Dialog|Palette/.test(u)),
    [],
  )
  await p.getByRole('button', { name: 'Settings' }).hover()
  await p.waitForTimeout(300)
  assert.ok(loaded.some((u) => u.includes('SettingsDialog')))
  await p.close()
})

await step('hidden tab drops offscreen sections after 5 minutes', async () => {
  await page.evaluate(async () => {
    const b = chrome.bookmarks
    for (let f = 0; f < 12; f++) {
      const dir = await b.create({ parentId: '2', title: `Bulk ${f}` })
      for (let i = 0; i < 30; i++)
        await b.create({ parentId: dir.id, title: `B${f}-${i}`, url: `https://b${f}-${i}.test/` })
    }
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.clock.install()
  await p.goto(`chrome-extension://${id}/newtab.html`)
  await p.getByRole('radio', { name: 'List' }).click()
  await p.locator('nav [role=button]', { hasText: 'All bookmarks' }).click()
  await p.locator('a[href="https://b0-0.test/"]').waitFor()
  const count = () => p.locator('a[data-bid]').count()
  for (let i = 0; i < 20; i++) await p.locator('main').evaluate((m) => m.scrollBy(0, 2000))
  await p.locator('a[href="https://b11-29.test/"]').waitFor()
  await p.locator('main').evaluate((m) => m.scrollTo(0, 0))
  const full = await count()
  await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await p.clock.fastForward('05:01')
  await p.waitForTimeout(100)
  const trimmed = await count()
  assert.ok(trimmed < full && trimmed >= 40, `${full} -> ${trimmed}`)
  await p.close()
})

assert.deepEqual(errors, [])
console.log('all flows passed')
await ctx.close()
