import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, Popover, PopoverSurface, PopoverTrigger, Spinner, Tab, TabList, Textarea, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowResetRegular, ArrowUndoRegular, AttachRegular, CheckmarkRegular, ChevronLeftRegular, ChevronRightRegular, ClipboardPasteRegular, CommentAddRegular, DismissRegular, EyeRegular, HandRightRegular, MoreHorizontalRegular, OpenRegular, SaveRegular, SendRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { ProductionRequest } from './models/productionRequests'
import { ProductionRequestsService } from './data/productionRequests'
import { ProductionService } from './data/production'
import { CardPreview } from './CardPreview'
import { CommentsPanel } from './CommentsPanel'
import { TasksPanel } from './TasksPanel'
import { MarkdownLite } from './MarkdownLite'
import { ChannelBadge } from './ChannelBadge'
import { FaceBadge } from './FaceBadge'
import { HtmlEditor } from './HtmlEditor'
import { CreativeAssets } from './CreativeAssets'
import { FinishedFloat } from './FinishedFloat'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { HtmlPins } from './HtmlPins'
import { pinView } from './pinStore'
import { PartPicker } from './PartPicker'
import { cardMarket } from './market'
import { CopyButton, ProductionInfoPane } from './ProductionInfoPane'
import { ProductionChat } from './ProductionChat'
import { syncHtml } from './productionRevise'
import { ResizableSurface } from './ResizableSurface'
import { Splitter } from './Splitter'
import { usePaneWidths } from './floatLayout'
import type { VariantKey } from './abTest'
import { buildSnapshot, downloadText, htmlLinks, parseSnapshot, parseVariantHtml, previewHtml, productionVariants, snapshotOf, type Snapshot } from './productionSnapshot'
import { myName, myUserId, onMeChange } from './history'
import { locale, tr, useT } from './i18n'
import { loadPref, savePref } from './settings'
import { canGoProduction } from './productionGate'
import { themeTypeLabel, themeTypeOf } from './themeTypes'
import { weekKeyOf } from './weekLock'
import { AutoTextarea } from './AutoTextarea'
import { PinFloat, type PinTarget } from './PinFloat'
import { focusPin, focusedPin, subscribePins } from './pinStore'
import { CardNotesService } from './data/cardNotes'
import { stageOf } from './notesStage'
import { forgetLinkedPin, linkedPin } from './pinActions'
import { CopyLinkButton } from './CopyLinkButton'
import { DevRequestMoreMenu } from './DevRequestMenu'
import { ResolvedPinsToggle } from './ResolvedPinsToggle'
import { PREF } from './prefKeys'

const RAIL_W = 32

const useStyles = makeStyles({
  // fixed + inset 0 + margin auto で画面の中央に置く(配信カードと同じ。relative だと標準の中央寄せが効かず、上端に貼りつく)
  surface: { position: 'fixed', inset: 0, margin: 'auto', width: 'min(1700px, (97vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(92vh / var(--ui-zoom, 1))', maxHeight: 'calc(92vh / var(--ui-zoom, 1))', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '10px 16px 6px' },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  // 状態と操作の行(題名のすぐ下。ペインをたたんでも、いつも見える)
  stateBar: { display: 'flex', alignItems: 'center', columnGap: '10px', rowGap: '6px', flexWrap: 'wrap', padding: '6px 16px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  // 工程の帯: 段を左から右へ並べ、いまの段だけを枠で強調する
  steps: { display: 'flex', alignItems: 'stretch', columnGap: '6px', flexGrow: 1, minWidth: 0, margin: 0, padding: 0, listStyleType: 'none', overflowX: 'auto' },
  step: { display: 'flex', alignItems: 'flex-start', columnGap: '8px', flex: '1 1 0', minWidth: '150px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground3 },
  stepCurrent: { border: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorNeutralForeground1 },
  stepDone: { backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground2 },
  stepDot: { flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, border: `1px solid ${tokens.colorNeutralStroke1}` },
  stepDotCurrent: { backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, border: 'none' },
  stepDotDone: { backgroundColor: tokens.colorPaletteGreenBackground3, color: tokens.colorNeutralForegroundOnBrand, border: 'none' },
  stepBody: { display: 'grid', rowGap: '4px', justifyItems: 'start', minWidth: 0 },
  stepName: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  stepActions: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', rowGap: '4px' },
  // 終えた段を戻すリンク(いちばん新しく終えた段だけ。目立たせない)
  undo: { minWidth: 0, padding: 0, height: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightRegular },
  // 4 つのペイン(要素の情報 | HTML のエディタ | プレビュー | やり取り)。幅は境界のドラッグで変え、覚える。要素の情報とやり取りは、たためる
  body: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' },
  col: { minHeight: 0, overflowY: 'auto', padding: '8px 14px 12px', display: 'grid', rowGap: '14px', alignContent: 'start', gridTemplateColumns: 'minmax(0, 1fr)' },
  // HTML とプレビューは、ペインいっぱいの高さに広げる(中でスクロール)
  fill: { minHeight: 0, minWidth: 0, padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', rowGap: '8px' },
  colTalk: { backgroundColor: tokens.colorNeutralBackground2 },
  paneTool: { display: 'flex', justifyContent: 'flex-end', marginBottom: '-10px' },
  // たたんだペインの細い帯(押すと開く)
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '10px', paddingTop: '10px', minHeight: 0, border: 'none', backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover } },
  railLabel: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
  editor: { flexGrow: 1, minHeight: 0 },
  // HTML の下書きを作るためだけに描く、見えないプレビュー(画面の外に置く)
  offscreen: { position: 'fixed', left: '-10000px', top: 0, width: '640px', pointerEvents: 'none' },
  section: { display: 'grid', rowGap: '6px' },
  // 制作した HTML / 企画の見本 の切り替え(X58)
  seg: { display: 'inline-flex', columnGap: '2px', flexShrink: 0 },
  toolRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '4px' },
  segBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular, whiteSpace: 'nowrap' },
  planCode: { flexGrow: 1, minHeight: 0, margin: 0, overflow: 'auto', padding: '8px', fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, Menlo, monospace', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground2 },
  compare: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px' },
  compareCol: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  pasteBox: { width: '100%', minHeight: 'calc(50vh / var(--ui-zoom, 1))', fontFamily: 'Consolas, Menlo, monospace', fontSize: '12px' },
  sectionHead: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  grow: { flexGrow: 1 },
  // コピーできる 1 行(見出し・値・コピー)
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'start', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  rowLabel: { display: 'block', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  rowValue: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  product: { display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  thumb: { width: '44px', height: '44px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  hero: { width: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  notes: { padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  doneBox: { display: 'grid', rowGap: '8px', width: '320px' },
  dirty: { color: tokens.colorPaletteDarkOrangeForeground1 },
  // 左で直した中身の保存の行(ペインの上)
  editBar: { display: 'flex', alignItems: 'center', columnGap: '4px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  messages: { padding: '0 16px', display: 'grid', rowGap: '6px' },
  // AB テストの案の切り替え(題名の行)と、「制作が終わった」の案ごとの状態
  variantSwitch: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  variantRow: { display: 'flex', columnGap: '6px', alignItems: 'baseline', fontSize: tokens.fontSizeBase200 },
})

interface Props {
  /** いまの配信カード(依頼する前は、これから写しの下書きを作って見せる) */
  card: DeliveryCard
  /** いまの掲載商品(メールの並び順) */
  productIds: string[]
  /** AB テストの B・C 案の商品(X55) */
  variantIds?: Partial<Record<VariantKey, string[]>>
  products: Product[]
  /** この配信で選んだ商品の画像(商品 ID → 画像の URL。X64)。写しの商品の画像に入れる */
  productImages?: Map<string, string>
  heroes: HeroImage[]
  /** やり取りの宛先・タスクの担当の候補 */
  people: string[]
  onClose: () => void
  /** 企画を見る(配信カードを開く) */
  onOpenCard: (cardId: string) => void
  /** 依頼・受け取り・終わった・送ったのあとに、外の一覧を読み直す */
  onChanged?: () => void
  /** 開いたら、そのまま制作に依頼する(シンプルな配信カードの「制作に渡す」。依頼の前で、依頼できるときだけ。1 回だけ) */
  autoRequest?: boolean
  /** 題名の左に出す、配信の段階の帯(計画・制作・結果を行き来する。StageNav) */
  stageNav?: ReactNode
}

const subscribeMe = (f: () => void) => onMeChange(f)
const LIVE = new Set(['requested', 'in_progress', 'done', 'checked', 'sent'])
const INFO_KEY = PREF.productionInfoOpen
const TALK_KEY = PREF.productionTalkOpen

/**
 * 制作のページ(バックログ PR3。docs/PRODUCTION.md)。承認された配信を、制作に渡す材料のページ。制作の人は、ここだけを見ればよい。
 * 左から: 要素の情報(制作指示・テキスト・商品・リンク先。項目ごとにコピー。たためる)| HTML のエディタ | その HTML をそのまま描いたプレビュー | 企画と制作のやり取り・タスク(たためる)。
 * 状態と操作は、題名のすぐ下の行に、いつも出す(2026-10-19、利用者と決めた: 材料を見る → 書く → 確かめる → 相談する、の順。左のコピーを隣のエディタに貼れる)。
 * 中身は、依頼した時点の写し(依頼する前は、いまの配信カードから作った下書き)
 */
export function ProductionPage({ card, productIds, variantIds, products, productImages, heroes, people, onClose, onOpenCard, onChanged, stageNav, autoRequest }: Props) {
  const s = useStyles()
  const t = useT()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const meName = useSyncExternalStore(subscribeMe, myName)
  // 既定の幅: プレビューに、メールの幅(600px 前後)が収まるよう残す
  const panes = usePaneWidths(PREF.productionPaneWidths, [300, 440, 0, 320], 2)
  const [infoOpen, setInfoOpen] = useState(() => loadPref<boolean>(INFO_KEY, true))
  const [talkOpen, setTalkOpen] = useState(() => loadPref<boolean>(TALK_KEY, true))
  const toggleInfo = () => setInfoOpen((v) => (savePref(INFO_KEY, !v), !v))
  const toggleTalk = () => setTalkOpen((v) => (savePref(TALK_KEY, !v), !v))
  const [requests, setRequests] = useState<ProductionRequest[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [doneNote, setDoneNote] = useState('')
  const [doneLink, setDoneLink] = useState('')
  const [reviseNote, setReviseNote] = useState('')
  const [side, setSide] = useState<'talk' | 'tasks' | 'assets'>('talk')
  // プレビューから作った HTML(下書き)と、エディタの中身(ない = まだ直していない)。AB テスト(全案を送る)は案ごと
  const [generatedMap, setGeneratedMap] = useState<Partial<Record<VariantKey, string>>>({})
  const [htmls, setHtmls] = useState<Partial<Record<VariantKey, string>>>({})
  const [variant, setVariant] = useState<VariantKey>('A')
  // X58 段階 3: エディタで見る HTML(制作した HTML / 企画の見本)と、プレビューの見せ方(並べて比べる)。貼り付けの欄
  const [htmlView, setHtmlView] = useState<'made' | 'plan'>('made')
  const [previewView, setPreviewView] = useState<'made' | 'plan' | 'compare'>('made')
  // プレビューの場所を指して書き込む(ピン。X65)。制作のやり取りに、場所つきで書く
  const [placingPin, setPlacingPin] = useState(false)
  const endPlacingPin = useCallback(() => setPlacingPin(false), [])
  const [previewFrame, setPreviewFrame] = useState<HTMLIFrameElement | null>(null)
  // 打ったピン・押したピンは、その横のフロート(PinFloat)で書く・読む・返す(右の制作のやり取りは、全部の流れとして残す)
  // リンク(pin=…)で開いたときは、そのピンのフロートを開いて始める(制作のピンでなければ、ピンが見つからず出ない)
  const [pinTarget, setPinTarget] = useState<PinTarget | null>(() => {
    const id = linkedPin()
    return id ? { noteId: id } : null
  })
  useEffect(() => {
    const id = linkedPin()
    if (id) focusPin(id)
  }, [])
  const [pasting, setPasting] = useState<string | null>(null)
  // 仕上がりを見る(X58 段階 4)
  const [finishedOpen, setFinishedOpen] = useState(false)
  const offscreenRefs = useRef<Partial<Record<VariantKey, HTMLDivElement | null>>>({})
  // AI チャットの見た目の案(どの案の HTML か)と、採用する前の HTML(「元に戻す」のため)
  const [proposal, setProposal] = useState<{ variant: VariantKey; html: string } | null>(null)
  const [beforeAdopt, setBeforeAdopt] = useState<{ variant: VariantKey; html: string } | null>(null)

  const load = useCallback(async () => {
    const r = await ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'` })
    setRequests(r.success ? [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)) : [])
  }, [card.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 制作を始められるか(いまは承認の前でも始められる。src/productionGate.ts)
  const approved = canGoProduction(card)
  const latest = requests?.[0]
  const live = latest && LIVE.has(latest.status ?? '') ? latest : undefined
  const staleLatest = latest?.status === 'stale' ? latest : undefined
  // 写し: 依頼したあとは固めたもの、依頼する前(下書き)は、いまの配信カードから作ったもの
  // この配信で選んだ画像は、写しの商品の画像として持つ(依頼したあとは、そのときの画像のまま。プレビュー・HTML・コピーの行がそのまま使う)
  const shownProducts = useMemo(() => (productImages?.size ? products.map((p) => (productImages.has(p.id) ? { ...p, image_url: productImages.get(p.id) } : p)) : products), [products, productImages])
  const draft = useMemo(() => buildSnapshot(card, productIds, shownProducts, heroes, variantIds), [card, productIds, shownProducts, heroes, variantIds])
  // 描くたびに写しを読み直すと、HTML の下書きを作り直し続けるので、固めた写しの文字が変わったときだけ読む
  const frozenSnap = useMemo(() => parseSnapshot(live?.snapshot), [live?.snapshot])
  const approvedSnap: Snapshot = frozenSnap || draft
  const frozen = !!live
  // 左で直した中身: 保存したもの(edited_snapshot)と、直しかけ(null = 直していない)。承認された写し・配信カードは書き換えない
  const savedEdits = useMemo(() => parseSnapshot(live?.edited_snapshot), [live?.edited_snapshot])
  const [work, setWork] = useState<Snapshot | null>(null)
  const snap: Snapshot = work ?? savedEdits ?? approvedSnap
  const editable = !!live && live.status !== 'sent'
  const editsDirty = work !== null && JSON.stringify(work) !== JSON.stringify(savedEdits ?? approvedSnap)
  const hasEdits = JSON.stringify({ ...snap, takenAt: '' }) !== JSON.stringify({ ...approvedSnap, takenAt: '' })
  const instructions = frozen ? (live?.instructions ?? '') : (card.instructions ?? '')
  const owner = frozen ? (live?.production_owner ?? '') : (card.production_owner ?? '')
  const due = frozen ? (live?.production_due ?? '') : (card.production_due ?? '')
  const weekStart = card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined
  const actor = { id: meId, name: meName }
  // AB テスト(全案を送る)は、案ごとに HTML を作る(案から選ぶは、決めた 1 案だけ)。直せるのは A 案の要素だけ(B・C 案の中身は配信カードで直す)
  const keys = productionVariants(snap)
  const cur: VariantKey = keys.includes(variant) ? variant : 'A'
  // やり取りの札・ピンのリンクで書き込みを開いたとき、その書き込みを打った見せ方(制作した HTML / 企画の見本)と案に切り替える。
  // 見せ方が違うとピンが出ず、どこへの書き込みか分からなかった(X65 (e))
  const focus = useSyncExternalStore(subscribePins, focusedPin)
  const keysRef = useRef(keys)
  useEffect(() => {
    keysRef.current = keys
  })
  useEffect(() => {
    if (!focus) return
    let alive = true
    void CardNotesService.getAll({ filter: `delivery_card_id eq ${card.id}` }).then((r) => {
      const n = r.success ? (r.data ?? []).find((x) => x.id === focus.noteId) : undefined
      if (!alive || !n?.anchor || stageOf(n) !== 'production') return
      const [ch, , v] = (n.anchor_view ?? '').split('|')
      const want = ch === 'html-plan' ? 'plan' : ch === 'html-made' ? 'made' : null
      if (!want) return
      setPreviewView((o) => (o === want ? o : want))
      if (v && (keysRef.current as string[]).includes(v)) setVariant(v as VariantKey)
    })
    return () => {
      alive = false
    }
  }, [focus, card.id])
  const curSnap = snapshotOf(snap, cur)
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const needMe = !meId ? t('右上で、だれでログインするかを選んでください', 'Choose who is signed in at the top right') : null
  // 案から選ぶ配信(X57)は、1 案に決めるまで制作に依頼しない(決まらない案まで作り込むのは無駄なため。2026-10-21 利用者の判断)
  const choosing = !live && !!draft.ab?.choose
  const needChoice = choosing ? t('案から選ぶ配信で、まだ 1 案に決まっていません。配信カードの上の帯で「この案に決める」を押して保存してから、依頼してください', 'This delivery is still choosing between variants. Choose one in the bar at the top of the delivery card and save before requesting.') : null

  // 見えないプレビューを描いたあとに、HTML の下書きを作る(画面に描いたものから、書式を直接書いた形にする)
  useEffect(() => {
    const id = setTimeout(() => {
      const out: Partial<Record<VariantKey, string>> = {}
      for (const [k, el] of Object.entries(offscreenRefs.current)) if (el) out[k as VariantKey] = previewHtml(el, card.name ?? '', htmlLinks(snapshotOf(snap, k as VariantKey), k as VariantKey))
      setGeneratedMap(out)
    }, 600)
    return () => clearTimeout(id)
    // 依頼を読み終えるまではプレビューを描かないので、読み終えたときにも作る
  }, [snap, card.name, requests])
  // エディタの中身: 直していればそれ、なければ保存した HTML、それもなければプレビューから作った下書き(案ごと。A 案は列 html、B・C 案は列 variant_html)
  const savedVariants = useMemo(() => parseVariantHtml(live?.variant_html), [live?.variant_html])
  const savedOf = (k: VariantKey) => (k === 'A' ? (live?.html ?? '') : (savedVariants[k]?.html ?? ''))
  const shownOf = (k: VariantKey) => htmls[k] ?? (savedOf(k) || generatedMap[k] || '')
  const dirtyOf = (k: VariantKey) => htmls[k] !== undefined && htmls[k] !== (savedOf(k) || generatedMap[k] || '')
  const generated = generatedMap[cur] ?? ''
  const savedHtml = savedOf(cur)
  const html = htmls[cur] ?? null
  const setHtml = (v: string) => setHtmls((m) => ({ ...m, [cur]: v }))
  const shown = shownOf(cur)
  // 版が変わったら(依頼した・古い版になった)、直しかけを捨てて選び直す
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtmls({})
    setWork(null)
    setProposal(null)
    setBeforeAdopt(null)
  }, [live?.id])
  const dirty = dirtyOf(cur)
  const anyDirty = keys.some(dirtyOf)
  // B・C 案の HTML(依頼・送信のときに一緒に固める。保存した人・時刻は残す)
  const variantHtmlJson = () =>
    keys.length > 1 ? JSON.stringify(Object.fromEntries(keys.filter((k) => k !== 'A').map((k) => [k, { ...savedVariants[k], html: shownOf(k) }]))) : undefined
  // 要素を直したのに、保存した HTML が前のまま(HTML は自動では作り直さない。直した HTML を消さないため。要素を直せるのは A 案だけ)
  // AI の見た目の案は、いま見ている案のものだけを出す
  const curProposal = proposal?.variant === cur ? proposal.html : null
  const curBeforeAdopt = beforeAdopt?.variant === cur ? beforeAdopt.html : null
  // HTML を手で直しているか(直していなければ、要素を直すと下書きが作り直される)
  const htmlCustom = htmls[cur] !== undefined || !!savedOf(cur)
  // AI チャットから要素を直したとき: 左のペインで直したのと同じに入れ、手で直した HTML の同じ場所も書き換える(作り直すと、直した見た目が消えるため)
  const applyChatEdit = (next: Snapshot) => {
    setWork(next)
    if (!htmlCustom) return
    const r = syncHtml(shownOf(cur), curSnap, next)
    if (r.replaced) setHtml(r.html)
    setNotice(
      r.missing
        ? tr(`左のペインに入れました。HTML の中で場所が見つからなかったものが ${r.missing} つあります(HTML を手で直すか、↺ で作り直してください)。`, `Applied in the left pane. ${r.missing} item(s) could not be found in the HTML (edit it by hand, or rebuild with ↺).`)
        : tr('左のペインに入れ、HTML の同じ場所も書き換えました(左と HTML の「保存」で確定します)。', 'Applied in the left pane and the same spot in the HTML (confirm with Save on both).'),
    )
  }
  const htmlBehind = cur === 'A' && !!savedHtml && html === null && (editsDirty || (!!live?.edited_at && (!live?.html_saved_at || live.edited_at > live.html_saved_at)))

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string }; data?: unknown }>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
      // 配信のしくみに送ったときは、サーバーの返事(「送りました」)をそのまま出す
      const message = (r.data as { message?: string } | undefined)?.message
      if (done || message) setNotice(message ?? done ?? null)
      await load()
      onChanged?.()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  const requestInput = () => ({
    delivery_card_id: card.id,
    actor,
    // 依頼する前は、いまの配信カード。依頼したあとに配信のしくみへ送るときは、直した中身(あれば)
    snapshot: JSON.stringify(live ? snap : draft),
    instructions: card.instructions ?? '',
    production_owner: card.production_owner ?? '',
    production_due: card.production_due ?? '',
    // エディタの HTML(直していればそれ)も一緒に固める。AB テストは B・C 案も
    html: shownOf('A'),
    variant_html: variantHtmlJson(),
    week_start: weekStart,
  })

  // シンプルな配信カードの「制作に渡す」から開いたとき: HTML の下書きができたら、1 回だけ依頼まで進める
  const autoDone = useRef(false)
  const autoReady = !!autoRequest && requests !== null && !live && approved && !!meId && !choosing && !busy && !!shownOf('A')
  useEffect(() => {
    if (!autoReady || autoDone.current) return
    autoDone.current = true
    void run(() => ProductionService.request(requestInput()), tr('制作に依頼しました', 'Requested production'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReady])

  // 工程の帯(2026-10-19、利用者と決めた: 左が始まり・右が終わり。いまの段のボタンだけを出す)。
  // ① 依頼する(企画)→ ② 受け取る(制作)→ ③ 制作する(制作)→ ④ 仕上がりの確認(企画。PR7)→ ⑤ 配信のしくみに送る(企画)。FLOWS.md 1.2 の「いま、だれの番か」
  const status = live?.status
  const current = !approved ? -1 : !live ? 0 : status === 'requested' ? 1 : status === 'in_progress' ? 2 : status === 'done' ? 3 : status === 'checked' ? 4 : 5
  // 近道(制作を通さずに送った)のときは、② ③ を「飛ばした」にする。いちばん新しく終えた段(current - 1)には「やり直す」(依頼の段は「依頼を取り下げる」)
  const skipped = status === 'sent' && !live?.received_at && !live?.done_at
  // 確認を作る前に送った版は、④ を飛ばしている
  const checkSkipped = status === 'sent' && !skipped && !live?.checked_at
  const steps: { key: string; name: string; who: string; info?: string; skipped?: boolean; action?: ReactNode }[] = [
    {
      key: 'request',
      name: t('制作に依頼する', 'Request production'),
      who: t('企画', 'Planner'),
      // 案から選ぶ配信の、依頼できない理由は、段の中に出す(押せないボタンには、ヒントが出ないため)
      info: live?.requested_by_name ? `${live.requested_by_name} ${when(live.requested_at)}` : choosing ? t('1 案に決めてから依頼できます(案から選ぶ)', 'Choose a variant first') : undefined,
      action: (
        <Tooltip content={needMe ?? needChoice ?? t('いまの配信カードの中身と HTML を固めて、制作に依頼します(このあと配信カードを変えても、このページは変わりません)', 'Freezes the current content and HTML and requests production (later changes to the card do not change this page)')} relationship="description">
          <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || !meId || choosing || !shownOf('A')} onClick={() => void run(() => ProductionService.request(requestInput()), tr('制作に依頼しました', 'Requested production'))}>
            {t('この内容で依頼する', 'Request with this content')}
          </Button>
        </Tooltip>
      ),
    },
    {
      key: 'receive',
      name: t('受け取る', 'Receive'),
      who: owner || t('制作', 'Production'),
      info: live?.received_by_name ? `${live.received_by_name} ${when(live.received_at)}` : undefined,
      skipped,
      action: live && (
        <Button size="small" appearance="primary" icon={<HandRightRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.receive(live.id, { actor, week_start: weekStart }), tr('受け取りました', 'Received'))}>
          {t('受け取った', 'Received')}
        </Button>
      ),
    },
    {
      key: 'make',
      name: t('制作する', 'Produce'),
      who: owner || t('制作', 'Production'),
      info: live?.done_by_name
        ? [`${live.done_by_name} ${when(live.done_at)}`, live.done_note, live.done_link].filter(Boolean).join(' — ')
        : live?.revision_note
          ? t(`直してほしい(${live.revision_by_name ?? ''} ${when(live.revision_at)}): ${live.revision_note}`, `Fix requested (${live.revision_by_name ?? ''} ${when(live.revision_at)}): ${live.revision_note}`)
          : undefined,
      skipped,
      action: live && (
        <Popover withArrow positioning="below-start">
          <PopoverTrigger disableButtonEnhancement>
            <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={busy || !meId}>
              {t('制作が終わった', 'Production done')}
            </Button>
          </PopoverTrigger>
          <PopoverSurface>
            <div className={s.doneBox}>
              {keys.length > 1 && (
                <>
                  <span className={s.note}>{t('AB テストの全案の HTML がそろってから、終わりにします', 'Mark as done once every variant’s HTML is ready')}</span>
                  {keys.map((k) => {
                    const by = k === 'A' ? live?.html_saved_by_name : savedVariants[k]?.saved_by_name
                    const at = k === 'A' ? live?.html_saved_at : (savedVariants[k]?.saved_at ?? undefined)
                    return (
                      <span key={k} className={s.variantRow}>
                        <b>{t(`${k} 案`, `Variant ${k}`)}</b>
                        {dirtyOf(k) ? (
                          <span className={s.dirty}>{t('保存していない変更があります', 'Unsaved changes')}</span>
                        ) : by ? (
                          <span className={s.note}>{t(`保存: ${by} ${when(at)}`, `Saved by ${by} ${when(at)}`)}</span>
                        ) : (
                          <span className={s.note}>{t('依頼したときの HTML のまま', 'Still the HTML from the request')}</span>
                        )}
                      </span>
                    )
                  })}
                </>
              )}
              <span className={s.note}>{t('ひとこと・できたもののリンクを添えられます(どちらも任意)', 'You can add a note and a link to the result (both optional)')}</span>
              <AutoTextarea heightKey="ProductionPage.doneNote" rows={1} size="small" value={doneNote} onChange={(_, d) => setDoneNote(d.value)} placeholder={t('ひとこと', 'Note')} />
              <Input size="small" value={doneLink} onChange={(_, d) => setDoneLink(d.value)} placeholder="https://" />
              <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={busy || anyDirty} title={anyDirty ? t('保存していない HTML があります(案を切り替えて保存してください)', 'Some HTML is not saved (switch variants and save)') : undefined} onClick={() => void run(() => ProductionService.done(live.id, { actor, note: doneNote, link: doneLink, week_start: weekStart }), tr('制作が終わりました', 'Marked as done'))}>
                {t('制作が終わった', 'Production done')}
              </Button>
            </div>
          </PopoverSurface>
        </Popover>
      ),
    },
    {
      key: 'check',
      name: t('仕上がりの確認', 'Check the result'),
      who: t('企画', 'Planner'),
      info: live?.checked_by_name ? `${live.checked_by_name} ${when(live.checked_at)}` : undefined,
      skipped: skipped || checkSkipped,
      action: live && (
        <span className={s.stepActions}>
          <Button size="small" appearance="secondary" icon={<EyeRegular />} onClick={() => setFinishedOpen(true)} title={t('制作した HTML・ひとこと・リンク・素材を 1 か所で見ます', 'See the production HTML, note, link and assets in one place')}>
            {t('仕上がりを見る', 'View result')}
          </Button>
          <Tooltip content={needMe ?? t('右のプレビューと HTML を見て、これで送ってよければ押します', 'Press when the preview and HTML on the right are good to send')} relationship="description">
            <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.check(live.id, { actor, week_start: weekStart }), tr('仕上がりを確認しました', 'Checked the result'))}>
              {t('これで OK', 'Looks good')}
            </Button>
          </Tooltip>
          <Popover withArrow positioning="below-start">
            <PopoverTrigger disableButtonEnhancement>
              <Button size="small" disabled={busy || !meId}>
                {t('直してほしい', 'Request a fix')}
              </Button>
            </PopoverTrigger>
            <PopoverSurface>
              <div className={s.doneBox}>
                <span className={s.note}>{t('直してほしいことを書いて、制作に戻します(③ 制作する に戻ります)', 'Write what to fix and send it back to production (back to step 3)')}</span>
                <AutoTextarea heightKey="ProductionPage.reviseNote" rows={2} size="small" value={reviseNote} onChange={(_, d) => setReviseNote(d.value)} placeholder={t('例: ボタンの文言を「今すぐ見る」に', 'e.g. Change the button text to "Shop now"')} />
                <Button
                  size="small"
                  appearance="primary"
                  disabled={busy || !reviseNote.trim()}
                  onClick={() =>
                    void run(() => ProductionService.revise(live.id, { actor, note: reviseNote, week_start: weekStart }), tr('制作に戻しました', 'Sent back to production')).then((ok) => ok && setReviseNote(''))
                  }
                >
                  {t('制作に戻す', 'Send back')}
                </Button>
              </div>
            </PopoverSurface>
          </Popover>
        </span>
      ),
    },
    {
      key: 'send',
      name: t('配信のしくみに送る', 'Send to delivery system'),
      who: t('企画', 'Planner'),
      info: live?.sent_by_name ? t(`${live.sent_by_name} ${when(live.sent_at)}(送り先は、まだ仮)`, `${live.sent_by_name} ${when(live.sent_at)} (placeholder destination)`) : undefined,
      action: live && (
        <Tooltip content={needMe ?? t('エディタの HTML と、テキスト・リンク先を、配信のしくみに送ります(いまは送り先が仮です)', 'Sends the editor HTML, text and links to the delivery system (the destination is a placeholder for now)')} relationship="description">
          <Button
            size="small"
            appearance="primary"
            icon={<SendRegular />}
            disabled={busy || !meId || !shownOf('A')}
            onClick={() => {
              if (!window.confirm(t('配信のしくみに送ります。よろしいですか?', 'Send to the delivery system?'))) return
              void run(() => ProductionService.sendRequest(live.id, { actor, html: shownOf('A'), variant_html: variantHtmlJson(), week_start: weekStart }), tr('送りました(送り先は、まだ仮です)', 'Sent (placeholder destination)'))
            }}
          >
            {t('送る', 'Send')}
          </Button>
        </Tooltip>
      ),
    },
  ]

  const rail = (label: string, onOpen: () => void) => (
    <button type="button" className={s.rail} onClick={onOpen} aria-label={t(`${label}を開く`, `Open ${label}`)}>
      <ChevronLeftRegular />
      <span className={s.railLabel}>{label}</span>
    </button>
  )

  // たたんだペインは、細い帯の幅にする(幅は覚えたまま)
  const columns = panes.widths.map((w, i) => (i === 2 ? 'minmax(400px, 1fr)' : (i === 0 && !infoOpen) || (i === 3 && !talkOpen) ? `${RAIL_W}px` : `${w}px`)).join(' 1px ')

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      {/* 大きさの鍵は、以前からの productionPage.size を引き継ぐ */}
      <ResizableSurface sizeKey="productionPage" prefKey={PREF.productionSize} min={{ w: 900, h: 560 }} className={s.surface} aria-label={t(`制作のページ: ${card.name}`, `Production page: ${card.name}`)}>
        <div className={s.head}>
          {stageNav ?? <FaceBadge face="production" />}
          <ChannelBadge channel={card.channel} />
          <span className={s.title}>{card.name}</span>
          <span className={s.meta}>{card.scheduled_at ? new Date(card.scheduled_at).toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          {frozen && <Badge appearance="tint" color="informative">{t(`版 ${live?.version} ・ ${when(live?.requested_at)} に依頼`, `v${live?.version} · requested ${when(live?.requested_at)}`)}</Badge>}
          {keys.length > 1 && (
            <span className={s.variantSwitch} role="tablist" aria-label={t('AB テストの案', 'A/B test variants')} title={t('AB テストは全案を送るので、案ごとに HTML を作ります。左の要素・HTML・プレビューが、選んだ案のものになります', 'An A/B test sends every variant, so each variant gets its own HTML. The info, HTML and preview follow the selected variant')}>
              {keys.map((k) => (
                <Button key={k} size="small" role="tab" aria-selected={cur === k} appearance={cur === k ? 'primary' : 'subtle'} className={s.segBtn} onClick={() => setVariant(k)}>
                  {t(`${k} 案`, `Variant ${k}`)}
                  {dirtyOf(k) ? ' •' : ''}
                </Button>
              ))}
            </span>
          )}
          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(card.id)}>
            {t('企画を見る', 'Open the plan')}
          </Button>
          <CopyLinkButton />
          <DevRequestMoreMenu />
          <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
        </div>

        {/* 状態と操作(いつも見える) */}
        <div className={s.stateBar}>
          <ol className={s.steps}>
            {steps.map((st, i) => {
              const at = st.skipped ? 'skipped' : i < current ? 'done' : i === current ? 'current' : 'todo'
              return (
                <li key={st.key} className={mergeClasses(s.step, at === 'current' && s.stepCurrent, (at === 'done' || at === 'skipped') && s.stepDone)}>
                  <span className={mergeClasses(s.stepDot, at === 'current' && s.stepDotCurrent, at === 'done' && s.stepDotDone)}>{at === 'done' ? <CheckmarkRegular /> : i + 1}</span>
                  <span className={s.stepBody}>
                    <span className={s.stepName}>{st.name}</span>
                    <span className={s.note}>{at === 'skipped' ? t('飛ばした(制作を通さずに送った)', 'Skipped (sent without production)') : st.info || st.who}</span>
                    {at === 'current' && st.action}
                    {i === current - 1 && live && (
                      <Tooltip content={i === 0 ? t('依頼を取り下げて、① に戻します(この版は記録に残ります。やり直すときは、新しい版で依頼し直します)', 'Withdraws the request and goes back to step 1 (this version stays on record; request again with a new version)') : t('この段を、まだ終えていない状態に戻します', 'Puts this step back to not done')} relationship="description">
                        <Button
                          size="small"
                          appearance="transparent"
                          className={s.undo}
                          icon={<ArrowUndoRegular />}
                          disabled={busy || !meId}
                          onClick={() => {
                            if (!window.confirm(i === 0 ? t('依頼を取り下げます。よろしいですか?', 'Withdraw the request?') : t(`「${st.name}」をやり直します。よろしいですか?`, `Redo "${st.name}"?`))) return
                            void run(() => ProductionService.undo(live.id, { actor, week_start: weekStart }), i === 0 ? tr('依頼を取り下げました', 'Withdrew the request') : tr('1 つ前の段に戻しました', 'Went back one step'))
                          }}
                        >
                          {i === 0 ? t('依頼を取り下げる', 'Withdraw') : t('やり直す', 'Redo')}
                        </Button>
                      </Tooltip>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
          {!approved && <span className={s.note}>{t('承認されたら、① から始めます', 'Start from step 1 after approval')}</span>}
          {approved && current < 4 && (
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem
                    icon={<SendRegular />}
                    disabled={busy || !meId || choosing || !shownOf('A')}
                    title={needChoice ?? undefined}
                    onClick={() => {
                      if (!window.confirm(t('制作を通さず、いまの中身と HTML を、配信のしくみに送ります。よろしいですか?', 'Send the current content and HTML to the delivery system without production?'))) return
                      void run(() => ProductionService.send(requestInput()))
                    }}
                  >
                    {t('制作を通さずに、配信のしくみに送る', 'Send to the delivery system without production')}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
        </div>
        {(error || notice || (staleLatest && !live)) && (
          <div className={s.messages}>
            {staleLatest && !live && (
              <MessageBar intent="warning" layout="multiline">
                <MessageBarBody>{t(`企画が変わりました(版 ${staleLatest.version} は古い版です)。承認されたら、新しい版で依頼し直してください。`, `The plan changed (v${staleLatest.version} is outdated). Request again with a new version after approval.`)}</MessageBarBody>
              </MessageBar>
            )}
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {notice && (
              <MessageBar intent="success" layout="multiline">
                <MessageBarBody>{notice}</MessageBarBody>
              </MessageBar>
            )}
          </div>
        )}

        {requests === null ? (
          <Spinner size="small" />
        ) : (
          <div className={s.body} style={{ gridTemplateColumns: columns }}>
            {/* 1. 要素の情報: 制作指示・テキスト・メイン画像・商品・リンク先(項目ごとにコピー。たためる) */}
            {infoOpen ? (
              <div className={s.col}>
                <div className={s.paneTool}>
                  <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={toggleInfo} aria-label={t('要素の情報をたたむ', 'Collapse the info')} />
                </div>
                <ProductionInfoPane
                  original={snapshotOf(approvedSnap, cur)}
                  current={curSnap}
                  editable={editable && cur === 'A'}
                  onChange={setWork}
                  products={products}
                  heroes={heroes}
                  head={
                    <>
                      {editable && cur !== 'A' && (
                        <div className={s.editBar}>
                          <span className={s.note}>{t(`${cur} 案の要素です。直すのは HTML で(要素は配信カードで直します)`, `Variant ${cur}. Edit its HTML here (edit the elements in the delivery card)`)}</span>
                        </div>
                      )}
                      {editable && cur === 'A' && (
                        <div className={s.editBar}>
                          <span className={s.grow}>
                            {editsDirty ? (
                              <span className={s.dirty}>{t('保存していない変更があります', 'Unsaved changes')}</span>
                            ) : live?.edited_by_name ? (
                              <span className={s.note}>{t(`直した: ${live.edited_by_name} ${when(live.edited_at)}`, `Edited by ${live.edited_by_name} ${when(live.edited_at)}`)}</span>
                            ) : (
                              <span className={s.note}>{t('文言・画像・商品・リンク先は、ここで直せます(配信カードは変わりません)', 'You can edit text, image, products and links here (the plan card does not change)')}</span>
                            )}
                          </span>
                          {hasEdits && (
                            <Tooltip content={t('直したものを捨てて、企画で承認された内容に戻します(保存すると反映)', 'Discard the edits and go back to the approved plan (applies when saved)')} relationship="label">
                              <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} onClick={() => setWork(approvedSnap)} />
                            </Tooltip>
                          )}
                          <Button
                            size="small"
                            appearance="primary"
                            icon={<SaveRegular />}
                            disabled={busy || !meId || !editsDirty}
                            onClick={() =>
                              live &&
                              void run(
                                () => ProductionService.saveEdits(live.id, { actor, edited_snapshot: hasEdits ? JSON.stringify(snap) : '', week_start: weekStart }),
                                tr('直した内容を保存しました', 'Saved the edits'),
                              ).then((saved) => saved && setWork(null))
                            }
                          >
                            {t('保存', 'Save')}
                          </Button>
                        </div>
                      )}
                      <div className={s.section}>
                        <div className={s.sectionHead}>
                          <span className={s.grow}>{t('制作指示', 'Production notes')}</span>
                          <CopyButton text={instructions} label={t('まとめてコピー', 'Copy all')} />
                        </div>
                        <span className={s.note}>{t(`担当: ${owner || '(未設定)'} ・ 締め切り: ${due ? due.slice(0, 10).replace(/-/g, '/') : '(未設定)'}`, `Assignee: ${owner || '(not set)'} · Due: ${due ? due.slice(0, 10) : '(not set)'}`)}</span>
                        {instructions.trim() ? (
                          <div className={s.notes}>
                            <MarkdownLite text={instructions} />
                          </div>
                        ) : (
                          <span className={s.note}>{t('制作指示がありません(企画の配信カードの ⑥ で作ります)', 'No production notes (create them in step 6 of the plan card)')}</span>
                        )}
                        {!frozen && <span className={s.note}>{t('依頼する前は、いまの配信カードの中身を出しています。直すときは、企画の配信カードで直します(依頼したあとは、ここで直せます)。', 'Before the request, this shows the current card. Edit it in the plan card (after the request, you can edit here).')}</span>}
                      </div>
                      {/* 参考の素材(X58): 制作指示のすぐ下。指示と参考を上から順に読む */}
                      <div className={s.section}>
                        <CreativeAssets
                          cardId={card.id}
                          stage="production"
                          title={t('参考の素材', 'Reference assets')}
                          hideCaption
                          owner={card.owner}
                          people={people}
                          cardName={card.name ?? ''}
                          productionOwner={owner}
                          productionDue={due}
                          productIds={snap.productIds}
                          products={snap.products}
                        />
                      </div>
                      {/* 部品の画像(X59 ③): ボタン・バナー・ロゴ・アイコン。URL か <img> のタグをコピーして、隣の HTML に貼る */}
                      <div className={s.section}>
                        <div className={s.sectionHead}>
                          <span className={s.grow}>{t('部品の画像', 'Part images')}</span>
                        </div>
                        <PartPicker market={cardMarket(card.country ?? '')} />
                      </div>
                    </>
                  }
                  foot={<span className={s.note}>{t(`種類: ${themeTypeLabel(themeTypeOf(card).type)} ・ 写し: ${when(approvedSnap.takenAt)}`, `Type: ${themeTypeLabel(themeTypeOf(card).type)} · Snapshot: ${when(approvedSnap.takenAt)}`)}</span>}
                />
              </div>
            ) : (
              rail(t('要素の情報', 'Info'), toggleInfo)
            )}

            <Splitter onDrag={infoOpen ? panes.onDrag(0) : () => undefined} onDone={panes.onDone} />

            {/* 2. HTML のエディタ(直したら、右のプレビューにすぐ反映。保存は版ごとに 1 つ) */}
            <div className={s.fill}>
              <div className={s.sectionHead}>
                <span className={s.grow}>
                  HTML
                  {dirty && <span className={s.dirty}>{t(' ・ 保存していない変更があります', ' · unsaved changes')}</span>}
                  {htmlBehind && <span className={s.dirty}>{t(' ・ 要素を直したあと、作り直していません(↺ で作り直す)', ' · not rebuilt since the edits (↺ to rebuild)')}</span>}
                  {!dirty && live?.html_saved_by_name && <span className={s.note}>{t(` ・ 保存: ${live.html_saved_by_name} ${when(live.html_saved_at)}`, ` · saved by ${live.html_saved_by_name} ${when(live.html_saved_at)}`)}</span>}
                </span>
                <Tooltip content={t('企画の見本(プレビューから作った下書き)に戻します', 'Reset to the plan sample (draft built from the preview)')} relationship="label">
                  <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} disabled={!generated || htmlView === 'plan'} onClick={() => setHtml(generated)} />
                </Tooltip>
                {keys.length > 1 && <Badge appearance="tint" color="brand">{t(`${cur} 案`, `Variant ${cur}`)}</Badge>}
                <CopyButton text={htmlView === 'plan' ? generated : shown} label={t('HTML をコピー', 'Copy HTML')} />
                <Tooltip content={t('.html として保存', 'Download as .html')} relationship="label">
                  <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!shown} onClick={() => downloadText(`${(card.name ?? 'delivery').replace(/[\\/:*?"<>|]/g, '_')}${keys.length > 1 ? `-${cur.toLowerCase()}` : ''}.html`, shown)} />
                </Tooltip>
                <Tooltip content={live ? (needMe ?? t('この HTML を、この版に保存します', 'Save this HTML to this version')) : t('依頼したあとに保存できます(依頼するときは、この HTML も一緒に固めます)', 'You can save after the request (requesting freezes this HTML too)')} relationship="label">
                  <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={busy || !live || !meId || !dirty} onClick={() => live && void run(() => ProductionService.saveHtml(live.id, { actor, html: shown, variant: cur }), keys.length > 1 ? tr(`${cur} 案の HTML を保存しました`, `Saved variant ${cur}'s HTML`) : tr('HTML を保存しました', 'Saved the HTML'))}>
                    {t('保存', 'Save')}
                  </Button>
                </Tooltip>
              </div>
              <div className={s.toolRow}>
                <span className={s.seg} role="tablist" aria-label={t('どの HTML を見るか', 'Which HTML')}>
                  {(
                    [
                      ['made', t('制作した HTML', 'Production HTML'), t('制作者が作った HTML(貼り付け・直して、版ごとに保存)', 'The HTML made by production (paste, edit and save per version)')],
                      ['plan', t('企画の見本', 'Plan sample'), t('企画のプレビュー(AI と作った配信カードの中身)から作った HTML。見るだけ', 'HTML built from the plan preview (the delivery card made with AI). Read-only')],
                    ] as const
                  ).map(([k, label, tip]) => (
                    <Button key={k} size="small" role="tab" aria-selected={htmlView === k} appearance={htmlView === k ? 'primary' : 'subtle'} className={s.segBtn} title={tip} onClick={() => setHtmlView(k)}>
                      {label}
                    </Button>
                  ))}
                </span>
                {htmlView === 'made' && (
                  <Button size="small" appearance="secondary" className={s.segBtn} icon={<ClipboardPasteRegular />} disabled={!live} title={live ? t('制作ツールなどで作った HTML を貼り付けて、いまの HTML と置き換えます(保存で確定)', 'Paste HTML made elsewhere to replace the current HTML (confirmed on save)') : t('依頼したあとに貼り付けられます', 'You can paste after the request')} onClick={() => setPasting('')}>
                    {t('貼り付けて置き換える', 'Paste to replace')}
                  </Button>
                )}
              </div>
              {htmlView === 'plan' ? (
                // 企画の見本: AI と作った配信カードの中身を描いて作った HTML。直さない(直すのは「制作した HTML」)
                <pre className={s.planCode} aria-label={t('企画の見本の HTML', 'Plan sample HTML')}>{generated || t('プレビューから HTML を作っています…', 'Building HTML from the preview…')}</pre>
              ) : (
                <div className={s.editor}>{shown ? <HtmlEditor value={shown} onChange={setHtml} ariaLabel={t('HTML のエディタ', 'HTML editor')} /> : <Spinner size="tiny" label={t('プレビューから HTML を作っています…', 'Building HTML from the preview…')} />}</div>
              )}
              <span className={s.note}>
                {htmlView === 'plan'
                  ? t('企画の見本は、配信カードのプレビューと同じ見た目の HTML です(見るだけ)。制作した HTML と並べるときは、右のプレビューの「並べて比べる」。', 'The plan sample is HTML with the same look as the delivery card preview (read-only). To compare with the production HTML, use "Side by side" in the preview.')
                  : savedHtml
                    ? t('制作した HTML です。制作ツールで作ったものは「貼り付けて置き換える」で入れ、保存します。画像は、このサイトの外で開くと見えないことがあります。', 'The production HTML. Paste HTML made elsewhere with "Paste to replace", then save. Images may not show outside this site.')
                    : t('まだ制作した HTML がないので、企画の見本から始めています。直すか、制作ツールで作ったものを「貼り付けて置き換える」で入れて、保存します。', 'No production HTML yet, so this starts from the plan sample. Edit it, or paste HTML made elsewhere with "Paste to replace", then save.')}
              </span>
              {/* AI チャット(制作物の手直し): 見た目は右のプレビューで見比べて採用、文言などは左のペインの 1 行のフロートで入れる */}
              <ProductionChat
                current={curSnap}
                original={snapshotOf(approvedSnap, cur)}
                editable={editable && cur === 'A'}
                html={shown}
                htmlCustom={htmlCustom}
                products={products}
                heroes={heroes}
                revisionNote={live?.revision_note ?? undefined}
                onProposal={(h: string) => setProposal({ variant: cur, html: h })}
                onApplyEdit={applyChatEdit}
              />
            </div>

            <Splitter onDrag={panes.onDrag(1)} onDone={panes.onDone} />

            {/* 3. プレビュー: エディタの HTML を、アプリの画面とは切り離した枠でそのまま描く */}
            <div className={s.fill}>
              {/* 見せ方: 制作した HTML / 企画の見本 / 並べて比べる(X58) */}
              <div className={s.sectionHead}>
                <span className={s.grow}>{t('プレビュー', 'Preview')}</span>
                <span className={s.seg} role="tablist" aria-label={t('プレビューの見せ方', 'Preview mode')}>
                  {(
                    [
                      ['made', t('制作した HTML', 'Production HTML')],
                      ['plan', t('企画の見本', 'Plan sample')],
                      ['compare', t('並べて比べる', 'Side by side')],
                    ] as const
                  ).map(([k, label]) => (
                    <Button key={k} size="small" role="tab" aria-selected={previewView === k} appearance={previewView === k ? 'primary' : 'subtle'} className={s.segBtn} onClick={() => setPreviewView(k)}>
                      {label}
                    </Button>
                  ))}
                </span>
                {/* 並べて比べるとき(AI の案と見比べているときも)は、どちらに置くか分からないので出さない */}
                {previewView !== 'compare' && curProposal === null && (
                  <Tooltip relationship="description" content={t('プレビューの場所を押して、そこへの書き込み(マーケ担当者への問い合わせなど)を始めます。Esc でやめます。', 'Click a spot in the preview to start a comment there (e.g. a question to marketing). Esc to cancel.')}>
                    <Button size="small" appearance={placingPin ? 'primary' : 'subtle'} icon={<CommentAddRegular />} onClick={() => setPlacingPin((v) => !v)} aria-pressed={placingPin}>
                      {placingPin ? t('場所を押す…', 'Click a spot…') : t('コメントを置く', 'Place comment')}
                    </Button>
                  </Tooltip>
                )}
                {previewView !== 'compare' && curProposal === null && <ResolvedPinsToggle />}
              </div>
              {curBeforeAdopt !== null && curProposal === null && (
                <div className={s.editBar}>
                  <span className={mergeClasses(s.grow, s.note)}>{t('AI の見た目の案を採用しました。', 'Adopted the AI layout proposal.')}</span>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<ArrowUndoRegular />}
                    onClick={() => {
                      setHtml(curBeforeAdopt)
                      setBeforeAdopt(null)
                    }}
                  >
                    {t('元に戻す', 'Undo')}
                  </Button>
                  <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setBeforeAdopt(null)} />
                </div>
              )}
              {curProposal !== null ? (
                // AI の見た目の案: いまの HTML と並べて見比べ、採用するか決める(採用するまで、エディタは変わらない)
                <>
                  <div className={s.editBar}>
                    <span className={mergeClasses(s.grow, s.note)}>{t('AI の見た目の案です。いまの HTML と見比べて、よければ採用します(保存は HTML の「保存」で)。', 'This is the AI layout proposal. Compare it with the current HTML and adopt it if it looks good (save with the HTML Save).')}</span>
                    <Button size="small" onClick={() => setProposal(null)}>{t('やめる', 'Discard')}</Button>
                    <Button
                      size="small"
                      appearance="primary"
                      icon={<CheckmarkRegular />}
                      onClick={() => {
                        setBeforeAdopt({ variant: cur, html: shown })
                        setHtml(curProposal)
                        setHtmlView('made')
                        setProposal(null)
                      }}
                    >
                      {t('採用', 'Adopt')}
                    </Button>
                  </div>
                  <div className={s.compare}>
                    <div className={s.compareCol}>
                      <HtmlPreviewFrame html={shown} title={t('いまの HTML のプレビュー', 'Current HTML preview')} heading={t('いま', 'Now')} />
                    </div>
                    <div className={s.compareCol}>
                      <HtmlPreviewFrame html={curProposal} title={t('AI の案のプレビュー', 'AI proposal preview')} heading={t('AI の案', 'AI proposal')} />
                    </div>
                  </div>
                </>
              ) : previewView === 'compare' ? (
                <div className={s.compare}>
                  <div className={s.compareCol}>
                    <HtmlPreviewFrame html={generated} title={t('企画の見本のプレビュー', 'Plan sample preview')} heading={t('企画の見本', 'Plan sample')} />
                  </div>
                  <div className={s.compareCol}>
                    <HtmlPreviewFrame html={shown} title={t('制作した HTML のプレビュー', 'Production HTML preview')} heading={t('制作した HTML', 'Production HTML')} />
                  </div>
                </div>
              ) : (
                <HtmlPreviewFrame
                  html={previewView === 'plan' ? generated : shown}
                  title={t('HTML のプレビュー', 'HTML preview')}
                  heading={previewView === 'plan' ? t('企画の見本(配信カードのプレビューと同じ見た目)', 'Plan sample (same look as the delivery card preview)') : t('制作した HTML をそのまま描いたもの', 'The production HTML as is')}
                  onFrame={setPreviewFrame}
                />
              )}
              {previewView !== 'compare' && (
                <HtmlPins
                  frame={previewFrame}
                  cardId={card.id}
                  view={pinView(previewView === 'plan' ? 'html-plan' : 'html-made', '', cur)}
                  placing={placingPin}
                  onPlacingEnd={endPlacingPin}
                  onOpenThreads={(noteId) => setPinTarget(noteId ? { noteId } : { pending: true })}
                />
              )}
              {previewView !== 'compare' && pinTarget && (
                <PinFloat
                  cardId={card.id}
                  cardOwner={owner}
                  stage="production"
                  root={() => previewFrame?.contentDocument ?? null}
                  target={pinTarget}
                  productName={(id) => snap.products.find((p) => p.id === id)?.name ?? ''}
                  onTarget={setPinTarget}
                  onClose={() => {
                    forgetLinkedPin()
                    setPinTarget(null)
                  }}
                />
              )}
            </div>

            <Splitter onDrag={talkOpen ? panes.onDrag(2) : () => undefined} onDone={panes.onDone} />

            {/* 4. 企画と制作のやり取り(制作の段階の話)とタスク(たためる) */}
            {talkOpen ? (
              <div className={mergeClasses(s.col, s.colTalk)}>
                <div className={s.paneTool}>
                  <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleTalk} aria-label={t('やり取りをたたむ', 'Collapse the conversation')} />
                </div>
                <TabList size="small" selectedValue={side} onTabSelect={(_, d) => setSide(d.value as 'talk' | 'tasks' | 'assets')}>
                  <Tab value="talk">{t('制作のやり取り', 'Production conversation')}</Tab>
                  <Tab value="assets" icon={<AttachRegular />}>{t('素材', 'Assets')}</Tab>
                  <Tab value="tasks" icon={<TaskListLtrRegular />}>{t('タスク', 'Tasks')}</Tab>
                </TabList>
                {side === 'talk' ? (
                  <CommentsPanel cardId={card.id} stage="production" productIds={snap.productIds} products={snap.products} people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} />
                ) : side === 'assets' ? (
                  // 素材(Creative Assets。X58): 企画側が配信カードで置いたものと同じ。制作側からも足せる
                  <CreativeAssets cardId={card.id} stage="production" owner={card.owner} people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} productIds={snap.productIds} products={snap.products} />
                ) : (
                  <TasksPanel cardId={card.id} productionOwner={owner} productionDue={due} onOpenSource={() => setSide('talk')} onChanged={() => undefined} />
                )}
              </div>
            ) : (
              rail(t('やり取り', 'Conversation'), toggleTalk)
            )}

            {/* HTML の下書きを作るためだけの、見えないプレビュー(写しの中身をそのまま描く) */}
            <div className={s.offscreen} aria-hidden>
              {keys.map((k) => {
                const vs = snapshotOf(snap, k)
                return (
                  <div
                    key={k}
                    ref={(el) => {
                      offscreenRefs.current[k] = el
                    }}
                  >
                    <CardPreview card={{ ...card, ...vs.card } as DeliveryCard} productIds={vs.productIds} products={vs.products} heroes={vs.hero ? [vs.hero] : []} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {finishedOpen && live && (
          <FinishedFloat card={card} request={live} people={people} productIds={snap.productIds} products={snap.products} onClose={() => setFinishedOpen(false)} />
        )}
        {/* 制作した HTML を貼り付けて置き換える(X58) */}
        {pasting !== null && (
          <Dialog open onOpenChange={(_, d) => !d.open && setPasting(null)}>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>{t('制作した HTML を貼り付ける', 'Paste the production HTML')}</DialogTitle>
                <DialogContent>
                  <Textarea className={s.pasteBox} value={pasting} onChange={(_, d) => setPasting(d.value)} placeholder={t('ここに HTML を貼り付けます(<html> から </html> まで、まるごと)', 'Paste the whole HTML here (from <html> to </html>)')} />
                  <span className={s.note}>{t('いまの HTML と置き換わります。保存するまでは、この版には残りません。', 'This replaces the current HTML. It is not kept in this version until you save.')}</span>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setPasting(null)}>{t('やめる', 'Cancel')}</Button>
                  <Button
                    appearance="primary"
                    disabled={!pasting.trim()}
                    onClick={() => {
                      setHtml(pasting)
                      setHtmlView('made')
                      setPreviewView('compare')
                      setPasting(null)
                    }}
                  >
                    {t('置き換えて、並べて比べる', 'Replace and compare')}
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        )}
      </ResizableSurface>
    </Dialog>
  )
}
