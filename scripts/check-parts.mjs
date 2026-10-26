// テンプレートの部品の、配信ごとの中身(src/partContent.ts。T8 段階 6。docs/TEMPLATE_OBJECTS.md の 6.1)が、例どおりに読み書き・描画されることを確かめる。
//   node scripts/check-parts.mjs   ← npm run verify に含まれる
// テンプレートで許していない部品を書き換えてしまう・保存した中身が描かれない、を防ぐ(配信の見た目が黙って変わるため)。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const part = (id, type, c, r, extra = {}) => ({ id, type, c, r, w: 1, h: 1, ...extra })
// 書き換えてよい: txt_a(既定)・med_a(swap)・btn_img(画像のボタン)。書き換えない: txt_b(overridable false)・med_b(swap なし)・btn_txt(文字のボタン)
const TEMPLATE = {
  id: 'parts-check',
  label: 'parts-check',
  description: '',
  hero: 'standard',
  heroTable: { kind: 'table', id: 'sec_hero', cols: 1, rows: 1, slots: 0, copy: false, parts: [part('txt_h', 'text', 0, 0, { text: 'ヒーローの下' })] },
  sections: [
    {
      kind: 'table',
      id: 'sec_a',
      cols: 3,
      rows: 2,
      slots: 1,
      parts: [
        part('txt_a', 'text', 0, 0, { text: 'テンプレートの文' }),
        part('txt_b', 'text', 1, 0, { text: '固定の文', overridable: false }),
        part('box_1', 'box', 2, 0),
        part('med_a', 'media', 0, 1, { src: '/img/a.png', alt: 'A', swap: true }),
        part('med_b', 'media', 1, 1, { src: '/img/b.png', alt: 'B' }),
        part('btn_img', 'button', 2, 1, { face: 'image', src: '/img/btn.png' }),
      ],
    },
    // ボタンの文言(段階 6 の続き): btn_t(文字。既定で書き換えてよい)・btn_n(書き換えない)・btn_b(画像の上に文字。文言と画像の両方)
    {
      kind: 'table',
      id: 'sec_b',
      cols: 3,
      rows: 1,
      slots: 0,
      parts: [part('btn_t', 'button', 0, 0, { label: 'もっと見る' }), part('btn_n', 'button', 1, 0, { label: '固定', overridable: false }), part('btn_b', 'button', 2, 0, { face: 'both', src: '/img/b2.png' })],
    },
  ],
}

const same = (problems, name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}: ${JSON.stringify(got)}(期待: ${JSON.stringify(want)})`)
}

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkParts(server) {
  const problems = []
  const tpl = await server.ssrLoadModule('/src/templates.ts')
  const pc = await server.ssrLoadModule('/src/partContent.ts')
  const snap = await server.ssrLoadModule('/src/productionSnapshot.ts')
  tpl.setCustomTemplates([TEMPLATE])
  const layout = tpl.getTemplate('parts-check')

  // 読む: 形の悪い値・危ない URL は捨て、部品の順は ID の順で書く
  const raw = JSON.stringify({ med_a: { src: 'javascript:alert(1)', alt: 'x' }, txt_a: { text: '新しい文', junk: 1 }, '': { text: 'x' }, med_b: 'x', btn_img: { src: '/api/creative/files/1', imageId: 'i1' } })
  const read = pc.parsePartContent(raw)
  same(problems, '読む', read, { med_a: { alt: 'x' }, txt_a: { text: '新しい文' }, btn_img: { src: '/api/creative/files/1', imageId: 'i1' } })
  same(problems, '書く(ID の順)', pc.encodePartContent(read), JSON.stringify({ btn_img: read.btn_img, med_a: read.med_a, txt_a: read.txt_a }))
  same(problems, '空は空文字', pc.encodePartContent({}), '')

  // 保存する分: 書き換えてよい部品の、その種類の項目だけ
  const all = { txt_a: { text: 'A', src: '/img/x.png' }, txt_b: { text: 'B' }, txt_h: { text: 'H' }, med_a: { src: '/img/new.png', imageId: 'n1', alt: '新', text: 'x' }, med_b: { src: '/img/nb.png' }, btn_img: { src: '/img/nbtn.png' }, gone_1: { text: 'x' } }
  same(problems, '保存する分', pc.prunePartContent(all, 'parts-check'), { txt_h: { text: 'H' }, txt_a: { text: 'A' }, med_a: { src: '/img/new.png', imageId: 'n1', alt: '新' }, btn_img: { src: '/img/nbtn.png' } })
  same(problems, '書き換えてよい部品', pc.rewritableParts(layout).map((p) => p.id), ['txt_h', 'txt_a', 'med_a', 'btn_img', 'btn_t', 'btn_b'])

  // ボタンの文言: 画像だけのボタンは文言を持たない・書き換えないボタンは使わない・画像の上に文字は文言と画像の両方
  const btns = { btn_t: { text: '新作を見る', src: '/img/x.png' }, btn_n: { text: 'x' }, btn_img: { text: 'x', src: '/img/n.png' }, btn_b: { text: '見る', src: '/img/nb.png' } }
  same(problems, 'ボタン: 保存する分', pc.prunePartContent(btns, 'parts-check'), { btn_img: { src: '/img/n.png' }, btn_t: { text: '新作を見る' }, btn_b: { text: '見る', src: '/img/nb.png' } })
  const effB = (id) => pc.effectivePart(pc.findPart(layout, id), btns)
  same(problems, 'ボタン: 描く(文言)', [effB('btn_t').label, effB('btn_n').label, effB('btn_b').label, effB('btn_b').src], ['新作を見る', '固定', '見る', '/img/nb.png'])
  same(problems, 'ボタン: 描く(中身なし)', pc.effectivePart(pc.findPart(layout, 'btn_t'), {}).label, 'もっと見る')

  // 描く形: 許した部品だけ差し替える
  const eff = (id) => pc.effectivePart(pc.findPart(layout, id), all)
  same(problems, '描く: txt_a', eff('txt_a').text, 'A')
  same(problems, '描く: txt_b(書き換えない)', eff('txt_b').text, '固定の文')
  same(problems, '描く: med_a', [eff('med_a').src, eff('med_a').alt], ['/img/new.png', '新'])
  same(problems, '描く: med_b(差し替えない)', [eff('med_b').src, eff('med_b').alt], ['/img/b.png', 'B'])
  same(problems, '描く: btn_img', eff('btn_img').src, '/img/nbtn.png')
  same(problems, '描く: 中身なし', pc.effectivePart(pc.findPart(layout, 'txt_a'), {}).text, 'テンプレートの文')

  // 1 つ変える: 空にするとテンプレートに戻す
  same(problems, '変える', pc.setPartValue({}, 'txt_a', { text: 'x' }), { txt_a: { text: 'x' } })
  same(problems, '空にする', pc.setPartValue({ txt_a: { text: 'x' } }, 'txt_a', { text: '' }), {})
  same(problems, '戻す', pc.setPartValue({ txt_a: { text: 'x' }, med_a: { src: '/a' } }, 'txt_a', null), { med_a: { src: '/a' } })

  // 制作の写し: テキストの部品の行(書き換えていなければテンプレートの文)。直すと part_content、テンプレートの文に戻すと外れる
  const card = { id: 'c1', name: 'x', scheduled_at: '2026-10-26T00:00:00Z', country: 'JP', channel: 'email', layout_key: 'parts-check', links: '', part_content: JSON.stringify({ txt_a: { text: '配信の文' } }) }
  const s = snap.buildSnapshot(card, [], [], [])
  const rows = snap.textRows(s, true).filter((r) => r.field.key === 'part_text')
  same(problems, '制作の写し: 行', rows.map((r) => [r.id, r.value]), [['part.txt_h', 'ヒーローの下'], ['part.txt_a', '配信の文'], ['part.btn_t', 'もっと見る'], ['part.btn_b', '']])
  // 画像の上に文字のボタンの文言を、テンプレートの文(空)に戻しても、差し替えた画像は残る
  const sb = snap.setText({ ...s, card: { ...s.card, part_content: JSON.stringify({ btn_b: { text: '見る', src: '/img/nb.png' } }) } }, { key: 'part_text', id: 'btn_b' }, '')
  same(problems, '制作の写し: ボタンの文言を戻しても画像は残る', pc.parsePartContent(sb.card.part_content), { btn_b: { src: '/img/nb.png' } })
  const s2 = snap.setText(s, { key: 'part_text', id: 'txt_h' }, '直した')
  same(problems, '制作の写し: 直す', pc.parsePartContent(s2.card.part_content), { txt_a: { text: '配信の文' }, txt_h: { text: '直した' } })
  const s3 = snap.setText(s2, { key: 'part_text', id: 'txt_a' }, 'テンプレートの文')
  same(problems, '制作の写し: テンプレートの文に戻す', pc.parsePartContent(s3.card.part_content), { txt_h: { text: '直した' } })

  // 箱の名前・価格などの置き場所(T12): 決めていなければ見せ方から(保存済みのテンプレートは今の見た目のまま)。読むときに知らない値は外す
  const tb = await server.ssrLoadModule('/src/tables.ts')
  const box = (x) => ({ id: 'b', type: 'box', c: 0, r: 0, w: 1, h: 1, ...x })
  same(problems, '置き場所: 既定', [box({}), box({ view: 'photo' }), box({ w: 2 }), box({ view: 'detail' }), box({ view: 'story' })].map(tb.boxPlace), ['below', 'bottom', 'bottom', 'right', undefined])
  same(problems, '置き場所: 決めた値', [box({ place: 'top' }), box({ view: 'detail', place: 'left' }), box({ view: 'story', place: 'top' })].map(tb.boxPlace), ['top', 'left', undefined])
  same(problems, '置き場所: 横に並べる箱', [box({ place: 'left' }), box({ view: 'detail' }), box({ view: 'story' }), box({ place: 'middle' })].map(tb.isSideBox), [true, true, true, false])
  same(problems, '置き場所: 読む', [tb.parsePart(box({ place: 'middle' }))?.place, tb.parsePart(box({ place: 'side' }))?.place], ['middle', undefined])

  return { problems, ok: 'parts OK(読む・保存する分・描く・制作の写し・箱の置き場所)', title: 'テンプレートの部品の、配信ごとの中身が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkParts(server))
  } finally {
    await server.close()
  }
}
