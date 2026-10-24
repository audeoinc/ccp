import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '2px', padding: '10px 12px 0 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  // 1 段目: 何を見ているか(左上)と、その面の操作(右)
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  title: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexShrink: 1 },
  grow: { flexGrow: 1 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexShrink: 0 },
  // 2 段目: 面のタブ(PLAN | PRODUCTION | RESULTS)
  tabs: { display: 'flex', alignItems: 'flex-end', marginBottom: '-1px', columnGap: '16px', minWidth: 0 },
  // 2 段目の、面のタブの右(配信の全体にかかわるもの。シンプルな配信カードでは AB テストの案)
  tabsExtra: { display: 'flex', alignItems: 'center', minWidth: 0, paddingBottom: '4px' },
})

/**
 * シンプルな画面の上の帯(2026-10-23 利用者と決めた)。1 段目の左上に「何を見ているか」(チャネル・配信名・日時)、右にその面の操作。
 * 2 段目に、同じ配信の面のタブ(PLAN | PRODUCTION | RESULTS。StageNav の tabs)。
 * 配信が主役で、面はその見方なので、題名を上に、面のタブを下に置く。どの面の画面も同じ部品を使い、タブで移っても題名の位置と形が変わらないようにする
 * (企画のシンプルな配信カードが最初。制作・結果のシンプルな画面も、これを使う)
 */
export function StageHeader({ title, actions, tabs, tabsExtra }: { title: ReactNode; actions?: ReactNode; tabs?: ReactNode; tabsExtra?: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.row}>
        <div className={s.title}>{title}</div>
        <span className={s.grow} />
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      {(tabs || tabsExtra) && (
        <div className={s.tabs}>
          {tabs}
          {tabsExtra && <div className={s.tabsExtra}>{tabsExtra}</div>}
        </div>
      )}
    </div>
  )
}
