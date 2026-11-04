// 設定の状態(settings.setup の健康診断。⚙ → 全社 →「設定の状態」。管理する人だけ。2026-11-03 利用者「忘れていても問題ないように」)。
// 設定はめったにしないので手順を忘れる。サーバーが 1 行ずつ「済み / 足りない / 確認に失敗 / 注意」と直し方を出し、画面で直せる行は「直す」で連れて行く。
// 中身は python -m ccp.cli check と同じ(server/ccp/health.py)。開くたびに、AI を 1 回呼び、BigQuery の表を読んで確かめる
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, ArrowRightRegular } from '@fluentui/react-icons'
import { HealthService, type HealthItem, type HealthReport } from './data/health'
import { setHealthCounts } from './healthState'
import { locale, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  summary: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  right: { marginLeft: 'auto', display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  area: { ...typo.heading, paddingTop: tokens.spacingVerticalS },
  // 札・文・「直す」の 3 列。札の幅は中身に合わせ、文が残りを使う(表にすると、札の列が広がって文が右に寄るため)
  rows: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS, alignItems: 'start', paddingTop: tokens.spacingVerticalXS },
  text: { overflowWrap: 'anywhere' },
  fix: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
})

const areaName = (area: string, t: ReturnType<typeof useT>) =>
  ({
    db: t('DB', 'Database'),
    google: t('Google の認証', 'Google credentials'),
    ai: t('AI', 'AI'),
    bq: t('BigQuery', 'BigQuery'),
    sync: t('定期の取り込み', 'Scheduled import'),
    assets: t('写真', 'Photos'),
    guard: t('画面の守り', 'Access protection'),
    static: t('画面', 'App build'),
  })[area] ?? area

function StatusBadge({ status }: { status: HealthItem['status'] }) {
  const t = useT()
  if (status === 'ok') return <Badge appearance="tint" color="success">{t('済み', 'OK')}</Badge>
  if (status === 'missing') return <Badge appearance="filled" color="danger">{t('足りない', 'Missing')}</Badge>
  if (status === 'failed') return <Badge appearance="filled" color="danger">{t('確認に失敗', 'Check failed')}</Badge>
  return <Badge appearance="filled" color="warning">{t('注意', 'Warning')}</Badge>
}

/** go = ⚙ のほかの項目に移る(ai → AI の設定、dataimport → データの取り込み) */
export function SettingsHealthPanel({ go }: { go: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [report, setReport] = useState<HealthReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    setBusy(true)
    setError('')
    const r = await HealthService.check()
    setBusy(false)
    if (!r.data) return setError(r.error ?? '')
    setReport(r.data)
    setHealthCounts(r.data.counts)
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたときに確かめる(設定は外で変わるので、前の結果を見せない)
    void check()
  }, [check])

  // 画面で直せる所の、⚙ の項目
  const target = (goto: string) => ({ ai: 'aiSettings', dataimport: 'bq', secrets: 'secrets' })[goto]
  const c = report?.counts
  const bad = c ? c.missing + c.failed : 0
  const areas = report ? [...new Set(report.items.map((i) => i.area))] : []
  return (
    <div className={s.root}>
      <div className={s.bar}>
        {report && c && (
          <span className={s.summary}>
            {bad ? (
              <Badge appearance="filled" color="danger">{t(`直す所が ${bad} 件`, `${bad} to fix`)}</Badge>
            ) : (
              <Badge appearance="tint" color="success">{t('足りない所はありません', 'Nothing missing')}</Badge>
            )}
            {c.warn > 0 && <Badge appearance="outline" color="warning">{t(`注意 ${c.warn} 件`, `${c.warn} warnings`)}</Badge>}
            <span className={s.note}>{t(`${new Date(report.checkedAt * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })} に確かめました`, `Checked at ${new Date(report.checkedAt * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`)}</span>
          </span>
        )}
        <span className={s.right}>
          {busy && <Spinner size="extra-tiny" />}
          <Button size="small" icon={<ArrowClockwiseRegular />} disabled={busy} onClick={() => void check()}>
            {t('もう一度確かめる', 'Check again')}
          </Button>
        </span>
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!report && busy && <span className={s.note}>{t('AI を 1 回呼び、BigQuery の表を読んで確かめています(十数秒かかることがあります)…', 'Calling AI once and reading BigQuery tables (may take a few seconds)…')}</span>}
      {report &&
        areas.map((area) => (
          <div key={area}>
            <div className={s.area}>{areaName(area, t)}</div>
            <div className={s.rows}>
              {report.items
                .filter((i) => i.area === area)
                .map((i, k) => (
                  <Fragment key={k}>
                    <StatusBadge status={i.status} />
                    <div>
                      <div className={s.text}>{i.text}</div>
                      {i.fix && i.status !== 'ok' && <div className={s.fix}>{i.fix}</div>}
                    </div>
                    <span>
                      {i.status !== 'ok' && target(i.goto) && (
                        <Button size="small" appearance="subtle" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => go(target(i.goto)!)}>
                          {t('直す', 'Fix')}
                        </Button>
                      )}
                    </span>
                  </Fragment>
                ))}
            </div>
          </div>
        ))}
      <span className={s.note}>
        {t(
          'サーバーのターミナルで python -m ccp.cli check を実行しても、同じ行が出ます。「直す」のない行は、サーバーの設定(ファイルや環境変数)で直します。',
          'Running python -m ccp.cli check on the server shows the same rows. Rows without "Fix" are fixed in the server settings (file or environment variables).',
        )}
      </span>
    </div>
  )
}
