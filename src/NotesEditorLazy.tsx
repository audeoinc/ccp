// 制作指示の欄(NotesEditor)を、使うときに読み込む。中の TipTap(文章の編集)が大きく(約 0.5MB)、
// 渡すもののパネルを開くまで要らないため、最初の読み込みから外す(optimize-survey の 3-1。2026-11-02)。
// 読み込む間は、同じ枠の大きさの箱にくるくるを出す(欄が出たときに、下の行がずれないように)
import { Suspense, lazy, type ComponentProps } from 'react'
import { Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { loadChunk } from './chunkReload'

const Editor = lazy(() => loadChunk(() => import('./NotesEditor')).then((m) => ({ default: m.NotesEditor })))

const useStyles = makeStyles({
  // NotesEditor の枠(上の道具の段 + 入力)とおおよそ同じ高さにする
  box: {
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
})

export function NotesEditor(props: ComponentProps<typeof Editor>) {
  const s = useStyles()
  const fallback = (
    <div className={s.box} style={{ minHeight: `calc(${props.minHeight ?? '320px'} + 52px)` }}>
      <Spinner size="tiny" />
    </div>
  )
  return (
    <Suspense fallback={fallback}>
      <Editor {...props} />
    </Suspense>
  )
}
