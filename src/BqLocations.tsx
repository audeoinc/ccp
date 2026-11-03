// BigQuery の表の場所(⚙ →「データの取り込み」。管理する人だけ。2026-11-03 利用者「できるだけ DB に」)。
// 出力ごとの場所・更新を見る元の表(ビューのとき)は、表の行の詳しい所(OutputLocation)で、ジョブのプロジェクトと変えた記録は表の下(BqProject)で変える。
// 「接続を確認」は保存の前の値で読んで確かめるだけ(何も書かない)。前の版の環境変数(BQ_SPU など)は、サーバーが最初に一度だけ DB に写す。
// 値と保存は useBqLocations の 1 つだけを使い、行ごとに持たない(どの行で保存しても、ほかの行の値を巻き戻さないように)。サーバーは server/ccp/appsettings.py
import { Badge, Button, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { PlugConnectedRegular, SaveRegular } from '@fluentui/react-icons'
import type { ImportCheck } from './data/dataImport'
import { bqOutputLabel } from './gcp/bq'
import { CopiedFromEnv, SettingsHistory } from './SettingsChanges'
import type { BqLocationsState } from './useBqLocations'
import { locale, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minWidth: 0 },
  pair: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalXS },
  issue: { fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  sub: { ...typo.heading },
  end: { alignSelf: 'flex-end' },
})

function TryResult({ c }: { c: ImportCheck['outputs'][number] }) {
  const s = useStyles()
  const t = useT()
  return (
    <>
      <span className={s.issue}>
        {c.ok ? <Badge size="small" appearance="tint" color="success">{t('読める', 'Readable')}</Badge> : <Badge size="small" appearance="filled" color="danger">{t('読めない・NG', 'Not readable / NG')}</Badge>}{' '}
        {c.rows != null && t(`${c.rows.toLocaleString(locale())} 行`, `${c.rows.toLocaleString(locale())} rows`)}
      </span>
      {c.issues.map((i, k) => (
        <span key={k} className={s.issue}>
          <Badge size="small" appearance="outline" color={i.level === 'NG' ? 'danger' : 'warning'}>{i.level === 'NG' ? 'NG' : t('注意', 'Warning')}</Badge> {i.text}
        </span>
      ))}
    </>
  )
}

/** 行の詳しい所に出す、その出力の表の場所 */
export function OutputLocation({ name, loc }: { name: string; loc: BqLocationsState }) {
  const s = useStyles()
  const t = useT()
  if (!loc.view) return loc.error ? <div className={s.issue}>{loc.error}</div> : <Spinner size="extra-tiny" />
  const watch = `${name}_watch`
  const keys = [name, watch]
  const working = loc.busy?.includes(name)
  return (
    <div className={s.root}>
      <div className={s.pair}>
        <Field size="small" label={t('表の場所(<プロジェクト>.<データセット>.<テーブルかビュー>)', 'Location (<project>.<dataset>.<table or view>)')}>
          <Input size="small" value={loc.form[name] ?? ''} placeholder={loc.view.env[name]} onChange={(_, d) => loc.set(name, d.value)} />
        </Field>
        <Field size="small" label={t('更新を見る元の表(出力がビューのとき)', 'Source table to watch (when it is a view)')}>
          <Input size="small" value={loc.form[watch] ?? ''} placeholder={loc.view.env[watch]} onChange={(_, d) => loc.set(watch, d.value)} />
        </Field>
      </div>
      {loc.tried[name] && <TryResult c={loc.tried[name]} />}
      <div className={s.actions}>
        {working && <Spinner size="extra-tiny" />}
        <Button size="small" icon={<PlugConnectedRegular />} disabled={!!loc.busy || !(loc.form[name] ?? '').trim()} onClick={() => void loc.tryOutputs([name])}>
          {t('接続を確認', 'Test connection')}
        </Button>
        <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={!!loc.busy || !loc.dirty(keys)} onClick={() => void loc.save(keys)}>
          {t('保存', 'Save')}
        </Button>
        {loc.savedKeys.includes(name) && <span className={s.note}>{t('保存しました。次の取り込みから、この場所を読みます。', 'Saved. The next import reads this location.')}</span>}
        {loc.tried[name] && <span className={s.note}>{t('接続の確認は、読んで確かめるだけです(何も書き込んでいません)。', 'The test only reads (nothing was written).')}</span>}
      </div>
      {loc.error && <span className={s.issue}>{loc.error}</span>}
    </div>
  )
}

/** 表の下: ジョブのプロジェクトと、環境変数から写したこと・変えた記録 */
export function BqProject({ loc }: { loc: BqLocationsState }) {
  const s = useStyles()
  const t = useT()
  if (!loc.view) return loc.error ? <MessageBar intent="error"><MessageBarBody>{loc.error}</MessageBarBody></MessageBar> : <Spinner size="tiny" />
  const label = (key: string) => (key === 'project' ? t('ジョブのプロジェクト', 'Job project') : key.endsWith('_watch') ? `${bqOutputLabel(key.slice(0, -6))}(${t('元の表', 'source table')})` : bqOutputLabel(key))
  return (
    <div className={s.root}>
      <CopiedFromEnv view={loc.view} />
      <div className={s.actions}>
        <Field size="small" label={t('ジョブのプロジェクト(問い合わせを走らせる。空なら AI と同じプロジェクト)', 'Job project (runs the queries; blank = same project as AI)')}>
          <Input size="small" value={loc.form.project ?? ''} placeholder={loc.view.env.project} onChange={(_, d) => loc.set('project', d.value)} />
        </Field>
        <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={!!loc.busy || !loc.dirty(['project'])} className={s.end} onClick={() => void loc.save(['project'])}>
          {t('保存', 'Save')}
        </Button>
        {loc.savedKeys.includes('project') && <span className={s.note}>{t('保存しました', 'Saved')}</span>}
      </div>
      <span className={s.sub}>{t('表の場所を変えた記録', 'Location change history')}</span>
      <SettingsHistory view={loc.view} label={label} />
    </div>
  )
}
