import { useEffect, useRef, useState } from 'react'
import { filled } from '../slots'
import { Button, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { AttachRegular, ChevronDownRegular, ChevronUpRegular, OpenRegular, SendRegular } from '@fluentui/react-icons'
import { NotesEditor } from '../NotesEditor'
import { CreativeAssets } from '../CreativeAssets'
import { loadPref, savePref } from '../settings'
import { PREF } from '../prefKeys'
import { CardAssetsService } from '../data/cardAssets'
import { DeliveryCardsService } from '../data/deliveryCards'
import type { CardAsset } from '../models/cardAssets'
import { ProductionRequestsService } from '../data/productionRequests'
import type { ProductionRequest } from '../models/productionRequests'
import { productionColor, productionLabel, productionView } from '../useProductionRequests'
import { typo } from '../typo'
import { useT } from '../i18n'
import { NotesAiDraft } from './NotesAiDraft'
import { askPartRewrite } from './partAi'
import type { SimpleEditor } from './editor'
import { ReadinessList } from './ReadinessList'
import { readinessBlocked, type ReadinessItem, type ReadinessTarget } from './readiness'

// 「AI で書く」で頼みを書かなかったときの頼み(画面には出さない)
const DRAFT_REQUEST = '制作に渡す文章(制作指示)を、テーマ・件名・見出し・コピー・参考の素材をもとに書いてください。いまの文章があれば、それを生かして整えてください。案ごとに、書き方(まとめ方・詳しさ)を変えてください'

// 参考の素材の欄の開閉(人の設定)
const ASSETS_KEY = PREF.simpleHandoffAssetsOpen

const useStyles = makeStyles({
  root: { display: 'grid', alignContent: 'start', rowGap: '12px', maxWidth: '760px' },
  section: { display: 'grid', rowGap: '8px' },
  head: { ...typo.heading, display: 'flex', alignItems: 'center', columnGap: '8px' },
  num: { width: '20px', height: '20px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackground },
  caption: typo.caption,
  status: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  pair: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '10px' },
  fold: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: 0, border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', ...typo.heading, color: tokens.colorNeutralForeground1, cursor: 'pointer', textAlign: 'left' },
  count: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  // ボタンは説明の文と横に並べず、幅いっぱいの 1 行に(狭いパネルで文字が折り返し、背の高いボタンになって浮いて見えたため。X74)
  foot: { display: 'grid', rowGap: '8px', paddingTop: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  tools: { display: 'flex', justifyContent: 'flex-end' },
})

interface Props {
  editor: SimpleEditor
  /** 渡す前に、直した中身を反映(保存)する */
  onCommit: () => Promise<void>
  /** 制作の依頼の最新の版を読んだとき(段階を決めるため) */
  onRequest?: (req: ProductionRequest | undefined) => void
  /** 参考の素材が外(左のバーへのドラッグ)で増えたら変わる(素材の欄を読み直す) */
  assetsVersion?: number
  /** 参考の素材の数(畳んでいても見出しに出す。左のバーと同じ数) */
  assetCount?: number
  /** 素材の欄で数が変わったとき(左のバーの数を合わせる) */
  onAssetCount?: (n: number) => void
  /** 送る前の確かめ(制作に渡す前の一覧。担当・締め切りが空なら渡せない) */
  checks?: ReadinessItem[]
  /** 確かめの行を押したとき(部品を選ぶ。担当・締め切りの欄は、ここで受け持つ) */
  onPickCheck?: (target: ReadinessTarget) => void
  /** 外(承認の確かめの行など)から、担当・締め切りの欄へ入る(seq が変わるたびに、その欄へ) */
  focusField?: { field: 'productionOwner' | 'productionDue'; seq: number } | null
}

/**
 * 制作に渡すもの(SU1 の見直し。2026-10-22 利用者と決めた: 企画で直し・承認をもらったら、文章とイメージ画像・URL を制作に渡す)。
 * 上から 担当と締め切り・渡す文章(制作指示。AI に頼める)・参考の素材(画像・資料・URL。畳める)、いちばん下に「制作に渡す」1 つ(引き継いだ日時もここで残す)。
 * 承認の前でも渡せる(人がいない・先に進めたいときがあるため。src/productionGate.ts と同じ考え)。
 * 依頼そのもの(HTML を固める)は制作のページで行うので、ボタンは保存してから制作のページを開き、そこで依頼まで進める
 */
export function HandoffSheet({ editor: e, onCommit, onRequest, assetsVersion = 0, assetCount = 0, onAssetCount, checks, onPickCheck, focusField }: Props) {
  const t = useT()
  const s = useStyles()
  const [req, setReq] = useState<ProductionRequest | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  // 「制作に渡す」を押したあと、依頼ができたかを読み直す回数(制作のページで HTML を作ってから依頼するので、少し遅れる)
  const [poll, setPoll] = useState(0)
  // 参考の素材の欄の開閉(人ごとに覚える。既定は畳む: 左のバーの「素材」でいつでも開けるので、ここは数が見えればよい)
  const [assetsOpen, setAssetsOpen] = useState(() => loadPref<boolean>(ASSETS_KEY, false))
  const toggleAssets = () => {
    setAssetsOpen(!assetsOpen)
    savePref(ASSETS_KEY, !assetsOpen)
  }
  // 確かめの行から、担当・締め切りの欄へ動く
  const ownerRef = useRef<HTMLInputElement>(null)
  const dueRef = useRef<HTMLInputElement>(null)
  const pickCheck = (target: ReadinessTarget) => {
    if (target.kind === 'handoffField') (target.field === 'productionOwner' ? ownerRef : dueRef).current?.focus()
    else onPickCheck?.(target)
  }
  // 承認の確かめの行などから来たとき: パネルが開いてから、その欄へ(開く動きの間は、まだ見えていないことがあるので少し待つ)
  const focusSeq = focusField?.seq
  useEffect(() => {
    if (!focusField) return
    const ref = focusField.field === 'productionOwner' ? ownerRef : dueRef
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center' })
      ref.current?.focus()
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq])
  // 渡す文章の AI の案を、マウスを乗せている間だけ欄に見せる(本物の値は変えない。自動保存で案が保存されないように。UX 10)
  const [previewing, setPreviewing] = useState<string | null>(null)
  // 参考の素材(制作指示に名前を挙げる・AI に渡すため。畳んでいても読む)
  const [assets, setAssets] = useState<CardAsset[]>([])
  useEffect(() => {
    let alive = true
    void CardAssetsService.getAll({ filter: `delivery_card_id eq ${e.card.id}`, orderBy: ['created_on desc'] }).then((r) => {
      if (alive && r.success) setAssets(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [e.card.id, assetsVersion, assetCount])
  // 「素材を挿入」は、制作指示の欄の、最後にカーソルがあった所へ差し込む(欄が渡す関数。メニューを押すと欄から焦点が外れるため)
  const insertRef = useRef<((text: string) => void) | null>(null)
  const insertAsset = (a: CardAsset) => {
    const piece = t(`素材「${a.name}」`, `asset "${a.name}"`)
    if (insertRef.current) insertRef.current(piece)
    else e.setField('instructions', e.form.instructions + piece)
  }

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
  // 担当と締め切りは、渡したあとは読むだけ(制作の依頼の側で決まるため)
  const readOnly = requested
  // 止めるのは、まだ渡していないときの、担当・締め切りが空のときだけ(ほかは警告にとどめる)
  const blocked = !requested && !!checks && readinessBlocked(checks)
  // 制作指示は、渡したあとも直せる(2026-10-24 利用者と決めた。承認とロックは SU1 で考え直す)。直したことだけ知らせて、止めない
  const editedAfter = requested && req?.instructions != null && req.instructions.trim() !== e.form.instructions.trim()
  useEffect(() => {
    if (poll === 0 || requested || poll > 20) return
    const timer = window.setTimeout(() => setPoll((n) => n + 1), 3000)
    return () => window.clearTimeout(timer)
  }, [poll, requested])
  const pass = async () => {
    setBusy(true)
    try {
      await onCommit()
      // 引き継いだ日時も残す(一覧の「引き継ぎ」に出る)。保存は、いま押した時点の form で走るので、別に書く
      if (!e.form.handedOffAt) {
        const at = new Date().toISOString()
        const r = await DeliveryCardsService.update(e.card.id, { handed_off_at: at })
        if (r.success) e.setHandoff('handedOffAt', at)
      }
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

      {/* 送る前の確かめ(渡す前だけ。渡したあとは、制作の状態が主役) */}
      {!requested && checks && <ReadinessList items={checks} onPick={pickCheck} />}

      {/* 1. 制作の担当と締め切り(いちばん上に。下にあると気づかなかったため) */}
      <div className={s.section}>
        <span className={s.head}>
          <span className={s.num}>1</span>
          {t('制作の担当と締め切り', 'Production assignee and due date')}
        </span>
        <div className={s.pair}>
          <Field label={t('制作の担当', 'Production assignee')} size="small">
            <Input ref={ownerRef} size="small" list="ccp-handoff-people" value={e.form.productionOwner} disabled={readOnly} onChange={(_, d) => e.setHandoff('productionOwner', d.value)} />
            <datalist id="ccp-handoff-people">
              {e.people.map((o) => <option key={o} value={o} />)}
            </datalist>
          </Field>
          <Field label={t('締め切り', 'Due')} size="small">
            <Input ref={dueRef} size="small" type="date" value={e.form.productionDue} disabled={readOnly} onChange={(_, d) => e.setHandoff('productionDue', d.value)} />
          </Field>
        </div>
      </div>

      <div className={s.section}>
        <span className={s.head}>
          <span className={s.num}>2</span>
          {t('渡す文章(制作指示)', 'Text for production (notes)')}
        </span>
        {editedAfter && (
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>{t('渡したあとに直しました。制作に知らせるには、制作のページで渡し直してください。', 'Edited after handoff. To let production know, hand off again on the production page.')}</MessageBarBody>
          </MessageBar>
        )}
        {/* 箇条書き・見出しつきで書ける欄(詳しい配信カードの制作指示と同じ。保存は Markdown の文字のまま。2026-10-28 利用者) */}
        <NotesEditor
          minHeight="96px"
          value={previewing ?? e.form.instructions}
          readOnly={previewing !== null}
          insertRef={insertRef}
          placeholder={t('例: メイン画像は人物を大きく。見出しは画像の下に。「- 」で箇条書き、「### 」で見出し', 'e.g. Feature the model large in the main image; headline below it. Type "- " for bullets, "### " for a heading')}
          onChange={(v) => e.setField('instructions', v)}
        />
        {assets.length > 0 && (
          <div className={s.tools}>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button size="small" appearance="subtle" icon={<AttachRegular />}>
                  {t('素材を挿入', 'Insert asset')}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {assets.map((a) => (
                    <MenuItem key={a.id} onClick={() => insertAsset(a)}>
                      {a.name}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        )}
        {/* 渡す文章の AI: 「AI で書く」→ 案を押すとそのまま入る(2 つの操作。試す → 確定にしない理由は NotesAiDraft。2026-10-29 利用者) */}
        <NotesAiDraft
          value={e.form.instructions}
          ask={async (request) => {
            const res = await askPartRewrite({
              card: e.aiCard(),
              angle: e.form.copyAngle,
              part: { kind: 'instructions', label: t('制作指示', 'Production notes'), current: e.form.instructions },
              context: { subject: e.form.subject || e.form.name, headline: e.form.headline, copy: e.form.copy, theme: e.form.theme },
              assets: assets.map((a) => ({ name: a.name, kind: a.kind, note: a.note || a.preview_description || undefined, url: a.kind === 'url' ? a.url : undefined })),
              request: request || DRAFT_REQUEST,
              history: [],
              count: 2,
            })
            return res.ideas
          }}
          onPreview={setPreviewing}
          onAdopt={(idea) => e.setField('instructions', idea.value)}
        />
      </div>

      {/* 3. 参考の画像・資料・URL(縦に長くなりやすいので畳める。足すのは「＋」から。右の帯の「素材」でも同じものを開ける) */}
      <div className={s.section}>
        <button type="button" className={s.fold} onClick={toggleAssets} aria-expanded={assetsOpen}>
          <span className={s.num}>3</span>
          {t('参考の画像・資料・URL', 'Reference images, files and URLs')}
          <span className={s.count}>{t(`${assetCount} 件`, `${assetCount}`)}</span>
          {assetsOpen ? <ChevronUpRegular /> : <ChevronDownRegular />}
        </button>
        {assetsOpen && (
          <CreativeAssets
            key={assetsVersion}
            cardId={e.card.id}
            stage="plan"
            title=" "
            hideCaption
            compactAdd
            owner={e.card.owner}
            people={e.people}
            cardName={e.form.name}
            productionOwner={e.form.productionOwner}
            productionDue={e.form.productionDue}
            productIds={filled(e.items).map((i) => i.productId)}
            products={e.products}
            onCount={onAssetCount}
          />
        )}
      </div>

      <div className={s.foot}>
        <span className={s.caption}>
          {blocked
            ? t('制作の担当と締め切りを入れると、渡せます', 'Enter the production assignee and due date to hand off')
            : requested
            ? t('渡したあとも、渡す文章は直せます。直したら、制作のページで渡し直します。', 'You can still edit the notes after handoff. If you do, hand off again on the production page.')
            : statusNote(e.card.status, t)}
        </span>
        <Button appearance="primary" size="small" icon={requested ? <OpenRegular /> : <SendRegular />} disabled={busy || e.saving || !e.openProduction || blocked} onClick={() => void pass()}>
          {requested ? t('制作のページへ', 'Open production page') : t('制作に渡す', 'Hand off to production')}
        </Button>
      </div>
    </div>
  )
}

/** 渡すボタンの横の説明(承認の前でも渡せることを、短く) */
function statusNote(status: string | undefined, t: (ja: string, en: string) => string) {
  return status === 'approved' || status === 'confirmed'
    ? t('保存してから、制作のページで渡すまで進めます', 'Saves, then hands off on the production page')
    : t('承認の前でも渡せます(承認はあとからもらえます)。保存してから、制作のページで渡すまで進めます', 'You can hand off before approval (get it later). Saves, then hands off on the production page')
}
