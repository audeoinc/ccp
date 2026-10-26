import { Fragment, useRef, useState } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, PlayRegular, StopRegular } from '@fluentui/react-icons'
import type { Campaign } from '../models/campaigns'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import { CampaignsService } from '../data/campaigns'
import { DeliveryCardsService } from '../data/deliveryCards'
import { ProductsService } from '../data/products'
import { HeroImagesService } from '../data/heroImages'
import { ApprovalRequestsService } from '../data/approvalRequests'
import { ProductionRequestsService } from '../data/productionRequests'
import { planMigration, runMigration, type CardRow, type MigrationPlan } from '../campaignMigrate'
import { statusLabel } from '../status'
import { CopyButton } from './CopyButton'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  sum: { fontSize: tokens.fontSizeBase200, display: 'flex', gap: '16px', flexWrap: 'wrap' },
  scroll: {
    overflow: 'auto',
    maxHeight: 'calc(100vh - 300px)',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, width: '100%' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground3, textAlign: 'left', padding: '4px 8px', whiteSpace: 'nowrap' },
  td: { padding: '3px 8px', borderTop: `1px solid ${tokens.colorNeutralStroke3}`, verticalAlign: 'top' },
  group: { backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold },
  log: {
    margin: 0,
    padding: '8px',
    maxHeight: '240px',
    overflow: 'auto',
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
})

interface Loaded {
  cards: DeliveryCard[]
  campaigns: Campaign[]
  products: Product[]
  heroes: HeroImage[]
  rows: { approval_requests: CardRow[]; production_requests: CardRow[] }
}

async function loadAll(): Promise<Loaded> {
  const need = <T,>(r: { success: boolean; data: T; error?: { message: string } }, what: string): T => {
    if (!r.success) throw new Error(`${what}を読めませんでした: ${r.error?.message ?? ''}`)
    return r.data
  }
  const [cards, campaigns, products, heroes, approvals, productions] = await Promise.all([
    DeliveryCardsService.getAll(),
    CampaignsService.getAll(),
    ProductsService.getAll(),
    HeroImagesService.getAll(),
    ApprovalRequestsService.getAll(),
    ProductionRequestsService.getAll(),
  ])
  return {
    cards: need(cards, '配信カード') ?? [],
    campaigns: need(campaigns, 'キャンペーン') ?? [],
    products: need(products, '商品') ?? [],
    heroes: need(heroes, 'メイン画像') ?? [],
    rows: { approval_requests: need(approvals, '承認の依頼') ?? [], production_requests: need(productions, '制作の依頼') ?? [] },
  }
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '')
const channelName = (ch?: string) => (ch === 'app' ? 'アプリ' : 'メール')

/** 試しの一覧を、利用者に見せる文にする(貼って共有できるように) */
function planText(plan: MigrationPlan): string {
  const lines = [
    `まとめる組 ${plan.groups.length} 組・カード ${plan.groups.reduce((n, g) => n + g.cards.length, 0)} 枚`,
    `まとめないカード: もうキャンペーンに入っている ${plan.skipped.inCampaign} 枚・取りやめ ${plan.skipped.cancelled} 枚・配信日なし ${plan.skipped.noDate.length} 枚`,
    '',
  ]
  for (const g of plan.groups) {
    lines.push(`■ ${g.day} ${g.country} → ${g.campaign ? `既存のキャンペーン「${g.campaign.name}」に入れる` : '新しいキャンペーン(名前・テーマ・目的は AI の案)'}`)
    for (const c of g.cards) {
      const x = plan.cleared.get(c.id)
      lines.push(`  - ${c.name}(${channelName(c.channel)} ${time(c.scheduled_at)}・${statusLabel(c.status, true)}${c.handed_off_at ? '・制作に渡した' : ''})→ 作り直して未起案に。消す行: 承認の依頼 ${x?.approval_requests ?? 0}・制作の依頼 ${x?.production_requests ?? 0}`)
    }
  }
  return lines.join('\n')
}

/**
 * キャンペーンにまとめて作り直す(X79 の段 ⑤。src/campaignMigrate.ts)。
 * 「試し」は読むだけ(何も書かず、AI も呼ばない)。「実行」は、試しで出した一覧を、組ごとに AI で作り直して書く。
 * 本番の DB に「実行」するのは、利用者の OK と、本番のパックで控えを取ったあとだけ
 */
export function CampaignTab() {
  const s = useStyles()
  const [data, setData] = useState<Loaded | null>(null)
  const [plan, setPlan] = useState<MigrationPlan | null>(null)
  const [busy, setBusy] = useState<'load' | 'run' | null>(null)
  const [error, setError] = useState('')
  const [log, setLog] = useState<string[]>([])
  const stopRef = useRef(false)
  // 「実行」の確かめの窓。押し間違いで本番のデータが書き換わらないよう、件数を見せ、「実行する」と打ち込まないと押せない
  const [asking, setAsking] = useState(false)
  const [typed, setTyped] = useState('')

  const dryRun = async () => {
    setBusy('load')
    setError('')
    try {
      const d = await loadAll()
      setData(d)
      setPlan(planMigration(d.cards, d.campaigns, d.rows))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const run = async () => {
    if (!plan || !data) return
    setAsking(false)
    setTyped('')
    stopRef.current = false
    setBusy('run')
    setLog([])
    try {
      await runMigration(plan, { products: data.products, heroes: data.heroes, rows: data.rows, log: (line) => setLog((l) => [...l, line]), isStopped: () => stopRef.current })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      // 書いたあとの様子で、一覧を作り直す(残りがあれば、ここに出る)
      await dryRun()
    }
  }

  const total = plan?.groups.reduce((n, g) => n + g.cards.length, 0) ?? 0
  const clearedRows = plan ? [...plan.cleared.values()].reduce((n, x) => n + x.approval_requests + x.production_requests, 0) : 0
  return (
    <div className={s.root}>
      <span className={s.note}>
        いまの配信カードを、同じ国・同じ配信日ごとにキャンペーンにまとめ、キャンペーンのテーマで AI に中身を作り直してもらいます(X79 の段 ⑤)。
        「試し」は読むだけです(何も書かず、AI も呼びません)。「実行」は、本番のパックで控えを取り、利用者の OK をもらってから押します。途中で止めても、もう一度「実行」すれば残りから進みます。
      </span>
      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>「実行」の前に、CCP の画面の ⚙ →「データと画像を書き出す」で、引っ越し用のパックを控えとして取ってください(戻すときは、その控えから戻します)。</MessageBarBody>
      </MessageBar>
      <div className={s.bar}>
        <Button icon={busy === 'load' ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />} disabled={!!busy} onClick={() => void dryRun()}>
          試し(一覧を出す)
        </Button>
        <Button appearance="primary" icon={<PlayRegular />} disabled={!!busy || !plan || total === 0} onClick={() => setAsking(true)}>
          実行(書き込む)
        </Button>
        {busy === 'run' && (
          <Button icon={<StopRegular />} onClick={() => (stopRef.current = true)}>
            止める(いまのカードが終わったら)
          </Button>
        )}
        {plan && <CopyButton text={() => planText(plan)} label="一覧を文でコピー" />}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {plan && (
        <>
          <span className={s.sum}>
            <span>まとめる組 {plan.groups.length} 組・カード {total} 枚</span>
            <span>もうキャンペーンに入っている {plan.skipped.inCampaign} 枚</span>
            <span>取りやめ(入れない){plan.skipped.cancelled} 枚</span>
            <span>配信日なし(入れない){plan.skipped.noDate.length} 枚</span>
          </span>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>配信カード</th>
                  <th className={s.th}>チャネル・時刻</th>
                  <th className={s.th}>いまの状態</th>
                  <th className={s.th}>いまのテーマ</th>
                  <th className={s.th}>消す行(承認の依頼・制作の依頼)</th>
                </tr>
              </thead>
              <tbody>
                {plan.groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className={s.group}>
                      <td className={s.td} colSpan={5}>
                        {g.day} {g.country} → {g.campaign ? `既存のキャンペーン「${g.campaign.name}」に入れる` : '新しいキャンペーン(AI の案)'}
                      </td>
                    </tr>
                    {g.cards.map((c) => {
                      const x = plan.cleared.get(c.id)
                      return (
                        <tr key={c.id}>
                          <td className={s.td}>{c.name}</td>
                          <td className={s.td}>
                            {channelName(c.channel)} {time(c.scheduled_at)}
                          </td>
                          <td className={s.td}>
                            {statusLabel(c.status, true)} {c.handed_off_at && <Badge size="small" appearance="tint">制作に渡した</Badge>}
                          </td>
                          <td className={s.td}>{c.theme}</td>
                          <td className={s.td}>
                            {x?.approval_requests ?? 0}・{x?.production_requests ?? 0}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {log.length > 0 && <pre className={s.log}>{log.join('\n')}</pre>}
      <Dialog open={asking} onOpenChange={(_, d) => !d.open && (setAsking(false), setTyped(''))}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>キャンペーンにまとめて作り直す</DialogTitle>
            <DialogContent className={s.root}>
              <span>
                {plan?.groups.length ?? 0} 組・{total} 枚を、キャンペーンにまとめて AI で作り直します。カードは未起案に戻し、承認の依頼・制作の依頼の行を {clearedRows} 件消します。元に戻せません(控えのパックから戻すだけです)。
              </span>
              <span className={s.note}>引っ越し用のパックで控えを取りましたか? 進めるときは、下に「実行する」と打ち込んでください。</span>
              <Field label="確かめ">
                <Input value={typed} onChange={(_, d) => setTyped(d.value)} placeholder="実行する" />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => (setAsking(false), setTyped(''))}>やめる</Button>
              <Button appearance="primary" disabled={typed.trim() !== '実行する'} onClick={() => void run()}>
                実行する
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
