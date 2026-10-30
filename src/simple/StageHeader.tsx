import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { ChannelBadge } from '../ChannelBadge'

const useStyles = makeStyles({
  root: { display: 'grid', padding: '0 12px 0 20px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  // 1 行に、何を見ているか(左)・面のタブ・その面の状態・その面の操作(右)。狭いときは、2 行に折らずに、配信名を … にして縮める
  row: { display: 'flex', alignItems: 'center', columnGap: '8px', minHeight: '44px', minWidth: 0 },
  title: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexShrink: 1, whiteSpace: 'nowrap', overflow: 'hidden' },
  name: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px', minWidth: '80px', flexShrink: 1 },
  when: { flexShrink: 0 },
  // その面の状態(計画 = 承認の札と保存の様子、制作 = 制作の状態の札)。中身の長さが違っても、左の題とタブは動かない
  status: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0, flexShrink: 1, overflow: 'hidden', whiteSpace: 'nowrap' },
  grow: { flexGrow: 1 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexShrink: 0 },
  // 面のタブ(PLAN | PRODUCTION | RESULTS)。下線が帯の下の線に重なるように、行の下の端にそろえる
  tabs: { display: 'flex', alignSelf: 'stretch', alignItems: 'flex-end', marginBottom: '-1px', flexShrink: 0 },
  // 2 行目(配信の全体にかかわるもの。キャンペーンに入っていない配信の AB テストの案)
  extra: { display: 'flex', alignItems: 'center', minWidth: 0, paddingBottom: '4px' },
})

/**
 * シンプルな画面の上の帯(2026-10-23 利用者と決めた。2026-10-28 1 行に詰めた)。計画(配信カード)と制作の画面で、この 1 つを使う。
 * 並びは「チャネル・配信名・日時」→ 面のタブ(PLAN | PRODUCTION | RESULTS)→ その面の状態の札 → 右の端にその面の操作。
 * 題(チャネル・配信名・日時)はこの部品が同じ形で描くので、面を切り替えても題とタブの位置は変わらない。
 * 状態の札は面ごとに中身が違う(長さも違う)ので、タブの後ろに置く(2026-10-30 利用者: 「上部は固定されていて、下の部分が変わる方がかっこいい」)
 */
export function StageHeader({ channel, name, when, tabs, status, actions, tabsExtra }: { channel?: string; name: ReactNode; when: ReactNode; tabs?: ReactNode; status?: ReactNode; actions?: ReactNode; tabsExtra?: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.root}>
      <div className={s.row}>
        <div className={s.title}>
          <ChannelBadge channel={channel} />
          <span className={s.name}>{name}</span>
          <span className={s.when}>{when}</span>
        </div>
        {tabs && <div className={s.tabs}>{tabs}</div>}
        {status && <div className={s.status}>{status}</div>}
        <span className={s.grow} />
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      {tabsExtra && <div className={s.extra}>{tabsExtra}</div>}
    </div>
  )
}
