// 国の「アラートの基準」(ST2)。設定の画面(ST10)の「国」→「アラートの基準」の中身。
// 在庫僅少の週数・週の上限・販売順位の上位の線を、国ごとに決める(何を問題とみなすかは国の基準のため)。
// 変えると国の全員に効くので、変えた人・日時を残し、ここに出す。見る人の絞り込みは「アラートの条件」(人ごと)
import { useState } from 'react'
import { Button, Field, Input, MessageBar, MessageBarBody, Select, makeStyles, tokens } from '@fluentui/react-components'
import { typo } from './typo'
import { DEFAULT_CRITERIA, browserCriteria, criteriaFor, criteriaHistory, saveCriteria, useCountrySettings, type CountryCriteria } from './countrySettings'
import { myName } from './history'
import { useT, when } from './i18n'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px', maxWidth: '640px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  label: typo.label,
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  history: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, maxHeight: '160px', overflowY: 'auto' },
})

interface Props {
  /** 国のコード(設定の画面で決まっている。国を替えたら、呼ぶ側が key で作り直す) */
  country: string
  countryName: string
}

export function CountryCriteriaPanel({ country, countryName }: Props) {
  const s = useStyles()
  const t = useT()
  useCountrySettings()
  // 変えている途中の値(なければ、その国のいまの値。国の設定を読み終える前に開いても、読んだ値が出るように、写さずに持つ)
  const [edit, setEdit] = useState<CountryCriteria | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const saved0 = criteriaFor(country)
  const draft = edit ?? saved0
  const setDraft = (c: CountryCriteria) => {
    setEdit(c)
    setSaved(false)
  }
  const past = criteriaHistory(country)
  const fromBrowser = browserCriteria()
  const changed = JSON.stringify(draft) !== JSON.stringify(saved0)

  const save = async () => {
    if (!(await confirmDialog(t(`${countryName}の全員に効きます。保存しますか?`, `This applies to everyone working on ${countryName}. Save?`)))) return
    setBusy(true)
    setError(null)
    try {
      await saveCriteria(country, draft, myName() || t('(名前なし)', '(no name)'))
      setEdit(null)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.body}>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {saved && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>{t('保存しました', 'Saved')}</MessageBarBody>
        </MessageBar>
      )}
      {fromBrowser && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>
            {t('このブラウザに、国の設定に移す前の値が残っています。', 'This browser still has values from before they moved to country settings.')}{' '}
            <Button size="small" onClick={() => setDraft({ ...draft, ...fromBrowser })}>
              {t('その値を取り込む(保存はまだ)', 'Use those values (not saved yet)')}
            </Button>
          </MessageBarBody>
        </MessageBar>
      )}
      <Field label={t('在庫が、配信日に何週分を切ったら「在庫僅少」にするか', 'Low stock when, on the delivery day, fewer weeks than')} size="small">
        <Select value={String(draft.lowWeeks)} onChange={(_, d) => setDraft({ ...draft, lowWeeks: Number(d.value) })}>
          {[...new Set([1, 1.5, 2, 3, 4, 6, 8, draft.lowWeeks])].sort((x, y) => x - y).map((v) => (
            <option key={v} value={String(v)}>
              {t(`${v} 週分`, `${v} weeks`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t('週の上限(同じ商品を、同じ週に何本の配信まで載せてよいか)', 'Weekly limit (how many deliveries the same product may appear in per week)')}
        hint={t('マーケティングの決まり(全社の「方針・決まり」)に「上限 週 N 回」があり、配信の国・チャネル・配信日に当てはまれば、そちらを使います', 'If a marketing rule (Company → Marketing policies) says "上限 週 N 回" and matches the delivery’s country, channel and date, that rule is used instead')}
        size="small"
      >
        <Select value={String(draft.weeklyLimit)} onChange={(_, d) => setDraft({ ...draft, weeklyLimit: Number(d.value) })}>
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <option key={v} value={String(v)}>
              {t(`${v} 本まで`, `Up to ${v}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('販売順位で「上位」とみなす線(Top N。結果の「販売チャネルごとの順位」)', 'Top N for sales rankings (Results “Rankings by channel”)')} size="small">
        <Input
          type="number"
          min={1}
          value={String(draft.rankTopN)}
          onChange={(_, d) => {
            const v = Number(d.value)
            if (Number.isInteger(v) && v >= 1) setDraft({ ...draft, rankTopN: v })
          }}
        />
      </Field>
      <div className={s.actions}>
        <Button appearance="primary" disabled={!changed || busy} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        <Button disabled={!changed || busy} onClick={() => setEdit(null)}>
          {t('変更を取り消す', 'Discard changes')}
        </Button>
        <Button appearance="subtle" onClick={() => setDraft(DEFAULT_CRITERIA)}>
          {t('既定の値に戻す', 'Reset to defaults')}
        </Button>
      </div>
      <div>
        <span className={s.label}>{t('変更の履歴', 'Change history')}</span>
        {past.length === 0 ? (
          <div className={s.note}>{t('まだ変えていません(既定の値)', 'Not changed yet (defaults)')}</div>
        ) : (
          <ul className={s.history}>
            {past.slice(0, 20).map((h, i) => (
              <li key={i}>
                {when(h.at)} {h.by}: {t(`在庫僅少 ${h.criteria.lowWeeks} 週分・週の上限 ${h.criteria.weeklyLimit} 本・上位 ${h.criteria.rankTopN}`, `low stock ${h.criteria.lowWeeks} wk, weekly limit ${h.criteria.weeklyLimit}, top ${h.criteria.rankTopN}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
