import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const size of [16, 32, 48, 96, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log('icons written to public/icon/')
