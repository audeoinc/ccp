import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, tokens } from '@fluentui/react-components'
import { tr } from './i18n'
import { Z } from './layers'

interface Props {
  children: ReactNode
  /** 変わったら、もう一度描いてみる(画面・見せ方を移ったとき、別の配信を開いたとき) */
  resetKey?: string
  /** 閉じる先があるとき(配信カードなど)。押すと閉じる */
  onClose?: () => void
  /** 画面の上に重ねて出す(配信カードのように、重なって開く画面のとき) */
  overlay?: boolean
}

interface State {
  error: Error | null
  key?: string
}

/**
 * 画面の一部で描画に失敗しても、ページ全体を真っ白にしない(2026-10-23: 本番のデータに当たって、画面全体が真っ白になった)。
 * 失敗した部分だけを、理由と「もう一度」「閉じる」のお知らせに置き換える。テンプレートなど、変わり続けるデータに当たっても使い続けられるように
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // 画面を移ったら、失敗の表示を消して、描き直す
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 直すときの手がかり(どの部品で止まったか)を、開発者ツールに残す
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const bar = (
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>{tr('この部分を表示できませんでした', 'This part could not be shown')}</MessageBarTitle>
          {tr('ほかの画面は、そのまま使えます。直らないときは、下の内容を添えて知らせてください。', 'The rest of the app still works. If this keeps happening, report it with the details below.')}
          <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{error.message}</div>
        </MessageBarBody>
        <MessageBarActions>
          <Button size="small" onClick={() => this.setState({ error: null })}>
            {tr('もう一度', 'Try again')}
          </Button>
          {this.props.onClose && (
            <Button size="small" appearance="primary" onClick={this.props.onClose}>
              {tr('閉じる', 'Close')}
            </Button>
          )}
        </MessageBarActions>
      </MessageBar>
    )
    if (!this.props.overlay) return <div style={{ padding: 16 }}>{bar}</div>
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: Z.errorOverlay, display: 'grid', placeItems: 'start center', paddingTop: 80, backgroundColor: tokens.colorBackgroundOverlay }}>
        <div style={{ width: 'min(640px, calc(100vw - 32px))' }}>{bar}</div>
      </div>
    )
  }
}
