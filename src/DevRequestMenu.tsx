import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import { LightbulbRegular, MoreHorizontalRegular } from '@fluentui/react-icons'
import { openDevRequestList } from './devRequestPlace'
import { useT } from './i18n'

/**
 * 「⋯」のメニューの「開発へのリクエストの一覧」(X69。2026-10-24 利用者)。ヘッダーの「リクエスト」は、配信カード・制作のページ・結果・アラートの
 * フロートに隠れるので、それぞれの「⋯」から開けるようにする(右下に浮かせたボタンは、分かりにくいのでやめた)
 */
export function DevRequestMenuItem() {
  const t = useT()
  return (
    <MenuItem icon={<LightbulbRegular />} onClick={openDevRequestList}>
      {t('開発へのリクエストの一覧', 'Requests to developers')}
    </MenuItem>
  )
}

/** 「⋯」のメニューがないフロート(制作のページ・結果・アラート)に置く、この項目だけの「⋯」 */
export function DevRequestMoreMenu() {
  const t = useT()
  return (
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <DevRequestMenuItem />
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
