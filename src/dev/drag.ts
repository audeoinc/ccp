// 開発用の画面の、ペインの境目で変えた高さを覚える。境目のドラッグそのものは、画面と同じ Splitter(src/Splitter.tsx)
import { useEffect, useState } from 'react'

/** この画面を開いている人のブラウザに覚える高さ(ペインの境目で変えたもの) */
export function useStoredHeight(key: string, initial: number): [number, (h: number) => void] {
  const [h, setH] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(key))
      return v > 0 ? v : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(Math.round(h)))
    } catch {
      // 覚えられない環境では、毎回はじめの高さ
    }
  }, [key, h])
  return [h, setH]
}
