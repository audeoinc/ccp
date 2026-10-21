// 素材(Creative Assets。X58)の見本を作る・消す(利用者の依頼 2026-10-21: 本番の配信カードに、素材の見本を入れたい)。
// ⚙ のメニューから、利用者が本番の画面で押す(本番の DB・API には、画面の窓口からだけ書く)。
// 画像は、この画面の中で図形を描いて作る(著作物・実在の人物・ブランドは使わない)。PDF も、この画面で文字だけのものを作る。
// URL は、だれでも見られる公開のページ。名前の先頭を「見本:」にして、あとで見本だけを消せるようにする
import { CardAssetsService } from './data/cardAssets'
import { CreativeFiles } from './data/creativeFiles'
import { ProductionRequestsService } from './data/productionRequests'
import { tr } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import { statusRank } from './status'

/** 見本の印(名前の先頭) */
export const ASSET_SAMPLE_PREFIX = '見本:'
const isSample = (name?: string) => !!name && name.startsWith(ASSET_SAMPLE_PREFIX)

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void

/** 図形を描いて PNG のファイルにする */
async function png(name: string, w: number, h: number, draw: Draw): Promise<File> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g, w, h)
  const blob = await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error('PNG を作れませんでした'))), 'image/png'))
  return new File([blob], name, { type: 'image/png' })
}

const label = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 28, color = '#ffffff') => {
  g.fillStyle = color
  g.font = `600 ${size}px sans-serif`
  g.fillText(text, x, y)
}

// ムードボード: 秋の色の重なり(葉の形を抽象化した楕円)
const mood: Draw = (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#f3dfc4')
  bg.addColorStop(1, '#d99a5b')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  const colors = ['#b5452a', '#d9822b', '#e8b04a', '#6f7d3c', '#8c2f2f']
  for (let i = 0; i < 26; i++) {
    g.save()
    g.translate(((i * 137) % w) + 20, ((i * 89) % h) + 10)
    g.rotate((i * 37 * Math.PI) / 180)
    g.fillStyle = colors[i % colors.length]
    g.globalAlpha = 0.85
    g.beginPath()
    g.ellipse(0, 0, 38, 16, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  g.fillStyle = 'rgba(40, 24, 12, 0.55)'
  g.fillRect(0, h - 90, w, 90)
  label(g, 'MOOD: warm autumn layers', 36, h - 36, 34)
}

// 色の指定: 使ってほしい色の見本と、色の番号
const palette: Draw = (g, w, h) => {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w, h)
  const sw = [
    ['#8c2f2f', 'Brick'],
    ['#d9822b', 'Pumpkin'],
    ['#e8b04a', 'Mustard'],
    ['#6f7d3c', 'Olive'],
    ['#3b3a36', 'Charcoal'],
  ]
  const cw = w / sw.length
  sw.forEach(([c, n], i) => {
    g.fillStyle = c
    g.fillRect(i * cw, 0, cw, h - 110)
    label(g, n, i * cw + 18, h - 66, 26, '#222222')
    label(g, c.toUpperCase(), i * cw + 18, h - 30, 22, '#666666')
  })
}

// レイアウトのラフ: メイン画像・見出し・2 列の商品・ボタンの線画
const layout: Draw = (g, w, h) => {
  g.fillStyle = '#fafafa'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#555555'
  g.lineWidth = 3
  g.setLineDash([10, 8])
  const pad = 40
  g.strokeRect(pad, pad, w - pad * 2, h * 0.36)
  g.beginPath()
  g.moveTo(pad, pad)
  g.lineTo(w - pad, pad + h * 0.36)
  g.moveTo(w - pad, pad)
  g.lineTo(pad, pad + h * 0.36)
  g.stroke()
  g.setLineDash([])
  g.fillStyle = '#555555'
  g.fillRect(w * 0.25, h * 0.45, w * 0.5, 18)
  g.fillRect(w * 0.32, h * 0.49, w * 0.36, 10)
  const top = h * 0.55
  const cw = (w - pad * 3) / 2
  for (let i = 0; i < 2; i++) g.strokeRect(pad + i * (cw + pad), top, cw, h * 0.26)
  g.fillStyle = '#222222'
  g.beginPath()
  g.roundRect(w * 0.35, h * 0.86, w * 0.3, 44, 22)
  g.fill()
  label(g, 'SHOP NOW', w * 0.43, h * 0.86 + 30, 20)
  label(g, 'Layout sketch', pad, h - 12, 20, '#888888')
}

/** 文字だけの PDF(1 ページ。日本語のフォントを埋め込まないので、英語で書く) */
function pdf(name: string, lines: string[]): File {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const body = ['BT', '/F1 22 Tf', '72 760 Td', `(${esc(lines[0])}) Tj`, '/F1 12 Tf', ...lines.slice(1).flatMap((l) => ['0 -24 Td', `(${esc(l)}) Tj`]), 'ET'].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new File([out], name, { type: 'application/pdf' })
}

interface Item {
  name: string
  note: string
  file?: () => Promise<File> | File
  url?: string
}

const ITEMS = (): Item[][] => [
  [
    { name: `${ASSET_SAMPLE_PREFIX} ムードボード(秋の色)`, note: tr('この雰囲気で。暖かい色を重ねて、落ち着いた印象に', 'This mood: warm layered colors, calm feel'), file: () => png('mood.png', 1200, 800, mood) },
    { name: `${ASSET_SAMPLE_PREFIX} 色の指定`, note: tr('メイン画像とボタンは、この 5 色の中で', 'Keep the hero and buttons within these 5 colors'), file: () => png('palette.png', 1200, 500, palette) },
    { name: `${ASSET_SAMPLE_PREFIX} レイアウトのラフ`, note: tr('メイン画像の下に見出し、商品は 2 列、ボタンは 1 つ', 'Headline under the hero, products in 2 columns, one button'), file: () => png('layout.png', 800, 1100, layout) },
    {
      name: `${ASSET_SAMPLE_PREFIX} 制作の補足(PDF)`,
      note: tr('文字の大きさと余白の補足', 'Notes on type size and spacing'),
      file: () => pdf('brief.pdf', ['Sample brief (for testing)', 'Headline: 1 line, large, centered.', 'Body text: at least 14px, high contrast.', 'Buttons: one primary action, dark fill.', 'Keep generous white space around products.']),
    },
    { name: `${ASSET_SAMPLE_PREFIX} 参考ページ: 見やすいデザインのヒント(W3C)`, note: tr('文字と背景の差、ボタンの分かりやすさの参考に', 'For contrast and clear buttons'), url: 'https://www.w3.org/WAI/tips/designing/' },
    { name: `${ASSET_SAMPLE_PREFIX} 参考の写真: 秋(Wikimedia Commons)`, note: tr('自由に使える写真の一覧。雰囲気の参考に', 'Freely licensed photos, for mood reference'), url: 'https://commons.wikimedia.org/wiki/Category:Autumn' },
  ],
  [
    { name: `${ASSET_SAMPLE_PREFIX} ムードボード(秋の色)`, note: tr('前回と同じ色味で', 'Same tones as last time'), file: () => png('mood.png', 1200, 800, mood) },
    { name: `${ASSET_SAMPLE_PREFIX} レイアウトのラフ`, note: tr('商品は 2 列で 4 点', '4 products in 2 columns'), file: () => png('layout.png', 800, 1100, layout) },
    { name: `${ASSET_SAMPLE_PREFIX} 参考ページ: 見やすいデザインのヒント(W3C)`, note: '', url: 'https://www.w3.org/WAI/tips/designing/' },
  ],
  [
    { name: `${ASSET_SAMPLE_PREFIX} 色の指定`, note: tr('この 5 色の中で', 'Within these 5 colors'), file: () => png('palette.png', 1200, 500, palette) },
    {
      name: `${ASSET_SAMPLE_PREFIX} 制作の補足(PDF)`,
      note: '',
      file: () => pdf('brief.pdf', ['Sample brief (for testing)', 'Use the color palette attached.', 'One primary button only.']),
    },
  ],
]

/** 見本を入れる配信: 制作の依頼のある配信を先に、なければ承認済み、それもなければ配信日の近いもの。取りやめた配信は除く */
async function targets(cards: DeliveryCard[]): Promise<DeliveryCard[]> {
  const live = cards.filter((c) => !c.cancelled_at)
  const r = await ProductionRequestsService.getAll()
  const requested = new Set((r.success ? (r.data ?? []) : []).map((x) => x.delivery_card_id).filter(Boolean))
  const now = Date.now()
  const near = (c: DeliveryCard) => Math.abs(new Date(c.scheduled_at ?? 0).getTime() - now)
  const pick = [
    ...live.filter((c) => requested.has(c.id)).sort((a, b) => near(a) - near(b)),
    ...live.filter((c) => !requested.has(c.id) && statusRank(c.status) >= statusRank('approved')).sort((a, b) => near(a) - near(b)),
    ...live.filter((c) => !requested.has(c.id) && statusRank(c.status) < statusRank('approved')).sort((a, b) => near(a) - near(b)),
  ]
  return pick.slice(0, 3)
}

/** 見本を作る。入れた配信の名前と件数を返す */
export async function createAssetExamples(args: { cards: DeliveryCard[]; me: string }): Promise<{ cards: string[]; count: number }> {
  const list = await targets(args.cards)
  if (list.length === 0) throw new Error(tr('見本を入れる配信がありません', 'No delivery to add the samples to'))
  const sets = ITEMS()
  let count = 0
  for (let i = 0; i < list.length; i++) {
    const card = list[i]
    for (const it of sets[i] ?? []) {
      let fields: Record<string, unknown> = { kind: 'url', url: it.url }
      if (it.file) {
        const f = await it.file()
        const up = await CreativeFiles.upload(f)
        fields = { kind: 'file', file_name: f.name, stored: up.stored, content_type: up.contentType, size: up.size }
      }
      const res = await CardAssetsService.create({ name: it.name, note: it.note, added_by: args.me, delivery_card_id: card.id, ...fields })
      if (!res.success) throw new Error(res.error?.message ?? tr('見本を保存できませんでした', 'Could not save a sample'))
      count++
    }
  }
  return { cards: list.map((c) => c.name ?? ''), count }
}

/** 見本だけを消す(名前の先頭が「見本:」の素材と、そのファイル) */
export async function removeAssetExamples(): Promise<number> {
  const r = await CardAssetsService.getAll()
  const rows = (r.success ? (r.data ?? []) : []).filter((a) => isSample(a.name))
  for (const a of rows) {
    await CardAssetsService.delete(a.id)
    if (a.stored) await CreativeFiles.remove(a.stored)
  }
  return rows.length
}

/** いまある見本の数 */
export async function countAssetExamples(): Promise<number> {
  const r = await CardAssetsService.getAll()
  return (r.success ? (r.data ?? []) : []).filter((a) => isSample(a.name)).length
}
