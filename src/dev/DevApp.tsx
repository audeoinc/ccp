import { useEffect, useState } from 'react'
import { FluentProvider, MessageBar, MessageBarBody, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { WrenchRegular } from '@fluentui/react-icons'
import { DevApi, isFailure, type Settings, type Status } from './api'
import { BqTab } from './BqTab'
import { PolicyTab } from './PolicyTab'
import { useFluentTheme } from '../theme'

const useStyles = makeStyles({
  root: { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '100vh', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  title: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px' },
  status: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, display: 'flex', gap: '12px', flexWrap: 'wrap', marginLeft: 'auto' },
  key: { fontWeight: tokens.fontWeightSemibold },
})

type TabKey = 'bq' | 'policy'

// AI のモデルは、SQL の会話の欄で選んだものを使う(ChatPanel が覚えている。なければサーバーの既定)
const chosenModel = (): string | null => {
  try {
    return (JSON.parse(window.localStorage.getItem('ccp-dev-model') ?? '""') as string) || null
  } catch {
    return null
  }
}

/**
 * 開発用の画面(/dev/。設計は docs/DEVTOOLS.md)。CCP の画面とはつなげない(入り口も URL も別)。
 * 使うのは開発する人だけなので、画面の文言は日本語だけ(CCP の画面の t() の約束の例外。2026-10-22 利用者と決めた)
 */
function DevApp() {
  const s = useStyles()
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<TabKey>('bq')

  useEffect(() => {
    void (async () => {
      const [st, se] = await Promise.all([DevApi.status(), DevApi.settings()])
      if (isFailure(st)) setError(st.error)
      else setStatus(st)
      setSettings(isFailure(se) ? {} : se)
    })()
  }, [])

  const saveSettings = (next: Settings) => {
    setSettings(next)
    void DevApi.saveSettings(next)
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <span className={s.title}>
          <WrenchRegular /> CCP 開発用
        </span>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabKey)}>
          <Tab value="bq">BigQuery</Tab>
          <Tab value="policy">ポリシーの文書</Tab>
        </TabList>
        {status && (
          <span className={s.status}>
            <span>
              <span className={s.key}>ジョブのプロジェクト</span> {status.project ?? '(未設定)'}
            </span>
            <span>
              <span className={s.key}>アカウント</span> {status.account}
            </span>
            <span>
              <span className={s.key}>読む量の上限</span> {status.max_gb} GB
            </span>
          </span>
        )}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {settings && tab === 'bq' && <BqTab settings={settings} onSettings={saveSettings} />}
      {settings && tab === 'policy' && <PolicyTab settings={settings} onSettings={saveSettings} model={chosenModel()} />}
    </div>
  )
}

/** テーマ(CCP の画面と同じ。明るい・暗いは OS に合わせる)を付けた、開発用の画面の全体 */
export function DevRoot() {
  const theme = useFluentTheme()
  return (
    <FluentProvider theme={theme} style={{ minHeight: '100vh', background: 'var(--colorNeutralBackground2)' }}>
      <DevApp />
    </FluentProvider>
  )
}
