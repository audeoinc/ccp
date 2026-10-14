import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar, Badge, Button, Field, Input, Select, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowReplyRegular, CheckmarkCircleFilled, CheckmarkCircleRegular, ChevronDownRegular, ChevronRightRegular, CommentRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons'
import { Cr854_cardnotesService, type Cr854_cardnotes } from './gcpdata/Cr854_cardnotesService'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { locale, tr, useT } from './i18n'
import { myName, setMyName } from './history'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0, paddingTop: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  // スレッド 1 つ(指摘と、その返信)
  thread: { display: 'grid', rowGap: '8px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  threadOpen: { borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}` },
  // 対応済みのスレッドは、たたんで 1 行にする(開いている指摘を見やすく)
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
  // 1 件(指摘・返信)。顔 + 名前・日時 + 本文
  entry: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  entryBody: { display: 'grid', rowGap: '2px', minWidth: 0 },
  meta: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  who: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase200 },
  body: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: tokens.colorNeutralForeground1 },
  // 返信は、指摘の下に字下げして、縦の線でつなぐ
  replies: { display: 'grid', rowGap: '8px', marginLeft: '12px', paddingLeft: '18px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  // 書いた本人だけの操作(編集・削除)。名前で見分ける(ログインで人を見分けないため)
  own: { display: 'inline-flex', columnGap: '2px', marginLeft: 'auto' },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  form: { display: 'grid', rowGap: '6px' },
  formRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px' },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。コメントは、保存してから) */
  cardId?: string
  /** 載せた商品(メールの並び順の商品 ID)。商品ごとのコメントの対象 */
  productIds: string[]
  /** 商品名の表示用(全件) */
  products: Cr854_products[]
  people: string[]
  /** 未対応の数が変わったとき(タブの数を、閉じなくても合わせるため) */
  onOpenCount?: (n: number) => void
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0)

/**
 * レビューのコメント(バックログ W5)。Confluence のように、指摘 1 つを 1 つのスレッドにして、返信でやり取りし、決着したら対応済みにする。
 * 指摘は配信全体か、載せた商品 1 つに付ける。返信は、メモの表に種類 reply で入れ、cr854_sourcenote で元の指摘につなぐ。
 * 質問と同じく、配信カードの「保存」を待たずに、その場で保存する。対応済みのスレッドは消さずに、たたんで残す
 */
export function CommentsPanel({ cardId, productIds, products, people, onOpenCount }: Props) {
  const styles = useStyles()
  const t = useT()
  const [notes, setNotes] = useState<Cr854_cardnotes[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 書く人は、配信ごとに変わらない(レビューする人)ので、ブラウザごとに覚えた名前(承認の履歴と共通)を使う
  const [author, setAuthor] = useState(myName)
  const [target, setTarget] = useState('')
  const [body, setBody] = useState('')
  // スレッドごとの返信の下書き(開いている返信の欄だけ、キーがある)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // 編集中の 1 件と、その下書き
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  // 開いて見ている、対応済みのスレッド
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await Cr854_cardnotesService.getAll({ filter: `_cr854_deliverycard_value eq ${cardId}`, orderBy: ['createdon asc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('コメントを読み込めませんでした', 'Could not load the comments'))
      return
    }
    setNotes(res.data ?? [])
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 未対応を上に、それぞれ新しい順(Confluence と同じく、いま話している指摘を先に)
  const comments = (notes ?? [])
    .filter((n) => n.cr854_kind === 'comment')
    .sort((a, b) => Number(!!a.cr854_resolved) - Number(!!b.cr854_resolved) || time(b.createdon) - time(a.createdon))
  const repliesOf = (id: string) => (notes ?? []).filter((n) => n.cr854_kind === 'reply' && n.cr854_sourcenote === id).sort((a, b) => time(a.createdon) - time(b.createdon))
  const open = comments.filter((n) => !n.cr854_resolved).length
  useEffect(() => {
    if (notes) onOpenCount?.(open)
  }, [notes, open, onOpenCount])

  const productName = (id?: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? t('(外した商品)', '(removed product)')
  // 対象に選べるのは、載せた商品(同じ商品が 2 回あっても 1 つ)
  const targets = [...new Set(productIds)]
  const me = author.trim()
  const mine = (n: Cr854_cardnotes) => !!me && (n.cr854_author ?? '').trim() === me

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setError(null)
    const res = await f()
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    await load()
    setBusy(false)
    return res.success
  }

  const add = () =>
    run(async () => {
      setMyName(author)
      const res = await Cr854_cardnotesService.create({
        'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
        ...(target ? { 'cr854_product@odata.bind': `/cr854_products(${target})` } : {}),
        cr854_kind: 'comment',
        cr854_author: me,
        cr854_body: body.trim(),
        cr854_resolved: 0,
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

  /** 返信する。resolve なら、返信してから対応済みにする(「直しました」と書いて閉じる、よくある流れを 1 回で) */
  const reply = (root: Cr854_cardnotes, resolve = false) =>
    run(async () => {
      setMyName(author)
      const id = root.cr854_cardnoteid
      const text = (drafts[id] ?? '').trim()
      if (text) {
        const res = await Cr854_cardnotesService.create({
          'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
          cr854_kind: 'reply',
          cr854_sourcenote: id,
          cr854_author: me,
          cr854_body: text,
        })
        if (!res.success) return res
      }
      if (resolve) {
        // 誰が、いつ対応済みにしたかを残す(以前は、対応した内容もここに入れていた。今は、返信として残す)
        const res = await Cr854_cardnotesService.update(id, { cr854_resolved: 1, cr854_repliedby: me, cr854_repliedat: new Date().toISOString() })
        if (!res.success) return res
      }
      closeReply(id)
      return { success: true }
    })

  const reopen = (n: Cr854_cardnotes) => run(() => Cr854_cardnotesService.update(n.cr854_cardnoteid, { cr854_resolved: 0 }))

  const saveEdit = () =>
    editing &&
    run(async () => {
      const res = await Cr854_cardnotesService.update(editing.id, { cr854_body: editing.text.trim() })
      if (res.success) setEditing(null)
      return res
    })

  /** 消す。指摘を消すときは、返信もまとめて消す(返信だけが残っても、読めないため) */
  const remove = (n: Cr854_cardnotes) => {
    const replies = n.cr854_kind === 'comment' ? repliesOf(n.cr854_cardnoteid) : []
    const ask =
      n.cr854_kind === 'comment'
        ? t(`この指摘を削除します${replies.length ? `(返信 ${replies.length} 件も削除)` : ''}。よろしいですか?`, `Delete this comment${replies.length ? ` and its ${replies.length} replies` : ''}?`)
        : t('この返信を削除します。よろしいですか?', 'Delete this reply?')
    if (!window.confirm(ask)) return
    void run(async () => {
      try {
        for (const r of replies) await Cr854_cardnotesService.delete(r.cr854_cardnoteid)
        await Cr854_cardnotesService.delete(n.cr854_cardnoteid)
        return { success: true }
      } catch (e) {
        return { success: false, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    })
  }

  // Ctrl(Mac は ⌘)+ Enter で送る(複数行を書けるよう、Enter だけでは送らない)
  const submitOnCtrlEnter = (f: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      f()
    }
  }

  /** 1 件(指摘・返信)。編集中なら、本文の代わりに入力欄 */
  const entry = (n: Cr854_cardnotes, size: 24 | 20, extra?: ReactNode, readOnly = false) => (
    <div className={styles.entry}>
      <Avatar name={n.cr854_author || '?'} size={size} color="colorful" />
      <div className={styles.entryBody}>
        <div className={styles.meta}>
          <span className={styles.who}>{n.cr854_author || t('(名前なし)', '(no name)')}</span>
          <span>{when(n.createdon)}</span>
          {extra}
          {!readOnly && mine(n) && editing?.id !== n.cr854_cardnoteid && (
            <span className={styles.own}>
              <Button size="small" appearance="transparent" icon={<EditRegular />} aria-label={t('編集', 'Edit')} title={t('編集', 'Edit')} disabled={busy} onClick={() => setEditing({ id: n.cr854_cardnoteid, text: n.cr854_body ?? '' })} />
              <Button size="small" appearance="transparent" icon={<DeleteRegular />} aria-label={t('削除', 'Delete')} title={t('削除', 'Delete')} disabled={busy} onClick={() => remove(n)} />
            </span>
          )}
        </div>
        {editing?.id === n.cr854_cardnoteid ? (
          <div className={styles.form}>
            <Textarea
              size="small"
              resize="vertical"
              autoFocus
              // 書き足すことが多いので、入力の位置を末尾にする(既定では先頭になる)
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              value={editing.text}
              onChange={(_, d) => setEditing({ id: n.cr854_cardnoteid, text: d.value })} onKeyDown={submitOnCtrlEnter(() => void saveEdit())} />
            <div className={styles.actions}>
              <Button size="small" appearance="primary" disabled={busy || !editing.text.trim()} onClick={() => void saveEdit()}>{t('保存', 'Save')}</Button>
              <Button size="small" appearance="subtle" onClick={() => setEditing(null)}>{t('やめる', 'Cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className={styles.body}>{n.cr854_body}</div>
        )}
      </div>
    </div>
  )

  const thread = (n: Cr854_cardnotes) => {
    const id = n.cr854_cardnoteid
    const replies = repliesOf(id)
    const resolved = !!n.cr854_resolved
    if (resolved && !expanded.has(id)) {
      return (
        <button key={id} type="button" className={styles.folded} onClick={() => setExpanded((s) => new Set(s).add(id))} aria-expanded={false}>
          <ChevronRightRegular />
          <CheckmarkCircleFilled className={styles.done} />
          <span className={styles.foldedText}>{`${n.cr854_author || t('(名前なし)', '(no name)')}: ${(n.cr854_body ?? '').split('\n')[0]}`}</span>
          {replies.length > 0 && <span className={styles.count}>{t(`返信 ${replies.length}`, `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`)}</span>}
        </button>
      )
    }
    const target = (
      <Badge appearance="outline" color={n._cr854_product_value ? 'brand' : 'informative'} size="small">
        {n._cr854_product_value ? productName(n._cr854_product_value) : t('配信全体', 'Whole delivery')}
      </Badge>
    )
    const replying = drafts[id] !== undefined
    return (
      <div key={id} className={mergeClasses(styles.thread, !resolved && styles.threadOpen)}>
        {entry(n, 24, target)}
        {(replies.length > 0 || n.cr854_reply) && (
          <div className={styles.replies}>
            {/* 返信の機能より前に、対応済みにしたときに書いた「対応した内容」(返信の 1 件として見せる) */}
            {n.cr854_reply && entry({ ...n, cr854_author: n.cr854_repliedby, cr854_body: n.cr854_reply, createdon: n.cr854_repliedat, cr854_cardnoteid: `${id}:fix` }, 20, undefined, true)}
            {replies.map((r) => (
              <div key={r.cr854_cardnoteid}>{entry(r, 20)}</div>
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
                  {drafts[id].trim() ? t('返信して対応済みにする', 'Reply and resolve') : t('対応済みにする', 'Resolve')}
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
                {n.cr854_repliedby ? t(`対応済み(${n.cr854_repliedby}・${when(n.cr854_repliedat)})`, `Resolved (${n.cr854_repliedby}, ${when(n.cr854_repliedat)})`) : t('対応済み', 'Resolved')}
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
                {t('対応済みにする', 'Resolve')}
              </Button>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>
          <CommentRegular />
          {t('レビューのコメント', 'Review comments')}
          {open > 0 && <Badge appearance="tint" color="warning" size="small">{t(`未対応 ${open}`, `${open} open`)}</Badge>}
        </div>
        <div className={styles.caption}>
          {t(
            '配信全体、または載せた商品に、指摘を残します。返信でやり取りして、決着したら対応済みにします。その場で保存します(配信カードの「保存」は不要です)。',
            'Leave feedback on the whole delivery or on a featured product, discuss in replies, and resolve when settled. Saved right away (no need to press Save).',
          )}
        </div>
      </div>
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、コメントを付けられます。', 'Save the delivery card to add comments.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {cardId && (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <Field label={t('あなたの名前', 'Your name')} size="small">
              <Input size="small" list="ccp-comment-people" value={author} onChange={(_, d) => setAuthor(d.value)} onBlur={() => setMyName(author)} />
            </Field>
            <Field label={t('対象', 'About')} size="small">
              <Select size="small" value={target} onChange={(_, d) => setTarget(d.value)}>
                <option value="">{t('配信全体', 'Whole delivery')}</option>
                {targets.map((id) => (
                  <option key={id} value={id}>{productName(id)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <datalist id="ccp-comment-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <Textarea
            size="small"
            resize="vertical"
            placeholder={t('レビューの指摘(例: 前日のメールと商品がかぶっている)', 'Review feedback (e.g. same products as the previous day)')}
            value={body}
            onChange={(_, d) => setBody(d.value)}
            onKeyDown={submitOnCtrlEnter(() => {
              if (body.trim() && me) void add()
            })}
          />
          <div className={styles.actions}>
            <Button size="small" appearance="primary" disabled={busy || !body.trim() || !me} onClick={() => void add()}>
              {t('コメントを追加', 'Add comment')}
            </Button>
            <span className={styles.hint}>{t('Ctrl + Enter で追加', 'Ctrl + Enter to add')}</span>
          </div>
        </div>
      )}
      {comments.map(thread)}
      {cardId && notes && comments.length === 0 && <div className={styles.caption}>{t('まだコメントはありません。', 'No comments yet.')}</div>}
    </div>
  )
}
