import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { filled } from '../slots'
import { Button, InfoLabel, Tab, TabList, ToggleButton, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, BoxMultipleArrowRightRegular, ImageMultipleRegular, LinkMultipleRegular, CheckmarkRegular, ErrorCircleRegular, ColumnTripleRegular, CommentRegular, SettingsRegular, ChevronRightRegular, HistoryRegular, LightbulbRegular, WarningRegular, LayoutColumnTwoRegular, PersonAvailableRegular, SaveRegular } from '@fluentui/react-icons'
import { AiIcon } from '../AiMark'
import { ProductInfoPane } from '../ProductInfoPane'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { SideRail, type RailItem } from './SideRail'
import { useStableCallback } from '../useStableCallback'
import { PreviewPins } from '../PreviewPins'
import { pinView } from '../pinStore'
import { CommPane, type CommCounts, type CommSection } from './CommPane'
import { CardAlertsBar } from '../CardAlertsBar'
import { Hint } from '../Hint'
import { PinFloat } from '../PinFloat'
import { focusSoon, type ContextItem } from '../ContextMenu'
import { previewMenuItems } from '../previewMenu'
import { CopyLinkButton } from '../CopyLinkButton'
import { neighborItem, type MoveDir } from './gridMove'
import { usePreviewPins } from '../usePreviewPins'
import { heroImage } from '../images'
import { productUrl } from '../links'
import { MoreHorizontalRegular, ArrowSwapRegular, DeleteRegular } from '@fluentui/react-icons'
import { Row, productMeta } from '../ProductRow'
import { ALERT_COLOR } from '../alertColors'
import { productImage } from '../images'
import { locale, useT } from '../i18n'
import { audienceSet } from '../target'
import { getTemplate, sectionsOf, slotsOf } from '../templates'
import { statusRank } from '../status'
import { ReadinessList } from './ReadinessList'
import { ApprovalBar } from '../ApprovalBar'
import { readinessIssues, readinessOf, type ReadinessTarget } from './readiness'
import { NextAction } from './NextAction'
import { myNextStep, type NextStep } from './nextStep'
import { ApprovalChip } from './ApprovalBadge'
import { PartPane } from './PartPane'
import { ProductSwap, type SwapAt } from './ProductSwap'
import { useFloatSwap } from './floatSwap'
import { placeInPart } from './actions'
import { partFromElement, partKey, partOfAnchor, samePart, type PartRef } from './parts'
import { PreviewFrame, StageFrame, StagePane, StagePanes } from './StageFrame'
import { useStageLayout } from './stageLayout'
import { DeliveryMetaBand } from './DeliveryMetaBand'
import { HandoffSheet } from './HandoffSheet'
import { LinksPanel } from './LinksPanel'
import { CreativeAssets } from '../CreativeAssets'
import { addDroppedAssets, canDropAsset } from './assetDrop'
import { myName, onMeChange } from '../history'
import { CardAssetsService } from '../data/cardAssets'
import { PreviewMarks, type Mark } from './PreviewMarks'
import { SectionGlowLayer } from './SectionGlowLayer'
import { SectionTagLayer } from './SectionTagLayer'
import type { SimpleEditor } from './editor'
import type { PartTurn } from './partAi'
import { InboxLines, type InboxPart } from './InboxLines'
import { confirmDialog } from '../confirm'
import { PaneRail } from '../PaneRail'
import { typo } from '../typo'
import { hasPendingTrial, settlePendingTrial } from '../trial'
import { tapComplete } from '../pushLink'
import { useFeature, isOn as featureOn } from '../featureFlags'
import { FeatureBadge } from '../FeatureBadge'

// 左のバーと、開くパネル(SU4。2026-10-24 利用者と決めた。以前は右端にあり、気づかれなかった)。
// 配信の全体にかかわる情報とメニュー(やり取り・承認の様子・素材・渡すもの・変更の記録)をここにまとめ、真ん中は作業する場所にする。
// VS Code の左のアイコンの並びと同じく、押したものを 1 つだけ開き、同じものをもう一度押すと閉じる。幅は人ごとに覚える。
// 配信カードを開いたときは、アラートがあれば「アラート」を開き、なければ何も開かない(直さないといけないものを最初に見せる。2026-10-29 利用者。
// 以前は最後に開いていたものを覚えて開いていたが、承認を開いたまま次のカードを開くと承認から始まっていた)
type Side = CommSection | 'alerts' | 'learn' | 'links' | 'assets' | 'handoff' | null
const isComm = (v: Side): v is CommSection => v === 'talk' || v === 'approval' || v === 'history'
const useStyles = makeStyles({
  topField: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    padding: '2px 8px',
    border: '1px solid transparent',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2 },
  },
  on: { backgroundColor: tokens.colorBrandBackground2, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  grow: { flexGrow: 1 },
  state: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  reasonPop: { display: 'grid', rowGap: '8px', width: '320px' },
  // 配信の情報の帯の包み(受信箱の行(InboxLines)と同じ間隔)
  inboxWrap: { display: 'grid', rowGap: '2px', minWidth: 0 },
  commPane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, backgroundColor: tokens.colorNeutralBackground1 },
  // 押せる所は 24px(見える点は 10px のまま。WCAG 2.5.8。レビューの 13)。点の色は --dot
  railDot: {
    width: '24px',
    height: '24px',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    '::before': { content: '""', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--dot)' },
  },
  listHead: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '-6px' },
  colTitle: { ...typo.heading, marginBottom: '10px' },
  dropNote: { fontSize: '16px' },
  candHead: { marginTop: '16px', paddingBottom: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  // 候補の行と、マウスを乗せたときの「⇄ 入れる」(SU9)
  // 「入れる」は、マウスを乗せたとき・フォーカスがあるときだけ見せる(一覧をうるさくしない)
  candList: { display: 'grid', rowGap: '6px', marginTop: '6px' },
  candWrap: { '& [data-row-action]': { visibility: 'hidden' }, ':hover [data-row-action]': { visibility: 'visible' }, ':focus-within [data-row-action]': { visibility: 'visible' } },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 案のタブ(SU2)
  // 上の帯の AB テストの案(SU8)。面のタブのあとに、線で区切って並べる
  abBar: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, flexShrink: 0, paddingLeft: '10px', marginLeft: '2px', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  // キャンペーンの帯の 3 段目に置くとき(帯の中では、左の区切りの線は要らない)
  abBarInBand: { paddingLeft: 0, marginLeft: 0, borderLeft: 'none' },
  abWarn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  abDiff: { boxShadow: `inset 0 -2px 0 ${tokens.colorPaletteDarkOrangeBorder2}` },
})

interface Props {
  editor: SimpleEditor
  /** 開いたとき・前に反映したときから、内容が変わったか(承認の前の確かめ。ref を読むので、まとまりとは別に渡す) */
  isDirty: () => boolean
  /** プレビューの枠(CardDetail の倍率の計算が測る箱) */
  boxRef: RefObject<HTMLDivElement | null>
  /** 別の部品を選んだときの反映(変わっていなければ何もしない。確定した週の配信は反映しない) */
  onCommit: () => Promise<void>
  /** 反映のボタン(確定した週の配信は、理由の入力欄を出す) */
  onApply: () => void
  onUndo: () => void
  onRunNext: (step: NextStep) => void
  onClose: () => void
}

/** 配信の情報の部品(プレビューの上の帯。右のペインは配信の情報。focus に当たる欄はないので、最初の欄に入る) */
const META_PART: PartRef = { kind: 'meta', field: 'info' }

/**
 * シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。プレビューが主役で、部品を押すと、その部品だけを直すペインが出る。
 * 状態と保存は CardDetail のもの(editor)をそのまま使う。ここは並べ方と、部品の選び方・反映の時機だけを持つ
 */
export function SimpleCardLayout({ editor: e, boxRef, isDirty, onCommit, onApply, onUndo, onRunNext, onClose }: Props) {
  const t = useT()
  const s = useStyles()
  // 商品の引き当ては、1 つの表で(打つたびの描き直しで、一覧を何度も端から探さないように)
  const productById = useMemo(() => new Map(e.products.map((p) => [p.id, p])), [e.products])
  const [part, setPart] = useState<PartRef | null>(null)
  // 商品の一覧で押した商品(選んでいる枠と見比べる)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  // 部品ごとの AI とのやり取り(開いている間だけ)
  const [chats, setChats] = useState<Record<string, PartTurn[]>>({})
  const setChat = (key: string, f: (prev: PartTurn[]) => PartTurn[]) => setChats((c) => ({ ...c, [key]: f(c[key] ?? []) }))
  // 「A と違う」の目印(B・C 案を直しているとき)
  const diffMarks: Mark[] = e.abDiffParts.map((part) => ({ part, color: tokens.colorPaletteDarkOrangeBackground3, label: t('A と違う', 'Differs from A') }))
  // 右端の商品情報は、配信カードを開いたときは閉じた状態から(プレビューを広く見せる。2026-10-29 利用者)
  const [productsOpen, setProductsOpen] = useState(false)
  // 自動で畳んだ商品の一覧を、人が開き直した(幅が足りるようになるまで、自動では畳まない)
  const [insist, setInsist] = useState(false)
  const [abSettingsOpen, setAbSettingsOpen] = useState(false)
  // 案を足す入口は、AB テストか案から選ぶのどちらかを公開しているときだけ(X87)。すでに案のある配信は、タブ・設定をそのまま出す(データは消さない)
  const alertOn = useFeature('alert')
  const learnOn = useFeature('results.learnings')
  const learnAiOn = useFeature('ai.learnings')
  const threadOn = useFeature('collab.thread')
  const pinsOn = useFeature('collab.pins')
  const approvalOn = useFeature('approval.card')
  const assetsOn = useFeature('collab.assets')
  const handoffOn = useFeature('prod.handoff')
  const historyOn = useFeature('card.history')
  const linksOn = useFeature('content.links.list')
  const abTestOn = useFeature('card.abtest')
  const variantsOn = useFeature('card.variants')
  const abOn = abTestOn || variantsOn
  const abAiOn = useFeature('ai.abvariant')
  // 商品の入れ替えの引き出しを開いている所(SU9)。入口(プレビューの ⇄・右クリック・選んだ部品のペイン・真ん中の行・右の行・商品のフロート)は違っても、引き出しは 1 つ
  const [swapAt, setSwapAt] = useState<SwapAt | null>(null)

  /** 部品を選ぶ。別の部品に移るときに、それまでの変更を反映(保存)する(SU1 ⑫) */
  const select = (p: PartRef | null) => {
    if (samePart(p, part)) return
    // 試している候補があれば、確定するかを 1 回だけ聞いてから移る(試す → 確定)
    if (hasPendingTrial()) {
      void settlePendingTrial().then(() => selectRef.current(p))
      return
    }
    void onCommit()
    setPart(p)
    setCompareKey(null)
    // 部品を移ったら、開いていた入れ替えの引き出しは閉じる(戻ったときに勝手に開いていないように)
    setSwapAt(null)
  }
  // 部品を選ぶ層には、変わらない関数を渡す(押すたびに、いまの値で select を呼ぶ)
  const selectRef = useRef(select)
  useEffect(() => {
    selectRef.current = select
  })
  const onPick = useCallback((p: PartRef | null) => selectRef.current(p), [])
  /** その商品を選び、選んだ部品のペインの箱の真下の引き出しを開く(プレビューの ⇄・右クリック・商品のフロートから) */
  const openSwap = (itemKey: string) => {
    select({ kind: 'product', itemKey })
    setImageAt(null)
    setSwapAt({ itemKey, at: 'pane' })
  }
  // 「画像を替える」の引き出しを開いている商品の枠(部品のペイン。右クリックの「この商品の画像を替える」からも開く)
  const [imageAt, setImageAt] = useState<string | null>(null)
  const openImage = (itemKey: string) => {
    select({ kind: 'product', itemKey })
    setSwapAt(null)
    setImageAt(itemKey)
  }
  const openSwapRef = useRef(openSwap)
  useEffect(() => {
    openSwapRef.current = openSwap
  })
  const onSwapBadge = useCallback((itemKey: string) => openSwapRef.current(itemKey), [])
  /** 商品を外す(プレビューの ×・右クリック・Delete)。枠は空き枠になる。元に戻すで戻せる */
  const removeProduct = (itemKey: string) => {
    e.removeItem(itemKey)
    if (part?.kind === 'product' && part.itemKey === itemKey) select(null)
  }
  /** 商品を、見たままの向きの隣の商品と入れ替える(Alt + 矢印・右クリック)。選んでいる枠は、その商品についていく */
  const moveProduct = (itemKey: string, dir: MoveDir) => {
    const box = boxRef.current
    const to = box ? neighborItem(box, itemKey, dir) : null
    if (to) e.swapItems(itemKey, to)
  }
  const productOpsRef = useRef({ removeProduct, moveProduct })
  useEffect(() => {
    productOpsRef.current = { removeProduct, moveProduct }
  })
  const onRemoveBadge = useCallback((itemKey: string) => productOpsRef.current.removeProduct(itemKey), [])
  const onMoveKey = useCallback((itemKey: string, dir: MoveDir) => productOpsRef.current.moveProduct(itemKey, dir), [])
  /** 入れ替えたあと。候補と入れ替えると行の鍵が変わるので、その商品を選んだままにする(select を通すと、入れ替える前の中身で保存してしまう) */
  const swapped = (from: string, to: string) => {
    setSwapAt(null)
    if (from !== to && part?.kind === 'product' && part.itemKey === from) setPart({ kind: 'product', itemKey: to })
  }
  // 商品のフロートの「入れ替える」で、フロートの中に出す引き出し(どの入口でも同じ ProductSwap)
  const swapInFloat = useFloatSwap({ editor: e, chats, setChat, onSwapped: swapped })

  // まだ保存していない案(e.unsaved)は、配信カードの ID を使うパネル(やり取り・承認・素材・渡すもの・履歴・学び)を出さない。開けるのはアラートだけ
  const [side, setSide] = useState<Side>(null)
  // 開いたときの左のペインは、載せた商品まで読み終わってから決める(アラートの数は商品で決まるので、読む前に決めると一瞬開いて閉じる)。
  // きょうだいの配信カードに切り替えたとき(この画面は作り直されない)も、開いたときと同じ始まり方にする
  const [decided, setDecided] = useState<string | null>(null)
  // 開いた直後は、載せた商品を読み終わって左のペインを決めるまで、上の帯より下を見せない(見えないまま並べておく)。
  // 読む前の空の枠を描いてから、商品が入り、アラートの欄が開いてプレビューが動く、のがチラついて見えた(2026-10-30 利用者)。
  // きょうだいの切り替えのときは、これまでどおり(前の中身を出したまま入れ替える)
  const [ready, setReady] = useState(false)
  if (decided !== e.card.id && e.loaded) {
    setDecided(e.card.id)
    setReady(true)
    setSide(alertOn && e.alerts.length > 0 ? 'alerts' : null)
    setProductsOpen(false)
  }
  /** サイドパネルを開く(open: 必ず開く。省略は、開いている方を押したら閉じる) */
  const showSide = (v: Exclude<Side, null>, open = false) => {
    const next = !open && side === v ? null : v
    setSide(next)
    if (isComm(next)) setCommSection(next)
    if (next) setLastSide(next)
    if (next !== side) {
      setMoving(true)
      window.setTimeout(() => setMoving(false), 260)
    }
  }
  // 送る前の確かめ(承認を依頼する・制作に渡す の前の一覧。中身は readiness.ts。2026-10-25 利用者と決めた)
  const checkInput = {
    channel: e.channel,
    subject: e.form.subject,
    name: e.form.name,
    preheader: e.form.preheader,
    pushTitle: e.form.pushTitle,
    pushBody: e.form.pushBody,
    pushTapDone: tapComplete(e.pushLink),
    audienceSet: audienceSet(e.audience, e.channel),
    headline: e.form.headline,
    copy: e.form.copy,
    hasHero: !!e.hero,
    items: e.items,
    slots: slotsOf(e.template),
    alerts: e.alerts,
    status: e.form.status,
    productionOwner: e.form.productionOwner,
    productionDue: e.form.productionDue,
  }
  const approvalChecks = readinessOf({ ...checkInput, purpose: 'approval' })
  const handoffChecks = readinessOf({ ...checkInput, purpose: 'handoff' })
  // 行を押したら、その部品を選ぶ。アラート・承認はそのパネル、担当・締め切りは渡すもの(欄へは HandoffSheet が動く)
  // 担当・締め切りの行は、渡すものを開いて、その欄へ入る(制作の担当・締め切りは渡すものだけで決める。2026-10-27 利用者の決め)
  const [handoffFocus, setHandoffFocus] = useState<{ field: 'productionOwner' | 'productionDue'; seq: number } | null>(null)
  const pickCheck = (target: ReadinessTarget) => {
    if (target.kind === 'panel') showSide(target.panel, true)
    else if (target.kind === 'handoffField') {
      showSide('handoff', true)
      setHandoffFocus((f) => ({ field: target.field, seq: (f?.seq ?? 0) + 1 }))
    } else select(target)
  }
  // しまっている間も、最後に開いたパネルの中身を描いておく(しまう動きの間に、中身が先に消えないように)
  const [lastSide, setLastSide] = useState<Exclude<Side, null>>('alerts')
  const panel = side ?? lastSide
  const [moving, setMoving] = useState(false)
  // 列の幅と、狭いときの割り振り(面の枠。幅は面で 1 つの鍵で覚える)。アプリの配信は、スマホの幅
  const layout = useStageLayout({ device: e.channel === 'email' && e.device === 'pc' ? 'pc' : 'mobile', side: isComm(side) ? 'comm' : side ? 'hand' : null, list: { open: productsOpen, insist } })
  const fit = layout.fit
  // 幅が足りるようになったら、「開き直した」は忘れる(次に狭くなったら、また自動で畳む)。描くときに直す(effect で直すと、1 回余計に描くため)
  if (insist && layout.fitsWithList) setInsist(false)
  // やり取りの部品は、閉じていても描いておき、バーの数と点を合わせる。最後に開いた見方を覚える(書きかけの文を、見方の間で共にするため 1 つの部品)
  const [commSection, setCommSection] = useState<CommSection>('talk')
  const [counts, setCounts] = useState<CommCounts>({ open: 0, tasks: 0, mine: false, myTurn: false, waiting: false, changesRequested: false, reviewers: 0, approved: 0, pendingNames: [], changeReason: '', changes: 0 })
  // 開け閉めは人に任せる(自動では開かない。自分宛てがあれば、バーのアイコンの赤い点で知らせる。2026-10-23 利用者)
  const onCounts = useCallback((c: CommCounts) => setCounts(c), [])
  // 右上の Popover で承認の依頼・承認・差し戻しをしたら、左のパネル(やり取り・承認の様子)も読み直す
  const [approvalTick, setApprovalTick] = useState(0)
  // 右上の青いボタンは、自分がやることがあるときだけ(SU11)。作った人 = 担当。担当が空か、自分の名前を決めていないときは、作った人とみなす(だれも出せなくならないように)
  const meName = useSyncExternalStore(onMeChange, myName)
  const author = !e.form.owner || !meName || e.form.owner === meName
  const myStep = myNextStep(e.nextStep, { author, myTurn: counts.myTurn, changesRequested: counts.changesRequested })
  // 左のバーの「渡すもの」に、画像・資料・URL を落として、参考の素材に入れる(列を開かずに書き留めるため)
  const [assetsVersion, setAssetsVersion] = useState(0)
  const [dropOver, setDropOver] = useState<'assets' | 'handoff' | null>(null)
  const [dropNote, setDropNote] = useState<{ ok: boolean; text: string } | null>(null)
  const dropAssets = async (dt: DataTransfer) => {
    setDropOver(null)
    try {
      const r = await addDroppedAssets(e.card.id, myName() || e.form.owner || '', dt)
      setDropNote(r.error ? { ok: false, text: r.error } : { ok: true, text: t(`${r.added} 件を参考の素材に入れました`, `Added ${r.added} to reference assets`) })
      if (r.added > 0) setAssetsVersion((v) => v + 1)
    } catch (err) {
      setDropNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
    window.setTimeout(() => setDropNote(null), 4000)
  }
  // 帯に出す、参考の素材の数(帯の数を合わせるため、開いていなくても数える)
  const [assetCount, setAssetCount] = useState(0)
  useEffect(() => {
    if (e.unsaved) return
    let alive = true
    void CardAssetsService.getAll({ filter: `delivery_card_id eq ${e.card.id}` }).then((r) => {
      if (alive && r.success) setAssetCount((r.data ?? []).length)
    })
    return () => {
      alive = false
    }
  }, [e.card.id, e.unsaved, side, assetsVersion])
  // 渡す前に、制作の担当か締め切りが空いている(帯の「渡すもの」に点を付ける。渡す準備ができていないことに気づけるように)
  const handoffMissing = !e.form.handedOffAt && (!e.form.productionOwner.trim() || !e.form.productionDue)
  // プレビューの場所を押してコメントを書く(PreviewPins の覆い)。打ったピン・押したピンは、その横のフロート(PinFloat)で書く・読む・返す。
  // 右の帯のやり取りは開かない(2026-10-23 利用者: ほとんどのコメントはピン経由なので、ピンだけで進められるように)
  const { placing, setPlacing, endPlacing, target: pinTarget, setTarget: setPinTarget, openThreads, close: closePin } = usePreviewPins()
  // 右クリックの「画像を入れ替える」(メイン画像のペインの「入れ替える」を開く)
  const [heroReplace, setHeroReplace] = useState(0)
  /**
   * プレビューの右クリックの項目(「ここにピンを打つ」のあと)。押した所の部品について、部品のペイン・商品のフロートのボタンと同じ処理を呼ぶ。
   * 反映中は、中身を変える項目を押せなくする(ボタンと同じ)
   */
  const previewMenu = (under: Element): ContextItem[] => {
    const root = boxRef.current
    const p = root ? partFromElement(under, root) : null
    if (!p) return []
    const it = p.kind === 'product' ? e.items.find((i) => i.key === p.itemKey) : undefined
    return previewMenuItems({
      // ボタンと同じく、反映中だけ押せなくする
      busy: e.saving,
      edit: () => select(p),
      ai:
        p.kind !== 'slot'
          ? () => {
              select(p)
              focusSoon('[data-part-ai-input]')
            }
          : undefined,
      product:
        p.kind === 'product'
          ? {
              swapLabel: t('入れ替える', 'Replace'),
              url: productUrl(productById.get(it?.productId ?? '')),
              swap: () => openSwap(p.itemKey),
              // プレビューの × と同じ
              remove: () => removeProduct(p.itemKey),
              // 画像を替える(部品のペインの「画像を替える」の引き出しを開く。メイン画像の「画像を入れ替える」と同じ形。2026-10-30 利用者)
              image: featureOn('content.products.pageimage') ? () => openImage(p.itemKey) : undefined,
              // 枠の見せ方「詳しく」(X80)。詳しくにしたら、見出し・説明文を書けるように部品のペインを開く
              detail: it
                ? {
                    on: !!it.detail,
                    toggle: () => {
                      e.setItemDetail(p.itemKey, it.detail ? null : { title: '', body: '' })
                      if (!it.detail) select(p)
                    },
                  }
                : undefined,
              move: (() => {
                const box = boxRef.current
                const at = (d: MoveDir) => (box && neighborItem(box, p.itemKey, d) ? () => moveProduct(p.itemKey, d) : undefined)
                return { up: at('up'), down: at('down'), left: at('left'), right: at('right') }
              })(),
            }
          : undefined,
      hero:
        p.kind === 'hero'
          ? {
              src: heroImage(e.hero),
              replace: () => {
                select(p)
                setHeroReplace((n) => n + 1)
              },
            }
          : undefined,
    })
  }
  const toggleProducts = () => {
    // 自動で畳んでいるときは、覚えている開閉(開く)はそのままで、開き直す
    if (fit.auto) {
      setInsist(true)
      return
    }
    setInsist(false)
    setProductsOpen(!productsOpen)
  }

  /**
   * 押した商品を、選んでいる枠に置く。選んでいるのは「枠」なので、置いたあとも同じ枠(いまはその商品)を選んだままにする。
   * 反映は、次に別の部品を選んだとき(ここで select を通すと、置く前の中身で保存してしまうため)
   */
  const placed = (target: PartRef, key: string) => {
    placeInPart(e, target, key)
    if (target.kind === 'product') setPart({ kind: 'product', itemKey: key })
    setCompareKey(null)
  }

  /** 商品の一覧の行を押したとき: 枠を選んでいれば見比べ、そうでなければ今と同じ商品のフロート */
  const openFromList = (key: string) => {
    const target = part && (part.kind === 'product' || part.kind === 'slot') && !(part.kind === 'product' && part.itemKey === key) ? part : null
    if (!target) {
      // 載せている商品なら、フロートの「入れ替える」で同じ引き出しを開く(SU9 (h))
      e.openProduct(key, undefined, e.items.some((i) => i.key === key) ? swapInFloat(key) : undefined)
      return
    }
    setCompareKey(key)
    e.openProduct(key, {
      label: target.kind === 'product' ? t('この枠の商品と入れ替える', 'Replace with the product in this slot') : t('この枠に入れる', 'Put in this slot'),
      run: () => placed(target, key),
    })
  }

  const isOn = (p: PartRef) => samePart(p, part)
  // 配信の情報の帯は、どの欄から入っても(帯・送る前の確かめの送る相手の行)選んだ印にする
  const metaOn = part?.kind === 'meta'
  const tpl = getTemplate(e.template)
  // 配信の情報の帯の 1 行(例「配信 10/3(土) 09:00  国 US  対象 女性・30代  送る相手 会員だけ」)。ラベルと値の組で並べる(LabeledValue)。送る相手はメールでもアプリでも
  // 配信の情報の帯は 1 行(2026-10-28 利用者: 対象・送る相手は、押すと開く右のペインの配信の情報で見る。中身が重なっていたため)
  const when = e.form.scheduledAt ? new Date(e.form.scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : t('配信日時(未設定)', 'No send date')

  const sideTitle = (v: Exclude<Side, null>) =>
    ({ alerts: t('この配信のアラート', 'Alerts for this delivery'), learn: t('この配信に使う学び', 'Learnings for this delivery'), links: t('この配信のリンク', 'Links in this delivery'), talk: t('やり取り(承認者と)', 'Conversation'), approval: t('承認の様子', 'Approval'), history: t('変更の履歴', 'Change history'), assets: t('素材', 'Assets'), handoff: t('渡すもの(制作へ)', 'Handoff (to production)') })[v]
  /** 左のバーの並び(アイコンの下に名前(English も 48px に収まる短い言葉)。数は数の丸、気づいてほしいことは点。drop: 画像・URL を落として素材に入れられる。gap: この上に線) */
  const allRails: RailItem<Exclude<Side, null>>[] = [
    // アラート = 直さないといけないもの(赤い数の丸。0 件なら出さない)、学び = 参考にするもの(灰色の数の丸)。性質が違うので、別のアイコンにする(SU6)
    { v: 'alerts', icon: <WarningRegular />, label: t('アラート', 'Alerts'), tip: t('アラート(在庫切れ・在庫が少ない・方針・日程など、直さないといけないもの)', 'Alerts (out of stock, low stock, policy, dates: things to fix)'), count: e.alerts.length, color: 'danger' },
    { v: 'learn', icon: <LightbulbRegular />, label: t('学び', 'Learn'), tip: learnAiOn ? t('この配信に使う学び(過去の配信の「次に生かすメモ」。参考にするもの。AI の下書きにも渡す)', 'Learnings for this delivery (notes from past deliveries, for reference; also passed to AI drafts)') : t('この配信に使う学び(過去の配信の「次に生かすメモ」。参考にするもの)', 'Learnings for this delivery (notes from past deliveries, for reference)'), count: e.learnCount, color: 'informative' },
    // リンク = 配信の全部のリンクを一度に見る・まとめて直す(G1・G2)。部品ごとに開かなくても、リンク先の入れ忘れ・まちがいに気づけるように
    { v: 'links', icon: <LinkMultipleRegular />, label: t('リンク', 'Links'), tip: t('この配信のリンク(全部を一度に見て、まとめて直す)', 'Links in this delivery (see all at once and edit together)'), count: 0, feature: 'content.links.list' },
    { v: 'talk', gap: true, icon: <CommentRegular />, label: t('やり取り', 'Chat'), tip: t('やり取り(承認者と。書き込み・タスク)', 'Conversation (with approvers: comments and tasks)'), count: counts.open + counts.tasks, dot: counts.mine ? 'red' : undefined },
    {
      v: 'approval',
      icon: <PersonAvailableRegular />,
      label: t('承認', 'Approval'),
      tip: counts.myTurn ? t('承認の様子。あなたが承認する番です', 'Approval. It is your turn to review') : t('承認の様子(依頼・取り下げ・相手ごとの状態)', 'Approval (request, withdraw, reviewers)'),
      count: 0,
      dot: counts.myTurn ? 'red' : counts.waiting ? 'amber' : undefined,
    },
    { v: 'assets', icon: <ImageMultipleRegular />, label: t('素材', 'Assets'), tip: t('素材(承認のときのイメージにも、制作の参考にも。画像・資料・URL を落としても足せる)', 'Assets (images, files and URLs for approvers and production; drop to add)'), count: assetCount, drop: true },
    {
      v: 'handoff',
      icon: <BoxMultipleArrowRightRegular />,
      label: t('渡すもの', 'Handoff'),
      tip: handoffMissing ? t('渡すもの(制作へ)。制作の担当か締め切りが、まだ空いています', 'Handoff (to production). Assignee or due date is still empty') : t('渡すもの(制作へ。文章・参考の画像と URL・担当と締め切り)', 'Handoff (to production: notes, reference images and URLs, assignee and due date)'),
      count: 0,
      dot: handoffMissing ? 'amber' : undefined,
      drop: true,
    },
    { v: 'history', icon: <HistoryRegular />, label: t('履歴', 'History'), tip: t('変更の履歴(入れ替えの理由・ステータスの変化)', 'Change history (replacement reasons, status changes)'), count: 0, gap: true },
  ]
  // 公開していない機能のパネルは、左のバーに出さない(X87)
  const railOn: Record<Exclude<Side, null>, boolean> = { alerts: alertOn, learn: learnOn, talk: threadOn, approval: approvalOn, links: linksOn, assets: assetsOn, handoff: handoffOn, history: historyOn }
  // リンクは配信カードの ID を使わないので、まだ保存していない案でも開ける
  const rails = (e.unsaved ? allRails.filter((r) => r.v === 'alerts' || r.v === 'links') : allRails).filter((r) => railOn[r.v])

  /**
   * AB テストの案(SU8。2026-10-24 利用者と決めた)。AB に分けるのは配信の大前提で、プレビュー(1 つの案)の話ではないので、上の帯に置く。
   * 案が 1 つのときは「＋ AB テストの案を足す」だけ、2 つ以上のときは「案 A | 案 B」のタブ(押すと、プレビューと中身がその案になる)。
   * アイコンに頼らず文字で書き、何をするものかは ⓘ(InfoLabel)に
   */
  const addVariantItems = (
    <>
      {(e.ab?.keys ?? ['A']).map((k) => (
        <MenuItem key={k} onClick={() => (void onCommit(), e.abAdd(k))}>
          {t(`案 ${k} を写して直す`, `Copy variant ${k} and edit`)}
        </MenuItem>
      ))}
      {abAiOn && (
        <MenuItem icon={<AiIcon size={16} />} onClick={() => (void onCommit(), e.abAdd('ai'))}>
          {t('AI で別の案を作る', 'Let AI make another variant')}
          <FeatureBadge id="ai.abvariant" />
        </MenuItem>
      )}
    </>
  )
  const addVariantMenu = (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} disabled={e.saving || e.ab?.busy}>
          {e.ab ? t('案を足す', 'Add a variant') : t('AB テストの案を足す', 'Add an A/B test variant')}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>{addVariantItems}</MenuList>
      </MenuPopover>
    </Menu>
  )
  const abBar = (
    <div className={mergeClasses(s.abBar, e.campaignBand && s.abBarInBand)}>
      {/* キャンペーンの帯の中で、AB テストをしていないときは、ⓘ だけが残らないように出さない(段の名前「案」がある) */}
      {(!e.campaignBand || e.ab) && <InfoLabel
        size="small"
        info={t('同じ配信を、見出しや画像を変えて複数作り、どれがよいかを比べます。タブを押すと、プレビューと中身がその案に切り替わります', 'Make several versions of the same delivery with different headlines or images, and compare which works better. Pick a tab to switch the preview and content to that variant.')}
      >
        {e.ab ? t('AB テスト', 'A/B test') : ''}
      </InfoLabel>}
      {e.ab && (
        <TabList size="small" selectedValue={e.ab.active} onTabSelect={(_, d) => d.value !== e.ab?.active && (void onCommit(), e.abSwitch(d.value as typeof e.ab.active))}>
          {e.ab.keys.map((k) => (
            <Tab key={k} value={k}>
              {t(`案 ${k}`, `Variant ${k}`)}
            </Tab>
          ))}
        </TabList>
      )}
      {/* 案から選んだあと: どの案に決めたかと、配信しなかった案を並べて見る入口(詳しい画面の AbDecidedBar と同じもの。X81 の 6) */}
      {!e.ab && e.abDecided && (
        <Button type="button" size="small" appearance="subtle" icon={<ColumnTripleRegular />} onClick={e.abViewDecided} title={t('配信しなかった案も、中身を残してあります', 'The variants not sent are kept for reference')}>
          {t(`${e.abDecided} 案に決めた · 並べて見る`, `Went with variant ${e.abDecided} · Compare`)}
        </Button>
      )}
      {abOn && (!e.ab || e.ab.canAdd) && addVariantMenu}
      {e.ab && (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button type="button" size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('AB テストの操作', 'A/B test actions')} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<ColumnTripleRegular />} onClick={e.abCompare}>
                {t('案を並べて比べる', 'Compare variants side by side')}
              </MenuItem>
              <MenuItem icon={<SettingsRegular />} onClick={() => setAbSettingsOpen(true)}>
                {t('テストの設定', 'Test settings')}
              </MenuItem>
              {e.ab.active !== 'A' && (
                <MenuItem icon={<DeleteRegular />} onClick={async () => {
                  if (e.ab && (await confirmDialog(t(`案 ${e.ab.active} を消します(保存で確定)。よろしいですか?`, `Remove variant ${e.ab.active}? (on save)`)))) e.abRemove(e.ab.active)
                }}>
                  {t(`案 ${e.ab.active} を消す`, `Remove variant ${e.ab.active}`)}
                </MenuItem>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
      {/* テストの設定(⋯ から開く。中身は CardDetail の AbSettings) */}
      <Popover open={abSettingsOpen} onOpenChange={(_, d) => setAbSettingsOpen(d.open)} positioning="below-end" withArrow>
        <PopoverTrigger disableButtonEnhancement>
          <span />
        </PopoverTrigger>
        <PopoverSurface>{e.abSettings}</PopoverSurface>
      </Popover>
      {e.ab?.busy && <Spinner size="extra-tiny" label={t('AI が案を作っています', 'AI is drafting')} labelPosition="after" />}
    </div>
  )

  // 選んだ部品のペイン(プレビューで Enter を押したとき、ここの最初の入力欄へ移る)
  const paneRef = useRef<HTMLDivElement>(null)
  const focusPane = () => (paneRef.current?.querySelector<HTMLElement>('textarea, input, select') ?? paneRef.current?.querySelector<HTMLElement>('button'))?.focus()
  // Ctrl + S で保存、Ctrl + Z で元に戻す(入力欄の中の Ctrl + Z は、ふつうの文字の取り消しにする。レビューの 6)
  const applyKey = useStableCallback(onApply)
  const undoKey = useStableCallback(onUndo)
  useEffect(() => {
    const editing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.isComposing) return
      const k = ev.key.toLowerCase()
      if (k === 's') {
        ev.preventDefault()
        applyKey()
      } else if (k === 'z' && !ev.shiftKey && !editing()) {
        ev.preventDefault()
        undoKey()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyKey, undoKey])
  // 受信箱の行に出す文言(AI の案を写している間は、その案。保存する中身は変えない)
  const shown = { ...e.form, ...(e.previewTexts ?? {}) }
  const inboxParts: InboxPart[] = ['subject', 'preheader', 'pushTitle', 'pushBody']
  // 道具の行とプレビューのあいだ: A との違いの知らせ・配信の情報の帯・受信箱での見え方
  const above = (
    <>
      {/* 違いが多いときは知らせる(止めない)。案から選ぶときは、違ってよいので出さない */}
      {e.ab && e.ab.purpose === 'test' && e.ab.active !== 'A' && e.abDiffParts.length >= 3 && (
        <span className={s.abWarn}>{t(`A と違う所が ${e.abDiffParts.length} か所あります。結果の原因を切り分けにくくなります`, `${e.abDiffParts.length} places differ from A. It will be harder to tell what caused the result.`)}</span>
      )}
      {/* テンプレートを替えたうえに、ほかの所も違うときは、数によらず知らせる(SU2 ④。テンプレートの差と中身の差を分けられなくなるため) */}
      {e.ab && e.ab.purpose === 'test' && e.ab.active !== 'A' && e.abDiffParts.length < 3 && e.abDiffParts.length > 1 && e.abDiffParts.some((p) => p.kind === 'template') && (
        <span className={s.abWarn}>{t('テンプレートと、ほかの所も A と違います。結果がテンプレートの差か中身の差か、分けにくくなります', 'Both the template and other parts differ from A. It will be hard to tell which caused the result.')}</span>
      )}
      {/* 配信の情報(配信日時・国・テーマ)。受信者には見えないので、プレビューの枠の外に、薄い灰色の 1 行の帯で置く。押すと右のペインが配信の情報になる(対象・送る相手も、そこで見る) */}
      <div className={s.inboxWrap}>
        <DeliveryMetaBand
          scheduledAt={e.form.scheduledAt}
          country={e.form.country}
          theme={e.form.theme}
          selected={metaOn}
          onClick={() => select(META_PART)}
          // ↓ で、プレビューの最初の部品へ(↑ ↓ の並びの先頭がこの帯。並びはプレビューの部品を選ぶ層が持つので、そこへキーを渡す)
          onKeyDown={(ev) => {
            const box = boxRef.current
            if (ev.key !== 'ArrowDown' || !box) return
            ev.preventDefault()
            box.focus({ preventScroll: true })
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
          }}
          title={t('配信の情報(受信者には見えません)。押すと、対象・送る相手も見て直せます', 'Delivery info (not shown to recipients). Click to see and edit the target and recipients too')}
        />
      </div>
      {/* 受信箱・通知での見え方(SU5)。プレビューに写らない件名・プリヘッダーを、押して直せるように。制作の画面と同じ部品 */}
      <InboxLines
        channel={e.channel}
        country={e.form.country}
        subject={shown.subject}
        preheader={shown.preheader}
        pushTitle={shown.pushTitle}
        pushBody={shown.pushBody}
        subjectFallback={e.form.name}
        selected={inboxParts.find((p) => isOn({ kind: p })) ?? null}
        diff={inboxParts.filter((p) => e.abDiffParts.some((d) => d.kind === p))}
        onSelect={(p) => select({ kind: p })}
        tips={{
          subject: t('件名を直す', 'Edit the subject'),
          preheader: shown.preheader ? t('プリヘッダーを直す', 'Edit the preheader') : t('プリヘッダーが入っていません。押すと入力できます(受信箱で件名の下に出る文)', 'No preheader yet. Click to write it (shown below the subject in the inbox)'),
          pushTitle: t('通知のタイトルを直す', 'Edit the notification title'),
          pushBody: t('通知の本文を直す', 'Edit the notification body'),
        }}
      />
    </>
  )
  // 右端の商品の一覧(畳める)。畳んでいても、商品ごとの点とアラートの色を出す
  const productList = fit.listOpen ? (
    <StagePane>
      <div className={s.listHead}>
        <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleProducts} aria-label={t('商品の一覧を畳む', 'Collapse the product list')} />
      </div>
      <ProductInfoPane
        template={e.template}
        sectionTitles={e.sectionTitles}
        items={e.items}
        products={e.products}
        onHover={e.hoverProduct}
        alertKinds={e.alertKinds}
        onOpenProduct={openFromList}
        hint={t('行を押すと詳細が開きます。行にマウスを乗せると出る ⇄ で入れ替えられます。プレビューで枠を選んでいれば、その枠の商品と見比べて入れ替えられます。', 'Click a row for details. Use the ⇄ that appears on hover to replace it. If a slot is selected in the preview, you can compare and replace it.')}
        // 右の一覧に置くのは入れ替えだけ(並べ替え・外すは真ん中だけ。SU9 (g))
        rowAction={(key) => {
          const on = swapAt?.at === 'info' && swapAt.itemKey === key
          return (
            <Tooltip content={t('入れ替える', 'Replace')} relationship="label">
              <ToggleButton size="small" appearance="subtle" icon={<ArrowSwapRegular />} checked={on} disabled={e.saving} onClick={() => setSwapAt(on ? null : { itemKey: key, at: 'info' })} />
            </Tooltip>
          )
        }}
        rowActionOn={(key) => swapAt?.at === 'info' && swapAt.itemKey === key}
        rowBelow={(key) => (
          <ProductSwap editor={e} itemKey={key} open={swapAt?.at === 'info' && swapAt.itemKey === key} onOpenChange={(o) => setSwapAt(o ? { itemKey: key, at: 'info' } : null)} chats={chats} setChat={setChat} onDone={(k) => swapped(key, k)} trigger={false} />
        )}
      />
      {e.candidates.length > 0 && (
        <>
          <div className={s.candHead}>{t(`候補(${e.candidates.length})`, `Candidates (${e.candidates.length})`)}</div>
          <div className={s.candList}>
          {e.candidates.map((c) => {
            const p = productById.get(c.productId)
            return p ? (
              <Row
                key={c.key}
                dense
                className={s.candWrap}
                image={productImage(p)}
                title={p.name}
                meta={productMeta(p)}
                reason={c.reason}
                onClick={() => openFromList(c.key)}
                actions={
                  // 候補(載せていない商品)は「⇄ 入れる」。どの枠の商品と入れ替えるかを、載せている商品から選ぶ(SU9 (f))
                  filled(e.items).length > 0 && (
                    <span data-row-action>
                        <Menu positioning="below-end">
                          <MenuTrigger disableButtonEnhancement>
                            <Button size="small" appearance="secondary" icon={<ArrowSwapRegular />} disabled={e.saving}>
                              {t('入れる', 'Put in')}
                            </Button>
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              {filled(e.items).map((it, i) => (
                                <MenuItem key={it.key} icon={<ArrowSwapRegular />} onClick={() => e.swapWithCandidate(it.key, c.key, '')}>
                                  {t(`${i + 1}. ${productById.get(it.productId)?.name ?? ''} と入れ替える`, `${i + 1}. Replace ${productById.get(it.productId)?.name ?? ''}`)}
                                </MenuItem>
                              ))}
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                    </span>
                  )
                }
              />
            ) : null
          })}
          </div>
        </>
      )}
    </StagePane>
  ) : (
    <PaneRail label={t('商品の一覧', 'Products')} onOpen={toggleProducts}>
      {filled(e.items).map((it) => {
        const kind = e.alertKinds.get(it.productId)
        const name = productById.get(it.productId)?.name ?? ''
        return (
          // 色だけで知らせないよう、名前にアラートの有無も入れる(読み上げ・ツールチップ)
          <Tooltip key={it.key} content={kind ? t(`${name}(アラートあり)`, `${name} (has an alert)`) : name} relationship="label">
            <button type="button" className={s.railDot} style={{ '--dot': kind ? ALERT_COLOR[kind] : tokens.colorNeutralStroke1 } as React.CSSProperties} onClick={() => select({ kind: 'product', itemKey: it.key })} />
          </Tooltip>
        )
      })}
    </PaneRail>
  )
  return (
    <StageFrame
      // キャンペーンの帯(X79)。親(キャンペーン) › 子(配信) › 孫(AB の案)。承認の帯より上に置く(承認の帯は、ここで選んだ配信の状態なので)
      // AB テストをしていないときは、案の段を出さず、「AB テストを足す」は配信のタブの ＋ のメニューに(2026-10-28 利用者)
      band={e.campaignBand?.({ variants: e.ab || e.abDecided ? abBar : undefined, addVariantItems: e.ab || e.abDecided || e.saving || !abOn ? undefined : addVariantItems })}
      // 上の帯は、制作の画面と同じ部品(StageFrame)。題(チャネル・配信名・日時)とタブの位置は、面を切り替えても動かない(2026-10-30 利用者)
      channel={e.form.channel}
      // キャンペーンに入っている配信の名前は「キャンペーン名 + チャネル」で決まるので、直す入口を出さない。
      // 題の行は表示だけ。直す入口は、プレビューの上の配信の情報の帯 1 つ(内容の変更は、すべてプレビューで選んで右のペインで直す。2026-10-27 利用者の決め)
      name={e.campaignName ?? (e.form.name || t('(配信名未入力)', '(No name)'))}
      when={when}
      // 承認の状態と保存の様子は、タブの右の小さな札と文字に(2026-10-28 利用者: 以前の幅いっぱいの帯をやめ、上を詰める)。札を押すと承認のパネル。
      // 制作の画面では、同じ場所に制作の状態の札(2026-10-30 利用者)
      status={
        <ApprovalChip
          status={e.form.status}
          waiting={counts.waiting}
          changesRequested={counts.changesRequested}
          reviewers={counts.reviewers}
          approved={counts.approved}
          pendingNames={counts.pendingNames}
          changeReason={counts.changeReason}
          dirty={e.revokesApproval}
          onOpen={() => !e.unsaved && showSide('approval', true)}
        />
      }
      save={{ saving: e.saving, unsaved: e.unsaved, dirty: e.dirty, savedAt: e.savedAt, justSaved: e.justSaved }}
      saveProblem={{ conflict: e.saveConflict, error: e.saveError, retry: e.retrySave }}
      lead={
        e.unsaved && (
          // まだ保存していない案は、押したときだけ配信を作る(自動では作らない。作ると、保存した配信として開き直す)
          <Tooltip content={t('この案を配信カードとして保存します。保存するまでは、配信は作られません', 'Save this draft as a delivery card. No delivery is created until you save')} relationship="description">
            <Button type="button" size="small" appearance="primary" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
              {t('この案で作る', 'Create from this draft')}
            </Button>
          </Tooltip>
        )
      }
      undo={e.unsaved ? undefined : { disabled: !e.canUndo || e.saving, onUndo }}
      primary={
        <>
          {/* 保存のボタンは、確定した週の配信だけ(ほかは自動で保存する。理由を入れてから保存する) */}
          {/* 理由の入力は、このボタンの真下に出す(操作を止める確かめなので、小さな Popover。外を押すと、やめる) */}
          {e.locked && (e.dirty || e.reasonOpen) && (
            <Popover open={e.reasonOpen} onOpenChange={(_, d) => !d.open && e.cancelReason()} positioning="below-end" withArrow trapFocus>
              <PopoverTrigger disableButtonEnhancement>
                <Tooltip content={t('確定した週の配信です。変えた理由を入力してから保存します', 'Confirmed week: enter a reason to save')} relationship="description">
                  <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
                    {t('理由を入力して保存', 'Save with a reason')}
                  </Button>
                </Tooltip>
              </PopoverTrigger>
              <PopoverSurface className={s.reasonPop}>{e.reasonForm}</PopoverSurface>
            </Popover>
          )}
          {myStep && !e.unsaved && (
            <NextAction
              step={myStep}
              issues={myStep === 'requestApproval' ? readinessIssues(approvalChecks) : myStep === 'requestProduction' ? readinessIssues(handoffChecks) : 0}
              busy={e.saving}
              // 承認はボタンの真下の Popover でその場で(左のバーの「承認」でも)、制作への依頼は「渡すもの」で行う。制作のページは、CardDetail の側
              onRun={(step) => (step === 'requestProduction' ? showSide('handoff', true) : step === 'requestApproval' || step === 'review' ? showSide('approval', true) : onRunNext(step))}
              // 承認の処理は、パネルと同じ ApprovalBar(見せ方だけ quick)。保存していない変更は、依頼・承認の前に保存する
              renderQuick={
                e.canReview
                  ? (close) => (
                      <ApprovalBar
                        variant="quick"
                        card={e.card}
                        isDirty={isDirty}
                        busy={e.saving}
                        onChanged={async () => {
                          await e.reload()
                          setApprovalTick((n) => n + 1)
                        }}
                        onSave={onCommit}
                        onDone={close}
                        checks={
                          <ReadinessList
                            items={approvalChecks}
                            onPick={(target) => {
                              close()
                              pickCheck(target)
                            }}
                          />
                        }
                      />
                    )
                  : undefined
              }
            />
          )}
        </>
      }
      // この配信カードを開くリンクをコピー(詳しい配信カードにあったもの。2026-10-28 利用者)。まだ保存していない新しいカードには URL がないので出さない
      tools={e.card.id && <CopyLinkButton iconOnly />}
      menu={e.menu}
      // 閉じる ×: キャンペーンの帯があれば、その右の端(CardDetail が入れる)。なければ、この行の右の端
      onClose={e.campaignBand ? undefined : onClose}
      // 面のタブ(PLAN | PRODUCTION | RESULTS)。配信が主役で、面はその見方なので、題名の下に
      tabs={e.stageNav}
      // AB テストの案(SU8)。1 段目に置くと配信名が縮むので、同じ帯の 2 段目、面のタブの右に
      tabsExtra={e.campaignBand ? undefined : abBar}
      notices={e.notices}
    >
      <StagePanes
        layout={layout}
        moving={moving}
        hidden={!ready}
        rail={
          // 左のバー。上から、プロセスの順(承認者とのやり取り → 承認 → 素材 → 制作へ渡すもの)、線の下に記録。数と点で、開かなくても様子が分かる
          <SideRail
            items={rails}
            selected={side}
            onPick={(v) => showSide(v)}
            ariaLabel={t('配信の全体の情報とメニュー', 'Delivery info and menus')}
            drop={{
              over: dropOver,
              onOver: (v, ev) => {
                if (!canDropAsset(ev.dataTransfer)) return
                ev.preventDefault()
                setDropOver(v === 'assets' ? 'assets' : 'handoff')
              },
              onLeave: () => setDropOver(null),
              onDrop: (_, ev) => {
                ev.preventDefault()
                void dropAssets(ev.dataTransfer)
              },
            }}
          >
            {/* 落としたものを入れた・入れられなかったを、バーの下に短く知らせる */}
            {dropNote && (
              <Tooltip content={dropNote.text} relationship="label" positioning="after" visible>
                <span className={s.dropNote} style={{ color: dropNote.ok ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                  {dropNote.ok ? <CheckmarkRegular /> : <ErrorCircleRegular />}
                </span>
              </Tooltip>
            )}
          </SideRail>
        }
        // 開いているパネル(1 つ)。やり取りの部品は、バーの数を合わせるため、いつも描く
        side={{
          open: !!side,
          title: sideTitle(panel),
          onCollapse: () => side && showSide(side),
          children: (
            <>
              {!e.unsaved && (
              <div style={isComm(panel) ? { display: 'grid', minHeight: 0 } : { display: 'none' }}>
                <CommPane
                  section={commSection}
                  card={e.card}
                  part={part}
                  sectionLabel={(i) => sectionsOf(e.template)[i]?.label ?? ''}
                  onPick={select}
                  items={e.items}
                  productName={(id) => productById.get(id)?.name ?? ''}
                  products={e.products}
                  view={pinView(e.channel, e.device, e.ab?.active ?? 'A')}
                  handoff={{ productionOwner: e.form.productionOwner, handedOffAt: e.form.handedOffAt, productionDue: e.form.productionDue }}
                  people={e.people}
                  onCommit={onCommit}
                  isDirty={isDirty}
                  busy={e.saving}
                  onChanged={e.reload}
                  canReview={e.canReview}
                  onOpenProduction={e.openProduction}
                  onCounts={onCounts}
                  refreshKey={approvalTick}
                  // 承認の前だけ(承認が済んだら、確かめは渡すものの側で)
                  checks={statusRank(e.form.status) < statusRank('approved') ? <ReadinessList items={approvalChecks} onPick={pickCheck} /> : undefined}
                />
              </div>
              )}
              {panel === 'alerts' && (
                <div style={{ minHeight: 0, overflowY: 'auto' }}>
                  <CardAlertsBar
                    panel
                    alerts={e.alerts}
                    onAct={e.actAlert}
                    selectedProductId={part?.kind === 'product' ? e.items.find((i) => i.key === part.itemKey)?.productId : undefined}
                    // 押すと、プレビューのその商品を選ぶ(SU6 ③)
                    onSelectProduct={(pid) => {
                      const it = e.items.find((i) => i.productId === pid)
                      if (it) select({ kind: 'product', itemKey: it.key })
                    }}
                  />
                </div>
              )}
              {/* 学びは、閉じていても描く(AI の依頼に学びを渡すのは、この部品の役目のため) */}
              <div style={panel === 'learn' ? { minHeight: 0, overflowY: 'auto' } : { display: 'none' }}>{e.learnings}</div>
              {panel === 'links' && (
                <StagePane>
                  <LinksPanel editor={e} part={part} onPick={select} />
                </StagePane>
              )}
              {panel === 'assets' && (
                // 素材: 承認のときのイメージにも、制作の参考にも使う(渡すものの中の素材と同じもの)
                <StagePane>
                  <Hint hintKey="simpleCard.assets">{t('承認のときのイメージにも、制作の参考にもなる画像・資料・URL。ここに落としても足せます。', 'Images, files and URLs that show the idea to approvers and guide production. Drop them here to add.')}</Hint>
                  <CreativeAssets
                    key={assetsVersion}
                    cardId={e.card.id}
                    stage="plan"
                    title=" "
                    hideCaption
                    compactAdd
                    owner={e.card.owner}
                    people={e.people}
                    cardName={e.form.name}
                    productionOwner={e.form.productionOwner}
                    productionDue={e.form.productionDue}
                    productIds={filled(e.items).map((i) => i.productId)}
                    products={e.products}
                    onCount={setAssetCount}
                  />
                </StagePane>
              )}
              {panel === 'handoff' && (
                // 渡すもの(制作へ)。PLAN の途中で思いついたイメージを書き留め、承認のあと(または前でも)制作に渡す
                <StagePane>
                  <HandoffSheet editor={e} onCommit={onCommit} assetsVersion={assetsVersion} assetCount={assetCount} onAssetCount={setAssetCount} checks={handoffChecks} onPickCheck={pickCheck} focusField={handoffFocus} />
                </StagePane>
              )}
            </>
          ),
        }}
        preview={
          // プレビュー(いちばん広い)
          <PreviewFrame
            boxRef={boxRef}
            zoom={e.zoom}
            keysInfo={t(
              'プレビュー: ↑ ↓ で前・次の部品、Enter で直す欄へ、Esc で選ぶのをやめる、Tab でプレビューの外へ。選んだ商品は Alt + 矢印で上下左右に動かす、Delete で外す。Ctrl + S で保存、Ctrl + Z で元に戻す(入力欄の外で)。Ctrl + ホイールで拡大・縮小、スペースを押しながらつかんで移動。',
              'Preview: ↑ ↓ for the previous or next part, Enter to edit, Esc to stop, Tab to leave the preview. For a selected product, Alt + arrow keys move it up, down, left or right, and Delete removes it. Ctrl + S saves, Ctrl + Z undoes (outside text fields). Ctrl + wheel zooms; hold Space and drag to pan.',
            )}
            toolbar={
              // テンプレートの札(押すと、選んだ部品のペインにテンプレート。選び直しは段階 b)
              // AB テストで、この案のテンプレートが A と違えば、ほかの部品と同じ下線の目印(SU2 ⑤)
              <Button
                type="button"
                size="small"
                appearance={isOn({ kind: 'template' }) ? 'primary' : 'outline'}
                icon={<LayoutColumnTwoRegular />}
                className={e.abDiffParts.some((p) => p.kind === 'template') ? s.abDiff : undefined}
                title={e.abDiffParts.some((p) => p.kind === 'template') ? t('この案のテンプレートは A と違います', 'This variant uses a different template from A') : undefined}
                onClick={() => select({ kind: 'template' })}
              >
                {t(`テンプレート: ${tpl.label}`, `Template: ${tpl.label}`)}
              </Button>
            }
            above={above}
            device={e.channel === 'email' ? { value: e.device, set: e.setDevice } : undefined}
            // ピン(コメント)は配信カードの ID に付くので、まだ保存していない案では出さない
            pins={!e.unsaved && pinsOn ? { placing, setPlacing } : undefined}
            boxLabel={t('プレビュー(押した部品を直します。↑ ↓ で前・次の部品、Enter で直す欄へ、Esc で選ぶのをやめる)', 'Preview (click a part to edit it; ↑ ↓ for the previous or next part, Enter to edit, Esc to stop)')}
          >
            {e.preview}
            {e.alertOverlay}
            {!e.unsaved && <PreviewPins boxRef={boxRef} cardId={e.card.id} view={pinView(e.channel, e.device, e.ab?.active ?? 'A')} items={e.items} placing={placing} onPlacingEnd={endPlacing} onOpenThreads={openThreads} menuItems={previewMenu} pinsOn={pinsOn} />}
            {pinTarget && !e.unsaved && (
              <PinFloat
                cardId={e.card.id}
                cardOwner={e.card.owner}
                stage="plan"
                root={() => boxRef.current}
                target={pinTarget}
                productName={(id) => productById.get(id)?.name ?? ''}
                onTarget={setPinTarget}
                onClose={closePin}
                editSpot={(anchor, productId) => {
                  const p = partOfAnchor(anchor, (pid) => e.items.find((i) => i.productId === pid)?.key, productId)
                  return p ? () => select(p) : null
                }}
              />
            )}
            {diffMarks.length > 0 && <PreviewMarks boxRef={boxRef} marks={diffMarks} onSelect={select} />}
            {/* セクションの商品を AI で選ぶボタンに載せている・案を試しているセクションを光らせる(X81 の 9) */}
            <SectionGlowLayer boxRef={boxRef} />
            {/* セクションの名札: 乗せると左上に名前と枠の数、押すとセクションの全体を選ぶ(2026-10-28 利用者) */}
            {e.channel === 'email' && <SectionTagLayer boxRef={boxRef} sections={sectionsOf(e.template)} selected={part} onSelect={onPick} disabled={e.saving || placing} />}
            <PreviewPartPicker boxRef={boxRef} selected={part && part.kind !== 'meta' && part.kind !== 'overview' ? part : null} lead={META_PART} leadOn={metaOn} onSelect={onPick} disabled={e.saving || placing} onSwap={onSwapBadge} onRemove={onRemoveBadge} onMove={onMoveKey} onEnter={focusPane} />
          </PreviewFrame>
        }
        pane={
          // 選んだ部品のペイン
          <StagePane key={part ? partKey(part) : 'none'} paneRef={paneRef}>
            <PartPane editor={e} part={part} compareKey={compareKey} onPlace={(key) => part && placed(part, key)} onCompareDone={() => setCompareKey(null)} onPick={select} chats={chats} setChat={setChat} heroReplace={heroReplace} swapAt={swapAt} onSwapAt={setSwapAt} imageAt={imageAt} onImageAt={setImageAt} onSwapped={swapped} swapInFloat={swapInFloat} />
            {e.footer}
          </StagePane>
        }
        list={productList}
      />
    </StageFrame>
  )
}
