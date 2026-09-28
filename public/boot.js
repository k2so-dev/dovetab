try {
  var s = JSON.parse(localStorage.getItem('shelf:settings') || '{}')
  var d = document.documentElement.dataset
  d.theme = s.theme || 'system'
  d.glow = s.glow || 'subtle'
  d.density = s.density || 'list'
  d.width = s.width || 'full'
  d.icons = s.icons === false ? 'off' : 'on'
  var m = s.animations
  if (m == null) m = !matchMedia('(prefers-reduced-motion: reduce)').matches
  d.motion = m ? 'on' : 'off'
} catch (e) {}
