// 撮影・デモ用の、AI エージェントの身代わり。実際の AI ではなく、依頼の内容(task、商品の一覧、チャットの指示)から、
// それらしい返答(JSON の文字列)を、決まった形で作る。AI の画面の撮影のためだけに使う。

import { guessThemeType } from '../themeGuess'

type Obj = Record<string, unknown>
type ProductIn = { code: string; name: string; category?: string; price?: number; stock?: number; salesTrend?: string; rating?: number }
type HeroIn = { code: string; name: string; season?: string; purpose?: string }

const TREND_EN: Record<string, string> = { 上昇: 'rising', 横ばい: 'flat', 下降: 'falling' }
const hasJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s)

/** 依頼の文から、末尾の入力(JSON)を取り出す */
function payloadOf(message: string): Obj {
  const i = message.lastIndexOf('{"task":')
  if (i < 0) return {}
  try {
    return JSON.parse(message.slice(i)) as Obj
  } catch {
    return {}
  }
}

const J = (o: unknown) => JSON.stringify(o)

export function mockAgent(message: string): string {
  const p = payloadOf(message)
  const task = String(p.task ?? '')
  const en = message.includes('自然な英語で書くこと') // 画面が English のときの注意書き
  const card = (p.card ?? {}) as Obj
  const theme = String(card.theme ?? '')
  const chat = (p.chat as { role: string; text: string }[] | undefined) ?? []
  const last = chat.length > 0 ? chat[chat.length - 1].text : ''

  // チャットで、質問・相談のときは、案を変えずに、答えだけを返す
  if (chat.length > 0 && /[?？]|どう思|なぜ|why|what do you think|how about/i.test(last)) {
    return J({
      mode: 'answer',
      reply: hasJa(last)
        ? '全体として季節感と統一感がありますが、見出しの内容がやや重複しています。トップス中心に、軽めのニットやカーディガンを軸に再構成すると、より自然に秋の立ち上がりに合います。'
        : 'The lineup feels seasonal and cohesive, though two items overlap. Building around knits and a light cardigan would fit the early-fall mood more naturally.',
    })
  }
  const reply = (jaDefault: string, enDefault: string) => {
    if (chat.length === 0) return {}
    return { mode: 'update', reply: hasJa(last) ? jaDefault : enDefault }
  }

  // 並べた配信の評価: 1 通あたりの売上の高い・低い配信と、ばらつきの大きい位置から、決まった形の文を作る
  if (task === 'compare_results') {
    type D = { id: string; date: string; name: string; slots?: string[]; kpis: { revenuePerRecipient?: number; clickRate?: number }; positions?: Record<string, number> }
    const ds = (p.deliveries as D[] | undefined) ?? []
    if (ds.length === 0) return J({ summary: '', best: [], worst: [], findings: [], next: [], confidence: '' })
    const rpr = (d: D) => d.kpis.revenuePerRecipient ?? 0
    const sorted = [...ds].sort((a, b) => rpr(b) - rpr(a))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const avg = ds.reduce((s, d) => s + rpr(d), 0) / ds.length
    const diff = (d: D) => Math.round((rpr(d) / (avg || 1) - 1) * 100)
    // 位置のばらつき: いちばん差の大きい位置
    const keys = Object.keys(ds[0].positions ?? {})
    const spread = keys
      .map((k) => {
        const vs = ds.map((d) => d.positions?.[k] ?? 0)
        return { k, hi: Math.max(...vs), lo: Math.min(...vs), at: ds[vs.indexOf(Math.max(...vs))] }
      })
      .sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0]
    const pname = (k: string, d?: D) => {
      const [kind, i] = k.split(':')
      if (k === 'hero') return en ? 'the hero' : 'メイン画像'
      if (kind === 'button') return en ? `button ${Number(i) + 1}` : `ボタン ${Number(i) + 1}`
      const prod = d?.slots?.[Number(i)]
      return en ? `slot ${Number(i) + 1}${prod ? ` (${prod})` : ''}` : `商品の枠 ${Number(i) + 1}${prod ? `(${prod})` : ''}`
    }
    return en
      ? J({
          summary: `Across ${ds.length} deliveries, revenue per recipient ranged from ${rpr(worst).toFixed(2)} to ${rpr(best).toFixed(2)}.`,
          best: [{ id: best.id, why: `Revenue per recipient ${diff(best)}% above the average.` }],
          worst: best === worst ? [] : [{ id: worst.id, why: `${Math.abs(diff(worst))}% below the average.` }],
          findings: spread ? [`${pname(spread.k)} varied the most: ${(spread.lo * 100).toFixed(0)}–${(spread.hi * 100).toFixed(0)}% of clicks.`] : [],
          next: spread ? [`Reuse what was in ${pname(spread.k, spread.at)} on ${spread.at.date}.`] : [],
          confidence: ds.length < 5 ? `Weak: only ${ds.length} deliveries.` : `Moderate: ${ds.length} deliveries compared.`,
        })
      : J({
          summary: `${ds.length} 本の配信で、1 通あたりの売上は ${rpr(worst).toFixed(2)} 〜 ${rpr(best).toFixed(2)} の幅があった。`,
          best: [{ id: best.id, why: `1 通あたりの売上が、平均より ${diff(best)}% 高い。` }],
          worst: best === worst ? [] : [{ id: worst.id, why: `平均より ${Math.abs(diff(worst))}% 低い。` }],
          findings: spread ? [`${pname(spread.k)}のクリックの割合が、${(spread.lo * 100).toFixed(0)}〜${(spread.hi * 100).toFixed(0)}% といちばんばらついた。`] : [],
          next: spread ? [`${spread.at.date} の${pname(spread.k, spread.at)}の載せ方を、次も試す。`] : [],
          confidence: ds.length < 5 ? `弱い: ${ds.length} 本だけ。` : `中くらい: ${ds.length} 本を比べた。`,
        })
  }

  // 週・月の振り返りの下書き: 国 × チャネルの数字を前の期間と比べ、売上の多い配信・少ない配信の名前を入れた、決まった形の文を作る
  if (task === 'draft_retro') {
    type Kpi = { deliveries: number; clickRate?: number; revenue: number }
    const summary = (p.summary as { country: string; channel: string; now: Kpi; past: Kpi }[] | undefined) ?? []
    const ds = [...((p.deliveries as { name: string; revenue: number }[] | undefined) ?? [])].sort((a, b) => b.revenue - a.revenue)
    const month = p.period === 'month'
    const pt = (k: { now: Kpi; past: Kpi }) => (((k.now.clickRate ?? 0) - (k.past.clickRate ?? 0)) * 100).toFixed(1)
    const rev = (k: { now: Kpi; past: Kpi }) => (k.past.revenue ? Math.round((k.now.revenue / k.past.revenue - 1) * 100) : 0)
    const up = summary.filter((k) => rev(k) >= 0)
    const down = summary.filter((k) => rev(k) < 0)
    const label = (k: { country: string; channel: string }) => (en ? `${k.country} ${k.channel}` : `${k.country} の${k.channel === 'push' ? 'アプリ' : 'メール'}`)
    return J({
      good: [
        ...up.slice(0, 1).map((k) => (en ? `${label(k)} revenue was ${rev(k)}% above the past average; click rate ${pt(k)}pt.` : `${label(k)}の売上は、前の期間の平均より ${rev(k)}% 多く、クリック率は ${pt(k)}pt。`)),
        ...(ds[0] ? [en ? `"${ds[0].name}" led with the most revenue in the period.` : `「${ds[0].name}」が、期間でいちばん売上が多かった。`] : []),
      ],
      bad: [
        ...down.slice(0, 1).map((k) => (en ? `${label(k)} revenue fell ${Math.abs(rev(k))}% below the past average.` : `${label(k)}の売上は、前の期間の平均より ${Math.abs(rev(k))}% 少なかった。`)),
        ...(ds.length > 1 ? [en ? `"${ds[ds.length - 1].name}" had the least revenue in the period.` : `「${ds[ds.length - 1].name}」が、期間でいちばん売上が少なかった。`] : []),
      ],
      next: ds[0]
        ? [en ? `Reuse the angle of "${ds[0].name}" in one delivery next ${month ? 'month' : 'week'}.` : `次の${month ? '月' : '週'}も、「${ds[0].name}」の切り口を 1 本は試す。`]
        : [],
      confidence: ds.length < 5 ? (en ? `Weak: only ${ds.length} deliveries.` : `弱い: 配信が ${ds.length} 本だけ。`) : en ? `Medium: ${ds.length} deliveries.` : `中くらい: ${ds.length} 本を比べた。`,
    })
  }

  // 結果の振り返り: 過去の平均との差が大きい位置・数字から、決まった形の文を作る
  if (task === 'review_results') {
    type Pos = { key: string; now: number; past: number }
    const positions = ((p.positions as Pos[] | undefined) ?? []).filter((x) => x.key !== 'other')
    const kpis = (p.kpis as { name: string; now: number; past: number; rate?: boolean }[] | undefined) ?? []
    const slots = (p.slots as string[] | undefined) ?? []
    const n = Number(p.past ?? 0)
    const name = (key: string) => {
      const [kind, i] = key.split(':')
      if (key === 'hero') return en ? 'the hero image' : 'メイン画像'
      if (kind === 'button') return en ? `button ${Number(i) + 1}` : `ボタン ${Number(i) + 1}`
      const prod = slots[Number(i)]
      return en ? `product slot ${Number(i) + 1}${prod ? ` (${prod})` : ''}` : `商品の枠 ${Number(i) + 1}${prod ? `(${prod})` : ''}`
    }
    const pt = (x: Pos) => ((x.now - x.past) * 100).toFixed(1)
    const sorted = [...positions].sort((a, b) => b.now - b.past - (a.now - a.past))
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const click = kpis.find((k) => /click|tap/i.test(k.name))
    const clickPt = click ? ((click.now - click.past) * 100).toFixed(1) : '0'
    return en
      ? J({
          good: best ? [`${name(best.key)} drew ${pt(best)}pt more of the clicks than the past average.`] : [],
          bad: [
            ...(worst ? [`${name(worst.key)} fell ${Math.abs(Number(pt(worst)))}pt below the past average.`] : []),
            ...(Number(clickPt) < 0 ? [`Click rate was ${Math.abs(Number(clickPt))}pt below the past average.`] : []),
          ],
          next: [
            ...(worst ? [`Swap what sits in ${name(worst.key)} for a stronger seller, or move it lower.`] : []),
            ...(best ? [`Keep the approach used for ${name(best.key)} next time.`] : []),
          ],
          confidence: n < 5 ? `Weak: compared with only ${n} past deliveries.` : `Moderate: compared with ${n} past deliveries.`,
        })
      : J({
          good: best ? [`${name(best.key)}が、過去の平均よりクリックの割合で ${pt(best)}pt 多かった。`] : [],
          bad: [
            ...(worst ? [`${name(worst.key)}は、過去の平均より ${Math.abs(Number(pt(worst)))}pt 少なかった。`] : []),
            ...(Number(clickPt) < 0 ? [`クリック率が、過去の平均より ${Math.abs(Number(clickPt))}pt 低かった。`] : []),
          ],
          next: [
            ...(worst ? [`${name(worst.key)}に載せるものを、売れ筋に替えるか、下の枠に移す。`] : []),
            ...(best ? [`${name(best.key)}の見せ方は、次回も続ける。`] : []),
          ],
          confidence: n < 5 ? `弱い: 比べた過去の配信が ${n} 回だけ。` : `中くらい: 過去 ${n} 回と比べた。`,
        })
  }

  // テーマの種類: 言葉から推し量った種類を、そのまま返す
  if (task === 'classify_theme_types') {
    const list = (p.deliveries as { id: string; name?: string; theme?: string; headline?: string }[] | undefined) ?? []
    return J({ types: list.map((d) => ({ id: d.id, type: guessThemeType({ name: d.name, theme: d.theme, headline: d.headline }) })) })
  }

  // 似た学びの組(X78): 出元の国・チャネル・テーマの種類が同じ学びを、強い方(なければ使われた本数の多い方)を残す形で 2 つずつ組にする(3 組まで)
  if (task === 'suggest_similar_learnings') {
    type L = { id: string; title?: string; country?: string; channel?: string; themeType?: string; strength?: number | null; uses?: number }
    const list = (p.learnings as L[] | undefined) ?? []
    const groups = new Map<string, L[]>()
    for (const l of list) groups.set(`${l.country}|${l.channel}|${l.themeType}`, [...(groups.get(`${l.country}|${l.channel}|${l.themeType}`) ?? []), l])
    const score = (l: L) => (l.strength ?? 0) * 100 + (l.uses ?? 0)
    const pairs = [...groups.values()]
      .filter((g) => g.length >= 2)
      .slice(0, 3)
      .map((g) => {
        const [a, b] = [...g].sort((x, y) => score(y) - score(x))
        return { into: a.id, from: b.id, why: en ? 'Both are about the same kind of delivery and suggest the same way to use it.' : '同じ種類の配信についての学びで、生かし方も同じです。' }
      })
    return J({ pairs })
  }

  // 学びの名前の案(X78): メモの 1 文目を短くする
  if (task === 'suggest_learning_title') {
    const notes = String(((p.learning ?? {}) as Obj).notes ?? '').trim()
    const first = notes.split(/[\n。.!?！？]/)[0].trim()
    const title = hasJa(first) ? (first.length > 16 ? `${first.slice(0, 15)}…` : first) : first.split(/\s+/).slice(0, 5).join(' ')
    return J({ title: title || (en ? 'Untitled learning' : '名前のない学び') })
  }

  // 配信名の案: 種類と曜日から、決まった形で作る。種類が空の枠は、曜日で種類も決める
  if (task === 'suggest_names') {
    const slots = (p.slots as { id: string; scheduledAt?: string; country?: string; themeType?: string }[] | undefined) ?? []
    const byDay = ['season', 'new', 'sale', 'collab', 'limited', 'member', 'restock'] as const
    const kindName: Record<string, [string, string]> = {
      season: ['季節の特集', 'Seasonal'],
      new: ['新作', 'New In'],
      sale: ['セール', 'Sale'],
      collab: ['コラボ', 'Collab'],
      limited: ['期間限定価格', 'Limited Price'],
      member: ['会員向け', 'Members'],
      restock: ['再入荷', 'Restock'],
    }
    return J({
      names: slots.map((s, i) => {
        const d = s.scheduledAt ? new Date(s.scheduledAt) : new Date()
        const us = s.country === 'US'
        const md = `${d.getMonth() + 1}/${d.getDate()}`
        const proposed = s.themeType ? undefined : byDay[d.getDay()]
        const kind = s.themeType || (proposed ? kindName[proposed][us ? 1 : 0] : us ? 'Weekly Picks' : '今週のおすすめ')
        return {
          id: s.id,
          name: us ? `${kind} ${md}` : `${md} ${kind}${i % 2 ? '特集' : ''}`,
          ...(proposed ? { themeType: proposed } : {}),
          reason: proposed ? '曜日から種類を選び、配信日と種類から付けた名前です。' : '配信日と種類から付けた名前です。',
        }
      }),
    })
  }

  // キャンペーンの案(X79 の段 ⑤ の移し替え)。名前はメールのカードから、テーマは最初のカードのテーマから
  if (task === 'suggest_campaign') {
    const cs = (p.cards as { name?: string; channel?: string; theme?: string }[] | undefined) ?? []
    const lead = cs.find((c) => c.channel === 'email') ?? cs[0]
    return J({
      name: lead?.name || (p.country === 'JP' ? '週末のおすすめ' : 'Weekend Picks'),
      theme: cs.find((c) => c.theme)?.theme || '季節の変わり目スタイル',
      themeReason: '同じ日のメールとアプリで、在庫の多い季節の商品をそろえて届けるため。',
      themeType: 'season',
      purpose: '週末の来店・購入を増やす',
    })
  }

  if (task === 'suggest_themes') {
    return en
      ? J({ themes: [
          { theme: 'Layered Comfort for Crisp Days', reason: 'Early October brings cooler mornings; light jackets and knits are well stocked and trending up.' },
          { theme: 'Rain-Ready Chic for Autumn Streets', reason: 'Rain parkas, boots and totes have solid inventory and growing demand this season.' },
          { theme: 'Warm Textures to Welcome Fall', reason: 'Knits, blankets and loungewear are selling well and give a strong seasonal feel.' },
        ] })
      : J({ themes: [
          { theme: '季節の変わり目スタイル', reason: '10月初旬の寒暖差が大きく、在庫豊富な軽アウターとニットが好調なため。' },
          { theme: '雨の日も楽しむ秋支度', reason: 'レインパーカーやレインブーツの在庫が多く、雨具の需要が高まる時期。' },
          { theme: 'あたたか素材で、秋じたく', reason: 'ニットやブランケットの売れ行きが伸びており、季節感を出しやすい。' },
        ] })
  }

  if (task === 'suggest_copies') {
    const t = en ? theme || 'the season' : theme || '季節'
    void t
    return en
      ? J({ copies: [
          { headline: 'Embrace the Autumn Layers', lead: 'Discover cozy blends and structured essentials that redefine effortless warmth.', angle: 'Seasonal feel' },
          { headline: 'Style That Moves With Fall', lead: 'Transition seamlessly from chilly mornings to golden afternoons with soft, tailored comfort.', angle: 'Product appeal' },
          { headline: 'Find Your Perfect Fall Layer', lead: 'From trench to wool, explore new arrivals made to make every outing effortlessly stylish.', angle: 'Call to action' },
        ] })
      : J({ copies: [
          { headline: 'ぬくもりを纏う、秋', lead: '重ねるほどに表情が変わる、やさしい手ざわりの新作が届きました。', angle: '季節感' },
          { headline: '秋の主役は、ニット', lead: '上質な素材とこなれたシルエットで、いつもの装いを一歩先へ。', angle: '商品の魅力' },
          { headline: 'あなたの秋の一枚を', lead: '今季の新作から、お気に入りのレイヤーを見つけてください。', angle: '行動の呼びかけ' },
        ] })
  }

  // シンプルな配信カードの、部品の文言を直す(SU1 段階 b)。依頼の言葉から、それらしい直し方を 3 つ
  if (task === 'suggest_part_rewrite') {
    const part = (p.part ?? {}) as { kind?: string; current?: string }
    const req = String(p.request ?? '')
    const cur = String(part.current ?? '')
    const ja = hasJa(cur) || (!cur && hasJa(req))
    if (/[?？]|どう思/.test(req)) return J({ mode: 'answer', reply: ja ? 'テーマに合っていて読みやすいです。もう少し短くすると、スマホでも 1 行に収まります。' : 'It fits the theme and reads well. A bit shorter would fit on one line on mobile.' })
    const words = cur.split(/(?<=[、。,.])\s*/).filter(Boolean)
    const short = words[0] ?? cur
    const ideas = ja
      ? [
          { text: short.replace(/[、。]$/, ''), why: '前半だけを残し、ひと目で読める長さにしました。' },
          { text: `この秋、${short.replace(/[、。]$/, '')}`, why: '季節の言葉を先に置きました。' },
          { text: `${short.replace(/[、。]$/, '')}。いまチェック`, why: '行動を促す言葉で締めました。' },
        ]
      : [
          { text: short.replace(/[,.]$/, ''), why: 'Kept the first phrase so it reads at a glance.' },
          { text: `This fall: ${short.replace(/[,.]$/, '').replace(/^./, (c) => c.toLowerCase())}`, why: 'Leads with the season.' },
          { text: `${short.replace(/[,.]$/, '')}. Shop now.`, why: 'Ends with a call to action.' },
        ]
    return J({ mode: 'update', reply: ja ? `「${req}」の方向で、3 つ考えました。` : `Here are three takes on "${req}".`, ideas })
  }

  // シンプルな配信カードで、メイン画像・商品を AI に頼む(SU1 段階 b)。候補の先頭から 3 つ
  if (task === 'suggest_part_hero' || task === 'suggest_part_product') {
    const req = String(p.request ?? '')
    const ja = hasJa(req)
    if (/[?？]|どう思/.test(req)) return J({ mode: 'answer', reply: ja ? 'テーマに合っています。もう少し明るい画像にすると、季節感が伝わりやすくなります。' : 'It fits the theme. A brighter image would convey the season better.' })
    const hero = task === 'suggest_part_hero'
    type X = { code?: string; name?: string; stock?: number; weeksLeft?: number | null; thisWeek?: number; lastWeek?: number }
    const list = ((hero ? p.heroes : p.products) as X[] | undefined) ?? []
    // 在庫の見込みを確かめた候補(アラートからの差し替え)なら、今週・前週の訴求が少なく、在庫に余裕のある順
    const seen = (x: X) => (x.thisWeek ?? 0) + (x.lastWeek ?? 0)
    const stockFirst = list.some((x) => x.thisWeek !== undefined)
    const picks = hero ? list.slice(0, 3) : [...list].sort((a, b) => (stockFirst ? seen(a) - seen(b) || (b.weeksLeft ?? 0) - (a.weeksLeft ?? 0) : (b.stock ?? 0) - (a.stock ?? 0))).slice(0, 3)
    const why = (x: X) =>
      hero
        ? ja ? `「${req}」に近い、${x.name ?? ''}を選びました。` : `${x.name ?? ''} is closest to "${req}".`
        : stockFirst
          ? ja ? `配信日に在庫 ${x.weeksLeft ?? '-'} 週分。今週・前週の訴求は ${seen(x)} 回。` : `${x.weeksLeft ?? '-'} weeks of stock on the day; featured ${seen(x)} times this/last week.`
          : ja ? `在庫 ${x.stock ?? '-'} で、「${req}」に合います。` : `Stock ${x.stock ?? '-'}; fits "${req}".`
    return J({ mode: 'update', reply: ja ? `「${req}」に合う候補を 3 つ選びました。` : `Here are three picks for "${req}".`, ideas: picks.map((x) => ({ code: x.code, why: why(x) })) })
  }

  // シンプルな配信カードで、配信の全体を AI に頼む(SU1 段階 b)。見出し・コピーと、あればセクションの見出しを替えた案を 2 つ
  if (task === 'suggest_whole_rewrite') {
    const req = String(p.request ?? '')
    const cur = (p.current ?? {}) as { headline?: string; copy?: string; subject?: string; section_titles?: string[] }
    const ja = hasJa(cur.headline ?? '') || hasJa(req)
    if (/[?？]|どう思/.test(req)) return J({ mode: 'answer', reply: ja ? '全体としてテーマに沿っています。見出しをもう少し短くすると、メリハリが出ます。' : 'It follows the theme well. A shorter headline would add punch.' })
    const heroes = (p.heroes as { code?: string }[] | undefined) ?? []
    const titles = (cur.section_titles ?? []).filter(Boolean)
    const ideas = ja
      ? [
          { title: 'やわらかく', why: `「${req}」に合わせ、語りかける言い方にそろえました。`, changes: { headline: '今年の秋も、重ね着で', copy: '肌寒い朝も、ふわっと軽いニットで気分よく。', ...(cur.subject ? { subject: '秋の重ね着、そろいました' } : {}), ...(titles.length ? { section_titles: titles.map((x) => `${x}をゆるっと`) } : {}) } },
          { title: '季節を前に', why: '季節の言葉を先に出し、画像も明るいものにしました。', changes: { headline: '秋、はじまる', copy: '色づく季節に、いちばん似合う一枚を。', ...(heroes[0]?.code ? { hero_code: heroes[0].code } : {}) } },
        ]
      : [
          { title: 'Laid-back', why: `Rewritten in a relaxed voice for "${req}".`, changes: { headline: 'Easy Layers for Fall', copy: 'Soft knits and light jackets for those cool mornings.', ...(cur.subject ? { subject: 'Your easy fall layers are here' } : {}), ...(titles.length ? { section_titles: titles.map((x) => `Easy ${x}`) } : {}) } },
          { title: 'Season first', why: 'Leads with the season and uses a brighter image.', changes: { headline: 'Fall Starts Here', copy: 'The one layer that suits the season best.', ...(heroes[0]?.code ? { hero_code: heroes[0].code } : {}) } },
        ]
    return J({ mode: 'update', reply: ja ? `「${req}」の方向で、全体を直す案を 2 つ考えました。` : `Two ways to rework the whole delivery for "${req}".`, ideas })
  }

  if (task === 'suggest_push') {
    const name = String(card.name ?? '')
    return en
      ? J({ notifications: [
          { title: `${name}: new picks are in`, body: 'Tap to see this week’s picks, chosen for cool mornings. Ends Sunday.', angle: 'Product appeal' },
          { title: 'Cozy layers for chilly days', body: 'Fresh fall layers just landed. See the full edit in the app.', angle: 'Seasonal' },
          { title: 'Last chance this week', body: 'Our picks are going fast — check them out before Sunday.', angle: 'Urgency' },
        ] })
      : J({ notifications: [
          { title: `${name}: 新しいおすすめが届きました`, body: '肌寒い朝に合う、今週のおすすめをアプリでチェック。日曜まで。', angle: '商品の魅力' },
          { title: '肌寒い日の、重ね着の新作', body: '秋の新作が入荷しました。特集をアプリで見られます。', angle: '季節感' },
          { title: '今週のおすすめは日曜まで', body: '人気の商品から売り切れています。お早めにチェックしてください。', angle: '期限' },
        ] })
  }

  if (task === 'suggest_subjects') {
    // AB テストの別の案(abTest あり)は、切り口を変えた案にする(撮影用の簡単な身代わり)
    const b = !!p.abTest
    return en
      ? J({ subjects: b
          ? [
              { subject: 'Last call: fall layers end Sunday', preheader: 'Our most-loved layers are going fast. See what is left before the weekend.', angle: 'Urgency' },
              { subject: 'What to wear on a 15°C morning', preheader: 'Three easy layering ideas for chilly mornings and warm afternoons.', angle: 'Use case' },
              { subject: 'Your fall edit is here', preheader: 'Picked for you: knits, trenches and boots for the new season.', angle: 'Personal' },
            ]
          : [
              { subject: 'New fall layers just landed', preheader: 'Soft knits and light outerwear for cool mornings. Shop the edit.', angle: 'Seasonal' },
              { subject: 'The knit you will wear all season', preheader: 'Quality yarns, easy shapes. Find your favorite before it sells out.', angle: 'Product appeal' },
              { subject: 'This week only: fall picks', preheader: 'Hand-picked new arrivals, available until Sunday.', angle: 'Deadline' },
            ] })
      : J({ subjects: b
          ? [
              { subject: '日曜まで。人気の秋アウター、残りわずか', preheader: '売れ行きの良いアウターから品薄になっています。週末の前にチェックしてください。', angle: '期限' },
              { subject: '朝 15℃ の日、何を着る?', preheader: '肌寒い朝と暖かい昼に。重ね着のコツを 3 つ、今週の新作で紹介します。', angle: '使う場面' },
              { subject: 'あなたに選んだ、秋の 3 着', preheader: 'ニット・トレンチ・ブーツ。今季の装いの軸になる新作を集めました。', angle: '提案' },
            ]
          : [
              { subject: '秋の新作、重ね着アイテムが届きました', preheader: 'やわらかなニットと軽いアウター。肌寒い朝にちょうどいい新作をまとめました。', angle: '季節感' },
              { subject: '一枚で決まる、秋のニット', preheader: '上質な糸とこなれた形。売り切れる前に、お気に入りを見つけてください。', angle: '商品の魅力' },
              { subject: '今週だけのおすすめ、日曜まで', preheader: 'スタッフが選んだ新作を、日曜日までの特集でお届けします。', angle: '期限' },
            ] })
  }

  if (task === 'suggest_tasks') {
    // 返信の文を、そのまま「やること」にする(撮影用の簡単な身代わり)
    const reply = String(p.reply ?? '')
    const asker = String(p.asker ?? '')
    const due = String((p.card as Obj | undefined)?.productionDue ?? '')
    const sentences = reply.split(/(?<=[.。!！])\s*/).map((s) => s.trim()).filter((s) => s.length > 3).slice(0, 2)
    return J({ tasks: sentences.map((s) => ({ text: (en ? 'Apply: ' : '反映: ') + s.replace(/[.。]$/, ''), assignee: asker, due })) })
  }

  if (task === 'suggest_instructions') {
    // 制作指示は、見出し(###)と箇条書きの Markdown(aiDraft.ts の指示と同じ形)
    return en
      ? J({ instructions: [
          { text: '### Layout\n- Full-width hero, then 4 products in a 2×2 grid\n- Generous white space between blocks\n### Main image\n- Autumn outfit, natural light, full look\n### Color & tone\n- Warm brown to terracotta; quiet dark buttons\n### Products\n- Lead with the light jacket; short notes under each\n### Buttons & notes\n- One "Shop now" under the hero; keep prices visible', angle: 'Classic layout' },
          { text: '### Layout\n- Larger product images, minimal text\n### Main image\n- Close crop that shows the knit texture\n### Color & tone\n- Soft beige background, muted accents\n### Products\n- Let materials speak; one line per product\n### Buttons & notes\n- Outline buttons; avoid sale-style red', angle: 'Product first' },
          { text: '### Layout\n- Story flow: hero, then layered outfits\n### Main image\n- Golden-hour street scene\n### Color & tone\n- Warm neutrals with gold accents\n### Products\n- Show items as part of complete outfits\n### Buttons & notes\n- Refined, spacious typography', angle: 'Mood-driven' },
        ] })
      : J({ instructions: [
          { text: '### レイアウト\n- メインビジュアルを全幅、その下に商品 4 点を 2×2 のグリッド\n- ブロックの間の余白を多めに取る\n### メイン画像\n- 秋のコーディネートを、自然光で全身\n### 色とトーン\n- ブラウン〜テラコッタの温かみ。ボタンは落ち着いた濃色\n### 商品の見せ方\n- ライトジャケットを先頭に。各商品に短い説明\n### ボタン・注意点\n- メイン画像の下に「商品を見る」を 1 つ。価格は必ず見せる', angle: '王道構成' },
          { text: '### レイアウト\n- 商品画像を大きめに、文字は控えめ\n### メイン画像\n- ニットの質感が分かる寄りのクロップ\n### 色とトーン\n- 淡いベージュの背景、差し色は控えめ\n### 商品の見せ方\n- 素材の魅力を前面に。説明は 1 行\n### ボタン・注意点\n- 枠線のボタン。セール調の赤は使わない', angle: '商品を主役に' },
          { text: '### レイアウト\n- 物語の流れ: メインビジュアル → 重ね着のコーディネート\n### メイン画像\n- 夕暮れの街角\n### 色とトーン\n- 温かみのある中間色に、ゴールドの差し色\n### 商品の見せ方\n- 単品ではなく、コーディネートの一部として見せる\n### ボタン・注意点\n- 上品で、余白のあるタイポグラフィ', angle: '世界観重視' },
        ] })
  }

  // テンプレートを AI で作る(T9): 商品の数と雰囲気から、主役 1 点(特集)+ 残りのグリッド + もっと見る、の決まった形
  if (task === 'design_template') {
    const req = (p.request ?? {}) as { purpose?: string; itemCount?: number; hero?: string; angle?: string }
    const n = Math.max(1, Math.min(24, Math.round(Number(req.itemCount) || 4)))
    const ja = !en
    const sale = req.hero === 'offer'
    const card = { type: 'box', w: 1, view: 'card', fields: sale ? ['name', 'price', 'badge'] : ['name', 'price'], ...(sale ? { badge: 'SALE' } : {}) }
    // 残りは 2 列のグリッド(奇数の最後は、そのまま 1 マス)
    const rest = Array.from({ length: Math.ceil((n - 1) / 2) }, (_, i) => (i * 2 + 2 <= n - 1 ? [card, card] : [card]))
    const sections = [
      { name: ja ? '主役' : 'Hero pick', heading: false, copy: true, aiNote: ja ? 'いちばん見せたい 1 点' : 'The one item to feature most', rows: [[{ type: 'box', w: 2, view: 'detail', fields: ['name', 'desc', 'price', 'button'], aiNote: ja ? '主役の新作' : 'The lead new arrival' }]] },
      ...(n > 1 ? [{ name: ja ? 'おすすめ' : 'Picks', heading: true, copy: true, aiNote: ja ? '主役と合わせやすいもの' : 'Easy to pair with the hero', rows: [...rest, [{ type: 'button', w: 2, label: ja ? 'もっと見る' : 'See more', style: 'outline' }]] }] : []),
    ]
    return J({
      name: ja ? (sale ? 'セールの主役 + グリッド' : '主役 1 点 + グリッド') : sale ? 'Sale hero + grid' : 'One hero + grid',
      description: ja ? `${req.purpose || '新作の紹介'}に。主役を大きく見せ、残り ${n - 1} 点を 2 列で並べます。` : `For ${req.purpose || 'new arrivals'}. Features one item large and shows the other ${n - 1} in two columns.`,
      hero: req.hero ?? 'standard',
      heroButton: ja ? '商品を見る' : 'Shop now',
      sections,
      reason: ja ? '目的が 1 つの商品を軸にしているため、主役を特集の形で大きく見せ、残りは比べやすいグリッドにしました。' : 'The purpose centers on one product, so it is featured large and the rest are in an easy-to-compare grid.',
    })
  }

  if (task === 'suggest_template') {
    return en
      ? J({ template: 'cat2', reason: 'The theme calls for two angles (outerwear and knits) shown side by side.' })
      : J({ template: 'cat2', reason: '複数の切り口(アウターとニット)を並べて見せたいテーマのため。' })
  }

  // 制作のページの手直し: 文言の頼みは要素の直し、画像の頼みはメイン画像の差し替え、それ以外は見た目(本文の背景)の直しを返す
  if (task === 'revise_production') {
    const req = String(p.request ?? '')
    if (/[?？]|どう思/.test(req)) return J({ mode: 'answer', reply: hasJa(req) ? '全体のまとまりは良いです。ボタンの色を少し強めると、押してほしい所がより伝わります。' : 'It hangs together well. A slightly stronger button color would make the call to action clearer.' })
    const els = (p.elements ?? {}) as { texts?: { id: string; value: string }[]; hero?: { id: string } | null }
    const heroes = ((p.candidates as { heroes?: { id: string }[] } | undefined)?.heroes ?? []).filter((h) => h.id !== els.hero?.id)
    const edits: Obj[] = []
    if (/見出し|ヘッドライン|件名|短く|headline|subject|shorter/i.test(req)) {
      const head = els.texts?.find((x) => x.id === 'headline')
      if (head?.value) edits.push({ id: 'headline', value: head.value.slice(0, Math.max(6, Math.ceil(head.value.length / 2))), reason: hasJa(req) ? '前半の言葉だけを残し、ひと目で読める長さにしました。' : 'Kept only the first half so it reads at a glance.' })
    }
    if (/画像|image/i.test(req) && heroes[0]) edits.push({ id: 'hero', hero_id: heroes[0].id, reason: hasJa(req) ? '明るい色味の画像です。' : 'A brighter image.' })
    const html = String(p.html ?? '')
    const body = html.match(/<body style="[^"]*">/)?.[0]
    const patches = edits.length === 0 && body ? [{ find: body, replace: '<body style="margin:0;background:#f4efe6">' }] : []
    return J({ mode: 'update', reply: hasJa(req) ? '頼まれた所を直す案を作りました。' : 'Here is a proposal for your request.', html_patches: patches, element_edits: edits })
  }

  if (task === 'select_hero') {
    const heroes = (p.heroes as HeroIn[] | undefined) ?? []
    const fall = heroes.filter((h) => /秋|fall|autumn/i.test(String(h.season ?? '')) || /new|新作/i.test(String(h.purpose ?? '')))
    const list = [...fall, ...heroes.filter((h) => !fall.includes(h))]
    const pick = list[0]
    if (!pick) return J({ hero: null, candidates: [] })
    return J({
      hero: { code: pick.code, reason: en ? `Fits the theme and the fall season: ${pick.name}.` : `テーマと秋の季節感に合う画像です(${pick.name})。` },
      candidates: list.slice(1, 4).map((h) => ({ code: h.code, reason: en ? `Alternative with a similar mood: ${h.name}.` : `近い雰囲気の候補です(${h.name})。` })),
    })
  }

  if (task.startsWith('select_section')) {
    const pool = ((p.products as ProductIn[] | undefined) ?? []).filter((x) => (x.stock ?? 0) >= 50)
    const section = (p.section ?? {}) as Obj
    const slots = Number(section.slots) || 4
    const others = (p.otherSections as Obj[] | undefined) ?? []
    const idx = others.filter((o) => Array.isArray(o.productNames) && (o.productNames as unknown[]).length > 0).length
    const wantTitle = Boolean(section.wantTitle)

    // 指示(チャット)に、商品名が入っていれば、先頭にする。「安い・affordable」なら、価格の安い順
    let ranked = [...pool].sort((a, b) => (a.salesTrend === '上昇' ? 0 : 1) - (b.salesTrend === '上昇' ? 0 : 1) || (b.rating ?? 0) - (a.rating ?? 0))
    if (/安|手頃|affordable|cheap/i.test(last)) ranked = [...pool].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    if (wantTitle && !last) {
      const cats = ['アウター', 'トップス', 'ボトムス', 'シューズ']
      const cat = cats[idx % cats.length]
      ranked = [...ranked.filter((x) => x.category === cat), ...ranked.filter((x) => x.category !== cat)]
    }
    const named = pool.find((x) => last && (last.toLowerCase().includes(x.name.toLowerCase()) || last.toLowerCase().includes(x.code.toLowerCase())))
    if (named) ranked = [named, ...ranked.filter((x) => x !== named)]

    const why = (x: ProductIn) =>
      en
        ? `Stock ${x.stock}, sales ${TREND_EN[x.salesTrend ?? ''] ?? 'flat'}, rating ★${x.rating}; fits "${theme || 'this story'}".`
        : `在庫${x.stock}、売上トレンド${x.salesTrend ?? '横ばい'}、評価★${x.rating}。「${theme || 'このテーマ'}」に合う${x.category ?? '商品'}です。`
    const products = ranked.slice(0, slots + 3).map((x) => ({ code: x.code, reason: why(x) }))

    const titlesJa = [
      { title: '重ねて楽しむ、秋のアウター', reason: 'アウターを軸にした切り口。' },
      { title: 'ニットで作る、秋の定番', reason: 'ニットを軸にした切り口。' },
      { title: '雨の日の、秋支度', reason: '雨具を軸にした切り口。' },
    ]
    const titlesEn = [
      { title: 'Outer Layers for Crisp Days', reason: 'An outerwear-led angle.' },
      { title: 'Knits That Layer Well', reason: 'A knit-led angle.' },
      { title: 'Rain-Ready Fall Picks', reason: 'A rainwear-led angle.' },
    ]
    const rot = <T,>(a: T[]) => [...a.slice(idx % a.length), ...a.slice(0, idx % a.length)]
    const used = new Set(others.map((o) => String(o.title ?? '')))
    const all = rot(en ? titlesEn : titlesJa)
    const titles = wantTitle ? [...all.filter((x) => !used.has(x.title)), ...all.filter((x) => used.has(x.title))] : []
    const copies = en
      ? [
          { copy: 'Find comfort and polish in layers that welcome the crisp fall breeze.', angle: 'Refined seasonal layering' },
          { copy: 'Warm up gently with soft textures and subtle tones for early autumn days.', angle: 'Cozy transitional style' },
          { copy: 'Easy pieces that carry you from chilly mornings to golden afternoons.', angle: 'Classy fall versatility' },
        ]
      : [
          { copy: '涼やかな秋風にぴったりの、上品な重ね着を。', angle: '上品な季節の重ね着' },
          { copy: 'やわらかな素材と穏やかな色で、秋のはじめをあたたかく。', angle: 'ほっとする移行期の装い' },
          { copy: '朝の肌寒さから午後のやわらかな日ざしまで、ずっと心地よく。', angle: '一日中使える万能さ' },
        ]

    const r = reply(
      named ? `ご指定の「${named.name}」を先頭に含めて、選び直しました。` : '指示を反映して、選び直しました。',
      named ? `Included "${named.name}" first and re-selected this section.` : 'Re-selected this section with your instruction applied.',
    )
    if (task === 'select_section_titles') return J({ titles, ...r })
    if (task === 'select_section_copies') return J({ copies, ...r })
    if (task === 'select_section_products') return J({ products, ...r })
    return J({ titles, copies, products, ...r })
  }

  return J({ error: 'mock agent: unknown task' })
}
