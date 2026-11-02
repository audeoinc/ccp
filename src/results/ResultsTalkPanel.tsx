// シンプルな結果の窓(X89)の左のバーの「やり取り」。制作の画面と同じ形: 書き込み(結果の段のスレッド)の下に、タスクを入れる。
// 書き込みは段 results に分ける(計画・制作のやり取りと混ぜない。結果を見ての相談・次の配信への申し送り)。タスクは配信カードのものを全部出す(制作と同じ)。
// 公開・非公開は collab.thread・collab.tasks(制作と同じ判定)
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CommentsPanel } from '../CommentsPanel'
import { TasksPanel } from '../TasksPanel'
import { useFeature } from '../featureFlags'
import type { Product } from '../models/products'

const useStyles = makeStyles({
  root: { display: 'grid', minWidth: 0 },
  // やり取りの下のタスクの区切り(制作の画面と同じ)
  taskSec: { marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

interface Props {
  cardId: string
  /** 配信名(AI にタスクの案を頼むときに渡す) */
  cardName: string
  /** 載せた商品(メールの並び順の商品 ID)。書き込みの対象に選べる */
  productIds: string[]
  /** 商品名の表示用 */
  products: Product[]
  /** 宛先の候補 */
  people: string[]
  /** タスクの担当・期日の既定値(結果では、ふつう企画の担当と空の期日) */
  owner: string
  due?: string
  /** 左のバーの数(未解決の書き込み・未完了のタスク)を合わせるため */
  onOpenCount?: (n: number) => void
  onTasksChanged?: () => void
}

export function ResultsTalkPanel({ cardId, cardName, productIds, products, people, owner, due = '', onOpenCount, onTasksChanged }: Props) {
  const s = useStyles()
  const threadOn = useFeature('collab.thread')
  const tasksOn = useFeature('collab.tasks')
  if (!threadOn && !tasksOn) return null
  return (
    <div className={s.root}>
      {threadOn && (
        <CommentsPanel
          cardId={cardId}
          stage="results"
          productIds={productIds}
          products={products}
          people={people}
          cardName={cardName}
          productionOwner={owner}
          productionDue={due}
          onOpenCount={onOpenCount}
          onTasksChanged={onTasksChanged}
        />
      )}
      {/* タスク(担当・期日)は、やり取りの下に。書き込みから AI で出したタスクも、ここに入る */}
      {tasksOn && (
        <div className={mergeClasses(threadOn && s.taskSec)}>
          <TasksPanel cardId={cardId} productionOwner={owner} productionDue={due} onOpenSource={() => undefined} onChanged={() => onTasksChanged?.()} />
        </div>
      )}
    </div>
  )
}
