import { Button, Input, Select, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, BeakerRegular, DismissRegular } from '@fluentui/react-icons'
import { allVariants, metricLabel, nextVariant, splitOf, targetLabel, type AbMetric, type AbMode, type AbTarget, type AbTest, type VariantKey } from './abTest'
import { useT } from './i18n'

const useStyles = makeStyles({
  bar: {
    display: 'grid',
    rowGap: '6px',
    margin: '0 24px 8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '8px', rowGap: '4px' },
  title: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontWeight: tokens.fontWeightSemibold },
  tabs: { display: 'inline-flex', columnGap: '4px' },
  tab: { minWidth: '64px' },
  remove: { minWidth: 'auto', marginLeft: '-6px' },
  grow: { flexGrow: 1 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  chip: { minWidth: 'auto', height: '24px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  num: { width: '64px' },
  hypo: { flexGrow: 1, minWidth: '240px' },
})

interface Props {
  ab: AbTest
  active: VariantKey
  onSwitch: (k: VariantKey) => void
  onChange: (ab: AbTest) => void
  onAdd: () => void
  onRemove: (k: VariantKey) => void
  onStop: () => void
  /** 比べる要素を変える(案の中身の持ち方が変わるので、配信カードの側で A に戻してから変える) */
  onTarget: (t: AbTarget) => void
}

/**
 * AB テストの帯(X55)。配信カードの題名の下に出す。
 * 1 行目: 案の切り替え(A・B・C。押した案を、中ペイン・プレビュー・商品情報で編集する)と、いま編集している案の説明。
 * 2 行目: テストの設定(比べる要素・指標・送り方・仮説)
 */
export function AbTestBar({ ab, active, onSwitch, onChange, onAdd, onRemove, onStop, onTarget }: Props) {
  const s = useStyles()
  const t = useT()
  const keys = allVariants(ab)
  const split = splitOf(ab)
  const canAdd = !!nextVariant(ab)
  const set = <K extends keyof AbTest>(k: K, v: AbTest[K]) => onChange({ ...ab, [k]: v })
  return (
    <div className={s.bar} role="region" aria-label={t('AB テスト', 'A/B test')}>
      <div className={s.row}>
        <span className={s.title}>
          <BeakerRegular />
          {t('AB テスト', 'A/B test')}
        </span>
        <span className={s.tabs} role="tablist" aria-label={t('案', 'Variants')}>
          {keys.map((k) => (
            <span key={k} className={s.tabs}>
              <Button
                type="button"
                size="small"
                role="tab"
                aria-selected={k === active}
                appearance={k === active ? 'primary' : 'secondary'}
                className={s.tab}
                onClick={() => onSwitch(k)}
                title={t(`${k} 案を編集する(配分 ${split[k]}%)`, `Edit variant ${k} (${split[k]}%)`)}
              >
                {t(`${k} 案`, `Variant ${k}`)}
              </Button>
              {k !== 'A' && (
                <Button
                  type="button"
                  size="small"
                  appearance="subtle"
                  className={s.remove}
                  icon={<DismissRegular />}
                  aria-label={t(`${k} 案を外す`, `Remove variant ${k}`)}
                  title={t(`${k} 案を外す`, `Remove variant ${k}`)}
                  onClick={() => {
                    if (window.confirm(t(`${k} 案を外します。${k} 案だけのメイン画像・商品は消えます(保存で確定)。よろしいですか?`, `Remove variant ${k}? Its own hero image and products will be discarded (on save).`))) onRemove(k)
                  }}
                />
              )}
            </span>
          ))}
          {canAdd && (
            <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={onAdd} title={t('A 案の写しから、新しい案を作ります', 'Create a new variant as a copy of A')}>
              {t('案を追加', 'Add variant')}
            </Button>
          )}
        </span>
        <span className={mergeClasses(s.note, s.grow)}>
          {active === 'A'
            ? t(`A 案(いまの配信そのもの)を編集中。${targetLabel(ab.target)}は案ごと、それ以外は全案で共通です`, `Editing variant A (the delivery itself). Each variant has its own ${targetLabel(ab.target).toLowerCase()}; everything else is shared.`)
            : t(`${active} 案を編集中。${targetLabel(ab.target)}は ${active} 案だけのもの。それ以外(テーマ・コピー・リンク先など)を直すと、全案に効きます`, `Editing variant ${active}. It has its own ${targetLabel(ab.target).toLowerCase()}; other fields (theme, copy, links…) are shared by all variants.`)}
        </span>
        <Button
          type="button"
          size="small"
          appearance="subtle"
          onClick={() => {
            if (window.confirm(t('AB テストをやめて、A 案だけに戻します。B・C 案は消えます(保存で確定)。よろしいですか?', 'Stop the A/B test and keep only variant A? Variants B and C will be discarded (on save).'))) onStop()
          }}
        >
          {t('AB テストをやめる', 'Stop A/B test')}
        </Button>
      </div>
      <div className={s.row}>
        <span className={s.label}>{t('比べる', 'Compare')}</span>
        {(['hero', 'products', 'both'] as AbTarget[]).map((x) => (
          <Button key={x} type="button" size="small" shape="circular" className={s.chip} appearance={ab.target === x ? 'primary' : 'outline'} onClick={() => ab.target !== x && onTarget(x)}>
            {targetLabel(x)}
          </Button>
        ))}
        <span className={s.label}>{t('判定', 'Judge by')}</span>
        <Select size="small" value={ab.metric} onChange={(_, d) => set('metric', d.value as AbMetric)} aria-label={t('判定の指標', 'Metric')}>
          {(['ctr', 'rpr', 'cvr', 'open'] as AbMetric[]).map((m) => (
            <option key={m} value={m}>{metricLabel(m)}</option>
          ))}
        </Select>
        <span className={s.label}>{t('送り方', 'Send')}</span>
        <Select size="small" value={ab.mode} onChange={(_, d) => set('mode', d.value as AbMode)} aria-label={t('送り方', 'How to send')}>
          <option value="winner">{t('一部に送り、勝った案を残りに', 'Test group, then winner to the rest')}</option>
          <option value="even">{t('全員を均等に分ける', 'Split everyone evenly')}</option>
        </Select>
        {ab.mode === 'winner' && (
          <>
            <span className={s.label}>{t('テスト', 'Test')}</span>
            <Input
              size="small"
              type="number"
              className={s.num}
              min={5}
              max={90}
              value={String(ab.testShare)}
              onChange={(_, d) => set('testShare', Math.max(5, Math.min(90, Number(d.value) || 0)))}
              contentAfter="%"
              aria-label={t('テストに回す割合', 'Test share')}
            />
            <span className={s.label}>{t('判定まで', 'Decide after')}</span>
            <Input
              size="small"
              type="number"
              className={s.num}
              min={1}
              max={72}
              value={String(ab.waitHours)}
              onChange={(_, d) => set('waitHours', Math.max(1, Math.min(72, Number(d.value) || 0)))}
              contentAfter={t('時間', 'h')}
              aria-label={t('勝ち負けを決めるまでの時間', 'Hours before choosing the winner')}
            />
          </>
        )}
        <span className={s.note}>{keys.map((k) => `${k} ${split[k]}%`).join(' / ')}{ab.mode === 'winner' ? t(` ・ 残り ${100 - ab.testShare}% に勝った案`, ` · winner to the remaining ${100 - ab.testShare}%`) : ''}</span>
      </div>
      <div className={s.row}>
        <span className={s.label}>{t('仮説', 'Hypothesis')}</span>
        <Input
          size="small"
          className={s.hypo}
          value={ab.hypothesis}
          onChange={(_, d) => set('hypothesis', d.value)}
          placeholder={t('例: 着用画像のほうが、商品だけの画像よりクリックされる', 'e.g. A lifestyle photo gets more clicks than a product-only shot')}
        />
      </div>
    </div>
  )
}
