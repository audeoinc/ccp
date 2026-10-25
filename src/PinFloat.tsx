import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowRepeatAllRegular, CheckmarkRegular, DeleteRegular, EditRegular, MentionRegular } from '@fluentui/react-icons'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { myName, onMeChange } from './history'
import { activeUsers, usePeople } from './people'
import { anchorLabel, bumpNotes, focusPin, notesVersion, pendingPin, pinNumbers, setPendingPin, subscribePins } from './pinStore'
import type { NoteStage } from './notesStage'
import { tr, useT } from './i18n'
import { setNoteResolved } from './pinActions'
import { usePinAnchor } from './pinAnchor'
import { PinThreadView } from './PinThreadView'
import { PinThenImage } from './PinThenImage'
import { attachCapture, saveNoteImage, captureKey } from './pinSnapshot'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  pin: { width: '18px', height: '18px', borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: '11px', fontWeight: tokens.fontWeightBold, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  pinNew: { backgroundColor: tokens.colorBrandBackground },
  pinDone: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground3 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', padding: '2px 8px', borderRadius: '999px', border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, cursor: 'pointer' },
  chipOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  people: { display: 'grid', rowGap: '2px', maxHeight: '220px', overflowY: 'auto' },
  // 書いたときの様子(X65 (b))。全景が見えるよう、切らずに縮める
  then: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  changed: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
})

const subscribeMe = (f: () => void) => onMeChange(f)

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
  const pinKey = noteId ?? 'pending'
  const { target: anchorTarget, positioningRef } = usePinAnchor(findRoot, pinKey)

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
  // ピンの層が、書いたときと中身が違うピンに印(data-changed)を付けている(PreviewPins)
  const changed = anchorTarget instanceof Element && anchorTarget.hasAttribute('data-changed')

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
        // 書いたときの様子(X65 (b))。文字はここで、画像は打ったときに作り始めていて、できたら付ける(attachCapture)
        ...(pending.snapshot ? { anchor_snapshot: pending.snapshot } : {}),
        resolved: 0,
      }),
    )
    if (r?.data) {
      attachCapture(captureKey(cardId, pending.anchor, pending.x, pending.y), saveNoteImage(r.data.id), bumpNotes)
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
    if (!(await confirmDialog(replies.length ? tr(`このコメントを削除します(返信 ${replies.length} 件も削除されます)。よろしいですか?`, `Delete this comment and its ${replies.length} replies?`) : tr('このコメントを削除します。よろしいですか?', 'Delete this comment?')))) return
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

  return (
    <PinThreadView
      target={anchorTarget}
      positioningRef={positioningRef}
      ariaLabel={t('ピンのコメント', 'Pin comment')}
      badge={<span className={mergeClasses(s.pin, !root && s.pinNew, !!root?.resolved && s.pinDone)}>{no ?? '+'}</span>}
      place={place}
      headActions={
        <>
          {edit && (
            <Tooltip content={t('この場所の部品を選んで、直す', 'Select this part to edit it')} relationship="label">
              <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={edit} />
            </Tooltip>
          )}
          {root && me && (root.author ?? '').trim() === me && (
            <Tooltip content={t('このコメントを削除', 'Delete this comment')} relationship="label">
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={working} onClick={() => void remove()} />
            </Tooltip>
          )}
        </>
      }
      state={noteId && !root ? (notes === null ? 'loading' : 'gone') : 'ok'}
      goneText={t('このコメントは消されました', 'This comment was deleted')}
      entries={root ? [root, ...replies].map((n) => ({ id: n.id, author: n.author, body: n.body, at: n.created_on, extra: n === root && n.assignee ? `→ ${n.assignee}` : undefined, isReply: n !== root })) : []}
      dimmed={!!root?.resolved}
      composerTop={
        root ? (
          (root.anchor_image || changed) && (
            <div className={s.then}>
              {changed && <span className={s.changed}>{t('書いたあとに、この場所が変わりました', 'This spot has changed since the comment was written')}</span>}
              {root.anchor_image && (
                <>
                  <span>{t('書いたときの様子', 'How it looked when written')}</span>
                  <PinThenImage stored={root.anchor_image} />
                </>
              )}
            </div>
          )
        ) : (
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
        )
      }
      text={text}
      onText={setText}
      placeholder={root ? t('返信', 'Reply') : t('この場所へのコメント', 'Comment on this spot')}
      sendLabel={root ? t('返信する', 'Send reply') : t('書き込む', 'Post')}
      working={working}
      onSend={() => void (root ? sendReply() : post())}
      footer={
        root && (
          <Button size="small" appearance="subtle" icon={root.resolved ? <ArrowRepeatAllRegular /> : <CheckmarkRegular />} disabled={working} onClick={toggleResolved}>
            {root.resolved ? t('未解決に戻す', 'Reopen') : t('解決にする', 'Resolve')}
          </Button>
        )
      }
      error={error}
      onClose={close}
    />
  )
}
