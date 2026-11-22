// Generates public/icon-192.png and public/icon-512.png with no native dependencies.
// Draws a rounded dark square with a barbell. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [15, 23, 42]
const BAR = [226, 232, 240]
const PLATE = [56, 189, 248]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function icon(size) {
  const s = size
  const radius = s * 0.2
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, radius), s - radius)
    const cy = Math.min(Math.max(y, radius), s - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }
  const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1
  return png(s, (x, y) => {
    if (!inRounded(x + 0.5, y + 0.5)) return [0, 0, 0, 0]
    const u = x / s
    const v = y / s
    // bar
    if (rect(u, v, 0.14, 0.46, 0.86, 0.54)) return [...BAR, 255]
    // inner plates
    if (rect(u, v, 0.22, 0.30, 0.32, 0.70) || rect(u, v, 0.68, 0.30, 0.78, 0.70)) return [...PLATE, 255]
    // outer plates
    if (rect(u, v, 0.12, 0.36, 0.20, 0.64) || rect(u, v, 0.80, 0.36, 0.88, 0.64)) return [...PLATE, 255]
    return [...BG, 255]
  })
}

function adaptiveForeground(size) {
  // Android adaptive icons: 108dp canvas, content inside the central 72dp. Draw the icon at 66% in the middle.
  const inner = Math.round(size * 0.66)
  const offset = Math.round((size - inner) / 2)
  const s = inner
  const radius = s * 0.2
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, radius), s - radius)
    const cy = Math.min(Math.max(y, radius), s - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }
  const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1
  return png(size, (px, py) => {
    const x = px - offset
    const y = py - offset
    if (x < 0 || y < 0 || x >= s || y >= s || !inRounded(x + 0.5, y + 0.5)) return [0, 0, 0, 0]
    const u = x / s
    const v = y / s
    if (rect(u, v, 0.14, 0.46, 0.86, 0.54)) return [...BAR, 255]
    if (rect(u, v, 0.22, 0.30, 0.32, 0.70) || rect(u, v, 0.68, 0.30, 0.78, 0.70)) return [...PLATE, 255]
    if (rect(u, v, 0.12, 0.36, 0.20, 0.64) || rect(u, v, 0.80, 0.36, 0.88, 0.64)) return [...PLATE, 255]
    return [...BG, 255]
  })
}

if (process.argv.includes('--android')) {
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
  for (const [d, size] of Object.entries(densities)) {
    const dir = `android/app/src/main/res/mipmap-${d}`
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/ic_launcher.png`, icon(size))
    writeFileSync(`${dir}/ic_launcher_round.png`, icon(size))
    writeFileSync(`${dir}/ic_launcher_foreground.png`, adaptiveForeground(Math.round(size * 2.25)))
  }
  console.log('wrote Android launcher icons')
} else {
  mkdirSync('public', { recursive: true })
  writeFileSync('public/icon-192.png', icon(192))
  writeFileSync('public/icon-512.png', icon(512))
  console.log('wrote public/icon-192.png and public/icon-512.png')
}
