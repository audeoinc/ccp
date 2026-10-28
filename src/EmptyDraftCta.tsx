import { Button, Caption1, Text, makeStyles, tokens } from '@fluentui/react-components'
import { AiIcon } from './AiMark'
import { useT } from './i18n'

// 空の配信カードの、配信カード全体の真ん中に出す「AI で下書きする」(2026-10-27 利用者。案 C。2026-10-28 プレビューの欄から全体の真ん中へ)。
// 開いただけで AI が走らないように、押したときだけ下書きする。シンプル・詳しいの両方の画面で、同じものを配信カードの窓の上に重ねる。
// 重ねる箱は押せないようにして、カードの外の所(ヘッダー・左右のペイン)の操作は邪魔しない
const useStyles = makeStyles({
  anchor: {
    position: 'absolute',
    inset: 0,
    // 下書き中の進み具合の覆い(20)より下、カードの中身より上
    zIndex: 15,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  card: {
    pointerEvents: 'auto',
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
  actions: { display: 'flex', gap: '8px', alignItems: 'center' },
  note: { color: tokens.colorNeutralForeground3 },
})

/** saves = でき上がったら保存する(作ってある配信カード)。まだ作っていない案は、画面に入るだけ */
/** onCancel = 消して、手で作り始める */
export function EmptyDraftCta({ disabled, saves, onDraft, onCancel }: { disabled?: boolean; saves: boolean; onDraft: () => void; onCancel: () => void }) {
  const t = useT()
  const s = useStyles()
  return (
    <div className={s.anchor}>
      <div className={s.card}>
        <Text weight="semibold">{t('この配信カードは、まだ中身がありません', 'This delivery card is still empty')}</Text>
        <div className={s.actions}>
          <Button type="button" appearance="primary" size="large" icon={<AiIcon size={20} />} disabled={disabled} onClick={onDraft}>
            {t('AI で下書きする', 'Draft with AI')}
          </Button>
          <Button type="button" size="large" onClick={onCancel}>
            {t('やめる', 'Cancel')}
          </Button>
        </div>
        <Caption1 className={s.note}>
          {saves
            ? t('テーマ・コピー・商品・メイン画像をまとめて。でき上がったら保存します(元に戻せます)', 'Theme, copy, products, and hero image at once. Saved when done (you can undo).')
            : t('テーマ・コピー・商品・メイン画像をまとめて。保存するまでは、画面に入るだけです', 'Theme, copy, products, and hero image at once. Nothing is saved until you save.')}
        </Caption1>
      </div>
    </div>
  )
}
