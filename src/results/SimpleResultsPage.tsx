// 結果のシンプルな画面(X89。req-results-simple.md の案 A。2026-11-02 利用者がおすすめどおりに決定)。
// 計画の配信カード・制作のシンプルな画面と同じ窓のまま、段階のタブで RESULTS に切り替える(重ねるフロートにしない)。
// 形も同じ: 上の帯(面の枠)・左のバー・プレビュー(送った中身に、クリックのヒートマップを重ねる)・右のペイン。
// 何も選ばないと「この配信の結果」(数字の札・AB の結果・次に生かすメモ)、プレビューのリンク・件名を押すと「その部品の数字」
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dialog, InfoLabel, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner, Tab, TabList, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowSwapRegular, BoxRegular, CommentRegular, DataBarVerticalRegular, DismissRegular, DocumentPdfRegular, LinkRegular, MoreHorizontalRegular, TrophyRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { VariantKey } from '../abTest'
import { DeliveryResultsService, type DeliveryResult } from '../data/deliveryResults'
import { HeatPreview, type HeatRow } from '../HeatPreview'
import { AdoptedAi, ResultKpis } from '../ResultSummary'
import { AbResult } from '../AbResult'
import { ProductRankings } from '../ProductRankings'
import { ResultCompare } from '../ResultCompare'
import { abVerdict } from '../abResults'
import { parseAbTest } from '../abTest'
import { COUNTRY_US, isPush, parseProductResults, pct, sentAtOf, toResultRows, type ResultRow } from '../results'
import { buildSnapshot, productionVariants, snapshotOf, withCardImages } from '../productionSnapshot'
import { slotIdsOf } from '../slots'
import { printReport } from '../printReport'
import { ResizableSurface } from '../ResizableSurface'
import { PreviewHints } from '../Preview'
import { useCardDetailStyles } from '../cardDetailStyles'
import { AutoTextarea } from '../AutoTextarea'
import { LabeledValue } from '../LabeledValue'
import { CampaignBand } from '../CampaignBand'
import { CopyLinkButton } from '../CopyLinkButton'
import { DevRequestMenuItem } from '../DevRequestMenu'
import { FeatureBadge } from '../FeatureBadge'
import { useCampaignOf } from '../useCampaignOf'
import { cardDisplayName } from '../campaigns'
import { PREF } from '../prefKeys'
import { typo } from '../typo'
import { locale, priceText, useT } from '../i18n'
import { useFeature } from '../featureFlags'
import { SideRail, type RailItem } from '../simple/SideRail'
import { PreviewFrame, StageFrame, StagePane, StagePanes } from '../simple/StageFrame'
import { STAGE_ZOOM_KEY, useStageLayout } from '../simple/stageLayout'
import { useStageNoteCounts } from '../simple/useStageNoteCounts'
import { sendWhenText } from '../dates'
import { useSidePanel } from '../simple/useSidePanel'
import { PaneCrumbs, PaneHint } from '../simple/PaneCrumbs'
import { InboxLines, type InboxPart } from '../simple/InboxLines'
import { usePreviewZoom } from '../simple/usePreviewZoom'
import { CampaignResultsTable } from './CampaignResultsTable'
import { productWeekOf, sumOf } from './resultSums'
import { WeeklyPerformancesService } from '../data/weeklyPerformances'
import type { WeeklyPerformance } from '../models/weeklyPerformances'
import { useDeliveryImpact } from '../useDeliveryImpact'
import { ResultsAiPanel } from './ResultsAiPanel'
import { StageTalkPanel } from '../simple/StageTalkPanel'

const useStyles = makeStyles({
  surface: { padding: 0 },
  // 状態の札(計画の承認の札・制作の状態の札と同じ場所・同じ形)
  chip: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', height: '24px', padding: '0 10px', borderRadius: tokens.borderRadiusCircular, border: `1px solid ${tokens.colorNeutralStroke1}`, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: '50%' },
  paneBody: { display: 'grid', rowGap: '14px', alignContent: 'start' },
  section: { display: 'grid', rowGap: '6px' },
  h3: { ...typo.heading, margin: 0 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  nums: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', columnGap: '12px', rowGap: '10px' },
  empty: { display: 'grid', rowGap: '8px', padding: '12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  // 案の段(キャンペーンの帯の 3 段目): 案ごとの数字と、勝ち案の印
  abBar: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  tabNum: { marginLeft: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  win: { marginLeft: '4px', color: tokens.colorPaletteMarigoldForeground1, verticalAlign: '-2px' },
  // 左のパネルの表(リンクごとのクリック)
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer' },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  rowOn: { backgroundColor: tokens.colorBrandBackground2 },
  missing: { color: tokens.colorNeutralForeground3 },
  bar: { height: '6px', borderRadius: '3px', backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  panel: { display: 'grid', rowGap: '10px', alignContent: 'start', padding: '12px 14px', overflow: 'auto', minHeight: 0 },
})

/** 選べるもの: プレビューのリンク(HeatPreview の鍵)か、受信箱・通知の行 */
type Picked = { kind: 'link'; key: string } | { kind: 'inbox'; part: InboxPart }
type Side = 'summary' | 'links' | 'products' | 'compare' | 'talk'

interface Props {
  card: DeliveryCard
  /** すべての配信(キャンペーンのきょうだい・前の配信と比べる) */
  allCards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  productIds: string[]
  variantIds?: Partial<Record<VariantKey, string[]>>
  products: Product[]
  /** この配信で替えた商品の画像(商品の id → 画像の URL)。計画・制作と同じ画像で見せる */
  productImages?: Map<string, string>
  heroes: HeroImage[]
  /** やり取りの宛先・タスクの担当の候補 */
  people: string[]
  onClose: () => void
  /** 窓の出てくる動きを付けない(同じ窓のまま段を切り替えたとき) */
  instant?: boolean
  /** 段階のタブ(PLAN | PRODUCTION | RESULTS) */
  stageTabs?: ReactNode
  /** キャンペーンの帯のタブで、きょうだいの配信の結果へ */
  onSwitchCard?: (id: string) => void
}

const money = (card: DeliveryCard) => (v?: number) => priceText(v === undefined ? undefined : Math.round(v), card.country === COUNTRY_US ? 'US' : 'JP')

export function SimpleResultsPage({ card, allCards, cardProducts, productIds, variantIds, products, productImages, heroes, people, onClose, instant, stageTabs, onSwitchCard }: Props) {
  const s = useStyles()
  const cardStyles = useCardDetailStyles()
  const t = useT()
  const pdfOn = useFeature('results.pdf')
  const compareOn = useFeature('results.compare')
  const abOn = useFeature('card.abtest')
  const learningsOn = useFeature('results.learnings')
  const threadOn = useFeature('collab.thread')
  const tasksOn = useFeature('collab.tasks')
  // この配信に渡した学び(AI の下書きに渡したもの。v3)
  const impact = useDeliveryImpact(card.id, String(card.country ?? ''))
  const push = isPush(card)
  const fmt = money(card)
  const n = (v?: number) => (v ?? 0).toLocaleString(locale())

  // 結果(すべての配信の分。前の配信と比べる・キャンペーンのきょうだいの数字に使う)
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const load = async () => {
    const r = await DeliveryResultsService.getAll()
    setResults(r.success ? (r.data ?? []) : [])
  }
  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((r) => setResults(r.success ? (r.data ?? []) : []))
      .catch(() => setResults([]))
  }, [])
  // 商品の週ごとの実績(商品を選んだときの「その週の販売」「在庫」)
  const [weekly, setWeekly] = useState<WeeklyPerformance[]>([])
  useEffect(() => {
    WeeklyPerformancesService.getAll()
      .then((r) => r.success && setWeekly(r.data ?? []))
      .catch(() => undefined)
  }, [])
  const history = useMemo(() => (results ? toResultRows(allCards, results) : []), [allCards, results])
  const row = history.find((r) => r.card.id === card.id)

  // 送った中身(案ごと)。制作の画面と同じ写しの作り方で、案の見出し・画像・商品を引く
  const shownProducts = useMemo(() => withCardImages(products, productImages), [products, productImages])
  const draft = useMemo(() => buildSnapshot(card, slotIdsOf(card.id, productIds), shownProducts, heroes, variantIds), [card, productIds, shownProducts, heroes, variantIds])
  const ab = parseAbTest(card.ab_test)
  const keys = abOn && row && row.parts.some((p) => p.variant) ? productionVariants(draft) : (['A'] as VariantKey[])
  // 案の段: 'all' = 配信の全体(プレビューは A 案)。案を選ぶと、プレビューも数字もその案
  const [variant, setVariant] = useState<VariantKey | 'all'>('all')
  const cur: VariantKey | 'all' = variant !== 'all' && keys.includes(variant) ? variant : 'all'
  const vs = snapshotOf(draft, cur === 'all' ? 'A' : cur)
  const verdict = row ? abVerdict(row.parts, ab, push) : null
  const variantRow = (k: VariantKey): ResultRow | undefined => {
    if (!row) return undefined
    const parts = row.parts.filter((p) => (p.variant || 'A') === k)
    return parts.length ? toResultRows([{ ...card, ...vs.card, id: card.id } as DeliveryCard], parts)[0] : undefined
  }
  const shownRow = cur === 'all' ? row : variantRow(cur)
  const shownCard = { ...card, ...vs.card, id: card.id } as DeliveryCard

  // 選んだ部品と、ヒートマップのリンクごとの数字(左のバーの表・部品のペインに出す)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [heat, setHeat] = useState<HeatRow[]>([])
  const [overlay, setOverlay] = useState(true)
  const [device, setDevice] = useState<'mobile' | 'pc'>('mobile')
  const deselect = () => setPicked(null)
  // キャンペーンの合計を見ている(帯の 1 段目の名前を押した。X79 (c) の c-1)
  const [campaignView, setCampaignView] = useState(false)
  const siblings = card.campaign_id ? history.filter((r) => r.card.campaign_id === card.campaign_id) : []
  const total = sumOf(siblings)
  const ratio = (a: number, b: number) => (b ? a / b : undefined)

  // 左のバーの「やり取り」の数(結果の段の、まだ済んでいない書き込みと、済んでいないタスク)。開け閉めとタスクの変更で数え直す
  // 左のバー(1 つだけ開く。もう一度押すとしまう)
  const { side, setSide, lastSide, show } = useSidePanel<Side>(null, 'links')
  const noteCounts = useStageNoteCounts(card.id, 'results', [side])
  const talkCounts = noteCounts.counts
  const showSide = (v: Side) => {
    // 「この配信の結果」は、パネルを開かずに、右のペインを全体に戻す
    if (v === 'summary') {
      deselect()
      setSide(null)
      return
    }
    show(v)
  }

  // 次に生かすメモ(= 学び)。打てば入り、1.5 秒で自動で保存(計画・制作と同じ保存の流れ)
  const [notes, setNotes] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const noteText = notes ?? row?.result.notes ?? ''
  const dirty = notes !== null && notes !== (row?.result.notes ?? '')
  const saveNotes = async (text: string) => {
    if (!row) return
    setSaving(true)
    setSaveError(null)
    try {
      const r = await DeliveryResultsService.update(row.result.id, { notes: text })
      if (!r.success) throw new Error(r.error?.message ?? t('保存できませんでした', 'Could not save'))
      setSavedAt(new Date().toISOString())
      await load()
      setNotes(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!dirty || notes === null) return
    pending.current = notes
    const id = window.setTimeout(() => void saveNotes(notes), 1500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, dirty])
  // 閉じる・段を切り替える前に、打ちかけのメモを保存する
  const close = async () => {
    if (dirty && notes !== null) await saveNotes(notes)
    onClose()
  }
  // AB の結果の「メモに入れる」: 次に生かすメモの末尾に足す
  const adopt = async (text: string) => {
    const now = noteText.trim()
    await saveNotes(now ? `${now}\n${text}` : text)
  }

  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const zoom = usePreviewZoom(boxRef, innerRef, STAGE_ZOOM_KEY, `${card.id}:${device}:${cur}`)
  const campaign = useCampaignOf(card.campaign_id)
  const sent = row ? sentAtOf(row) : card.scheduled_at
  const when_ = sendWhenText(sent)

  // 案の段(キャンペーンの帯の 3 段目。X79 (c) の c-1): 案ごとの数字と、勝ち案に 🏆
  const metricOf = (r?: ResultRow) => (r ? pct(r.clickRate) : '—')
  const variantTabs =
    keys.length > 1 ? (
      <div className={s.abBar}>
        <InfoLabel size="small" info={t('案を押すと、プレビューと数字がその案に切り替わります。「全体」は配信の合計(プレビューは A 案)', 'Pick a variant to switch the preview and numbers to it. "All" is the total (the preview shows variant A).')}>
          {t('AB テスト', 'A/B test')}
        </InfoLabel>
        <TabList size="small" selectedValue={cur} onTabSelect={(_, d) => (setVariant(d.value as VariantKey | 'all'), deselect())}>
          <Tab value="all">
            {t('全体', 'All')}
            <span className={s.tabNum}>{metricOf(row)}</span>
          </Tab>
          {keys.map((k) => (
            <Tab key={k} value={k}>
              {t(`案 ${k}`, `Variant ${k}`)}
              <span className={s.tabNum}>{metricOf(variantRow(k))}</span>
              {verdict?.winner?.key === k && verdict.confidence !== 'tooFew' && <TrophyRegular className={s.win} aria-label={t('勝ち案', 'Winner')} />}
            </Tab>
          ))}
        </TabList>
      </div>
    ) : undefined

  // 選んだ部品の名前と数字
  const pickedHeat = picked?.kind === 'link' ? heat.find((h) => h.key === picked.key) : undefined
  const rank = pickedHeat ? [...heat].filter((h) => h.key !== 'push').sort((a, b) => b.clicks - a.clicks).findIndex((h) => h.key === pickedHeat.key) + 1 : 0
  const productResult = picked?.kind === 'link' && picked.key.startsWith('product:') && shownRow ? parseProductResults(shownRow.result.products).find((p) => `product:${p.productId}` === picked.key) : undefined
  const inboxLabel = (p: InboxPart) => ({ subject: t('件名', 'Subject'), preheader: t('プリヘッダー', 'Preheader'), pushTitle: t('通知のタイトル', 'Notification title'), pushBody: t('通知の本文', 'Notification body') })[p]
  const productWeek = productResult ? productWeekOf(weekly, products.find((p) => p.id === productResult.productId)?.product_code, shownRow ? sentAtOf(shownRow) : undefined) : undefined
  const pickedTitle = !picked ? '' : picked.kind === 'inbox' ? inboxLabel(picked.part) : (pickedHeat?.label ?? '')

  const rails: RailItem<Side>[] = [
    { v: 'summary', icon: <DataBarVerticalRegular />, label: t('結果', 'Results'), tip: t('この配信の結果(右のペインを全体に戻す)', 'Results of this delivery (back to the whole)'), count: 0 },
    { v: 'links', gap: true, icon: <LinkRegular />, label: t('リンク', 'Links'), tip: t('リンクごとのクリック(押すと、その部品の数字)', 'Clicks by link (click a row for its numbers)'), count: 0 },
    { v: 'products', icon: <BoxRegular />, label: t('商品', 'Products'), tip: t('商品の売れ方(販売チャネルごとの順位)', 'How products sold (rank by sales channel)'), count: 0 },
    ...(threadOn || tasksOn
      ? [{ v: 'talk' as const, gap: true, icon: <CommentRegular />, label: t('やり取り', 'Chat'), tip: t('やり取り(結果の段。結果を見ての相談・次の配信への申し送り。書き込み・タスク)', 'Conversation (results stage: discussing results and notes for the next delivery; comments and tasks)'), count: (threadOn ? talkCounts.talk : 0) + (tasksOn ? talkCounts.tasks : 0), feature: threadOn ? 'collab.thread' : 'collab.tasks' }]
      : []),
    ...(compareOn ? [{ v: 'compare' as const, icon: <ArrowSwapRegular />, label: t('比べる', 'Compare'), tip: t('前の配信と比べる', 'Compare with past deliveries'), count: 0, feature: 'results.compare' }] : []),
  ]
  const openSide = side
  const panel = openSide ?? lastSide
  const layout = useStageLayout({ device: push ? 'mobile' : device, side: openSide === 'talk' ? 'comm' : openSide ? 'hand' : null })
  const sideTitle = { summary: t('結果', 'Results'), links: t('リンクごとのクリック', 'Clicks by link'), products: t('商品の売れ方', 'How products sold'), compare: t('前の配信と比べる', 'Compare with past deliveries'), talk: t('やり取り(結果の段)', 'Conversation (results)') }[panel]

  const linksPanel = (
    <div className={s.panel}>
      <span className={s.note}>
        {t('クリックは延べ回数。割合は、メッセージの中のクリックの合計に対して(通知のタップは、送った数に対して)', 'Clicks are total clicks. Shares are of all clicks in the message (notification taps: of recipients).')}
      </span>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>{t('リンク', 'Link')}</th>
            <th className={mergeClasses(s.th, s.num)}>{t('クリック', 'Clicks')}</th>
            <th className={mergeClasses(s.th, s.num)}>{t('割合', 'Share')}</th>
            <th className={s.th} style={{ width: '24%' }} />
          </tr>
        </thead>
        <tbody>
          {heat.map((r) => (
            <tr key={r.key} className={mergeClasses(picked?.kind === 'link' && picked.key === r.key && s.rowOn)} onClick={() => setPicked({ kind: 'link', key: r.key })}>
              <td className={mergeClasses(s.td, !r.placed && s.missing)} title={r.placed ? undefined : t('プレビューに位置がありません', 'Not shown in the preview')}>
                {r.label}
              </td>
              <td className={mergeClasses(s.td, s.num)}>{n(r.clicks)}</td>
              <td className={mergeClasses(s.td, s.num)}>{`${(r.share * 100).toFixed(1)}%`}</td>
              <td className={s.td}>
                <div className={s.bar} style={{ width: `${Math.min(100, r.share * (r.key === 'push' ? 400 : 200))}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // 何も選ばないときのペイン: この配信の結果
  const summaryPane = !row ? (
    <div className={s.empty}>
      <span className={s.h3}>{t('まだ結果がありません', 'No results yet')}</span>
      <span className={s.note}>
        {t('結果の面の「この画面 ▾」→「結果を取り込む」で、CSV を取り込むと、ここに出ます(配信のしくみとつながったら、自動で入ります)', 'Import a CSV from "This view ▾" → "Import results" on the results view to see them here (they will arrive automatically once connected to the delivery system).')}
      </span>
    </div>
  ) : (
    <>
      <section className={s.section}>
        <span className={s.h3}>{cur === 'all' ? t('主な数字', 'Key numbers') : t(`主な数字(案 ${cur})`, `Key numbers (variant ${cur})`)}</span>
        {shownRow ? <ResultKpis row={shownRow} money={fmt} lift={impact?.lift} /> : <span className={s.note}>{t('この案の数字はありません', 'No numbers for this variant')}</span>}
      </section>
      {/* AB の結果(勝ち案と、差が偶然の範囲か)。全体を見ているときだけ [card.abtest] */}
      {abOn && cur === 'all' && row.parts.length > 0 && <AbResult row={row} heroes={heroes} money={fmt} onAdopt={adopt} />}
      {/* AI の読み(どう読めるか・次に試すこと)。「メモに入れる」で次に生かすメモの末尾に足す [results.ai] */}
      <ResultsAiPanel row={shownRow ?? row} ab={cur === 'all' && verdict && verdict.stats.length > 1 ? verdict : null} products={products} onAdopt={(text) => void adopt(text)} />
      <section className={s.section}>
        <span className={s.h3}>{t('次に生かすメモ', 'Notes for next time')}</span>
        <span className={s.note}>{t('うまくいったこと・次に試すこと。打てばそのまま入り、自動で保存します(学びとして、次の配信の AI の下書きにも渡せます)', 'What worked and what to try next. Saved automatically as you type (can be passed to AI drafts as a learning).')}</span>
        <AutoTextarea heightKey="SimpleResults.notes" rows={4} value={noteText} onChange={(_, d) => setNotes(d.value)} placeholder={t('うまくいったこと・次に試すこと', 'What worked, and what to try next')} />
      </section>
      {/* 採用した AI の提案(案は保存しないので、配信カードに残した内容と理由・切り口) */}
      <section className={s.section}>
        <span className={s.h3}>{t('採用した AI の提案', 'Adopted AI suggestions')}</span>
        <AdoptedAi card={shownCard} />
      </section>
      {/* この配信に渡した学び(AI の下書きに渡した学び。結果を次に生かす = v3) [results.learnings] */}
      {learningsOn && impact && (
        <section className={s.section}>
          <span className={s.h3}>
            {t(`この配信に渡した学び(${impact.learnings.length} 件)`, `Learnings passed to this delivery (${impact.learnings.length})`)} <FeatureBadge id="results.learnings" />
          </span>
          {impact.learnings.length === 0 ? (
            <span className={s.note}>{impact.recorded ? t('AI の案を頼んだとき、学びは渡していません', 'No learnings were passed when asking AI') : t('AI の依頼の記録がありません', 'No AI request records')}</span>
          ) : (
            impact.learnings.map((l) => (
              <LabeledValue key={l.id} label={t(`出どころ: ${l.sourceName}`, `From: ${l.sourceName}`)} layout="stacked">
                {l.notes.split(/\r?\n/)[0]}
              </LabeledValue>
            ))
          )}
        </section>
      )}
    </>
  )

  // 部品を選んだときのペイン: その部品の数字
  const partPane = picked && (
    <>
      <PaneCrumbs trail={[{ key: 'all', label: t('この配信の結果', 'Results of this delivery'), onClick: deselect }, { key: 'part', label: pickedTitle }]} onDeselect={deselect} />
      {!shownRow ? (
        <span className={s.note}>{t('まだ結果がありません', 'No results yet')}</span>
      ) : picked.kind === 'inbox' ? (
        // 件名・プリヘッダー・通知: 開いた率(AB のときは案ごと)
        <section className={s.section}>
          <div className={s.nums}>
            <LabeledValue label={push ? t('タップ率', 'Tap rate') : t('開封率', 'Open rate')} layout="stacked" strong>
              {pct(push ? shownRow.clickRate : shownRow.openRate)}
            </LabeledValue>
            <LabeledValue label={push ? t('タップ', 'Taps') : t('開封', 'Opens')} layout="stacked">
              {n(shownRow.result.opens)}
            </LabeledValue>
            <LabeledValue label={t('送った数', 'Sent')} layout="stacked">
              {n(shownRow.result.recipients)}
            </LabeledValue>
          </div>
          {cur === 'all' && keys.length > 1 && (
            <div className={s.nums}>
              {keys.map((k) => {
                const r = variantRow(k)
                return (
                  <LabeledValue key={k} label={t(`案 ${k}`, `Variant ${k}`)} layout="stacked">
                    {pct(push ? r?.clickRate : r?.openRate)}
                  </LabeledValue>
                )
              })}
            </div>
          )}
          <span className={s.note}>{t('開封は、件名・プリヘッダー・差出人で決まります(本文のリンクのクリックとは別の数字)', 'Opens depend on the subject, preheader and sender (separate from clicks in the body).')}</span>
        </section>
      ) : pickedHeat ? (
        <section className={s.section}>
          <div className={s.nums}>
            <LabeledValue label={pickedHeat.key === 'push' ? t('タップ', 'Taps') : t('クリック', 'Clicks')} layout="stacked" strong>
              {n(pickedHeat.clicks)}
            </LabeledValue>
            <LabeledValue label={pickedHeat.key === 'push' ? t('送った数に対して', 'Of recipients') : t('全体の中の割合', 'Share of all clicks')} layout="stacked">
              {`${(pickedHeat.share * 100).toFixed(1)}%`}
            </LabeledValue>
            <LabeledValue label={t('クリック率(送った数に対して)', 'Click rate (of recipients)')} layout="stacked">
              {shownRow.result.recipients ? `${((pickedHeat.clicks / shownRow.result.recipients) * 100).toFixed(2)}%` : '—'}
            </LabeledValue>
            {pickedHeat.key !== 'push' && rank > 0 && (
              <LabeledValue label={t('押された順', 'Rank')} layout="stacked">
                {t(`${rank} 番目(${heat.filter((h) => h.key !== 'push').length} のうち)`, `#${rank} of ${heat.filter((h) => h.key !== 'push').length}`)}
              </LabeledValue>
            )}
          </div>
          {productResult && (
            <div className={s.nums}>
              <LabeledValue label={t('注文の点数', 'Units')} layout="stacked">
                {n(productResult.units)}
              </LabeledValue>
              <LabeledValue label={t('売上', 'Revenue')} layout="stacked">
                {fmt(productResult.revenue)}
              </LabeledValue>
              {productWeek?.change !== undefined && (
                <LabeledValue label={t('その週の販売(前の週と比べて)', 'Week sales (vs the week before)')} layout="stacked">
                  {`${productWeek.change >= 0 ? '+' : ''}${Math.round(productWeek.change * 100)}%`}
                </LabeledValue>
              )}
              {productWeek?.stockWeeks !== undefined && (
                <LabeledValue label={t('在庫', 'Stock')} layout="stacked">
                  {t(`${productWeek.stockWeeks.toFixed(1)} 週分`, `${productWeek.stockWeeks.toFixed(1)} wks`)}
                </LabeledValue>
              )}
            </div>
          )}
          {!pickedHeat.placed && <span className={s.note}>{t('プレビューの上に位置がありません(テンプレートにない部品か、フッターなど)', 'Not placed in the preview (not in the template, or a footer link)')}</span>}
        </section>
      ) : (
        <span className={s.note}>{t('この部品の数字はありません', 'No numbers for this part')}</span>
      )}
    </>
  )

  const resultHint = row ? t('結果あり', 'Results in') : t('結果なし', 'No results')
  return (
    <Dialog open surfaceMotion={instant ? null : undefined} onOpenChange={(_, d) => !d.open && void close()}>
      {/* 配信カード・制作の画面と同じ窓(大きさの鍵も同じ)。段階のタブで、同じ窓のまま入れ替える */}
      <ResizableSurface backdropMotion={instant ? null : undefined} sizeKey="cardDetail" prefKey={PREF.cardSize} min={{ w: 900, h: 560 }} className={mergeClasses(cardStyles.surface, s.surface)} aria-label={card.name ?? ''} data-print-report>
        <PreviewHints value={false}>
          <StageFrame
            band={
              campaign && (
                <CampaignBand
                  campaign={campaign}
                  card={card}
                  allCards={allCards}
                  onSwitch={(id) => onSwitchCard?.(id)}
                  slots={{ variants: variantTabs }}
                  // 帯の札に小さな数字(状態の代わり)と、1 段目にキャンペーンの合計。名前を押すと、右のペインがキャンペーンの合計
                  cardMeta={(c) => {
                    const r = history.find((x) => x.card.id === c.id)
                    return r ? `${pct(r.clickRate)} · ${money(c)(r.revenue)}` : t('結果なし', 'No results')
                  }}
                  campaignMeta={siblings.length > 0 ? t(`合計 ${pct(ratio(total.clicks, total.recipients))} · ${fmt(total.revenue)}`, `Total ${pct(ratio(total.clicks, total.recipients))} · ${fmt(total.revenue)}`) : undefined}
                  onCampaign={{ on: campaignView, select: () => (setCampaignView(!campaignView), deselect()) }}
                  actions={<Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={() => void close()} aria-label={t('閉じる', 'Close')} />}
                />
              )
            }
            channel={card.channel}
            name={campaign ? cardDisplayName(card, [campaign]) : card.name}
            when={when_}
            tabs={stageTabs}
            tabsExtra={!campaign ? variantTabs : undefined}
            status={
              <span className={s.chip}>
                <span className={s.dot} style={{ backgroundColor: row ? tokens.colorPaletteGreenBackground3 : tokens.colorNeutralStroke1 }} aria-hidden />
                {resultHint}
              </span>
            }
            save={row ? { saving, dirty, savedAt } : undefined}
            saveProblem={saveError ? { error: saveError } : undefined}
            tools={<CopyLinkButton iconOnly />}
            menu={
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {pdfOn && row && (
                      <MenuItem icon={<DocumentPdfRegular />} onClick={() => printReport(`${card.name ?? 'results'}_${(sent ?? '').slice(0, 10)}_results`)}>
                        {t('PDF で書き出す', 'Export PDF')} <FeatureBadge id="results.pdf" />
                      </MenuItem>
                    )}
                    <DevRequestMenuItem />
                  </MenuList>
                </MenuPopover>
              </Menu>
            }
            onClose={campaign ? undefined : () => void close()}
          >
            <StagePanes
              layout={layout}
              rail={<SideRail items={rails} selected={openSide} onPick={showSide} ariaLabel={t('結果のメニュー', 'Results menus')} />}
              side={{
                open: !!openSide,
                title: sideTitle,
                onCollapse: () => setSide(null),
                children: (
                  <>
                    {panel === 'links' && linksPanel}
                    {panel === 'products' && (
                      <StagePane>
                        {shownRow ? <ProductRankings row={shownRow} productIds={vs.productIds} products={products} /> : <span className={s.note}>{t('まだ結果がありません', 'No results yet')}</span>}
                      </StagePane>
                    )}
                    {panel === 'talk' && (
                      <StagePane>
                        <StageTalkPanel cardId={card.id} stage="results" cardName={card.name ?? ''} productIds={vs.productIds.filter(Boolean)} products={vs.products} people={people} owner={card.owner ?? ''} onOpenCount={noteCounts.setTalk} onTasksChanged={noteCounts.bump} />
                      </StagePane>
                    )}
                    {panel === 'compare' && (
                      <StagePane>
                        {row ? <ResultCompare row={row} history={history} cardProducts={cardProducts} products={products} heroes={heroes} money={fmt} onAdopt={adopt} /> : <span className={s.note}>{t('まだ結果がありません', 'No results yet')}</span>}
                      </StagePane>
                    )}
                  </>
                ),
              }}
              preview={
                <PreviewFrame
                  boxRef={boxRef}
                  zoom={zoom}
                  keysInfo={t(
                    'プレビュー: 色の付いた所を押すと、その部品の数字を右に出します。Ctrl + ホイールで拡大・縮小、スペースを押しながらつかんで移動。',
                    'Preview: click a highlighted part to see its numbers on the right. Ctrl + wheel zooms; hold Space and drag to pan.',
                  )}
                  device={push ? undefined : { value: device, set: setDevice }}
                  toolbar={
                    <ToggleButton size="small" appearance={overlay ? 'primary' : 'subtle'} checked={overlay} onClick={() => setOverlay(!overlay)}>
                      {t('ヒートマップ', 'Heat map')}
                    </ToggleButton>
                  }
                  above={
                    <InboxLines
                      channel={card.channel}
                      country={card.country}
                      subject={vs.card.subject ?? ''}
                      preheader={vs.card.preheader ?? ''}
                      pushTitle={vs.card.push_title ?? ''}
                      pushBody={vs.card.push_body ?? ''}
                      subjectFallback={card.name ?? ''}
                      selected={picked?.kind === 'inbox' ? picked.part : null}
                      onSelect={(p) => setPicked({ kind: 'inbox', part: p })}
                      tips={{
                        subject: t('押すと、開封率を右に出します', 'Click to see the open rate'),
                        preheader: t('押すと、開封率を右に出します', 'Click to see the open rate'),
                        pushTitle: t('押すと、タップ率を右に出します', 'Click to see the tap rate'),
                        pushBody: t('押すと、タップ率を右に出します', 'Click to see the tap rate'),
                      }}
                    />
                  }
                  boxLabel={t('プレビュー(色の付いた所を押すと、その部品の数字を右に出します)', 'Preview (click a highlighted part to see its numbers)')}
                >
                  <div ref={innerRef} style={{ zoom: zoom.mode === 'fit' ? undefined : zoom.mode }}>
                    {results === null ? (
                      <Spinner size="small" />
                    ) : shownRow ? (
                      <HeatPreview
                        row={{ ...shownRow, card: shownCard }}
                        productIds={vs.productIds}
                        products={vs.products.length ? vs.products : products}
                        heroes={vs.hero ? [vs.hero, ...heroes] : heroes}
                        width={0}
                        fit={false}
                        device={push ? undefined : device}
                        overlay={overlay}
                        selected={picked?.kind === 'link' ? picked.key : null}
                        onPick={(key) => (setPicked({ kind: 'link', key }), setCampaignView(false))}
                        onRows={setHeat}
                      />
                    ) : (
                      // 結果がまだない(または、この案の数字がない)ときは、送る中身だけを見せる
                      <HeatPreview row={{ card: shownCard, result: { id: '', delivery_card_id: card.id }, parts: [], revenue: 0 }} productIds={vs.productIds} products={vs.products.length ? vs.products : products} heroes={vs.hero ? [vs.hero, ...heroes] : heroes} width={0} fit={false} device={push ? undefined : device} overlay={false} />
                    )}
                  </div>
                </PreviewFrame>
              }
              pane={
                <StagePane>
                  <div className={s.paneBody}>
                    {campaignView && !picked ? (
                      // キャンペーンの合計(保存せず、子の配信の結果から計算する)。子の配信の行を押すと、その配信の結果へ
                      <>
                        <PaneCrumbs trail={[{ key: 'campaign', label: t('キャンペーンの合計', 'Campaign totals') }]} onDeselect={() => setCampaignView(false)} />
                        {siblings.length === 0 ? (
                          <span className={s.note}>{t('まだ結果がありません', 'No results yet')}</span>
                        ) : (
                          <>
                            <div className={s.nums}>
                              <LabeledValue label={t('送った数', 'Sent')} layout="stacked">{n(total.recipients)}</LabeledValue>
                              <LabeledValue label={t('開封率(メール)', 'Open rate (email)')} layout="stacked">{pct(ratio(total.opens, total.emailRecipients))}</LabeledValue>
                              <LabeledValue label={t('クリック率', 'Click rate')} layout="stacked" strong>{pct(ratio(total.clicks, total.recipients))}</LabeledValue>
                              <LabeledValue label={t('注文', 'Orders')} layout="stacked">{n(total.orders)}</LabeledValue>
                              <LabeledValue label={t('売上', 'Revenue')} layout="stacked" strong>{fmt(total.revenue)}</LabeledValue>
                            </div>
                            <CampaignResultsTable compact rows={siblings} campaigns={new Map()} money={(v, c) => (c ? money(c)(v) : fmt(v))} onOpen={(id) => (id === card.id ? setCampaignView(false) : onSwitchCard?.(id))} />
                          </>
                        )}
                      </>
                    ) : picked ? (
                      partPane
                    ) : (
                      <>
                        <PaneCrumbs trail={[{ key: 'all', label: t('この配信の結果', 'Results of this delivery') }]} />
                        <PaneHint show={!!row}>{t('プレビューの色の付いた所(リンク・ボタン・商品)や、上の件名を押すと、その部品の数字を出します', 'Click a highlighted part (link, button, product) or the subject above to see its numbers')}</PaneHint>
                        {summaryPane}
                      </>
                    )}
                  </div>
                </StagePane>
              }
            />
          </StageFrame>
        </PreviewHints>
      </ResizableSurface>
    </Dialog>
  )
}
