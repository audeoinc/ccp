// 制作の面のシンプルな画面(X86。2026-10-28 利用者が案 A に決めた。要件: 共有メモ req-production-simple.md)。
// 配信カードのシンプルと同じ形で、同じ面の枠(simple/StageFrame。2026-11-02 X90 の塊 D)に載せる: 左のバー、企画の見本のプレビュー(部品を押せる)、右に部品のペイン。
// 何も選んでいないときは「配信の全体」(写すものを行ごとにコピー)。
// MVP(2026-10-30 の再定義。req-production-simple.md の 2b 章): 開く・読む・コピーに加えて、AI の手直し(全体のペインの「見た目を AI に頼む」・
// 部品のペインの「AI に頼む」)・制作した HTML(見本との切り替え・コピー・保存・版に戻す・貼り付けて置き換える)・要素を直す(企画から変更の印・戻す)・
// 工程 ②〜④・ピン・仕上がりを見る。保存の流れは計画と同じ: 文言は打てば入り自動で保存、↶ で戻す。AI の案と入れ替えは試す → 確定。
// AI は詳しい制作のページの ProductionChat / productionRevise と、配信カードの部品の AI(PartAiChat)を使い回す。やり取りの欄・タスクは v1。
// 中身は、渡した写し(制作が直していれば、その写し)。渡す前は、いまの配信カードから作った下書き。写しの作り・コピーの値は、
// 詳しい制作のページ(ProductionPage)と同じもの(productionSnapshot.ts)を使い、ここでは並べ方だけを変える
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, InfoLabel, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, Spinner, Tab, TabList, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, ArrowDownloadRegular, ArrowResetRegular, ArrowUndoRegular, ClipboardPasteRegular, CommentRegular, HistoryRegular, CopyRegular, DismissRegular, DocumentTextRegular, EditRegular, EyeRegular, ImageMultipleRegular, MoreHorizontalRegular, OpenRegular, TaskListLtrRegular, TimelineRegular, CodeRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { ProductionRequest } from '../models/productionRequests'
import type { VariantKey } from '../abTest'
import { ProductionRequestsService } from '../data/productionRequests'
import { ProductionService } from '../data/production'
import { ProductionChat } from '../ProductionChat'
import { applyEdit, syncHtml, type ElementEdit } from '../productionRevise'
import { HtmlPreviewFrame } from '../HtmlPreviewFrame'
import { HtmlPins } from '../HtmlPins'
import { PreviewPins } from '../PreviewPins'
import { PinFloat } from '../PinFloat'
import { usePreviewPins } from '../usePreviewPins'
import { focusedPin, pinView, subscribePins } from '../pinStore'
import { DevRequestMenuItem } from '../DevRequestMenu'
import { AutoTextarea } from '../AutoTextarea'
import { HtmlEditor } from '../HtmlEditor'
import { useTrial } from '../trial'
import { TrialBar } from '../TrialBar'
import { weekKeyOf } from '../weekLock'
import { ProductionPartEdit } from './ProductionPartEdit'
import type { PartTurn } from '../simple/partAi'
import { CardPreview } from '../CardPreview'
import { PreviewHints } from '../Preview'
import { useCardDetailStyles } from '../cardDetailStyles'
import { CreativeAssets } from '../CreativeAssets'
import { CommentsPanel } from '../CommentsPanel'
import { TasksPanel } from '../TasksPanel'
import { FinishedFloat } from '../FinishedFloat'
import { CardNotesService } from '../data/cardNotes'
import { CardAssetsService } from '../data/cardAssets'
import { isThreadRoot, stageOf } from '../notesStage'
import { myName, myUserId, onMeChange } from '../history'
import { SideRail, type RailItem } from '../simple/SideRail'
import { StepAction } from './StepAction'
import { useProductionFlow } from './useProductionFlow'
import { StepsPane } from './StepsPane'
import { LabeledValue } from '../LabeledValue'
import { MarkdownLite } from '../MarkdownLite'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { ResizableSurface } from '../ResizableSurface'
import { CopyButton } from '../ProductionInfoPane'
import { idsToItems, itemsToIds, removeKey, slotIdsOf } from '../slots'
import { neighborItem, type MoveDir } from '../simple/gridMove'
import { partFromElement } from '../simple/parts'
import { previewMenuItems } from '../previewMenu'
import { heroImage } from '../images'
import type { ContextItem } from '../ContextMenu'
import { PREF } from '../prefKeys'
import { typo } from '../typo'
import { day, locale, tr, useT, when } from '../i18n'
import { productionColor, productionLabel, productionView } from '../useProductionRequests'
import { PreviewFrame, StageFrame, StagePane, StagePanes } from '../simple/StageFrame'
import { STAGE_ZOOM_KEY, useStageLayout } from '../simple/stageLayout'
import { PaneCrumbs, PaneHint } from '../simple/PaneCrumbs'
import { InboxLines, type InboxPart } from '../simple/InboxLines'
import { PreviewMarks, type Mark } from '../simple/PreviewMarks'
import { LinkMaterialRows, PartImageRows, ProductMaterialRows } from './MaterialRows'
import { ProductionChanges } from './ProductionChanges'
import { snapshotChanges, type ChangeRow } from './changeRows'
import { AbHandoffSection } from './AbHandoffSection'
import { cardMarket } from '../market'
import { DeliveryMetaBand } from '../simple/DeliveryMetaBand'
import { CampaignBand } from '../CampaignBand'
import { CopyLinkButton } from '../CopyLinkButton'
import { useCampaignOf } from '../useCampaignOf'
import { cardDisplayName } from '../campaigns'
import { getTemplate, sectionsOf, templateKeyOfCard } from '../templates'
import { partElement, partKey, partOfAnchor, type PartRef } from '../simple/parts'
import { usePreviewZoom } from '../simple/usePreviewZoom'
import { useFeature } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'
import {
  buildSnapshot,
  downloadText,
  getText,
  htmlLinks,
  linkRows,
  parseHtmlHistory,
  parseSnapshot,
  parseVariantHtml,
  previewHtml,
  productRows,
  productionVariants,
  rowsText,
  setProducts,
  snapshotOf,
  templateOf,
  textRows,
  trackingRows,
  type Snapshot,
  type TextField,
} from '../productionSnapshot'

const useStyles = makeStyles({
  // 大きさ・置き方は配信カードの窓(cardDetailStyles の surface)と同じ。中は縦に並べる
  surface: { display: 'flex', flexDirection: 'column' },
  // 制作の状態の札(計画の承認の札 ApprovalChip と同じ形・大きさ。色は制作の状態の色)。長い説明は横の ⓘ に(2026-10-30 利用者)
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '24px',
    boxSizing: 'border-box',
    padding: '0 10px 0 8px',
    border: '1px solid var(--chip-line)',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'color-mix(in srgb, var(--chip-line) 14%, var(--colorNeutralBackground1))',
    color: tokens.colorNeutralForeground1,
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  // 帯の下のお知らせ(企画が変わりました・工程の結果・HTML の書き換えの注意)
  bar: { display: 'grid', rowGap: '4px', padding: '6px 16px 0' },
  abBar: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, flexShrink: 0 },
  chipLabel: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  grow: { flexGrow: 1 },
  // 右のペイン: 上がスクロールする中身、下(何も選んでいないとき)が「見た目を AI に頼む」
  rightCol: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  // 左のバーの「HTML」: エディタを欄の高さいっぱいに
  htmlPane: { display: 'flex', flexDirection: 'column', rowGap: '6px', height: '100%', minHeight: 0 },
  // 制作した HTML を描く枠(ピンの層の基準)。プレビューの枠の高さいっぱいに(iframe は中で伸びる)
  madeBox: { position: 'relative', height: '100%', minHeight: '320px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
  // 並べて比べる(P28): 左に企画の見本、右に制作した HTML
  compare: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '12px', alignItems: 'start', height: '100%' },
  // 右のペイン: 上がスクロールする中身(StagePane)、下が「見た目を AI に頼む」
  paneScroll: { flexGrow: 1, minHeight: 0, display: 'grid' },
  paneBody: { display: 'grid', rowGap: '14px', alignContent: 'start' },
  pasteBox: { width: '100%', minHeight: 'calc(40vh / var(--ui-zoom, 1))', fontFamily: 'Consolas, Menlo, monospace', fontSize: '12px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  heading: { ...typo.heading, flexGrow: 1, minWidth: 0 },
  section: { display: 'grid', rowGap: '6px' },
  row: { display: 'flex', alignItems: 'flex-start', columnGap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  rowValue: { display: 'grid', rowGap: '2px', flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeBase300 },
  rowLabel: { ...typo.label },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hero: { maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  thumb: { width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0, borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground1 },
  instructions: { padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, fontSize: tokens.fontSizeBase300 },
  meta: { display: 'flex', columnGap: '20px', rowGap: '4px', flexWrap: 'wrap' },
  actions: { display: 'flex', columnGap: '8px', flexWrap: 'wrap' },
  // HTML を作るためだけの、見えないプレビュー(写しの中身を、そのままの大きさで描く)
  offscreen: { position: 'fixed', left: '-10000px', top: 0, width: '700px', pointerEvents: 'none' },
})

interface Props {
  card: DeliveryCard
  /** いまの掲載商品(メールの並び順) */
  productIds: string[]
  /** AB テストの B・C 案の商品(X55) */
  variantIds?: Partial<Record<VariantKey, string[]>>
  products: Product[]
  /** この配信で選んだ商品の画像(商品 ID → 画像の URL。X64) */
  productImages?: Map<string, string>
  heroes: HeroImage[]
  people: string[]
  onClose: () => void
  /** 詳しい制作のページに切り替える(消すまでは並べて残す。決定 6) */
  onFullView?: () => void
  /** 題の行の面のタブ(PLAN | PRODUCTION | RESULTS。StageNav の tabs) */
  stageTabs?: ReactNode
  /** 段を進めたあとに、外の一覧(制作の面の箱・段のタブの状態)を読み直す */
  onChanged?: () => void
  /** 配信カードから同じ窓のまま切り替えて開いた(窓の出てくる動きを付けない。CardDetail の instant と同じ) */
  instant?: boolean
  /** すべての配信カード(キャンペーンの帯のきょうだいを、ここから選ぶ) */
  allCards?: DeliveryCard[]
  /** キャンペーンの帯のタブで、きょうだいの配信の制作の画面に切り替える */
  onSwitchCard?: (id: string) => void
}

// 依頼として生きている状態(この状態の版の写しを見せる。ほかは、いまの配信カードからの下書き)
const LIVE = new Set(['requested', 'in_progress', 'done', 'checked', 'sent'])

/** 部品の名前(ペインの見出し) */
function partTitle(p: PartRef, t: ReturnType<typeof useT>, rows: { field: TextField; label: string }[]): string {
  const textLabel = (match: (f: TextField) => boolean) => rows.find((r) => match(r.field))?.label
  switch (p.kind) {
    case 'subject':
      return t('件名', 'Subject')
    case 'preheader':
      return t('プリヘッダー', 'Preheader')
    case 'pushTitle':
      return t('通知のタイトル', 'Notification title')
    case 'pushBody':
      return t('通知の本文', 'Notification body')
    case 'headline':
      return t('ヘッドライン', 'Headline')
    case 'copy':
      return t('コピー', 'Copy')
    case 'hero':
      return t('メイン画像', 'Main image')
    case 'sectionTitle':
      return textLabel((f) => f.key === 'section_titles' && f.index === p.index) ?? t('セクションの見出し', 'Section heading')
    case 'sectionCopy':
      return textLabel((f) => f.key === 'section_copies' && f.index === p.index) ?? t('セクションのコピー', 'Section copy')
    case 'section':
      return t(`セクション ${p.index + 1}`, `Section ${p.index + 1}`)
    case 'product':
      return t('商品', 'Product')
    case 'slot':
      return t('空いた枠', 'Empty slot')
    case 'button':
      return t('ボタン', 'Button')
    case 'image':
      return t('画像', 'Image')
    case 'text':
      return textLabel((f) => f.key === 'part_text' && f.id === p.id) ?? t('テキスト', 'Text')
    default:
      return t('部品', 'Part')
  }
}

/** 選んだ部品の文(テキストの行の、どの欄か) */
function textFieldsOf(p: PartRef): (f: TextField) => boolean {
  switch (p.kind) {
    case 'subject':
      return (f) => f.key === 'subject'
    case 'preheader':
      return (f) => f.key === 'preheader'
    case 'pushTitle':
      return (f) => f.key === 'push_title'
    case 'pushBody':
      return (f) => f.key === 'push_body'
    case 'headline':
      return (f) => f.key === 'headline'
    case 'copy':
      return (f) => f.key === 'copy'
    case 'sectionTitle':
      return (f) => f.key === 'section_titles' && f.index === p.index
    case 'sectionCopy':
      return (f) => f.key === 'section_copies' && f.index === p.index
    case 'section':
      return (f) => (f.key === 'section_titles' || f.key === 'section_copies') && f.index === p.index
    case 'text':
    case 'button':
      return (f) => f.key === 'part_text' && f.id === p.id
    default:
      return () => false
  }
}

// 打ち始めの判定に使う時刻(描画の中では呼ばない。保存の処理の中だけ)
const nowMs = () => Date.now()

export function SimpleProductionPage({ card, productIds, variantIds, products, productImages, heroes, people, onClose, onFullView, stageTabs, onChanged, instant, allCards, onSwitchCard }: Props) {
  const cardStyles = useCardDetailStyles()
  const s = useStyles()
  const t = useT()
  const [requests, setRequests] = useState<ProductionRequest[] | null>(null)
  const [device, setDevice] = useState<'mobile' | 'pc'>('pc')
  const [variant, setVariant] = useState<VariantKey>('A')
  const [part, setPart] = useState<PartRef | null>(null)
  // 選んだ部品に写っている画像の URL(プレビューに描いたものから、選んだときに読む。テンプレートの画像も同じに扱える)
  const [partImg, setPartImg] = useState('')
  const pick = (p: PartRef | null) => {
    const el = p && boxRef.current ? partElement(boxRef.current, p) : null
    const src = el instanceof HTMLImageElement ? el.getAttribute('src') : (el?.querySelector('img')?.getAttribute('src') ?? null)
    setPartImg(src ? new URL(src, location.href).href : '')
    // 左のバーの「HTML」で、押した部品の場所へ送るための目印(画像は src、文は頭の数文字。HTML の中の書き方に合わせて & < > を書き換える)
    const text = (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    setPartMarks(src ? [src, new URL(src, location.href).href] : text ? [text] : [])
    setPart(p)
  }
  const [partMarks, setPartMarks] = useState<string[]>([])
  // 選ぶのをやめる(プレビューを読まないので、描く間に渡してよい)
  const deselect = () => {
    setPartImg('')
    setPartMarks([])
    setPart(null)
  }
  // 部品ごとの AI のやり取り(部品を選び直しても残す)
  const [turnsByPart, setTurnsByPart] = useState<Record<string, PartTurn[]>>({})
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const offscreenRef = useRef<HTMLDivElement>(null)
  // 倍率(− ・倍率・＋・全体)。鍵は面の枠で 1 つ(計画と制作を切り替えても、同じ倍率のまま。Plan と Production の差の 31)
  const zoom = usePreviewZoom(boxRef, innerRef, STAGE_ZOOM_KEY, `${card.id}:${device}`)
  // 機能の公開・非公開(X87。FEATURE_FLAGS.md)。非公開の入口は出さない(開発者には出し、「非公開」の印)
  const stepsOn = useFeature('prod.steps')
  const resultOn = useFeature('prod.result')
  // ⑤ 送る(prod.export)が非公開なら、工程は ④ の OK で終わり(MVP の終点。2026-10-30 利用者)
  const exportOn = useFeature('prod.export')
  const sampleOn = useFeature('prod.samplehtml')
  const threadOn = useFeature('collab.thread')
  const tasksOn = useFeature('collab.tasks')
  const assetsOn = useFeature('collab.assets')
  // MVP に入れたもの(2026-10-30 利用者): 要素を直す [prod.page]・制作した HTML [prod.htmledit]・AI の手直し [prod.ai]・ピン [collab.pins]
  const editOn = useFeature('prod.page')
  const htmlEditOn = useFeature('prod.htmledit')
  // 左のバーの HTML の欄(見る・書く)。書けるのは prod.htmledit も公開のとき(2026-11-02 利用者)
  const htmlCodeOn = useFeature('prod.htmlcode')
  const aiOn = useFeature('prod.ai')
  const pinsOn = useFeature('collab.pins')
  const meId = useSyncExternalStore(onMeChange, myUserId)
  const meName = useSyncExternalStore(onMeChange, myName)
  // 左のバーで開いている欄(やり取り [collab.thread]・タスク [collab.tasks]・素材 [collab.assets]・工程 [prod.steps])
  // 開いたときは「渡されたもの」(2026-10-29 利用者: プレビューを見る → 申し送りを読む → 素材でイメージを持つ → HTML を確かめる、の順に進めるように)
  type Side = 'given' | 'talk' | 'tasks' | 'assets' | 'steps' | 'html' | 'changes'
  const [side, setSide] = useState<Side | null>('given')
  // しまう動きの間も、最後に開いた欄の中身を描いておく(計画と同じ)
  const [lastSide, setLastSide] = useState<Side>('given')
  const [moving, setMoving] = useState(false)
  const showSide = (v: Side, open = false) => {
    const next = !open && side === v ? null : v
    setSide(next)
    if (next) setLastSide(next)
    if (next !== side) {
      setMoving(true)
      window.setTimeout(() => setMoving(false), 260)
    }
  }
  const [finishedOpen, setFinishedOpen] = useState(false)
  // バーの数(未解決の制作のやり取り・未完了のタスク・素材)。欄の中で増減したら、開け閉めのたびに数え直す
  const [counts, setCounts] = useState({ talk: 0, tasks: 0, assets: 0 })
  useEffect(() => {
    let alive = true
    void Promise.all([CardNotesService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['created_on asc'] }), CardAssetsService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['created_on desc'] })])
      .then(([n, a]) => {
        if (!alive) return
        const notes = n.success ? (n.data ?? []) : []
        setCounts({ talk: notes.filter((x) => !x.resolved && isThreadRoot(x) && stageOf(x) === 'production').length, tasks: notes.filter((x) => !x.resolved && x.kind === 'task').length, assets: a.success ? (a.data ?? []).length : 0 })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [card.id, side])

  const load = useCallback(async () => {
    const r = await ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'` })
    setRequests(r.success ? [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)) : [])
  }, [card.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 写し: 渡したあとは固めたもの(制作が直していれば、その写し)、渡す前はいまの配信カードから作った下書き(詳しい制作のページと同じ決め方)
  const latest = requests?.[0]
  const live = latest && LIVE.has(latest.status ?? '') ? latest : undefined
  const shownProducts = useMemo(() => (productImages?.size ? products.map((p) => (productImages.has(p.id) ? { ...p, image_url: productImages.get(p.id) } : p)) : products), [products, productImages])
  const draft = useMemo(() => buildSnapshot(card, slotIdsOf(card.id, productIds), shownProducts, heroes, variantIds), [card, productIds, shownProducts, heroes, variantIds])
  const frozen = useMemo(() => parseSnapshot(live?.snapshot), [live?.snapshot])
  const edited = useMemo(() => parseSnapshot(live?.edited_snapshot), [live?.edited_snapshot])
  // 保存の流れは計画の配信カードにそろえる(2026-11-02 利用者「揃えてください」): 文言は打てばそのまま入り、1.5 秒で自動で保存、↶ で前の保存に戻す。
  // 試す → 確定は、AI の案と入れ替え(画像・商品・前の版・貼り付け)だけ。
  // 打っている中身(まだ保存していない)と、保存している間の中身(読み直すまで、前の中身に戻って見えないように)
  const [editingSnap, setEditingSnap] = useState<Snapshot | null>(null)
  const [savingSnap, setSavingSnap] = useState<Snapshot | null>(null)
  const savedSnap: Snapshot = savingSnap ?? edited ?? frozen ?? draft
  const snap: Snapshot = editingSnap ?? savedSnap
  // 企画から渡された写し(「企画から変更」の印と、戻す先)
  const original: Snapshot = frozen ?? draft
  const keys = productionVariants(snap)
  const cur: VariantKey = keys.includes(variant) ? variant : 'A'
  const vs = snapshotOf(snap, cur)
  // 試している写し(直し・AI の案を、プレビューにだけ当てはめる。確定するまで保存しない)。直せるのは A 案の要素だけ(B・C 案は配信カードで直す)
  const [trialSnap, setTrialSnap] = useState<Snapshot | null>(null)
  const pvs = trialSnap && cur === 'A' ? trialSnap : vs
  const view = productionView(card, latest)
  const instructions = live ? (live.instructions ?? '') : (card.instructions ?? '')
  const owner = live ? (live.production_owner ?? '') : (card.production_owner ?? '')
  const due = live ? (live.production_due ?? '') : (card.production_due ?? '')

  const texts = textRows(vs)
  const prows = productRows(vs, cur)
  const lrows = linkRows(vs, cur)
  const trows = trackingRows(vs, cur)
  const previewCard = { ...card, ...pvs.card } as DeliveryCard
  // 見本の HTML を作る見えないプレビューは、保存した中身で描く(試している中身を、コピー・保存の HTML に混ぜない)
  const savedCard = { ...card, ...vs.card } as DeliveryCard
  const needMe = !meId ? t('右上で、だれでログインするかを選んでください', 'Choose who is signed in at the top right') : null
  // 工程(prod.steps)。送る HTML は、制作が保存した HTML があればそれ、なければ企画の見本
  const flow = useProductionFlow({ card, live, actor: { id: meId, name: meName }, html: () => live?.html || sampleHtml(), variantHtml: live?.variant_html ?? undefined, onChanged: async () => {
    await load()
    onChanged?.()
  } })
  const myStep = stepsOn && flow.now && flow.now.key !== 'request' && (exportOn || flow.now.key !== 'send') && flow.isMine(flow.now) ? flow.now : undefined

  // ---- 直す・制作した HTML・AI(MVP の追加分。2026-10-30 利用者) ----
  // 直せるのは、渡したあと・送る前の版(詳しい制作のページと同じ)
  const canWork = !!live && live.status !== 'sent'
  const actor = { id: meId, name: meName }
  const weekStart = card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined
  const [busy, setBusy] = useState(false)
  const [workError, setWorkError] = useState<string | null>(null)
  const [workNotice, setWorkNotice] = useState<string | null>(null)
  const call = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setWorkError(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
      return true
    } catch (e) {
      setWorkError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  // 制作した HTML: 保存したことのあるものだけ(渡したときに一緒に固めた見本の HTML は、保存した日時がないので、制作した HTML とみなさない)
  const savedVariants = useMemo(() => parseVariantHtml(live?.variant_html), [live?.variant_html])
  const [savingHtml, setSavingHtml] = useState<{ variant: VariantKey; html: string } | null>(null)
  // 左のバーの「HTML」で打っている HTML(まだ保存していない)
  const [editingHtml, setEditingHtml] = useState<{ variant: VariantKey; html: string } | null>(null)
  const madeOf = (k: VariantKey): string => (editingHtml?.variant === k ? editingHtml.html : savedMadeOf(k))
  const savedMadeOf = (k: VariantKey): string => {
    if (savingHtml?.variant === k) return savingHtml.html
    if (k === 'A') return live?.html_saved_at ? (live.html ?? '') : ''
    const v = savedVariants[k]
    return v?.saved_at ? v.html : ''
  }
  const made = madeOf(cur)
  const madeBy = cur === 'A' ? { by: live?.html_saved_by_name, at: live?.html_saved_at } : { by: savedVariants[cur]?.saved_by_name, at: savedVariants[cur]?.saved_at }
  const history = useMemo(() => parseHtmlHistory(live?.html_history).filter((h) => h.variant === cur), [live?.html_history, cur])
  // 試している HTML(AI の見た目の案・前の版・貼り付けたもの)
  const [trialHtml, setTrialHtml] = useState<string | null>(null)
  // プレビューで見るもの: 企画の見本(部品を押せる)/ 制作した HTML(ピンだけ。決定 5)
  // 並べて比べる(compare): 左に企画の見本、右に制作した HTML(仕上がりの確認で見比べる。P28)
  const [surface, setSurface] = useState<'plan' | 'made' | 'compare'>('plan')
  // 要素の直しを試している間は、制作した HTML の同じ場所も書き換えて見せる(確定すると、同じように保存する)
  const madeShown = trialHtml ?? (trialSnap && made && cur === 'A' ? syncHtml(made, vs, trialSnap).html : made)
  const onMade = htmlEditOn && surface === 'made' && !!madeShown
  const onCompare = htmlEditOn && surface === 'compare' && !!madeShown
  const trial = useTrial()
  // 案・版を切り替えたら、試しているものはやめる
  useEffect(() => {
    trial.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, live?.id])

  // ↶ 元に戻す: 開いている間の、保存の前の中身(計画の配信カードと同じ。写しの直しと、制作した HTML の保存の両方)
  type UndoStep = { kind: 'snap'; snap: Snapshot } | { kind: 'html'; variant: VariantKey; html: string }
  const [undoStack, setUndoStack] = useState<UndoStep[]>([])
  const pushUndo = (u: UndoStep) => setUndoStack((st) => [...st.slice(-29), u])
  // HTML を打っている間の自動保存は、打ち始めの 1 回だけ版の履歴に残す(打つたびに版が増えて、前の版を押し出さないように)
  const typedAt = useRef(0)

  /** 直した写しを保存する(制作した HTML があれば、その同じ場所も書き換えて保存する。詳しい制作のページの applyChatEdit と同じ考え) */
  const commitSnap = async (next: Snapshot, opts: { undo?: boolean } = {}) => {
    if (!live) return
    if (needMe) return setWorkError(needMe)
    const strip = (x: Snapshot) => JSON.stringify({ ...x, takenAt: '' })
    const before = savedSnap
    // 保存している間に打ったものは残す(次の自動保存で入る)
    setEditingSnap((e) => (e === next ? null : e))
    if (strip(before) === strip(next)) return
    if (!opts.undo) pushUndo({ kind: 'snap', snap: before })
    setSavingSnap(next)
    setWorkNotice(null)
    let ok = await call(() => ProductionService.saveEdits(live.id, { actor, edited_snapshot: strip(next) !== strip(original) ? JSON.stringify(next) : '', week_start: weekStart }))
    const madeA = savedMadeOf('A')
    if (ok && madeA) {
      const r = syncHtml(madeA, before, next)
      if (r.replaced) {
        setSavingHtml({ variant: 'A', html: r.html })
        ok = await call(() => ProductionService.saveHtml(live.id, { actor, html: r.html, variant: 'A', history: false }))
      }
      if (r.missing) setWorkNotice(tr(`制作した HTML の中で、場所が見つからなかったものが ${r.missing} つあります(HTML は手で直すか、貼り付けて置き換えてください)`, `${r.missing} item(s) could not be found in the production HTML (edit it by hand, or paste to replace).`))
    }
    await load()
    setSavingSnap(null)
    setSavingHtml(null)
  }
  /** 制作した HTML を保存する(空 = 企画の見本に戻す)。前の HTML は、サーバーが版の履歴に残す(打っている間の自動保存は、打ち始めだけ) */
  const commitHtml = async (html: string, opts: { undo?: boolean; typing?: boolean; variant?: VariantKey } = {}) => {
    if (!live) return
    if (needMe) return setWorkError(needMe)
    const k = opts.variant ?? cur
    const before = savedMadeOf(k)
    setEditingHtml((e) => (e?.variant === k && e.html === html ? null : e))
    if (before === html) return
    if (!opts.undo) pushUndo({ kind: 'html', variant: k, html: before })
    const history = !(opts.typing && nowMs() - typedAt.current < 120_000)
    if (opts.typing) typedAt.current = nowMs()
    setSavingHtml({ variant: k, html })
    setWorkNotice(null)
    if ((await call(() => ProductionService.saveHtml(live.id, { actor, html, variant: k, history }))) && !opts.typing) setSurface(html ? 'made' : 'plan')
    await load()
    setSavingHtml(null)
  }
  /** 文言・リンク先を打ったとき: そのまま入れ、1.5 秒たったら自動で保存する(計画と同じ) */
  const editSnap = (next: Snapshot) => {
    trial.cancel()
    setEditingSnap(next)
  }
  /** 左のバーの「HTML」で打ったとき: そのまま制作した HTML に入れ、1.5 秒たったら自動で保存する */
  const editHtml = (html: string) => {
    if (trialHtml !== null) return
    setEditingHtml({ variant: cur, html })
    setSurface('made')
  }
  useEffect(() => {
    if (!editingSnap) return
    const id = setTimeout(() => void commitSnap(editingSnap), 1500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSnap])
  useEffect(() => {
    if (!editingHtml) return
    const id = setTimeout(() => void commitHtml(editingHtml.html, { typing: true, variant: editingHtml.variant }), 1500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHtml])
  const pendingSave = !!editingSnap || !!editingHtml
  /** ↶: いちばん新しい保存の前に戻す(戻したことも保存する) */
  const undo = () => {
    const last = undoStack[undoStack.length - 1]
    if (!last || busy || pendingSave) return
    setUndoStack((st) => st.slice(0, -1))
    trial.cancel()
    if (last.kind === 'snap') void commitSnap(last.snap, { undo: true })
    else void commitHtml(last.html, { undo: true, variant: last.variant })
  }
  const undoKey = useRef(undo)
  useEffect(() => {
    undoKey.current = undo
  })
  // Ctrl + Z で元に戻す(入力欄・HTML の欄の中では、ふつうの文字の取り消し。計画と同じ)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || ev.isComposing || ev.key.toLowerCase() !== 'z') return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      ev.preventDefault()
      undoKey.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  /** 閉じる前に、打ちかけのものを保存する(保存しないまま閉じて、消えないように) */
  const close = async () => {
    if (editingSnap) await commitSnap(editingSnap)
    if (editingHtml) await commitHtml(editingHtml.html, { typing: true, variant: editingHtml.variant })
    onClose()
  }
  /** 写しの直しを試す(プレビューにだけ当てはめ、帯の「確定」で保存) */
  const trySnap = (next: Snapshot, label: { key: string; from: string; to: string }) =>
    trial.tryIt({
      ...label,
      preview: () => setTrialSnap(next),
      unpreview: () => setTrialSnap(null),
      apply: () => {
        setTrialSnap(null)
        void commitSnap(next)
      },
    })
  /** HTML を試す(制作した HTML の見え方で、プレビューに当てはめる) */
  const tryHtml = (html: string, key: string, to: string) =>
    trial.tryIt({
      key,
      from: made ? t('いまの制作した HTML', 'Current production HTML') : t('企画の見本', 'Plan sample'),
      to,
      preview: () => {
        setTrialHtml(html)
        setSurface('made')
      },
      unpreview: () => setTrialHtml(null),
      apply: () => {
        setTrialHtml(null)
        void commitHtml(html)
      },
    })
  /** AI の要素の直し(全体のペインのチャットの返事のボタン)を試す。AI が画像・商品を選べなかったものは、いつものフロートで選ぶ */
  const tryEdit = (e: ElementEdit): boolean => {
    if ((e.kind === 'hero' && !e.heroId) || (e.kind === 'product' && !e.productId)) return false
    const hero = e.kind === 'hero' ? (heroes.find((h) => h.id === e.heroId) ?? null) : undefined
    const next = applyEdit(vs, e, { text: e.kind === 'text' || e.kind === 'link' ? e.value : undefined, hero, productId: e.kind === 'product' ? e.productId : undefined }, shownProducts)
    const from =
      e.kind === 'text' ? getText(vs, e.field) : e.kind === 'link' ? (linkRows(vs).find((r) => r.slotKey === e.slotKey)?.base ?? '') : e.kind === 'hero' ? (vs.hero?.name ?? '') : (productRows(vs)[e.index]?.product.name ?? '')
    const to = e.kind === 'text' || e.kind === 'link' ? e.value : e.kind === 'hero' ? (hero?.name ?? '') : (shownProducts.find((p) => p.id === e.productId)?.name ?? '')
    trySnap(next, { key: `chat:${e.id}:${to}`, from, to })
    return true
  }
  const [pasting, setPasting] = useState<string | null>(null)
  // 見本の HTML(AI に渡す・制作した HTML がないときのもと)。見えないプレビューを描いたあとに作る(詳しい制作のページと同じ)
  const [generated, setGenerated] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setGenerated(offscreenRef.current ? previewHtml(offscreenRef.current, card.name ?? '', htmlLinks(vs, cur)) : ''), 600)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, cur, requests, card.name])
  // 左のバーの「HTML」に出すソース(いまプレビューに出している方)
  const sourceHtml = onMade ? madeShown : generated
  // HTML の欄で書けるのは [prod.htmledit] が公開・渡したあと・試していない間(書くと、制作した HTML になる)
  const htmlCanEdit = htmlCodeOn && htmlEditOn && canWork && trialHtml === null && !!meId

  // ピン(コメント)。企画の見本の上は部品の目印に、制作した HTML の上はページの中の割合に置く(詳しい制作のページと同じ見た目の名前 html-plan / html-made)
  const { placing, setPlacing, endPlacing, target: pinTarget, setTarget: setPinTarget, openThreads, close: closePin } = usePreviewPins()
  const [madeFrame, setMadeFrame] = useState<HTMLIFrameElement | null>(null)
  const pinIds = pvs.productIds
  const pinItems = useMemo(() => pinIds.flatMap((pid, i) => (pid ? [{ key: `${pid}-${i}`, productId: pid, reason: '', source: 'manual' as const }] : [])), [pinIds])
  // やり取りの札・ピンのリンクで開いたとき、その書き込みを打った見せ方(見本 / 制作した HTML)と案に切り替える(詳しい制作のページと同じ)
  const focus = useSyncExternalStore(subscribePins, focusedPin)
  useEffect(() => {
    if (!focus) return
    let alive = true
    void CardNotesService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['created_on asc'] }).then((r) => {
      const n = r.success ? (r.data ?? []).find((x) => x.id === focus.noteId) : undefined
      if (!alive || !n?.anchor || stageOf(n) !== 'production') return
      const [ch, , v] = (n.anchor_view ?? '').split('|')
      if (ch === 'html-plan' || ch === 'html-made') setSurface(ch === 'html-made' ? 'made' : 'plan')
      if (v === 'A' || v === 'B' || v === 'C') setVariant(v)
    })
    return () => {
      alive = false
    }
  }, [focus, card.id])

  // 企画の見本の HTML(詳しい制作のページと同じ作り方: 見えないプレビューから、書式を直接書いた形にする)。押したときに作る
  const sampleHtml = () => (offscreenRef.current ? previewHtml(offscreenRef.current, card.name ?? '', htmlLinks(vs, cur)) : '')
  const fileName = `${(card.name ?? 'delivery').replace(/[\\/:*?"<>|]/g, '_')}${keys.length > 1 ? `-${cur}` : ''}.html`
  const [copied, setCopied] = useState(false)
  const copyHtml = () =>
    void navigator.clipboard?.writeText(sampleHtml()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })

  // 題の日時(配信カードの題と同じ書き方。面を切り替えても、題の幅が変わらないように)
  const when_ = card.scheduled_at ? new Date(card.scheduled_at).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : t('配信日時(未設定)', 'No send date')
  const campaign = useCampaignOf(card.campaign_id)

  // 写す値の 1 行(ラベルと値の組は LabeledValue。空の値は「—」。Plan と Production の差の 42・43)
  const copyRow = (label: string, value: string, key: string, extra?: ReactNode) => (
    <div key={key} className={s.row}>
      <span className={s.rowValue}>
        <LabeledValue label={label} layout="stacked" empty="none" copy={value}>
          {value}
        </LabeledValue>
        {extra}
      </span>
    </div>
  )

  // 商品の並べ替え・外す(P14)。配信カードと同じ動き: 選んだ商品を Alt + 矢印で見たままの向きに動かす・Delete で外す(すぐ入れて自動で保存。↶ で戻す)。
  // 直せるのは渡したあとの A 案だけ。試している間は動かさない(試している中身と混ざらないように)
  const canArrange = editOn && canWork && cur === 'A' && !trial.trial
  const atOfKey = (itemKey: string) => snap.productIds.findIndex((pid, i) => `${pid}-${i}` === itemKey)
  const moveProduct = (itemKey: string, to: number) => {
    const from = atOfKey(itemKey)
    if (!canArrange || from < 0 || to < 0 || to >= snap.productIds.length || from === to) return
    const ids = [...snap.productIds]
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    void commitSnap(setProducts(snap, ids, shownProducts))
    // 動かした商品を選んだままにする(枠の鍵は位置で変わる)
    setPart({ kind: 'product', itemKey: `${ids[to]}-${to}` })
  }
  const moveProductDir = (itemKey: string, dir: MoveDir) => {
    const other = boxRef.current ? neighborItem(boxRef.current, itemKey, dir) : null
    if (other) moveProduct(itemKey, atOfKey(other))
  }
  // 外すと、そのセクションの中だけ詰める(ほかのセクションの商品は動かさない。配信カードと同じ)
  const removeProduct = (itemKey: string) => {
    const at = atOfKey(itemKey)
    if (!canArrange || at < 0) return
    const list = idsToItems(snap.productIds)
    void commitSnap(setProducts(snap, itemsToIds(removeKey(list, sectionsOf(templateOf(snap)), list[at].key)), shownProducts))
    deselect()
  }
  // 右クリックの項目(ピンのあと)。配信カードと同じ並び・文言で、制作の面でできること(直す・AI・入れ替える・外す・動かす)だけ(Plan と Production の差の 36)
  const previewMenu = (under: Element): ContextItem[] => {
    const root = boxRef.current
    const p = root ? partFromElement(under, root) : null
    if (!p) return []
    const at = p.kind === 'product' ? atOfKey(p.itemKey) : -1
    const dirs = ['up', 'down', 'left', 'right'] as const
    const move = p.kind === 'product' && root ? Object.fromEntries(dirs.map((d) => [d, neighborItem(root, p.itemKey, d) ? () => moveProductDir(p.itemKey, d) : undefined])) as Record<MoveDir, (() => void) | undefined> : undefined
    const editable = editOn && canWork && cur === 'A'
    return previewMenuItems({
      busy: busy || !!trial.trial,
      edit: () => pick(p),
      ai: aiOn && editable && p.kind !== 'slot' ? () => pick(p) : undefined,
      product:
        p.kind === 'product' && canArrange
          ? { swapLabel: t('入れ替える', 'Replace'), url: prows.find((r) => r.at === at)?.url, swap: () => pick(p), remove: () => removeProduct(p.itemKey), move }
          : undefined,
      hero: p.kind === 'hero' && editable ? { src: heroImage(vs.hero ?? undefined), replace: () => pick(p) } : undefined,
    })
  }
  /** 商品の並びの位置から、その商品の部品を選ぶ(材料の行・変更の一覧から) */
  const pickProductAt = (at: number) => {
    const pid = vs.productIds[at]
    if (pid) pick({ kind: 'product', itemKey: `${pid}-${at}` })
  }
  /** 企画から変えた所の行 → プレビューの部品(印と、一覧の行を押したときに選ぶ部品) */
  const partOfChange = (r: ChangeRow): PartRef | null => {
    if (r.kind === 'hero') return { kind: 'hero' }
    if (r.kind === 'product') return r.productIndex !== undefined && snap.productIds[r.productIndex] ? { kind: 'product', itemKey: `${snap.productIds[r.productIndex]}-${r.productIndex}` } : null
    if (r.kind === 'link') return r.slotKey === 'hero' ? { kind: 'hero' } : r.slotKey ? { kind: 'button', id: r.slotKey } : null
    const f = r.field
    if (!f) return null
    switch (f.key) {
      case 'subject':
        return { kind: 'subject' }
      case 'preheader':
        return { kind: 'preheader' }
      case 'push_title':
        return { kind: 'pushTitle' }
      case 'push_body':
        return { kind: 'pushBody' }
      case 'headline':
        return { kind: 'headline' }
      case 'copy':
        return { kind: 'copy' }
      case 'section_titles':
        return { kind: 'sectionTitle', index: f.index }
      case 'section_copies':
        return { kind: 'sectionCopy', index: f.index }
      case 'part_text':
        return { kind: 'text', id: f.id }
      default:
        return null
    }
  }
  /** 左のバーの「渡されたもの」(開いたときに開いている欄): 担当・締め切り・制作指示・参考の素材。制作の人が最初に読むもの */
  const handoffPane = (
    <div className={s.section}>
      <div className={s.meta}>
        {/* 版の番号(P7)。企画が直ると新しい版で渡し直すので、どの版で作っているかを分かるように */}
        {live && <LabeledValue label={t('版', 'Version')}>{String(live.version ?? '')}</LabeledValue>}
        <LabeledValue label={t('制作の担当', 'Production owner')}>{owner}</LabeledValue>
        <LabeledValue label={t('締め切り', 'Due')}>{due ? day(due) : ''}</LabeledValue>
        <LabeledValue label={t('渡した日時', 'Handed off')}>{live?.requested_at ? when(live.requested_at) : ''}</LabeledValue>
      </div>
      {!live && <span className={s.note}>{t('まだ制作に渡していません。中身は、いまの配信カードから作った下書きです', 'Not handed off yet. This is a draft built from the current delivery card.')}</span>}
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('制作指示', 'Production notes')}</span>
          {instructions && <CopyButton text={instructions} label={t('制作指示をコピー', 'Copy production notes')} />}
        </div>
        {instructions ? <div className={s.instructions}><MarkdownLite text={instructions} /></div> : <span className={s.note}>{t('制作指示はありません', 'No production notes')}</span>}
      </div>
      {/* AB テストの欄(P40。AB でない配信では何も出さない) */}
      <AbHandoffSection snapshot={snap} />
      {/* 参考の素材(企画が配信カードで置いたもの)。制作指示を読んだあと、素材でイメージを持てるように、開いたまま並べる */}
      {assetsOn && <CreativeAssets cardId={card.id} stage="production" people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} productIds={vs.productIds.filter(Boolean)} products={vs.products} title={t('参考の素材', 'Reference materials')} compactAdd />}
    </div>
  )

  /** 何も選んでいないときの右: まとめて写すもの(テキスト・商品・リンク先・計測の対応表・企画の見本の HTML)。部品を押すと、その部品の材料だけになる */
  const givenPane = (
    <>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('テキスト', 'Text')}</span>
          {texts.length > 0 && <CopyButton text={rowsText(texts)} label={t('すべてコピー', 'Copy all')} />}
        </div>
        {texts.length ? texts.map((r) => copyRow(r.label, r.value, r.id)) : <span className={s.note}>{t('テキストはありません', 'No text')}</span>}
      </div>
      {/* 商品(P10)・リンク先と計測の対応表(P11)は行ごとにコピー。行を押すと、その部品を選ぶ */}
      <ProductMaterialRows snapshot={vs} variant={cur} onSelect={(at) => pickProductAt(at)} />
      <LinkMaterialRows snapshot={vs} variant={cur} onSelect={(slotKey) => slotKey === 'hero' && pick({ kind: 'hero' })} />
      {/* 部品の画像(P21。ボタン・バナー・ロゴ。URL か img のタグをコピー) */}
      <PartImageRows market={cardMarket(vs.card.country ?? '')} />
      {sampleOn && (
        <div className={s.section}>
          <div className={s.head}>
            <span className={s.heading}>{t('企画の見本の HTML', 'Plan sample HTML')}</span>
            <FeatureBadge id="prod.samplehtml" />
          </div>
          <div className={s.actions}>
            <Button size="small" icon={<CopyRegular />} onClick={copyHtml}>
              {copied ? t('コピーしました', 'Copied') : t('HTML をコピー', 'Copy HTML')}
            </Button>
            <Button size="small" icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, sampleHtml())}>
              {t('.html で保存', 'Save as .html')}
            </Button>
          </div>
          <span className={s.note}>{t('プレビューと同じ見た目の HTML です(リンクには計測用のパラメーターが付いています)', 'HTML that looks like the preview (links include tracking parameters).')}</span>
        </div>
      )}
      {htmlEditOn && (
        <div className={s.section}>
          <div className={s.head}>
            <span className={s.heading}>{t('制作した HTML', 'Production HTML')}</span>
            <FeatureBadge id="prod.htmledit" />
            {/* 版: 前に保存した HTML に戻す(試す → 確定)・企画の見本に戻す */}
            {canWork && (history.length > 0 || made) && (
              <Menu positioning="below-end">
                <MenuTrigger disableButtonEnhancement>
                  <Button size="small" appearance="subtle" icon={<HistoryRegular />}>
                    {t(`版(${history.length})`, `Versions (${history.length})`)}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {history.map((h, i) => (
                      <MenuItem key={`${h.saved_at}-${i}`} onClick={() => tryHtml(h.html, `ver:${h.saved_at}:${i}`, t(`前の版(${when(h.saved_at ?? '')} ${h.saved_by_name ?? ''})`, `Earlier version (${when(h.saved_at ?? '')} ${h.saved_by_name ?? ''})`))}>
                        {t(`${when(h.saved_at ?? '')} ${h.saved_by_name ?? ''} の版に戻す`, `Back to ${when(h.saved_at ?? '')} by ${h.saved_by_name ?? ''}`)}
                      </MenuItem>
                    ))}
                    {history.length === 0 && <MenuItem disabled>{t('前の版はまだありません', 'No earlier versions yet')}</MenuItem>}
                    {made && (
                      <>
                        <MenuDivider />
                        <MenuItem
                          icon={<ArrowResetRegular />}
                          onClick={() =>
                            trial.tryIt({
                              key: 'reset-to-plan',
                              from: t('いまの制作した HTML', 'Current production HTML'),
                              to: t('企画の見本', 'Plan sample'),
                              preview: () => setSurface('plan'),
                              unpreview: () => setSurface('made'),
                              apply: () => void commitHtml(''),
                            })
                          }
                        >
                          {t('企画の見本に戻す(制作した HTML を外す)', 'Back to the plan sample (drop the production HTML)')}
                        </MenuItem>
                      </>
                    )}
                  </MenuList>
                </MenuPopover>
              </Menu>
            )}
          </div>
          {made ? (
            <span className={s.note}>{madeBy.by ? t(`保存: ${madeBy.by} ${when(madeBy.at ?? '')}`, `Saved by ${madeBy.by} ${when(madeBy.at ?? '')}`) : t('保存した HTML があります', 'Saved HTML exists')}</span>
          ) : (
            <span className={s.note}>{t('まだありません(AI で見た目を直す・貼り付けて置き換えると、ここに入ります。それまでは企画の見本を使います)', 'None yet (it is created when you revise the look with AI or paste HTML; until then the plan sample is used).')}</span>
          )}
          <div className={s.actions}>
            {made && <CopyButton text={made} label={t('HTML をコピー', 'Copy HTML')} />}
            {made && (
              <Button size="small" icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, made)}>
                {t('.html で保存', 'Save as .html')}
              </Button>
            )}
            <Tooltip content={canWork ? t('制作ツールなどで作った HTML を貼り付けて、制作した HTML と置き換えます(プレビューで試してから確定)', 'Paste HTML made elsewhere to replace the production HTML (try it in the preview, then apply)') : t('制作に渡したあとに貼り付けられます', 'You can paste after the handoff')} relationship="description">
              <Button size="small" icon={<ClipboardPasteRegular />} disabled={!canWork} onClick={() => setPasting('')}>
                {t('貼り付けて置き換える', 'Paste to replace')}
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </>
  )

  /** 部品を選んだとき: その部品の材料(どれも 1 押しでコピー) */
  const partPane = (p: PartRef) => {
    const all = textRows(vs, true)
    const title = partTitle(p, t, all)
    const match = textFieldsOf(p)
    const trs = all.filter((r) => match(r.field))
    const imgUrl = partImg
    const linkKey = p.kind === 'hero' ? 'hero' : p.kind === 'button' || p.kind === 'image' ? p.id : null
    const links = linkKey ? lrows.filter((r) => r.slotKey === linkKey) : []
    const prod = p.kind === 'product' ? prows.find((r) => `${r.product.id}-${r.at}` === p.itemKey) : undefined
    // 表の箱は、写真・名前などが別々のリンク(utm_content)になる。商品ページの URL と同じものは重ねて出さない
    const prodTracking = prod ? trows.filter((r) => r.productCode && r.productCode === prod.product.product_code && r.url !== prod.url) : p.kind === 'image' || p.kind === 'button' ? trows.filter((r) => r.content.startsWith(`${p.id}`)) : []
    return (
      <>
        <PaneCrumbs trail={[{ key: 'all', label: t('配信の全体', 'Whole delivery'), onClick: deselect }, { key: partKey(p), label: title }]} onDeselect={deselect} />
        {trs.map((r) => copyRow(r.label, getText(vs, r.field), r.id))}
        {imgUrl && (p.kind === 'hero' || p.kind === 'image') && (
          <div className={s.section}>
            <img className={s.hero} src={imgUrl} alt="" />
            <div className={s.actions}>
              <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => window.open(imgUrl, '_blank', 'noopener')}>
                {t('画像を開く(保存できます)', 'Open image (to save)')}
              </Button>
            </div>
            {copyRow(t('画像の URL', 'Image URL'), imgUrl, 'img')}
          </div>
        )}
        {prod && (
          <div className={s.section}>
            <div className={s.row}>
              <img className={s.thumb} src={prod.product.image_url ?? ''} alt="" />
              <span className={s.rowValue}>
                <span className={s.rowLabel}>{prod.section}</span>
                {prod.product.name}
              </span>
              <CopyButton text={[prod.product.name, prod.product.product_code, prod.price, prod.url].filter(Boolean).join('\t')} label={t('まとめてコピー', 'Copy all')} />
            </div>
            {copyRow(t('商品名', 'Product name'), prod.product.name ?? '', 'name')}
            {copyRow(t('商品コード', 'Product code'), prod.product.product_code ?? '', 'code')}
            {copyRow(t('価格', 'Price'), prod.price, 'price')}
            {copyRow(t('商品ページの URL(計測用のパラメーター付き)', 'Product page URL (with tracking)'), prod.url, 'url')}
          </div>
        )}
        {links.map((r, i) => copyRow(t(`リンク先: ${r.label}`, `Link: ${r.label}`), r.value, `link${i}`))}
        {prodTracking.map((r) => copyRow(`utm_content: ${r.content}`, r.url, `trk-${r.content}-${r.url}`, <span className={s.note}>{r.desc}</span>))}
        {p.kind === 'slot' && <span className={s.note}>{t('この枠には、商品が入っていません', 'This slot has no product.')}</span>}
        {/* 並べ替え・外す(P14)。プレビューで選んで Alt + 矢印・Delete でも */}
        {prod && canArrange && (
          <div className={s.actions}>
            <Tooltip content={t('前の枠と入れ替える(Alt + 矢印でも、見たままの向きに動かせます)', 'Swap with the previous slot (or Alt + arrow keys)')} relationship="label">
              <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={prod.at === 0} onClick={() => moveProduct(p.kind === 'product' ? p.itemKey : '', prod.at - 1)}>
                {t('前へ', 'Earlier')}
              </Button>
            </Tooltip>
            <Tooltip content={t('次の枠と入れ替える', 'Swap with the next slot')} relationship="label">
              <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={prod.at >= vs.productIds.length - 1} onClick={() => moveProduct(p.kind === 'product' ? p.itemKey : '', prod.at + 1)}>
                {t('次へ', 'Later')}
              </Button>
            </Tooltip>
            <Tooltip content={t('この商品を外す(セクションの中で詰めます。Delete でも)', 'Remove this product (the section closes up; or press Delete)')} relationship="label">
              <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => removeProduct(p.kind === 'product' ? p.itemKey : '')}>
                {t('外す', 'Remove')}
              </Button>
            </Tooltip>
          </div>
        )}
        {!trs.length && !imgUrl && !prod && !links.length && !prodTracking.length && p.kind !== 'slot' && <span className={s.note}>{t('この部品に、コピーする材料はありません(中身はテンプレートで決まっています)', 'Nothing to copy for this part (its content comes from the template).')}</span>}
        {/* 直す [prod.page](渡したあと・送る前の、A 案だけ。B・C 案の中身は配信カードで直す) */}
        {editOn && canWork && cur === 'A' && (
          <ProductionPartEdit
            part={p}
            current={vs}
            trying={trialSnap}
            original={original}
            rows={trs}
            productIndex={p.kind === 'slot' ? p.index : prod?.at}
            linkKey={linkKey}
            card={card}
            products={shownProducts}
            heroes={heroes}
            aiOn={aiOn}
            onTry={trySnap}
            onEdit={editSnap}
            onCommit={(next) => void commitSnap(next)}
            turns={turnsByPart[partKey(p)] ?? []}
            setTurns={(f) => setTurnsByPart((m) => ({ ...m, [partKey(p)]: f(m[partKey(p)] ?? []) }))}
          />
        )}
        {editOn && canWork && cur !== 'A' && <span className={s.note}>{t(`${cur} 案の中身は、計画の配信カードで直します`, `Edit variant ${cur} in the plan delivery card`)}</span>}
        {editOn && !live && <span className={s.note}>{t('制作に渡したあとに、ここで直したり AI に頼んだりできます', 'After the handoff you can edit here and ask AI')}</span>}
      </>
    )
  }

  // 案の切り替え(AB テスト)。計画と同じく、キャンペーンの帯の案の段(キャンペーンに入っていなければ、題の帯の 2 段目)に置く
  // 計画の案の段と同じく「AB テスト ⓘ」を前に置き、案のタブが計画と同じ位置に来るようにする(案を足す・⋯ は計画だけ)
  const variantTabs = (
    <div className={s.abBar}>
      <InfoLabel size="small" info={t('同じ配信を、見出しや画像を変えて複数作り、どれがよいかを比べます。タブを押すと、見本と材料がその案に切り替わります', 'Several versions of the same delivery are compared. Pick a tab to switch the sample and materials to that variant.')}>
        {t('AB テスト', 'A/B test')}
      </InfoLabel>
      <TabList size="small" selectedValue={cur} onTabSelect={(_, d) => (setVariant(d.value as VariantKey), pick(null))}>
        {keys.map((k) => (
          <Tab key={k} value={k}>
            {t(`案 ${k}`, `Variant ${k}`)}
          </Tab>
        ))}
      </TabList>
    </div>
  )
  // 状態の札の ⓘ に出す説明(以前は札の横に長い文で出していた。2026-10-29 利用者「青いボタンが分からなかった」への答えは、ここに残す)
  const stateHint =
    stepsOn && flow.current === 0
      ? t('制作に渡すと、右上に「受け取る」などの進めるボタンが出ます', 'Once handed off, buttons such as "Receive" appear at the top right')
      : stepsOn && !exportOn && flow.now?.key === 'send'
        ? t('仕上がりの確認まで済みました', 'The result has been checked')
        : stepsOn && flow.now && flow.current > 0 && !myStep && flow.current < 5
        ? t(`いまは ${flow.now.who || (flow.now.side === 'planner' ? '企画' : '制作')} の番です(左のバーの「工程」からも進められます)`, `It is ${flow.now.who || (flow.now.side === 'planner' ? 'the planner' : 'production')}'s turn (you can also proceed from Steps in the left bar)`)
        : t('制作の状態です。進め方は、左のバーの「工程」で見られます', 'Production status. See Steps in the left bar for how it proceeds')

  // 企画から変えた所(P17)。直せるのは A 案だけなので、A 案のときだけ数え、プレビューに印を出す(配信カードの「A と違う」の印と同じ形)
  const changes = editOn && cur === 'A' && live ? snapshotChanges(original, snap) : []
  const changeMarks: Mark[] = changes.flatMap((r) => {
    const p = partOfChange(r)
    return p ? [{ part: p, color: tokens.colorPaletteBerryBackground3, label: t(`企画から変更: ${r.label}`, `Changed from the plan: ${r.label}`) }] : []
  })
  // 企画が変わって、この配信の版が古くなった(P6)。渡し直すまでは、いまの配信カードからの下書きを見せる
  const staleLatest = latest?.status === 'stale' ? latest : undefined
  // 保存した日時(上の帯の「保存済み · 12:03」)。写しの直しと、制作した HTML の保存の、新しい方
  const savedAt = [live?.edited_at, live?.html_saved_at].filter((x): x is string => !!x).sort().pop() ?? null
  const inboxSelected: InboxPart | null = part && (part.kind === 'subject' || part.kind === 'preheader' || part.kind === 'pushTitle' || part.kind === 'pushBody') ? part.kind : null

  const sideTitle = (v: Side) =>
    ({
      given: t('渡されたもの', 'Handoff'),
      talk: t('やり取り(制作の段)', 'Conversation (production)'),
      tasks: t('タスク', 'Tasks'),
      assets: t('素材', 'Assets'),
      html: 'HTML',
      changes: t('企画から変えた所', 'Changes from the plan'),
      steps: t('工程', 'Steps'),
    })[v]
  // 並びの型は計画と同じ: その面の主(渡されたもの)→(線)やり取り・素材 → 直したもの(HTML・変更)→(線)その面の記録(工程)。Plan と Production の差の 14
  const allRails: (RailItem<Side> & { on: boolean })[] = [
    { v: 'given', on: true, icon: <DocumentTextRegular />, label: t('渡されたもの', 'Handoff'), tip: t('渡されたもの(制作指示・担当・締め切り・参考の素材)', 'Handed over (notes, owner, due date, reference materials)'), count: 0 },
    { v: 'talk', gap: true, on: threadOn, feature: 'collab.thread', icon: <CommentRegular />, label: t('やり取り', 'Chat'), tip: t('やり取り(制作の段。企画と制作で)', 'Conversation (production stage, between planner and production)'), count: counts.talk },
    { v: 'tasks', on: tasksOn, feature: 'collab.tasks', icon: <TaskListLtrRegular />, label: t('タスク', 'Tasks'), tip: t('タスク(担当・期日)', 'Tasks (assignee and due date)'), count: counts.tasks },
    { v: 'assets', on: assetsOn, feature: 'collab.assets', icon: <ImageMultipleRegular />, label: t('素材', 'Assets'), tip: t('素材(参考の画像・資料・URL)', 'Assets (reference images, files, URLs)'), count: counts.assets },
    { v: 'html', on: htmlCodeOn, feature: 'prod.htmlcode', icon: <CodeRegular />, label: 'HTML', tip: t('HTML(いまプレビューに出している方のソース)', 'HTML (source of what the preview shows)'), count: 0 },
    { v: 'changes', on: editOn && !!live, feature: 'prod.page', icon: <EditRegular />, label: t('変更', 'Changes'), tip: t('企画から変えた所(だれが直したか・戻す)', 'Changes from the plan (who edited, revert)'), count: changes.length },
    { v: 'steps', on: stepsOn, feature: 'prod.steps', gap: true, icon: <TimelineRegular />, label: t('工程', 'Steps'), tip: t('工程(渡す → 受け取る → 制作する → 確認 → 送る)', 'Steps (hand off → receive → produce → check → send)'), count: 0, dot: myStep ? 'red' : undefined },
  ]
  // 非公開の欄はバーに出さない。開いていた欄が非公開になったら、しまったのと同じに見せる
  const rails = allRails.filter((r) => r.on)
  const openSide = side && rails.some((r) => r.v === side) ? side : null
  const panel = openSide ?? lastSide
  // 列の幅と、狭いときの割り振り(面の枠。幅は計画と同じ鍵。Plan と Production の差の 39)。アプリの配信は、スマホの幅
  const layout = useStageLayout({ device: card.channel === 'email' ? device : 'mobile', side: openSide === 'talk' || openSide === 'tasks' ? 'comm' : openSide ? 'hand' : null })

  return (
    <Dialog open surfaceMotion={instant ? null : undefined} onOpenChange={(_, d) => !d.open && void close()}>
      {/* 配信カードと同じ窓(大きさの鍵も同じ)。段階のタブで計画 ↔ 制作を同じ窓のまま入れ替えるため(2026-10-29 利用者) */}
      <ResizableSurface backdropMotion={instant ? null : undefined} sizeKey="cardDetail" prefKey={PREF.cardSize} min={{ w: 900, h: 560 }} className={mergeClasses(cardStyles.surface, s.surface)} aria-label={card.name ?? ''}>
        {/* 空欄の案内(「(ヘッドライン未入力)」など)は企画で作るときのものなので、制作の画面では出さない(2026-10-28 利用者) */}
        <PreviewHints value={false}>
          {/* 面の枠(X90 の塊 A)。上の帯・お知らせ・左のバー・プレビュー・右のペインの形は、計画の配信カードと同じ部品(2026-11-02 利用者「Plan と Production の UI に差を付けない」) */}
          <StageFrame
            // キャンペーンの帯(計画と同じ。きょうだいのタブで、その配信の制作の画面に切り替える)。まとめて承認は計画だけ。× は帯の右の端(計画と同じ場所)
            band={
              campaign && (
                <CampaignBand
                  campaign={campaign}
                  card={card}
                  allCards={allCards ?? []}
                  onSwitch={(id) => onSwitchCard?.(id)}
                  slots={{ variants: keys.length > 1 ? variantTabs : undefined }}
                  actions={<Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={() => void close()} aria-label={t('閉じる', 'Close')} />}
                />
              )
            }
            channel={card.channel}
            name={campaign ? cardDisplayName(card, [campaign]) : card.name}
            when={when_}
            // 状態の札は、計画の承認の札と同じ場所・同じ形(色は制作の状態の色。説明は横の ⓘ)
            status={
              <InfoLabel size="small" info={stateHint} className={s.chipLabel}>
                <span className={s.chip} style={{ '--chip-line': productionColor(view) } as CSSProperties}>
                  <span className={s.dot} style={{ backgroundColor: productionColor(view) }} aria-hidden />
                  {productionLabel(view)}
                </span>
              </InfoLabel>
            }
            // 保存の様子(計画と同じ「保存中… / 未保存 / 保存済み · 12:03」。直せるときだけ)
            save={canWork && (editOn || htmlEditOn) ? { saving: busy, dirty: pendingSave, savedAt } : undefined}
            saveProblem={workError ? { error: workError } : undefined}
            // ↶ 元に戻す(計画と同じ。開いている間の、保存の前の中身へ)
            undo={canWork && (editOn || htmlEditOn) ? { disabled: !undoStack.length || busy || pendingSave, onUndo: undo } : undefined}
            primary={
              // 自分の番のときだけの青いボタン [prod.steps](2026-10-28 利用者。だれの番でも押せるのは左のバーの「工程」)
              myStep && (
                <>
                  <StepAction flow={flow} step={myStep} onViewResult={myStep.key === 'check' || !resultOn ? undefined : () => setFinishedOpen(true)} needMe={needMe} />
                  <FeatureBadge id="prod.steps" />
                </>
              )
            }
            tools={
              <>
                {/* 仕上がりを見る [prod.result]: 制作が終わったあと(④ 以降) */}
                {resultOn && live && flow.current >= 3 && (
                  <Button size="small" appearance="subtle" icon={<EyeRegular />} onClick={() => setFinishedOpen(true)}>
                    {t('仕上がりを見る', 'View result')}
                    <FeatureBadge id="prod.result" />
                  </Button>
                )}
                {/* この画面を開くリンク(計画と同じ場所。右の端の ⋯ の左) */}
                <CopyLinkButton iconOnly />
              </>
            }
            menu={
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {sampleOn && (
                      <>
                        <MenuItem icon={<CopyRegular />} onClick={copyHtml}>
                          {t('企画の見本の HTML をコピー', 'Copy the plan sample HTML')} <FeatureBadge id="prod.samplehtml" />
                        </MenuItem>
                        <MenuItem icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, sampleHtml())}>
                          {t('企画の見本を .html で保存', 'Save the plan sample as .html')} <FeatureBadge id="prod.samplehtml" />
                        </MenuItem>
                      </>
                    )}
                    {stepsOn && flow.canUndo && (
                      <>
                        <MenuDivider />
                        {/* いちばん新しく終えた段を戻す [prod.steps] */}
                        <MenuItem icon={<ArrowUndoRegular />} disabled={flow.busy || !!needMe} onClick={() => void flow.act.undo()}>
                          {flow.current - 1 === 0 ? t('渡したのを取り下げる', 'Withdraw the handoff') : t(`「${flow.steps[flow.current - 1]?.name}」をやり直す`, `Redo "${flow.steps[flow.current - 1]?.name}"`)}
                        </MenuItem>
                      </>
                    )}
                    {htmlEditOn && made && (
                      <>
                        <MenuDivider />
                        <MenuItem icon={<CopyRegular />} onClick={() => void navigator.clipboard?.writeText(made)}>
                          {t('制作した HTML をコピー', 'Copy the production HTML')} <FeatureBadge id="prod.htmledit" />
                        </MenuItem>
                        <MenuItem icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, made)}>
                          {t('制作した HTML を .html で保存', 'Save the production HTML as .html')} <FeatureBadge id="prod.htmledit" />
                        </MenuItem>
                      </>
                    )}
                    {onFullView && (
                      <MenuItem icon={<DocumentTextRegular />} onClick={onFullView}>
                        {t('詳しい制作のページで開く', 'Open the full production page')}
                      </MenuItem>
                    )}
                    {/* 開発へのリクエストの一覧 [dev.requests](配信カード・結果と同じ「⋯」から) */}
                    <DevRequestMenuItem />
                  </MenuList>
                </MenuPopover>
              </Menu>
            }
            // 閉じる ×: キャンペーンの帯があれば、その右の端。なければ、この行の右の端(計画と同じ)
            onClose={campaign ? undefined : () => void close()}
            tabs={stageTabs}
            // キャンペーンに入っていない配信の AB の案は、計画と同じく帯の 2 段目に
            tabsExtra={!campaign && keys.length > 1 ? variantTabs : undefined}
            notices={
              (staleLatest || flow.error || flow.notice || workNotice) && (
                <div className={s.bar}>
                  {/* 企画が変わりました(P6。古い版の写しで作り続けないように) */}
                  {staleLatest && !live && (
                    <MessageBar intent="warning" layout="multiline">
                      <MessageBarBody>{t(`企画が変わりました(版 ${staleLatest.version} は古い版です)。いまは、新しい配信カードからの下書きを見せています。承認されたら、企画が新しい版で渡し直します。`, `The plan changed (v${staleLatest.version} is outdated). This shows a draft from the current delivery card. After approval, the planner hands off a new version.`)}</MessageBarBody>
                    </MessageBar>
                  )}
                  {(flow.error || flow.notice) && (
                    <MessageBar intent={flow.error ? 'error' : 'success'} layout="multiline">
                      <MessageBarBody>{flow.error ?? flow.notice}</MessageBarBody>
                    </MessageBar>
                  )}
                  {workNotice && (
                    <MessageBar intent="warning" layout="multiline">
                      <MessageBarBody>{workNotice}</MessageBarBody>
                    </MessageBar>
                  )}
                </div>
              )
            }
          >
            <StagePanes
              layout={layout}
              moving={moving}
              // 制作の依頼を読み終わるまで、上の帯より下を見せない(読む前は、いまの配信カードからの下書きで描くので、読み終わって渡した写しに替わると中身が入れ替わってチラついた。2026-10-30 利用者)
              hidden={requests === null}
              rail={<SideRail items={rails} selected={openSide} onPick={(v) => showSide(v)} ariaLabel={t('制作のメニュー', 'Production menus')} />}
              side={{
                open: !!openSide,
                title: sideTitle(panel),
                onCollapse: () => openSide && showSide(openSide),
                children: (
                  <>
                    {panel === 'given' && <StagePane>{handoffPane}</StagePane>}
                    {panel === 'talk' && (
                      <StagePane>
                        <CommentsPanel cardId={card.id} stage="production" productIds={vs.productIds.filter(Boolean)} products={vs.products} people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} onOpenCount={(n) => setCounts((c) => ({ ...c, talk: n }))} />
                      </StagePane>
                    )}
                    {panel === 'tasks' && (
                      <StagePane>
                        <TasksPanel cardId={card.id} productionOwner={owner} productionDue={due} onOpenSource={() => showSide('talk', true)} onChanged={() => undefined} />
                      </StagePane>
                    )}
                    {panel === 'assets' && (
                      <StagePane>
                        <CreativeAssets cardId={card.id} stage="production" people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} productIds={vs.productIds.filter(Boolean)} products={vs.products} onCount={(n) => setCounts((c) => ({ ...c, assets: n }))} />
                      </StagePane>
                    )}
                    {/* HTML のソース(2026-11-02 利用者)。いまプレビューに出している方(企画の見本 / 制作した HTML)を、色分けのエディタで。
                        書けるのは [prod.htmlcode] と [prod.htmledit] が公開のとき。部品を押すと、その場所へ送る */}
                    {panel === 'html' && (
                      <StagePane>
                        <div className={s.htmlPane}>
                          <div className={s.head}>
                            <span className={s.note} style={{ flexGrow: 1 }}>
                              {onMade ? (trialHtml !== null ? t('試している HTML', 'HTML being tried') : t('制作した HTML', 'Production HTML')) : t('企画の見本の HTML', 'Plan sample HTML')}
                              {htmlCanEdit ? t('(書き換えると制作した HTML になり、自動で保存します)', ' (edits become the production HTML and save automatically)') : t('(読むだけ)', ' (read-only)')}
                            </span>
                            {sourceHtml && <CopyButton text={sourceHtml} label={t('コピー', 'Copy')} />}
                          </div>
                          {sourceHtml ? <HtmlEditor value={sourceHtml} onChange={editHtml} readOnly={!htmlCanEdit} reveal={onMade ? undefined : partMarks.find((m) => sourceHtml.includes(m))} ariaLabel="HTML" /> : <Spinner size="tiny" label={t('プレビューから HTML を作っています…', 'Building HTML from the preview…')} />}
                        </div>
                      </StagePane>
                    )}
                    {/* 企画から変えた所(P17・P19・P20)。行を押すとその部品を選び、↶ で企画の値に戻す(戻したことも ↶ で戻せる) */}
                    {panel === 'changes' && (
                      <StagePane>
                        <ProductionChanges
                          original={original}
                          current={snap}
                          editedBy={live?.edited_by_name}
                          editedAt={live?.edited_at}
                          editable={canWork && cur === 'A'}
                          onChange={(next) => void commitSnap(next)}
                          onSelect={(r) => {
                            const p = partOfChange(r)
                            if (p) pick(p)
                          }}
                        />
                      </StagePane>
                    )}
                    {panel === 'steps' && (
                      <StagePane>
                        <StepsPane flow={flow} onViewResult={resultOn ? () => setFinishedOpen(true) : undefined} needMe={needMe} />
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
                    'プレビュー: ↑ ↓ で前・次の部品、Esc で選ぶのをやめる、Tab でプレビューの外へ。Ctrl + Z で元に戻す(入力欄の外で)。Ctrl + ホイールで拡大・縮小、スペースを押しながらつかんで移動。',
                    'Preview: ↑ ↓ for the previous or next part, Esc to stop, Tab to leave the preview. Ctrl + Z undoes (outside text fields). Ctrl + wheel zooms; hold Space and drag to pan.',
                  )}
                  toolbar={
                    <>
                      {/* 見本 | 制作した HTML | 並べて比べる [prod.htmledit]。制作した HTML があるとき(試しているときも)だけ切り替えを出す */}
                      {htmlEditOn && madeShown ? (
                        <TabList size="small" selectedValue={onMade ? 'made' : onCompare ? 'compare' : 'plan'} onTabSelect={(_, d) => setSurface(d.value as 'plan' | 'made' | 'compare')}>
                          <Tab value="plan">{t('企画の見本', 'Plan sample')}</Tab>
                          <Tab value="made">{t('制作した HTML', 'Production HTML')}</Tab>
                          <Tab value="compare">{t('並べて比べる', 'Side by side')}</Tab>
                        </TabList>
                      ) : (
                        <span className={s.note}>{t('企画の見本', 'Plan sample')}</span>
                      )}
                      <span className={s.grow} />
                      {changes.length > 0 && <Badge appearance="tint" color="warning">{t('制作が直した写し', 'Edited in production')}</Badge>}
                    </>
                  }
                  above={
                    <>
                      {/* 試す → 確定(AI の案・入れ替え・前の版・貼り付けたもの。どの入口で試しても、ここで確定する) */}
                      {trial.trial && <TrialBar state={trial} />}
                      {/* 配信の情報(配信日時・国・テーマ・テンプレート)。計画のプレビューの上と同じ帯を、見るだけで(「変える」は出さない。2026-10-30 利用者) */}
                      <DeliveryMetaBand
                        scheduledAt={previewCard.scheduled_at}
                        country={previewCard.country}
                        theme={previewCard.theme}
                        template={previewCard.channel === 'email' ? getTemplate(templateKeyOfCard(previewCard)).label : undefined}
                        title={t('配信の情報(受信者には見えません。直すのは計画の配信カードで)', 'Delivery info (not shown to recipients; edit it in the plan delivery card)')}
                      />
                      {/* 受信箱・通知での見え方(計画と同じ行。2026-11-02 利用者: 制作のプレビューにも出す)。押すと、その文の材料と直す欄 */}
                      {!onMade && (
                        <InboxLines
                          channel={previewCard.channel}
                          country={previewCard.country}
                          subject={getText(pvs, { key: 'subject' })}
                          preheader={getText(pvs, { key: 'preheader' })}
                          pushTitle={getText(pvs, { key: 'push_title' })}
                          pushBody={getText(pvs, { key: 'push_body' })}
                          subjectFallback={previewCard.name ?? ''}
                          selected={inboxSelected}
                          onSelect={(k) => pick({ kind: k })}
                          tips={{ subject: t('件名(押すと、コピー・直す)', 'Subject (click to copy or edit)'), preheader: t('プリヘッダー(押すと、コピー・直す)', 'Preheader (click to copy or edit)'), pushTitle: t('通知のタイトル(押すと、コピー・直す)', 'Notification title (click to copy or edit)'), pushBody: t('通知の本文(押すと、コピー・直す)', 'Notification body (click to copy or edit)') }}
                        />
                      )}
                    </>
                  }
                  device={card.channel === 'email' && !onMade ? { value: device, set: setDevice } : undefined}
                  // ピン(コメント)[collab.pins]。試している HTML の上には打たない
                  pins={pinsOn && trialHtml === null ? { placing, setPlacing } : undefined}
                  boxLabel={t('プレビュー(押した部品の材料を右に出します。↑ ↓ で前・次の部品、Esc で選ぶのをやめる)', 'Preview (click a part to see its materials; ↑ ↓ for the previous or next part, Esc to stop)')}
                >
                  <div className={onCompare ? s.compare : undefined}>
                    {/* 企画の見本(部品を押せる)。制作した HTML を見ている間も描いたままにする(切り替えても選んだ部品が消えないように) */}
                    <div ref={innerRef} style={{ zoom: zoom.mode === 'fit' ? undefined : zoom.mode, display: onMade ? 'none' : undefined }}>
                      <CardPreview card={previewCard} productIds={pvs.productIds} products={pvs.products} heroes={pvs.hero ? [pvs.hero] : []} device={device} />
                    </div>
                    {/* 制作した HTML: そのまま描く(部品は押せない。ピンだけ。決定 5)。並べて比べるときは右に */}
                    {(onMade || onCompare) && (
                      <div className={s.madeBox}>
                        <HtmlPreviewFrame html={madeShown} title={t('制作した HTML のプレビュー', 'Production HTML preview')} heading={trialHtml !== null ? t('試している HTML', 'HTML being tried') : t('制作した HTML', 'Production HTML')} onFrame={setMadeFrame} />
                        {onMade && pinsOn && trialHtml === null && <HtmlPins frame={madeFrame} cardId={card.id} view={pinView('html-made', '', cur)} placing={placing} onPlacingEnd={endPlacing} onOpenThreads={openThreads} />}
                        {onMade && pinsOn && pinTarget && (
                          <PinFloat cardId={card.id} cardOwner={owner} stage="production" root={() => madeFrame?.contentDocument ?? null} target={pinTarget} productName={(id) => vs.products.find((p) => p.id === id)?.name ?? ''} onTarget={setPinTarget} onClose={closePin} />
                        )}
                      </div>
                    )}
                  </div>
                  {/* ピン [collab.pins]: 企画の見本の上の、制作の段階の書き込み。右クリックの「ここにピンを打つ」・開発へのリクエストも、ここで受ける */}
                  {!onMade && <PreviewPins boxRef={boxRef} cardId={card.id} view={pinView('html-plan', '', cur)} items={pinItems} placing={placing} onPlacingEnd={endPlacing} onOpenThreads={openThreads} menuItems={previewMenu} pinsOn={pinsOn} stage="production" />}
                  {!onMade && pinsOn && pinTarget && (
                    <PinFloat cardId={card.id} cardOwner={owner} stage="production" root={() => boxRef.current} target={pinTarget} productName={(id) => vs.products.find((p) => p.id === id)?.name ?? ''} onTarget={setPinTarget} onClose={closePin} editSpot={(anchor, productId) => {
                      // ピンの場所の部品を選ぶ(その部品の材料・直すを右に出す。配信カードと同じ)
                      const p = partOfAnchor(anchor, (pid) => pinItems.find((i) => i.productId === pid)?.key, productId)
                      return p ? () => pick(p) : null
                    }} />
                  )}
                  {/* 企画から変えた所の印(P17。押すと、その部品を選ぶ) */}
                  {!onMade && changeMarks.length > 0 && <PreviewMarks boxRef={boxRef} marks={changeMarks} onSelect={pick} />}
                  {!onMade && <PreviewPartPicker boxRef={boxRef} selected={part && !inboxSelected ? part : null} onSelect={pick} disabled={placing} onRemove={canArrange ? removeProduct : undefined} onMove={canArrange ? moveProductDir : undefined} />}
                </PreviewFrame>
              }
              pane={
                <div className={s.rightCol}>
                  <div className={s.paneScroll}>
                    <StagePane key={part ? partKey(part) : 'none'}>
                      <div className={s.paneBody}>
                        {part ? (
                          partPane(part)
                        ) : (
                          <>
                            {/* 何も選んでいないときは「配信の全体」(計画と同じ題と ⓘ。Plan と Production の差の 40) */}
                            <PaneCrumbs
                              trail={[]}
                              info={t(
                                '制作に渡されたものを、項目ごとにコピーできます。プレビューの部品を押すと、その部品の材料と、直す欄を出します。制作指示・参考の素材は、左のバーの「渡されたもの」に',
                                'Copy each handed-off item. Click a part in the preview to see its materials and edit it. Production notes and reference materials are under Handoff in the left bar.',
                              )}
                            />
                            <PaneHint>{t('直したい所・写したい所は、プレビューで押してください', 'Click the part you want to copy or edit in the preview')}</PaneHint>
                            {givenPane}
                          </>
                        )}
                      </div>
                    </StagePane>
                  </div>
                  {/* 見た目を AI に頼む [prod.ai](何も選んでいないとき。詳しい制作のページの AI チャットを、試す → 確定の形で使い回す) */}
                  {!part && aiOn && canWork && (
                    <ProductionChat
                      title={t('見た目を AI に頼む', 'Ask AI to revise the look')}
                      current={vs}
                      original={snapshotOf(original, cur)}
                      editable={cur === 'A'}
                      html={made || generated}
                      htmlCustom={!!made}
                      products={shownProducts}
                      heroes={heroes}
                      revisionNote={live?.revision_note ?? undefined}
                      onProposal={(h) => tryHtml(h, `ai:${h.length}:${Date.now()}`, t('AI の見た目の案', 'AI layout proposal'))}
                      onApplyEdit={(next) => trySnap(next, { key: `chat:${Date.now()}`, from: '', to: t('AI の直し', 'AI edit') })}
                      onTryEdit={tryEdit}
                    />
                  )}
                  {!part && aiOn && !canWork && <span className={s.note} style={{ padding: '8px 16px' }}>{t('制作に渡したあとに、見た目を AI に頼めます', 'After the handoff, you can ask AI to revise the look')}</span>}
                </div>
              }
            />
          </StageFrame>
          {/* 見本の HTML を作るためだけの、見えないプレビュー(画面の大きさ・スマホの切り替えに左右されないように、別に描く) */}
          <div className={s.offscreen} aria-hidden>
            <div ref={offscreenRef}>
              <CardPreview card={savedCard} productIds={vs.productIds} products={vs.products} heroes={vs.hero ? [vs.hero] : []} />
            </div>
          </div>
          {finishedOpen && live && <FinishedFloat card={card} request={live} people={people} productIds={vs.productIds.filter(Boolean)} products={vs.products} onClose={() => setFinishedOpen(false)} />}
          {/* 制作した HTML を貼り付けて置き換える [prod.htmledit]。置き換えはプレビューで試してから、帯の「確定」で保存する */}
          {pasting !== null && (
            <Dialog open onOpenChange={(_, d) => !d.open && setPasting(null)}>
              <ResizableSurface sizeKey="pasteHtml" min={{ w: 480, h: 320 }}>
                <DialogBody>
                  {/* 題の行に ×(フロートの決まり。Plan と Production の差の 53) */}
                  <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setPasting(null)} aria-label={t('閉じる', 'Close')} />}>{t('制作した HTML を貼り付ける', 'Paste the production HTML')}</DialogTitle>
                  <DialogContent>
                    <AutoTextarea heightKey="SimpleProductionPage.pasteHtml" className={s.pasteBox} value={pasting} onChange={(_, d) => setPasting(d.value)} placeholder={t('ここに HTML を貼り付けます(<html> から </html> まで、まるごと)', 'Paste the whole HTML here (from <html> to </html>)')} />
                    <span className={s.note}>{t('プレビューで試してから、上の帯の「確定」で、制作した HTML と置き換わります(前の HTML は版に残ります)。', 'It is tried in the preview first, and replaces the production HTML when you press "Apply" in the bar above (the previous HTML is kept as a version).')}</span>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => setPasting(null)}>{t('やめる', 'Cancel')}</Button>
                    <Button
                      appearance="primary"
                      disabled={!pasting.trim()}
                      onClick={() => {
                        tryHtml(pasting, `paste:${Date.now()}`, t('貼り付けた HTML', 'Pasted HTML'))
                        setPasting(null)
                      }}
                    >
                      {t('プレビューで試す', 'Try in the preview')}
                    </Button>
                  </DialogActions>
                </DialogBody>
              </ResizableSurface>
            </Dialog>
          )}
        </PreviewHints>
      </ResizableSurface>
    </Dialog>
  )
}
