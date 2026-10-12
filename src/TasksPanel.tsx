import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, Field, Input, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DeleteRegular, LinkRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import { Cr854_cardnotesService, type Cr854_cardnotes } from './gcpdata/Cr854_cardnotesService'
import { locale, tr, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
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
  form: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 140px', columnGap: '8px', alignItems: 'end' },
  actions: { display: 'flex', columnGap: '8px' },
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
  const [notes, setNotes] = useState<Cr854_cardnotes[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState(productionOwner)
  const [due, setDue] = useState(productionDue)

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await Cr854_cardnotesService.getAll({ filter: `_cr854_deliverycard_value eq ${cardId}`, orderBy: ['createdon asc'] })
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

  const tasks = (notes ?? []).filter((n) => n.cr854_kind === 'task')
  // 未完了を上に、期日の早い順。完了は下に
  tasks.sort((a, b) => (a.cr854_resolved ?? 0) - (b.cr854_resolved ?? 0) || (a.cr854_due || '9999').localeCompare(b.cr854_due || '9999'))
  const questionOf = (id?: string) => (notes ?? []).find((n) => n.cr854_cardnoteid === id)
  const today = todayYmd()

  const add = () =>
    run(async () => {
      const res = await Cr854_cardnotesService.create({
        'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
        cr854_kind: 'task',
        cr854_body: text.trim(),
        cr854_assignee: assignee.trim(),
        cr854_due: due || undefined,
        cr854_resolved: 0,
      })
      if (res.success) setText('')
      return res
    })

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>
          <TaskListLtrRegular />
          {t('タスク', 'Tasks')}
        </div>
        <div className={styles.caption}>
          {t('制作とのやり取りから AI が出した案を採用するか、ここで足します。その場で保存します。', 'Adopt AI ideas from the production Q&A (Handoff tab), or add tasks here. Saved right away.')}
        </div>
      </div>
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、タスクを足せます。', 'Save the delivery card to add tasks.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {tasks.map((n) => {
        const src = questionOf(n.cr854_sourcenote)
        const overdue = !n.cr854_resolved && !!n.cr854_due && n.cr854_due.slice(0, 10) < today
        return (
          <div key={n.cr854_cardnoteid} className={mergeClasses(styles.row, !!n.cr854_resolved && styles.done)}>
            <Checkbox
              checked={!!n.cr854_resolved}
              disabled={busy}
              aria-label={t('完了', 'Done')}
              onChange={(_, d) => void run(() => Cr854_cardnotesService.update(n.cr854_cardnoteid, { cr854_resolved: d.checked ? 1 : 0 }))}
            />
            <div>
              <div className={mergeClasses('task-text', styles.text)}>{n.cr854_body}</div>
              <div className={styles.meta}>
                {n.cr854_assignee && <span>{n.cr854_assignee}</span>}
                {n.cr854_due && <span className={overdue ? styles.overdue : undefined}>{t(`期日 ${dueText(n.cr854_due)}`, `Due ${dueText(n.cr854_due)}`)}</span>}
                {src && (
                  <button type="button" className={styles.source} onClick={onOpenSource} title={src.cr854_body}>
                    <LinkRegular />
                    {t(`${src.cr854_author || '制作'} の質問から`, `From ${src.cr854_author || 'production'}’s question`)}
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
                await Cr854_cardnotesService.delete(n.cr854_cardnoteid)
                return { success: true }
              })}
            />
          </div>
        )
      })}
      {cardId && notes && tasks.length === 0 && <div className={styles.caption}>{t('まだタスクはありません。', 'No tasks yet.')}</div>}
      {cardId && (
        <div className={styles.form}>
          <Field label={t('タスク', 'Task')} size="small">
            <Input size="small" value={text} onChange={(_, d) => setText(d.value)} />
          </Field>
          <Field label={t('担当', 'Assignee')} size="small">
            <Input size="small" list="ccp-owners" value={assignee} onChange={(_, d) => setAssignee(d.value)} />
          </Field>
          <Field label={t('期日', 'Due')} size="small">
            <Input size="small" type="date" value={due} onChange={(_, d) => setDue(d.value)} />
          </Field>
        </div>
      )}
      {cardId && (
        <div className={styles.actions}>
          <Button size="small" disabled={busy || !text.trim()} onClick={() => void add()}>
            {t('タスクを追加', 'Add task')}
          </Button>
        </div>
      )}
    </div>
  )
}
