// BigQuery の表の場所(⚙ →「データの取り込み」の「表の場所」。管理する人だけ。2026-11-03 利用者「できるだけ DB に」)。
// ジョブのプロジェクトと、出力ごとの場所・更新を見る元の表(ビューのとき)を入れ、「接続を確認」(保存の前の値で、読んで確かめるだけ)を通してから保存する。
// 前の版の環境変数(BQ_SPU など)は、サーバーが最初に一度だけ DB に写す(写したことと、変えた記録を下に出す)。サーバーは server/ccp/appsettings.py
import { useEffect, useState } from 'react'
import { Badge, Button, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { PlugConnectedRegular, SaveRegular } from '@fluentui/react-icons'
import { AppSettingsService, type SettingsView } from './data/appSettings'
import type { ImportCheck } from './data/dataImport'
import { bqOutputLabel } from './gcp/bq'
import { CopiedFromEnv, SettingsHistory } from './SettingsChanges'
import { locale, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  // 出力ごとに 1 行: 名前・場所・元の表(ビューのとき)
  grid: { display: 'grid', gridTemplateColumns: 'minmax(120px, auto) minmax(0, 2fr) minmax(0, 1.4fr)', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS, alignItems: 'start' },
  colHead: { ...typo.pairLabel },
  name: { ...typo.heading, paddingTop: '6px' },
  cell: { display: 'flex', flexDirection: 'column', rowGap: '2px', minWidth: 0 },
  issue: { fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  sub: { ...typo.heading },
})

const OUTPUTS = ['spu', 'sku', 'sku_stock', 'weekly', 'forecast', 'ranking']

export function BqLocations({ onSaved }: { /** 保存したら、取り込みの状態を読み直す(設定した出力が変わるため) */ onSaved: () => void }) {
  const s = useStyles()
  const t = useT()
  const [view, setView] = useState<SettingsView | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'try' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [tried, setTried] = useState<Record<string, ImportCheck['outputs'][number]> | null>(null)

  const take = (v: SettingsView) => {
    setView(v)
    setForm(Object.fromEntries(Object.entries(v.values).map(([k, x]) => [k, String(x ?? '')])))
  }
  useEffect(() => {
    let alive = true
    void AppSettingsService.get('bq').then((r) => {
      if (!alive) return
      if (r.data) take(r.data)
      else setError(r.error ?? '')
    })
    return () => {
      alive = false
    }
  }, [])

  const label = (key: string) => (key === 'project' ? t('ジョブのプロジェクト', 'Job project') : key.endsWith('_watch') ? `${bqOutputLabel(key.slice(0, -6))}(${t('元の表', 'source table')})` : bqOutputLabel(key))
  const dirty = !!view && Object.keys(form).some((k) => form[k] !== String(view.values[k] ?? ''))
  const set = (key: string, v: string) => {
    setForm((f) => ({ ...f, [key]: v }))
    setSaved(false)
  }

  const tryNow = async () => {
    setBusy('try')
    setError('')
    const r = await AppSettingsService.tryBq(form)
    setBusy(null)
    if (!r.data) return setError(r.error ?? '')
    setTried(Object.fromEntries(r.data.outputs.map((o) => [o.name, o])))
  }
  const save = async () => {
    setBusy('save')
    setError('')
    const r = await AppSettingsService.save('bq', form)
    setBusy(null)
    if (!r.data) return setError(r.error ?? '')
    take(r.data)
    setSaved(true)
    onSaved()
  }

  if (!view) return error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : <Spinner size="tiny" />
  return (
    <div className={s.root}>
      <CopiedFromEnv view={view} />
      <Field label={t('ジョブのプロジェクト(問い合わせを走らせる。空なら AI と同じプロジェクト)', 'Job project (runs the queries; blank = same project as AI)')}>
        <Input value={form.project ?? ''} placeholder="<project>" onChange={(_, d) => set('project', d.value)} />
      </Field>
      <div className={s.grid}>
        <span className={s.colHead}>{t('出力', 'Output')}</span>
        <span className={s.colHead}>{t('表の場所(<プロジェクト>.<データセット>.<テーブルかビュー>)', 'Location (<project>.<dataset>.<table or view>)')}</span>
        <span className={s.colHead}>{t('更新を見る元の表(出力がビューのとき)', 'Source table to watch (when the output is a view)')}</span>
        {OUTPUTS.map((n) => (
          <OutputRow key={n} name={n} form={form} env={view.env} tried={tried?.[n]} onChange={set} />
        ))}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {saved && (
        <MessageBar intent="success">
          <MessageBarBody>{t('保存しました。次の取り込みから、この場所を読みます。', 'Saved. The next import reads these locations.')}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.actions}>
        {busy && <Spinner size="extra-tiny" />}
        <Button size="small" icon={<PlugConnectedRegular />} disabled={!!busy} onClick={() => void tryNow()}>
          {t('接続を確認', 'Test connection')}
        </Button>
        <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={!!busy || !dirty} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        {tried && <span className={s.issue}>{t('接続の確認は、読んで確かめるだけです(何も書き込んでいません)。', 'The test only reads (nothing was written).')}</span>}
      </div>
      <span className={s.sub}>{t('変えた記録', 'Change history')}</span>
      <SettingsHistory view={view} label={label} />
    </div>
  )
}

function OutputRow(p: { name: string; form: Record<string, string>; env: Record<string, string>; tried?: ImportCheck['outputs'][number]; onChange: (key: string, v: string) => void }) {
  const s = useStyles()
  const t = useT()
  const watch = `${p.name}_watch`
  return (
    <>
      <span className={s.name}>{bqOutputLabel(p.name)}</span>
      <div className={s.cell}>
        <Input value={p.form[p.name] ?? ''} placeholder={p.env[p.name]} aria-label={bqOutputLabel(p.name)} onChange={(_, d) => p.onChange(p.name, d.value)} />
        {p.tried && (
          <span className={s.issue}>
            {p.tried.ok ? <Badge size="small" appearance="tint" color="success">{t('読める', 'Readable')}</Badge> : <Badge size="small" appearance="filled" color="danger">{t('読めない・NG', 'Not readable / NG')}</Badge>}{' '}
            {p.tried.rows != null && t(`${p.tried.rows.toLocaleString(locale())} 行`, `${p.tried.rows.toLocaleString(locale())} rows`)}
          </span>
        )}
        {p.tried?.issues.map((i, k) => (
          <span key={k} className={s.issue}>
            <Badge size="small" appearance="outline" color={i.level === 'NG' ? 'danger' : 'warning'}>{i.level === 'NG' ? 'NG' : t('注意', 'Warning')}</Badge> {i.text}
          </span>
        ))}
      </div>
      <Input value={p.form[watch] ?? ''} placeholder={p.env[watch]} aria-label={`${bqOutputLabel(p.name)} ${t('元の表', 'source table')}`} onChange={(_, d) => p.onChange(watch, d.value)} />
    </>
  )
}
