import { useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, Input, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowSyncRegular, ArrowUndoRegular, ArrowUpRegular, CheckmarkRegular, CopyRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { getText, linkRows, productRows, rowsText, variantSnapshot, variantUtmCampaign, setHero, setLink, setProducts, setText, textRows, type Snapshot, type TextField } from './productionSnapshot'
import { productImage, heroImage } from './images'
import { cardMarket, heroMarket, productMarket } from './market'
import { AutoTextarea } from './AutoTextarea'
import { useT } from './i18n'

const useStyles = makeStyles({
  preLine: { whiteSpace: 'pre-line' },
  warn: { display: 'block', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, color: tokens.colorPaletteMarigoldForeground2, backgroundColor: tokens.colorPaletteMarigoldBackground1 },
  section: { display: 'grid', rowGap: '6px' },
  sectionHead: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  grow: { flexGrow: 1 },
  // 1 行(見出し・値・操作)。企画から変えた行は、左に色の線を引く
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'start', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  changed: { borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}` },
  rowLabel: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  rowValue: { display: 'grid', rowGap: '2px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0 },
  // 元の値(企画で承認された値)
  was: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, textDecorationLine: 'line-through', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  tools: { display: 'flex', alignItems: 'center' },
  product: { display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', columnGap: '8px', alignItems: 'center', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}` },
  thumb: { width: '44px', height: '44px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  hero: { width: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  heroWas: { width: '64px', height: '40px', objectFit: 'contain', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, opacity: 0.7 },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  picker: { display: 'grid', rowGap: '6px', width: '340px', maxHeight: '420px' },
  pickList: { overflowY: 'auto', display: 'grid', rowGap: '2px', minHeight: 0 },
  pickItem: { display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', padding: '4px', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  pickThumb: { width: '36px', height: '36px', objectFit: 'contain', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', overflowY: 'auto', minHeight: 0 },
  heroPick: { padding: 0, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3, cursor: 'pointer', height: '64px', ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` } },
  heroPickImg: { width: '100%', height: '100%', objectFit: 'contain' },
})

/** 押すと文字をコピーする小さなボタン(コピーしたら、少しのあいだ印を変える) */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  return (
    <Tooltip content={label ?? t('コピー', 'Copy')} relationship="label">
      <Button
        size="small"
        appearance="subtle"
        icon={done ? <CheckmarkRegular /> : <CopyRegular />}
        disabled={!text}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1200)
          })
        }}
      />
    </Tooltip>
  )
}

interface Props {
  /** 企画で承認された写し(依頼する前は、いまの配信カードから作った下書き) */
  original: Snapshot
  /** いま見せる中身(直していれば、直したもの) */
  current: Snapshot
  /** 直せるか(依頼したあとの、生きている版だけ) */
  editable: boolean
  onChange: (next: Snapshot) => void
  /** 選べる商品・メイン画像(この中から、配信の国の市場に合うものだけを出す) */
  products: Product[]
  heroes: HeroImage[]
  /** 制作指示の段(上に出す。直さない) */
  head: ReactNode
  /** 下に出す小さな注記 */
  foot: ReactNode
}

/**
 * 制作のページの左のペイン(要素の情報)。テキスト・メイン画像・商品・リンク先を、コピーでき、直せる。
 * 2026-10-19、利用者と決めた: 承認のあとの文言・画像・商品・リンク先の調整は、企画と制作のあいだで決めてよい(承認のやり直しは要らない)。
 * 直したものは、配信カードを書き換えず、制作の依頼の側に持つ。企画から変えた行には印を付け、元の値を出す(何を変えたかを、企画と制作の両方が分かるように)
 */
export function ProductionInfoPane({ original, current, editable, onChange, products, heroes, head, foot }: Props) {
  const s = useStyles()
  const t = useT()
  const [editing, setEditing] = useState<string | null>(null)
  const market = cardMarket(current.card.country ?? '')
  const poolProducts = useMemo(() => (market ? products.filter((p) => productMarket(p) === market) : products), [products, market])
  const poolHeroes = useMemo(() => (market ? heroes.filter((h) => heroMarket(h) === market) : heroes), [heroes, market])

  // テキスト: 直せるときは空の行も出す(空のセクションにも書けるように)。元の値と比べて印を付ける
  const texts = textRows(current, editable).filter((r) => editable || r.value.trim() || getText(original, r.field).trim())
  const prows = productRows(current)
  const lrows = linkRows(current)
  const origLinks = new Map(linkRows(original).map((r) => [r.slotKey ?? r.label, r.base ?? r.value]))
  const removed = original.productIds.filter((id) => !current.productIds.includes(id)).map((id) => original.products.find((p) => p.id === id)?.name ?? '').filter(Boolean)

  const section = (title: string, copyAll: string | null, children: ReactNode, extra?: ReactNode) => (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.grow}>{title}</span>
        {extra}
        {copyAll !== null && <CopyButton text={copyAll} label={t('まとめてコピー', 'Copy all')} />}
      </div>
      {children}
    </div>
  )
  const mark = <Badge size="small" appearance="tint" color="warning">{t('企画から変更', 'Changed from plan')}</Badge>
  const undo = (onUndo: () => void) => (
    <Tooltip content={t('企画の値に戻す', 'Revert to the plan')} relationship="label">
      <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} onClick={onUndo} />
    </Tooltip>
  )
  const editBtn = (id: string) =>
    editable && (
      <Tooltip content={editing === id ? t('直し終える', 'Done') : t('直す', 'Edit')} relationship="label">
        <Button size="small" appearance={editing === id ? 'primary' : 'subtle'} icon={editing === id ? <CheckmarkRegular /> : <EditRegular />} onClick={() => setEditing(editing === id ? null : id)} />
      </Tooltip>
    )

  const textRow = (label: string, id: string, field: TextField) => {
    const value = getText(current, field)
    const was = getText(original, field)
    const changed = value !== was
    return (
      <div key={id} className={mergeClasses(s.row, changed && s.changed)}>
        <span className={s.rowValue}>
          <span className={s.rowLabel}>
            {label}
            {changed && mark}
          </span>
          {editing === id ? <AutoTextarea size="small" value={value} onChange={(_, d) => onChange(setText(current, field, d.value))} autoFocus /> : value || <span className={s.note}>{t('(空)', '(empty)')}</span>}
          {changed && <span className={s.was}>{was || t('(空)', '(empty)')}</span>}
        </span>
        <span className={s.tools}>
          {changed && editable && undo(() => onChange(setText(current, field, was)))}
          {editBtn(id)}
          <CopyButton text={value} />
        </span>
      </div>
    )
  }

  // 商品を選ぶ(名前・商品コードで探す)。配信の国の市場の商品だけ
  const productPicker = (trigger: ReactNode, onPick: (id: string) => void) => <ProductPicker trigger={trigger} products={poolProducts} onPick={onPick} />
  const moveProduct = (i: number, d: number) => {
    const ids = [...current.productIds]
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    onChange(setProducts(current, ids, products))
  }
  const replaceProduct = (i: number, id: string) => onChange(setProducts(current, current.productIds.map((x, k) => (k === i ? id : x)), products))
  const removeProduct = (i: number) => onChange(setProducts(current, current.productIds.filter((_, k) => k !== i), products))
  const productsChanged = current.productIds.join() !== original.productIds.join()

  const heroChanged = (current.hero?.id ?? '') !== (original.hero?.id ?? '')

  // AB テスト(X55): 案ごとのメイン画像と商品。見るだけ(案の中身を直すのは配信カード)
  const ab = current.ab
  const productName = (id: string) => current.products.find((p) => p.id === id)?.name ?? ''
  const abBlock =
    ab &&
    section(
      t('AB テスト', 'A/B test'),
      [
        ab.summary,
        `A: ${current.productIds.map(productName).join(' / ')}`,
        ...ab.variants.map((v) => `${v.key}: ${v.productIds.map(productName).join(' / ')}${v.hero ? ` (${v.hero.name})` : ''}`),
      ].join('\n'),
      <>
        <div className={s.row}>
          <span className={mergeClasses(s.rowValue, s.preLine)}>{ab.summary}</span>
        </div>
        {ab.choose && (
          <span className={s.warn}>
            {t('案から選ぶ配信で、まだ 1 案に決まっていません。配信カードで「この案に決める」を押してから、制作に進めてください', 'This delivery is still choosing between variants. Choose one in the delivery card before production.')}
          </span>
        )}
        {[{ key: 'A' as const, productIds: current.productIds, hero: current.hero }, ...ab.variants].map((v) => {
          // 案ごとの計測用のパラメーター(utm_campaign の末尾に案。X55)。その案のリンク・商品の URL を、まとめて写せる
          const vs = variantSnapshot(current, v)
          const campaign = variantUtmCampaign(current, v.key)
          const urls = [...linkRows(vs, v.key), ...productRows(vs, v.key).map((r) => ({ label: r.product.name, value: r.url }))].filter((r) => r.value)
          return (
            <div key={v.key} className={s.row}>
              <span className={s.rowValue}>
                <span className={s.rowLabel}>{t(`${v.key} 案`, `Variant ${v.key}`)}</span>
                {v.hero && <img className={s.heroWas} src={heroImage(v.hero) ?? ''} alt="" />}
                {'texts' in v && v.texts && <span className={s.note}>{t(`ヘッドライン: ${v.texts.headline || '(なし)'}`, `Headline: ${v.texts.headline || '(none)'}`)}</span>}
                <span className={s.note}>{v.productIds.map(productName).filter(Boolean).join(' / ') || t('(商品なし)', '(no products)')}</span>
                {!ab.choose && <span className={s.note}>utm_campaign: {campaign}</span>}
              </span>
              <span className={s.tools}>
                <CopyButton text={rowsText(urls)} label={t('この案のリンクをコピー', 'Copy this variant’s links')} />
              </span>
            </div>
          )
        })}
        <span className={s.note}>{t('A 案は、下のテキスト・メイン画像・商品そのものです。B・C 案の中身を直すときは、配信カードで直します', 'Variant A is the text, image and products below. Edit variants B and C in the delivery card.')}</span>
        <span className={s.note}>
          {t(
            '計測: 案ごとに utm_campaign の末尾が -a・-b・-c になります(配信システムには、案ごとのリンクを設定してください)。勝ち案を残りに送ると、残り分も同じリンクのまま送られるので、GA の案ごとの数字には、勝ち案にだけ残り分が混ざります。勝ち負けは、配信システムのテスト分の数字で見ます',
            'Tracking: utm_campaign ends in -a, -b or -c per variant (set each variant’s links in the delivery system). The rollout to the rest reuses the winner’s links, so in GA only the winner’s numbers include the rollout. Judge the winner by the delivery system’s test-group numbers.',
          )}
        </span>
      </>,
    )

  return (
    <>
      {head}
      {abBlock}
      {section(
        t('テキスト', 'Text'),
        rowsText(texts),
        texts.map((r) => textRow(r.label, r.id, r.field)),
      )}
      {section(
        t('メイン画像', 'Main image'),
        null,
        <div className={mergeClasses(s.row, heroChanged && s.changed)}>
          <span className={s.rowValue}>
            {heroChanged && <span className={s.rowLabel}>{mark}</span>}
            {current.hero ? <img className={s.hero} src={heroImage(current.hero) ?? ''} alt="" /> : <span className={s.note}>{t('メイン画像はありません', 'No main image')}</span>}
            {current.hero && <span className={s.note}>{new URL(heroImage(current.hero) ?? '', location.href).href}</span>}
            {heroChanged && (
              <span className={s.rowLabel}>
                {t('元:', 'Was:')}
                {original.hero ? <img className={s.heroWas} src={heroImage(original.hero) ?? ''} alt="" /> : t('(なし)', '(none)')}
              </span>
            )}
          </span>
          <span className={s.tools}>
            {heroChanged && editable && undo(() => onChange(setHero(current, original.hero)))}
            {editable && <HeroPicker heroes={poolHeroes} onPick={(h) => onChange(setHero(current, h))} />}
            {current.hero && <CopyButton text={new URL(heroImage(current.hero) ?? '', location.href).href} label={t('画像の URL をコピー', 'Copy image URL')} />}
          </span>
        </div>,
      )}
      {section(
        t(`選定された商品(${prows.length})`, `Selected products (${prows.length})`),
        prows.map((r) => [r.section, r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')).join('\n'),
        <>
          {prows.map((r, i) => {
            const wasId = original.productIds[i]
            const changed = wasId !== r.product.id
            const wasName = wasId ? (original.products.find((p) => p.id === wasId)?.name ?? '') : ''
            return (
              <div key={`${r.product.id}-${i}`} className={mergeClasses(s.product, changed && s.changed)}>
                <img className={s.thumb} src={productImage(r.product) ?? ''} alt="" />
                <span className={s.rowValue}>
                  <span className={s.rowLabel}>
                    {r.section}
                    {changed && mark}
                  </span>
                  {`${r.product.name} ・ ${r.product.product_code ?? ''} ・ ${r.price}`}
                  <span className={s.note}>{r.url}</span>
                  {changed && <span className={s.was}>{wasName || t('(企画にはない枠)', '(not in the plan)')}</span>}
                </span>
                <span className={s.tools}>
                  {editable && (
                    <>
                      <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0} onClick={() => moveProduct(i, -1)} aria-label={t('上へ', 'Move up')} />
                      <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === prows.length - 1} onClick={() => moveProduct(i, 1)} aria-label={t('下へ', 'Move down')} />
                      {productPicker(<Button size="small" appearance="subtle" icon={<ArrowSyncRegular />} aria-label={t('ほかの商品に替える', 'Replace with another product')} />, (id) => replaceProduct(i, id))}
                      <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => removeProduct(i)} aria-label={t('外す', 'Remove')} />
                    </>
                  )}
                  <CopyButton text={[r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')} />
                </span>
              </div>
            )
          })}
          {removed.length > 0 && <span className={s.note}>{t(`企画から外した商品: ${removed.join('、')}`, `Removed from the plan: ${removed.join(', ')}`)}</span>}
          {editable && (
            <span className={s.tools}>
              {productPicker(<Button size="small" appearance="subtle" icon={<AddRegular />}>{t('商品を足す', 'Add a product')}</Button>, (id) => onChange(setProducts(current, [...current.productIds, id], products)))}
              {productsChanged && undo(() => onChange(setProducts(current, original.productIds, original.products)))}
            </span>
          )}
        </>,
      )}
      {section(
        t('リンク先', 'Links'),
        rowsText(lrows.filter((r) => r.value)),
        lrows.length ? (
          lrows.map((r) => {
            const id = `link.${r.slotKey ?? r.label}`
            const was = origLinks.get(r.slotKey ?? r.label) ?? ''
            const changed = !!r.slotKey && (r.base ?? '') !== was
            return (
              <div key={id} className={mergeClasses(s.row, changed && s.changed)}>
                <span className={s.rowValue}>
                  <span className={s.rowLabel}>
                    {r.label}
                    {changed && mark}
                  </span>
                  {editing === id && r.slotKey ? (
                    <Input size="small" value={r.base ?? ''} onChange={(_, d) => onChange(setLink(current, r.slotKey!, d.value))} placeholder="https://" autoFocus />
                  ) : (
                    r.value
                  )}
                  {changed && <span className={s.was}>{was}</span>}
                </span>
                <span className={s.tools}>
                  {changed && editable && undo(() => onChange(setLink(current, r.slotKey!, was)))}
                  {r.slotKey && editBtn(id)}
                  <CopyButton text={r.value} />
                </span>
              </div>
            )
          })
        ) : (
          <span className={s.note}>{t('リンク先はありません', 'No links')}</span>
        ),
      )}
      {foot}
    </>
  )
}

function ProductPicker({ trigger, products, onPick }: { trigger: ReactNode; products: Product[]; onPick: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (k ? products.filter((p) => p.name.toLowerCase().includes(k) || (p.product_code ?? '').toLowerCase().includes(k)) : products).slice(0, 40)
  }, [products, q])
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>{trigger as never}</PopoverTrigger>
      <PopoverSurface>
        <div className={s.picker}>
          <Input size="small" value={q} onChange={(_, d) => setQ(d.value)} placeholder={t('商品名・商品コードで探す', 'Search by name or code')} autoFocus />
          <div className={s.pickList}>
            {hits.map((p) => (
              <button
                key={p.id}
                type="button"
                className={s.pickItem}
                onClick={() => {
                  onPick(p.id)
                  setOpen(false)
                }}
              >
                <img className={s.pickThumb} src={productImage(p) ?? ''} alt="" />
                <span>
                  {p.name}
                  <span className={s.note}>{` ・ ${p.product_code ?? ''}`}</span>
                </span>
              </button>
            ))}
            {!hits.length && <span className={s.note}>{t('見つかりません', 'No matches')}</span>}
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  )
}

function HeroPicker({ heroes, onPick }: { heroes: HeroImage[]; onPick: (h: HeroImage) => void }) {
  const s = useStyles()
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} withArrow positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={t('ほかの画像に替える', 'Replace the image')} relationship="label">
          <Button size="small" appearance="subtle" icon={<ArrowSyncRegular />} />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <div className={s.picker}>
          <div className={s.heroGrid}>
            {heroes.map((h) => (
              <button
                key={h.id}
                type="button"
                className={s.heroPick}
                title={h.name}
                onClick={() => {
                  onPick(h)
                  setOpen(false)
                }}
              >
                <img className={s.heroPickImg} src={heroImage(h) ?? ''} alt={h.name} />
              </button>
            ))}
          </div>
        </div>
      </PopoverSurface>
    </Popover>
  )
}
