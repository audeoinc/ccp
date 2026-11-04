// 「設定の状態」の下の、設定の型の書き出し・読み込み(settings.setup)。ほかのサーバーに同じ設定を写すため
import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, InfoLabel, MessageBar, MessageBarActions, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { SettingsTemplateService, type TemplateResult } from './data/settingsTemplate'
import { TemplateFileButton } from './setup/TemplateFileButton'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, paddingTop: tokens.spacingVerticalM, borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  actions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  title: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
})

export function SettingsTemplateSection({ go }: { go?: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<unknown>(null)
  const [result, setResult] = useState<TemplateResult | null>(null)

  const download = async () => {
    setBusy(true)
    setError('')
    const r = await SettingsTemplateService.export()
    setBusy(false)
    if (!r.data) return setError(r.error ?? '')
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ccp-settings-template-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const load = async () => {
    const template = picked
    setPicked(null)
    setBusy(true)
    setError('')
    setResult(null)
    const r = await SettingsTemplateService.import(template)
    setBusy(false)
    if (r.data) setResult(r.data)
    else setError(r.error ?? '')
  }
  return (
    <div className={s.root}>
      <InfoLabel className={s.title} info={t('AI の設定・BigQuery の表の場所・定期の取り込みの間隔を、ファイルにして、ほかのサーバーに写します。秘密(パスワード・鍵)と DB のつなぎ先は入りません。', 'Saves AI settings, BigQuery locations and import intervals to a file to copy to another server. Secrets and the database connection are not included.')}>
        {t('設定の型(ほかのサーバーへ写す)', 'Settings template (copy to another server)')}
      </InfoLabel>
      <div className={s.actions}>
        <Button icon={<ArrowDownloadRegular />} disabled={busy} onClick={() => void download()}>
          {t('書き出す', 'Export')}
        </Button>
        <TemplateFileButton disabled={busy} onPick={setPicked} onError={setError}>
          {t('読み込む', 'Import')}
        </TemplateFileButton>
        {busy && <Spinner size="extra-tiny" />}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {result && (
        <MessageBar intent={result.pending ? 'warning' : 'success'} layout="multiline">
          <MessageBarBody>
            {t('読み込みました。', 'Imported.')}
            {result.pending && t(' BigQuery の表の場所は、確認待ちです。確認が通るまで取り込みません。', ' BigQuery locations await confirmation; nothing is imported until the check passes.')}
            {result.dropped.length > 0 && t(' AI の出口の URL は、合言葉を含められる形なので写していません。⚙ →「AI の設定」で入れ直してください。', ' The AI outlet URL may carry a token, so it was not copied. Enter it again in AI settings.')}
          </MessageBarBody>
          {result.pending && go && (
            <MessageBarActions>
              <Button size="small" onClick={() => go('bq')}>
                {t('確認しに行く', 'Go and confirm')}
              </Button>
            </MessageBarActions>
          )}
        </MessageBar>
      )}
      <Dialog open={picked !== null} onOpenChange={(_, d) => !d.open && setPicked(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('設定の型を読み込みますか?', 'Import this settings template?')}</DialogTitle>
            <DialogContent>
              {t(
                'このサーバーの AI の設定・BigQuery の表の場所・定期の取り込みの間隔を、ファイルの値で書き換えます。定期の取り込みは切になり、BigQuery の表の場所を確認するまで取り込みません(ほかのリージョンの表を読まないように)。',
                'This overwrites AI settings, BigQuery locations and import intervals on this server. Scheduled import is turned off and nothing is imported until the locations are confirmed, so that another region’s tables are not read.',
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPicked(null)}>{t('やめる', 'Cancel')}</Button>
              <Button appearance="primary" onClick={() => void load()}>
                {t('読み込む', 'Import')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
