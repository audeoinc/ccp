import { makeStyles, Tooltip, tokens } from '@fluentui/react-components'

const useStyles = makeStyles({
  // サムネイルは、画像の全体を見せる(枠に合わせて切り取らない)。余白は、薄い灰色
  box: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  img: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
  // マウスを重ねたときに出す、大きい画像
  big: { display: 'block', maxWidth: 'min(360px, 60vw)', maxHeight: 'min(480px, 70vh)', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium },
})

/**
 * 商品・メイン画像のサムネイル。画像の全体を見せ(縦長でも、横長でも、切れない)、マウスを重ねると、大きく表示する。
 * 大きさは width / height(px)で決める。aspectRatio を指定すると、幅いっぱい(width: 100%)で、その縦横比の枠にする。
 */
export function ImageThumb({ src, alt, width = 56, height = 72, aspectRatio }: { src?: string; alt: string; width?: number; height?: number; aspectRatio?: string }) {
  const s = useStyles()
  const box = (
    <div className={s.box} style={aspectRatio ? { width: '100%', aspectRatio } : { width, height }}>
      {src && <img src={src} alt={alt} draggable={false} className={s.img} />}
    </div>
  )
  if (!src) return box
  return (
    <Tooltip
      relationship="description"
      positioning="after"
      showDelay={150}
      hideDelay={0}
      content={{ children: <img src={src} alt={alt} draggable={false} className={s.big} />, style: { maxWidth: 'none', padding: 4 } }}
    >
      {box}
    </Tooltip>
  )
}
