import { useCallback, useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar, Badge, Button, Field, Input, Select, Spinner, Textarea, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowReplyRegular, ChatRegular, CheckmarkCircleFilled, CheckmarkCircleRegular, ChevronDownRegular, ChevronRightRegular, DeleteRegular, DismissRegular, EditRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import { Linkify } from './LinkText'
import { CardNotesService, type CardNote } from './data/cardNotes'
import type { Product } from './models/products'
import { locale, optionLabel, tr, useT } from './i18n'
import { myName, myUserId, onMeChange } from './history'
import { NoteReactionsService } from './data/noteReactions'
import { NoteReactionKind, type NoteReaction } from './models/noteReactions'
import { AiButton } from './AiButton'
import { suggestTasks, type TaskIdea } from './aiTasks'
import { isThreadRoot, stageOf, type NoteStage } from './notesStage'
import { anchorLabel, bumpNotes, focusPin, focusedPin, pinNumbers, subscribePins, viewLabel } from './pinStore'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  // スレッド 1 つ(書き込みと、その返信)
  thread: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  threadOpen: { borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}` },
  // 解決したスレッドは、たたんで 1 行にする(開いているものを見やすく)
  folded: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    padding: '6px 10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  foldedText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  done: { color: tokens.colorPaletteGreenForeground1, flexShrink: 0 },
  count: { flexShrink: 0, whiteSpace: 'nowrap' },
  // 1 件(書き込み・返信)。顔 + 名前・日時 + 本文
  entry: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  entryBody: { display: 'grid', rowGap: '2px', minWidth: 0 },
  meta: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  who: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase200 },
  to: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  body: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: tokens.colorNeutralForeground1 },
  // 返信は、書き込みの下に字下げして、縦の線でつなぐ
  replies: { display: 'grid', rowGap: '8px', marginLeft: '12px', paddingLeft: '18px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  // 書いた本人だけの操作(編集・削除)。名前で見分ける(ログインがないとき)
  own: { display: 'inline-flex', columnGap: '2px', marginLeft: 'auto' },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '4px', flexWrap: 'wrap' },
  form: { display: 'grid', rowGap: '6px' },
  formRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px', rowGap: '6px' },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
  // AI のタスクの案(採用するまで保存しない)
  ideas: { display: 'grid', rowGap: '6px', padding: '8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  idea: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto auto', columnGap: '6px', rowGap: '4px', alignItems: 'center', paddingBottom: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, '& .fui-Input': { minWidth: 0, width: '100%' } },
  ideaText: { gridColumn: '1 / -1' },
  taskChip: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', fontSize: tokens.fontSizeBase100, color: tokens.colorBrandForeground1 },
  // プレビュー上の場所(ピン)。押すと、プレビューのそのピンを光らせる
  pinChip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    padding: '0 6px 0 2px',
    minHeight: '20px',
    border: `1px solid ${tokens.colorPaletteDarkOrangeBorder1}`,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase100,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorPaletteDarkOrangeBackground2 },
  },
  pinNo: {
    display: 'inline-grid',
    placeItems: 'center',
    minWidth: '16px',
    height: '16px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightBold,
  },
  // 書き込む前の、選んだ場所
  focusedThread: { boxShadow: `0 0 0 2px ${tokens.colorBrandStroke1}` },
})

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。書き込みは、保存してから) */
  cardId?: string
  /** 載せた商品(メールの並び順の商品 ID)。書き込みの対象に選べる */
  productIds: string[]
  /** 商品名の表示用(全件) */
  products: Product[]
  /** 宛先の候補(担当の名前など) */
  people: string[]
  /** 配信名・制作の担当と締め切り(AI にタスクの案を頼むときに渡す) */
  cardName: string
  productionOwner: string
  productionDue: string
  /** どの段階のやり取りを出すか(PR6。plan = 計画の配信カード / production = 制作のページ)。省略は全部 */
  stage?: NoteStage
  /** 未解決の数が変わったとき(タブの数を、閉じなくても合わせるため) */
  onOpenCount?: (n: number) => void
  /** タスクを採用したとき(タスクのタブの数を合わせる) */
  onTasksChanged?: () => void
  /** この配信の素材(X58。素材へのやり取りの札に名前を出す) */
  assets?: { id: string; name: string }[]
  /** 素材 1 つのやり取りだけを出す(素材のフロートの中。段階によらず出し、書き込みはその素材へ) */
  assetId?: string
  /** 説明の段を出さない(素材のフロートの中など、狭いところ) */
  compact?: boolean
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
/** スレッドの元になる書き込みか(以前の「質問」と「レビューのコメント」の両方。種類のない古い行は質問) */
const isRoot = isThreadRoot

/**
 * やり取り(2026-10-17 に、以前の「質問と返信」と「レビューのコメント」を 1 つにした。利用者の指摘: どちらも書いたら返事が要る)。
 * Confluence のように、書き込み 1 つを 1 つのスレッドにして、返信でやり取りし、決着したら解決にする。
 * 書き込みには、宛先(任意。返事を求める人)と対象(配信全体 / 載せた商品)を付けられる。返信のあるスレッドからは、AI でタスクの案を出せる。
 * データは card_notes のまま: 新しい書き込みは種類 comment(宛先は assignee)、返信は種類 reply(source_note で元につなぐ)。
 * 以前の質問(種類 question。返信は reply / replied_by / replied_at の列に 1 件)も、同じ一覧に出す。
 * 配信カードの「保存」を待たずに、その場で保存する。解決したスレッドは消さずに、たたんで残す
 */
export function CommentsPanel({ cardId, productIds, products, people, cardName, productionOwner, productionDue, onOpenCount, onTasksChanged, stage, assets = [], assetId, compact }: Props) {
  const styles = useStyles()
  const t = useT()
  const [notes, setNotes] = useState<CardNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 書く人は、右上のログインしている人(U9)。ここでは選ばせない(承認のブロックと同じ人で残すため)
  const author = useSyncExternalStore(onMeChange, myName)
  const [target, setTarget] = useState('')
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')
  // スレッドごとの返信の下書き(開いている返信の欄だけ、キーがある)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // 編集中の 1 件と、その下書き
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  // 開いて見ている、解決したスレッド
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // スレッドごとの、AI のタスクの案('busy' は作成中)
  const [ideas, setIdeas] = useState<Record<string, TaskIdea[] | 'busy'>>({})
  // 書き込みへのリアクション(PR6。Teams のような軽い返事。状態は変えない)
  const [reactions, setReactions] = useState<NoteReaction[]>([])
  // プレビュー上の場所(ピン)は、段階のやり取り(企画 = 配信カードのプレビュー、制作 = 制作のページのプレビュー)。素材のフロートは扱わない。
  // ピンを打って書くのは、プレビューの横のフロート(PinFloat)が受け持つ。ここは番号を出し、押すとプレビューのピンを光らせる
  const pinStage = !assetId ? stage : undefined
  const focus = useSyncExternalStore(subscribePins, focusedPin)

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('やり取りを読み込めませんでした', 'Could not load the conversation'))
      return
    }
    const list = res.data ?? []
    setNotes(list)
    // この配信の書き込みへのリアクションだけを残す(表は配信を持たないので、書き込みの id で絞る)
    const ids = new Set(list.map((n) => n.id))
    const r = await NoteReactionsService.getAll()
    setReactions(r.success ? (r.data ?? []).filter((x) => ids.has(x.card_note_id ?? '')) : [])
    // プレビューのピンも読み直す
    bumpNotes()
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 未解決を上に、それぞれ新しい順(いま話しているものを先に)
  const roots = (notes ?? []).filter((n) => isRoot(n) && (assetId ? n.asset_id === assetId : !stage || stageOf(n) === stage)).sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || time(b.created_on) - time(a.created_on))
  const repliesOf = (id: string) => (notes ?? []).filter((n) => n.kind === 'reply' && n.source_note === id).sort((a, b) => time(a.created_on) - time(b.created_on))
  const tasksFrom = (id: string) => (notes ?? []).filter((n) => n.kind === 'task' && n.source_note === id)
  const open = roots.filter((n) => !n.resolved).length
  useEffect(() => {
    if (notes) onOpenCount?.(open)
  }, [notes, open, onOpenCount])

  const productName = (id?: string) => products.find((p) => p.id === id)?.name ?? t('(外した商品)', '(removed product)')
  // 対象に選べるのは、載せた商品(同じ商品が 2 回あっても 1 つ)
  const targets = [...new Set(productIds)]
  const me = author.trim()
  const mine = (n: CardNote) => !!me && (n.author ?? '').trim() === me

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setError(null)
    const res = await f()
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    await load()
    setBusy(false)
    return res.success
  }

  // ピンを押したら、そのスレッドを見える位置に出す(解決してたたんでいれば、開く)
  useEffect(() => {
    if (!focus || !notes?.some((n) => n.id === focus.noteId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded((s) => (s.has(focus.noteId) ? s : new Set(s).add(focus.noteId)))
    window.setTimeout(() => document.querySelector(`[data-thread-id="${CSS.escape(focus.noteId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120)
  }, [focus, notes])
  const pinNo = pinStage ? pinNumbers(notes ?? [], pinStage) : new Map<string, number>()

  const add = () =>
    run(async () => {
      const res = await CardNotesService.create({
        delivery_card_id: cardId,
        ...(assetId ? { asset_id: assetId } : target ? { product_id: target } : {}),
        kind: 'comment',
        ...(stage ? { stage } : {}),
        author: me,
        ...(to.trim() ? { assignee: to.trim() } : {}),
        body: body.trim(),
        resolved: 0,
      })
      if (res.success) setBody('')
      return res
    })

  const closeReply = (id: string) =>
    setDrafts((x) => {
      const next = { ...x }
      delete next[id]
      return next
    })

  /** 返信する。resolve なら、返信してから解決にする(「直しました」と書いて閉じる、よくある流れを 1 回で) */
  const reply = (root: CardNote, resolve = false) =>
    run(async () => {
      const id = root.id
      const text = (drafts[id] ?? '').trim()
      if (text) {
        const res = await CardNotesService.create({ delivery_card_id: cardId, kind: 'reply', source_note: id, author: me, body: text })
        if (!res.success) return res
      }
      if (resolve) {
        // 以前の質問は replied_by / replied_at に返信した人を持っているので、解決した人では上書きしない
        const res = await CardNotesService.update(id, root.kind === 'comment' ? { resolved: 1, replied_by: me, replied_at: new Date().toISOString() } : { resolved: 1 })
        if (!res.success) return res
      }
      closeReply(id)
      return { success: true }
    })

  const reopen = (n: CardNote) => run(() => CardNotesService.update(n.id, { resolved: 0 }))

  const saveEdit = () =>
    editing &&
    run(async () => {
      const res = await CardNotesService.update(editing.id, { body: editing.text.trim() })
      if (res.success) setEditing(null)
      return res
    })

  /** 消す。書き込みを消すときは、返信もまとめて消す(返信だけが残っても、読めないため) */
  const remove = async (n: CardNote) => {
    const replies = isRoot(n) ? repliesOf(n.id) : []
    const ask = isRoot(n)
      ? t(`この書き込みを削除します${replies.length ? `(返信 ${replies.length} 件も削除)` : ''}。よろしいですか?`, `Delete this post${replies.length ? ` and its ${replies.length} replies` : ''}?`)
      : t('この返信を削除します。よろしいですか?', 'Delete this reply?')
    if (!(await confirmDialog(ask))) return
    void run(async () => {
      try {
        for (const r of replies) await CardNotesService.delete(r.id)
        await CardNotesService.delete(n.id)
        return { success: true }
      } catch (e) {
        return { success: false, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    })
  }

  // ---- AI のタスクの案(返信のあるスレッドから。以前は質問だけにあった)
  const propose = async (n: CardNote) => {
    const id = n.id
    const replies = repliesOf(id)
    const replyText = [n.reply ?? '', ...replies.map((r) => `${r.author ?? ''}: ${r.body ?? ''}`)].filter(Boolean).join('\n')
    setIdeas((x) => ({ ...x, [id]: 'busy' }))
    try {
      const list = await suggestTasks({
        question: n.body ?? '',
        reply: replyText,
        asker: n.author ?? productionOwner,
        replier: n.replied_by ?? replies[replies.length - 1]?.author ?? n.assignee ?? '',
        card: { name: cardName, productionDue },
        existing: tasksFrom(id).map((x) => x.body ?? ''),
      })
      setIdeas((x) => ({ ...x, [id]: list }))
    } catch (e) {
      setIdeas((x) => {
        const next = { ...x }
        delete next[id]
        return next
      })
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const editIdea = (rid: string, i: number, patch: Partial<TaskIdea>) =>
    setIdeas((x) => {
      const list = x[rid]
      if (!Array.isArray(list)) return x
      return { ...x, [rid]: list.map((it, k) => (k === i ? { ...it, ...patch } : it)) }
    })
  const dropIdea = (rid: string, i: number) =>
    setIdeas((x) => {
      const list = x[rid]
      if (!Array.isArray(list)) return x
      return { ...x, [rid]: list.filter((_, k) => k !== i) }
    })
  const adopt = (rid: string, i: number, idea: TaskIdea) =>
    run(async () => {
      const res = await CardNotesService.create({ delivery_card_id: cardId, kind: 'task', body: idea.text.trim(), assignee: idea.assignee.trim(), due: idea.due || undefined, source_note: rid, resolved: 0 })
      if (res.success) {
        dropIdea(rid, i)
        onTasksChanged?.()
      }
      return res
    })

  // Ctrl(Mac は ⌘)+ Enter で送る(複数行を書けるよう、Enter だけでは送らない)
  const submitOnCtrlEnter = (f: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      f()
    }
  }

  /** 1 件(書き込み・返信)。編集中なら、本文の代わりに入力欄 */
  const entry = (n: CardNote, size: 24 | 20, extra?: ReactNode, readOnly = false) => (
    <div className={styles.entry}>
      <Avatar name={n.author || '?'} size={size} color="colorful" />
      <div className={styles.entryBody}>
        <div className={styles.meta}>
          <span className={styles.who}>{n.author || t('(名前なし)', '(no name)')}</span>
          {isRoot(n) && n.assignee && <span className={styles.to}>{`→ ${n.assignee}`}</span>}
          <span>{when(n.created_on)}</span>
          {extra}
          {!readOnly && mine(n) && editing?.id !== n.id && (
            <span className={styles.own}>
              <Button size="small" appearance="transparent" icon={<EditRegular />} aria-label={t('編集', 'Edit')} title={t('編集', 'Edit')} disabled={busy} onClick={() => setEditing({ id: n.id, text: n.body ?? '' })} />
              <Button size="small" appearance="transparent" icon={<DeleteRegular />} aria-label={t('削除', 'Delete')} title={t('削除', 'Delete')} disabled={busy} onClick={() => remove(n)} />
            </span>
          )}
        </div>
        {editing?.id === n.id ? (
          <div className={styles.form}>
            <Textarea
              size="small"
              resize="vertical"
              autoFocus
              // 書き足すことが多いので、入力の位置を末尾にする(既定では先頭になる)
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              value={editing.text}
              onChange={(_, d) => setEditing({ id: n.id, text: d.value })}
              onKeyDown={submitOnCtrlEnter(() => void saveEdit())}
            />
            <div className={styles.actions}>
              <Button size="small" appearance="primary" disabled={busy || !editing.text.trim()} onClick={() => void saveEdit()}>{t('保存', 'Save')}</Button>
              <Button size="small" appearance="subtle" onClick={() => setEditing(null)}>{t('やめる', 'Cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className={styles.body}><Linkify text={n.body} /></div>
        )}
        {!readOnly && <ReactionBar noteId={n.id} reactions={reactions.filter((r) => r.card_note_id === n.id)} onChanged={() => void load()} />}
      </div>
    </div>
  )

  const thread = (n: CardNote) => {
    const id = n.id
    const replies = repliesOf(id)
    const resolved = !!n.resolved
    const hasReply = replies.length > 0 || !!n.reply
    const tasks = tasksFrom(id).length
    if (resolved && !expanded.has(id)) {
      return (
        <button key={id} type="button" className={styles.folded} onClick={() => setExpanded((s) => new Set(s).add(id))} aria-expanded={false}>
          <ChevronRightRegular />
          <CheckmarkCircleFilled className={styles.done} />
          <span className={styles.foldedText}>{`${n.author || t('(名前なし)', '(no name)')}: ${(n.body ?? '').split('\n')[0]}`}</span>
          {(replies.length > 0 || n.reply) && <span className={styles.count}>{t(`返信 ${replies.length + (n.reply ? 1 : 0)}`, `${replies.length + (n.reply ? 1 : 0)} repl${replies.length + (n.reply ? 1 : 0) === 1 ? 'y' : 'ies'}`)}</span>}
        </button>
      )
    }
    const assetName = n.asset_id ? (assets.find((a) => a.id === n.asset_id)?.name ?? t('素材', 'Asset')) : ''
    const targetBadge = assetId ? null : (
      <Badge appearance="outline" color={n.product_id ? 'brand' : n.asset_id ? 'important' : 'informative'} size="small">
        {n.asset_id ? t(`素材: ${assetName}`, `Asset: ${assetName}`) : n.product_id ? productName(n.product_id) : t('配信全体', 'Whole delivery')}
      </Badge>
    )
    const replying = drafts[id] !== undefined
    const list = ideas[id]
    const no = pinNo.get(id)
    const pinBadge = no ? (
      <button type="button" className={styles.pinChip} onClick={() => focusPin(id)} title={t('プレビューでこの場所を見る', 'Show this spot in the preview')}>
        <span className={styles.pinNo}>{no}</span>
        {/* 商品の枠のときは、商品名は対象の札に出ているので、ここは「商品」だけ */}
        {anchorLabel(n.anchor ?? '')}
        {viewLabel(n.anchor_view) && `(${viewLabel(n.anchor_view)})`}
      </button>
    ) : null
    return (
      <div key={id} data-thread-id={id} className={mergeClasses(styles.thread, !resolved && styles.threadOpen, focus?.noteId === id && styles.focusedThread)}>
        {entry(
          n,
          24,
          <>
            {targetBadge}
            {pinBadge}
          </>,
        )}
        {hasReply && (
          <div className={styles.replies}>
            {/* 以前の質問の返信(1 件だけ列に持っていた)。返信の 1 件として見せる */}
            {n.reply && entry({ ...n, kind: 'reply', author: n.replied_by, body: n.reply, created_on: n.replied_at, id: `${id}:reply` }, 20, undefined, true)}
            {replies.map((r) => (
              <div key={r.id}>{entry(r, 20)}</div>
            ))}
          </div>
        )}
        {replying && (
          <div className={styles.form}>
            <Textarea
              size="small"
              resize="vertical"
              autoFocus
              placeholder={t('返信を書く(例: 商品を差し替えました)', 'Write a reply (e.g. swapped the product)')}
              value={drafts[id]}
              onChange={(_, d) => setDrafts((x) => ({ ...x, [id]: d.value }))}
              onKeyDown={submitOnCtrlEnter(() => void reply(n))}
            />
            <div className={styles.actions}>
              <Button size="small" appearance="primary" disabled={busy || !me || !drafts[id].trim()} onClick={() => void reply(n)}>{t('返信', 'Reply')}</Button>
              {!resolved && (
                <Button size="small" icon={<CheckmarkCircleRegular />} disabled={busy || !me} onClick={() => void reply(n, true)}>
                  {drafts[id].trim() ? t('返信して解決にする', 'Reply and resolve') : t('解決にする', 'Resolve')}
                </Button>
              )}
              <Button size="small" appearance="subtle" onClick={() => closeReply(id)}>{t('やめる', 'Cancel')}</Button>
              <span className={styles.hint}>{t('Ctrl + Enter で返信', 'Ctrl + Enter to reply')}</span>
            </div>
          </div>
        )}
        <div className={styles.actions}>
          {!replying && (
            <Button size="small" appearance="subtle" icon={<ArrowReplyRegular />} disabled={busy} onClick={() => setDrafts((x) => ({ ...x, [id]: '' }))}>
              {t('返信', 'Reply')}
            </Button>
          )}
          {resolved ? (
            <>
              <Badge appearance="tint" color="success" size="small" icon={<CheckmarkCircleRegular />}>
                {n.kind === 'comment' && n.replied_by ? t(`解決(${n.replied_by}・${when(n.replied_at)})`, `Resolved (${n.replied_by}, ${when(n.replied_at)})`) : t('解決', 'Resolved')}
              </Badge>
              <Button size="small" appearance="subtle" disabled={busy} onClick={() => void reopen(n)}>{t('もう一度開く', 'Reopen')}</Button>
              <Button
                size="small"
                appearance="subtle"
                icon={<ChevronDownRegular />}
                onClick={() =>
                  setExpanded((s) => {
                    const next = new Set(s)
                    next.delete(id)
                    return next
                  })
                }
              >
                {t('たたむ', 'Collapse')}
              </Button>
            </>
          ) : (
            !replying && (
              <Button size="small" appearance="subtle" icon={<CheckmarkCircleRegular />} disabled={busy || !me} onClick={() => void reply(n, true)}>
                {t('解決にする', 'Resolve')}
              </Button>
            )
          )}
          {hasReply && (
            <AiButton busy={list === 'busy'} disabled={busy} onClick={() => void propose(n)}>
              {t('AIでタスクを出す', 'Suggest tasks with AI')}
            </AiButton>
          )}
          {tasks > 0 && (
            <span className={styles.taskChip}>
              <TaskListLtrRegular />
              {t(`タスク ${tasks} 件`, `${tasks} task(s)`)}
            </span>
          )}
        </div>
        {Array.isArray(list) && (
          <div className={styles.ideas}>
            <div className={styles.hint}>
              {list.length ? t('AI のタスクの案(「採用」で、タスクのタブに入ります)', 'AI task ideas (Adopt adds them to the Tasks tab)') : t('このやり取りから、新しいタスクは見つかりませんでした。', 'No new tasks found in this exchange.')}
            </div>
            {list.map((idea, i) => (
              <div key={i} className={styles.idea}>
                <Input size="small" className={styles.ideaText} value={idea.text} onChange={(_, d) => editIdea(id, i, { text: d.value })} aria-label={t('タスク', 'Task')} />
                <Input size="small" list="ccp-thread-people" value={idea.assignee} onChange={(_, d) => editIdea(id, i, { assignee: d.value })} aria-label={t('担当', 'Assignee')} />
                <Input size="small" type="date" value={idea.due} onChange={(_, d) => editIdea(id, i, { due: d.value })} aria-label={t('期日', 'Due')} />
                <Button size="small" appearance="primary" disabled={busy || !idea.text.trim()} onClick={() => void adopt(id, i, idea)}>{t('採用', 'Adopt')}</Button>
                <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('外す', 'Dismiss')} onClick={() => dropIdea(id, i)} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div hidden={compact}>
        <div className={styles.head}>
          <ChatRegular />
          {t('やり取り', 'Conversation')}
          {open > 0 && <Badge appearance="tint" color="warning" size="small">{t(`未解決 ${open}`, `${open} open`)}</Badge>}
        </div>
        <div className={styles.caption}>
          {t(
            '質問・指摘・相談を書き、返信でやり取りして、決着したら解決にします。宛先を入れると、その人に返事を求めます。その場で保存します(配信カードの「保存」は不要です)。',
            'Post questions, feedback or notes, discuss in replies, and resolve when settled. Add a recipient to ask that person for a reply. Saved right away (no need to press Save).',
          )}
        </div>
      </div>
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、書き込めます。', 'Save the delivery card to post.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {cardId && (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <Field label={t('宛先(任意)', 'To (optional)')} size="small">
              <Input size="small" list="ccp-thread-people" value={to} onChange={(_, d) => setTo(d.value)} placeholder={t('返事を求める人', 'Who should reply')} />
            </Field>
            {!assetId && (
              <Field label={t('対象', 'About')} size="small">
                <Select size="small" value={target} onChange={(_, d) => setTarget(d.value)}>
                  <option value="">{t('配信全体', 'Whole delivery')}</option>
                  {targets.map((id) => (
                    <option key={id} value={id}>{productName(id)}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <datalist id="ccp-thread-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {pinStage && <span className={styles.hint}>{t('場所を指して書くときは、プレビューを右クリック(または「コメントを置く」)。', 'To point at a spot, right-click the preview (or use "Place comment").')}</span>}
          <Textarea
            size="small"
            resize="vertical"
            placeholder={t('例: セールの終わりは日曜 23:59 ですか? / 前日のメールと商品がかぶっています', 'e.g. Does the sale end Sunday 11:59 PM? / Same products as the previous day')}
            value={body}
            onChange={(_, d) => setBody(d.value)}
            onKeyDown={submitOnCtrlEnter(() => {
              if (body.trim() && me) void add()
            })}
          />
          <div className={styles.actions}>
            <Button size="small" appearance="primary" disabled={busy || !body.trim() || !me} onClick={() => void add()}>
              {t('書き込む', 'Post')}
            </Button>
            <span className={styles.hint}>{me ? t('Ctrl + Enter で書き込む', 'Ctrl + Enter to post') : t('右上で、だれでログインするかを選ぶと、書き込めます', 'Choose who is signed in at the top right to post')}</span>
          </div>
        </div>
      )}
      {roots.map(thread)}
      {cardId && notes && roots.length === 0 && <div className={styles.caption}>{t('まだ書き込みはありません。', 'Nothing posted yet.')}</div>}
    </div>
  )
}

// リアクションの種類と、その絵(Teams のような軽い返事)
const REACTION_ICON: Record<keyof typeof NoteReactionKind, string> = { ok: '👍', looking: '👀', doing: '✅', thanks: '🙏', question: '❓' }
const subscribeReactMe = (f: () => void) => onMeChange(f)

/**
 * 書き込み 1 件のリアクション(バックログ PR6)。押した数と、押した人(マウスを重ねると出る)。自分が押したものは、もう一度押すと外れる。
 * 「受け取った」のような状態を進めるものは、ここではなく、制作のページのボタン
 */
function ReactionBar({ noteId, reactions, onChanged }: { noteId: string; reactions: NoteReaction[]; onChanged: () => void }) {
  const t = useT()
  const styles = useReactionStyles()
  const meId = useSyncExternalStore(subscribeReactMe, myUserId)
  const meName = useSyncExternalStore(subscribeReactMe, myName)
  const [busy, setBusy] = useState(false)
  const toggle = async (kind: keyof typeof NoteReactionKind) => {
    if (!meId) return
    setBusy(true)
    const mine = reactions.find((r) => r.kind === kind && r.user_id === meId)
    if (mine) await NoteReactionsService.delete(mine.id)
    else await NoteReactionsService.create({ card_note_id: noteId, user_id: meId, user_name: meName, kind })
    setBusy(false)
    onChanged()
  }
  const kinds = Object.keys(NoteReactionKind) as (keyof typeof NoteReactionKind)[]
  return (
    <div className={styles.bar}>
      {kinds.map((k) => {
        const by = reactions.filter((r) => r.kind === k)
        const mine = by.some((r) => r.user_id === meId)
        const label = `${optionLabel(NoteReactionKind[k])}${by.length ? `: ${by.map((r) => r.user_name).join('・')}` : ''}`
        // 押されていない種類は、薄く小さく出す(並びが動かないよう、いつも全部出す)
        return (
          <Tooltip key={k} content={meId ? label : t('右上で、だれでログインするかを選ぶと、押せます', 'Choose who is signed in at the top right to react')} relationship="label">
            <button type="button" className={mergeClasses(styles.chip, by.length > 0 && styles.used, mine && styles.mine)} disabled={busy || !meId} onClick={() => void toggle(k)}>
              <span>{REACTION_ICON[k]}</span>
              {by.length > 0 && <span>{by.length}</span>}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

const useReactionStyles = makeStyles({
  bar: { display: 'flex', columnGap: '4px', rowGap: '4px', flexWrap: 'wrap', marginTop: '2px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '3px',
    padding: '0 6px',
    minHeight: '20px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid transparent`,
    backgroundColor: 'transparent',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    opacity: 0.45,
    cursor: 'pointer',
    ':hover': { opacity: 1, backgroundColor: tokens.colorNeutralBackground1Hover },
    ':disabled': { cursor: 'default' },
  },
  used: { opacity: 1, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  mine: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
})
