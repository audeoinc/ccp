// ページから拾った画像のうち、アイコン・ロゴのような小さい画像を、並びから外す(2026-11-02 利用者)。
// メイン画像の「URL から選ぶ」(UrlImagePicker)と、商品の「画像を替える」(ProductImageSwap)で同じ判定にする。
// サーバーは画像の大きさを返さないので、読み込んだ実際の大きさで決める。外した画像も読み込みは続ける(display: none の img も読み込まれ、onLoad が来る)。
// 全部が小さいときに何も出ない、とならないよう、並びの下に「小さい画像 N 枚を隠しています(見る)」を出す
import { useState, type SyntheticEvent } from 'react'
import { Link, makeStyles, tokens } from '@fluentui/react-components'
import { useT } from '../i18n'

/** 短い辺がこれより小さい画像は、アイコン・ロゴとみなして隠す */
export const SMALL_PX = 200

const useStyles = makeStyles({
  hidden: { display: 'none' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
})

/** 画像の並びごとに 1 つ。並びを読み直したら reset を呼ぶ */
export function useSmallImages() {
  const s = useStyles()
  const t = useT()
  const [small, setSmall] = useState<Set<string>>(new Set())
  const [show, setShow] = useState(false)
  const reset = () => {
    setSmall(new Set())
    setShow(false)
  }
  /** img の onLoad に渡す */
  const onLoad = (src: string) => (ev: SyntheticEvent<HTMLImageElement>) => {
    const el = ev.currentTarget
    if (Math.min(el.naturalWidth, el.naturalHeight) < SMALL_PX) setSmall((m) => new Set(m).add(src))
  }
  /** 並びのタイルに足す class(隠すときだけ) */
  const hiddenClass = (src: string, keep = false) => (!show && !keep && small.has(src) ? s.hidden : undefined)
  const note =
    small.size > 0 ? (
      <span className={s.note}>
        {show
          ? t(`小さい画像 ${small.size} 枚も出しています`, `Showing ${small.size} small images`)
          : t(`小さい画像 ${small.size} 枚を隠しています`, `${small.size} small images hidden`)}
        (
        <Link as="button" inline onClick={() => setShow((v) => !v)}>
          {show ? t('隠す', 'Hide') : t('見る', 'Show')}
        </Link>
        )
      </span>
    ) : null
  return { isSmall: (src: string) => small.has(src), onLoad, hiddenClass, note, reset }
}
