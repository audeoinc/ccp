import { Button } from '@fluentui/react-components'
import { InfoRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/**
 * 入れ替えの候補の行の「詳しく」(2026-10-26 利用者と決めた案 C)。行を押すとすぐ入れ替わる動きは残し、
 * この小さなボタンだけが、候補の詳しい情報(いまの商品と同じ ProductDetail)を開く。行の中に置くので、押しても行の動きに伝えない
 */
export function ProductDetailButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useT()
  return (
    <Button
      type="button"
      size="small"
      appearance="transparent"
      icon={<InfoRegular />}
      disabled={disabled}
      title={t('この候補の詳しい情報(売上・在庫など)を見ます', 'See details for this candidate (sales, stock, etc.)')}
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      {t('詳しく', 'Details')}
    </Button>
  )
}
