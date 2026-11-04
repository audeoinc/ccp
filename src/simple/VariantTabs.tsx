// AB テストの案のタブ(キャンペーンの帯の案の段か、題の帯の 2 段目)。計画・制作・結果で同じ形・同じ間隔にする(optimize-survey の 2 章の順 3。2026-11-03)。
// 「AB テスト ⓘ」を前に置き、案のタブが面を切り替えても同じ位置に来るようにする。案を足す・⋯ などの操作は children で後ろに
import type { ReactNode } from 'react'
import { InfoLabel, Tab, TabList, makeStyles } from '@fluentui/react-components'
import { useT } from '../i18n'

const useStyles = makeStyles({
  bar: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, flexShrink: 0 },
})

export interface VariantTab {
  value: string
  /** タブの中身(案の名前と、結果の面では数字・勝ち案の印) */
  label: ReactNode
}

/** tabs が空(AB テストをしていない)ときは、ⓘ とタブを出さず、children だけ */
export function VariantTabs({ info, selected, onSelect, tabs, children }: { info: string; selected: string; onSelect: (value: string) => void; tabs: VariantTab[]; children?: ReactNode }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.bar}>
      {tabs.length > 0 && (
        <>
          <InfoLabel size="small" info={info}>
            {t('AB テスト', 'A/B test')}
          </InfoLabel>
          <TabList size="small" selectedValue={selected} onTabSelect={(_, d) => d.value !== selected && onSelect(String(d.value))}>
            {tabs.map((v) => (
              <Tab key={v.value} value={v.value}>
                {v.label}
              </Tab>
            ))}
          </TabList>
        </>
      )}
      {children}
    </div>
  )
}
