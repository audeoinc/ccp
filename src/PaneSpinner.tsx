import { Spinner } from '@fluentui/react-components'

/**
 * ペイン・パネルの中の、読み込み中の印(Fluent の Spinner の tiny を、真ん中に。言葉は付けない)。
 * 画面ごとに大きさ・置き方・言葉がばらばらだったので、1 つにする(simple-ui-review-2 の 24)。画面全体の読み込みは、これを使わない
 */
export function PaneSpinner() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '16px 0' }}>
      <Spinner size="tiny" />
    </div>
  )
}
