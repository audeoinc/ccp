import { useEffect, useRef, useState } from 'react'
import { Button, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { OpenRegular, SendRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { CreativeAssets } from '../CreativeAssets'
import { HandoffPanel } from '../HandoffPanel'
import { MarkdownLite } from '../MarkdownLite'
import { ProductionRequestsService } from '../data/productionRequests'
import type { ProductionRequest } from '../models/productionRequests'
import { productionColor, productionLabel, productionView } from '../useProductionRequests'
import { useT } from '../i18n'
import { PartAiChat } from './PartAiChat'
import { askPartRewrite, type PartTurn } from './partAi'
import type { SimpleEditor } from './editor'

const useStyles = makeStyles({
  root: { display: 'grid', alignContent: 'start', rowGap: '18px', maxWidth: '760px' },
  section: { display: 'grid', rowGap: '8px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  num: { width: '20px', height: '20px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackground },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  status: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  read: { padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  foot: { display: 'flex', alignItems: 'center', columnGap: '10px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

interface Props {
  editor: SimpleEditor
  /** 渡す前に、直した中身を反映(保存)する */
  onCommit: () => Promise<void>
  /** 制作の依頼の最新の版を読んだとき(段階を決めるため) */
  onRequest?: (req: ProductionRequest | undefined) => void
  /** 参考の素材が外(右端の帯へのドラッグ)で増えたら変わる(素材の欄を読み直す) */
  assetsVersion?: number
}

/**
 * 制作に渡すもの(SU1 の見直し。2026-10-22 利用者と決めた: 企画で直し・承認をもらったら、文章とイメージ画像・URL を制作に渡す)。
 * 上から 渡す文章(制作指示。AI に頼める)・参考の素材(画像・資料・URL)・担当と締め切り、いちばん下に「制作に渡す」1 つ。
 * 承認の前でも渡せる(人がいない・先に進めたいときがあるため。src/productionGate.ts と同じ考え)。
 * 依頼そのもの(HTML を固める)は制作のページで行うので、ボタンは保存してから制作のページを開き、そこで依頼まで進める
 */
export function HandoffSheet({ editor: e, onCommit, onRequest, assetsVersion = 0 }: Props) {
  const t = useT()
  const s = useStyles()
  const [req, setReq] = useState<ProductionRequest | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [turns, setTurns] = useState<PartTurn[]>([])
  const [busy, setBusy] = useState(false)
  // 「制作に渡す」を押したあと、依頼ができたかを読み直す回数(制作のページで HTML を作ってから依頼するので、少し遅れる)
  const [poll, setPoll] = useState(0)
  // 渡す文章の案を仮に写している間の、元の文章
  const original = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${e.card.id}'` }).then((r) => {
      if (!alive) return
      const latest = r.success ? [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))[0] : undefined
      setReq(latest)
      setLoaded(true)
      onRequest?.(latest)
    })
    return () => {
      alive = false
    }
    // 段階を決める onRequest は、読んだときに 1 回知らせるだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.card.id, e.card.status, poll])

  const view = productionView(e.card, req)
  const requested = view !== 'draft' && view !== 'stale' && view !== 'not_approved'
  // 渡したあとは、渡したものを読むだけで見せる(直すと、制作に依頼し直しになるため。直すときは「直す」で)
  const readOnly = requested
  useEffect(() => {
    if (poll === 0 || requested || poll > 20) return
    const timer = window.setTimeout(() => setPoll((n) => n + 1), 3000)
    return () => window.clearTimeout(timer)
  }, [poll, requested])
  const pass = async () => {
    setBusy(true)
    try {
      await onCommit()
      e.openProduction?.({ request: !requested })
      setPoll(1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.root}>
      {/* いまの制作の状態(渡したあとは、ここが主役) */}
      <div className={s.status}>
        <span className={s.dot} style={{ backgroundColor: productionColor(view) }} />
        <span className={s.grow}>{loaded ? productionLabel(view) : <Spinner size="extra-tiny" />}</span>
        {e.openProduction && (
          <Button size="small" icon={<OpenRegular />} onClick={() => e.openProduction?.()}>
            {t('制作のページ', 'Production page')}
          </Button>
        )}
      </div>

      <div className={s.section}>
        <span className={s.head}>
          <span className={s.num}>1</span>
          {t('渡す文章(制作指示)', 'Text for production (notes)')}
        </span>
        {readOnly ? (
          <div className={s.read}>{e.form.instructions.trim() ? <MarkdownLite text={e.form.instructions} /> : <span className={s.caption}>{t('(なし)', '(none)')}</span>}</div>
        ) : (
          <>
            <AutoTextarea size="small" rows={4} value={e.form.instructions} placeholder={t('例: メイン画像は人物を大きく。見出しは画像の下に。セールの期間を目立たせる', 'e.g. Feature the model large in the main image; headline below it; make the sale period stand out')} onChange={(_, d) => e.setField('instructions', d.value)} />
            <PartAiChat
              kind="instructions"
              label={t('渡す文章', 'Production notes')}
              turns={turns}
              setTurns={setTurns}
              placeholder={t('例: 画像の指示を足して、箇条書きに', 'e.g. Add image directions, as bullet points')}
              ask={(request, history) =>
                askPartRewrite({
                  card: e.aiCard(),
                  angle: e.form.copyAngle,
                  part: { kind: 'instructions', label: t('制作指示', 'Production notes'), current: e.form.instructions },
                  context: { subject: e.form.subject || e.form.name, headline: e.form.headline, copy: e.form.copy, theme: e.form.theme },
                  request,
                  history,
                })
              }
              renderIdea={(idea) => <MarkdownLite text={idea.value} />}
              isCurrent={(idea) => idea.value === e.form.instructions}
              onPreview={(idea) => {
                if (idea) {
                  if (original.current === null) original.current = e.form.instructions
                  e.setField('instructions', idea.value)
                } else if (original.current !== null) {
                  e.setField('instructions', original.current)
                  original.current = null
                }
              }}
              onAdopt={(idea) => {
                original.current = null
                e.setField('instructions', idea.value)
              }}
            />
          </>
        )}
      </div>

      <div className={s.section}>
        <span className={s.head}>
          <span className={s.num}>2</span>
          {t('参考の画像・資料・URL', 'Reference images, files and URLs')}
        </span>
        <CreativeAssets
          key={assetsVersion}
          cardId={e.card.id}
          stage="plan"
          title=" "
          hideCaption
          owner={e.card.owner}
          people={e.people}
          cardName={e.form.name}
          productionOwner={e.form.productionOwner}
          productionDue={e.form.productionDue}
          productIds={e.items.map((i) => i.productId)}
          products={e.products}
        />
      </div>

      <div className={s.section}>
        <span className={s.head}>
          <span className={s.num}>3</span>
          {t('制作の担当と締め切り', 'Production assignee and due date')}
        </span>
        <HandoffPanel
          productionOwner={e.form.productionOwner}
          onProductionOwner={(v) => e.setHandoff('productionOwner', v)}
          handedOffAt={e.form.handedOffAt}
          onHandedOffAt={(v) => e.setHandoff('handedOffAt', v)}
          productionDue={e.form.productionDue}
          onProductionDue={(v) => e.setHandoff('productionDue', v)}
          remaining={e.remaining}
          people={e.people}
        />
      </div>

      {(
        <div className={s.foot}>
          <span className={s.caption}>{readOnly ? t('渡したものを読むだけで出しています。直すときは「直す」で直し、制作のページで依頼し直します', 'Shown read-only after handoff. To change it, edit in “Edit” and request again on the production page') : statusNote(e.card.status, t)}</span>
          <Button appearance="primary" icon={<SendRegular />} disabled={busy || e.saving || !e.openProduction} onClick={() => void pass()}>
            {requested ? t('制作のページで続きを見る', 'Continue on the production page') : t('制作に渡す', 'Hand off to production')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** 渡すボタンの横の説明(承認の前でも渡せることを、短く) */
function statusNote(status: string | undefined, t: (ja: string, en: string) => string) {
  return status === 'approved' || status === 'confirmed'
    ? t('保存してから、制作のページで依頼まで進めます', 'Saves, then requests on the production page')
    : t('承認の前でも渡せます(承認はあとからもらえます)。保存してから、制作のページで依頼まで進めます', 'You can hand off before approval (get it later). Saves, then requests on the production page')
}
