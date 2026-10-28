import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { display: 'grid', padding: '0 12px 0 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  // 1 行に、何を見ているか(左)・面のタブ・その面の操作(右)。狭いときは、2 行に折らずに、配信名を … にして縮める
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', minHeight: '44px', minWidth: 0 },
  title: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexShrink: 1, whiteSpace: 'nowrap', overflow: 'hidden' },
  grow: { flexGrow: 1 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexShrink: 0 },
  // 面のタブ(PLAN | PRODUCTION | RESULTS)。下線が帯の下の線に重なるように、行の下の端にそろえる
  tabs: { display: 'flex', alignSelf: 'stretch', alignItems: 'flex-end', marginBottom: '-1px', marginLeft: '8px', flexShrink: 0 },
  // 2 行目(配信の全体にかかわるもの。キャンペーンに入っていない配信の AB テストの案)
  extra: { display: 'flex', alignItems: 'center', minWidth: 0, paddingBottom: '4px' },
})

/**
 * シンプルな画面の上の帯(2026-10-23 利用者と決めた。2026-10-28 1 行に詰めた)。左に「何を見ているか」(チャネル・配信名・日時・状態の札)、
 * その右に同じ配信の面のタブ(PLAN | PRODUCTION | RESULTS。StageNav の tabs)、右の端にその面の操作。
 * 以前は面のタブを題名の下の 2 段目に置いていたが、プレビューを広く見せるため、題名と同じ行に入れた(2026-10-28 利用者)。
 * どの面の画面も同じ部品を使い、タブで移っても題名の位置と形が変わらないようにする
 */
export function StageHeader({ title, actions, tabs, tabsExtra }: { title: ReactNode; actions?: ReactNode; tabs?: ReactNode; tabsExtra?: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.row}>
        <div className={s.title}>{title}</div>
        {tabs && <div className={s.tabs}>{tabs}</div>}
        <span className={s.grow} />
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      {tabsExtra && <div className={s.extra}>{tabsExtra}</div>}
    </div>
  )
}
