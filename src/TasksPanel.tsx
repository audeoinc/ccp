import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Field, Input, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DeleteRegular, LinkRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import { ListHeader } from './ListHeader'
import { useJustAdded } from './useJustAdded'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    columnGap: '6px',
    alignItems: 'start',
    padding: '6px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  done: { opacity: 0.6, '& .task-text': { textDecorationLine: 'line-through' } },
  text: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, paddingTop: '6px', whiteSpace: 'pre-wrap' },
  meta: { display: 'flex', flexWrap: 'wrap', columnGap: '10px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, marginTop: '2px' },
  overdue: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  source: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', border: 'none', padding: 0, background: 'none', color: tokens.colorBrandForeground1, cursor: 'pointer', fontSize: tokens.fontSizeBase100, fontFamily: 'inherit' },
  // 入力欄は既定の最小幅を持つので、列の幅に合わせて縮める(隣の欄と重ならないように)
  // タスクの文は 1 行目に広く、担当と期日は 2 行目に並べる(中央のペインが狭くても、文が読めるように)
  // 足す欄は、見出しの「＋ タスクを足す」で開き、一覧の上に出す
  form: { display: 'grid', padding: '8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px', rowGap: '6px', alignItems: 'end', '& .fui-Input': { minWidth: 0, width: '100%' } },
  wide: { gridColumn: '1 / -1' },
  actions: { gridColumn: '1 / -1', display: 'flex', columnGap: '8px' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  cardId?: string
  /** 担当の既定値(制作の担当者) */
  productionOwner: string
  /** 期日の既定値(制作の締め切り。YYYY-MM-DD) */
  productionDue: string
  /** 元の質問を開く(引き継ぎのタブに移る) */
  onOpenSource: () => void
  /** タスクを足した・変えたとき(タブの数を合わせる) */
  onChanged: () => void
}

const dueText = (ymd?: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
}
const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 配信のタスク(やること)。制作とのやり取りから AI が出した案を採用したもの、または手で足したもの。その場で保存する */
export function TasksPanel({ cardId, productionOwner, productionDue, onOpenSource, onChanged }: Props) {
  const styles = useStyles()
  const t = useT()
  const [notes, setNotes] = useState<CardNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState(productionOwner)
  const [due, setDue] = useState(productionDue)
  const [adding, setAdding] = useState(false)
  const justAdded = useJustAdded()

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('タスクを読み込めませんでした', 'Could not load the tasks'))
      return
    }
    setNotes(res.data ?? [])
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setError(null)
    const res = await f()
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    await load()
    onChanged()
    setBusy(false)
  }

  // 未完了を上に、期日の早い順。完了は下に。いま足したタスクだけは、いちばん上に出す
  const tasks = justAdded.order(
    (notes ?? []).filter((n) => n.kind === 'task').sort((a, b) => (a.resolved ?? 0) - (b.resolved ?? 0) || (a.due || '9999').localeCompare(b.due || '9999')),
    (n) => n.id,
  )
  const questionOf = (id?: string) => (notes ?? []).find((n) => n.id === id)
  const today = todayYmd()

  const add = () =>
    run(async () => {
      const res = await CardNotesService.create({
        delivery_card_id: cardId,
        kind: 'task',
        body: text.trim(),
        assignee: assignee.trim(),
        due: due || undefined,
        resolved: 0,
      })
      if (res.success) {
        setText('')
        justAdded.mark(res.data?.id)
      }
      return res
    })

  return (
    <div className={styles.root}>
      <ListHeader
        icon={<TaskListLtrRegular />}
        title={t('タスク', 'Tasks')}
        caption={t('制作とのやり取りから AI が出した案を採用するか、ここで足します。その場で保存します。', 'Adopt AI ideas from the production Q&A (Handoff tab), or add tasks here. Saved right away.')}
        addLabel={t('タスクを足す', 'Add a task')}
        addDisabled={!cardId || adding}
        onAdd={() => setAdding(true)}
      />
      {cardId && adding && (
        <div className={styles.form}>
          <Field label={t('タスク', 'Task')} size="small" className={styles.wide}>
            <Input size="small" autoFocus value={text} onChange={(_, d) => setText(d.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && text.trim() && !busy && void add()} />
          </Field>
          <Field label={t('担当', 'Assignee')} size="small">
            <Input size="small" list="ccp-owners" value={assignee} onChange={(_, d) => setAssignee(d.value)} />
          </Field>
          <Field label={t('期日', 'Due')} size="small">
            <Input size="small" type="date" value={due} onChange={(_, d) => setDue(d.value)} />
          </Field>
          {/* 続けていくつも足せるように、足したあとも欄は開いたまま */}
          <div className={styles.actions}>
            <Button size="small" appearance="primary" disabled={busy || !text.trim()} onClick={() => void add()}>
              {t('足す', 'Add')}
            </Button>
            <Button size="small" onClick={() => setAdding(false)}>
              {t('閉じる', 'Close')}
            </Button>
          </div>
        </div>
      )}
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、タスクを足せます。', 'Save the delivery card to add tasks.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {tasks.map((n) => {
        const src = questionOf(n.source_note)
        const overdue = !n.resolved && !!n.due && n.due.slice(0, 10) < today
        return (
          <div key={n.id} className={mergeClasses(styles.row, !!n.resolved && styles.done, justAdded.freshClass(n.id))}>
            <Checkbox
              checked={!!n.resolved}
              disabled={busy}
              aria-label={t('完了', 'Done')}
              onChange={(_, d) => void run(() => CardNotesService.update(n.id, { resolved: d.checked ? 1 : 0 }))}
            />
            <div>
              <div className={mergeClasses('task-text', styles.text)}>{n.body}</div>
              <div className={styles.meta}>
                {n.assignee && <span>{n.assignee}</span>}
                {n.due && <span className={overdue ? styles.overdue : undefined}>{t(`期日 ${dueText(n.due)}`, `Due ${dueText(n.due)}`)}</span>}
                {src && (
                  <button type="button" className={styles.source} onClick={onOpenSource} title={src.body}>
                    <LinkRegular />
                    {t(`${src.author || '制作'} の質問から`, `From ${src.author || 'production'}’s question`)}
                  </button>
                )}
              </div>
            </div>
            <Button
              size="small"
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={busy}
              aria-label={t('削除', 'Delete')}
              onClick={() => void run(async () => {
                await CardNotesService.delete(n.id)
                return { success: true }
              })}
            />
          </div>
        )
      })}
      {cardId && notes && tasks.length === 0 && <div className={styles.caption}>{t('まだタスクはありません。', 'No tasks yet.')}</div>}
    </div>
  )
}
