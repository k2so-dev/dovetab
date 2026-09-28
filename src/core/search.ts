export function matchScore(query: string, title: string, url: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return 0
  const t = title.toLowerCase()
  const u = url.toLowerCase().replace(/^[a-z]+:\/\/(www\.)?/, '')
  let total = 0
  for (const tok of tokens) {
    let s = 0
    const ti = t.indexOf(tok)
    if (ti === 0) s = 10
    else if (ti > 0) s = /[\s\-_./:([]/.test(t[ti - 1]!) ? 7 : 4
    const ui = u.indexOf(tok)
    if (ui === 0) s = Math.max(s, 8)
    else if (ui > 0) s = Math.max(s, 2)
    if (!s) return 0
    total += s
  }
  return total + 1 / (1 + t.length)
}
