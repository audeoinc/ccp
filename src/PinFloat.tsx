import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Avatar, Button, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, mergeClasses, tokens, type PositioningImperativeRef, type PositioningVirtualElement } from '@fluentui/react-components'
import { ArrowRepeatAllRegular, CheckmarkRegular, DeleteRegular, DismissRegular, EditRegular, MentionRegular, SendRegular } from '@fluentui/react-icons'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { AutoTextarea } from './AutoTextarea'
import { myName, onMeChange } from './history'
import { activeUsers, usePeople } from './people'
import { anchorLabel, bumpNotes, focusPin, notesVersion, pendingPin, pinNumbers, setPendingPin, subscribePins } from './pinStore'
import type { NoteStage } from './notesStage'
import { locale, tr, useT } from './i18n'
import { setNoteResolved } from './pinActions'

const useStyles = makeStyles({
  surface: { width: '320px', padding: '10px 12px', display: 'grid', rowGap: '8px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  headText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pin: { width: '18px', height: '18px', borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: '11px', fontWeight: tokens.fontWeightBold, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  pinNew: { backgroundColor: tokens.colorBrandBackground },
  pinDone: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground3 },
  // 元の書き込みと返信を、上から読む(長くなったら、この中だけスクロール)
  thread: { display: 'grid', rowGap: '8px', maxHeight: 'calc(46vh / var(--ui-zoom, 1))', overflowY: 'auto' },
  entry: { display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  reply: { marginLeft: '16px' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  body: { fontSize: tokens.fontSizeBase300, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  done: { color: tokens.colorNeutralForeground3 },
  input: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'end' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', padding: '2px 8px', borderRadius: '999px', border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, cursor: 'pointer' },
  chipOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  people: { display: 'grid', rowGap: '2px', maxHeight: '220px', overflowY: 'auto' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '4px' },
  hint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, marginLeft: 'auto' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

const subscribeMe = (f: () => void) => onMeChange(f)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** いま開いているフロート: 刺さっているピンのスレッド(書き込みの ID)か、打ったばかりのピン(まだ書いていない) */
export type PinTarget = { noteId: string } | { pending: true }

interface Props {
  cardId: string
  /** 名前を選んでいない人が書いたときの書き手(配信の担当) */
  cardOwner?: string
  /** どの段階のやり取りか(配信カードのプレビュー = plan、制作のページのプレビュー = production) */
  stage: NoteStage
  /** ピンの要素(data-pin-id)を探す所。プレビューの枠か、制作のページの iframe の文書 */
  root: () => ParentNode | null
  target: PinTarget
  productName?: (productId: string) => string
  /** 書いたら、そのスレッドに切り替える */
  onTarget: (t: PinTarget) => void
  onClose: () => void
  /** 「この部品を直す」: ピンの場所の部品を選ぶ処理(選べる部品がない場所・画面では null) */
  editSpot?: (anchor: string, productId?: string) => (() => void) | null
}

/** iframe の中の要素は、枠の位置を足した仮の要素にする(フロートは親の文書に出すため) */
function anchorOf(el: Element): Element | PositioningVirtualElement {
  const frame = el.ownerDocument.defaultView?.frameElement
  if (!frame || el.ownerDocument === document) return el
  return {
    contextElement: frame,
    getBoundingClientRect: () => {
      const f = frame.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      // 枠ごと縮めて見せている(表示の大きさ)ときは、その比で合わせる
      const k = (frame as HTMLElement).offsetWidth > 0 ? f.width / (frame as HTMLElement).offsetWidth : 1
      return DOMRect.fromRect({ x: f.left + frame.clientLeft * k + r.left * k, y: f.top + frame.clientTop * k + r.top * k, width: r.width * k, height: r.height * k })
    },
  }
}

/**
 * プレビューのピンのフロート(2026-10-23 利用者: コメントはほとんどピン経由になるので、ピンだけで作業を進められるように)。
 * ピンを打ったら、その場で書く。刺さっているピンを押したら、そのやり取りを読んで、返信・解決する。
 * 配信カード(シンプル・詳しい)と制作のページの、ピンを置けるプレビューすべてで使う。右のやり取りの欄は、ピンのないものも含めた全部の流れとして残す。
 * データは同じ card_notes で、書いたら bumpNotes で、やり取りの欄とピンを読み直す
 */
export function PinFloat({ cardId, cardOwner, stage, root: findRoot, target, productName = () => '', onTarget, onClose, editSpot }: Props) {
  const s = useStyles()
  const t = useT()
  const meName = useSyncExternalStore(subscribeMe, myName)
  const people = usePeople()
  const version = useSyncExternalStore(subscribePins, notesVersion)
  const pendingAll = useSyncExternalStore(subscribePins, pendingPin)
  const pending = 'pending' in target && pendingAll && pendingAll.cardId === cardId && pendingAll.stage === stage ? pendingAll : null
  const noteId = 'noteId' in target ? target.noteId : null
  const [notes, setNotes] = useState<CardNote[] | null>(null)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // フロートを付けるピンの要素。ピンは間隔を空けて描き直されるので、見つかるまで探す(打った直後・書いた直後は、まだ無い)
  const [anchorEl, setAnchorEl] = useState<Element | null>(null)
  const pinKey = noteId ?? 'pending'
  const rootRef = useRef(findRoot)
  useEffect(() => {
    rootRef.current = findRoot
  })
  // iframe の中のスクロール・倍率の変化は、フロートの位置の自動の追従に入らないので、間隔を空けて置き直す
  const positioningRef = useRef<PositioningImperativeRef>(null)
  useEffect(() => {
    const find = () => {
      const el = rootRef.current()?.querySelector(`[data-pin-id="${CSS.escape(pinKey)}"]`) ?? null
      setAnchorEl((o) => (o === el ? o : el))
      positioningRef.current?.updatePosition()
    }
    find()
    const timer = window.setInterval(find, 200)
    return () => window.clearInterval(timer)
  }, [pinKey])
  const [anchor_, setAnchor_] = useState<Element | PositioningVirtualElement | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchor_(anchorEl ? anchorOf(anchorEl) : null)
  }, [anchorEl])

  const load = useCallback(async () => {
    const res = await CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] })
    if (res.success) setNotes(res.data ?? [])
  }, [cardId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, version])

  // ピンが変わったら、書きかけを捨てる(別のピンの返信に混ざらないように)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText('')
    setError(null)
  }, [pinKey])

  const root = noteId ? (notes ?? []).find((n) => n.id === noteId) : undefined
  const replies = root ? (notes ?? []).filter((n) => n.kind === 'reply' && n.source_note === root.id).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? '')) : []
  const no = root ? pinNumbers(notes ?? [], stage).get(root.id) : undefined
  const anchor = root?.anchor ?? pending?.anchor ?? ''
  const productId = root?.product_id ?? pending?.productId
  const place = anchorLabel(anchor, productId ? productName(productId) : undefined)
  const edit = editSpot?.(anchor, productId) ?? null
  const userNames = activeUsers(people).map((u) => u.name ?? '').filter(Boolean)
  const me = meName.trim()

  const run = async (f: () => Promise<{ success: boolean; data?: CardNote; error?: { message: string } }>) => {
    setWorking(true)
    setError(null)
    try {
      const r = await f()
      if (!r.success) throw new Error(r.error?.message ?? tr('保存できませんでした', 'Could not save'))
      bumpNotes()
      await load()
      return r
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setWorking(false)
    }
  }

  const post = async () => {
    const body = text.trim()
    if (!body || !pending) return
    const r = await run(() =>
      CardNotesService.create({
        delivery_card_id: cardId,
        kind: 'comment',
        stage,
        author: me || cardOwner || '',
        body,
        ...(assignee ? { assignee } : {}),
        anchor: pending.anchor,
        anchor_x: pending.x,
        anchor_y: pending.y,
        anchor_view: pending.view,
        ...(pending.productId ? { product_id: pending.productId } : {}),
        resolved: 0,
      }),
    )
    if (r?.data) {
      setText('')
      setAssignee('')
      setPendingPin(null)
      // 書いたピンを光らせたまま、そのやり取りに切り替える(続けて返事を待つ・読み直すため)
      focusPin(r.data.id)
      onTarget({ noteId: r.data.id })
    }
  }
  const sendReply = async () => {
    const body = text.trim()
    if (!body || !root) return
    const r = await run(() => CardNotesService.create({ delivery_card_id: cardId, kind: 'reply', stage, author: me || cardOwner || '', body, source_note: root.id }))
    if (r) setText('')
  }
  const toggleResolved = () => root && void run(() => setNoteResolved(root, !root.resolved, me))
  /** 自分の書き込みを消す(返信もまとめて。返信だけが残っても、読めないため) */
  const remove = async () => {
    if (!root) return
    if (!window.confirm(replies.length ? tr(`このコメントを消します(返信 ${replies.length} 件も消えます)。よろしいですか?`, `Delete this comment and its ${replies.length} replies?`) : tr('このコメントを消します。よろしいですか?', 'Delete this comment?'))) return
    const r = await run(async () => {
      try {
        for (const x of replies) await CardNotesService.delete(x.id)
        await CardNotesService.delete(root.id)
        return { success: true }
      } catch (e) {
        return { success: false, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    })
    if (r) onClose()
  }

  const close = () => {
    // 打っただけで書かずに閉じたピンは、残さない
    if (pending) setPendingPin(null)
    onClose()
  }

  const entry = (n: CardNote, isReply = false) => (
    <div key={n.id} className={mergeClasses(s.entry, isReply && s.reply)}>
      <Avatar size={24} name={n.author || '?'} color="colorful" />
      <div style={{ minWidth: 0 }}>
        <div className={s.meta}>{[n.author || t('(名前なし)', '(no name)'), !isReply && n.assignee ? `→ ${n.assignee}` : '', when(n.created_on)].filter(Boolean).join(' · ')}</div>
        <div className={mergeClasses(s.body, !!root?.resolved && s.done)}>{n.body}</div>
      </div>
    </div>
  )

  if (!anchor_) return null
  return (
    <Popover
      open
      positioning={{ target: anchor_, positioningRef, position: 'after', align: 'top', offset: 8 }}
      withArrow
      trapFocus={false}
      onOpenChange={(ev, d) => {
        // 別のピンを押したときは、そのピンが開き直す(ここで閉じると、押した順によっては開かない)
        if (!d.open && !(ev.target instanceof Element && ev.target.closest('[data-pin-id]'))) close()
      }}
    >
      <PopoverSurface className={s.surface} aria-label={t('ピンのコメント', 'Pin comment')}>
        <div className={s.head}>
          <span className={mergeClasses(s.pin, !root && s.pinNew, !!root?.resolved && s.pinDone)}>{no ?? '+'}</span>
          <span className={s.headText}>{place}</span>
          {edit && (
            <Tooltip content={t('この場所の部品を選んで、直す', 'Select this part to edit it')} relationship="label">
              <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={edit} />
            </Tooltip>
          )}
          {root && me && (root.author ?? '').trim() === me && (
            <Tooltip content={t('このコメントを消す', 'Delete this comment')} relationship="label">
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={working} onClick={() => void remove()} />
            </Tooltip>
          )}
          <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={close} aria-label={t('閉じる', 'Close')} />
        </div>
        {noteId && !root ? (
          notes === null ? <Spinner size="tiny" /> : <span className={s.meta}>{t('このコメントは消されました', 'This comment was deleted')}</span>
        ) : (
          <>
            {root && (
              <div className={s.thread}>
                {entry(root)}
                {replies.map((r) => entry(r, true))}
              </div>
            )}
            {!root && (
              <div className={s.chips}>
                <Popover positioning="below-start">
                  <PopoverTrigger disableButtonEnhancement>
                    <button type="button" className={mergeClasses(s.chip, !!assignee && s.chipOn)}>
                      <MentionRegular />
                      {assignee || t('宛先', 'To')}
                    </button>
                  </PopoverTrigger>
                  <PopoverSurface>
                    <div className={s.people}>
                      <Button size="small" appearance="subtle" onClick={() => setAssignee('')}>{t('宛先なし', 'No one')}</Button>
                      {userNames.map((n) => (
                        <Button key={n} size="small" appearance={assignee === n ? 'primary' : 'subtle'} onClick={() => setAssignee(n)} style={{ justifyContent: 'flex-start' }}>
                          {n}
                        </Button>
                      ))}
                    </div>
                  </PopoverSurface>
                </Popover>
              </div>
            )}
            <div className={s.input}>
              <AutoTextarea
                size="small"
                rows={root ? 1 : 2}
                autoFocus
                value={text}
                disabled={working}
                placeholder={root ? t('返信', 'Reply') : t('この場所へのコメント', 'Comment on this spot')}
                onChange={(_, d) => setText(d.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault()
                    void (root ? sendReply() : post())
                  }
                }}
              />
              <Button size="small" appearance="primary" icon={working ? <Spinner size="extra-tiny" /> : <SendRegular />} disabled={working || !text.trim()} onClick={() => void (root ? sendReply() : post())} aria-label={root ? t('返信する', 'Send reply') : t('書き込む', 'Post')} />
            </div>
            <div className={s.actions}>
              {root && (
                <Button size="small" appearance="subtle" icon={root.resolved ? <ArrowRepeatAllRegular /> : <CheckmarkRegular />} disabled={working} onClick={toggleResolved}>
                  {root.resolved ? t('未解決に戻す', 'Reopen') : t('解決にする', 'Resolve')}
                </Button>
              )}
              <span className={s.hint}>{t('Ctrl + Enter で送る', 'Ctrl + Enter to send')}</span>
            </div>
          </>
        )}
        {error && <span className={s.error}>{error}</span>}
      </PopoverSurface>
    </Popover>
  )
}
