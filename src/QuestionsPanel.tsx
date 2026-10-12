import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, ChatRegular, DismissRegular, TaskListLtrRegular } from '@fluentui/react-icons'
import { Cr854_cardnotesService, type Cr854_cardnotes } from './gcpdata/Cr854_cardnotesService'
import { locale, tr, useT } from './i18n'
import { AiButton } from './AiButton'
import { suggestTasks, type TaskIdea } from './aiTasks'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0, paddingTop: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  card: { display: 'grid', rowGap: '6px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  cardOpen: { borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}` },
  meta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  body: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', color: tokens.colorNeutralForeground1 },
  reply: { display: 'grid', rowGap: '2px', paddingLeft: '10px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  form: { display: 'grid', rowGap: '6px' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
  // AI のタスクの案(採用するまで保存しない)
  ideas: { display: 'grid', rowGap: '6px', padding: '8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  idea: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 130px auto auto', columnGap: '6px', alignItems: 'center' },
  taskChip: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', fontSize: tokens.fontSizeBase100, color: tokens.colorBrandForeground1 },
})

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。質問は、保存してから) */
  cardId?: string
  /** 返信する人の既定値(企画の担当者) */
  owner: string
  /** 質問する人の既定値(制作の担当者) */
  productionOwner: string
  /** 制作の締め切り(タスクの期日の既定値。YYYY-MM-DD) */
  productionDue: string
  cardName: string
  /** 未解決の数が変わったとき(一覧の表示を、閉じなくても合わせるため) */
  onOpenCount?: (n: number) => void
  /** タスクを採用したとき(タスクのタブの数を合わせる) */
  onTasksChanged?: () => void
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * 制作からの質問と返信。会話なので、配信カードの「保存」を待たずに、その場で保存する。
 * 解決済みにしたものは、薄く表示する(消さない。あとで経緯を追えるように)。
 */
export function QuestionsPanel({ cardId, owner, productionOwner, productionDue, cardName, onOpenCount, onTasksChanged }: Props) {
  const styles = useStyles()
  const t = useT()
  const [notes, setNotes] = useState<Cr854_cardnotes[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [author, setAuthor] = useState(productionOwner)
  const [body, setBody] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  // 質問ごとの、AI のタスクの案('busy' は作成中)
  const [ideas, setIdeas] = useState<Record<string, TaskIdea[] | 'busy'>>({})

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await Cr854_cardnotesService.getAll({ filter: `_cr854_deliverycard_value eq ${cardId}`, orderBy: ['createdon asc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('質問を読み込めませんでした', 'Could not load the questions'))
      return
    }
    setNotes(res.data ?? [])
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const questions = (notes ?? []).filter((n) => (n.cr854_kind ?? 'question') === 'question')
  const tasksFrom = (id: string) => (notes ?? []).filter((n) => n.cr854_kind === 'task' && n.cr854_sourcenote === id)
  const open = questions.filter((n) => !n.cr854_resolved).length
  useEffect(() => {
    if (notes) onOpenCount?.(open)
  }, [notes, open, onOpenCount])

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setError(null)
    const res = await f()
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    await load()
    setBusy(false)
  }

  const ask = () =>
    run(async () => {
      const res = await Cr854_cardnotesService.create({
        'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
        cr854_kind: 'question',
        cr854_author: author.trim(),
        cr854_body: body.trim(),
        cr854_resolved: 0,
      })
      if (res.success) setBody('')
      return res
    })

  const reply = (n: Cr854_cardnotes) =>
    run(async () => {
      const res = await Cr854_cardnotesService.update(n.cr854_cardnoteid, {
        cr854_reply: (drafts[n.cr854_cardnoteid] ?? '').trim(),
        cr854_repliedby: owner.trim(),
        cr854_repliedat: new Date().toISOString(),
      })
      if (res.success) {
        setDrafts((d) => ({ ...d, [n.cr854_cardnoteid]: '' }))
        // 返信したら、そのやり取りから、やることの案を出す(採用するまで保存しない)
        void propose({ ...n, cr854_reply: (drafts[n.cr854_cardnoteid] ?? '').trim(), cr854_repliedby: owner.trim() })
      }
      return res
    })

  const propose = async (n: Cr854_cardnotes) => {
    const id = n.cr854_cardnoteid
    setIdeas((x) => ({ ...x, [id]: 'busy' }))
    try {
      const list = await suggestTasks({
        question: n.cr854_body ?? '',
        reply: n.cr854_reply ?? '',
        asker: n.cr854_author ?? productionOwner,
        replier: n.cr854_repliedby ?? owner,
        card: { name: cardName, productionDue },
        existing: tasksFrom(id).map((x) => x.cr854_body ?? ''),
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

  const editIdea = (qid: string, i: number, patch: Partial<TaskIdea>) =>
    setIdeas((x) => {
      const list = x[qid]
      if (!Array.isArray(list)) return x
      return { ...x, [qid]: list.map((it, k) => (k === i ? { ...it, ...patch } : it)) }
    })
  const dropIdea = (qid: string, i: number) =>
    setIdeas((x) => {
      const list = x[qid]
      if (!Array.isArray(list)) return x
      return { ...x, [qid]: list.filter((_, k) => k !== i) }
    })
  const adopt = (qid: string, i: number, idea: TaskIdea) =>
    run(async () => {
      const res = await Cr854_cardnotesService.create({
        'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
        cr854_kind: 'task',
        cr854_body: idea.text.trim(),
        cr854_assignee: idea.assignee.trim(),
        cr854_due: idea.due || undefined,
        cr854_sourcenote: qid,
        cr854_resolved: 0,
      })
      if (res.success) {
        dropIdea(qid, i)
        onTasksChanged?.()
      }
      return res
    })

  const resolve = (n: Cr854_cardnotes, resolved: boolean) => run(() => Cr854_cardnotesService.update(n.cr854_cardnoteid, { cr854_resolved: resolved ? 1 : 0 }))

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>
          <ChatRegular />
          {t('制作からの質問', 'Questions from production')}
          {open > 0 && <Badge appearance="tint" color="warning" size="small">{t(`未解決 ${open}`, `${open} open`)}</Badge>}
        </div>
        <div className={styles.caption}>
          {t('質問・返信は、その場で保存します(配信カードの「保存」は不要です)。', 'Questions and replies are saved right away (no need to press Save).')}
        </div>
      </div>
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、質問を受け付けられます。', 'Save the delivery card to take questions.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {questions.map((n) => (
        <div key={n.cr854_cardnoteid} className={mergeClasses(styles.card, !n.cr854_resolved && styles.cardOpen)} style={n.cr854_resolved ? { opacity: 0.7 } : undefined}>
          <div className={styles.meta}>
            {n.cr854_author || t('(名前なし)', '(no name)')} · {when(n.createdon)}
          </div>
          <div className={styles.body}>{n.cr854_body}</div>
          {n.cr854_reply ? (
            <div className={styles.reply}>
              <div className={styles.meta}>
                {t('返信', 'Reply')} · {n.cr854_repliedby || t('(名前なし)', '(no name)')} · {when(n.cr854_repliedat)}
              </div>
              <div className={styles.body}>{n.cr854_reply}</div>
            </div>
          ) : (
            !n.cr854_resolved && (
              <div className={styles.form}>
                <Textarea
                  size="small"
                  resize="vertical"
                  placeholder={t(`${owner || '企画の担当者'}として返信する`, `Reply as ${owner || 'the planner'}`)}
                  value={drafts[n.cr854_cardnoteid] ?? ''}
                  onChange={(_, d) => setDrafts((x) => ({ ...x, [n.cr854_cardnoteid]: d.value }))}
                />
              </div>
            )
          )}
          <div className={styles.actions}>
            {!n.cr854_reply && !n.cr854_resolved && (
              <Button size="small" appearance="primary" disabled={busy || !(drafts[n.cr854_cardnoteid] ?? '').trim()} onClick={() => void reply(n)}>
                {t('返信する', 'Reply')}
              </Button>
            )}
            {n.cr854_resolved ? (
              <>
                <Badge appearance="tint" color="success" size="small" icon={<CheckmarkCircleRegular />}>{t('解決済み', 'Resolved')}</Badge>
                <Button size="small" appearance="subtle" disabled={busy} onClick={() => void resolve(n, false)}>{t('未解決に戻す', 'Reopen')}</Button>
              </>
            ) : (
              <Button size="small" appearance="subtle" icon={<CheckmarkCircleRegular />} disabled={busy} onClick={() => void resolve(n, true)}>
                {t('解決済みにする', 'Mark resolved')}
              </Button>
            )}
            {n.cr854_reply && (
              <AiButton busy={ideas[n.cr854_cardnoteid] === 'busy'} disabled={busy} onClick={() => void propose(n)}>
                {t('AIでタスクを出す', 'Suggest tasks with AI')}
              </AiButton>
            )}
            {tasksFrom(n.cr854_cardnoteid).length > 0 && (
              <span className={styles.taskChip}>
                <TaskListLtrRegular />
                {t(`タスク ${tasksFrom(n.cr854_cardnoteid).length} 件`, `${tasksFrom(n.cr854_cardnoteid).length} task(s)`)}
              </span>
            )}
          </div>
          {Array.isArray(ideas[n.cr854_cardnoteid]) && (
            <div className={styles.ideas}>
              <div className={styles.meta}>
                {(ideas[n.cr854_cardnoteid] as TaskIdea[]).length
                  ? t('AI のタスクの案(「採用」で、タスクのタブに入ります)', 'AI task ideas (Adopt adds them to the Tasks tab)')
                  : t('このやり取りから、新しいタスクは見つかりませんでした。', 'No new tasks found in this exchange.')}
              </div>
              {(ideas[n.cr854_cardnoteid] as TaskIdea[]).map((idea, i) => (
                <div key={i} className={styles.idea}>
                  <Input size="small" value={idea.text} onChange={(_, d) => editIdea(n.cr854_cardnoteid, i, { text: d.value })} aria-label={t('タスク', 'Task')} />
                  <Input size="small" list="ccp-people" value={idea.assignee} onChange={(_, d) => editIdea(n.cr854_cardnoteid, i, { assignee: d.value })} aria-label={t('担当', 'Assignee')} />
                  <Input size="small" type="date" value={idea.due} onChange={(_, d) => editIdea(n.cr854_cardnoteid, i, { due: d.value })} aria-label={t('期日', 'Due')} />
                  <Button size="small" appearance="primary" disabled={busy || !idea.text.trim()} onClick={() => void adopt(n.cr854_cardnoteid, i, idea)}>
                    {t('採用', 'Adopt')}
                  </Button>
                  <Button size="small" appearance="subtle" icon={<DismissRegular />} aria-label={t('外す', 'Dismiss')} onClick={() => dropIdea(n.cr854_cardnoteid, i)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {cardId && notes && questions.length === 0 && <div className={styles.caption}>{t('まだ質問はありません。', 'No questions yet.')}</div>}
      {cardId && (
        <div className={styles.form}>
          <Field label={t('質問する人', 'Asked by')} size="small">
            <Input size="small" list="ccp-people" value={author} onChange={(_, d) => setAuthor(d.value)} />
          </Field>
          <Textarea size="small" resize="vertical" placeholder={t('制作から企画への質問', 'A question from production to the planner')} value={body} onChange={(_, d) => setBody(d.value)} />
          <div className={styles.actions}>
            <Button size="small" disabled={busy || !body.trim() || !author.trim()} onClick={() => void ask()}>
              {t('質問を追加', 'Add question')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
