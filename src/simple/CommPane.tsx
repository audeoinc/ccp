import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Avatar, Button, MessageBar, MessageBarBody, Checkbox, Popover, PopoverSurface, PopoverTrigger, Spinner, Tab, TabList, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  ArrowRepeatAllRegular,
  CheckmarkCircleRegular,
  CheckmarkRegular,
  DismissCircleRegular,
  EditRegular,
  LocationRegular,
  MentionRegular,
  PaintBrushRegular,
  PersonAvailableRegular,
  SendRegular,
  TaskListSquareLtrRegular,
} from '@fluentui/react-icons'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { ApprovalRequest } from '../models/approvalRequests'
import type { ApprovalReviewer } from '../models/approvalReviewers'
import { CardNotesService, type CardNote } from '../data/cardNotes'
import { ApprovalRequestsService } from '../data/approvalRequests'
import { ApprovalReviewersService } from '../data/approvalReviewers'
import { ApprovalsService } from '../data/approvals'
import { EventsService, type CardEvent } from '../data/events'
import { CardHistoryList } from '../CardHistory'
import { ApprovalBar } from '../ApprovalBar'
import { AutoTextarea } from '../AutoTextarea'
import { eligibleReviewers } from '../approvals'
import { attachCapture, saveNoteImage, blockOfAnchor, captureKey, snapshotOf, startCapture } from '../pinSnapshot'
import { myName, myUserId, onMeChange } from '../history'
import { activeUsers, groupsOf, usePeople } from '../people'
import { bumpNotes, focusPin, focusedPin, notesVersion, pinNumbers, subscribePins } from '../pinStore'
import { isThreadRoot, stageOf } from '../notesStage'
import { locale, tr, useT } from '../i18n'
import { statusRank } from '../status'
import { weekKeyOf } from '../weekLock'
import { anchorOfPart, partOfAnchor, type PartRef } from './parts'
import { Linkify } from '../LinkText'

const useStyles = makeStyles({
  // やり取り: 絞り込み・流れ・書く欄(承認の様子・変更の記録は、描くときに行を替える)
  root: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', height: '100%', minHeight: 0, backgroundColor: tokens.colorNeutralBackground1 },
  top: { display: 'grid', rowGap: '10px', padding: '12px 12px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  track: { display: 'flex', alignItems: 'center', columnGap: '4px' },
  stepIcon: { fontSize: '18px', flexShrink: 0 },
  line: { flexGrow: 1, height: '2px', borderRadius: '1px', backgroundColor: tokens.colorNeutralStroke2 },
  lineDone: { backgroundColor: tokens.colorPaletteGreenBorder2 },
  done: { color: tokens.colorPaletteGreenForeground1 },
  now: { color: tokens.colorBrandForeground1 },
  todo: { color: tokens.colorNeutralForeground4 },
  who: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  whoText: { flexGrow: 1, minWidth: 0, fontSize: tokens.fontSizeBase300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', columnGap: '6px', flexWrap: 'wrap' },
  bar: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  handoff: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', columnGap: '4px', border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, cursor: 'pointer', maxWidth: '50%', overflow: 'hidden', whiteSpace: 'nowrap' },
  stream: { overflowY: 'auto', minHeight: 0, padding: '8px 12px', display: 'grid', alignContent: 'start', rowGap: '10px' },
  item: { display: 'grid', gridTemplateColumns: '20px 24px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'start', fontSize: tokens.fontSizeBase300, cursor: 'pointer', borderRadius: tokens.borderRadiusMedium, padding: '2px', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  itemOpen: { backgroundColor: tokens.colorNeutralBackground2 },
  pin: { width: '18px', height: '18px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: tokens.fontWeightBold, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorPaletteDarkOrangeBackground3, marginTop: '2px' },
  pinDone: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground3 },
  one: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  full: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  quiet: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, padding: '0 2px', minWidth: 0 },
  replies: { display: 'grid', rowGap: '6px', gridColumn: '3 / -1', paddingTop: '4px' },
  reply: { fontSize: tokens.fontSizeBase200, padding: '4px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  composer: { display: 'grid', rowGap: '6px', padding: '8px 12px 12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', padding: '2px 8px', borderRadius: '999px', border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, cursor: 'pointer' },
  chipOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, borderTopColor: tokens.colorBrandStroke2, borderRightColor: tokens.colorBrandStroke2, borderBottomColor: tokens.colorBrandStroke2, borderLeftColor: tokens.colorBrandStroke2 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  people: { display: 'grid', rowGap: '2px', maxHeight: '220px', overflowY: 'auto' },
  empty: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, padding: '8px 2px' },
})

const partName = (p: PartRef | null): string => {
  if (!p) return tr('配信の全体', 'Whole delivery')
  switch (p.kind) {
    case 'hero': return tr('メイン画像', 'Main image')
    case 'headline': return tr('見出し', 'Headline')
    case 'copy': return tr('コピー', 'Copy')
    case 'subject': return tr('件名', 'Subject')
    case 'preheader': return tr('プリヘッダー', 'Preheader')
    case 'pushTitle':
    case 'pushBody': return tr('通知', 'Notification')
    case 'sectionTitle':
    case 'sectionCopy': return tr(`セクション ${p.index + 1}`, `Section ${p.index + 1}`)
    case 'product': return tr('商品', 'Product')
    case 'button': return tr('ボタン', 'Button')
    default: return tr('配信の全体', 'Whole delivery')
  }
}

const initials = (name?: string) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

const ago = (iso?: string) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return tr('たった今', 'just now')
  if (m < 60) return tr(`${m} 分`, `${m}m`)
  if (m < 60 * 24) return tr(`${Math.round(m / 60)} 時間`, `${Math.round(m / 60)}h`)
  return new Date(iso).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' })
}

const LIVE = new Set(['open', 'approved', 'changes_requested'])
const subscribeMe = (f: () => void) => onMeChange(f)

interface Props {
  card: DeliveryCard
  /** いまプレビューで選んでいる部品(書き込みの場所になる) */
  part: PartRef | null
  /** 書き込みを押したときに、その部品を選ぶ */
  onPick: (p: PartRef | null) => void
  /** 載せた商品(商品の書き込みの場所 ↔ プレビューの枠) */
  items: { key: string; productId: string }[]
  productName: (productId: string) => string
  /** 商品(素材の欄で、素材に商品を結び付けるため) */
  products: Product[]
  /** 書き込みの見た目(チャネル|幅|案。pinView) */
  view: string
  /** 制作への引き継ぎ(状態の道のり・次に動く人を決めるために読む。決めるのは「渡すもの」) */
  handoff: { productionOwner: string; handedOffAt: string; productionDue: string }
  people: string[]
  /** 承認・依頼の前に、直した中身を反映(保存)する */
  onCommit: () => Promise<void>
  isDirty: () => boolean
  busy: boolean
  onChanged: () => Promise<void>
  /** 承認・依頼を出せるか(確定した週の配信は、出さない) */
  canReview: boolean
  /** 制作のページを開く */
  onOpenProduction?: () => void
  /** 自分宛ての書き込み・承認の番・変更の数(左のバーの数と点のため) */
  onCounts?: (c: CommCounts) => void
  /** 左のバーで開いているもの(SU4)。やり取り / 承認の様子 / 変更の記録。中身は 1 つの部品で持ち、書きかけの文を共にする */
  section: CommSection
  /** 承認の様子のいちばん上に出す、送る前の確かめ(承認を依頼する前の一覧。出さないときは省く) */
  checks?: ReactNode
}

export type CommSection = 'talk' | 'approval' | 'history'
export interface CommCounts {
  open: number
  tasks: number
  /** 自分宛ての書き込みがある */
  mine: boolean
  /** 自分が承認する番 */
  myTurn: boolean
  /** 承認待ち */
  waiting: boolean
  /** いまの依頼が差し戻された(作った人が直して、依頼し直す) */
  changesRequested: boolean
  /** いまの依頼の相手の数と、承認した数(上の帯の承認の札「承認待ち(1/2 人)」。SU11) */
  reviewers: number
  approved: number
  changes: number
}

/**
 * シンプルな配信カードのコミュニケーションのペイン(SU1 段階 d。2026-10-22 利用者と決めた)。
 * テキストでごちゃごちゃさせないため、(1) 状態の道のりと、次に動く人を顔で、(2) 書き込み・タスク・承認・変更を 1 本の流れに(変更は畳む)、
 * (3) 書く欄は 1 つ(場所はプレビューで選んでいる部品から自動で付ける)。データと保存は今のプロセスのペインと同じ(card_notes・承認の窓口・引き継ぎの欄)
 */
export function CommPane(props: Props) {
  const s = useStyles()
  const t = useT()
  const { card } = props
  const people = usePeople()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const meName = useSyncExternalStore(subscribeMe, myName)
  const version = useSyncExternalStore(subscribePins, notesVersion)
  const focus = useSyncExternalStore(subscribePins, focusedPin)
  const [notes, setNotes] = useState<CardNote[]>([])
  const [events, setEvents] = useState<CardEvent[]>([])
  const [request, setRequest] = useState<ApprovalRequest | null>(null)
  const [reviewers, setReviewers] = useState<ApprovalReviewer[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState('')
  const [asTask, setAsTask] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // プレビューの番号の点を押したら、流れのその書き込みを開く
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focus?.noteId) setOpenId(focus.noteId)
  }, [focus])

  const load = useCallback(async () => {
    const [n, e, r] = await Promise.all([
      CardNotesService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['created_on asc'] }),
      EventsService.getAll({ filter: `delivery_card_id eq ${card.id}`, orderBy: ['created_on asc'] }),
      ApprovalRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'`, orderBy: ['requested_at desc'] }),
    ])
    const live = r.success ? ((r.data ?? []).find((x) => LIVE.has(x.status ?? '')) ?? null) : null
    const v = live ? await ApprovalReviewersService.getAll({ filter: `approval_request_id eq '${live.id}'`, orderBy: ['created_on'] }) : null
    setNotes(n.success ? (n.data ?? []) : [])
    setEvents(e.success ? (e.data ?? []) : [])
    setRequest(live)
    setReviewers(v?.success ? (v.data ?? []) : [])
    setLoading(false)
  }, [card.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, version, card.status])

  // ---- 状態の道のりと、次に動く人
  const rank = statusRank(card.status)
  const step = props.handoff.handedOffAt ? 2 : rank >= statusRank('approved') ? 2 : rank >= statusRank('reviewing') ? 1 : 0
  const sent = !!card.scheduled_at && new Date(card.scheduled_at) < new Date() && step >= 2
  const myGroups = groupsOf(people, meId)
  const eligible = request?.status === 'open' ? eligibleReviewers(reviewers, meId, myGroups, request.requested_by) : []
  const pendingNames = reviewers.filter((r) => !r.decision || r.decision === 'pending').map((r) => r.reviewer_name ?? '')
  const waiting = request?.status === 'open'
  const changesRequested = request?.status === 'changes_requested'
  const approvedCount = reviewers.filter((r) => r.decision === 'approved').length

  // ---- 1 本の流れ(企画の段階のやり取り・タスク・承認の出来事。変更の記録は畳む)
  const roots = notes.filter((n) => (isThreadRoot(n) && stageOf(n) === 'plan') || n.kind === 'task')
  const repliesOf = (id: string) => notes.filter((n) => n.kind === 'reply' && n.source_note === id)
  const numbers = pinNumbers(notes)
  const changes = [...notes.filter((n) => n.kind === 'change'), ...events.filter((e) => e.action === 'status' || e.action === 'revoke' || e.action === 'reopen')]
  const approvalEvents = events.filter((e) => e.action === 'request' || e.action === 'approve' || e.action === 'reject' || e.action === 'withdraw')
  type Row = { at: string; kind: 'note'; note: CardNote } | { at: string; kind: 'event'; event: CardEvent }
  const rows: Row[] = useMemo(() => {
    const list: Row[] = [
      ...roots.filter((n) => filter === 'all' || !n.resolved).map((n) => ({ at: n.created_on ?? '', kind: 'note' as const, note: n })),
      ...(filter === 'all' ? approvalEvents.map((e) => ({ at: e.created_on ?? '', kind: 'event' as const, event: e })) : []),
    ]
    // 新しい順(いま返事が要るものが上に来るように)
    return list.sort((a, b) => b.at.localeCompare(a.at))
    // roots・approvalEvents は notes・events から作る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, events, filter])
  const openCount = roots.filter((n) => !n.resolved && n.kind !== 'task').length
  const taskCount = roots.filter((n) => !n.resolved && n.kind === 'task').length
  const allCount = roots.length + approvalEvents.length
  const mine = !!meName && roots.some((n) => !n.resolved && n.assignee === meName)
  const { onCounts } = props
  useEffect(() => {
    onCounts?.({ open: openCount, tasks: taskCount, mine, myTurn: eligible.length > 0, waiting, changesRequested, reviewers: reviewers.length, approved: approvedCount, changes: changes.length })
  }, [openCount, taskCount, mine, eligible.length, waiting, changesRequested, reviewers.length, approvedCount, changes.length, onCounts])

  // ---- 書く
  const productIdOf = (key: string) => props.items.find((i) => i.key === key)?.productId
  // 書き込みの場所は、選んでいる部品(プレビューの場所を押して書くのは、ピンのフロート PinFloat が受け持つ)
  const place = anchorOfPart(props.part, productIdOf)
  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setWorking(true)
    setError(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
      bumpNotes()
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setWorking(false)
    }
  }
  const post = async () => {
    const body = text.trim()
    if (!body) return
    // 選んでいる部品の場所に書くときも、書いたときの様子を残す(X65 (b))
    const block = place ? blockOfAnchor(place.anchor, props.part?.kind === 'product' ? props.part.itemKey : undefined) : null
    const key = place ? captureKey(card.id, place.anchor, 0.97, 0.08) : ''
    if (block) startCapture(key, block)
    const then = block ? { anchor_snapshot: snapshotOf(block) } : {}
    let createdId = ''
    const ok = await run(async () => {
      const r = await CardNotesService.create({
        delivery_card_id: card.id,
        kind: asTask ? 'task' : 'comment',
        stage: 'plan',
        author: meName || card.owner || '',
        body,
        ...(assignee ? { assignee } : {}),
        ...(place ? { anchor: place.anchor, anchor_x: 0.97, anchor_y: 0.08, anchor_view: props.view, ...(place.productId ? { product_id: place.productId } : {}), ...then } : {}),
      })
      createdId = r.data?.id ?? ''
      return r
    })
    if (ok && block && createdId) attachCapture(key, saveNoteImage(createdId), bumpNotes)
    if (ok) {
      setText('')
      setAsTask(false)
      setAssignee('')
    }
  }
  const sendReply = async (root: CardNote) => {
    const body = replyText.trim()
    if (!body) return
    const ok = await run(() => CardNotesService.create({ delivery_card_id: card.id, kind: 'reply', stage: 'plan', author: meName || '', body, source_note: root.id }))
    if (ok) setReplyText('')
  }
  const toggleResolved = (n: CardNote) => void run(() => CardNotesService.update(n.id, { resolved: n.resolved ? 0 : 1 }))

  // ---- 承認・差し戻し(書いた文が、差し戻しの理由・承認のひとこと)
  const decide = async (decision: 'approved' | 'changes_requested') => {
    if (!request) return
    if (decision === 'changes_requested' && !text.trim()) {
      setError(tr('差し戻すときは、下の欄に理由を書いてください', 'Write the reason in the box below to request changes'))
      return
    }
    await props.onCommit()
    if (props.isDirty()) {
      setError(tr('直した中身を保存してから、承認してください', 'Save your changes before approving'))
      return
    }
    const ok = await run(() =>
      ApprovalsService.decide(request.id, { actor: { id: meId, name: meName }, decision, reviewer_id: eligible[0], note: text.trim() || undefined, week_start: card.scheduled_at ? weekKeyOf(new Date(card.scheduled_at)) : undefined }),
    )
    if (ok) {
      setText('')
      await props.onChanged()
    }
  }

  const open = (n: CardNote) => {
    setOpenId(openId === n.id ? null : n.id)
    setReplyText('')
    if (n.anchor) {
      focusPin(n.id)
      props.onPick(partOfAnchor(n.anchor, (pid) => props.items.find((i) => i.productId === pid)?.key, n.product_id))
    }
  }

  const stepIcon = (i: number) => {
    const icons = [<EditRegular key="d" />, <PersonAvailableRegular key="a" />, <PaintBrushRegular key="p" />, <SendRegular key="s" />]
    const names = [t('下書き', 'Draft'), t('承認', 'Approval'), t('制作', 'Production'), t('配信', 'Send')]
    const state = sent ? 'done' : i < step ? 'done' : i === step ? 'now' : 'todo'
    return (
      <Tooltip key={i} content={names[i]} relationship="label">
        <span className={mergeClasses(s.stepIcon, state === 'done' ? s.done : state === 'now' ? s.now : s.todo)}>{icons[i]}</span>
      </Tooltip>
    )
  }

  const userNames = activeUsers(people).map((u) => u.name ?? '').filter(Boolean)
  const names = userNames.length > 0 ? userNames : props.people

  // 変更の記録(中身の項目の変更・差し替えの理由・ステータスの変化。新しい順。「⋯」の「変更の履歴…」と同じもの。X1)
  if (props.section === 'history')
    return (
      <div className={s.root} style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
        <div className={s.stream}>
          <CardHistoryList cardId={card.id} version={`${version}:${card.status}:${card.modified_on ?? ''}`} />
        </div>
      </div>
    )

  // 承認の様子(状態の道のりと次に動く人・自分の番なら承認と差し戻し・依頼と取り下げ・承認の出来事)
  if (props.section === 'approval')
    return (
      <div className={s.root} style={{ gridTemplateRows: 'auto auto minmax(0, 1fr)' }}>
        {/* 1. 状態の道のりと、次に動く人 */}
        <div className={s.top}>
          <div className={s.track}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className={mergeClasses(s.line, (sent || i <= step) && s.lineDone)} />}
                {stepIcon(i)}
              </span>
            ))}
          </div>
          <div className={s.who}>
            {waiting ? (
              <>
                {pendingNames.slice(0, 3).map((n) => (
                  <Avatar key={n} size={24} name={n} initials={initials(n)} color="colorful" />
                ))}
                <span className={s.whoText}>
                  {t('承認待ち', 'Awaiting approval')} <span className={s.muted}>· {ago(request?.requested_at)}</span>
                </span>
              </>
            ) : step >= 2 && !props.handoff.handedOffAt ? (
              <span className={s.whoText}>{t('承認済み。制作に渡せます', 'Approved. Ready for production')}</span>
            ) : props.handoff.handedOffAt ? (
              <>
                <Avatar size={24} name={props.handoff.productionOwner || '?'} initials={initials(props.handoff.productionOwner)} color="colorful" />
                <span className={s.whoText}>{t('制作中', 'In production')}</span>
              </>
            ) : step === 1 ? (
              // 承認待ちのステータスだが、いまの依頼がない(取り下げた・内容を変えて古くなった)。依頼は下の承認の部品から
              <span className={s.whoText}>{t('承認待ち', 'Awaiting approval')} <span className={s.muted}>· {t('依頼はまだ', 'not requested yet')}</span></span>
            ) : (
              <span className={s.whoText}>{t('下書き', 'Draft')}</span>
            )}
          </div>
          {/* 自分が承認する番なら、ここで決める(書いた文が理由・ひとことになる) */}
          {eligible.length > 0 && (
            <AutoTextarea heightKey="CommPane.decideText" size="small" rows={2} value={text} disabled={working} placeholder={t('ひとこと(差し戻すときは理由)', 'A note (the reason, when requesting changes)')} onChange={(_, d) => setText(d.value)} />
          )}
          {error && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
          {eligible.length > 0 && (
            <div className={s.actions}>
              <Button size="small" appearance="primary" icon={<CheckmarkCircleRegular />} disabled={working || props.busy} onClick={() => void decide('approved')}>
                {t('承認', 'Approve')}
              </Button>
              <Button size="small" icon={<DismissCircleRegular />} disabled={working || props.busy} onClick={() => void decide('changes_requested')}>
                {t('差し戻す', 'Request changes')}
              </Button>
            </div>
          )}
          {props.handoff.handedOffAt && props.onOpenProduction && (
            <div className={s.actions}>
              <Button size="small" icon={<PaintBrushRegular />} onClick={props.onOpenProduction}>
                {t('制作のページ', 'Production page')}
              </Button>
            </div>
          )}
        </div>

        <div className={s.top}>
          {props.checks}
          {props.canReview ? (
            // 依頼・取り下げ・相手ごとの状態(詳しい画面と同じ部品)
            <ApprovalBar card={card} isDirty={props.isDirty} busy={props.busy} onChanged={async () => { await props.onChanged(); await load() }} />
          ) : (
            <span className={s.muted}>{t('確定した週の配信は、承認の依頼を出しません', 'Approval requests are not available for a confirmed week')}</span>
          )}
        </div>
        <div className={s.stream}>
          {approvalEvents.length === 0 && !loading && <span className={s.empty}>{t('まだ承認のやり取りはありません', 'No approval activity yet')}</span>}
          {[...approvalEvents].reverse().map((e) => {
            const icon = e.action === 'approve' ? <CheckmarkCircleRegular /> : e.action === 'reject' ? <DismissCircleRegular /> : <PersonAvailableRegular />
            const what = { request: t('承認を依頼', 'requested approval'), approve: t('承認', 'approved'), reject: t('差し戻し', 'requested changes'), withdraw: t('依頼を取り下げ', 'withdrew the request') }[e.action as 'request' | 'approve' | 'reject' | 'withdraw']
            return (
              <div key={e.id} className={s.quiet}>
                {icon}
                <span className={s.full}>{`${e.actor ?? ''} ${what}`}{e.note ? `: ${e.note}` : ''}</span>
                <span>· {ago(e.created_on)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )

  return (
    <div className={s.root}>
      {/* 2. 絞り込み(参考の素材・制作の担当と締め切りは、制作向けなので「渡すもの」の側に置く) */}
      <div className={s.bar}>
        {/* 絞り込みは、一覧を切り替えるタブ(ARCHITECTURE の X75: Fluent の TabList の small、名前(件数)、0 件でも出す) */}
        <TabList size="small" selectedValue={filter} onTabSelect={(_, d) => setFilter(d.value as typeof filter)}>
          <Tab value="open">{t(`未解決(${openCount + taskCount})`, `Open (${openCount + taskCount})`)}</Tab>
          <Tab value="all">{t(`すべて(${allCount})`, `All (${allCount})`)}</Tab>
        </TabList>
      </div>

      {/* 3. 1 本の流れ */}
      <div className={s.stream}>
        {loading && <Spinner size="tiny" />}
        {!loading && rows.length === 0 && <span className={s.empty}>{filter === 'open' ? t('未解決のやり取りはありません', 'Nothing open') : t('まだやり取りはありません', 'No activity yet')}</span>}
        {rows.map((r) => {
          if (r.kind === 'event') {
            const e = r.event
            const icon = e.action === 'approve' ? <CheckmarkCircleRegular /> : e.action === 'reject' ? <DismissCircleRegular /> : <PersonAvailableRegular />
            const what = { request: t('承認を依頼', 'requested approval'), approve: t('承認', 'approved'), reject: t('差し戻し', 'requested changes'), withdraw: t('依頼を取り下げ', 'withdrew the request') }[e.action as 'request' | 'approve' | 'reject' | 'withdraw']
            return (
              <div key={e.id} className={s.quiet} title={e.note ?? ''}>
                {icon}
                <span className={s.one}>{`${e.actor ?? ''} ${what}`}</span>
                <span>· {ago(e.created_on)}</span>
              </div>
            )
          }
          const n = r.note
          const task = n.kind === 'task'
          const reps = repliesOf(n.id)
          const isOpen = openId === n.id
          const num = numbers.get(n.id)
          return (
            <div key={n.id} className={mergeClasses(s.item, isOpen && s.itemOpen)} onClick={() => open(n)}>
              {num ? <span className={mergeClasses(s.pin, !!n.resolved && s.pinDone)}>{num}</span> : task ? <TaskListSquareLtrRegular style={{ marginTop: 2 }} /> : <span />}
              <Avatar size={24} name={n.author || '?'} initials={initials(n.author)} color="colorful" />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', columnGap: 6 }}>
                  {task && <Checkbox checked={!!n.resolved} onClick={(ev) => ev.stopPropagation()} onChange={() => toggleResolved(n)} aria-label={t('済みにする', 'Mark done')} />}
                  <span className={isOpen ? s.full : s.one} style={n.resolved ? { color: tokens.colorNeutralForeground3, textDecoration: task ? 'line-through' : undefined } : undefined}><Linkify text={n.body} /></span>
                </div>
                <div className={s.meta}>
                  {[ago(n.created_on), n.assignee ? `→ ${n.assignee}` : '', task && n.due ? `〆 ${n.due.slice(5).replace('-', '/')}` : '', reps.length ? t(`返信 ${reps.length}`, `${reps.length} replies`) : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!task ? (
                <Tooltip content={n.resolved ? t('未解決に戻す', 'Reopen') : t('解決にする', 'Resolve')} relationship="label">
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={n.resolved ? <ArrowRepeatAllRegular /> : <CheckmarkRegular />}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      toggleResolved(n)
                    }}
                  />
                </Tooltip>
              ) : (
                <span />
              )}
              {isOpen && (
                <div className={s.replies} onClick={(ev) => ev.stopPropagation()}>
                  {reps.map((x) => (
                    <div key={x.id} className={s.reply}>
                      <span className={s.meta}>{x.author} · {ago(x.created_on)}</span>
                      <div className={s.full}><Linkify text={x.body} /></div>
                    </div>
                  ))}
                  <div className={s.input}>
                    <AutoTextarea heightKey="CommPane.replyText" size="small" rows={1} value={replyText} placeholder={t('返信', 'Reply')} onChange={(_, d) => setReplyText(d.value)} />
                    <Button size="small" icon={<SendRegular />} disabled={working || !replyText.trim()} onClick={() => void sendReply(n)} aria-label={t('返信する', 'Send reply')} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 4. 書く欄は 1 つ。場所は、プレビューで選んでいる部品 */}
      <div className={s.composer}>
        <div className={s.chips}>
          <Tooltip content={place ? t('プレビューで選んでいる部品に書きます(番号の点が付きます)', 'Posts on the part selected in the preview (adds a numbered dot)') : t('部品を選ばずに書くと、配信の全体への書き込みです', 'With no part selected, it is about the whole delivery')} relationship="description">
            <span className={mergeClasses(s.chip, !!place && s.chipOn)}>
              <LocationRegular />
              {place ? partName(props.part) : t('全体', 'Whole')}
            </span>
          </Tooltip>
          <Popover positioning="above-start">
            <PopoverTrigger disableButtonEnhancement>
              <button type="button" className={mergeClasses(s.chip, !!assignee && s.chipOn)}>
                <MentionRegular />
                {assignee || t('宛先', 'To')}
              </button>
            </PopoverTrigger>
            <PopoverSurface>
              <div className={s.people}>
                <Button size="small" appearance="subtle" onClick={() => setAssignee('')}>{t('宛先なし', 'No one')}</Button>
                {names.map((n) => (
                  <Button key={n} size="small" appearance={assignee === n ? 'primary' : 'subtle'} onClick={() => setAssignee(n)} style={{ justifyContent: 'flex-start' }}>
                    {n}
                  </Button>
                ))}
              </div>
            </PopoverSurface>
          </Popover>
          <button type="button" className={mergeClasses(s.chip, asTask && s.chipOn)} onClick={() => setAsTask(!asTask)}>
            <TaskListSquareLtrRegular />
            {t('タスク', 'Task')}
          </button>
        </div>
        {error && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <div className={s.input}>
          <AutoTextarea heightKey="CommPane.text"
            size="small"
            rows={1}
            value={text}
            disabled={working}
            placeholder={eligible.length > 0 ? t('書き込む(差し戻しの理由にもなります)', 'Write (also used as the reason when requesting changes)') : t('書き込む', 'Write')}
            onChange={(_, d) => setText(d.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault()
                void post()
              }
            }}
          />
          <Button size="small" appearance="primary" icon={<SendRegular />} disabled={working || !text.trim()} onClick={() => void post()} aria-label={t('書き込む', 'Post')} />
        </div>
      </div>
    </div>
  )
}
