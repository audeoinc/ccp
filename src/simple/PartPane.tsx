import { useEffect, useRef, useState, type ReactNode } from 'react'
import { filled } from '../slots'
import type { SwapRender } from '../ProductActionFloat'
import { InfoLabel, Divider, ToggleButton, Badge, Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem, Button, Field, Input, Link, Spinner, Text, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, LockClosedRegular, ArrowSwapRegular, ArrowUploadRegular, ChatRegular, DismissRegular, EditRegular, ImageMultipleRegular, SparkleRegular, WarningRegular, ChevronUpRegular, ImageEditRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { ChooseDrawer } from '../ChoosePanel'
import { DropZone } from '../DropZone'
import { HeroCandidates } from '../HeroCandidates'
import { ImageThumb } from '../ImageThumb'
import { AlertMark } from '../AlertMark'
import { LowStockBadge } from '../ProductMarks'
import { heroImage, productImage } from '../images'
import { yen } from '../items'
import { locale, optionLabel, tr, useT } from '../i18n'
import { audienceLabel, audienceSet, targetText } from '../target'
import { typo } from '../typo'
import { LabeledValue } from '../LabeledValue'
import { OpenLink } from '../LinkText'
import { productUrl } from '../links'
import { productMarket } from '../market'
import { THEME_TYPES, themeTypeLabel } from '../themeTypes'
import { channelOptions, countryOptions } from '../status'
import { getTemplate, openTemplateManager, sectionIndexAt, sectionsOf, templateOptions } from '../templates'
import { findPart, hasPartFields } from '../partContent'
import { PartContentFields } from '../PartContentFields'
import { TemplateThumb } from '../TemplateThumb'
import { TemplateKeyNote, TemplateUseLine } from '../TemplateUseLine'
import { templateKeyState } from '../templateUse'
import { PREHEADER_MAX, SUBJECT_MAX } from '../textLimits'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '../pushLink'
import { PushThumb } from '../PushThumb'
import { AppScreenField, PushTapField } from '../AppLinksEditor'
import type { Product } from '../models/products'
import type { ThemeSuggestion } from '../aiDraft'
import type { ProductSelection } from '../aiSelect'
import { partKey, type PartRef } from './parts'
import { useTrial } from '../trial'
import { TrialBar } from '../TrialBar'
import { setSectionGlow } from './sectionGlow'
import { PartAiChat } from './PartAiChat'
import { TextAiPanel } from './TextAiPanel'
import { Hint } from '../Hint'
import { ProductionMemo } from './ProductionMemo'
import { askHeroPick, askPartRewrite, type PartAnswer, type PartTurn, type WholeTexts } from './partAi'
import { ProductSwap, type SwapAt } from './ProductSwap'
import { ProductDetailFields } from './ProductDetailFields'
import { ProductImageSwap } from './ProductImageSwap'
import { AiPicks, ProductChooser, type Picks } from '../ProductChooser'
import type { SimpleEditor, SimpleField } from './editor'
import { confirmDialog } from '../confirm'
import { AudienceRow, ChoiceField, NameField, OwnerField, ScheduledAtField, StatusField, TargetField } from '../DeliveryInfoFields'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'

const useStyles = makeStyles({
  // テンプレートで決まっている部品の知らせ(鍵の印 + 文 + テンプレートの管理へのリンク)
  lockedNote: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '6px', alignItems: 'start', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  lockedIcon: { marginTop: '2px' },
  root: { display: 'grid', alignContent: 'start', rowGap: '12px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  title: typo.heading,
  deselect: { marginLeft: 'auto' },
  // パンくずは長いセクション名でも折り返して、閉じるボタンを押し出さない
  crumbs: { minWidth: 0, '& ol': { flexWrap: 'wrap' } },
  sectionParts: { display: 'grid', rowGap: '4px', justifyItems: 'start' },
  warn: { display: 'flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteMarigoldForeground2 },
  grow: { flexGrow: 1, minWidth: 0 },
  // 名前・直す・開くは縮めず、URL の文だけを省略する
  linkLine: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, '& > *:not(:nth-child(2))': { flexShrink: 0, whiteSpace: 'nowrap' } },
  trackedUrl: { display: 'grid', rowGap: '2px', minWidth: 0 },
  trackedText: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  sectionAi: { display: 'grid', rowGap: '6px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  sectionAiList: { display: 'grid', rowGap: '4px' },
  sectionAiRow: { display: 'grid', rowGap: '1px', minWidth: 0 },
  linkText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...typo.pairValue },
  // メイン画像を変える欄(開いたときだけ。いまの画像の下に、ひとまとまりで)
  caption: typo.caption,
  label: typo.label,
  // 値に付くラベル(リンク先など。一覧の見出しの label とは別)
  pairLabel: typo.pairLabel,
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
  tplNote: { cursor: 'default', ':hover': { backgroundColor: tokens.colorNeutralBackground1 } },
  tplOn: { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  ideaText: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap' },
  ideaRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', minWidth: 0 },
  productOpen: { borderRadius: tokens.borderRadiusMedium, cursor: 'pointer', ':hover > div': { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 } },
  // 見比べの列は狭いので、写真の下に文字を置き、名前を折り返す
  productTall: { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '6px', justifyItems: 'center' },
  nameWrap: { whiteSpace: 'normal' },
  compareCol: { display: 'grid', rowGap: '4px', alignContent: 'start', minWidth: 0 },
  compareBox: { display: 'grid', rowGap: '8px', padding: '10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground2 },
  heroNow: { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', columnGap: '10px', alignItems: 'start' },
  heroCands: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '6px' },
  pickRow: { display: 'grid', rowGap: '2px', padding: '6px 8px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  heroCandOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
  heroCand: { display: 'grid', rowGap: '2px', padding: '4px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  // この配信のねらい(テーマ・切り口)。直す部品の上の、控えめな箱
  aim: { display: 'grid', rowGap: '2px', width: '100%', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, boxSizing: 'border-box' },
  // テーマと、右上の「変える」
  aimHead: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'start' },
  aimChange: { minWidth: 0, height: 'auto', padding: '0 4px', fontSize: tokens.fontSizeBase200 },
  aimWrap: { display: 'grid', rowGap: '6px', minWidth: 0 },
  // 試している案を写しているあいだ(本物のテーマではないと分かるように)
  aimTrying: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: '-2px' },
  themeIdeas: { display: 'grid', rowGap: '6px', minWidth: 0 },
  themeIdeasClose: { justifySelf: 'start' },
  themeIdeaHead: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'baseline' },
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
  /** 「画像を替える」の引き出しを開いている商品の枠(「商品を入れ替える」とは同時に開かない) */
  imageAt: string | null
  onImageAt: (itemKey: string | null) => void
  /** 入れ替えで、行の鍵が変わったとき(候補と入れ替えたとき) */
  onSwapped: (from: string, to: string) => void
  /** 商品のフロートの「入れ替える」で、フロートの中に出す引き出し(画面の側が作る。どの入口でも同じもの) */
  swapInFloat?: (itemKey: string) => SwapRender
}

/** テンプレートで決まっていて、この配信では直せない部品の知らせ(鍵の印と、テンプレートの管理へのリンク。行き止まりにしない。レビューの 9) */
function TemplateLocked({ text }: { text: string }) {
  const t = useT()
  const s = useStyles()
  return (
    <span className={s.lockedNote}>
      <LockClosedRegular className={s.lockedIcon} />
      <span>
        {text}{' '}
        <Link as="button" onClick={openTemplateManager}>
          {t('テンプレートの管理で直す', 'Edit in Manage templates')}
        </Link>
      </span>
    </span>
  )
}

/** 選んだ部品のペイン(SU1 ⑨)。選んだものによって中身が替わる。入力は、そのまま配信カードの状態に書くので、反映の前からプレビューに写る */
export function PartPane({ editor: e, part, compareKey, onPlace, onCompareDone, onPick, chats, setChat, heroReplace, swapAt, onSwapAt, imageAt, onImageAt, onSwapped, swapInFloat }: Props) {
  const t = useT()
  const s = useStyles()
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const sections = sectionsOf(e.template)
  // 公開していない AI の入口は出さない(X87)。文の部品の AI・メイン画像の AI・セクションの商品の AI と、メイン画像の選び方
  const textAiOn = useFeature('ai.text')
  const heroAiOn = useFeature('ai.hero')
  const productsAiOn = useFeature('ai.products')
  const heroUploadOn = useFeature('content.hero.upload')
  const heroPickOn = useFeature('content.hero.pick')
  // 商品の画像を替える(X87 の content.products.pageimage。非公開なら「画像を替える」を出さない)
  const pageImageOn = useFeature('content.products.pageimage')

  // メイン画像を変える欄を開いている部品(部品を移ると畳む。まだ画像がなければ、はじめから開く)
  const [heroOpenKey, setHeroOpenKey] = useState<string | null>(null)
  // メイン画像の入れ替えは、試す → 確定(AI のおすすめ・AI に頼む・すべての画像で、1 つの帯)
  const heroTrial = useTrial()
  const tryHero = (id: string, why: string) => {
    const h = e.poolHeroes.find((x) => x.id === id)
    heroTrial.tryIt({
      key: id,
      from: e.hero?.name ?? '',
      to: h?.name ?? id,
      preview: () => e.setAiPreview({ heroId: id }),
      unpreview: () => e.setAiPreview(null),
      apply: () => {
        e.setAiPreview(null)
        e.setHero(id, why)
      },
    })
  }
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
  /** 商品のフロートを開く。フロートの「入れ替える」は、フロートの中に同じ引き出しを出す(部品のペインには飛ばない。2026-10-26) */
  const openFloat = (itemKey: string) => e.openProduct(itemKey, undefined, swapInFloat?.(itemKey))
  const [linkEditing, setLinkEditing] = useState(false)
  const heroSlot = e.linkSpots.find((x) => x.kind === 'hero')
  const heroDefaultLink = heroSlot?.defaultUrl
  // 使える期限が配信日より前(選んだあとで期限が来た画像。入れ替えを促す)
  const heroExpired = !!e.hero?.usable_until && !!e.form.scheduledAt && e.hero.usable_until < e.form.scheduledAt.slice(0, 10)
  /** 管理画面と照らし合わせるための 1 行(番号・季節・用途) */
  const heroFacts = (h: NonNullable<typeof e.hero>) => [h.image_code, h.season_name, h.purpose_name].filter(Boolean).join(' ・ ')
  const chatOf = (p: PartRef | 'whole') => {
    const key = p === 'whole' ? 'whole' : partKey(p)
    return { turns: chats[key] ?? [], setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => setChat(key, f) }
  }
  /**
   * 文言の部品の AI(「AI」のボタン → 案 / 指示して直す。TextAiPanel)。試している案は、保存する中身に入れず、プレビューにだけ写す
   * (shown が、その案を写した文言。自動の保存で、試しただけの案が保存されないように)。「確定」で入れ替える
   */
  const aiChat = (kind: string, label: string, value: string, onChange: (v: string) => void, shown: (v: string) => WholeTexts) => {
    if (!part || !textAiOn) return null
    return (
      <TextAiPanel
        key={partKey(part)}
        kind={kind}
        label={label}
        value={value}
        ask={(request, count, history) =>
          askPartRewrite({
            card: e.aiCard(),
            angle: e.form.copyAngle,
            part: { kind, label, current: value },
            context: { subject: e.form.subject || e.form.name, preheader: e.form.preheader, headline: e.form.headline, copy: e.form.copy, pushTitle: e.form.pushTitle, pushBody: e.form.pushBody },
            request,
            history,
            count,
          })
        }
        onPreview={(v) => e.setAiPreview(v === null ? null : { texts: shown(v) })}
        onAdopt={(idea) => {
          e.setAiPreview(null)
          onChange(idea.value)
        }}
      />
    )
  }
  // 空いた枠に入れるときの位置(押した枠のセクションに入る。src/slots.ts)
  const slotAt = part?.kind === 'slot' ? part.index : e.items.length
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
      {aiChat(k, label, e.form[k], (v) => e.setField(k, v), (v) => ({ [k]: v }))}
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
          <span className={s.meta}>{t(`在庫 ${p.stock ?? '—'}`, `Stock ${p.stock ?? '—'}`)}{p.sales_trend_name ? ` ・ ${optionLabel(p.sales_trend_name)}` : ''}</span>
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
            {cur ? t('この枠の商品と入れ替える', 'Replace the product in this slot') : t('この枠に入れる', 'Put in this slot')}
          </Button>
          <Button size="small" onClick={onCompareDone}>{t('やめる', 'Cancel')}</Button>
        </div>
      </div>
    )
  })()

  // 選んでいる部品が、どのセクションのものか(メールで、セクションがあるときだけ。パンくずの真ん中に出す)
  const inSection = (() => {
    if (!part || e.channel !== 'email' || sections.length === 0) return null
    if (part.kind === 'sectionTitle' || part.kind === 'sectionCopy' || part.kind === 'section') return part.index
    if (part.kind === 'slot') return sectionIndexAt(sections, Math.max(0, part.index))
    if (part.kind === 'product') {
      const at = e.items.findIndex((i) => i.key === part.itemKey)
      return at < 0 ? null : sectionIndexAt(sections, at)
    }
    return null
  })()
  // セクションの商品を AI で選ぶボタンは、セクションの全体・見出し・コピー・空いた枠を選んだときだけ出す(商品を選んだときは、その商品の操作だけにする。
  // パンくずのセクション名を押すと、セクションの全体を選んだ状態に移れる)
  const sectionOfPart = part && part.kind !== 'product' ? inSection : null
  /** セクションの呼び名(右の商品の一覧と同じ名前。見出しがあれば添える。例: Grid2(秋の小物)) */
  const sectionName = (i: number) => {
    const sec = sections[i]
    if (!sec) return ''
    const heading = sec.wantTitle ? (e.sectionTitles[i] ?? '').trim() : ''
    return heading ? t(`${sec.label}(${heading})`, `${sec.label} (${heading})`) : sec.label
  }
  const body = (() => {
    if (!part) return <WholePane editor={e} onEdit={() => onPick({ kind: 'meta', field: 'info' })} />
    switch (part.kind) {
      case 'subject':
        return text('subject', t('件名', 'Subject'), { rows: 1, placeholder: e.form.name, hint: t('空のときは配信名が件名になります', 'Empty uses the delivery name'), max: SUBJECT_MAX })
      case 'preheader':
        return text('preheader', t('プリヘッダー(受信箱で件名の下に出る文。目安 40〜90 文字)', 'Preheader (shown under the subject in the inbox; aim for 40–90 chars)'), { rows: 2, max: PREHEADER_MAX })
      case 'pushTitle':
      case 'pushBody':
        // 開く画面は、タイトル・本文のどちらを選んでも出す(通知は 1 つのまとまりで、押すのは通知の全体。X81 の 2)
        return (
          <>
            {part.kind === 'pushTitle'
              ? text('pushTitle', t('通知のタイトル', 'Notification title'), { rows: 1, placeholder: e.form.headline, max: PUSH_TITLE_MAX })
              : text('pushBody', t('通知の本文', 'Notification body'), { rows: 3, placeholder: e.form.copy, max: PUSH_BODY_MAX })}
            <PushTapField pushLink={e.pushLink} onPushLink={e.setPushLink} items={e.items} products={e.products} campaign={e.fcmCampaign} />
          </>
        )
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
        const name = sections[i]?.label ?? ''
        const label = isTitle ? t(`${name} の見出し`, `${name} heading`) : t(`${name} のコピー`, `${name} copy`)
        const setValue = (v: string) => (isTitle ? e.setSectionTitle(i, v) : e.setSectionCopy(i, v))
        return (
          <>
            <Field label={label} size="small" hint={isTitle && !value ? t('空のときは、商品のカテゴリ名を出します', 'Empty shows the product category') : undefined}>
              <AutoTextarea heightKey="PartPane.value" size="small" rows={isTitle ? 1 : 2} autoFocus value={value} onChange={(_, d) => setValue(d.value)} />
            </Field>
            {aiChat(part.kind, label, value, setValue, (v) => {
              const list = [...(isTitle ? e.sectionTitles : e.sectionCopies)]
              while (list.length <= i) list.push('')
              list[i] = v
              return isTitle ? { sectionTitles: list } : { sectionCopies: list }
            })}
          </>
        )
      }
      case 'section': {
        // セクションの全体(プレビューの名札・パンくずから)。中の部品へ移る入口と、枠の埋まり具合。商品をまとめて選ぶのは下の AI のボタン
        const sec = sections[part.index]
        if (!sec) return <span className={s.caption}>{t('このセクションは、いまのテンプレートにありません', 'This section is not in the current template')}</span>
        const end = Number.isFinite(sec.slots) ? sec.start + sec.slots : Math.max(e.items.length, sec.start + 1)
        const slots = Array.from({ length: Math.max(0, end - sec.start) }, (_, j) => sec.start + j)
        const used = slots.filter((at) => e.items[at] && !e.items[at].gap).length
        const heading = (e.sectionTitles[part.index] ?? '').trim()
        return (
          <>
            <LabeledValue label={t('セクション', 'Section')}>{sectionName(part.index)}</LabeledValue>
            <LabeledValue label={t('商品の枠', 'Product slots')}>
              {Number.isFinite(sec.slots) ? t(`${used} / ${sec.slots} 枠`, `${used} / ${sec.slots} ${sec.slots === 1 ? 'slot' : 'slots'}`) : t(`${used} 点(上限なし)`, `${used} items (no limit)`)}
            </LabeledValue>
            <span className={s.label}>{t('このセクションの部品', 'Parts in this section')}</span>
            <div className={s.sectionParts}>
              {sec.wantTitle && (
                <Link as="button" onClick={() => onPick({ kind: 'sectionTitle', index: part.index })}>
                  {heading ? t(`見出し: ${heading}`, `Heading: ${heading}`) : t('見出し', 'Heading')}
                </Link>
              )}
              {getTemplate(e.template).sections[part.index]?.copy !== false && (
                <Link as="button" onClick={() => onPick({ kind: 'sectionCopy', index: part.index })}>
                  {t('コピー', 'Copy')}
                </Link>
              )}
              {slots.map((at) => {
                const it = e.items[at]
                const p = it && !it.gap ? byId.get(it.productId) : undefined
                const n = at - sec.start + 1
                return (
                  <Link key={at} as="button" onClick={() => onPick(it && !it.gap ? { kind: 'product', itemKey: it.key } : { kind: 'slot', index: at })}>
                    {p ? t(`${n} 枠目: ${p.name}`, `Slot ${n}: ${p.name}`) : t(`${n} 枠目(空き)`, `Slot ${n} (empty)`)}
                  </Link>
                )
              })}
            </div>
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
                    <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => e.setHero(undefined, '')}>{t('外す', 'Remove')}</Button>
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
                icon={<ArrowSwapRegular />}
                title={e.hero ? t('メイン画像を選び直す', 'Choose another main image') : t('メイン画像を選ぶ', 'Choose the main image')}
                top={<TrialBar state={heroTrial} />}
                tabs={[
                  {
                    value: 'recommend',
                    label: t('AI のおすすめ', 'AI picks'),
                    icon: <SparkleRegular />,
                    content: (
                      <AiPicks
                        hint={t('この配信のテーマと商品に合いそうな画像を、AI が挙げます。押すとプレビューで試せます(確定で入れ替え)', 'AI suggests images that fit this delivery. Click one to try it in the preview, then Apply')}
                        picks={picksOf(partKey(part))}
                        hasFallback={e.heroCandidates.length > 0}
                        onAsk={() => void recommendHeroes(partKey(part))}
                      >
                        {(picksOf(partKey(part))?.ideas.map((i) => ({ id: i.value, why: i.why })) ?? e.heroCandidates.map((c) => ({ id: c.heroId, why: c.reason }))).length > 0 && (
                          <div className={s.heroCands}>
                            {(picksOf(partKey(part))?.ideas.map((i) => ({ id: i.value, why: i.why })) ?? e.heroCandidates.map((c) => ({ id: c.heroId, why: c.reason }))).map((c) => {
                              const h = e.poolHeroes.find((x) => x.id === c.id)
                              return h ? (
                                <button key={c.id} type="button" className={mergeClasses(s.heroCand, (heroTrial.trial ? heroTrial.trial.key === h.id : h.id === e.hero?.id) && s.heroCandOn)} title={c.why} onClick={() => tryHero(h.id, c.why)}>
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
                        onTry={(idea) => tryHero(idea.value, idea.why)}
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
                        <Hint hintKey="simpleCard.heroUpload">{t('上げた画像はライブラリに入り、この配信のメイン画像になります。名前・タグは AI が下書きします', 'The image goes into the library and becomes this delivery\'s main image. AI drafts its name and tags')}</Hint>
                      </>
                    ),
                  },
                  {
                    value: 'all',
                    label: t('すべての画像', 'All images'),
                    icon: <ImageMultipleRegular />,
                    content: <HeroCandidates heroes={e.poolHeroes} selectedId={heroTrial.trial?.key ?? e.hero?.id} onSelect={(id) => tryHero(id, '')} />,
                  },
                  // 公開していない入口のタブは出さない(X87。AI のおすすめ・AI に頼む = ai.hero、上げる = content.hero.upload、すべての画像 = content.hero.pick)
                ].filter((tab) => (tab.value === 'recommend' || tab.value === 'ask' ? heroAiOn : tab.value === 'upload' ? heroUploadOn : tab.value === 'all' ? heroPickOn : true))}
              />
            )}
            {e.channel === 'push' && heroSlot && (
              <Field label={t('押したときに開く画面', 'Screen opened on tap')} size="small">
                <AppScreenField links={e.links} onLinks={e.setLinks} slot={heroSlot} items={e.items} products={e.products} campaign={e.fcmCampaign} />
              </Field>
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
                  <span className={s.pairLabel}>{t('リンク先', 'Link')}</span>
                  <span className={s.linkText}>{e.links.hero?.trim() || (heroDefaultLink ? t(`既定(${heroDefaultLink})`, `Default (${heroDefaultLink})`) : t('既定', 'Default'))}</span>
                  <OpenLink url={e.links.hero?.trim() || heroDefaultLink} />
                  <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => setLinkEditing(true)}>{t('直す', 'Edit')}</Button>
                </span>
              )
            )}
            {e.channel === 'email' && heroSlot && <TrackedUrl url={e.linkUrlOf(heroSlot)} />}
          </>
        )
      case 'product': {
        const it = e.items.find((i) => i.key === part.itemKey)
        if (!it) return <span className={s.caption}>{t('この商品は、もう載っていません', 'This product is no longer in the delivery')}</span>
        return (
          <>
            {/* 枠の見せ方「詳しく見せる」(X80)。商品を決める前に決める枠の設定なので、いちばん上に。オンのときだけ、すぐ下に見出し・説明文の欄。
                商品を入れ替えても「詳しく」のまま(見出し・説明文は空になる)(2026-10-30 利用者) */}
            <ProductDetailFields item={it} onChange={(d) => e.setItemDetail(it.key, d ?? null)} detailCount={e.items.filter((x) => x.detail).length} />
            <Divider />
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
            {/* 箱の真下に「商品を入れ替える」と「画像を替える」を並べる(言葉で見分けられるように。2026-10-30 利用者)。2 つは同時に開かない */}
            <ProductSwap
              editor={e}
              itemKey={it.key}
              label={t('商品を入れ替える', 'Replace product')}
              open={swapAt?.at === 'pane' && swapAt.itemKey === it.key}
              onOpenChange={(o) => {
                if (o) onImageAt(null)
                onSwapAt(o ? { itemKey: it.key, at: 'pane' } : null)
              }}
              chats={chats}
              setChat={setChat}
              onDone={(k) => onSwapped(it.key, k)}
              rowExtra={
                pageImageOn && <ToggleButton
                  size="small"
                  appearance={imageAt === it.key ? 'secondary' : 'primary'}
                  checked={imageAt === it.key}
                  icon={imageAt === it.key ? <ChevronUpRegular /> : <ImageEditRegular />}
                  aria-expanded={imageAt === it.key}
                  onClick={() => {
                    onSwapAt(null)
                    onImageAt(imageAt === it.key ? null : it.key)
                  }}
                >
                  {t('画像を替える', 'Change image')}
                  <FeatureBadge id="content.products.pageimage" />
                </ToggleButton>
              }
            />
            {pageImageOn && <ProductImageSwap editor={e} itemKey={it.key} open={imageAt === it.key} onOpenChange={(o) => onImageAt(o ? it.key : null)} hideTrigger />}
            {/* ここから下はリンク先・計測(商品の設定の続きに見えないように、線で分ける) */}
            <Divider />
            {e.channel === 'email' && <TrackedUrl url={e.productLinkOf(it.key)?.url ?? ''} />}
            {/* 並べ替え・外すは、プレビューの上で(つかんで動かす・Alt + 矢印・右クリック・×・Delete)。ここの「前へ・後ろへ・外す」の行はやめた
                (商品は上下左右に並ぶので、前後の矢印では向きを表せない。外すは、外したい商品の上で。2026-10-26 利用者) */}
            <Hint hintKey="simpleCard.productSlot">{t('箱を押すと、詳しい情報・画像。右の一覧で別の商品を押すと、この枠の商品と見比べて入れ替えられます。並べ替えは、プレビューでつかんで動かすか、Alt + 矢印。外すときは、プレビューの商品の × か Delete。', 'Click the box for details and image. Click another product in the list on the right to compare and swap. To reorder, drag in the preview or press Alt + arrow keys. To remove, use the × on the product in the preview or press Delete.')}</Hint>
          </>
        )
      }
      case 'slot':
        // 空いた枠も、商品の枠の「入れ替える」と同じ引き出し(AI のおすすめ・AI に頼む・すべての商品)を「入れる」として開く(2026-10-29 利用者)。
        // このセクションの残りの候補は、AI のおすすめのタブに、AI に頼むまでのはじめの候補として出す
        return <SlotFill key={partKey(part)} editor={e} at={slotAt} chat={chatOf(part)} />
      case 'button': {
        const slot = e.linkSpots.find((x) => x.kind === 'button' && x.key === part.id)
        const tp = findPart(getTemplate(e.template), part.id)
        return (
          <>
            {tp && hasPartFields(tp) ? (
              <PartContentFields part={tp} value={e.partContent} onChange={e.setPartContent} variants={!!e.ab} />
            ) : (
              <TemplateLocked text={t('ボタンの文言はテンプレートで決まっています(テンプレートで「配信ごとに書き換えてよい」にすると、ここで書き換えられます)。', 'The button text comes from the template (allow rewriting per delivery in the template to change it here).')} />
            )}
            {e.ab && <span className={s.caption}>{t('リンク先は全部の案で共通です。', 'Links are shared by all variants.')}</span>}
            {slot && <Text size={200}>{slot.label}</Text>}
            {e.channel === 'email' ? (
              <Field label={t('リンク先(空は既定)', 'Link (empty uses the default)')} size="small">
                <span className={s.row}>
                  <Input className={s.grow} size="small" autoFocus value={e.links.buttons?.[part.id] ?? ''} placeholder={slot?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, buttons: { ...e.links.buttons, [part.id]: d.value } })} />
                  <OpenLink url={e.links.buttons?.[part.id]?.trim() || slot?.defaultUrl} />
                </span>
                {slot && <TrackedUrl url={e.linkUrlOf(slot)} />}
              </Field>
            ) : (
              slot && (
                <Field label={t('押したときに開く画面', 'Screen opened on tap')} size="small">
                  <AppScreenField links={e.links} onLinks={e.setLinks} slot={slot} items={e.items} products={e.products} campaign={e.fcmCampaign} />
                </Field>
              )
            )}
          </>
        )
      }
      case 'image': {
        // テンプレートの表の画像・動画(T8)。テンプレートで差し替えを許した画像は、この配信の画像に替えられる(段階 6)。リンク先は、ボタンと同じく配信ごと
        const slot = e.linkSpots.find((x) => x.kind === 'button' && x.key === part.id)
        const tp = findPart(getTemplate(e.template), part.id)
        return (
          <>
            {tp && hasPartFields(tp) ? (
              <PartContentFields part={tp} value={e.partContent} onChange={e.setPartContent} variants={!!e.ab} />
            ) : (
              <TemplateLocked text={t('画像はテンプレートで決まっています(テンプレートで「配信ごとに差し替える」にすると、ここで替えられます)。押したときのリンク先は、この配信で決められます。', 'The image comes from the template (turn on “Swap per delivery” in the template to swap it here). The link on click can be set for this delivery.')} />
            )}
            {slot && <Text size={200}>{slot.label}</Text>}
            {e.channel === 'email' ? (
              <Field label={t('リンク先(空は既定)', 'Link (empty uses the default)')} size="small">
                <span className={s.row}>
                  <Input className={s.grow} size="small" autoFocus value={e.links.buttons?.[part.id] ?? ''} placeholder={slot?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, buttons: { ...e.links.buttons, [part.id]: d.value } })} />
                  <OpenLink url={e.links.buttons?.[part.id]?.trim() || slot?.defaultUrl} />
                </span>
                {slot && <TrackedUrl url={e.linkUrlOf(slot)} />}
              </Field>
            ) : (
              slot && (
                <Field label={t('押したときに開く画面', 'Screen opened on tap')} size="small">
                  <AppScreenField links={e.links} onLinks={e.setLinks} slot={slot} items={e.items} products={e.products} campaign={e.fcmCampaign} />
                </Field>
              )
            )}
          </>
        )
      }
      case 'text': {
        // テンプレートの表のテキスト(T8)。テンプレートで書き換えを許した文は、この配信の文に書き換えられる(段階 6)。空はテンプレートの文
        const tp = findPart(getTemplate(e.template), part.id)
        if (!tp || !hasPartFields(tp)) return <TemplateLocked text={t('この文はテンプレートで決まっています(テンプレートで「配信ごとに書き換えてよい」にすると、ここで書き換えられます)。', 'This text comes from the template (allow rewriting per delivery in the template to change it here).')} />
        return <PartContentFields part={tp} value={e.partContent} onChange={e.setPartContent} variants={!!e.ab} autoFocus />
      }
      case 'template':
        return <TemplatePicker editor={e} />
      case 'overview':
      case 'meta':
        return <MetaFields editor={e} focus={part.field} />
    }
  })()

  const titleOf = (p: PartRef | null): string => {
    if (!p) return t('配信の全体', 'Whole delivery')
    switch (p.kind) {
      case 'subject': return t('件名', 'Subject')
      case 'preheader': return t('プリヘッダー', 'Preheader')
      case 'pushTitle': return t('通知のタイトル', 'Notification title')
      case 'pushBody': return t('通知の本文', 'Notification body')
      case 'headline': return t('ヘッドライン', 'Headline')
      case 'copy': return t('コピー', 'Copy')
      case 'hero': return t('メイン画像', 'Main image')
      case 'sectionTitle': return t(`${sections[p.index]?.label ?? ''} の見出し`, `${sections[p.index]?.label ?? ''} heading`)
      case 'sectionCopy': return t(`${sections[p.index]?.label ?? ''} のコピー`, `${sections[p.index]?.label ?? ''} copy`)
      case 'section': return sectionName(p.index) || t('セクション', 'Section')
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

  // パンくずの最後(いま選んでいる部品)。セクションの中の部品は、セクションの中での呼び名にする(例: 7 枠目・見出し)
  const crumbOf = (p: PartRef): string => {
    const sec = inSection !== null ? sections[inSection] : undefined
    if (sec) {
      if (p.kind === 'sectionTitle') return t('見出し', 'Heading')
      if (p.kind === 'sectionCopy') return t('コピー', 'Copy')
      if (p.kind === 'slot') return t(`${p.index - sec.start + 1} 枠目(空き)`, `Slot ${p.index - sec.start + 1} (empty)`)
      if (p.kind === 'product') {
        const n = e.items.findIndex((i) => i.key === p.itemKey) - sec.start + 1
        return t(`${n} 枠目`, `Slot ${n}`)
      }
    }
    return titleOf(p)
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        {part ? (
          // どこを選んでいるか: 配信の全体 › セクション › 部品。上の段を押すと、そこを選び直す(2026-10-28 利用者)
          <Breadcrumb size="small" aria-label={t('選んでいる部品の場所', 'Where the selected part is')} className={s.crumbs}>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => onPick(null)}>{t('配信の全体', 'Whole delivery')}</BreadcrumbButton>
            </BreadcrumbItem>
            {inSection !== null && part.kind !== 'section' && (
              <>
                <BreadcrumbDivider />
                <BreadcrumbItem>
                  <BreadcrumbButton onClick={() => onPick({ kind: 'section', index: inSection })}>{sectionName(inSection)}</BreadcrumbButton>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{crumbOf(part)}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
        ) : (
          <InfoLabel
            className={s.title}
            size="medium"
            weight="semibold"
            info={t(
              '何も選んでいないときは、配信の全体を扱います(配信の情報を見る・AI で全体を下書きする)。プレビューの部品(見出し・画像・商品の枠など)を押すと、ここでその部品だけを直せます。Tab で次の部品、Esc で選ぶのをやめます。',
              'With nothing selected, this pane is about the whole delivery (view the delivery info, draft everything with AI). Click a part in the preview (headline, image, product slot...) to edit just that part here. Tab moves to the next part, Esc stops.',
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
      {part && part.kind !== 'meta' && part.kind !== 'overview' && <Aim editor={e} onChange={() => onPick({ kind: 'meta', field: 'theme' })} />}
      {compareBlock}
      {body}
      {/* セクションの部品(見出し・コピー・商品・空いた枠)では、そのセクションの商品をまとめて AI で選べる(X81 の 9) */}
      {productsAiOn && sectionOfPart !== null && <SectionAiPick key={sectionOfPart} editor={e} index={sectionOfPart} name={sectionName(sectionOfPart)} />}
      {/* 制作へのメモ: 直しながら思いついたイメージを、その部品の名前つきで渡すものに書き留める(配信の情報・テンプレートは除く) */}
      {part && part.kind !== 'meta' && part.kind !== 'overview' && part.kind !== 'template' && <ProductionMemo editor={e} label={titleOf(part)} />}
    </div>
  )
}

/**
 * 計測用のパラメーター(utm)つきの、実際に送る URL(X81 の 8)。utm は自動で付き、手で変えると計測が壊れるので、読むだけ。
 * 決まった値(utm_source・utm_medium)を変える欄は、⚙ の設定にだけ置く(ふだんは変えないため)
 */
function TrackedUrl({ url }: { url: string }) {
  const t = useT()
  const s = useStyles()
  if (!url || !/^https?:\/\//.test(url)) return null
  // 付いている計測用のパラメーター(utm_ で始まるもの。決まった 4 つのほかに付いていれば、それも出す)
  let params: [string, string][] = []
  try {
    params = [...new URL(url).searchParams.entries()].filter(([k]) => k.startsWith('utm_'))
  } catch {
    params = []
  }
  return (
    <span className={s.trackedUrl}>
      <InfoLabel
        size="small"
        info={t(
          'utm_source・utm_medium は決まった値(⚙ の設定の「差出人の名前・店の URL・計測用の値」で、全社・国ごとに変えられます。メールとアプリで medium が違います)。utm_campaign は配信日と配信カードの ID から、utm_content はリンクの場所から、自動で決まります。AB テストの配信は、utm_campaign の末尾に案の印(-a・-b・-c)が自動で付きます。GA で、どの配信のどのリンクが押されたかを見分けるためです。まだ保存していない配信は、保存すると ID が付きます。',
          'utm_source and utm_medium are fixed values (change them per company or country in ⚙ Settings, Sender name, shop URL, and tracking values; email and app use different mediums). utm_campaign comes from the send date and delivery card ID, and utm_content from the link spot, automatically. For A/B tests, the variant (-a, -b, -c) is added to the end of utm_campaign automatically. This lets GA tell which link in which delivery was clicked. An unsaved delivery gets its ID when saved.',
        )}
      >
        {t('計測用のパラメーターつき', 'With tracking')}
      </InfoLabel>
      <span className={s.trackedText}>{url}</span>
      {params.map(([k, v]) => (
        <LabeledValue key={k} label={k} labelWidth="96px">
          {v}
        </LabeledValue>
      ))}
    </span>
  )
}

/**
 * セクションの商品をまとめて AI で選ぶ(X81 の 9。詳しい画面の ③ セクションの「AIで選ぶ / 選び直す」と同じ AI で、見出し・コピーを踏まえる)。
 * 案は試す → 確定: 出た案をそのセクションのプレビューにだけ仮に写し、帯の「確定」で、そのセクションの商品と候補を置き換える
 */
function SectionAiPick({ editor: e, index, name }: { editor: SimpleEditor; index: number; name: string }) {
  const t = useT()
  const s = useStyles()
  const trial = useTrial()
  const [result, setResult] = useState<ProductSelection | null>(null)
  const [error, setError] = useState('')
  const busy = e.sectionAi.busy(index)
  const noTheme = !e.form.theme.trim()
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const sec = sectionsOf(e.template)[index]
  const count = sec ? filled(e.items.slice(sec.start, Number.isFinite(sec.slots) ? sec.start + sec.slots : undefined)).length : 0
  // 案を試しているあいだは、プレビューのそのセクションを光らせ続ける(どこが変わるかを見せる)
  const trying = !!trial.trial
  useEffect(() => {
    if (!trying) return
    setSectionGlow(index)
    return () => setSectionGlow(null)
  }, [trying, index])
  // ほかの部品を選んでこのボタンが消えるときに、載せていた光が残らないように
  useEffect(() => () => setSectionGlow(null), [])
  const run = async () => {
    setError('')
    trial.cancel()
    const r = await e.sectionAi.run(index)
    if (!r || r.selected.length === 0) {
      setResult(null)
      setError(t('AI の案が出ませんでした。もう一度試してください。', 'AI returned no ideas. Please try again.'))
      return
    }
    setResult(r)
    trial.tryIt({
      key: `section-${index}-${Date.now()}`,
      from: t(`いまの商品 ${count} 件`, `Current ${count} products`),
      to: t(`AI の案 ${r.selected.length} 件`, `AI idea: ${r.selected.length} products`),
      preview: () => e.setAiPreview({ section: { index, productIds: r.selected.map((x) => x.productId) } }),
      unpreview: () => e.setAiPreview(null),
      apply: () => {
        e.setAiPreview(null)
        e.sectionAi.apply(index, r)
        setResult(null)
      },
    })
  }
  return (
    <div className={s.sectionAi}>
      <span className={s.row}>
        {/* 載せると、プレビューのそのセクションを光らせる(どのセクションのことかを見せる) */}
        <Button
          size="small"
          appearance="outline"
          icon={busy ? <Spinner size="extra-tiny" /> : <SparkleRegular />}
          // 押せないとき(テーマが空など)も、載せるとどのセクションかが光るように、disabled でなく disabledFocusable にする
          disabledFocusable={busy || noTheme || e.saving}
          onClick={() => void run()}
          onMouseEnter={() => setSectionGlow(index)}
          onMouseLeave={() => !trying && setSectionGlow(null)}
          onFocus={() => setSectionGlow(index)}
          onBlur={() => !trying && setSectionGlow(null)}
        >
          {result ? t(`${name} の案を作り直す`, `Regenerate ${name}`) : t(`${name} の商品を AI で選ぶ`, `Pick ${name} products with AI`)}
        </Button>
        {noTheme && <span className={s.caption}>{t('テーマを入れると使えます', 'Enter a theme to use this')}</span>}
      </span>
      {error && <span className={s.caption}>{error}</span>}
      {result && trial.trial && (
        <>
          <TrialBar state={trial} />
          <span className={s.caption}>{t('プレビューのこのセクションに仮に写しています。「確定」で、このセクションの商品を置き換えます(残りの案は候補に入ります)。', 'Shown in this section of the preview for now. Apply replaces this section’s products (the rest go to candidates).')}</span>
          <div className={s.sectionAiList}>
            {result.selected.map((r, n) => {
              const p = byId.get(r.productId)
              return (
                <span key={`${r.productId}-${n}`} className={s.sectionAiRow}>
                  <span className={s.name}>{`${n + 1}. ${p?.name ?? r.productId}`}</span>
                  {r.reason && <span className={s.caption}>{r.reason}</span>}
                </span>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * テンプレートの選び直し(SU1 ⑧・段階 b)。チャネルのテンプレートを、見取り図と一緒に並べる。乗せるとプレビューに仮で写し(この配信の商品・画像のまま)、
 * 押すと替える。枠に収まらない商品は「枠外」として、メールには載らないことを知らせる(載せたままにするので、戻せば元の枠に戻る)。
 * 選択肢は、この国で使うテンプレートのいまの版だけ。この配信が前の版・使わない(無効)・この国で使わないのテンプレートなら、一覧の上に知らせと「いまの版にする」を出す。
 * どの選択肢にも、最近の使われ方(最近 4 週で何本・同じ週に何本・最後に使った日)を出す(詳しい画面の ② テンプレートと同じ。X81 の 7)
 */
function TemplatePicker({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  // 版の知らせ・「いまの版にする」・使われ方は、公開しているときだけ(X87)
  const versionOn = useFeature('content.template.version')
  const s = useStyles()
  const slotsOf = (sections?: { slots: number }[]) => (sections ?? []).reduce((n, x) => n + x.slots, 0)
  const keyState = templateKeyState(e.template, e.card.country)
  const pick = async (id: string) => {
    // 前の版を使っているときは、同じテンプレートのいまの版を押しても替える(「いまの版にする」と同じ)
    if (id === e.template) return
    if (e.candidates.length > 0 && !(await confirmDialog(t('テンプレートを替えると、セクションの構成が変わるので、残りの候補(AI が出した商品の案)は外れます。替えますか?', 'Changing the template changes the sections, so the remaining candidates (AI product ideas) are cleared. Change it?')))) return
    e.setAiPreview(null)
    e.setTemplate(id)
  }
  return (
    <>
      <Hint hintKey="simpleCard.templatePick">{t('マウスを乗せると、この配信の中身のままプレビューに写します。押すと替えます(元に戻すで戻せます)。', 'Hover to preview with this delivery’s content; click to switch (Undo works).')}</Hint>
      {versionOn && keyState && (
        <div className={mergeClasses(s.tplCard, s.tplOn, s.tplNote)}>
          {keyState.cur.push ? <PushThumb spec={keyState.cur.push} width={72} /> : <TemplateThumb layout={keyState.cur} maxHeight={110} />}
          <span style={{ display: 'grid', rowGap: 4, minWidth: 0 }}>
            <span className={s.row}>
              <span className={s.name}>{keyState.cur.label}</span>
              <Badge size="small" appearance="filled" color="brand">{t('いまのテンプレート', 'Current')}</Badge>
              {keyState.old && <Badge size="small" appearance="outline">{t(`版 ${keyState.version}`, `v${keyState.version}`)}</Badge>}
            </span>
            <TemplateKeyNote state={keyState} onUpdate={(id) => void pick(id)} />
          </span>
        </div>
      )}
      <div className={s.tplList} onMouseLeave={() => e.setAiPreview(null)}>
        {templateOptions(e.channel, false, e.card.country).map((o) => {
          const slots = o.id === 'free' ? Infinity : slotsOf(o.sections)
          const over = Number.isFinite(slots) ? Math.max(0, filled(e.items).length - slots) : 0
          // 前の版を使っているときは、いまの版の選択肢は「いまのテンプレート」にしない(押すといまの版に替わる)
          const on = o.id === e.template
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
                  {Number.isFinite(slots) && <span className={s.caption}>{t(`商品の枠 ${slots}`, `${slots} product ${slots === 1 ? 'slot' : 'slots'}`)}</span>}
                  {over > 0 && <Badge size="small" appearance="tint" color="warning">{t(`${over} 件が枠外(メールに載らない)`, `${over} out of slots (not in the email)`)}</Badge>}
                </span>
                {versionOn && e.templateUse && <TemplateUseLine u={e.templateUse.get(o.id)} />}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/**
 * 何も選んでいないとき = 配信の全体を選んでいる(2026-10-27 利用者)。上から、配信の情報(読むだけ)・AI で全体を下書き・案内の 1 行。
 * 載せた商品の一覧は、右の商品情報と重なるので出さない。直すのは配信の情報のペイン(「変える」)で、状態と保存は CardDetail の 1 つ
 */
function WholePane({ editor: e, onEdit }: { editor: SimpleEditor; onEdit: () => void }) {
  const t = useT()
  const s = useStyles()
  // AI で全体を下書きする(X87。MVP で公開)
  const draftOn = useFeature('ai.draft')
  // どう作るか(任意)。下書きのたびに書き直すものなので、覚えない
  const [request, setRequest] = useState('')
  const f = e.form
  return (
    <>
      <div className={s.aim}>
        <div className={s.aimHead}>
          <span className={s.label}>{t('配信の情報', 'Delivery info')}</span>
          <Button type="button" size="small" appearance="transparent" className={s.aimChange} onClick={onEdit}>
            {t('変える', 'Change')}
          </Button>
        </div>
        <LabeledValue label={t('配信日', 'Send date')}>{f.scheduledAt ? new Date(f.scheduledAt).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</LabeledValue>
        <LabeledValue label={t('国', 'Country')}>{optionLabel(countryOptions.find((o) => String(o.value) === f.country)?.label ?? '')}</LabeledValue>
        <LabeledValue label={t('対象', 'Target')} emptyText={t('指定なし', 'Not specified')}>
          {targetText({ gender: f.targetGender, ages: f.targetAges })}
        </LabeledValue>
        <LabeledValue label={t('送る相手', 'Send to')}>{audienceSet(e.audience, e.channel) ? audienceLabel(e.audience, e.channel) : ''}</LabeledValue>
        <LabeledValue label={t('テーマ', 'Theme')} emptyText={t('テーマなし', 'No theme')}>
          {f.theme}
        </LabeledValue>
        {f.themeReason && <span className={s.caption}>{t(`理由: ${f.themeReason}`, `Why: ${f.themeReason}`)}</span>}
      </div>
      {draftOn && (
      <div className={s.aimWrap}>
        <Field
          size="small"
          label={t('AI で全体を下書きする', 'Draft the whole delivery with AI')}
          hint={t('どう作るか(任意)。空なら、いまのテーマから全体を作ります', 'How to make it (optional). Leave empty to build everything from the current theme')}
        >
          <AutoTextarea heightKey="PartPane.wholeRequest" size="small" rows={2} value={request} placeholder={t('例: 20 代向けに、もっとカジュアルに', 'e.g. More casual, for people in their 20s')} onChange={(_, d) => setRequest(d.value)} />
        </Field>
        <Button type="button" appearance="primary" size="small" className={s.themeIdeasClose} icon={e.drafting ? <Spinner size="extra-tiny" /> : <SparkleRegular />} disabled={e.drafting || e.saving || e.locked} onClick={() => e.draftWhole(request)}>
          {t('AI で下書きする', 'Draft with AI')}
        </Button>
      </div>
      )}
      {/* 部品ごとに直すときの入口(X72 の案内の置き方 1)。キーの操作などの詳しい説明は、見出しの ⓘ */}
      <span className={s.caption}>{t('直したい所は、プレビューで押してください', 'Click what you want to change in the preview')}</span>
    </>
  )
}

/**
 * この配信のねらい(テーマと切り口)。直す部品の上に小さく出し、ねらいを見ながら書けるようにする。
 * ここでは読むだけ。テーマを変えるのは、プレビューの上の配信の情報(ThemeField)の 1 か所だけ(2026-10-27 利用者。直す場所を 1 つにする)。右上の「変える」で、そこへ移る。
 * 採用した案の理由と、切り口(見出し・コピーの AI の案を採用したときの補足)も、読むだけで添える
 */
function Aim({ editor: e, onChange }: { editor: SimpleEditor; /** 「変える」: 配信の情報のテーマの欄を開く */ onChange: () => void }) {
  const t = useT()
  const s = useStyles()
  return (
    <div className={s.aim}>
      <div className={s.aimHead}>
        <LabeledValue label={t('テーマ', 'Theme')} emptyText={t('テーマなし', 'No theme')}>
          {e.form.theme}
        </LabeledValue>
        {/* 直す場所は配信の情報の 1 か所だけなので、ここからはそこへ連れて行く(どこで変えるのか分からなかった。2026-10-27 利用者) */}
        <Tooltip content={t('配信の情報のテーマの欄を開きます', 'Opens the theme field in the delivery info')} relationship="description">
          <Button type="button" size="small" appearance="transparent" className={s.aimChange} onClick={onChange}>
            {t('変える', 'Change')}
          </Button>
        </Tooltip>
      </div>
      {e.form.themeReason && <span className={s.caption}>{t(`理由: ${e.form.themeReason}`, `Why: ${e.form.themeReason}`)}</span>}
      {e.form.copyAngle && <span className={s.caption}>{t(`切り口(見出し・コピー): ${e.form.copyAngle}`, `Angle (headline & copy): ${e.form.copyAngle}`)}</span>}
      {e.ab && <span className={s.caption}>{t('テーマは全部の案で共通', 'The theme is shared by all variants')}</span>}
    </div>
  )
}

/** 空いた枠に商品を入れる引き出し(商品の枠の入れ替えと同じ ProductChooser。押すとプレビューで試し、「確定」で入れる) */
function SlotFill({ editor: e, at, chat }: { editor: SimpleEditor; at: number; chat: { turns: PartTurn[]; setTurns: (f: (prev: PartTurn[]) => PartTurn[]) => void } }) {
  const t = useT()
  const s = useStyles()
  // この画面に来たのは入れるためなので、はじめから開いておく(閉じれば、ボタンだけになる)
  const [open, setOpen] = useState(true)
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const sec = sectionIndexAt(sectionsOf(e.template), Math.max(0, at))
  const cands = e.candidates.filter((c) => c.section === sec)
  return (
    <>
      <span className={s.caption}>{t('空いた枠に商品を入れます(空いた枠は、前から埋まります)。', 'Put a product in an empty slot (empty slots fill from the front).')}</span>
      <ProductChooser
        title={t('この枠に入れる商品', 'Product for this slot')}
        frame={{ kind: 'drawer', open, onOpenChange: setOpen, label: t('入れる', 'Add'), icon: <AddRegular /> }}
        card={e.aiCard()}
        angle={e.form.copyAngle}
        products={e.poolProducts}
        inCard={e.items.flatMap((i) => (i.gap ? [] : (byId.get(i.productId) ?? [])))}
        fallback={cands.map((c) => ({ key: c.key, productId: c.productId, reason: c.reason, onPick: () => e.addProduct(c.productId, at) }))}
        onPick={(productId) => e.addProduct(productId, at)}
        onPreview={(productId) => e.setAiPreview(productId ? { item: { key: '', productId, at } } : null)}
        chat={chat}
        disabled={e.saving}
      />
    </>
  )
}

/**
 * テーマを直す欄(配信の情報の中。テーマを変えるのはここだけ)。
 * AI のテーマの案は、押すとこの欄にだけ仮に写し(テーマはメールに出ないので、プレビューは変わらない)、帯の「確定」で採用する(X81 の 4)。
 * 採用した案の理由は小さく出す(手で直すと消える)
 */
function ThemeField({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  // テーマの案(AI)は、公開しているときだけ(X87。手で書く欄はいつも)
  const themeAiOn = useFeature('ai.theme')
  // 試している案(欄にだけ仮に写す。保存する中身は変えない)
  const [trying, setTrying] = useState<{ theme: string; reason: string } | null>(null)
  const reason = trying ? trying.reason : e.form.themeReason
  // 案のタブは、テーマの案の AI(商品・ほかの配信のテーマを踏まえる)。開いたときの自動の下書きで作った案があれば、それを出す
  const fromThemes = (list: ThemeSuggestion[]) => list.map((x) => ({ value: x.theme, why: x.reason }))
  return (
    <div data-field="theme" className={s.aimWrap}>
      <Field label={t('テーマ', 'Theme')} hint={t('配信全体の前提。メールには出ません', 'Premise for the whole delivery; not in the email')} size="small">
        {/* 試しているあいだは、案を写して読むだけにする(本物のテーマではないと分かるように) */}
        <AutoTextarea heightKey="PartPane.e_form_theme" size="small" rows={2} className={trying ? s.aimTrying : undefined} readOnly={!!trying} value={trying?.theme ?? e.form.theme} placeholder={t('テーマ', 'Theme')} onChange={(_, d) => e.setField('theme', d.value)} />
      </Field>
      {reason && <span className={s.caption}>{t(`理由: ${reason}`, `Why: ${reason}`)}</span>}
      {e.ab && <span className={s.caption}>{t('テーマは全部の案で共通', 'The theme is shared by all variants')}</span>}
      {/* 見出し・件名と同じ「AI で変える」(案 = テーマの案と理由 / 指示して直す)。テーマはメールに出ないので、試している案は上の欄にだけ写す(2026-10-29 利用者) */}
      {themeAiOn && (
      <TextAiPanel
        kind="theme"
        label={t('テーマ', 'Theme')}
        value={e.form.theme}
        ideasRequest={THEME_IDEAS}
        initialIdeas={fromThemes(e.themeAi.ideas)}
        renderIdea={(idea) => <span className={s.aimTheme}>{idea.value}</span>}
        placeholder={t('自分で書く(例: もっと季節感を出して)', 'Write your own (e.g. More seasonal)')}
        ask={async (request, count, history) => {
          if (request === THEME_IDEAS) return { reply: '', answered: false, ideas: fromThemes(await e.themeAi.ask()) }
          return askPartRewrite({
            card: e.aiCard(),
            angle: e.form.copyAngle,
            part: { kind: 'theme', label: t('テーマ', 'Theme'), current: e.form.theme },
            context: { subject: e.form.subject || e.form.name, headline: e.form.headline, copy: e.form.copy },
            request,
            history,
            count,
          })
        }}
        onPreview={(v, idea) => setTrying(v === null ? null : { theme: v, reason: idea?.why ?? '' })}
        onAdopt={(idea) => {
          setTrying(null)
          e.adoptTheme(idea.value, idea.why)
        }}
      />
      )}
    </div>
  )
}

/** テーマの案のタブで頼むときの印(画面には出さない。この印のときはテーマの案の AI を使う) */
const THEME_IDEAS = '__theme_ideas__'

/**
 * 配信の管理の項目(種類・国・ターゲット・担当)。文言を直すときには使わないので、配信の情報の中に置く。
 * 制作指示・制作の担当・制作の締め切りは、渡すもの(HandoffSheet)だけで決める(2 か所で入力しない。2026-10-27 利用者の決め)
 */
function ManageFields({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  return (
    <>
      <div className={s.twoCol}>
        <ChoiceField label={t('種類', 'Type')} value={e.form.themeType} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={(v) => e.setField('themeType', v)} size="small" field="themeType" />
        <ChoiceField label={t('国', 'Country')} value={e.form.country} options={countryOptions} onChange={(v) => e.setField('country', v)} size="small" field="country" />
      </div>
      <TargetField gender={e.form.targetGender} ages={e.form.targetAges} onGender={(v) => e.setField('targetGender', v)} onAges={(v) => e.setField('targetAges', v)} size="small" field="target">
        {/* 送る相手(X81 の 3。メールでもアプリでも。詳しい画面の配信情報と同じ部品) */}
        <AudienceRow value={e.audience} onChange={e.setAudience} channel={e.channel} />
      </TargetField>
      <OwnerField value={e.form.owner} onChange={(v) => e.setField('owner', v)} owners={e.people} size="small" field="owner" />
    </>
  )
}

/** 配信の情報(プレビューの上の配信の情報の帯を押したとき)。配信の管理の項目も、ここにまとめる */
function MetaFields({ editor: e, focus }: { editor: SimpleEditor; focus?: string }) {
  const t = useT()
  const s = useStyles()
  const ref = useFocusField(focus)
  return (
    <div ref={ref} className={s.root}>
      <NameField value={e.form.name} onChange={(v) => e.setField('name', v)} size="small" field="name" />
      <ThemeField editor={e} />
      {/* 切り口(見出し・コピーの方向)。AI の案を採用すると入るが、手でも直せるように(詳しい画面を消す前の移し替え。2026-10-28 利用者) */}
      <Field label={t('切り口(見出し・コピー)', 'Angle (headline & copy)')} hint={t('見出し・コピーをどの方向で書くか。AI の案にも渡します', 'Which direction to write the headline and copy in. Also passed to AI ideas')} size="small">
        <Input size="small" value={e.form.copyAngle} placeholder={t('例: 寒くなる前の準備', 'e.g. Get ready before it gets cold')} onChange={(_, d) => e.setField('copyAngle', d.value)} data-field="copyAngle" />
      </Field>
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

