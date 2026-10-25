import { Tab, TabList } from '@fluentui/react-components'
import { useT } from '../i18n'

/**
 * 配信カードの見せ方の切り替え(シンプル | 詳しい。SU1)。配信カードの上の帯に置き、最後に選んだ方を、次に開くときにも使う(人の設定 simpleCard.on)。
 * 切り替えても、直している中身はそのまま(同じ CardDetail の描き方だけが替わる)。
 * 部品は Fluent の TabList(丸い小さな形。整理 #11 で自前のボタンから替えた)
 */
export function ViewSwitch({ simple, onChange }: { simple: boolean; onChange: (simple: boolean) => void }) {
  const t = useT()
  return (
    <TabList size="small" appearance="subtle-circular" selectedValue={simple ? 'simple' : 'full'} onTabSelect={(_, d) => onChange(d.value === 'simple')} aria-label={t('配信カードの見せ方', 'Card view')} style={{ flexShrink: 0 }}>
      <Tab value="simple" title={t('プレビューを押して直す画面', 'Click the preview to edit')}>
        {t('シンプル', 'Simple')}
      </Tab>
      <Tab value="full" title={t('すべての欄と工程が並ぶ画面', 'All fields and steps')}>
        {t('詳しい', 'Full')}
      </Tab>
    </TabList>
  )
}
