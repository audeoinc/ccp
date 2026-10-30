import { Button, Field, Input, Select, makeStyles, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import { allVariants, metricLabel, splitOf, targetLabel, type AbMetric, type AbMode, type AbPurpose, type AbTarget, type AbTest, type VariantKey } from '../abTest'
import { confirmDialog } from '../confirm'
import { useFeature } from '../featureFlags'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '10px', width: '340px' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  chip: { minWidth: 'auto', height: '26px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  num: { width: '88px' },
  foot: { display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

/**
 * シンプルな配信カードの AB テストの設定(SU2 ⑦。タブの横の ⚙)。既定値のままでも始められるので、ここは開かなくてもよい。
 * 比べる要素は選ばせない(A と違う所から自動で決める。saveTarget)。いま決まっている比べる要素は、読むだけで出す
 */
export function AbSettings({ ab, active, target, onChange, onDecide, onStop }: { ab: AbTest; active: VariantKey; target: AbTarget; onChange: (ab: AbTest) => void; onDecide: (k: VariantKey) => void; onStop: () => void }) {
  // 選べる目的は、公開している機能だけ(X87。いま選んでいる目的は、非公開でも出したまま。いまの案が崩れないように)
  const testOn = useFeature('card.abtest')
  const chooseOn = useFeature('card.variants')
  const t = useT()
  const s = useStyles()
  const choose = ab.purpose === 'choose'
  const set = <K extends keyof AbTest>(k: K, v: AbTest[K]) => onChange({ ...ab, [k]: v })
  const split = splitOf(ab)
  return (
    <div className={s.root}>
      <div className={s.row}>
        {(['test', 'choose'] as AbPurpose[]).filter((x) => x === (ab.purpose ?? 'test') || (x === 'test' ? testOn : chooseOn)).map((x) => (
          <Button key={x} type="button" size="small" shape="circular" className={s.chip} appearance={(ab.purpose ?? 'test') === x ? 'primary' : 'outline'} onClick={() => set('purpose', x)}>
            {x === 'test' ? t('AB テスト(全案を送る)', 'A/B test (send all)') : t('案から選ぶ(1 案だけ送る)', 'Choose one (send one)')}
          </Button>
        ))}
      </div>
      <span className={s.note}>{t(`比べるもの: ${targetLabel(target)}(A と違う所から自動で決めます)`, `Comparing: ${targetLabel(target)} (set automatically from what differs from A)`)}</span>
      {!choose && (
        <>
          <Field label={t('判定の指標', 'Judge by')} size="small">
            <Select size="small" value={ab.metric} onChange={(_, d) => set('metric', d.value as AbMetric)}>
              {(['ctr', 'rpr', 'cvr', 'open'] as AbMetric[]).map((m) => (
                <option key={m} value={m}>{metricLabel(m)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('送り方', 'How to send')} size="small">
            <Select size="small" value={ab.mode} onChange={(_, d) => set('mode', d.value as AbMode)}>
              <option value="winner">{t('一部に送り、勝った案を残りに', 'Test group, then winner to the rest')}</option>
              <option value="even">{t('全員を均等に分ける', 'Split everyone evenly')}</option>
            </Select>
          </Field>
          {ab.mode === 'winner' && (
            <div className={s.row}>
              <Input size="small" type="number" className={s.num} min={5} max={90} value={String(ab.testShare)} onChange={(_, d) => set('testShare', Math.max(5, Math.min(90, Number(d.value) || 0)))} contentAfter="%" aria-label={t('テストに回す割合', 'Test share')} />
              <Input size="small" type="number" className={s.num} min={1} max={72} value={String(ab.waitHours)} onChange={(_, d) => set('waitHours', Math.max(1, Math.min(72, Number(d.value) || 0)))} contentAfter={t('時間', 'h')} aria-label={t('勝ち負けを決めるまでの時間', 'Hours before choosing the winner')} />
            </div>
          )}
          <span className={s.note}>
            {allVariants(ab).map((k) => `${k} ${split[k]}%`).join(' / ')}
            {ab.mode === 'winner' ? t(` ・ 残り ${100 - ab.testShare}% に勝った案`, ` · winner to the remaining ${100 - ab.testShare}%`) : ''}
          </span>
          <Field label={t('仮説(何を確認したいか)', 'Hypothesis')} size="small">
            <Input size="small" value={ab.hypothesis} onChange={(_, d) => set('hypothesis', d.value)} placeholder={t('例: 着用画像のほうがクリックされる', 'e.g. A lifestyle photo gets more clicks')} />
          </Field>
        </>
      )}
      <div className={s.foot}>
        {choose && (
          <Button type="button" size="small" appearance="primary" icon={<CheckmarkCircleRegular />} onClick={() => onDecide(active)}>
            {t(`${active} 案に決める`, `Go with ${active}`)}
          </Button>
        )}
        <Button
          type="button"
          size="small"
          appearance="subtle"
          icon={<DismissCircleRegular />}
          onClick={async () => {
            if (await confirmDialog(t('案をやめて、A 案だけに戻します。B・C 案は消えます(保存で確定)。よろしいですか?', 'Stop and keep only variant A? Variants B and C will be discarded (on save).'))) onStop()
          }}
        >
          {choose ? t('案をやめる', 'Stop') : t('AB テストをやめる', 'Stop A/B test')}
        </Button>
      </div>
    </div>
  )
}
