// T6(画像の説明)の見本の図を描く: 緑の長袖のニット(セーター)を、平らに置いて正面から見た形。
// 写真ではなく、このプログラムで塗った図なので、権利の心配がない(リポジトリには商品の写真を置かない)。
//   node make-sample-image.mjs   → images/t6-sample.png(512×512)
// 部品を足さずに描けるように、PNG は Node の zlib だけで組み立てる。

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const W = 512
const H = 512
const px = new Uint8Array(W * H * 3)
const set = (x, y, [r, g, b]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 3
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
}

// 点が多角形の中にあるか(偶奇の数え方)
const inside = (x, y, poly) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const BG = [244, 242, 238]
const GREEN = [46, 110, 74]
const DARK = [34, 86, 57]
const LIGHT = [62, 132, 92]

const body = [[176, 120], [336, 120], [344, 420], [168, 420]]
const leftSleeve = [[176, 120], [120, 150], [70, 360], [112, 372], [170, 210]]
const rightSleeve = [[336, 120], [392, 150], [442, 360], [400, 372], [342, 210]]
const collar = (x, y) => ((x - 256) / 46) ** 2 + ((y - 118) / 22) ** 2

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let c = BG
    const inBody = inside(x, y, body)
    const inSleeve = inside(x, y, leftSleeve) || inside(x, y, rightSleeve)
    if (inBody || inSleeve) {
      // 縦の編み目(ケーブル編みらしく見せる、細い縦じま)
      c = Math.floor(x / 6) % 2 === 0 ? GREEN : LIGHT
      // 裾と袖口のリブ(横の帯)
      if ((inBody && y > 396) || (inSleeve && y > 340 && !inBody)) c = DARK
    }
    // 丸首の襟: 外側を濃い帯、内側を背景に
    const k = collar(x, y)
    if (k < 1) c = k < 0.55 ? BG : DARK
    set(x, y, c)
  }
}

// PNG を組み立てる(色の形式 2 = RGB、各行の先頭に絞り込みの種類 0)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 2
const raw = Buffer.alloc(H * (W * 3 + 1))
for (let y = 0; y < H; y++) Buffer.from(px.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (W * 3 + 1) + 1)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'images', 't6-sample.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log(`書き出した: ${out}(${png.length} バイト)`)
