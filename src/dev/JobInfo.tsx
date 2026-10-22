import { Badge, makeStyles, tokens } from '@fluentui/react-components'
import { bytesLabel, type JobStats } from './api'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  root: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  title: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, flexGrow: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '12px', rowGap: '2px', fontSize: tokens.fontSizeBase200 },
  key: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
  mono: { fontFamily: tokens.fontFamilyMonospace, overflowWrap: 'anywhere' },
  list: { margin: 0, paddingLeft: '16px', fontFamily: tokens.fontFamilyMonospace, overflowWrap: 'anywhere' },
})

const WEIGHT_COLOR = { 軽い: 'success', ふつう: 'warning', 重い: 'danger' } as const

const usd = (v: number | null | undefined) => (v == null ? '—' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)
const secs = (v: number | null | undefined) => (v == null ? '—' : v < 60 ? `${v.toFixed(1)} 秒` : `${Math.floor(v / 60)} 分 ${Math.round(v % 60)} 秒`)

/** 結果の下の、ジョブの実行情報(重いのか・高いのか・どこを読んだのか) */
export function JobInfo({ job }: { job: JobStats }) {
  const s = useStyles()
  const text = () =>
    [
      `ジョブ ID: ${job.job_id ?? ''}(${job.location ?? ''})`,
      `処理した量: ${bytesLabel(job.processed)} / 課金された量: ${bytesLabel(job.billed)} / 概算 ${usd(job.cost_usd)}($${job.price_per_tib}/TiB)`,
      `経過: ${secs(job.elapsed)} / スロット時間: ${secs(job.slot_ms == null ? null : job.slot_ms / 1000)} / キャッシュ: ${job.cached ? '使った' : '使っていない'}`,
      ...(job.views.length ? ['参照したビュー:', ...job.views.map((v) => `  ${v}`)] : []),
      ...(job.tables.length ? ['読んだ元の表:', ...job.tables.map((v) => `  ${v}`)] : []),
    ].join('\n')
  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>ジョブの実行情報</span>
        <Badge appearance="tint" color={WEIGHT_COLOR[job.weight as keyof typeof WEIGHT_COLOR] ?? 'informative'}>
          {job.weight}
        </Badge>
        {job.cached && (
          <Badge appearance="tint" color="informative">
            キャッシュ(料金なし)
          </Badge>
        )}
        <CopyButton text={text} />
      </div>
      <div className={s.grid}>
        <span className={s.key}>料金の概算</span>
        <span>
          {usd(job.cost_usd)}(課金された量 {bytesLabel(job.billed)} × ${job.price_per_tib}/TiB。オンデマンドの場合)
        </span>
        <span className={s.key}>処理した量</span>
        <span>{bytesLabel(job.processed)}</span>
        <span className={s.key}>経過</span>
        <span>{secs(job.elapsed)}</span>
        <span className={s.key}>スロット時間</span>
        <span>{secs(job.slot_ms == null ? null : job.slot_ms / 1000)}(BigQuery が使った計算の量。長いほど重い)</span>
        <span className={s.key}>ジョブ ID</span>
        <span className={s.mono}>
          {job.job_id ?? '—'}({job.location ?? '—'})
        </span>
        {job.views.length > 0 && (
          <>
            <span className={s.key}>参照したビュー</span>
            <ul className={s.list}>
              {job.views.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </>
        )}
        {job.tables.length > 0 && (
          <>
            <span className={s.key}>読んだ元の表</span>
            <ul className={s.list}>
              {job.tables.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
