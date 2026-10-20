// 外部広告の出稿の見本(撮影・デモ用。X49)。サーバーの server/ccp/ads.py と同じ考え方で作る:
// 商品の 4 割ほどを出稿し、1〜3 の媒体で、7〜21 日の出稿と休みを繰り返す(過去 150 日)。乱数は商品ごとに決まった種
import type { Row } from './seed'

const MEDIA: Record<string, [number, number, number, number]> = {
  google_shopping: [0.012, 0.55, 60, 0.025],
  google_search: [0.035, 1.1, 110, 0.03],
  meta: [0.009, 0.7, 75, 0.012],
  tiktok: [0.006, 0.45, 50, 0.008],
}

// 決まった種から作る乱数(mulberry32)
function rand(seedText: string) {
  let h = 2166136261
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function sampleAds(products: Row[], today = new Date(), days = 150): Row[] {
  const out: Row[] = []
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)
  for (const p of products) {
    const code = String(p.product_code ?? '')
    const market = String(p.market ?? 'JP')
    if (!code) continue
    const r = rand(`${market}:${code}`)
    if (r() > 0.4) continue
    const price = Number(p.price ?? (market === 'US' ? 80 : 9000))
    const names = Object.keys(MEDIA).sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 3))
    for (const m of names) {
      const [ctr, cpcUs, cpcJp, cvr] = MEDIA[m]
      const cpc = market === 'US' ? cpcUs : cpcJp
      let d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(r() * 21))
      while (d <= today) {
        const run = 7 + Math.floor(r() * 15)
        for (let i = 0; i < run; i++) {
          const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
          if (day > today) break
          const imps = Math.floor(800 + r() * 5200)
          const clicks = Math.max(0, Math.floor(imps * ctr * (0.6 + r() * 0.8)))
          let conv = 0
          for (let k = 0; k < clicks; k++) if (r() < cvr) conv++
          out.push({
            id: `ad-${market}-${code}-${m}-${iso(day)}`,
            date: iso(day),
            market,
            product_code: code,
            media: m,
            campaign: `${m}-${code}-${iso(d)}`,
            impressions: imps,
            clicks,
            spend: Math.round(clicks * cpc * (0.8 + r() * 0.4) * 100) / 100,
            conversions: conv,
            revenue: Math.round(conv * price * 100) / 100,
          })
        }
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + run + 5 + Math.floor(r() * 26))
      }
    }
  }
  return out
}
