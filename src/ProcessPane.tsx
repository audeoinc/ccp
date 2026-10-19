import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { ChevronLeftRegular, EditRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { ApprovalRequestsService } from './data/approvalRequests'
import { ApprovalReviewersService } from './data/approvalReviewers'
import { ApprovalBar } from './ApprovalBar'
import { HandoffPanel } from './HandoffPanel'
import { TasksPanel } from './TasksPanel'
import { CommentsPanel } from './CommentsPanel'
import { LockMark } from './LockMark'
import { MarkdownLite } from './MarkdownLite'
import { isThreadRoot, stageOf } from './notesStage'
import { ProductionRequestsService } from './data/productionRequests'
import type { ProductionRequest } from './models/productionRequests'
import { productionColor, productionLabel, productionView } from './useProductionRequests'
import { statusRank } from './status'
import { statusColor, statusLabel } from './status'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 上: 状態と承認(いつも見える) / 下: タブ(スクロール)
  shell: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', backgroundColor: tokens.colorNeutralBackground1 },
  top: { display: 'grid', rowGap: '8px', padding: '12px 12px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // 承認の依頼を出せないとき(新規作成中・確定した週)の、状態だけの表示
  status: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  dot: { width: '12px', height: '12px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  tabs: { padding: '8px 8px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, flexWrap: 'wrap' },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'grid', rowGap: '16px', alignContent: 'start', gridTemplateColumns: 'minmax(0, 1fr)' },
  // 引き継ぎで渡す制作指示(読むだけ。直すのは中ペインの ⑥)
  notes: { display: 'grid', rowGap: '6px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  notesHead: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  notesBody: { padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  // 制作の依頼の札(状態と承認の下)
  production: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  productionText: { display: 'grid', flexGrow: 1, minWidth: 0 },
  // 閉じた帯(状態を縦書きで。押すと開く)
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '10px', paddingTop: '10px', minHeight: 0, height: '100%', border: 'none', backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover } },
  railStatus: { writingMode: 'vertical-rl', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, letterSpacing: '0.05em' },
  railNote: { writingMode: 'vertical-rl', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, letterSpacing: '0.05em' },
})

export type TalkTab = 'handoff' | 'threads' | 'tasks'

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
  /** 制作指示(引き継ぎで渡すもの。ここでは読むだけ) */
  instructions: string
  /** 制作指示を直す(中ペインの ⑥ を開く) */
  onEditInstructions: () => void
  /** 工程の残り(引き継ぎのときに知らせる) */
  remaining: string[]
  people: string[]
  cardName: string
  productIds: string[]
  products: Product[]
  /** 制作のページを開く(「制作の依頼」の札。承認済みの配信だけ。PR4) */
  onOpenProduction?: (cardId: string) => void
  /** 外(左の配信情報の「制作への引き継ぎ」)から、タブを開く頼み。seq が変わるたびに開く */
  tabRequest?: { tab: TalkTab; seq: number }
}

/** やり取りのスレッドの元(以前の質問とレビューのコメント)か。CommentsPanel と同じ */
// 計画の配信カードでは、企画の段階のやり取りだけを数える(制作の段階の話は、制作のページ。PR6)
const isRoot = (n: CardNote) => isThreadRoot(n) && stageOf(n) === 'plan'

/**
 * 配信カードの右端の「プロセス」のペイン(2026-10-17。利用者と決めた)。コンテンツを「作る」(左・中・プレビュー・商品情報)と、配信を「進める」を分ける。
 * 上に状態と承認(いつも見える)、下にタブ: 引き継ぎ(担当・締め切り・制作指示)/ やり取り(以前の質問とコメントを 1 つに)/ タスク
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

  // タブに出す、未解決のやり取り・未完了のタスクの数(開いたときに数え、欄で変わったら数え直す)
  const [openThreads, setOpenThreads] = useState(0)
  const [openTasks, setOpenTasks] = useState(0)
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
        setOpenThreads(notes.filter((n) => !n.resolved && isRoot(n)).length)
        setOpenTasks(notes.filter((n) => !n.resolved && n.kind === 'task').length)
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
          <>
            <ApprovalBar card={props.card} isDirty={props.isDirty} busy={props.busy} onChanged={props.onChanged} />
            {/* 週が確定しているときの説明(上の帯は、内容を変えたときだけ出すので、ふだんの説明はここに出す) */}
            {props.locked && <span className={s.note}>{t('週が確定しています。変えるときは、理由を入れて保存します(承認はやり直しになります)', 'The week is confirmed. To change it, save with a reason (approval starts over).')}</span>}
          </>
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
      {props.card && props.onOpenProduction && statusRank(props.card.status) >= statusRank('approved') && <ProductionChip card={props.card} onOpen={props.onOpenProduction} />}
      <TabList size="small" className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TalkTab)}>
        <Tab value="handoff">{`${props.handoff.handedOffAt ? '✓ ' : ''}${t('引き継ぎ', 'Handoff')}`}</Tab>
        <Tab value="threads">{`${t('やり取り', 'Conversation')}${count(openThreads)}`}</Tab>
        <Tab value="tasks">{`${t('タスク', 'Tasks')}${count(openTasks)}`}</Tab>
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
            {/* 引き継ぎで渡す中身。渡す前に、担当・締め切りと一緒に確かめられるように(直すのは、AI と一緒に作る中ペインの ⑥) */}
            <div className={s.notes}>
              <div className={s.notesHead}>
                {t('渡す制作指示', 'Production notes to hand off')}
                <Button size="small" appearance="subtle" icon={<EditRegular />} onClick={props.onEditInstructions}>
                  {t('⑥ で直す', 'Edit in step 6')}
                </Button>
              </div>
              {props.instructions.trim() ? (
                <div className={s.notesBody}>
                  <MarkdownLite text={props.instructions} />
                </div>
              ) : (
                <span className={s.note}>{t('まだ制作指示がありません(中ペインの ⑥ で作ります)', 'No production notes yet (create them in step 6 in the middle pane)')}</span>
              )}
            </div>
          </>
        )}
        {tab === 'threads' && (
          <CommentsPanel
            cardId={cardId}
            stage="plan"
            productIds={props.productIds}
            products={props.products}
            people={props.people}
            cardName={props.cardName}
            productionOwner={props.handoff.productionOwner}
            productionDue={props.handoff.productionDue}
            onOpenCount={setOpenThreads}
            onTasksChanged={notesChanged}
          />
        )}
        {tab === 'tasks' && (
          <TasksPanel cardId={cardId} productionOwner={props.handoff.productionOwner} productionDue={props.handoff.productionDue} onOpenSource={() => setTab('threads')} onChanged={notesChanged} />
        )}
      </div>
    </div>
  )
}

/**
 * プロセスのペインを閉じたときの帯(利用者の要望 2026-10-17)。閉じていても、承認の状態と、返事が要るものがあるかが分かるよう、
 * 上から 色の点・状態(縦書き)・承認の残り(例: Brand 未定)・未解決のやり取りの数 を出す。帯のどこを押しても開く
 */
export function ProcessRail({ card, status, onOpen }: { card?: DeliveryCard; status: string; onOpen: () => void }) {
  const s = useStyles()
  const t = useT()
  const [pending, setPending] = useState<string[]>([])
  const [openThreads, setOpenThreads] = useState(0)
  const cardId = card?.id
  const cardStatus = card?.status
  useEffect(() => {
    if (!cardId) return
    let alive = true
    void (async () => {
      const [req, notes] = await Promise.all([ApprovalRequestsService.getAll({ filter: `delivery_card_id eq '${cardId}'` }), CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}` })])
      const open = req.success ? (req.data ?? []).find((r) => r.status === 'open') : undefined
      const rows = open ? await ApprovalReviewersService.getAll({ filter: `approval_request_id eq '${open.id}'` }) : null
      if (!alive) return
      setPending(rows?.success ? (rows.data ?? []).filter((r) => (r.decision ?? 'pending') === 'pending').map((r) => r.reviewer_name ?? '') : [])
      setOpenThreads(notes.success ? (notes.data ?? []).filter((n) => !n.resolved && isRoot(n)).length : 0)
    })()
    return () => {
      alive = false
    }
  }, [cardId, cardStatus])

  const v = card?.status ?? status
  return (
    <button type="button" className={s.rail} onClick={onOpen} title={t('状態・承認・やり取りを開く', 'Open status, approval and conversation')} aria-label={t('プロセスを開く', 'Open process')}>
      <ChevronLeftRegular />
      <span className={s.dot} style={{ backgroundColor: statusColor(v) }} />
      <span className={s.railStatus} style={{ color: statusColor(v) }}>{statusLabel(v)}</span>
      <LockMark status={card?.status} />
      {pending.length > 0 && <span className={s.railNote}>{t(`${pending.join('・')} 未定`, `${pending.join(', ')} pending`)}</span>}
      {openThreads > 0 && (
        <Badge size="small" appearance="filled" color="warning" title={t(`未解決のやり取り ${openThreads} 件`, `${openThreads} open conversation(s)`)}>
          {openThreads}
        </Badge>
      )}
    </button>
  )
}

/**
 * 「制作の依頼」の札(バックログ PR4)。承認済みの配信で、制作の状態(いま、だれの番か)を出し、押すと制作のページを開く。
 * 承認のあとの「どう見せるか」のやり取りは、制作のページで行う(docs/PRODUCTION.md)
 */
function ProductionChip({ card, onOpen }: { card: DeliveryCard; onOpen: (cardId: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [req, setReq] = useState<ProductionRequest | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'` }).then((r) => {
      if (!alive || !r.success) return
      setReq([...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))[0])
    })
    return () => {
      alive = false
    }
  }, [card.id, card.status])
  const v = productionView(card, req)
  return (
    <div className={s.production}>
      <span className={s.dot} style={{ backgroundColor: productionColor(v) }} />
      <span className={s.productionText}>
        <span className={s.head}>{t('制作の依頼', 'Production')}</span>
        <span className={s.note}>{productionLabel(v)}</span>
      </span>
      <Button size="small" onClick={() => onOpen(card.id)}>
        {t('制作のページ', 'Production page')}
      </Button>
    </div>
  )
}
