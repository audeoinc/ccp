import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CreativeFiles } from './data/creativeFiles'
import { useT } from './i18n'

const useStyles = makeStyles({
  img: { display: 'block', maxWidth: '100%', maxHeight: '160px', objectFit: 'contain', justifySelf: 'start', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground1 },
  small: { maxWidth: '96px', maxHeight: '60px' },
})

/**
 * ピンを書いたときの様子の画像(X65 (b))。押すと、別のタブで大きく開く。
 * 配信カードのコメントのピンと、開発へのリクエストのピン(フロートと一覧)で同じものを使う
 */
export function PinThenImage({ stored, small }: { stored: string; small?: boolean }) {
  const t = useT()
  const s = useStyles()
  const url = CreativeFiles.url(stored)
  return (
    <a href={url} target="_blank" rel="noreferrer" title={t('大きく見る', 'Open full size')} onClick={(e) => e.stopPropagation()}>
      <img className={mergeClasses(s.img, small && s.small)} src={url} alt={t('書いたときの様子', 'How it looked when written')} />
    </a>
  )
}
