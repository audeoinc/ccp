// AB テスト・案から選ぶ(X55・X57)の、例の配信を作る(利用者の依頼 2026-10-20: B まで・C まで作った配信を、本番に用意してほしい)。
// ⚙ のメニューから、利用者が本番の画面で押して作る(本番の DB には、画面の窓口からだけ書く)。
// 新しい配信を足すだけで、今ある配信は触らない。名前に「見本」は付けない(利用者の指示)。あとで探して消せるよう、ab_test の JSON に seed の印を残す
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { newAbTest, type AbDecision, type AbTest, type VariantKey, type VariantText } from './abTest'
import { tr } from './i18n'
import type { DeliveryCard } from './models/deliveryCards'
import type { HeroImage } from './models/heroImages'
import type { Product } from './models/products'
import { heroMarket, productMarket } from './market'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, sectionIndexAt, sectionsOf } from './templates'

/** 例の配信の印(ab_test の JSON の seed)。探して消すときに使う */
export const AB_SEED = 'x57-examples'
export const isAbSeed = (c: DeliveryCard) => !!c.ab_test && c.ab_test.includes(`"seed":"${AB_SEED}"`)

interface Plan {
  name: string
  channel: 'email' | 'app'
  /** 今日から何日後に送るか */
  day: number
  hour: number
  ab: AbTest
  theme: string
  /** 案ごとの文言(A を含む)。案ごとに文言を持たないときは A だけ */
  texts: Partial<Record<VariantKey, VariantText>>
  /** 案ごとのメイン画像の番号・商品の始まりの番号(使える画像・商品の並びの中で、ずらして重ならないようにする) */
  heroAt: Partial<Record<VariantKey, number>>
  productsAt: Partial<Record<VariantKey, number>>
  /** 案から選んだあと(決めた案と、配信しなかった案) */
  decide?: VariantKey
}

const text = (headline: string, copy: string, sectionTitles: string[], pushTitle = '', pushBody = ''): VariantText => ({
  headline,
  copy,
  pushTitle,
  pushBody,
  sectionTitles,
  sectionCopies: [],
})

function plans(en: boolean): Plan[] {
  const L = (e: string, j: string) => (en ? e : j)
  return [
    {
      // AB テスト・B まで: メイン画像を比べる
      name: L('Fall Layers', '秋の重ね着'),
      channel: 'email',
      day: 8,
      hour: 10,
      ab: { ...newAbTest('test'), variants: ['B'], target: 'hero', hypothesis: L('A styled outfit photo gets more clicks than a product-only shot', '着用画像のほうが、商品だけの画像よりクリックされる') },
      theme: L('Easy layers for cool mornings', '朝晩の冷え込みに、重ねやすい秋の装い'),
      texts: { A: text(L('Layer Up for Fall', '重ねて楽しむ秋'), L('Light pieces that stack well from morning to night.', '朝から夜まで、重ねやすい軽やかなアイテム。'), [L('Outerwear', 'アウター'), L('Knits', 'ニット')]) },
      heroAt: { A: 0, B: 1 },
      productsAt: { A: 0 },
    },
    {
      // AB テスト・C まで: 商品を比べる
      name: L('Weekend Knit Edit', '週末のニット特集'),
      channel: 'email',
      day: 10,
      hour: 9,
      ab: { ...newAbTest('test'), variants: ['B', 'C'], target: 'products', mode: 'winner', testShare: 30, hypothesis: L('Best sellers beat new arrivals for the weekend', '週末は、新作より売れ筋のほうが買われる') },
      theme: L('Cozy knits for the weekend', '週末に着たい、やわらかなニット'),
      texts: { A: text(L('Weekend Knits', '週末のニット'), L('Soft textures for slow weekends.', 'ゆったり過ごす週末に、やわらかな素材を。'), [L('Picks', 'おすすめ')]) },
      heroAt: { A: 2 },
      productsAt: { A: 0, B: 1, C: 2 },
    },
    {
      // 案から選ぶ・B まで: すべて(画像・商品・文言)を変える
      name: L('Holiday Gift Picks', 'ホリデーのギフト'),
      channel: 'email',
      day: 12,
      hour: 10,
      ab: { ...newAbTest('choose'), variants: ['B'] },
      theme: L('Gifts that feel personal', '気持ちが伝わる贈りもの'),
      texts: {
        A: text(L('Gifts They Will Keep', 'ずっと使える贈りもの'), L('Thoughtful picks for everyone on your list.', '贈りたい人に合わせて選べるギフト。'), [L('For Her', '女性へ'), L('For Him', '男性へ')]),
        B: text(L('Wrap Up the Season', '季節を包んで贈る'), L('Warm gifts for the coldest days.', '寒い日に役立つ、あたたかな贈りもの。'), [L('Warm Gifts', 'あたたかなギフト'), L('Small Gifts', 'ちょっとしたギフト')]),
      },
      heroAt: { A: 3, B: 4 },
      productsAt: { A: 1, B: 3 },
    },
    {
      // 案から選ぶ・C まで(アプリ): 通知の文も案ごとに
      name: L('Cozy Home Week', 'おうち時間の特集'),
      channel: 'app',
      day: 13,
      hour: 18,
      ab: { ...newAbTest('choose'), variants: ['B', 'C'] },
      theme: L('Make home the coziest place', 'おうちを、いちばん心地よい場所に'),
      texts: {
        A: text(L('Cozy Home Week', 'おうち時間の特集'), L('Blankets, loungewear and more.', 'ブランケットやルームウェアなど。'), [], L('Cozy Home Week is here', 'おうち時間の特集が始まりました'), L('Soft picks for slow evenings. Tap to see.', 'ゆったり過ごす夜に。タップして見る')),
        B: text(L('Stay In, Stay Warm', 'あたたかく、おうちで'), L('Everything for a warm night in.', 'あたたかな夜のための、ひとそろい。'), [], L('Stay in tonight?', '今夜はおうちで'), L('Warm loungewear and blankets inside.', 'あたたかなルームウェアとブランケット')),
        C: text(L('Slow Evenings', 'ゆっくり過ごす夜'), L('Little comforts for your evening.', '夜を心地よくする、小さなもの。'), [], L('Your evening, upgraded', '夜を、もっと心地よく'), L('New cozy picks just for you.', 'あなたにおすすめのアイテムが届きました')),
      },
      heroAt: { A: 0, B: 2, C: 4 },
      productsAt: { A: 2, B: 0, C: 1 },
    },
    {
      // 案から選んだあと: B に決めて、A は配信しなかった案として残っている
      name: L('Early Winter Coats', '初冬のコート'),
      channel: 'email',
      day: 15,
      hour: 10,
      ab: { ...newAbTest('choose'), variants: ['B'] },
      theme: L('Coats for the first cold days', '冷え込みはじめに、頼れるコート'),
      texts: {
        A: text(L('Coat Season', 'コートの季節'), L('Find your coat for the season.', '今季の一着を見つけよう。'), [L('Long Coats', 'ロングコート'), L('Short Coats', 'ショートコート')]),
        B: text(L('Ready for the Cold', '寒さに備えて'), L('Warm coats that go with everything.', 'どんな服にも合わせやすい、あたたかなコート。'), [L('Warmest', 'いちばんあたたか'), L('Easy to Wear', '合わせやすい')]),
      },
      heroAt: { A: 1, B: 3 },
      productsAt: { A: 3, B: 2 },
      decide: 'B',
    },
  ]
}

const dateAt = (day: number, hour: number) => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + day, hour, 0, 0)
}

/**
 * 例の配信を作る。作った配信の数を返す。
 * 国は、商品の多い市場(US / JP)。テンプレートは、メールが標準、アプリが特集。商品・画像は、その市場の在庫の多いものから、案ごとにずらして選ぶ
 */
export async function createAbExamples(args: { products: Product[]; heroes: HeroImage[]; owner: string }): Promise<number> {
  const us = args.products.filter((p) => productMarket(p) === 'US').length
  const jp = args.products.length - us
  const market = us >= jp ? 'US' : 'JP'
  const en = market === 'US'
  const pool = args.products.filter((p) => productMarket(p) === market && p.id).sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
  const heroes = args.heroes.filter((h) => heroMarket(h) === market)
  if (pool.length === 0) throw new Error(tr('商品がないため、例の配信を作れません', 'No products to build the example deliveries'))
  const heroAt = (i?: number) => (i === undefined || heroes.length === 0 ? undefined : heroes[i % heroes.length].id)

  let made = 0
  for (const p of plans(en)) {
    const template = p.channel === 'app' ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE
    const sections = sectionsOf(template)
    const slots = sections.reduce((n, s) => n + (Number.isFinite(s.slots) ? s.slots : 4), 0)
    // 案ごとの商品(始まりの番号 × 枠の数だけずらす。足りなければ回して使う)
    const productsOf = (k: VariantKey) => {
      const at = p.productsAt[k] ?? p.productsAt.A ?? 0
      return Array.from({ length: slots }, (_, i) => pool[(at * slots + i) % pool.length].id)
    }
    const a = p.texts.A!
    const keys: VariantKey[] = ['A', ...p.ab.variants]
    const ownsP = p.ab.target === 'products' || p.ab.target === 'both' || p.ab.target === 'all'
    const ownsH = p.ab.target === 'hero' || p.ab.target === 'both' || p.ab.target === 'all'
    const ownsT = p.ab.target === 'all'

    // 決めたあとの配信: 決めた案が中身(A の列)になり、ほかの案は rejected に残る
    const shown: VariantKey = p.decide ?? 'A'
    const shownText = p.texts[shown] ?? a
    let abJson: string
    if (p.decide) {
      const decided: AbDecision = {
        variant: p.decide,
        at: new Date().toISOString(),
        by: args.owner,
        target: p.ab.target,
        rejected: keys
          .filter((k) => k !== p.decide)
          .map((k) => ({ key: k, heroId: heroAt(p.heroAt[k]), heroReason: '', productIds: productsOf(k), texts: p.texts[k] })),
      }
      abJson = JSON.stringify({ v: 1, purpose: 'choose', variants: [], target: p.ab.target, metric: 'ctr', mode: 'even', testShare: 0, waitHours: 0, hypothesis: '', heroes: {}, decided, seed: AB_SEED })
    } else {
      const ab: AbTest & { seed: string } = {
        ...p.ab,
        heroes: ownsH ? Object.fromEntries(p.ab.variants.map((k) => [k, { heroId: heroAt(p.heroAt[k]), heroReason: '' }])) : {},
        ...(ownsT ? { texts: Object.fromEntries(p.ab.variants.map((k) => [k, p.texts[k] ?? a])) } : {}),
        seed: AB_SEED,
      }
      abJson = JSON.stringify(ab)
    }

    const res = await DeliveryCardsService.create({
      name: p.name,
      scheduled_at: dateAt(p.day, p.hour).toISOString(),
      country: market,
      channel: p.channel,
      status: 'not_started',
      layout_key: template,
      email_template: TEMPLATE_VALUES[template],
      theme: p.theme,
      headline: shownText.headline,
      copy: shownText.copy,
      section_titles: shownText.sectionTitles.join('\n'),
      push_title: shownText.pushTitle,
      push_body: shownText.pushBody,
      owner: args.owner,
      hero_image_id: heroAt(p.heroAt[shown] ?? p.heroAt.A) ?? null,
      ab_test: abJson,
      state_code: 0,
    })
    if (!res.success || !res.data?.id) throw new Error(res.error?.message ?? tr('配信を作れませんでした', 'Could not create a delivery'))
    const cardId = res.data.id
    made++

    // 商品の行: A(決めたあとは、決めた案)と、案ごとに商品を持つときの B・C
    const rows: { variant: string; ids: string[] }[] = [{ variant: '', ids: productsOf(shown) }]
    if (!p.decide && ownsP) for (const k of p.ab.variants) rows.push({ variant: k, ids: productsOf(k) })
    for (const r of rows) {
      for (let i = 0; i < r.ids.length; i++) {
        const prod = pool.find((x) => x.id === r.ids[i])
        const pr = await DeliveryProductsService.create({
          name: `${p.name} / ${prod?.name ?? ''}`,
          reason: '',
          section: sectionIndexAt(sections, i),
          sort_order: i + 1,
          source: 'ai',
          state: 'selected',
          variant: r.variant,
          delivery_card_id: cardId,
          product_id: r.ids[i],
          state_code: 0,
        })
        if (!pr.success) throw new Error(pr.error?.message ?? tr('掲載商品を作れませんでした', 'Could not create the products'))
      }
    }
  }
  return made
}
