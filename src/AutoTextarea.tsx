import { useLayoutEffect, useRef, useState } from 'react'
import { Textarea, type TextareaProps } from '@fluentui/react-components'
import { loadPref, savePref } from './settings'
import { textareaHeightKey } from './prefKeys'

type Props = TextareaProps & {
  /**
   * 高さを覚える鍵(欄の種類ごと。localStorage の `textarea.<heightKey>.height`)。
   * 渡さない欄も、下の端をつかんで高さを変えられる(開いている間だけ)
   */
  heightKey?: string
}

/**
 * 内容の行数に合わせて高さが伸びる複数行入力(rows は最小の行数)。入力が見切れない。
 * 下の端をつかんで高さを変えられる(2026-10-23 利用者と決めた)。広げた高さは「最低の高さ」として覚え、それより文字が増えれば、さらに伸びる
 */
export function AutoTextarea({ value, rows = 1, textarea, heightKey, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const prefKey = heightKey ? textareaHeightKey(heightKey) : null
  // 人が決めた最低の高さ(px)。描画には使わないので ref で持つ(最初の値だけ、覚えた値から)
  const [savedMin] = useState(() => (prefKey ? loadPref<number>(prefKey, 0) : 0))
  const minHeight = useRef(savedMin)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // つかんで高さを変えている間は、内容に合わせ直さない(合わせ直すと、つかんだ高さが戻ってしまう)
    let dragging = false
    let startHeight = 0
    const fit = () => {
      if (dragging) return
      el.style.height = 'auto'
      el.style.height = `${Math.max(el.scrollHeight, minHeight.current)}px`
    }
    fit()
    // 幅が変わると折り返しが変わるので、ペインの幅の変更にも追従する
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    const down = () => {
      dragging = true
      startHeight = el.offsetHeight
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      const h = el.offsetHeight
      // 高さが変わっていたら(下の端をつかんだ)、その高さを最低の高さとして覚える
      if (Math.abs(h - startHeight) > 2) {
        minHeight.current = h
        if (prefKey) savePref(prefKey, h)
      }
      fit()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [value, prefKey])

  return <Textarea {...rest} value={value} rows={rows} resize="vertical" textarea={{ ...(typeof textarea === 'object' ? textarea : {}), ref }} />
}
