import { useState, type ReactElement, type ReactNode } from 'react'
import { Button, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/*
 * 「選び直す」の共通の枠(SU3)。メイン画像の入れ替え・商品の差し替え・部品の画像の選び直しで同じ形にする。
 * 下に伸びるだけだと開いたことが分かりにくく、中の選び方も並列に見えなかったので、
 * 枠と見出し(閉じる ×)で元の表示と分け、選び方は TabList で並べて、選んだタブの中身だけを出す。
 */

const useStyles = makeStyles({
  root: {
    display: 'grid',
    minWidth: 0,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    overflow: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    padding: '6px 6px 6px 12px',
    backgroundColor: tokens.colorBrandBackground2,
    borderBottom: `1px solid ${tokens.colorBrandStroke2}`,
  },
  title: { flexGrow: 1, minWidth: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // 部品のペインは狭いので、横にはみ出してスクロールさせず、折り返して全部の選び方を見せる
  tabs: { flexWrap: 'wrap', padding: '2px 4px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  body: { display: 'grid', rowGap: '10px', padding: '12px', minWidth: 0 },
})

export interface ChooseTab<V extends string> {
  value: V
  label: ReactNode
  icon?: ReactElement
  content: ReactNode
}

interface Props<V extends string> {
  title: ReactNode
  tabs: ChooseTab<V>[]
  /** 最初に開くタブ(渡さなければ、先頭) */
  defaultTab?: V
  /** 閉じる。渡さなければ × を出さない(まだ何も選んでいなくて、閉じられないとき) */
  onClose?: () => void
}

export function ChoosePanel<V extends string>({ title, tabs, defaultTab, onClose }: Props<V>) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<V>(defaultTab ?? tabs[0].value)
  const current = tabs.find((x) => x.value === tab) ?? tabs[0]
  return (
    <section className={s.root} aria-label={typeof title === 'string' ? title : undefined}>
      <div className={s.head}>
        <span className={s.title}>{title}</span>
        {onClose && <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} title={t('閉じる', 'Close')} />}
      </div>
      <TabList className={s.tabs} size="small" selectedValue={current.value} onTabSelect={(_, d) => setTab(d.value as V)}>
        {tabs.map((x) => (
          <Tab key={x.value} value={x.value} icon={x.icon}>
            {x.label}
          </Tab>
        ))}
      </TabList>
      <div className={s.body} role="tabpanel">
        {current.content}
      </div>
    </section>
  )
}
