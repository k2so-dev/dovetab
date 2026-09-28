import { describe, expect, it } from 'vitest'
import { iconCandidates } from '@/core/favicon'

describe('iconCandidates', () => {
  it('orders declared icons by usefulness and resolves relative URLs', () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="icon" type="image/svg+xml" href="/icon.svg">
      <link rel="shortcut icon" href="https://cdn.example.com/f.ico">
      <link rel="stylesheet" href="/x.css">
    </head></html>`
    const c = iconCandidates(html, 'https://example.com/page')
    expect(c.map((x) => x.href)).toEqual([
      'https://example.com/icon.svg',
      'https://example.com/apple.png',
      'https://example.com/favicon-16.png',
      'https://cdn.example.com/f.ico',
    ])
  })

  it('returns nothing for pages without icons', () => {
    expect(iconCandidates('<p>hi</p>', 'https://example.com/')).toEqual([])
  })
})
