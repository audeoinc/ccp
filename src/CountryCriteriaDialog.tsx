// 国の「アラートの基準」(ST2)。⚙ →「国」→「アラートの基準」で開く。
// 在庫僅少の週数・週の上限・販売順位の上位の線を、国ごとに決める(何を問題とみなすかは国の基準のため)。
// 変えると国の全員に効くので、変えた人・日時を残し、ここに出す。見る人の絞り込みは「アラートの条件」(人ごと)
import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { DEFAULT_CRITERIA, browserCriteria, criteriaFor, criteriaHistory, saveCriteria, useCountrySettings, type CountryCriteria } from './countrySettings'
import { ResizableSurface } from './ResizableSurface'
import { countryOptions } from './status'
import { myName } from './history'
import { locale, optionLabel, useT } from './i18n'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px' },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  history: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, maxHeight: '160px', overflowY: 'auto' },
})

interface Props {
  open: boolean
  onClose: () => void
  /** ヘッダーで選んでいる国(「すべての国」のときは空。画面の中で選ぶ) */
  country: string
}

export function CountryCriteriaDialog({ open, onClose, country: headerCountry }: Props) {
  const s = useStyles()
  const t = useT()
  useCountrySettings()
  const [country, setCountry] = useState(headerCountry || String(countryOptions[0]?.value ?? ''))
  const [draft, setDraft] = useState<CountryCriteria>(criteriaFor(country))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 開いたとき・国を変えたときは、その国のいまの値から始める
  useEffect(() => {
    if (!open) return
    const co = headerCountry || country
    const id = window.setTimeout(() => {
      setCountry(co)
      setDraft(criteriaFor(co))
      setError(null)
    })
    return () => window.clearTimeout(id)
    // 開いたときと、ヘッダーの国が変わったとき
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, headerCountry])

  const past = criteriaHistory(country)
  const fromBrowser = browserCriteria()
  const changed = JSON.stringify(draft) !== JSON.stringify(criteriaFor(country))
  const countryName = optionLabel(countryOptions.find((o) => String(o.value) === country)?.label)
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '')

  const save = async () => {
    if (!window.confirm(t(`${countryName}の全員に効きます。保存しますか?`, `This applies to everyone working on ${countryName}. Save?`))) return
    setBusy(true)
    setError(null)
    try {
      await saveCriteria(country, draft, myName() || t('(名前なし)', '(no name)'))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="countryCriteria">
        <DialogBody>
          <DialogTitle>{t('アラートの基準(国ごと)', 'Alert criteria (per country)')}</DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.row}>
              <span className={s.label}>{t('国', 'Country')}</span>
              {headerCountry ? (
                <span>{countryName}</span>
              ) : (
                <Select
                  size="small"
                  value={country}
                  onChange={(_, d) => {
                    setCountry(d.value)
                    setDraft(criteriaFor(d.value))
                  }}
                >
                  {countryOptions.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {optionLabel(o.label)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <span className={s.note}>
              {t(
                '何を問題とみなすかの、国の基準です。変えると、この国の配信を扱う全員に効きます(変えた人・日時が残ります)。どのアラートを自分に出すか(種類・担当など)は、アラートの画面の「条件」で人ごとに決めます。',
                'The country’s criteria for what counts as a problem. Changes apply to everyone working on this country (who and when are recorded). Which alerts you personally see (types, owners…) is set per person in the Alerts page “Conditions”.',
              )}
            </span>
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
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
              hint={t('マーケティングの決まり(⚙ の「方針・決まり」)に「上限 週 N 回」があり、配信の国・チャネル・配信日に当てはまれば、そちらを使います', 'If a marketing rule (⚙ Policies & rules) says "上限 週 N 回" and matches the delivery’s country, channel and date, that rule is used instead')}
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
            <div>
              <span className={s.label}>{t('変えた記録', 'Change history')}</span>
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
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={() => setDraft(DEFAULT_CRITERIA)}>
              {t('既定の値に戻す', 'Reset to defaults')}
            </Button>
            <Button appearance="secondary" onClick={onClose}>
              {t('やめる', 'Cancel')}
            </Button>
            <Button appearance="primary" disabled={!changed || busy} onClick={() => void save()}>
              {t('保存', 'Save')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
