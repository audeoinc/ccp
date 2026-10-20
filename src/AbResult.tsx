import { useState } from 'react'
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { HeroImage } from './models/heroImages'
import { isChoose, metricLabel, ownsHero, parseAbTest, targetLabel, type AbMetric } from './abTest'
import { abVerdict, confidenceLabel, learningText, metricValue, perRecipientMoney } from './abResults'
import { ImageThumb } from './ImageThumb'
import { locale, useT } from './i18n'
import { isPush, pct, type ResultRow } from './results'

const useStyles = makeStyles({
  box: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '10px 14px', display: 'grid', rowGap: '8px', backgroundColor: tokens.colorNeutralBackground1 },
  head: { display: 'flex', alignItems: 'baseline', columnGap: '12px', flexWrap: 'wrap' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  sub: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { padding: '4px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', textAlign: 'right' },
  td: { padding: '5px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'right', whiteSpace: 'nowrap' },
  left: { textAlign: 'left' },
  // 判定の指標の列は、ほかの列より目立たせる(どの数字で勝ちを決めたかが分かるように)
  metricCol: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  winRow: { backgroundColor: tokens.colorPaletteGreenBackground1 },
  badge: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', marginLeft: '6px', padding: '0 6px', borderRadius: tokens.borderRadiusCircular, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, backgroundColor: tokens.colorPaletteGreenBackground3, color: tokens.colorNeutralForegroundOnBrand },
  lead: { marginLeft: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  key: { fontWeight: tokens.fontWeightSemibold },
  variantCell: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  verdict: { display: 'flex', alignItems: 'center', columnGap: '10px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase300 },
  sure: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
  unsure: { color: tokens.colorNeutralForeground2 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

/**
 * AB テストの結果(X55 の段階 2)。詳しい結果の主な数字の下に、案ごとの数字を並べ、判定の指標で勝ち案と、差が偶然でないかの目安を出す。
 * 勝ち案と仮説が支持されたかを、ボタン 1 つで「次に生かすメモ」(これまでの学び)に足せる
 */
export function AbResult({ row, heroes, money, onAdopt }: { row: ResultRow; heroes: HeroImage[]; money: (v?: number) => string; onAdopt: (text: string) => Promise<void> }) {
  const styles = useStyles()
  const t = useT()
  const [adopted, setAdopted] = useState(false)
  const [busy, setBusy] = useState(false)
  const ab = parseAbTest(row.card.ab_test)
  const push = isPush(row.card)
  const v = abVerdict(row.parts, ab, push)
  // 案から選ぶ配信(X57)は 1 案だけを送るので、案ごとの勝ち負けは出さない
  if (v.stats.length === 0 || isChoose(ab)) return null

  const num = (x: number) => x.toLocaleString(locale())
  const rate = (a: number, b: number) => (b ? a / b : undefined)
  const heroOf = (key: string) => {
    const id = key === 'A' ? row.card.hero_image_id : ab?.heroes[key as 'B' | 'C']?.heroId
    return id ? heroes.find((h) => h.id === id) : undefined
  }
  const showHero = ownsHero(ab)
  const cols: { metric: AbMetric | null; label: string; cell: (s: (typeof v.stats)[number]) => string }[] = [
    { metric: null, label: t('送った数', 'Sent'), cell: (s) => num(s.recipients) },
    ...(push ? [] : [{ metric: 'open' as AbMetric, label: t('開封率', 'Open rate'), cell: (s: (typeof v.stats)[number]) => pct(rate(s.opens, s.recipients)) }]),
    { metric: 'ctr', label: push ? t('タップ率', 'Tap rate') : t('クリック率', 'Click rate'), cell: (s) => pct(rate(push ? s.opens : s.clicks, s.recipients)) },
    { metric: 'cvr', label: t('注文率', 'Order rate'), cell: (s) => (s.recipients ? `${((s.orders / s.recipients) * 100).toFixed(2)}%` : '—') },
    { metric: 'rpr', label: t('1 通あたりの売上', 'Revenue / recipient'), cell: (s) => (s.recipients ? perRecipientMoney(s.revenue / s.recipients, money) : '—') },
    { metric: null, label: t('売上', 'Revenue'), cell: (s) => money(s.revenue) },
  ]
  const sure = v.confidence === 'sure'
  const adopt = async () => {
    setBusy(true)
    try {
      await onAdopt(learningText(v, ab, money))
      setAdopted(true)
    } finally {
      setBusy(false)
    }
  }
  const rolloutSent = v.rollout.reduce((a, r) => a + Number(r.recipients ?? 0), 0)
  const rolloutRevenue = v.rollout.reduce((a, r) => a + Number(r.revenue ?? 0), 0)
  const rolloutKey = v.rollout[0]?.variant

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h3 className={styles.h3}>{t('AB テストの結果', 'A/B test results')}</h3>
        <span className={styles.sub}>
          {[
            ab ? t(`比べたもの: ${targetLabel(ab.target)}`, `Compared: ${targetLabel(ab.target)}`) : '',
            t(`判定: ${metricLabel(v.metric)}`, `Judged by: ${metricLabel(v.metric)}`),
            ab?.hypothesis.trim() ? t(`仮説: ${ab.hypothesis.trim()}`, `Hypothesis: ${ab.hypothesis.trim()}`) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={mergeClasses(styles.th, styles.left)}>{t('案(テストに回した分)', 'Variant (test group)')}</th>
            {cols.map((c) => (
              <th key={c.label} className={mergeClasses(styles.th, c.metric === v.metric && styles.metricCol)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {v.stats.map((s) => {
            const win = v.winner?.key === s.key
            const hero = showHero ? heroOf(s.key) : undefined
            return (
              <tr key={s.key} className={mergeClasses(win && sure && styles.winRow)}>
                <td className={mergeClasses(styles.td, styles.left)}>
                  <span className={styles.variantCell}>
                    {hero && <ImageThumb src={hero.image_url} alt={hero.name ?? ''} width={36} height={36} />}
                    <span className={styles.key}>{t(`${s.key} 案`, `Variant ${s.key}`)}</span>
                    {win &&
                      (sure ? (
                        <span className={styles.badge}>
                          <CheckmarkRegular fontSize={12} />
                          {t('勝ち', 'Winner')}
                        </span>
                      ) : (
                        <span className={styles.lead}>{t('いちばん上(確かではない)', 'Top (not certain)')}</span>
                      ))}
                  </span>
                </td>
                {cols.map((c) => (
                  <td key={c.label} className={mergeClasses(styles.td, c.metric === v.metric && styles.metricCol)}>
                    {c.cell(s)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {v.rollout.length > 0 && (
        <div className={styles.note}>
          {t(
            `残り分: ${rolloutKey ?? '—'} 案を ${num(rolloutSent)} 通に送った(売上 ${money(rolloutRevenue)})。上の数字は、テストに回した分だけ。主な数字は、残り分を含む全体`,
            `Rollout: variant ${rolloutKey ?? '—'} went to ${num(rolloutSent)} recipients (revenue ${money(rolloutRevenue)}). The table shows the test group only; the main figures include the rollout.`,
          )}
        </div>
      )}
      <div className={styles.verdict}>
        {v.winner && v.runnerUp ? (
          <span>
            <span className={sure ? styles.sure : styles.unsure}>{confidenceLabel(v.confidence)}</span>
            {' · '}
            {t(
              `${v.winner.key} 案 ${metricValue(v.metric, v.winner.value, money)} vs ${v.runnerUp.key} 案 ${metricValue(v.metric, v.runnerUp.value, money)}`,
              `${v.winner.key} ${metricValue(v.metric, v.winner.value, money)} vs ${v.runnerUp.key} ${metricValue(v.metric, v.runnerUp.value, money)}`,
            )}
            {v.lift !== undefined && `(${v.lift >= 0 ? '+' : ''}${Math.round(v.lift * 100)}%)`}
            {v.p !== undefined && <span className={styles.note}>{` p = ${v.p.toFixed(3)}`}</span>}
          </span>
        ) : (
          <span className={styles.unsure}>{t('比べる相手の案の数字がありません', 'No numbers for the other variants yet')}</span>
        )}
        {v.winner && (
          <Tooltip content={t('勝ち案と、仮説が支持されたかを、次に生かすメモに足します(同じテンプレート・テーマの配信の「これまでの学び」に出ます)', 'Adds the winner and whether the hypothesis held to the notes (shown as Learnings on similar deliveries).')} relationship="description">
            <Button size="small" icon={adopted ? <CheckmarkRegular /> : <LightbulbRegular />} disabled={busy || adopted} onClick={() => void adopt()} data-noprint>
              {adopted ? t('メモに足しました', 'Added to notes') : t('学びとしてメモに採用', 'Adopt as a learning')}
            </Button>
          </Tooltip>
        )}
      </div>
      <div className={styles.note}>
        {t(
          '目安は、勝ち案と 2 番目の案の 2 つの割合の z 検定。p が 0.05 未満なら「偶然とは言いにくい」。',
          'The check is a two-proportion z-test between the top two variants; p below 0.05 means "unlikely to be chance". ',
        )}
        {v.proxy && t('1 通あたりの売上は割合でないので、偶然かどうかは注文率で見ています。', 'Revenue per recipient is not a proportion, so the chance check uses the order rate. ')}
        {t('起きた数(クリック・注文など)が 20 に満たない案があるときは、判断しません', 'No call is made while any variant has fewer than 20 events.')}
      </div>
    </section>
  )
}
