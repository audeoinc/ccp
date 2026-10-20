// 開発元の本番だけの画面(src/hosted/)を、あれば読み込む。利用先に渡す版には src/hosted/ を入れないので、
// 直接 import せず、import.meta.glob で「ファイルがあれば」読み込む(ないときは null になり、⚙ のメニューにも出さない)。
// サーバーの server/ccp/hosted/ と同じ考え方(外のコードは、hosted がなくても動く)
import { lazy, type ComponentType } from 'react'

type DialogScreen = ComponentType<{ open: boolean; onClose: () => void }>
const screens = import.meta.glob<{ default: DialogScreen }>('./hosted/*.tsx')
const screen = (name: string) => {
  const load = screens[`./hosted/${name}.tsx`]
  return load ? lazy(load) : null
}

/** 前提運用の照らし合わせ(docs/FLOWS.md の 7 章) */
export const ProcessCheckScreen = screen('ProcessCheck')
