// 計測用のパラメーターの utm_content(src/links.ts の「UTM の決まり」。T8 の 8.10)が、例どおりに付き、例どおりに読めることを確かめる。
//   node scripts/check-utm.mjs   ← npm run verify に含まれる
// 版 3 の表のテンプレートは「押された要素の ID」、以前の形(セクション・版 2 までの写し)は hero・btn1・p01-商品コード。
// 送った URL の形が黙って変わると、GA の数字が配信をまたいでつながらなくなるので、例で固める。
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { report, viteForChecks } from './check-approvals.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const part = (id, type, c, r, extra = {}) => ({ id, type, c, r, w: 1, h: 1, ...extra })
// ヒーローの下の表にボタン 1 つ、表のセクション(箱 2・画像・画像の上に文字のボタン)、以前の形のグリッド(ボタン 1 つ)
const TEMPLATE = {
  id: 'utm-check',
  label: 'utm-check',
  description: '',
  hero: 'standard',
  heroTable: { kind: 'table', id: 'sec_hero', cols: 1, rows: 1, slots: 0, copy: false, parts: [part('btn_top1', 'button', 0, 0)] },
  sections: [
    {
      kind: 'table',
      id: 'sec_a',
      cols: 2,
      rows: 2,
      slots: 2,
      parts: [
        part('box_a1', 'box', 0, 0),
        part('box_a2', 'box', 1, 0, { fields: ['name', 'price'], els: { price: { click: true }, name: { click: false } } }),
        part('med_x1', 'media', 0, 1),
        part('btn_both', 'button', 1, 1, { face: 'both' }),
      ],
    },
    { kind: 'grid', slots: 2, buttons: 1 },
  ],
}

const products = [
  { id: 'P1', name: 'A', product_code: 'AB-1', market: 'JP', price: 1000 },
  { id: 'P2', name: 'B', product_code: 'CD-2', market: 'JP', price: 2000 },
  { id: 'P3', name: 'C', product_code: 'Ef 3', market: 'JP', price: 3000 },
]
const items = products.map((p, i) => ({ key: `${p.id}-${i}`, productId: p.id, reason: '', source: 'manual' }))

const same = (problems, name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${name}: ${JSON.stringify(got)}(期待: ${JSON.stringify(want)})`)
}

/** 確かめる(server は、src を読み込む Vite のサーバー) */
export async function checkUtm(server) {
  const problems = []
  const tpl = await server.ssrLoadModule('/src/templates.ts')
  const links = await server.ssrLoadModule('/src/links.ts')
  const results = await server.ssrLoadModule('/src/results.ts')
  const snap = await server.ssrLoadModule('/src/productionSnapshot.ts')
  tpl.setCustomTemplates([TEMPLATE])

  // 付ける: 版 3(いま)と版 2(以前の写し)
  const slots = (scheme) => links.linkSlots('utm-check', items, products, 'c', 'JP', scheme).map((s) => [s.key, s.content])
  same(problems, 'リンクの場所(版 3)', slots(3), [['hero', 'sec_hero.image'], ['btn_top1', 'btn_top1.label'], ['med_x1', 'med_x1.image'], ['btn_both', 'btn_both'], ['s2-1', 'btn4']])
  same(problems, 'リンクの場所(版 2)', slots(2), [['hero', 'hero'], ['btn_top1', 'btn1'], ['med_x1', 'btn2'], ['btn_both', 'btn3'], ['s2-1', 'btn4']])
  same(problems, 'リンクの場所(版 1)', slots(1).map(([, c]) => c), ['', '', '', '', ''])
  const prod = (scheme) => items.map((it, i) => links.productLinks('utm-check', i, it.key, products[i].product_code, scheme))
  same(problems, '商品の枠(版 3)', prod(3), [
    [{ key: 'box_a1.image', content: 'box_a1.image' }, { key: 'box_a1.name', content: 'box_a1.name' }],
    [{ key: 'box_a2.image', content: 'box_a2.image' }, { key: 'box_a2.price', content: 'box_a2.price' }],
    [{ key: 'P3-2', content: 'p03-Ef3' }],
  ])
  same(problems, '商品の枠(版 2)', prod(2).map((x) => x.map((l) => l.content)), [['p01-AB-1'], ['p02-CD-2'], ['p03-Ef3']])
  // 以前の形だけのテンプレート(標準)は、版 3 でも以前の形
  same(problems, '標準のテンプレート(版 3)', links.linkSlots('standard4', [], [], 'c', 'JP', 3)[0].content, 'hero')

  // 制作の写し: 版 3 は要素ごとのリンク、版 2 の写しは枠まるごと(依頼したときの URL のまま)
  const card = { id: 'card1234abcd', name: 'x', scheduled_at: '2026-10-26T00:00:00Z', country: 'JP', channel: 'email', layout_key: 'utm-check', links: '' }
  const s3 = snap.buildSnapshot(card, products.map((p) => p.id), products, [])
  const keys3 = Object.keys(snap.htmlLinks(s3)).sort()
  same(problems, '書き出す HTML のリンク(版 3)', keys3, ['P3-2', 'box_a1.image', 'box_a1.name', 'box_a2.image', 'box_a2.price', 'btn_both', 'btn_top1', 'header-men', 'header-women', 'hero', 'med_x1', 's2-1'])
  const keys2 = Object.keys(snap.htmlLinks({ ...s3, utm: 2 })).sort()
  same(problems, '書き出す HTML のリンク(版 2 の写し)', keys2, ['P1-0', 'P2-1', 'P3-2', 'btn_both', 'btn_top1', 'header-men', 'header-women', 'hero', 'med_x1', 's2-1'])
  same(problems, '版 2 の写しの URL', new URL(snap.htmlLinks({ ...s3, utm: 2 })['P1-0']).searchParams.get('utm_content'), 'p01-AB-1')
  // メールの上の帯の MEN / WOMEN: 店の URL のカテゴリのページに、ほかのリンクと同じ utm を付ける
  const men = new URL(snap.htmlLinks(s3)['header-men'])
  same(problems, '上の帯の MEN のリンク', [men.pathname, men.searchParams.get('utm_medium'), men.searchParams.get('utm_content')], ['/c/men', 'email', 'header_men'])
  const map = snap.trackingRows(s3)
  same(problems, '計測の対応表の content', map.map((r) => r.content), ['header_men', 'header_women', 'sec_hero.image', 'btn_top1.label', 'med_x1.image', 'btn_both', 'btn4', 'box_a1.image', 'box_a1.name', 'box_a2.image', 'box_a2.price', 'p03-Ef3'])
  same(problems, '計測の対応表の商品コード', map.find((r) => r.content === 'box_a2.price')?.productCode, 'CD-2')
  if (map.some((r) => !r.desc)) problems.push('計測の対応表に説明のない行がある')

  // 読む: 以前の形と新しい形が混ざっても、ヒーロー・ボタンの番号・商品に引ける
  same(problems, 'parseContent', ['hero', 'btn12', 'p03-AB.1', 'box_a1.image', 'btn_both', 'hero-1.label', 'a b'].map(results.parseContent), [
    { kind: 'hero' },
    { kind: 'button', n: 11 },
    { kind: 'slot', index: 2, code: 'AB.1' },
    { kind: 'element', id: 'box_a1.image', part: 'box_a1' },
    { kind: 'element', id: 'btn_both', part: 'btn_both' },
    { kind: 'element', id: 'hero-1.label', part: 'hero-1' },
    null,
  ])
  const got = results.linkResultsFromContents(
    [
      { content: 'sec_hero.image', clicks: 5 },
      { content: 'hero', clicks: 1 },
      { content: 'btn_top1.label', clicks: 2 },
      { content: 'btn_both', clicks: 1 },
      { content: 'btn4', clicks: 3 },
      { content: 'box_a2.price', clicks: 4 },
      { content: 'box_a2.image', clicks: 1 },
      { content: 'p01-AB-1', clicks: 7 },
      { content: 'p03-Ef3', clicks: 6 },
      { content: 'box_zz.image', clicks: 1 },
      { content: '?', clicks: 1 },
    ],
    'utm-check',
    products.map((p) => p.id),
  )
  same(problems, '取り込み: links', { hero: got.links.hero, buttons: got.links.buttons, other: got.links.other }, { hero: 6, buttons: [2, 0, 1, 3], other: 2 })
  same(problems, '取り込み: 商品', got.products.map((p) => [p.productId, p.clicks]), [['P2', 5], ['P1', 7], ['P3', 6]])
  same(problems, '取り込み: 要素ごと', got.links.els, { 'sec_hero.image': 5, 'btn_top1.label': 2, btn_both: 1, 'box_a2.price': 4, 'box_a2.image': 1, 'box_zz.image': 1 })
  same(problems, '取り込み: 引けない content', got.unknown, ['box_zz.image', '?'])

  // 店の URL の形(settings.shopurl): 値はエンコードして埋め、{shop} はそのまま。埋められない {名前} は残す。既定の形は、設定に移す前と同じ URL
  same(problems, 'fillUrl', [
    links.fillUrl('{shop}/p/{product_code}', { shop: 'https://s.example.com/', product_code: 'A B/1' }),
    links.fillUrl('{shop}/item?id={product_code}&lang={country}', { shop: 'https://s.example.com', product_code: 'X1', country: 'JP' }),
    links.fillUrl('{shop}/c/{category}/{sku}', { shop: 'https://s.example.com', category: 'men' }),
    links.fillUrl('{shop}/{campaign}', { shop: 'https://s.example.com' }),
  ], ['https://s.example.com/p/A%20B%2F1', 'https://s.example.com/item?id=X1&lang=JP', 'https://s.example.com/c/men/{sku}', 'https://s.example.com/{campaign}'])
  same(problems, '埋められない値', [links.unfilledValues('{shop}/p/{product_code}/{campaign}/{x}', links.URL_VALUES.product), links.unfilledValues('{shop}/c/{category}', links.URL_VALUES.category)], [['campaign', 'x'], []])
  same(problems, '既定の形の URL', [links.productUrl(products[0]), links.defaultUrl('category', 'c', 'Men', 'JP'), links.defaultUrl('campaign', '20261026-card1234', undefined, 'JP')], [
    'https://shop.example.com/p/AB-1',
    'https://shop.example.com/c/men',
    'https://shop.example.com/campaign/20261026-card1234',
  ])
  // 実際のページの URL を 1 つ貼ると、値を見つけて形を作る(大文字・小文字を問わない・前後が英数字の所は当てない・先頭が店の URL なら {shop})
  same(problems, 'learnUrlPattern', [
    links.learnUrlPattern('https://shop.example.com/products/ab123.html', 'AB123', 'product_code', 'https://shop.example.com'),
    links.learnUrlPattern('https://www.example.org/item/?id=AB123&ref=AB1234', 'AB123', 'product_code', 'https://shop.example.com'),
    links.learnUrlPattern('https://shop.example.com/p/AB1234', 'AB123', 'product_code', 'https://shop.example.com'),
    links.learnUrlPattern('https://shop.example.com/c/Outer/', 'outer', 'category', 'https://shop.example.com/'),
  ], [
    { pattern: '{shop}/products/{product_code}.html', caseDiffers: true, shopMatched: true },
    { pattern: 'https://www.example.org/item/?id={product_code}&ref=AB1234', caseDiffers: false, shopMatched: false },
    null,
    { pattern: '{shop}/c/{category}/', caseDiffers: true, shopMatched: true },
  ])
  same(problems, '形の札', links.urlPatternParts('{shop}/p/{product_code}.html'), [{ value: 'shop' }, { text: '/p/' }, { value: 'product_code' }, { text: '.html' }])
  // 商品の URL があれば、それが先。utm は ? のある URL にも & でつながる
  const own = { ...products[0], id: 'P9', page_url: 'https://www.example.org/goods?id=9' }
  same(problems, '商品の page_url が先', new URL(links.withUtm(links.productUrl(own), { source: 's' })).search, '?id=9&utm_source=s')
  // 制作の写しには、そのときの商品の URL を固める(あとで形を変えても、渡した配信の URL が変わらない)
  same(problems, '写しに固めた商品の URL', s3.products.map((p) => p.page_url), products.map((p) => links.productUrl(p)))
  const moved = snap.setProducts(s3, [...s3.productIds, own.id], [own])
  same(problems, '写しに足した商品の URL', moved.products.at(-1)?.page_url, 'https://www.example.org/goods?id=9')

  return { problems, ok: 'utm OK(付ける・制作の写し・読む・店の URL の形)', title: '計測用のパラメーター(utm_content)・店の URL の形が、例と合いません' }
}

// 単独で流したとき
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createServer(viteForChecks(root))
  try {
    report(await checkUtm(server))
  } finally {
    await server.close()
  }
}
