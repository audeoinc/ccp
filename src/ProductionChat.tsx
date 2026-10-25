import { useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Input, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { ArrowSyncRegular, CheckmarkRegular, EditRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ChatPanel, type ChatMsg } from './ChatPanel'
import { AutoTextarea } from './AutoTextarea'
import { HeroUploadDialog } from './HeroUploadDialog'
import { HeroPicker, ProductPicker } from './ProductionInfoPane'
import { applyEdit, askRevision, revisionSuggestions, type ElementEdit } from './productionRevise'
import { getText, linkRows, productRows, type Snapshot } from './productionSnapshot'
import { heroImage, productImage } from './images'
import { cardMarket, heroMarket, productMarket } from './market'
import { myName } from './history'
import { tr, useT } from './i18n'

const useStyles = makeStyles({
  // AI の返事の下の「直す」のボタンの並び
  actions: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' },
  done: { color: tokens.colorNeutralForeground3 },
  warn: { display: 'block', marginTop: '4px', color: tokens.colorPaletteDarkOrangeForeground1 },
  surface: { width: 'min(560px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none' },
  content: { display: 'grid', rowGap: '10px' },
  label: { display: 'block', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  value: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  was: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  reason: { padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, fontSize: tokens.fontSizeBase200 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  pair: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '10px' },
  img: { width: '100%', maxHeight: '140px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  product: { display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center' },
  thumb: { width: '44px', height: '44px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  row: { display: 'flex', alignItems: 'center', columnGap: '4px' },
})

interface Msg {
  role: 'user' | 'assistant'
  text: string
  edits?: ElementEdit[]
  warnings?: string[]
}

interface Props {
  /** いまの中身(左のペインと同じ。直していれば直したもの) */
  current: Snapshot
  /** 企画で承認された写し(フロートに元の値を出す) */
  original: Snapshot
  /** 要素を直せるか(依頼したあとの、A 案だけ) */
  editable: boolean
  /** いまエディタにある HTML(AI に渡し、見た目の直しを当てる) */
  html: string
  /** HTML を手で直しているか(直していれば、要素の直しを HTML の同じ場所にも入れる。直していなければ、下書きが作り直される) */
  htmlCustom: boolean
  products: Product[]
  heroes: HeroImage[]
  /** 仕上がりの確認で書かれた「直してほしい」(よく使う頼み方の先頭に出す) */
  revisionNote?: string
  /** 見た目の直しの案(HTML)。プレビューで見比べて、採用するかを決める */
  onProposal: (html: string) => void
  /** 要素の直しを入れる(左のペインで直したのと同じ。保存は左のペインの「保存」) */
  onApplyEdit: (next: Snapshot) => void
}

/**
 * 制作のページの AI チャット。よく使う頼み方を選んで(いくつでも)頼める。
 * 見た目の直しは HTML の案としてプレビューで見比べ、文言・画像・商品・リンク先の直しは、返事のボタンから、左のペインのその行だけのフロートで確かめて入れる(2026-10-21、利用者と決めた)
 */
export function ProductionChat({ current, original, editable, html, htmlCustom, products, heroes, revisionNote, onProposal, onApplyEdit }: Props) {
  const s = useStyles()
  const t = useT()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  // 入れた直し(同じボタンを二度押さないよう、印を付ける)
  const [applied, setApplied] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState<{ edit: ElementEdit; key: string } | null>(null)
  const market = cardMarket(current.card.country ?? '')
  const poolProducts = useMemo(() => (market ? products.filter((p) => productMarket(p) === market) : products), [products, market])
  const poolHeroes = useMemo(() => (market ? heroes.filter((h) => heroMarket(h) === market) : heroes), [heroes, market])

  const send = async (text: string) => {
    if (busy) return
    const history = msgs.map((m) => ({ role: m.role, text: m.text }))
    setMsgs((m) => [...m, { role: 'user', text }])
    setBusy(true)
    let next: Msg
    try {
      const a = await askRevision({ request: text, history, html, snap: current, products: poolProducts, heroes: poolHeroes, revisionNote })
      const parts = [a.reply || (a.answered ? tr('(回答がありませんでした)', '(No answer)') : '')]
      if (a.html) {
        if (a.html.html !== html) {
          onProposal(a.html.html)
          parts.push(tr('見た目の案を、右のプレビューに並べました。よければ「採用」を押してください。', 'The layout proposal is shown side by side in the preview. Press "Adopt" if it looks good.'))
        }
        if (a.html.failed) parts.push(tr(`HTML の ${a.html.failed} か所は、場所が見つからず当てられませんでした。`, `${a.html.failed} change(s) could not be placed in the HTML.`))
      }
      if (a.edits.length) parts.push(editable ? tr('文言などの直しは、下のボタンから確かめて入れてください。', 'Check and apply the text and other changes with the buttons below.') : tr('文言などの直しは、渡したあとの A 案でだけ入れられます。', 'Text and other changes can only be applied to variant A after the handoff.'))
      if (!a.answered && !a.html && !a.edits.length && !a.reply) parts.push(tr('直す所が見つかりませんでした。もう少し具体的に頼んでみてください。', 'Nothing to change was found. Try asking more specifically.'))
      next = { role: 'assistant', text: parts.filter(Boolean).join('\n'), edits: a.edits, warnings: a.html?.warnings }
    } catch (e) {
      next = { role: 'assistant', text: e instanceof Error ? e.message : String(e) }
    } finally {
      setBusy(false)
    }
    setMsgs((m) => [...m, next])
  }

  const editLabel = (e: ElementEdit) =>
    e.kind === 'text' || e.kind === 'link' ? t(`${e.label}を直す`, `Edit ${e.label}`) : e.kind === 'hero' ? t('メイン画像を替える', 'Replace the main image') : t(`商品 ${e.index + 1} を替える`, `Replace product ${e.index + 1}`)

  const messages: ChatMsg[] = msgs.map((m, i) => ({
    role: m.role,
    text: m.text,
    extra:
      m.edits?.length || m.warnings?.length ? (
        <>
          {m.warnings?.map((w) => (
            <span key={w} className={s.warn}>
              {t(`注意: ${w}`, `Note: ${w}`)}
            </span>
          ))}
          {!!m.edits?.length && (
            <span className={s.actions}>
              {m.edits.map((e) => {
                const key = `${i}:${e.id}`
                const done = applied.has(key)
                return (
                  <Button key={key} size="small" appearance={done ? 'subtle' : 'secondary'} icon={done ? <CheckmarkRegular /> : <EditRegular />} disabled={!editable} className={mergeClasses(done && s.done)} onClick={() => setOpen({ edit: e, key })}>
                    {editLabel(e)}
                  </Button>
                )
              })}
            </span>
          )}
        </>
      ) : undefined,
  }))

  return (
    <>
      <ChatPanel
        title={t('制作物の手直し', 'Revise the creative')}
        messages={messages}
        busy={busy}
        suggestions={revisionSuggestions(revisionNote)}
        appendSuggestions
        intro={t(
          '直したいことを頼めます。下の例は、いくつ選んでもかまいません(選ぶと入力欄に足され、書き足してから送れます)。見た目は右のプレビューで見比べて採用し、文言・画像・商品・リンク先は、返事のボタンから確かめて入れます。',
          'Ask for changes. Pick as many examples below as you like (they are added to the input, and you can edit before sending). Layout changes are compared in the preview before you adopt them; text, image, product and link changes are applied from the buttons in the reply.',
        )}
        onSend={(text) => void send(text)}
        onClear={() => {
          setMsgs([])
          setApplied(new Set())
        }}
      />
      {open && (
        <EditFloat
          edit={open.edit}
          current={current}
          original={original}
          htmlCustom={htmlCustom}
          products={poolProducts}
          allProducts={products}
          heroes={poolHeroes}
          onClose={() => setOpen(null)}
          onApply={(next) => {
            onApplyEdit(next)
            setApplied((prev) => new Set(prev).add(open.key))
            setOpen(null)
          }}
        />
      )}
    </>
  )
}

/** 左のペインの 1 行だけのフロート。AI の案を入れた状態で開き、人が確かめて(直して)入れる */
function EditFloat({ edit, current, original, htmlCustom, products, allProducts, heroes, onClose, onApply }: {
  edit: ElementEdit
  current: Snapshot
  original: Snapshot
  htmlCustom: boolean
  products: Product[]
  allProducts: Product[]
  heroes: HeroImage[]
  onClose: () => void
  onApply: (next: Snapshot) => void
}) {
  const s = useStyles()
  const t = useT()
  const [text, setText] = useState(edit.kind === 'text' || edit.kind === 'link' ? edit.value : '')
  const [hero, setHero] = useState<HeroImage | null | undefined>(() => (edit.kind === 'hero' ? (heroes.find((h) => h.id === edit.heroId) ?? undefined) : undefined))
  const [productId, setProductId] = useState(edit.kind === 'product' ? edit.productId : undefined)
  const [uploading, setUploading] = useState(false)

  const title = edit.kind === 'text' || edit.kind === 'link' ? edit.label : edit.kind === 'hero' ? t('メイン画像', 'Main image') : t(`商品 ${edit.index + 1}`, `Product ${edit.index + 1}`)
  let body: ReactNode
  let nowValue = ''
  let wasValue = ''
  let ready = false
  if (edit.kind === 'text') {
    nowValue = getText(current, edit.field)
    wasValue = getText(original, edit.field)
    ready = text !== nowValue
    body = <AutoTextarea heightKey="ProductionChat.text" size="small" value={text} onChange={(_, d) => setText(d.value)} autoFocus />
  } else if (edit.kind === 'link') {
    nowValue = linkRows(current).find((r) => r.slotKey === edit.slotKey)?.base ?? ''
    wasValue = linkRows(original).find((r) => r.slotKey === edit.slotKey)?.base ?? ''
    ready = !!text.trim() && text !== nowValue
    body = <Input size="small" value={text} onChange={(_, d) => setText(d.value)} placeholder="https://" autoFocus />
  } else if (edit.kind === 'hero') {
    ready = hero !== undefined && (hero?.id ?? '') !== (current.hero?.id ?? '')
    body = (
      <div className={s.pair}>
        <span>
          <span className={s.label}>{t('いま', 'Now')}</span>
          {current.hero ? <img className={s.img} src={heroImage(current.hero) ?? ''} alt="" /> : <span className={s.note}>{t('(なし)', '(none)')}</span>}
        </span>
        <span>
          <span className={s.row}>
            <span className={s.label}>{t('替えたあと', 'After')}</span>
            <HeroPicker heroes={heroes} onPick={setHero} onUpload={() => setUploading(true)} />
          </span>
          {hero ? <img className={s.img} src={heroImage(hero) ?? ''} alt={hero.name} /> : <span className={s.note}>{t('右のボタンで選んでください', 'Pick one with the button')}</span>}
        </span>
      </div>
    )
  } else {
    const rows = productRows(current)
    const now = rows[edit.index]?.product
    const next = products.find((p) => p.id === productId) ?? allProducts.find((p) => p.id === productId)
    ready = !!productId && productId !== now?.id
    const line = (p?: Product) =>
      p ? (
        <span className={s.product}>
          <img className={s.thumb} src={productImage(p) ?? ''} alt="" />
          <span className={s.value}>{`${p.name} ・ ${p.product_code ?? ''}`}</span>
        </span>
      ) : (
        <span className={s.note}>{t('右のボタンで選んでください', 'Pick one with the button')}</span>
      )
    body = (
      <div className={s.content}>
        <span>
          <span className={s.label}>{t(`いま(${rows[edit.index]?.section ?? ''})`, `Now (${rows[edit.index]?.section ?? ''})`)}</span>
          {line(now)}
        </span>
        <span>
          <span className={s.row}>
            <span className={s.label}>{t('替えたあと', 'After')}</span>
            <ProductPicker trigger={<Button size="small" appearance="subtle" icon={<ArrowSyncRegular />} aria-label={t('ほかの商品を選ぶ', 'Pick another product')} />} products={products} onPick={setProductId} />
          </span>
          {line(next)}
        </span>
      </div>
    )
  }

  const apply = () => onApply(applyEdit(current, edit, { text, hero, productId }, allProducts))

  return (
    <>
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="productionChat" className={s.surface}>
        <DialogBody>
          <DialogTitle>
            {title} <Badge appearance="tint" color="brand">{t('AI の案', 'AI suggestion')}</Badge>
          </DialogTitle>
          <DialogContent className={s.content}>
            {edit.reason && <span className={s.reason}>{edit.reason}</span>}
            {(edit.kind === 'text' || edit.kind === 'link') && (
              <>
                <span>
                  <span className={s.label}>{t('いま', 'Now')}</span>
                  <span className={s.value}>{nowValue || t('(空)', '(empty)')}</span>
                </span>
                {wasValue !== nowValue && (
                  <span>
                    <span className={s.label}>{t('企画で承認された値', 'Approved in the plan')}</span>
                    <span className={s.was}>{wasValue || t('(空)', '(empty)')}</span>
                  </span>
                )}
                <span className={s.label}>{t('直したあと(直してから入れられます)', 'After (you can edit before applying)')}</span>
              </>
            )}
            {body}
            <span className={s.note}>
              {htmlCustom
                ? t('入れると、左のペインに「企画から変更」の印が付き、HTML の同じ場所も書き換えます(見つからない所は知らせます)。左のペインの「保存」で確定します。', 'Applying marks the row as changed from the plan and also updates the same spot in the HTML (you are told if it cannot be found). Confirm with Save in the left pane.')
                : t('入れると、左のペインに「企画から変更」の印が付き、HTML の下書きも作り直されます。左のペインの「保存」で確定します。', 'Applying marks the row as changed from the plan, and the draft HTML is rebuilt. Confirm with Save in the left pane.')}
            </span>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" icon={<CheckmarkRegular />} disabled={!ready} onClick={apply}>
              {t('この内容で入れる', 'Apply')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
      {uploading && (
        <HeroUploadDialog
          market={cardMarket(current.card.country ?? '')}
          cardId={current.card.id}
          me={myName()}
          onClose={() => setUploading(false)}
          onDone={(h) => {
            setHero(h)
            setUploading(false)
          }}
        />
      )}
    </>
  )
}
