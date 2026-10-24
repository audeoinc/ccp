// 画面全体で共有する値の、小さな入れ物(整理 第2段 ⑦)。
// 「値・知らせる相手の一覧・useSyncExternalStore」の同じ形を、ファイルごとに手で書いていたので、1 つにした。
// React の外からも読み書きでき、変えたら、使っている部品が描き直される
import { useSyncExternalStore } from 'react'

export interface Store<T> {
  /** いまの値 */
  get: () => T
  /** 値を変えて、知らせる(同じ値でも知らせる。読み直した印などに使うため) */
  set: (value: T) => void
  /** 変わったら呼ぶ。戻り値で外す */
  subscribe: (listener: () => void) => () => void
  /** 部品の中で使う(値が変わったら描き直す) */
  use: () => T
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  const get = () => value
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  return {
    get,
    set: (next) => {
      value = next
      listeners.forEach((f) => f())
    },
    subscribe,
    use: () => useSyncExternalStore(subscribe, get),
  }
}

/** 値を持たず、「変わった」だけを知らせる入れ物(版の番号が 1 つずつ増える。読み直しの合図に使う) */
export function createSignal() {
  const store = createStore(0)
  return {
    /** いまの版(useSyncExternalStore に渡すと、知らせのたびに描き直す) */
    version: store.get,
    notify: () => store.set(store.get() + 1),
    subscribe: store.subscribe,
    use: store.use,
  }
}
