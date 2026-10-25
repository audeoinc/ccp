import { useEffect, useRef, useState, type ReactNode } from 'react'
import { InfoLabel, Badge, Button, Field, Input, Text, ToggleButton, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowSwapRegular, ArrowUploadRegular, ArrowUpRegular, ChatRegular, DeleteRegular, DismissRegular, EditRegular, ImageEditRegular, ImageMultipleRegular, SparkleRegular, WarningRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { Candidates } from '../Candidates'
import { ChooseDrawer } from '../ChoosePanel'
import { DropZone } from '../DropZone'
import { HeroCandidates } from '../HeroCandidates'
import { ImageThumb } from '../ImageThumb'
import { AlertMark } from '../AlertMark'
import { LowStockBadge } from '../ProductMarks'
import { heroImage, productImage } from '../images'
import { yen } from '../items'
import { locale, optionLabel, tr, useT } from '../i18n'
import { OpenLink } from '../LinkText'
import { productUrl } from '../links'
import { productMarket } from '../market'
import { THEME_TYPES, themeTypeLabel } from '../themeTypes'
import { channelOptions, countryOptions } from '../status'
import { baseTemplateId, sectionIndexAt, sectionsOf, templateOptions } from '../templates'
import { TemplateThumb } from '../TemplateThumb'
import { PREHEADER_MAX, SUBJECT_MAX } from '../textLimits'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '../pushLink'
import { PushThumb } from '../PushThumb'
import type { Product } from '../models/products'
import { partKey, type PartRef } from './parts'
import { PartAiChat } from './PartAiChat'
import { ProductionMemo } from './ProductionMemo'
import { askHeroPick, askPartRewrite, askProductPick, askWholeRewrite, readWhole, type PartAnswer, type PartTurn, type WholeChange, type WholeTexts } from './partAi'
import { ProductSwap, type SwapAt } from './ProductSwap'
import { AiPicks, type Picks } from '../ProductChooser'
import type { SimpleEditor, SimpleField } from './editor'
import { confirmDialog } from '../confirm'
import { ChoiceField, NameField, OwnerField, ScheduledAtField, StatusField, TargetField } from '../DeliveryInfoFields'

const useStyles = makeStyles({
  root: { display: 'grid', alignContent: 'start', rowGap: '12px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  title: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  deselect: { marginLeft: 'auto' },
  warn: { display: 'flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteMarigoldForeground2 },
  grow: { flexGrow: 1, minWidth: 0 },
  // 名前・直す・開くは縮めず、URL の文だけを省略する
  linkLine: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, '& > *:not(:nth-child(2))': { flexShrink: 0, whiteSpace: 'nowrap' } },
  linkText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeBase200 },
  // メイン画像を変える欄(開いたときだけ。いまの画像の下に、ひとまとまりで)
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '10px', rowGap: '10px' },
  // 商品の見比べ・情報の箱
  product: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', columnGap: '10px', alignItems: 'start', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  productText: { display: 'grid', rowGap: '2px', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  compare: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' },
  tplList: { display: 'grid', rowGap: '8px' },
  tplCard: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '10px', alignItems: 'start', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorBrandBackground2 } },
  tplOn: { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  ideaText: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap' },
  ideaRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', minWidth: 0 },
  productOpen: { borderRadius: tokens.borderRadiusMedium, cursor: 'pointer', ':hover > div': { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 } },
  // 見比べの列は狭いので、写真の下に文字を置き、名前を折り返す
  productTall: { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '6px', justifyItems: 'center' },
  nameWrap: { whiteSpace: 'normal' },
  compareCol: { display: 'grid', rowGap: '4px', alignContent: 'start', minWidth: 0 },
  compareBox: { display: 'grid', rowGap: '8px', padding: '10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground2 },
  // 何も選んでいないときの、載せた商品の一覧
  list: { display: 'grid', rowGap: '4px' },
  listRow: { display: 'grid', gridTemplateColumns: '20px 32px minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'center', padding: '2px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  num: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, textAlign: 'right' },
  heroNow: { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', columnGap: '10px', alignItems: 'start' },
  heroCands: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '6px' },
  pickRow: { display: 'grid', rowGap: '2px', padding: '6px 8px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  heroCandOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
  heroCand: { display: 'grid', rowGap: '2px', padding: '4px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  // この配信のねらい(テーマ・切り口)。直す部品の上の、控えめな箱
  aim: { display: 'grid', rowGap: '2px', width: '100%', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, boxSizing: 'border-box' },
  aimBtn: { border: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover } },
  aimTheme: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1 },
  readonly: { display: 'grid', rowGap: '2px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
})

interface Props {
  editor: SimpleEditor
  part: PartRef | null
  /** 商品の一覧で押した商品(選んでいる枠と見比べる。載せた商品か候補の鍵) */
  compareKey: string | null
  /** 見比べている商品を、選んでいる枠に置く */
  onPlace: (key: string) => void
  onCompareDone: () => void
  /** 部品を選び直す(何も選んでいないときの、商品の一覧から) */
  onPick: (p: PartRef | null) => void
  /** 部品ごとの AI とのやり取り(部品を選び直しても残るよう、画面の側が持つ) */
  chats: Record<string, PartTurn[]>
  setChat: (key: string, f: (prev: PartTurn[]) => PartTurn[]) => void
  /** 増えたら、メイン画像を入れ替える欄を開く(プレビューの右クリックの「画像を入れ替える」) */
  heroReplace?: number
  /** 商品の入れ替えの引き出しを開いている所(SU9。入口がいくつあっても、開くのは 1 か所) */
  swapAt: SwapAt | null
  onSwapAt: (at: SwapAt | null) => void
  /** 入れ替えで、行の鍵が変わったとき(候補と入れ替えたとき) */
  onSwapped: (from: string, to: string) => void
}

/** 選んだ部品のペイン(SU1 ⑨)。選んだものによって中身が替わる。入力は、そのまま配信カードの状態に書くので、反映の前からプレビューに写る */
export function PartPane({ editor: e, part, compareKey, onPlace, onCompareDone, onPick, chats, setChat, heroReplace, swapAt, onSwapAt, onSwapped }: Props) {
  const t = useT()
  const s = useStyles()
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const sections = sectionsOf(e.template)

  // 文言の案を仮に写している間の、元の文言(マウスが離れたら戻す。描画をまたいで持つので ref)
  const textOriginal = useRef<string | null>(null)
  // メイン画像を変える欄を開いている部品(部品を移ると畳む。まだ画像がなければ、はじめから開く)
  const [heroOpenKey, setHeroOpenKey] = useState<string | null>(null)
  const heroOpen = !!part && (!e.hero || heroOpenKey === partKey(part))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (heroReplace && part?.kind === 'hero') setHeroOpenKey(partKey(part))
    // 頼まれたとき(数が増えたとき)だけ開く。部品を選び直したときには開かない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroReplace])
  const [aiPicks, setAiPicks] = useState<Picks | null>(null)
  const picksOf = (key: string) => (aiPicks?.key === key ? aiPicks : undefined)
  const recommend = async (key: string, ask: () => Promise<PartAnswer>) => {
    setAiPicks({ key, ideas: [], busy: true })
    try {
      const r = await ask()
      setAiPicks({ key, ideas: r.ideas, busy: false, error: r.ideas.length ? undefined : r.reply || tr('おすすめが見つかりませんでした', 'No recommendations found') })
    } catch (err) {
      setAiPicks({ key, ideas: [], busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  const productNames = () => e.items.flatMap((i) => byId.get(i.productId)?.name ?? [])
  const recommendHeroes = (key: string) =>
    recommend(key, () =>
      askHeroPick({
        card: e.aiCard(),
        angle: e.form.copyAngle,
        current: e.hero,
        heroes: e.poolHeroes,
        productNames: productNames(),
        request: tr('この配信のテーマと商品に合うメイン画像を、3〜4 枚おすすめしてください。', 'Recommend 3 or 4 main images that fit this delivery\'s theme and products.'),
        history: [],
      }),
    )
  /** 商品のフロートを開く。フロートの「入れ替える」は、この箱の真下の引き出しを開く(SU9 (h)) */
  const openFloat = (itemKey: string) => e.openProduct(itemKey, undefined, () => onSwapAt({ itemKey, at: 'pane' }))
  const [linkEditing, setLinkEditing] = useState(false)
  const heroDefaultLink = e.linkSpots.find((x) => x.kind === 'hero')?.defaultUrl
  // 使える期限が配信日より前(選んだあとで期限が来た画像。入れ替えを促す)
  const heroExpired = !!e.hero?.usable_until && !!e.form.scheduledAt && e.hero.usable_until < e.form.scheduledAt.slice(0, 10)
  /** 管理画面と照らし合わせるための 1 行(番号・季節・用途) */
  const heroFacts = (h: NonNullable<typeof e.hero>) => [h.image_code, h.season_name, h.purpose_name].filter(Boolean).join(' ・ ')
  const chatOf = (p: PartRef | 'whole') => {
    const key = p === 'whole' ? 'whole' : partKey(p)
    return { turns: chats[key] ?? [], setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => setChat(key, f) }
  }
  /** 文言の部品: 入力欄と、その部品を AI に頼む欄。案はそのまま文言に入れて写し、離したら元の文言に戻す */
  const aiChat = (kind: string, label: string, value: string, onChange: (v: string) => void) => {
    if (!part) return null
    return (
      <PartAiChat
        key={partKey(part)}
        kind={kind}
        label={label}
        {...chatOf(part)}
        ask={(request, history) =>
          askPartRewrite({
            card: e.aiCard(),
            angle: e.form.copyAngle,
            part: { kind, label, current: value },
            context: { subject: e.form.subject || e.form.name, preheader: e.form.preheader, headline: e.form.headline, copy: e.form.copy, pushTitle: e.form.pushTitle, pushBody: e.form.pushBody },
            request,
            history,
          })
        }
        renderIdea={(idea) => <span className={s.ideaText}>{idea.value}</span>}
        isCurrent={(idea) => idea.value === value}
        onPreview={(idea) => {
          if (idea) {
            if (textOriginal.current === null) textOriginal.current = value
            onChange(idea.value)
          } else if (textOriginal.current !== null) {
            onChange(textOriginal.current)
            textOriginal.current = null
          }
        }}
        onAdopt={(idea) => {
          textOriginal.current = null
          onChange(idea.value)
        }}
      />
    )
  }
  /** 商品の枠(載せた商品 itemKey / 空いた枠)を AI に頼む欄 */
  const productChat = (itemKey: string | null) =>
    part && (
      <PartAiChat
        key={partKey(part)}
        kind={itemKey ? 'product' : 'slot'}
        label={itemKey ? t('この枠の商品', 'This product') : t('空いた枠', 'Empty slot')}
        {...chatOf(part)}
        placeholder={t('例: 2 万円以下のアウターで、在庫の多いもの', 'e.g. Outerwear under $150 with plenty of stock')}
        ask={(request, history) => {
          const it = itemKey ? e.items.find((i) => i.key === itemKey) : undefined
          return askProductPick({
            card: e.aiCard(),
            angle: e.form.copyAngle,
            current: it ? byId.get(it.productId) : undefined,
            products: e.poolProducts,
            inCard: e.items.flatMap((i) => byId.get(i.productId) ?? []),
            request,
            history,
          })
        }}
        renderIdea={(idea) => productLine(byId.get(idea.value))}
        isCurrent={(idea) => e.items.some((i) => i.productId === idea.value)}
        onPreview={(idea) => e.setAiPreview(idea ? { item: { key: itemKey ?? '', productId: idea.value } } : null)}
        onAdopt={(idea) => {
          e.setAiPreview(null)
          if (itemKey) e.replaceItem(itemKey, idea.value, idea.why)
          else e.addProduct(idea.value, e.items.length)
        }}
      />
    )
  // 全体への依頼の案を仮に写している間の、元の文言(描画をまたいで持つ)
  const wholeOriginal = useRef<WholeTexts | null>(null)
  const currentTexts = (): WholeTexts => ({
    subject: e.form.subject,
    preheader: e.form.preheader,
    headline: e.form.headline,
    copy: e.form.copy,
    pushTitle: e.form.pushTitle,
    pushBody: e.form.pushBody,
    sectionTitles: [...e.sectionTitles],
    sectionCopies: [...e.sectionCopies],
  })
  /** 案で変わる文言の名前と、新しい文言(案の中に並べる) */
  const wholeLines = (c: WholeChange) => {
    const out: [string, string][] = []
    const add = (label: string, v?: string) => v !== undefined && out.push([label, v])
    add(t('件名', 'Subject'), c.texts.subject)
    add(t('プリヘッダー', 'Preheader'), c.texts.preheader)
    add(t('見出し', 'Headline'), c.texts.headline)
    add(t('コピー', 'Copy'), c.texts.copy)
    add(t('通知のタイトル', 'Notification title'), c.texts.pushTitle)
    add(t('通知の本文', 'Notification body'), c.texts.pushBody)
    c.texts.sectionTitles?.forEach((v, i) => v !== (e.sectionTitles[i] ?? '') && add(t(`セクション ${i + 1} の見出し`, `Section ${i + 1} heading`), v))
    c.texts.sectionCopies?.forEach((v, i) => v !== (e.sectionCopies[i] ?? '') && add(t(`セクション ${i + 1} のコピー`, `Section ${i + 1} copy`), v))
    if (c.heroId) add(t('メイン画像', 'Main image'), e.poolHeroes.find((h) => h.id === c.heroId)?.name ?? '')
    return out
  }
  /** 何も選んでいないときの、配信の全体を AI に頼む欄。案は文言とメイン画像をまとめて写し、押すとまとめて入れる */
  const wholeChat = (
    <PartAiChat
      key="whole"
      kind="whole"
      label={t('配信の全体', 'Whole delivery')}
      {...chatOf('whole')}
      placeholder={t('例: 20 代向けに、もっとカジュアルに', 'e.g. More casual, for people in their 20s')}
      ask={(request, history) => askWholeRewrite({ card: e.aiCard(), angle: e.form.copyAngle, channel: e.channel, current: currentTexts(), hero: e.hero, heroes: e.poolHeroes, request, history })}
      renderIdea={(idea) => {
        const c = readWhole(idea.value)
        return c ? (
          <span style={{ display: 'grid', rowGap: 2 }}>
            <span className={s.name}>{c.title}</span>
            {wholeLines(c).map(([label, v]) => (
              <span key={label} className={s.meta}>
                <span className={s.label}>{label}</span> {v}
              </span>
            ))}
          </span>
        ) : null
      }}
      isCurrent={(idea) => {
        const c = readWhole(idea.value)
        const now = currentTexts()
        return !!c && Object.entries(c.texts).every(([k, v]) => JSON.stringify(now[k as keyof WholeTexts]) === JSON.stringify(v)) && (!c.heroId || c.heroId === e.hero?.id)
      }}
      onPreview={(idea) => {
        const c = idea && readWhole(idea.value)
        if (c) {
          if (wholeOriginal.current === null) wholeOriginal.current = currentTexts()
          e.applyTexts(c.texts)
          e.setAiPreview(c.heroId ? { heroId: c.heroId } : null)
        } else {
          if (wholeOriginal.current) e.applyTexts(wholeOriginal.current)
          wholeOriginal.current = null
          e.setAiPreview(null)
        }
      }}
      onAdopt={(idea) => {
        const c = readWhole(idea.value)
        wholeOriginal.current = null
        e.setAiPreview(null)
        if (!c) return
        e.applyTexts(c.texts)
        if (c.heroId) e.setHero(c.heroId, idea.why)
      }}
    />
  )
  /** 案の商品の 1 行(写真・名前・コード・価格・在庫) */
  const productLine = (p: Product | undefined) =>
    p ? (
      <span className={s.ideaRow}>
        <ImageThumb src={productImage(p)} alt={p.name} width={36} height={44} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span className={s.name}>{p.name}</span>
          <span className={s.meta}>{`${p.product_code ?? ''} ・ ${yen(p.price, productMarket(p))} ・ ${t(`在庫 ${p.stock ?? '-'}`, `Stock ${p.stock ?? '-'}`)}`}</span>
        </span>
      </span>
    ) : null
  const text = (k: SimpleField, label: string, opts: { rows?: number; placeholder?: string; hint?: string; max?: number } = {}) => (
    <>
      <Field
        label={
          opts.max ? (
            <span className={s.row}>
              {label}
              {/* 受信一覧・通知で切れずに見える長さの目安(詳しい配信カードと同じ値) */}
              <span className={e.form[k].length > opts.max ? s.warn : s.caption}>{`${e.form[k].length} / ${opts.max}`}</span>
            </span>
          ) : (
            label
          )
        }
        hint={opts.hint}
        size="small"
      >
        <AutoTextarea heightKey={`PartPane.${k}`} size="small" rows={opts.rows ?? 2} autoFocus value={e.form[k]} placeholder={opts.placeholder} onChange={(_, d) => e.setField(k, d.value)} />
      </Field>
      {aiChat(k, label, e.form[k], (v) => e.setField(k, v))}
    </>
  )

  const productBox = (p: Product | undefined, extra?: ReactNode, image?: string, tall = false) =>
    p ? (
      <div className={mergeClasses(s.product, tall && s.productTall)}>
        <ImageThumb src={productImage(p, image)} alt={p.name} width={64} height={80} />
        <span className={s.productText}>
          <span className={mergeClasses(s.name, tall && s.nameWrap)}>
            <AlertMark kind={e.alertKinds.get(p.id)} />
            {p.name}
          </span>
          <span className={s.meta}>{`${p.product_code ?? ''} ・ ${yen(p.price, productMarket(p))}`}</span>
          <span className={s.meta}>{t(`在庫 ${p.stock ?? '-'}`, `Stock ${p.stock ?? '-'}`)}{p.sales_trend_name ? ` ・ ${optionLabel(p.sales_trend_name)}` : ''}</span>
          <span className={s.row}>
            <LowStockBadge product={p} />
            {productUrl(p) && <OpenLink url={productUrl(p)} label={t('商品ページ', 'Product page')} />}
          </span>
          {extra}
        </span>
      </div>
    ) : null

  // 商品の一覧で押した商品と、選んでいる枠の見比べ(SU1 ⑩)
  const compareBlock = (() => {
    if (!compareKey || !part || (part.kind !== 'product' && part.kind !== 'slot')) return null
    const it = e.items.find((i) => i.key === compareKey)
    const cand = it ? undefined : e.candidates.find((c) => c.key === compareKey)
    const other = byId.get((it ?? cand)?.productId ?? '')
    if (!other) return null
    const cur = part.kind === 'product' ? e.items.find((i) => i.key === part.itemKey) : undefined
    if (cur && cur.key === compareKey) return null
    const run = () => onPlace(compareKey)
    return (
      <div className={s.compareBox}>
        <span className={s.label}>{t('見比べる', 'Compare')}</span>
        <div className={s.compare}>
          <div className={s.compareCol}>
            <span className={s.caption}>{cur ? t('この枠の商品', 'In this slot') : t('この枠', 'This slot')}</span>
            {cur ? productBox(byId.get(cur.productId), undefined, cur.imageUrl, true) : <span className={s.caption}>{t('(空き)', '(empty)')}</span>}
          </div>
          <div className={s.compareCol}>
            <span className={s.caption}>{it ? t('押した商品(載せている)', 'Clicked (in this delivery)') : t('押した商品(候補)', 'Clicked (candidate)')}</span>
            {productBox(other, undefined, it?.imageUrl, true)}
          </div>
        </div>
        <div className={s.row}>
          <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={run}>
            {cur ? t('この枠の商品と入れ替える', 'Swap with the product in this slot') : t('この枠に入れる', 'Put in this slot')}
          </Button>
          <Button size="small" onClick={onCompareDone}>{t('やめる', 'Cancel')}</Button>
        </div>
      </div>
    )
  })()

  const body = (() => {
    if (!part)
      return (
        <>
          {/* 何も選んでいないときだけの一言(X72 の案内の置き方 1)。キーの操作などの詳しい説明は、見出しの ⓘ */}
          <span className={s.caption}>{t('直したい所を、プレビューで押してください', 'Click what you want to change in the preview')}</span>
          {wholeChat}
          <span className={s.label}>{t(`載せた商品(${e.items.length})`, `Products (${e.items.length})`)}</span>
          {e.items.length === 0 && <span className={s.caption}>{t('まだ商品がありません。プレビューの空いた枠を押すと、商品を探せます。', 'No products yet. Click an empty slot in the preview to find one.')}</span>}
          <div className={s.list}>
            {e.items.map((it, i) => {
              const p = byId.get(it.productId)
              const swapOpen = swapAt?.at === 'list' && swapAt.itemKey === it.key
              return (
                <div key={it.key}>
                <div className={s.listRow} onMouseEnter={() => e.hoverProduct(it.key)} onMouseLeave={() => e.hoverProduct(null)}>
                  <span className={s.num}>{i + 1}</span>
                  <ImageThumb src={productImage(p, it.imageUrl)} alt={p?.name ?? ''} width={32} height={40} />
                  <Button size="small" appearance="transparent" style={{ justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden' }} onClick={() => onPick({ kind: 'product', itemKey: it.key })}>
                    <span className={s.name}>
                      <AlertMark kind={e.alertKinds.get(it.productId)} />
                      {p?.name}
                    </span>
                  </Button>
                  <span className={s.row}>
                    <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0 || e.saving} onClick={() => e.moveItem(i, i - 1)} aria-label={t('前へ', 'Move up')} />
                    <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === e.items.length - 1 || e.saving} onClick={() => e.moveItem(i, i + 1)} aria-label={t('後ろへ', 'Move down')} />
                    <Tooltip content={t('入れ替える', 'Replace')} relationship="label">
                      <ToggleButton size="small" appearance="subtle" icon={<ArrowSwapRegular />} checked={swapOpen} disabled={e.saving} onClick={() => onSwapAt(swapOpen ? null : { itemKey: it.key, at: 'list' })} />
                    </Tooltip>
                  </span>
                </div>
                {/* 入れ替えの引き出しは、その行の真下から(SU9) */}
                <ProductSwap editor={e} itemKey={it.key} open={swapOpen} onOpenChange={(o) => onSwapAt(o ? { itemKey: it.key, at: 'list' } : null)} chats={chats} setChat={setChat} onDone={(k) => onSwapped(it.key, k)} trigger={false} />
                </div>
              )
            })}
          </div>
        </>
      )
    switch (part.kind) {
      case 'subject':
        return text('subject', t('件名', 'Subject'), { rows: 1, placeholder: e.form.name, hint: t('空のときは配信名が件名になります', 'Empty uses the delivery name'), max: SUBJECT_MAX })
      case 'preheader':
        return text('preheader', t('プリヘッダー(受信箱で件名の下に出る文。目安 40〜90 文字)', 'Preheader (shown under the subject in the inbox; aim for 40–90 chars)'), { rows: 2, max: PREHEADER_MAX })
      case 'pushTitle':
        return text('pushTitle', t('通知のタイトル', 'Notification title'), { rows: 1, placeholder: e.form.headline, max: PUSH_TITLE_MAX })
      case 'pushBody':
        return text('pushBody', t('通知の本文', 'Notification body'), { rows: 3, placeholder: e.form.copy, max: PUSH_BODY_MAX })
      case 'headline':
      case 'copy':
        return (
          <>
            {part.kind === 'headline' ? text('headline', t('ヘッドライン(メイン画像に載せる大見出し)', 'Headline (on the main image)'), { rows: 1 }) : text('copy', t('コピー(ヘッドラインの下の導入文)', 'Copy (intro below the headline)'), { rows: 3 })}
          </>
        )
      case 'sectionTitle':
      case 'sectionCopy': {
        const i = part.index
        const isTitle = part.kind === 'sectionTitle'
        const value = (isTitle ? e.sectionTitles[i] : e.sectionCopies[i]) ?? ''
        const label = isTitle ? t(`セクション ${i + 1} の見出し`, `Section ${i + 1} heading`) : t(`セクション ${i + 1} のコピー`, `Section ${i + 1} copy`)
        const setValue = (v: string) => (isTitle ? e.setSectionTitle(i, v) : e.setSectionCopy(i, v))
        return (
          <>
            <Field label={label} size="small" hint={isTitle && !value ? t('空のときは、商品のカテゴリ名を出します', 'Empty shows the product category') : undefined}>
              <AutoTextarea heightKey="PartPane.value" size="small" rows={isTitle ? 1 : 2} autoFocus value={value} onChange={(_, d) => setValue(d.value)} />
            </Field>
            {aiChat(part.kind, label, value, setValue)}
          </>
        )
      }
      case 'hero':
        return (
          <>
            <div className={s.heroNow}>
              {e.hero ? <ImageThumb src={heroImage(e.hero)} alt={e.hero.name} width={120} height={90} /> : <span className={s.caption}>{t('(メイン画像なし)', '(no main image)')}</span>}
              <span className={s.productText}>
                <span className={s.name}>{e.hero?.name ?? t('まだ選んでいません', 'Not chosen yet')}</span>
                {e.heroReason && <span className={s.caption}>{e.heroReason}</span>}
                {e.hero && heroFacts(e.hero) && <span className={s.caption}>{heroFacts(e.hero)}</span>}
                {heroExpired && (
                  <span className={s.warn}>
                    <WarningRegular />
                    {t(`使える期限(${e.hero?.usable_until})が配信日より前です`, `Usable until ${e.hero?.usable_until}, before the delivery date`)}
                  </span>
                )}
                {e.hero && (
                  <span className={s.row}>
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => e.setHero(undefined, '')}>{t('外す', 'Remove')}</Button>
                  </span>
                )}
              </span>
            </div>
            {/* 「入れ替える」は画像の真下。そこから選び直す枠を引き出す(まだ画像がなければ、ボタンなしで枠を開いたまま) */}
            {part && (
              <ChooseDrawer
                key={partKey(part)}
                open={heroOpen}
                onOpenChange={(o) => setHeroOpenKey(o ? partKey(part) : null)}
                closable={!!e.hero}
                label={t('入れ替える', 'Replace')}
                icon={<ImageEditRegular />}
                title={e.hero ? t('メイン画像を選び直す', 'Choose another main image') : t('メイン画像を選ぶ', 'Choose the main image')}
                tabs={[
                  {
                    value: 'recommend',
                    label: t('AI のおすすめ', 'AI picks'),
                    icon: <SparkleRegular />,
                    content: (
                      <AiPicks
                        hint={t('この配信のテーマと商品に合いそうな画像を、AI が挙げます。押すと入れ替わります', 'AI suggests images that fit this delivery. Click one to use it')}
                        picks={picksOf(partKey(part))}
                        hasFallback={e.heroCandidates.length > 0}
                        onAsk={() => void recommendHeroes(partKey(part))}
                      >
                        {(picksOf(partKey(part))?.ideas.map((i) => ({ id: i.value, why: i.why })) ?? e.heroCandidates.map((c) => ({ id: c.heroId, why: c.reason }))).length > 0 && (
                          <div className={s.heroCands}>
                            {(picksOf(partKey(part))?.ideas.map((i) => ({ id: i.value, why: i.why })) ?? e.heroCandidates.map((c) => ({ id: c.heroId, why: c.reason }))).map((c) => {
                              const h = e.poolHeroes.find((x) => x.id === c.id)
                              return h ? (
                                <button key={c.id} type="button" className={mergeClasses(s.heroCand, h.id === e.hero?.id && s.heroCandOn)} title={c.why} onClick={() => e.setHero(h.id, c.why)}>
                                  <ImageThumb src={heroImage(h)} alt={h.name} width={80} height={60} />
                                  <span className={s.caption}>{h.name}</span>
                                </button>
                              ) : null
                            })}
                          </div>
                        )}
                      </AiPicks>
                    ),
                  },
                  {
                    value: 'ask',
                    label: t('AI に頼む', 'Ask AI'),
                    icon: <ChatRegular />,
                    content: (
                      <PartAiChat
                        key={partKey(part)}
                        kind="hero"
                        label={t('メイン画像', 'Main image')}
                        {...chatOf(part)}
                        placeholder={t('例: 人物が入った、明るい屋外の写真', 'e.g. A bright outdoor photo with a person')}
                        ask={(request, history) =>
                          askHeroPick({ card: e.aiCard(), angle: e.form.copyAngle, current: e.hero, heroes: e.poolHeroes, productNames: e.items.flatMap((i) => byId.get(i.productId)?.name ?? []), request, history })
                        }
                        renderIdea={(idea) => {
                          const h = e.poolHeroes.find((x) => x.id === idea.value)
                          return h ? (
                            <span className={s.ideaRow}>
                              <ImageThumb src={heroImage(h)} alt={h.name} width={72} height={48} />
                              <span className={s.name}>{h.name}</span>
                            </span>
                          ) : null
                        }}
                        isCurrent={(idea) => idea.value === e.hero?.id}
                        onPreview={(idea) => e.setAiPreview(idea ? { heroId: idea.value } : null)}
                        onAdopt={(idea) => {
                          e.setAiPreview(null)
                          e.setHero(idea.value, idea.why)
                        }}
                      />
                    ),
                  },
                  {
                    value: 'upload',
                    label: t('アップロード', 'Upload'),
                    icon: <ArrowUploadRegular />,
                    content: (
                      <>
                        {/* 上げた画像はライブラリに入り、この配信のメイン画像になる(名前・タグは AI が下書きする) */}
                        <DropZone
                          accept=".jpg,.jpeg,.png,.webp,.avif"
                          hint={t('持っている画像をここに落とす(JPEG・PNG・WebP・AVIF)', 'Drop your own image here (JPEG, PNG, WebP, AVIF)')}
                          onFile={(f) => e.uploadHero(f)}
                        />
                        <span className={s.caption}>{t('上げた画像はライブラリに入り、この配信のメイン画像になります。名前・タグは AI が下書きします', 'The image goes into the library and becomes this delivery\'s main image. AI drafts its name and tags')}</span>
                      </>
                    ),
                  },
                  {
                    value: 'all',
                    label: t('すべての画像', 'All images'),
                    icon: <ImageMultipleRegular />,
                    content: <HeroCandidates heroes={e.poolHeroes} selectedId={e.hero?.id} onSelect={(id) => e.setHero(id, '')} />,
                  },
                ]}
              />
            )}
            {e.channel === 'email' && (
              linkEditing ? (
                <Field label={t('メイン画像のリンク先(空は既定)', 'Main image link (empty uses the default)')} size="small">
                  <span className={s.row}>
                    <Input className={s.grow} size="small" autoFocus value={e.links.hero ?? ''} placeholder={heroDefaultLink} onChange={(_, d) => e.setLinks({ ...e.links, hero: d.value })} />
                    <Button size="small" onClick={() => setLinkEditing(false)}>{t('閉じる', 'Close')}</Button>
                  </span>
                </Field>
              ) : (
                <span className={s.linkLine}>
                  <span className={s.label}>{t('リンク先', 'Link')}</span>
                  <span className={s.linkText}>{e.links.hero?.trim() || (heroDefaultLink ? t(`既定(${heroDefaultLink})`, `Default (${heroDefaultLink})`) : t('既定', 'Default'))}</span>
                  <OpenLink url={e.links.hero?.trim() || heroDefaultLink} />
                  <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => setLinkEditing(true)}>{t('直す', 'Edit')}</Button>
                </span>
              )
            )}
          </>
        )
      case 'product': {
        const it = e.items.find((i) => i.key === part.itemKey)
        if (!it) return <span className={s.caption}>{t('この商品は、もう載っていません', 'This product is no longer in the delivery')}</span>
        const idx = e.items.indexOf(it)
        const sec = sections[sectionIndexAt(sections, idx)]
        return (
          <>
            {/* 箱を押すと、詳しい情報・この配信で使う画像のフロート */}
            <div role="button" tabIndex={0} className={s.productOpen} title={t('押すと、詳しい情報・画像', 'Click for details and image')} onClick={() => openFloat(it.key)} onKeyDown={(ev) => ev.key === 'Enter' && openFloat(it.key)}>
              {productBox(byId.get(it.productId), it.reason ? <span className={s.caption}>{it.reason}</span> : undefined, it.imageUrl)}
            </div>
            {/* 商品画像のモデルの使用期限(メイン画像の期限の警告と同じ形。画像を替えるか、商品を入れ替える) */}
            {e.alerts
              .filter((a) => a.kind === 'imageExpired' && a.productId === it.productId)
              .map((a) => (
                <span key={a.kind} className={s.warn}>
                  <WarningRegular />
                  {a.detail}
                </span>
              ))}
            {/* 入れ替えは、箱の真下のボタンから開く(どの商品を替えるのかが、ひと目で分かるように。メイン画像の「入れ替える」と同じ形。SU9) */}
            <ProductSwap
              editor={e}
              itemKey={it.key}
              open={swapAt?.at === 'pane' && swapAt.itemKey === it.key}
              onOpenChange={(o) => onSwapAt(o ? { itemKey: it.key, at: 'pane' } : null)}
              chats={chats}
              setChat={setChat}
              onDone={(k) => onSwapped(it.key, k)}
            />
            <span className={s.caption}>{t(`${idx + 1} 番目${sec ? `(${sec.label})` : ''}`, `Position ${idx + 1}${sec ? ` (${sec.label})` : ''}`)}</span>
            <span className={s.row}>
              <Button size="small" icon={<ArrowUpRegular />} disabled={idx === 0 || e.saving} onClick={() => e.moveItem(idx, idx - 1)}>{t('前へ', 'Earlier')}</Button>
              <Button size="small" icon={<ArrowDownRegular />} disabled={idx === e.items.length - 1 || e.saving} onClick={() => e.moveItem(idx, idx + 1)}>{t('後ろへ', 'Later')}</Button>
              <Button
                size="small"
                appearance="subtle"
                icon={<DeleteRegular />}
                disabled={e.saving}
                onClick={() => {
                  e.removeItem(it.key)
                  onPick(null)
                }}
              >
                {t('外す(候補に戻す)', 'Remove (back to candidates)')}
              </Button>
            </span>
            <span className={s.caption}>{t('箱を押すと、詳しい情報・画像。右の一覧で別の商品を押すと、この枠の商品と見比べて入れ替えられます。プレビューの上で、つかんで並べ替えることもできます。', 'Click the box for details and image. Click another product in the list on the right to compare and swap. You can also drag products in the preview to reorder.')}</span>
          </>
        )
      }
      case 'slot': {
        const sec = sectionIndexAt(sections, Math.max(0, part.index))
        const cands = e.candidates.filter((c) => c.section === sec)
        return (
          <>
            <span className={s.caption}>{t('空いた枠に商品を入れます(空いた枠は、前から埋まります)。', 'Put a product in an empty slot (empty slots fill from the front).')}</span>
            {productChat(null)}
            {cands.length > 0 && (
              <>
                <span className={s.label}>{t(`このセクションの残りの候補(${cands.length})`, `Remaining candidates for this section (${cands.length})`)}</span>
                {cands.map((c) => {
                  const p = byId.get(c.productId)
                  return p ? (
                    <div key={c.key}>
                      {productBox(p, <Button size="small" appearance="primary" disabled={e.saving} onClick={() => e.addProduct(p.id, e.items.length)}>{t('この枠に入れる', 'Put in this slot')}</Button>)}
                    </div>
                  ) : null
                })}
              </>
            )}
            <span className={s.label}>{t('ほかの商品を探す', 'Search other products')}</span>
            <Candidates products={e.poolProducts} usedIds={new Set(e.items.map((i) => i.productId))} onAdd={(id) => e.addProduct(id, e.items.length)} />
          </>
        )
      }
      case 'button': {
        const slot = e.linkSpots.find((x) => x.kind === 'button' && x.key === part.id)
        return (
          <>
            <span className={s.caption}>{t('ボタンの文言はテンプレートで決まっています(テンプレートの管理で変えます)。', 'The button text comes from the template (change it in Manage templates).')}{e.ab ? t('リンク先は全部の案で共通です。', ' Links are shared by all variants.') : ''}</span>
            {slot && <Text size={200}>{slot.label}</Text>}
            {e.channel === 'email' ? (
              <Field label={t('リンク先(空は既定)', 'Link (empty uses the default)')} size="small">
                <span className={s.row}>
                  <Input className={s.grow} size="small" autoFocus value={e.links.buttons?.[part.id] ?? ''} placeholder={slot?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, buttons: { ...e.links.buttons, [part.id]: d.value } })} />
                  <OpenLink url={e.links.buttons?.[part.id]?.trim() || slot?.defaultUrl} />
                </span>
              </Field>
            ) : (
              <span className={s.caption}>{t('アプリで開く画面は、詳しい画面の「⑤ リンク先」で決めます。', 'The app screen to open is set in “⑤ Links” of the full view.')}</span>
            )}
          </>
        )
      }
      case 'image': {
        // テンプレートの表の画像・動画(T8)。画像そのものはテンプレートで決まる(配信ごとの差し替えは、これから。T8 段階 6)。リンク先は、ボタンと同じく配信ごと
        const slot = e.linkSpots.find((x) => x.kind === 'button' && x.key === part.id)
        return (
          <>
            <span className={s.caption}>{t('画像はテンプレートで決まっています(配信ごとの差し替えは、これからです)。押したときのリンク先は、この配信で決められます。', 'The image comes from the template (swapping per delivery is coming). The link on click can be set for this delivery.')}</span>
            {slot && <Text size={200}>{slot.label}</Text>}
            {e.channel === 'email' && (
              <Field label={t('リンク先(空は既定)', 'Link (empty uses the default)')} size="small">
                <span className={s.row}>
                  <Input className={s.grow} size="small" autoFocus value={e.links.buttons?.[part.id] ?? ''} placeholder={slot?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, buttons: { ...e.links.buttons, [part.id]: d.value } })} />
                  <OpenLink url={e.links.buttons?.[part.id]?.trim() || slot?.defaultUrl} />
                </span>
              </Field>
            )}
          </>
        )
      }
      case 'text':
        // テンプレートの表のテキスト(T8)。いまはテンプレートの文のまま(配信ごとの書き換えは、これから。T8 段階 6)
        return <span className={s.caption}>{t('この文はテンプレートで決まっています(テンプレートの管理で変えます)。配信ごとの書き換えは、これからです。', 'This text comes from the template (change it in Manage templates). Rewriting per delivery is coming.')}</span>
      case 'template':
        return <TemplatePicker editor={e} />
      case 'overview':
      case 'meta':
        return <MetaFields editor={e} focus={part.field} />
    }
  })()

  const titleOf = (p: PartRef | null): string => {
    if (!p) return t('部品を選んでください', 'Choose a part')
    switch (p.kind) {
      case 'subject': return t('件名', 'Subject')
      case 'preheader': return t('プリヘッダー', 'Preheader')
      case 'pushTitle': return t('通知のタイトル', 'Notification title')
      case 'pushBody': return t('通知の本文', 'Notification body')
      case 'headline': return t('ヘッドライン', 'Headline')
      case 'copy': return t('コピー', 'Copy')
      case 'hero': return t('メイン画像', 'Main image')
      case 'sectionTitle': return t(`セクション ${p.index + 1} の見出し`, `Section ${p.index + 1} heading`)
      case 'sectionCopy': return t(`セクション ${p.index + 1} のコピー`, `Section ${p.index + 1} copy`)
      case 'product': return t('商品', 'Product')
      case 'slot': return t('空いた枠', 'Empty slot')
      case 'button': return t('ボタン', 'Button')
      case 'image': return t('画像', 'Image')
      case 'text': return t('テキスト', 'Text')
      case 'template': return t('テンプレート', 'Template')
      case 'overview':
      case 'meta': return t('配信の情報', 'Delivery info')
    }
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        {part ? (
          <span className={s.title}>{titleOf(part)}</span>
        ) : (
          <InfoLabel
            className={s.title}
            size="medium"
            weight="semibold"
            info={t(
              'プレビューの部品(見出し・画像・商品の枠など)を押すと、ここでその部品だけを直せます。Tab で次の部品、Esc で選ぶのをやめます。何も選んでいないときは、配信の全体のことを AI に頼めます。',
              'Click a part in the preview (headline, image, product slot...) to edit just that part here. Tab moves to the next part, Esc stops. With nothing selected, ask AI about the whole delivery.',
            )}
          >
            {titleOf(part)}
          </InfoLabel>
        )}
        {part && (
          <Tooltip content={t('選ぶのをやめる(Esc)', 'Deselect (Esc)')} relationship="label">
            <Button className={s.deselect} size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => onPick(null)} />
          </Tooltip>
        )}
      </div>
      {/* 文言・画像・商品を直すときの手がかり(この配信のねらい)。配信の情報を直すときは出さない */}
      {part?.kind !== 'meta' && part?.kind !== 'overview' && <Aim editor={e} />}
      {compareBlock}
      {body}
      {/* 制作へのメモ: 直しながら思いついたイメージを、その部品の名前つきで渡すものに書き留める(配信の情報・テンプレートは除く) */}
      {part && part.kind !== 'meta' && part.kind !== 'overview' && part.kind !== 'template' && <ProductionMemo editor={e} label={titleOf(part)} />}
    </div>
  )
}

/**
 * テンプレートの選び直し(SU1 ⑧・段階 b)。チャネルのテンプレートを、見取り図と一緒に並べる。乗せるとプレビューに仮で写し(この配信の商品・画像のまま)、
 * 押すと替える。枠に収まらない商品は「枠外」として、メールには載らないことを知らせる(載せたままにするので、戻せば元の枠に戻る)。
 * 国ごとに使えるテンプレートの絞り込み(ST1)は、まだない
 */
function TemplatePicker({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  const current = baseTemplateId(e.template)
  const slotsOf = (sections?: { slots: number }[]) => (sections ?? []).reduce((n, x) => n + x.slots, 0)
  const pick = async (id: string) => {
    if (id === current) return
    if (e.candidates.length > 0 && !(await confirmDialog(t('テンプレートを替えると、セクションの構成が変わるので、残りの候補(AI が出した商品の案)は外れます。替えますか?', 'Changing the template changes the sections, so the remaining candidates (AI product ideas) are cleared. Change it?')))) return
    e.setAiPreview(null)
    e.setTemplate(id)
  }
  return (
    <>
      <span className={s.caption}>{t('マウスを乗せると、この配信の中身のままプレビューに写します。押すと替えます(元に戻すで戻せます)。', 'Hover to preview with this delivery’s content; click to switch (Undo works).')}</span>
      <div className={s.tplList} onMouseLeave={() => e.setAiPreview(null)}>
        {templateOptions(e.channel, false, e.card.country).map((o) => {
          const slots = o.id === 'free' ? Infinity : slotsOf(o.sections)
          const over = Number.isFinite(slots) ? Math.max(0, e.items.length - slots) : 0
          const on = o.id === current
          return (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              className={mergeClasses(s.tplCard, on && s.tplOn)}
              onMouseEnter={() => e.setAiPreview(on ? null : { templateId: o.id })}
              onClick={() => pick(o.id)}
              onKeyDown={(ev) => ev.key === 'Enter' && pick(o.id)}
            >
              {o.push ? <PushThumb spec={o.push} width={72} /> : <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={110} />}
              <span style={{ display: 'grid', rowGap: 2, minWidth: 0 }}>
                <span className={s.name}>{o.label}</span>
                {o.description && <span className={s.caption}>{o.description}</span>}
                <span className={s.row}>
                  {on && <Badge size="small" appearance="filled" color="brand">{t('いまのテンプレート', 'Current')}</Badge>}
                  {Number.isFinite(slots) && <span className={s.caption}>{t(`商品の枠 ${slots}`, `${slots} product slots`)}</span>}
                  {over > 0 && <Badge size="small" appearance="tint" color="warning">{t(`${over} 件が枠外(メールに載らない)`, `${over} out of slots (not in the email)`)}</Badge>}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/**
 * この配信のねらい(テーマと切り口)。直す部品の上に小さく出し、ねらいを見ながら書けるようにする。
 * テーマは押すとその場で直せる。切り口は、採用した AI の案の補足なので、読むだけ
 */
function Aim({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className={s.aim}>
        <AutoTextarea heightKey="PartPane.e_form_theme" size="small" rows={2} autoFocus value={e.form.theme} placeholder={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise; not in the email)')} onChange={(_, d) => e.setField('theme', d.value)} onBlur={() => setEditing(false)} />
      </div>
    )
  return (
    <button type="button" className={mergeClasses(s.aim, s.aimBtn)} onClick={() => setEditing(true)} title={t('この配信のねらい(テーマ・切り口。メールには出ません)。押すとテーマを直せます', 'What this delivery aims for (theme and angle; not in the email). Click to edit the theme')}>
      <span className={e.form.theme ? s.aimTheme : s.caption}>{e.form.theme || t('テーマを入れる', 'Add a theme')}</span>
      {e.form.copyAngle && <span className={s.caption}>{e.form.copyAngle}</span>}
      {e.ab && <span className={s.caption}>{t('テーマは全部の案で共通', 'The theme is shared by all variants')}</span>}
    </button>
  )
}

/** 配信の管理の項目(制作指示・種類・国・ターゲット・担当・締め切り)。文言を直すときには使わないので、配信の情報の中に置く */
function ManageFields({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  return (
    <>
      <Field label={t('制作指示', 'Production notes')} size="small" data-field="instructions">
        <AutoTextarea heightKey="PartPane.e_form_instructions" size="small" rows={3} value={e.form.instructions} onChange={(_, d) => e.setField('instructions', d.value)} />
      </Field>
      <div className={s.twoCol}>
        <ChoiceField label={t('種類', 'Type')} value={e.form.themeType} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={(v) => e.setField('themeType', v)} size="small" field="themeType" />
        <ChoiceField label={t('国', 'Country')} value={e.form.country} options={countryOptions} onChange={(v) => e.setField('country', v)} size="small" field="country" />
      </div>
      <TargetField gender={e.form.targetGender} ages={e.form.targetAges} onGender={(v) => e.setField('targetGender', v)} onAges={(v) => e.setField('targetAges', v)} size="small" field="target" />
      <OwnerField value={e.form.owner} onChange={(v) => e.setField('owner', v)} owners={e.people} size="small" field="owner" />
      {/* 制作の担当・締め切りは、引き継ぎのタブだけで決める(2 か所で入力しない。FLOWS の C-3) */}
      <div className={s.readonly} data-field="due">
        <span className={s.label}>{t('制作の締め切り・担当', 'Production due & assignee')}</span>
        <span>
          {e.form.productionDue ? new Date(`${e.form.productionDue}T00:00:00`).toLocaleDateString(locale()) : t('(締め切り未設定)', '(no due date)')}
          {' ・ '}
          {e.form.productionOwner || t('(担当未設定)', '(no assignee)')}
        </span>
        <span className={s.caption}>{t('詳しい画面のプロセスのペインの「引き継ぎ」で決めます', 'Set in the Handoff tab of the full view')}</span>
      </div>
    </>
  )
}

/** 配信の情報(上の帯の配信名・配信日時・ステータスを押したとき)。配信の管理の項目も、ここにまとめる */
function MetaFields({ editor: e, focus }: { editor: SimpleEditor; focus?: string }) {
  const t = useT()
  const s = useStyles()
  const ref = useFocusField(focus)
  return (
    <div ref={ref} className={s.root}>
      <NameField value={e.form.name} onChange={(v) => e.setField('name', v)} size="small" field="name" />
      <ScheduledAtField value={e.form.scheduledAt} onChange={(v) => e.setField('scheduledAt', v)} size="small" field="scheduledAt" />
      <ChoiceField label={t('チャネル', 'Channel')} value={e.form.channel} options={channelOptions} onChange={(v) => e.setField('channel', v)} hint={t('変えると、テンプレートもそのチャネルのものになります', 'Changing it also switches the template to that channel')} size="small" field="channel" />
      <StatusField value={e.form.status} onChange={(v) => e.setField('status', v)} size="small" field="status" />
      <ManageFields editor={e} />
    </div>
  )
}

/** 押した項目の欄へ、最初に入る(data-field の中の入力欄) */
function useFocusField(focus?: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const target = (focus && box.querySelector(`[data-field="${CSS.escape(focus)}"]`)) || box
    const input = target.querySelector<HTMLElement>('input, textarea, select, button')
    target.scrollIntoView({ block: 'nearest' })
    input?.focus()
  }, [focus])
  return ref
}

