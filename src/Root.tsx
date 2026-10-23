import { FluentProvider } from '@fluentui/react-components'
import { useFluentTheme } from './theme.ts'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'

export default function Root() {
  const theme = useFluentTheme()
  return (
    <FluentProvider theme={theme} style={{ width: '100%', boxSizing: 'border-box', minHeight: 'calc(100vh / var(--ui-zoom, 1))', background: 'var(--colorNeutralBackground2)' }}>
      {/* 最後の砦: どこで失敗しても、真っ白にせず、理由を出す */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </FluentProvider>
  )
}
