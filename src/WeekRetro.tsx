import { useEffect, useState } from 'react'
import { Button, Textarea, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowRightRegular, LightbulbRegular, SaveRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

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
})

type Props =
  | {
      /** 結果の面: この週の振り返りを書く(保存は、その場で) */
      mode: 'results'
      text: string
      onSave: (text: string) => Promise<boolean>
    }
  | {
      /** 計画の面: 前週の振り返りを出す(読むだけ。書くのは、結果の面の前週) */
      mode: 'plan'
      text: string
      /** 結果の面の前週を開く */
      onOpenResults: () => void
    }

/**
 * 週ごとの振り返りのメモ(FLOWS の C-7)。配信ごとのメモ(学び)とは別に、週全体で気づいたこと・次の週に生かすことを残す。
 * 結果の面の週の表示で書き、計画の面の週の表示に「前週の振り返り」として出す(翌週の計画を立てるときに、目の前にあるように)
 */
export function WeekRetro(props: Props) {
  const s = useStyles()
  const t = useT()
  const [draft, setDraft] = useState(props.text)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // 週を移ったら、その週のメモに入れ替える
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(props.text)
    setSavedAt(null)
  }, [props.text])

  if (props.mode === 'plan') {
    if (!props.text.trim()) return null
    return (
      <div className={s.root}>
        <span className={s.head}>
          <LightbulbRegular />
          {t('前週の振り返り', 'Last week’s retrospective')}
        </span>
        <div className={s.body}>
          <div className={s.text}>{props.text}</div>
        </div>
        <span className={s.actions}>
          <Button size="small" appearance="subtle" icon={<ArrowRightRegular />} iconPosition="after" onClick={props.onOpenResults}>
            {t('前週の結果を見る', 'See last week’s results')}
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
    if (ok) setSavedAt(Date.now())
  }
  return (
    <div className={s.root}>
      <span className={s.head}>
        <LightbulbRegular />
        {t('この週の振り返り', 'This week’s retrospective')}
      </span>
      <div className={s.body}>
        <Textarea
          size="small"
          resize="vertical"
          rows={2}
          placeholder={t('週全体で気づいたこと・次の週に生かすこと(翌週の計画の面に出ます)', 'What you noticed this week and what to carry into next week (shown on next week’s plan)')}
          value={draft}
          onChange={(_, d) => setDraft(d.value)}
        />
      </div>
      <span className={s.actions}>
        <Button size="small" appearance={dirty ? 'primary' : 'secondary'} icon={<SaveRegular />} disabled={!dirty || saving} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        {savedAt && !dirty && <span className={s.saved}>{t('保存しました', 'Saved')}</span>}
      </span>
    </div>
  )
}
