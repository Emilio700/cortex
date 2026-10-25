// Laminilla sintética tipo H&E (hematoxilina-eosina) generada en canvas, sin archivos externos.

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export async function syntheticSlide(S = 4096): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = rng(7)
  const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`
  const pause = () => new Promise((res) => setTimeout(res))

  // vidrio + borde de tejido irregular
  g.fillStyle = '#f7f3f6'
  g.fillRect(0, 0, S, S)
  g.save()
  g.beginPath()
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2
    const rad = S * (0.44 + 0.04 * Math.sin(a * 3) + 0.02 * Math.sin(a * 7 + 1) + 0.01 * (r() - 0.5))
    const x = S / 2 + Math.cos(a) * rad, y = S / 2 + Math.sin(a) * rad
    k ? g.lineTo(x, y) : g.moveTo(x, y)
  }
  g.closePath()
  g.clip()
  g.fillStyle = hsl(335, 55, 84)
  g.fillRect(0, 0, S, S)

  // fibras de colágeno (estroma eosinófilo)
  g.lineCap = 'round'
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, a = Math.sin(x / 600) + Math.cos(y / 500) + r() * 0.6, len = 40 + r() * 160
    g.strokeStyle = hsl(330 + r() * 15, 50 + r() * 25, 68 + r() * 16, 0.35)
    g.lineWidth = 2 + r() * 6
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
    g.stroke()
  }
  await pause()

  const nucleus = (x: number, y: number, rx: number, ry: number, rot: number, l = 30) => {
    g.fillStyle = hsl(265 + r() * 20, 40 + r() * 20, l + r() * 12, 0.85)
    g.beginPath()
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    g.fill()
    if (r() < 0.5) {
      g.fillStyle = hsl(270, 50, 18, 0.7) // nucléolo / cromatina
      g.beginPath()
      g.arc(x + (r() - 0.5) * rx, y + (r() - 0.5) * ry, Math.max(1, rx * 0.25), 0, Math.PI * 2)
      g.fill()
    }
  }

  // tejido adiposo (vacuolas blancas)
  for (let k = 0; k < 4; k++) {
    const cx = S * (0.2 + r() * 0.6), cy = S * (0.2 + r() * 0.6)
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 380
      g.fillStyle = '#fbf7f9'
      g.strokeStyle = hsl(335, 45, 70)
      g.lineWidth = 3
      g.beginPath()
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 25 + r() * 25, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
  }

  // glándulas: luz + epitelio + núcleos basales
  for (let k = 0; k < 70; k++) {
    const cx = S * (0.1 + r() * 0.8), cy = S * (0.1 + r() * 0.8)
    const a = 60 + r() * 120, b = 40 + r() * 90, rot = r() * Math.PI
    g.fillStyle = hsl(320, 45, 72)
    g.beginPath()
    g.ellipse(cx, cy, a + 28, b + 28, rot, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#fbf3f7'
    g.beginPath()
    g.ellipse(cx, cy, a, b, rot, 0, Math.PI * 2)
    g.fill()
    const n = Math.round((a + b) / 4)
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      const ex = (a + 20) * Math.cos(t), ey = (b + 20) * Math.sin(t)
      const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot), y = cy + ex * Math.sin(rot) + ey * Math.cos(rot)
      nucleus(x, y, 6 + r() * 3, 10 + r() * 4, t + rot, 32)
    }
    if (k % 6 === 0) await pause()
  }

  // vasos con eritrocitos
  for (let k = 0; k < 30; k++) {
    const cx = r() * S, cy = r() * S, rad = 30 + r() * 50
    g.strokeStyle = hsl(330, 50, 60)
    g.lineWidth = 8
    g.beginPath()
    g.arc(cx, cy, rad, 0, Math.PI * 2)
    g.stroke()
    for (let i = 0; i < rad / 2; i++) {
      const a = r() * Math.PI * 2, d = r() * (rad - 8)
      g.fillStyle = hsl(352, 75, 52, 0.9)
      g.beginPath()
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5, 0, Math.PI * 2)
      g.fill()
    }
  }

  // núcleos estromales e infiltrado inflamatorio (zonas densas)
  const foci = Array.from({ length: 8 }, () => [S * (0.15 + r() * 0.7), S * (0.15 + r() * 0.7)])
  for (let i = 0; i < 40000; i++) {
    let x: number, y: number
    if (r() < 0.35) {
      const f = foci[i % foci.length], a = r() * Math.PI * 2, d = Math.abs(r() + r() - 1) * 260
      x = f[0] + Math.cos(a) * d
      y = f[1] + Math.sin(a) * d
      nucleus(x, y, 4 + r() * 2, 4 + r() * 2, 0, 22) // linfocitos redondos
    } else {
      x = r() * S
      y = r() * S
      nucleus(x, y, 2.5 + r() * 2, 7 + r() * 6, Math.sin(x / 600) + Math.cos(y / 500), 30) // fibroblastos fusiformes
    }
    if (i % 8000 === 0) await pause()
  }
  g.restore()
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar la imagen'))), 'image/jpeg', 0.9))
}
