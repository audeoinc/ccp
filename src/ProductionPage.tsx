import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogSurface, Input, MessageBar, MessageBarBody, Popover, PopoverSurface, PopoverTrigger, Spinner, Tab, TabList, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowResetRegular,
  CheckmarkRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  CopyRegular,
  DismissRegular,
  HandRightRegular,
  OpenRegular,
  SaveRegular,
  SendRegular,
  TaskListLtrRegular,
} from '@fluentui/react-icons'
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
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { ResizeHandles } from './ResizeHandles'
import { Splitter } from './Splitter'
import { useFloatSize, usePaneWidths } from './floatLayout'
import { buildSnapshot, downloadText, linkRows, parseSnapshot, previewHtml, productRows, rowsText, textRows, type Snapshot } from './productionSnapshot'
import { myName, myUserId, onMeChange } from './history'
import { productImage, heroImage } from './images'
import { locale, optionLabel, tr, useT } from './i18n'
import { loadPref, savePref } from './settings'
import { statusRank } from './status'
import { weekKeyOf } from './weekLock'
import { AutoTextarea } from './AutoTextarea'
import { CopyLinkButton } from './CopyLinkButton'

const RAIL_W = 32

const useStyles = makeStyles({
  // fixed + inset 0 + margin auto で画面の中央に置く(配信カードと同じ。relative だと標準の中央寄せが効かず、上端に貼りつく)
  surface: { position: 'fixed', inset: 0, margin: 'auto', width: 'min(1700px, 97vw)', maxWidth: 'none', height: '92vh', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '10px 16px 6px' },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  // 状態と操作の行(題名のすぐ下。ペインをたたんでも、いつも見える)
  stateBar: { display: 'flex', alignItems: 'center', columnGap: '10px', rowGap: '6px', flexWrap: 'wrap', padding: '6px 16px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  stateInfo: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap', flexGrow: 1, minWidth: 0 },
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
  actions: { display: 'flex', alignItems: 'center', columnGap: '6px', rowGap: '6px', flexWrap: 'wrap' },
  doneBox: { display: 'grid', rowGap: '8px', width: '320px' },
  dirty: { color: tokens.colorPaletteDarkOrangeForeground1 },
  messages: { padding: '0 16px', display: 'grid', rowGap: '6px' },
})

interface Props {
  /** いまの配信カード(依頼する前は、これから写しの下書きを作って見せる) */
  card: DeliveryCard
  /** いまの掲載商品(メールの並び順) */
  productIds: string[]
  products: Product[]
  heroes: HeroImage[]
  /** やり取りの宛先・タスクの担当の候補 */
  people: string[]
  onClose: () => void
  /** 企画を見る(配信カードを開く) */
  onOpenCard: (cardId: string) => void
  /** 依頼・受け取り・終わった・送ったのあとに、外の一覧を読み直す */
  onChanged?: () => void
}

const subscribeMe = (f: () => void) => onMeChange(f)
const LIVE = new Set(['requested', 'in_progress', 'done', 'sent'])
const INFO_KEY = 'productionPage.infoOpen'
const TALK_KEY = 'productionPage.talkOpen'

/** 押すと文字をコピーする小さなボタン(コピーしたら、少しのあいだ印を変える) */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  return (
    <Tooltip content={label ?? t('コピー', 'Copy')} relationship="label">
      <Button
        size="small"
        appearance="subtle"
        icon={done ? <CheckmarkRegular /> : <CopyRegular />}
        disabled={!text}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1200)
          })
        }}
      />
    </Tooltip>
  )
}

/**
 * 制作のページ(バックログ PR3。docs/PRODUCTION.md)。承認された配信を、制作に渡す材料のページ。制作の人は、ここだけを見ればよい。
 * 左から: 要素の情報(制作指示・テキスト・商品・リンク先。項目ごとにコピー。たためる)| HTML のエディタ | その HTML をそのまま描いたプレビュー | 企画と制作のやり取り・タスク(たためる)。
 * 状態と操作は、題名のすぐ下の行に、いつも出す(2026-10-19、利用者と決めた: 材料を見る → 書く → 確かめる → 相談する、の順。左のコピーを隣のエディタに貼れる)。
 * 中身は、依頼した時点の写し(依頼する前は、いまの配信カードから作った下書き)
 */
export function ProductionPage({ card, productIds, products, heroes, people, onClose, onOpenCard, onChanged }: Props) {
  const s = useStyles()
  const t = useT()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const meName = useSyncExternalStore(subscribeMe, myName)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const float = useFloatSize('productionPage.size', surfaceRef)
  // 既定の幅: プレビューに、メールの幅(600px 前後)が収まるよう残す
  const panes = usePaneWidths('productionPage.paneWidths.v1', [300, 440, 0, 320], 2)
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
  const [side, setSide] = useState<'talk' | 'tasks'>('talk')
  // プレビューから作った HTML(下書き)と、エディタの中身(null = まだ直していない)
  const [generated, setGenerated] = useState('')
  const [html, setHtml] = useState<string | null>(null)
  const offscreenRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'` })
    setRequests(r.success ? [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)) : [])
  }, [card.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const approved = statusRank(card.status) >= statusRank('approved')
  const latest = requests?.[0]
  const live = latest && LIVE.has(latest.status ?? '') ? latest : undefined
  const staleLatest = latest?.status === 'stale' ? latest : undefined
  // 写し: 依頼したあとは固めたもの、依頼する前(下書き)は、いまの配信カードから作ったもの
  const draft = useMemo(() => buildSnapshot(card, productIds, products, heroes), [card, productIds, products, heroes])
  // 描くたびに写しを読み直すと、HTML の下書きを作り直し続けるので、固めた写しの文字が変わったときだけ読む
  const frozenSnap = useMemo(() => parseSnapshot(live?.snapshot), [live?.snapshot])
  const snap: Snapshot = frozenSnap || draft
  const frozen = !!live
  const instructions = frozen ? (live?.instructions ?? '') : (card.instructions ?? '')
  const owner = frozen ? (live?.production_owner ?? '') : (card.production_owner ?? '')
  const due = frozen ? (live?.production_due ?? '') : (card.production_due ?? '')
  const texts = textRows(snap)
  const prows = productRows(snap)
  const lrows = linkRows(snap)
  const weekStart = card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined
  const actor = { id: meId, name: meName }
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const needMe = !meId ? t('右上で、だれでログインするかを選んでください', 'Choose who is signed in at the top right') : null

  // 見えないプレビューを描いたあとに、HTML の下書きを作る(画面に描いたものから、書式を直接書いた形にする)
  useEffect(() => {
    const el = offscreenRef.current
    if (!el) return
    const id = setTimeout(() => setGenerated(previewHtml(el, card.name ?? '')), 600)
    return () => clearTimeout(id)
    // 依頼を読み終えるまではプレビューを描かないので、読み終えたときにも作る
  }, [snap, card.name, requests])
  // エディタの中身: 直していればそれ、なければ保存した HTML、それもなければプレビューから作った下書き
  const savedHtml = live?.html ?? ''
  const shown = html ?? (savedHtml || generated)
  // 版が変わったら(依頼した・古い版になった)、直しかけを捨てて選び直す
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtml(null)
  }, [live?.id])
  const dirty = html !== null && html !== (savedHtml || generated)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const requestInput = () => ({
    delivery_card_id: card.id,
    actor,
    snapshot: JSON.stringify(draft),
    instructions: card.instructions ?? '',
    production_owner: card.production_owner ?? '',
    production_due: card.production_due ?? '',
    // エディタの HTML(直していればそれ)も一緒に固める
    html: shown,
    week_start: weekStart,
  })

  // 状態の名前と、次に動く人(「いま、だれの番か」。PROCESS.md 2 章)
  const state: { name: string; next: string; color: 'informative' | 'warning' | 'brand' | 'success' } = !approved
    ? { name: t('承認のあとに、制作に依頼します', 'Request production after approval'), next: t('企画・承認者', 'Planner / approvers'), color: 'informative' }
    : !live
      ? { name: t('制作に依頼する前', 'Not requested yet'), next: t('企画', 'Planner'), color: 'warning' }
      : live.status === 'requested'
        ? { name: t('依頼済み(受け取り待ち)', 'Requested (waiting to be received)'), next: owner || t('制作', 'Production'), color: 'brand' }
        : live.status === 'in_progress'
          ? { name: t('制作している', 'In production'), next: owner || t('制作', 'Production'), color: 'brand' }
          : live.status === 'done'
            ? { name: t('制作が終わった', 'Production done'), next: t('企画(仕上がりの確認)', 'Planner (check the result)'), color: 'success' }
            : { name: t('制作を通さず、配信のしくみに送った', 'Sent to the delivery system without production'), next: t('企画', 'Planner'), color: 'success' }

  const section = (title: string, copyAll: string | null, children: ReactNode, extra?: ReactNode) => (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.grow}>{title}</span>
        {extra}
        {copyAll !== null && <CopyButton text={copyAll} label={t('まとめてコピー', 'Copy all')} />}
      </div>
      {children}
    </div>
  )
  const copyRow = (label: string, value: string, key = label) => (
    <div key={key} className={s.row}>
      <span className={s.rowValue}>
        <span className={s.rowLabel}>{label}</span>
        {value}
      </span>
      <CopyButton text={value} />
    </div>
  )
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
      <DialogSurface ref={surfaceRef} className={s.surface} style={float.style} aria-label={t(`制作のページ: ${card.name}`, `Production page: ${card.name}`)}>
        <ResizeHandles {...float.handles} />
        <div className={s.head}>
          <FaceBadge face="production" />
          <ChannelBadge channel={card.channel} />
          <span className={s.title}>{card.name}</span>
          <span className={s.meta}>{card.scheduled_at ? new Date(card.scheduled_at).toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          {frozen && <Badge appearance="tint" color="informative">{t(`版 ${live?.version} ・ ${when(live?.requested_at)} に依頼`, `v${live?.version} · requested ${when(live?.requested_at)}`)}</Badge>}
          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(card.id)}>
            {t('企画を見る', 'Open the plan')}
          </Button>
          <CopyLinkButton />
          <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
        </div>

        {/* 状態と操作(いつも見える) */}
        <div className={s.stateBar}>
          <span className={s.stateInfo}>
            <Badge appearance="filled" color={state.color}>{state.name}</Badge>
            <span className={s.note}>{t(`次に動く人: ${state.next}`, `Next: ${state.next}`)}</span>
            {live?.received_by_name && <span className={s.note}>{t(`受け取った: ${live.received_by_name} ${when(live.received_at)}`, `Received: ${live.received_by_name} ${when(live.received_at)}`)}</span>}
            {live?.done_by_name && (
              <span className={s.note}>
                {t(`終わった: ${live.done_by_name} ${when(live.done_at)}`, `Done: ${live.done_by_name} ${when(live.done_at)}`)}
                {live.done_note ? ` — ${live.done_note}` : ''}
                {live.done_link ? ` — ${live.done_link}` : ''}
              </span>
            )}
            {live?.status === 'sent' && <span className={s.note}>{t(`配信のしくみに送った: ${live.sent_by_name} ${when(live.sent_at)}(送り先は、まだ仮)`, `Sent: ${live.sent_by_name} ${when(live.sent_at)} (placeholder destination)`)}</span>}
          </span>
          <span className={s.actions}>
            {approved && !live && (
              <Tooltip content={needMe ?? t('いまの配信カードの中身と HTML を固めて、制作に依頼します(このあと配信カードを変えても、このページは変わりません)', 'Freezes the current content and HTML and requests production (later changes to the card do not change this page)')} relationship="description">
                <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || !meId || !shown} onClick={() => void run(() => ProductionService.request(requestInput()), tr('制作に依頼しました', 'Requested production'))}>
                  {t('この内容で制作に依頼する', 'Request production with this content')}
                </Button>
              </Tooltip>
            )}
            {live?.status === 'requested' && (
              <Button size="small" appearance="primary" icon={<HandRightRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.receive(live.id, { actor, week_start: weekStart }), tr('受け取りました', 'Received'))}>
                {t('受け取った', 'Received')}
              </Button>
            )}
            {(live?.status === 'requested' || live?.status === 'in_progress') && (
              <Popover withArrow positioning="below-end">
                <PopoverTrigger disableButtonEnhancement>
                  <Button size="small" appearance={live.status === 'in_progress' ? 'primary' : 'secondary'} icon={<CheckmarkRegular />} disabled={busy || !meId}>
                    {t('制作が終わった', 'Production done')}
                  </Button>
                </PopoverTrigger>
                <PopoverSurface>
                  <div className={s.doneBox}>
                    <span className={s.note}>{t('ひとこと・できたもののリンクを添えられます(どちらも任意)', 'You can add a note and a link to the result (both optional)')}</span>
                    <AutoTextarea rows={1} size="small" value={doneNote} onChange={(_, d) => setDoneNote(d.value)} placeholder={t('ひとこと', 'Note')} />
                    <Input size="small" value={doneLink} onChange={(_, d) => setDoneLink(d.value)} placeholder="https://" />
                    <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={busy} onClick={() => void run(() => ProductionService.done(live.id, { actor, note: doneNote, link: doneLink, week_start: weekStart }), tr('制作が終わりました', 'Marked as done'))}>
                      {t('制作が終わった', 'Production done')}
                    </Button>
                  </div>
                </PopoverSurface>
              </Popover>
            )}
            {approved && live?.status !== 'sent' && (
              <Tooltip content={needMe ?? t('制作を通さず、エディタの HTML・テキスト・リンク先を、配信のしくみに直接送ります(いまは送り先が仮です)', 'Sends the editor HTML, text and links straight to the delivery system without production (the destination is a placeholder for now)')} relationship="description">
                <Button
                  size="small"
                  icon={<SendRegular />}
                  disabled={busy || !meId || !shown}
                  onClick={() => {
                    if (!window.confirm(t('制作を通さず、配信のしくみに送ります。よろしいですか?', 'Send to the delivery system without production?'))) return
                    void run(() => ProductionService.send(requestInput()))
                  }}
                >
                  {t('配信のしくみに送る(HTML)', 'Send to delivery system (HTML)')}
                </Button>
              </Tooltip>
            )}
          </span>
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
                {section(
                  t('制作指示', 'Production notes'),
                  instructions,
                  <>
                    <span className={s.note}>{t(`担当: ${owner || '(未設定)'} ・ 締め切り: ${due ? due.slice(0, 10).replace(/-/g, '/') : '(未設定)'}`, `Assignee: ${owner || '(not set)'} · Due: ${due ? due.slice(0, 10) : '(not set)'}`)}</span>
                    {instructions.trim() ? (
                      <div className={s.notes}>
                        <MarkdownLite text={instructions} />
                      </div>
                    ) : (
                      <span className={s.note}>{t('制作指示がありません(企画の配信カードの ⑥ で作ります)', 'No production notes (create them in step 6 of the plan card)')}</span>
                    )}
                    {!frozen && <span className={s.note}>{t('依頼する前は、いまの配信カードの中身を出しています。担当・締め切り・制作指示は、企画の配信カードで直します。', 'Before the request, this shows the current card. Edit the assignee, due date and notes in the plan card.')}</span>}
                  </>,
                )}
                {section(
                  t('テキスト', 'Text'),
                  rowsText(texts),
                  texts.map((r) => copyRow(r.label, r.value)),
                )}
                {snap.hero &&
                  section(
                    t('メイン画像', 'Main image'),
                    null,
                    <>
                      <img className={s.hero} src={heroImage(snap.hero) ?? ''} alt="" />
                      {copyRow(t('画像の URL', 'Image URL'), new URL(heroImage(snap.hero) ?? '', location.href).href)}
                    </>,
                  )}
                {section(
                  t(`選定された商品(${prows.length})`, `Selected products (${prows.length})`),
                  prows.map((r) => [r.section, r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')).join('\n'),
                  prows.map((r, i) => (
                    <div key={`${r.product.id}-${i}`} className={s.product}>
                      <img className={s.thumb} src={productImage(r.product) ?? ''} alt="" />
                      <span className={s.rowValue}>
                        <span className={s.rowLabel}>{r.section}</span>
                        {`${r.product.name} ・ ${r.product.product_code ?? ''} ・ ${r.price}`}
                        {'\n'}
                        <span className={s.note}>{r.url}</span>
                      </span>
                      <CopyButton text={[r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')} />
                    </div>
                  )),
                )}
                {section(
                  t('リンク先', 'Links'),
                  rowsText(lrows),
                  lrows.length ? lrows.map((r) => copyRow(r.label, r.value)) : <span className={s.note}>{t('リンク先はありません', 'No links')}</span>,
                )}
                <span className={s.note}>{t(`種別: ${optionLabel(card.department_name)} ・ 写し: ${when(snap.takenAt)}`, `Type: ${optionLabel(card.department_name)} · Snapshot: ${when(snap.takenAt)}`)}</span>
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
                  {!dirty && live?.html_saved_by_name && <span className={s.note}>{t(` ・ 保存: ${live.html_saved_by_name} ${when(live.html_saved_at)}`, ` · saved by ${live.html_saved_by_name} ${when(live.html_saved_at)}`)}</span>}
                </span>
                <Tooltip content={t('プレビューから作った下書きに戻します', 'Reset to the draft built from the preview')} relationship="label">
                  <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} disabled={!generated} onClick={() => setHtml(generated)} />
                </Tooltip>
                <CopyButton text={shown} label={t('HTML をコピー', 'Copy HTML')} />
                <Tooltip content={t('.html として保存', 'Download as .html')} relationship="label">
                  <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!shown} onClick={() => downloadText(`${(card.name ?? 'delivery').replace(/[\\/:*?"<>|]/g, '_')}.html`, shown)} />
                </Tooltip>
                <Tooltip content={live ? (needMe ?? t('この HTML を、この版に保存します', 'Save this HTML to this version')) : t('依頼したあとに保存できます(依頼するときは、この HTML も一緒に固めます)', 'You can save after the request (requesting freezes this HTML too)')} relationship="label">
                  <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={busy || !live || !meId || !dirty} onClick={() => live && void run(() => ProductionService.saveHtml(live.id, { actor, html: shown }), tr('HTML を保存しました', 'Saved the HTML'))}>
                    {t('保存', 'Save')}
                  </Button>
                </Tooltip>
              </div>
              <div className={s.editor}>{shown ? <HtmlEditor value={shown} onChange={setHtml} ariaLabel={t('HTML のエディタ', 'HTML editor')} /> : <Spinner size="tiny" label={t('プレビューから HTML を作っています…', 'Building HTML from the preview…')} />}</div>
              <span className={s.note}>{t('プレビューと同じ見た目の下書きです。メールの配信のしくみにそのまま入れる完成品ではありません。画像は、このサイトの外で開くと見えないことがあります。', 'A draft with the same look as the preview, not a finished email. Images may not show outside this site.')}</span>
            </div>

            <Splitter onDrag={panes.onDrag(1)} onDone={panes.onDone} />

            {/* 3. プレビュー: エディタの HTML を、アプリの画面とは切り離した枠でそのまま描く */}
            <div className={s.fill}>
              <HtmlPreviewFrame html={shown} title={t('HTML のプレビュー', 'HTML preview')} heading={t('プレビュー(HTML をそのまま描いたもの)', 'Preview (the HTML as is)')} headingClassName={s.sectionHead} />
            </div>

            <Splitter onDrag={talkOpen ? panes.onDrag(2) : () => undefined} onDone={panes.onDone} />

            {/* 4. 企画と制作のやり取り(制作の段階の話)とタスク(たためる) */}
            {talkOpen ? (
              <div className={mergeClasses(s.col, s.colTalk)}>
                <div className={s.paneTool}>
                  <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleTalk} aria-label={t('やり取りをたたむ', 'Collapse the conversation')} />
                </div>
                <TabList size="small" selectedValue={side} onTabSelect={(_, d) => setSide(d.value as 'talk' | 'tasks')}>
                  <Tab value="talk">{t('制作のやり取り', 'Production conversation')}</Tab>
                  <Tab value="tasks" icon={<TaskListLtrRegular />}>{t('タスク', 'Tasks')}</Tab>
                </TabList>
                {side === 'talk' ? (
                  <CommentsPanel cardId={card.id} stage="production" productIds={snap.productIds} products={snap.products} people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} />
                ) : (
                  <TasksPanel cardId={card.id} productionOwner={owner} productionDue={due} onOpenSource={() => setSide('talk')} onChanged={() => undefined} />
                )}
              </div>
            ) : (
              rail(t('やり取り', 'Conversation'), toggleTalk)
            )}

            {/* HTML の下書きを作るためだけの、見えないプレビュー(写しの中身をそのまま描く) */}
            <div className={s.offscreen} aria-hidden>
              <div ref={offscreenRef}>
                <CardPreview card={{ ...card, ...snap.card } as DeliveryCard} productIds={snap.productIds} products={snap.products} heroes={snap.hero ? [snap.hero] : []} />
              </div>
            </div>
          </div>
        )}
      </DialogSurface>
    </Dialog>
  )
}
