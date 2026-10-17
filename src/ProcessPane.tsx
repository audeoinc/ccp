import { useCallback, useEffect, useState } from 'react'
import { Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { CardNotesService } from './data/cardNotes'
import { ApprovalBar } from './ApprovalBar'
import { HandoffPanel } from './HandoffPanel'
import { QuestionsPanel } from './QuestionsPanel'
import { TasksPanel } from './TasksPanel'
import { CommentsPanel } from './CommentsPanel'
import { LockMark } from './LockMark'
import { statusColor, statusLabel } from './status'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 上: 状態と承認(いつも見える) / 下: やり取りのタブ(スクロール)
  shell: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', backgroundColor: tokens.colorNeutralBackground1 },
  top: { display: 'grid', rowGap: '8px', padding: '12px 12px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // 承認の依頼を出せないとき(新規作成中・確定した週)の、状態だけの表示
  status: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  dot: { width: '12px', height: '12px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  tabs: { padding: '8px 8px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, flexWrap: 'wrap' },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'grid', rowGap: '12px', alignContent: 'start', gridTemplateColumns: 'minmax(0, 1fr)' },
})

export type TalkTab = 'handoff' | 'tasks' | 'comments'

interface Props {
  /** 保存済みの配信カード(新規作成中は undefined) */
  card?: DeliveryCard
  /** 入力欄のステータス(新規作成中の表示に使う) */
  status: string
  /** 承認の依頼・承認を出せるか(保存済みで、確定した週ではない) */
  canReview: boolean
  /** 確定した週の配信か(承認の代わりに、確定後の変更の流れを案内する) */
  locked: boolean
  isDirty: () => boolean
  busy: boolean
  onChanged: () => Promise<void>
  /** 制作への引き継ぎ(担当・締め切り・引き継ぎ済みは、ここだけで決める。FLOWS の C-3) */
  handoff: { productionOwner: string; handedOffAt: string; productionDue: string }
  onHandoff: (key: 'productionOwner' | 'handedOffAt' | 'productionDue', value: string) => void
  /** 工程の残り(引き継ぎのときに知らせる) */
  remaining: string[]
  people: string[]
  owner: string
  cardName: string
  productIds: string[]
  products: Product[]
  /** 外(左の配信情報の「制作への引き継ぎ」)から、タブを開く頼み。seq が変わるたびに開く */
  tabRequest?: { tab: TalkTab; seq: number }
}

/**
 * 配信カードの右端の「プロセス」のペイン(2026-10-17。利用者の指摘: 承認が配信の基本情報(左)やプレビュー・商品情報(右)に混ざり、
 * やり取りは中ペインのタブに隠れていた)。コンテンツを「作る」(左・中・プレビュー・商品情報)と、配信を「進める」(状態・承認・引き継ぎ・質問・タスク・コメント)を分ける。
 * 上に状態と承認(いつも見える)、下にやり取りのタブ
 */
export function ProcessPane(props: Props) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<TalkTab>('handoff')
  const { tabRequest } = props
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabRequest && tabRequest.seq > 0) setTab(tabRequest.tab)
  }, [tabRequest])

  // タブに出す、未解決の質問・未完了のタスク・未対応のコメントの数(開いたときに数え、欄で変わったら数え直す)
  const [openQuestions, setOpenQuestions] = useState(0)
  const [openTasks, setOpenTasks] = useState(0)
  const [openComments, setOpenComments] = useState(0)
  const [noteVersion, setNoteVersion] = useState(0)
  const notesChanged = useCallback(() => setNoteVersion((v) => v + 1), [])
  const cardId = props.card?.id
  useEffect(() => {
    if (!cardId) return
    let alive = true
    CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}` })
      .then((res) => {
        if (!alive || !res.success) return
        const notes = res.data ?? []
        setOpenQuestions(notes.filter((n) => !n.resolved && (n.kind ?? 'question') === 'question').length)
        setOpenTasks(notes.filter((n) => !n.resolved && n.kind === 'task').length)
        setOpenComments(notes.filter((n) => !n.resolved && n.kind === 'comment').length)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [cardId, noteVersion])

  const count = (n: number) => (n ? ` (${n})` : '')

  return (
    <div className={s.shell}>
      <div className={s.top}>
        <span className={s.head}>{t('状態と承認', 'Status & approval')}</span>
        {props.canReview && props.card ? (
          <ApprovalBar card={props.card} isDirty={props.isDirty} busy={props.busy} onChanged={props.onChanged} />
        ) : (
          <>
            <span className={s.status}>
              <span className={s.dot} style={{ backgroundColor: statusColor(props.card?.status ?? props.status) }} />
              {statusLabel(props.card?.status ?? props.status)}
              <LockMark status={props.card?.status} />
            </span>
            <span className={s.note}>
              {!props.card
                ? t('配信カードを保存すると、承認を依頼できます', 'Save the delivery card to request approval')
                : props.locked
                  ? t('週が確定しています。変えるときは、理由を入れて保存します(承認はやり直しになります)', 'The week is confirmed. To change it, save with a reason (approval starts over).')
                  : null}
            </span>
          </>
        )}
      </div>
      <TabList size="small" className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TalkTab)}>
        <Tab value="handoff">{`${props.handoff.handedOffAt ? '✓ ' : ''}${t('引き継ぎ', 'Handoff')}${count(openQuestions)}`}</Tab>
        <Tab value="tasks">{`${t('タスク', 'Tasks')}${count(openTasks)}`}</Tab>
        <Tab value="comments">{`${t('コメント', 'Comments')}${count(openComments)}`}</Tab>
      </TabList>
      <div className={s.scroll}>
        {tab === 'handoff' && (
          <>
            <HandoffPanel
              productionOwner={props.handoff.productionOwner}
              onProductionOwner={(v) => props.onHandoff('productionOwner', v)}
              handedOffAt={props.handoff.handedOffAt}
              onHandedOffAt={(v) => props.onHandoff('handedOffAt', v)}
              productionDue={props.handoff.productionDue}
              onProductionDue={(v) => props.onHandoff('productionDue', v)}
              remaining={props.remaining}
              people={props.people}
            />
            <QuestionsPanel
              cardId={cardId}
              owner={props.owner}
              productionOwner={props.handoff.productionOwner}
              productionDue={props.handoff.productionDue}
              cardName={props.cardName}
              onOpenCount={setOpenQuestions}
              onTasksChanged={notesChanged}
            />
          </>
        )}
        {tab === 'tasks' && (
          <TasksPanel cardId={cardId} productionOwner={props.handoff.productionOwner} productionDue={props.handoff.productionDue} onOpenSource={() => setTab('handoff')} onChanged={notesChanged} />
        )}
        {tab === 'comments' && <CommentsPanel cardId={cardId} productIds={props.productIds} products={props.products} people={props.people} onOpenCount={setOpenComments} />}
      </div>
    </div>
  )
}
