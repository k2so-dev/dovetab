import { browser } from 'wxt/browser'

export { browser }

export const isFirefox = import.meta.env.FIREFOX

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl+'

export function chromeFavicon(pageUrl: string, size = 64): string {
  return `/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`
}

export interface Perm {
  permissions?: string[]
  origins?: string[]
}

export async function hasPermission(p: Perm): Promise<boolean> {
  try {
    return (await browser.permissions.contains(p as never)) as boolean
  } catch {
    return false
  }
}

export async function requestPermission(p: Perm): Promise<boolean> {
  try {
    return (await browser.permissions.request(p as never)) as boolean
  } catch {
    return false
  }
}

export function webSearch(text: string, newTab: boolean) {
  const disposition = newTab ? 'NEW_TAB' : 'CURRENT_TAB'
  const s = browser.search as unknown as {
    query?: (o: { text: string; disposition: string }) => Promise<void>
    search?: (o: { query: string; disposition: string }) => Promise<void>
  }
  if (s.query) return s.query({ text, disposition })
  return s.search?.({ query: text, disposition })
}

export async function openUrl(url: string, where: 'current' | 'tab' | 'window' | 'incognito' | 'background') {
  switch (where) {
    case 'current':
      return void (await browser.tabs.update({ url }))
    case 'tab':
      return void (await browser.tabs.create({ url, active: true }))
    case 'background':
      return void (await browser.tabs.create({ url, active: false }))
    case 'window':
      return void (await browser.windows.create({ url }))
    case 'incognito':
      return void (await browser.windows.create({ url, incognito: true }))
  }
}

export async function openMany(urls: string[], where: 'tab' | 'window' | 'incognito' | 'group') {
  if (!urls.length) return
  if (where === 'window' || where === 'incognito') {
    await browser.windows.create({ url: urls, incognito: where === 'incognito' })
    return
  }
  const tabs = await Promise.all(urls.map((url) => browser.tabs.create({ url, active: false })))
  if (where === 'group' && !isFirefox) {
    const ids = tabs.map((t) => t.id).filter((id): id is number => id != null)
    if (ids.length) await browser.tabs.group({ tabIds: ids as [number, ...number[]] })
  }
}

export async function dropPermission(p: Perm) {
  try {
    await browser.permissions.remove(p as never)
  } catch {}
}
