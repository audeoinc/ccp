import { lazy, Suspense } from 'react'
import { FluentProvider, Spinner } from '@fluentui/react-components'
import { useFluentTheme } from './theme.ts'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'

// 初期設定の画面(settings.setup)。ふだんは読み込まない
const SetupPage = lazy(() => import('./setup/SetupPage').then((m) => ({ default: m.SetupPage })))

/** setup = 起動に要る設定が足りない(サーバーが初期設定の状態)。そのときは初期設定の画面だけを出す */
export default function Root({ setup = false }: { setup?: boolean }) {
  const theme = useFluentTheme()
  return (
    <FluentProvider theme={theme} style={{ width: '100%', boxSizing: 'border-box', minHeight: 'calc(100vh / var(--ui-zoom, 1))', background: 'var(--colorNeutralBackground2)' }}>
      {/* 最後の砦: どこで失敗しても、真っ白にせず、理由を出す */}
      <ErrorBoundary>
        {setup ? (
          <Suspense fallback={<Spinner size="small" />}>
            <SetupPage />
          </Suspense>
        ) : (
          <App />
        )}
      </ErrorBoundary>
    </FluentProvider>
  )
}
