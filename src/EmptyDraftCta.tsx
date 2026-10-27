import { Button, Caption1, Text, makeStyles, tokens } from '@fluentui/react-components'
import { AiIcon } from './AiMark'
import { useT } from './i18n'

// 空の配信カードの、プレビューの真ん中に出す「AI で下書きする」(2026-10-27 利用者。案 C)。
// 開いただけで AI が走らないように、押したときだけ下書きする。シンプル・詳しいの両方の画面で、同じものをプレビューの箱の先頭に置く。
// 箱はスクロールするので、高さ 0 の sticky で見えている範囲の真ん中に留め、下の空のプレビューの操作は邪魔しない
const useStyles = makeStyles({
  anchor: {
    position: 'sticky',
    top: '40%',
    height: 0,
    zIndex: 3,
    display: 'flex',
    justifyContent: 'center',
    // 高さ 0 の箱の中で、カードが 0 の高さに縮まないように
    alignItems: 'flex-start',
    pointerEvents: 'none',
  },
  card: {
    pointerEvents: 'auto',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '360px',
    padding: '24px 28px',
    textAlign: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
  },
  note: { color: tokens.colorNeutralForeground3 },
})

/** saves = でき上がったら保存する(作ってある配信カード)。まだ作っていない案は、画面に入るだけ */
export function EmptyDraftCta({ disabled, saves, onDraft }: { disabled?: boolean; saves: boolean; onDraft: () => void }) {
  const t = useT()
  const s = useStyles()
  return (
    <div className={s.anchor}>
      <div className={s.card}>
        <Text weight="semibold">{t('この配信カードは、まだ中身がありません', 'This delivery card is still empty')}</Text>
        <Button type="button" appearance="primary" size="large" icon={<AiIcon size={20} />} disabled={disabled} onClick={onDraft}>
          {t('AI で下書きする', 'Draft with AI')}
        </Button>
        <Caption1 className={s.note}>
          {saves
            ? t('テーマ・コピー・商品・メイン画像をまとめて。でき上がったら保存します(元に戻せます)', 'Theme, copy, products, and hero image at once. Saved when done (you can undo).')
            : t('テーマ・コピー・商品・メイン画像をまとめて。保存するまでは、画面に入るだけです', 'Theme, copy, products, and hero image at once. Nothing is saved until you save.')}
        </Caption1>
      </div>
    </div>
  )
}
