import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogSurface, Field, Input, MessageBar, MessageBarBody, Spinner, Tab, TabList, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, CheckmarkRegular, CopyRegular, DismissRegular, HandRightRegular, OpenRegular, SendRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ProductionRequestStatus, type ProductionRequest } from './models/productionRequests'
import { ProductionRequestsService } from './data/productionRequests'
import { ProductionService } from './data/production'
import { CardPreview } from './CardPreview'
import { CommentsPanel } from './CommentsPanel'
import { TasksPanel } from './TasksPanel'
import { MarkdownLite } from './MarkdownLite'
import { ChannelBadge } from './ChannelBadge'
import { buildSnapshot, downloadText, linkRows, parseSnapshot, previewHtml, productRows, rowsText, textRows, type Snapshot } from './productionSnapshot'
import { myName, myUserId, onMeChange } from './history'
import { productImage, heroImage } from './images'
import { locale, optionLabel, tr, useT } from './i18n'
import { statusRank } from './status'
import { weekKeyOf } from './weekLock'
import { AutoTextarea } from './AutoTextarea'

const useStyles = makeStyles({
  surface: { width: 'min(1500px, 96vw)', maxWidth: 'none', height: '92vh', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  body: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr) minmax(300px, 380px)' },
  col: { minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'grid', rowGap: '14px', alignContent: 'start', borderRight: `1px solid ${tokens.colorNeutralStroke2}` },
  colLast: { borderRight: 'none', backgroundColor: tokens.colorNeutralBackground2 },
  preview: { backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, padding: '8px', overflow: 'auto' },
  section: { display: 'grid', rowGap: '6px' },
  sectionHead: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  grow: { flexGrow: 1 },
  // コピーできる 1 行(見出し・値・コピー)
  row: { display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'start', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  rowLabel: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, paddingTop: '4px' },
  rowValue: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', paddingTop: '4px' },
  product: { display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  thumb: { width: '48px', height: '48px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  hero: { width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  notes: { padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  // 状態と、次にだれが何をするか
  state: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  stateHead: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '6px', flexWrap: 'wrap' },
  html: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, maxHeight: '160px', overflow: 'auto', whiteSpace: 'pre', padding: '8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground2 },
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
  /** 企画を見る(配信カードを重ねて開く) */
  onOpenCard: (cardId: string) => void
  /** 依頼・受け取り・終わった・送ったのあとに、外の一覧を読み直す */
  onChanged?: () => void
}

const subscribeMe = (f: () => void) => onMeChange(f)
const LIVE = new Set(['requested', 'in_progress', 'done', 'sent'])

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
 * 中身は、依頼した時点の写し(依頼する前は、いまの配信カードから作った下書き)。プレビュー・テキスト・商品・リンク先・メイン画像・制作指示を、項目ごとにコピーできる。
 * 右の列は、企画と制作のやり取り(制作の段階の話だけ)とタスク
 */
export function ProductionPage({ card, productIds, products, heroes, people, onClose, onOpenCard, onChanged }: Props) {
  const s = useStyles()
  const t = useT()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const meName = useSyncExternalStore(subscribeMe, myName)
  const [requests, setRequests] = useState<ProductionRequest[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [doneNote, setDoneNote] = useState('')
  const [doneLink, setDoneLink] = useState('')
  const [side, setSide] = useState<'talk' | 'tasks'>('talk')
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)

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

  // プレビューを描いたあとに、HTML の下書きを作る(画面に描いたものから、書式を直接書いた形にする)
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const id = setTimeout(() => setHtml(previewHtml(el, card.name ?? '')), 600)
    return () => clearTimeout(id)
    // 依頼を読み終えるまではプレビューを描かないので、読み終えたときにも作る
  }, [snap, card.name, requests])

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
    week_start: weekStart,
  })

  // 状態の名前と、次に動く人(「いま、だれの番か」。PROCESS.md 2 章)
  const state: { name: string; next: string; color: 'informative' | 'warning' | 'brand' | 'success' | 'danger' } = !approved
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

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface} aria-label={t(`制作のページ: ${card.name}`, `Production page: ${card.name}`)}>
        <div className={s.head}>
          <ChannelBadge channel={card.channel} />
          <span className={s.title}>{card.name}</span>
          <span className={s.meta}>{card.scheduled_at ? new Date(card.scheduled_at).toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          {frozen && <Badge appearance="tint" color="informative">{t(`版 ${live?.version} ・ ${when(live?.requested_at)} に依頼`, `v${live?.version} · requested ${when(live?.requested_at)}`)}</Badge>}
          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(card.id)}>
            {t('企画を見る', 'Open the plan')}
          </Button>
          <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />
        </div>
        {requests === null ? (
          <Spinner size="small" />
        ) : (
          <div className={s.body}>
            {/* 左: プレビューと、HTML の下書き */}
            <div className={s.col}>
              {section(
                t('プレビュー', 'Preview'),
                null,
                <div className={s.preview}>
                  <div ref={previewRef}>
                    <CardPreview card={{ ...card, ...snap.card } as DeliveryCard} productIds={snap.productIds} products={snap.products} heroes={snap.hero ? [snap.hero] : []} />
                  </div>
                </div>,
              )}
              {section(
                t('プレビューの HTML(下書き)', 'Preview HTML (draft)'),
                html,
                <>
                  <span className={s.note}>{t('プレビューと同じ見た目の下書きです。メールの配信のしくみにそのまま入れる完成品ではありません。画像は、このサイトの外で開くと見えないことがあります。', 'A draft with the same look as the preview, not a finished email. Images may not show outside this site.')}</span>
                  <div className={s.html}>{html || t('作っています…', 'Building…')}</div>
                </>,
                <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!html} onClick={() => downloadText(`${(card.name ?? 'delivery').replace(/[\\/:*?"<>|]/g, '_')}.html`, html)}>
                  {t('保存', 'Save')}
                </Button>,
              )}
            </div>

            {/* 中: 状態と操作、コピーしやすい中身 */}
            <div className={s.col}>
              <div className={s.state}>
                <div className={s.stateHead}>
                  <Badge appearance="filled" color={state.color}>{state.name}</Badge>
                  <span className={s.note}>{t(`次に動く人: ${state.next}`, `Next: ${state.next}`)}</span>
                </div>
                {staleLatest && !live && (
                  <MessageBar intent="warning" layout="multiline">
                    <MessageBarBody>{t(`企画が変わりました(版 ${staleLatest.version} は古い版です)。承認されたら、新しい版で依頼し直してください。`, `The plan changed (v${staleLatest.version} is outdated). Request again with a new version after approval.`)}</MessageBarBody>
                  </MessageBar>
                )}
                {live?.received_by_name && <span className={s.note}>{t(`受け取った: ${live.received_by_name} ・ ${when(live.received_at)}`, `Received by ${live.received_by_name} · ${when(live.received_at)}`)}</span>}
                {live?.done_by_name && (
                  <span className={s.note}>
                    {t(`制作が終わった: ${live.done_by_name} ・ ${when(live.done_at)}`, `Done by ${live.done_by_name} · ${when(live.done_at)}`)}
                    {live.done_note ? ` — ${live.done_note}` : ''}
                    {live.done_link ? ` — ${live.done_link}` : ''}
                  </span>
                )}
                {live?.status === 'sent' && <span className={s.note}>{t(`配信のしくみに送った: ${live.sent_by_name} ・ ${when(live.sent_at)}(送り先は、まだ仮です)`, `Sent by ${live.sent_by_name} · ${when(live.sent_at)} (the destination is a placeholder)`)}</span>}
                <div className={s.actions}>
                  {approved && !live && (
                    <Tooltip content={needMe ?? t('いまの配信カードの中身を固めて、制作に依頼します(このあと配信カードを変えても、このページは変わりません)', 'Freezes the current content and requests production (later changes to the card do not change this page)')} relationship="description">
                      <Button size="small" appearance="primary" icon={<SendRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.request(requestInput()), tr('制作に依頼しました', 'Requested production'))}>
                        {t('この内容で制作に依頼する', 'Request production with this content')}
                      </Button>
                    </Tooltip>
                  )}
                  {live?.status === 'requested' && (
                    <Button size="small" appearance="primary" icon={<HandRightRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.receive(live.id, { actor, week_start: weekStart }), tr('受け取りました', 'Received'))}>
                      {t('受け取った', 'Received')}
                    </Button>
                  )}
                  {approved && live?.status !== 'sent' && (
                    <Tooltip content={needMe ?? t('制作を通さず、HTML・テキスト・リンク先を、配信のしくみに直接送ります(いまは送り先が仮です)', 'Sends the HTML, text and links straight to the delivery system without production (the destination is a placeholder for now)')} relationship="description">
                      <Button
                        size="small"
                        icon={<SendRegular />}
                        disabled={busy || !meId || !html}
                        onClick={() => {
                          if (!window.confirm(t('制作を通さず、配信のしくみに送ります。よろしいですか?', 'Send to the delivery system without production?'))) return
                          void run(() => ProductionService.send({ ...requestInput(), html }))
                        }}
                      >
                        {t('配信のしくみに送る(HTML)', 'Send to delivery system (HTML)')}
                      </Button>
                    </Tooltip>
                  )}
                </div>
                {(live?.status === 'requested' || live?.status === 'in_progress') && (
                  <div className={s.section}>
                    <Field label={t('ひとこと(任意)', 'Note (optional)')} size="small">
                      <AutoTextarea rows={1} size="small" value={doneNote} onChange={(_, d) => setDoneNote(d.value)} />
                    </Field>
                    <Field label={t('できたもののリンク(任意)', 'Link to the result (optional)')} size="small">
                      <Input size="small" value={doneLink} onChange={(_, d) => setDoneLink(d.value)} placeholder="https://" />
                    </Field>
                    <div className={s.actions}>
                      <Button size="small" appearance="primary" icon={<CheckmarkRegular />} disabled={busy || !meId} onClick={() => void run(() => ProductionService.done(live.id, { actor, note: doneNote, link: doneLink, week_start: weekStart }), tr('制作が終わりました', 'Marked as done'))}>
                        {t('制作が終わった', 'Production done')}
                      </Button>
                    </div>
                  </div>
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
                texts.map((r) => (
                  <div key={r.label} className={s.row}>
                    <span className={s.rowLabel}>{r.label}</span>
                    <span className={s.rowValue}>{r.value}</span>
                    <CopyButton text={r.value} />
                  </div>
                )),
              )}

              {snap.hero &&
                section(
                  t('メイン画像', 'Main image'),
                  null,
                  <>
                    <img className={s.hero} src={heroImage(snap.hero) ?? ''} alt="" />
                    <div className={s.row}>
                      <span className={s.rowLabel}>{t('画像の URL', 'Image URL')}</span>
                      <span className={s.rowValue}>{new URL(heroImage(snap.hero) ?? '', location.href).href}</span>
                      <CopyButton text={new URL(heroImage(snap.hero) ?? '', location.href).href} />
                    </div>
                  </>,
                )}

              {section(
                t(`選定された商品(${prows.length})`, `Selected products (${prows.length})`),
                prows.map((r) => [r.section, r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')).join('\n'),
                prows.map((r, i) => (
                  <div key={`${r.product.id}-${i}`} className={s.product}>
                    <img className={s.thumb} src={productImage(r.product) ?? ''} alt="" />
                    <span className={s.rowValue}>
                      <span className={s.note}>{r.section}</span>
                      {'\n'}
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
                lrows.length ? (
                  lrows.map((r) => (
                    <div key={r.label} className={s.row}>
                      <span className={s.rowLabel}>{r.label}</span>
                      <span className={s.rowValue}>{r.value}</span>
                      <CopyButton text={r.value} />
                    </div>
                  ))
                ) : (
                  <span className={s.note}>{t('リンク先はありません', 'No links')}</span>
                ),
              )}
              <span className={s.note}>{t(`種別: ${optionLabel(card.department_name)} ・ 写し: ${when(snap.takenAt)}`, `Type: ${optionLabel(card.department_name)} · Snapshot: ${when(snap.takenAt)}`)}</span>
            </div>

            {/* 右: 企画と制作のやり取り(制作の段階の話)とタスク */}
            <div className={`${s.col} ${s.colLast}`}>
              <TabList size="small" selectedValue={side} onTabSelect={(_, d) => setSide(d.value as 'talk' | 'tasks')}>
                <Tab value="talk">{t('制作のやり取り', 'Production conversation')}</Tab>
                <Tab value="tasks" icon={<TaskListLtrRegular />}>{t('タスク', 'Tasks')}</Tab>
              </TabList>
              {side === 'talk' ? (
                <CommentsPanel cardId={card.id} stage="production" productIds={snap.productIds} products={snap.products} people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} />
              ) : (
                <TasksPanel cardId={card.id} productionOwner={owner} productionDue={due} onOpenSource={() => setSide('talk')} onChanged={() => undefined} />
              )}
              <span className={s.note}>{t(`この状態: ${ProductionRequestStatus[live?.status ?? 'requested'] && live ? optionLabel(ProductionRequestStatus[live.status ?? 'requested']) : state.name}`, `State: ${state.name}`)}</span>
            </div>
          </div>
        )}
      </DialogSurface>
    </Dialog>
  )
}
