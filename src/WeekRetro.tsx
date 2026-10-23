import { useEffect, useState } from 'react'
import { Button, Spinner, Textarea, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowRightRegular, EditRegular, LightbulbRegular, SaveRegular, SparkleRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { MonthsService, type MonthRow } from './data/months'
import { monthRowOf } from './weekLock'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: '10px',
    rowGap: '6px',
    flexWrap: 'wrap',
    padding: '8px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  head: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap', paddingTop: '4px' },
  body: { flex: '1 1 320px', minWidth: 0, display: 'grid', rowGap: '4px' },
  text: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  saved: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground1 },
  // たたんだとき: 見出し・1 行目・書くボタンを 1 行に
  folded: { alignItems: 'center' },
  line: { flex: '1 1 0', minWidth: 0, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lineEmpty: { color: tokens.colorNeutralForeground3 },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

type Props = {
  /** 週の振り返りか、月の振り返りか(文言だけが変わる。既定は週) */
  period?: 'week' | 'month'
} & (
  | {
      /** 結果の面: この週(月)の振り返りを書く(保存は、その場で) */
      mode: 'results'
      text: string
      onSave: (text: string) => Promise<boolean>
      /** AI の下書きを作る(返った文を欄にそのまま入れ、人が直して保存する) */
      onDraft?: () => Promise<string>
    }
  | {
      /** 計画の面: 前週(前月)の振り返りを出す(読むだけ。書くのは、結果の面の前週・前月) */
      mode: 'plan'
      text: string
      /** 結果の面の前週(前月)を開く */
      onOpenResults: () => void
    }
)

/**
 * 週ごとの振り返りのメモ(FLOWS の C-7)。配信ごとのメモ(学び)とは別に、週全体で気づいたこと・次の週に生かすことを残す。
 * 結果の面の週の表示で書き、計画の面の週の表示に「前週の振り返り」として出す(翌週の計画を立てるときに、目の前にあるように)。
 * 月の振り返り(period="month")も同じ形で、結果の面の月の表示で書き、計画の面の月の表示に「前月の振り返り」として出す。
 * 「AI で下書き」は、期間の結果から AI が書いた文を欄に入れるだけで、保存は人が直してから(src/aiRetro.ts)
 */
export function WeekRetro(props: Props) {
  const s = useStyles()
  const t = useT()
  const [draft, setDraft] = useState(props.text)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // 結果の面: ふだんは 1 行にたたみ、「書く」「直す」で開く(週の表示の縦幅を空けるため)
  const [open, setOpen] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  // AI の下書きを入れた直後(直してから保存してもらうための一言を出す)
  const [fromAi, setFromAi] = useState(false)
  const month = props.period === 'month'
  // 週を移ったら、その週のメモに入れ替える
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(props.text)
    setSavedAt(null)
    setOpen(false)
    setDraftError(null)
    setFromAi(false)
  }, [props.text])

  if (props.mode === 'plan') {
    if (!props.text.trim()) return null
    return (
      <div className={s.root}>
        <span className={s.head}>
          <LightbulbRegular />
          {month ? t('前月の振り返り', 'Last month’s retrospective') : t('前週の振り返り', 'Last week’s retrospective')}
        </span>
        <div className={s.body}>
          <div className={s.text}>{props.text}</div>
        </div>
        <span className={s.actions}>
          <Button size="small" appearance="subtle" icon={<ArrowRightRegular />} iconPosition="after" onClick={props.onOpenResults}>
            {month ? t('前月の結果を見る', 'See last month’s results') : t('前週の結果を見る', 'See last week’s results')}
          </Button>
        </span>
      </div>
    )
  }

  const dirty = draft !== props.text
  const save = async () => {
    setSaving(true)
    const ok = await props.onSave(draft.trim())
    setSaving(false)
    if (ok) {
      setSavedAt(Date.now())
      setOpen(false)
      setFromAi(false)
    }
  }
  const onDraft = props.onDraft
  // 書いてある文は、AI の下書きで置き換える(元に戻したいときは「やめる」で、保存してある文に戻る)
  const draftWithAi = onDraft
    ? async () => {
        setDrafting(true)
        setDraftError(null)
        try {
          const text = await onDraft()
          setDraft(text)
          setFromAi(true)
          setOpen(true)
        } catch (e) {
          setDraftError(e instanceof Error ? e.message : String(e))
          setOpen(true)
        } finally {
          setDrafting(false)
        }
      }
    : undefined
  const aiButton = draftWithAi && (
    <Button size="small" appearance="subtle" icon={drafting ? <Spinner size="extra-tiny" /> : <SparkleRegular />} disabled={drafting || saving} onClick={() => void draftWithAi()}>
      {drafting ? t('下書き中…', 'Drafting…') : t('AI で下書き', 'Draft with AI')}
    </Button>
  )
  const title = month ? t('この月の振り返り', 'This month’s retrospective') : t('この週の振り返り', 'This week’s retrospective')
  if (!open && !dirty) {
    // たたんだ 1 行には、改行を詰めて出す(AI の下書きは 1 行目が「【良かったこと】」の見出しだけなので、中身まで見えるように)
    const first = props.text.trim().replace(/\s*\n+\s*/g, ' ')
    return (
      <div className={`${s.root} ${s.folded}`}>
        <span className={s.head} style={{ paddingTop: 0 }}>
          <LightbulbRegular />
          {title}
        </span>
        <span className={`${s.line} ${first ? '' : s.lineEmpty}`} title={props.text || undefined}>
          {first || (month ? t('まだ書いていません(翌月の計画の面に出ます)', 'Not written yet (shown on next month’s plan)') : t('まだ書いていません(翌週の計画の面に出ます)', 'Not written yet (shown on next week’s plan)'))}
        </span>
        {savedAt && <span className={s.saved}>{t('保存しました', 'Saved')}</span>}
        {aiButton}
        <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => setOpen(true)}>
          {first ? t('直す', 'Edit') : t('書く', 'Write')}
        </Button>
      </div>
    )
  }
  return (
    <div className={s.root}>
      <span className={s.head}>
        <LightbulbRegular />
        {title}
      </span>
      <div className={s.body}>
        <Textarea
          size="small"
          resize="vertical"
          // AI の下書きは 10 行ほどになるので、入れたときは広げて全体が見えるように
          rows={fromAi ? 10 : 2}
          placeholder={
            month
              ? t('月全体で気づいたこと・次の月に生かすこと(翌月の計画の面に出ます)', 'What you noticed this month and what to carry into next month (shown on next month’s plan)')
              : t('週全体で気づいたこと・次の週に生かすこと(翌週の計画の面に出ます)', 'What you noticed this week and what to carry into next week (shown on next week’s plan)')
          }
          value={draft}
          onChange={(_, d) => setDraft(d.value)}
        />
        {fromAi && <span className={s.caption}>{t('AI の下書きです。数字と言い回しを確かめて、直してから保存してください(保存するまでは残りません)', 'This is an AI draft. Check the numbers and wording, edit, then save (nothing is kept until you save)')}</span>}
        {draftError && <span className={s.error}>{draftError}</span>}
      </div>
      <span className={s.actions}>
        <Button size="small" appearance={dirty ? 'primary' : 'secondary'} icon={<SaveRegular />} disabled={!dirty || saving} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        {aiButton}
        <Button
          size="small"
          appearance="subtle"
          onClick={() => {
            setDraft(props.text)
            setOpen(false)
            setFromAi(false)
            setDraftError(null)
          }}
        >
          {dirty ? t('やめる', 'Cancel') : t('閉じる', 'Close')}
        </Button>
      </span>
    </div>
  )
}

/**
 * 計画の面の月の表示に出す「前月の振り返り」。月の振り返り(表 months)は結果の面だけが持つので、ここで読む
 * (面を切り替えるたびに作り直されるので、結果の面で保存した文も、計画の面に戻れば出る)
 */
export function PrevMonthRetro({ month, country, onOpenResults }: { month: Date; country: string; onOpenResults: () => void }) {
  const [rows, setRows] = useState<MonthRow[]>([])
  useEffect(() => {
    MonthsService.getAll()
      .then((res) => res.success && setRows(res.data ?? []))
      .catch(() => undefined)
  }, [])
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1)
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  // その国の振り返り(国の行がなければ、国を分ける前の行)
  const text = monthRowOf(rows, key, country)?.retro ?? ''
  return <WeekRetro period="month" mode="plan" text={text} onOpenResults={onOpenResults} />
}
