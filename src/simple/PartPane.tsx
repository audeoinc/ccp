import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Field, Input, Select, Text, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowSwapRegular, ArrowUpRegular, DeleteRegular, ImageAddRegular, OpenRegular } from '@fluentui/react-icons'
import { AutoTextarea } from '../AutoTextarea'
import { Candidates } from '../Candidates'
import { HeroCandidates } from '../HeroCandidates'
import { ImageThumb } from '../ImageThumb'
import { AlertMark } from '../AlertMark'
import { LowStockBadge } from '../ProductMarks'
import { heroImage, productImage } from '../images'
import { yen } from '../items'
import { locale, optionLabel, useT } from '../i18n'
import { productMarket } from '../market'
import { THEME_TYPES, themeTypeLabel } from '../themeTypes'
import { AGE_BANDS, TARGET_GENDERS, ageLabel, formatAges, genderLabel, parseAges, type TargetGender } from '../target'
import { channelOptions, countryOptions, statusColor, statusOptions } from '../status'
import { getTemplate, sectionIndexAt, sectionsOf } from '../templates'
import type { Product } from '../models/products'
import type { PartRef } from './parts'
import type { SimpleEditor, SimpleField } from './editor'

const useStyles = makeStyles({
  root: { display: 'grid', alignContent: 'start', rowGap: '12px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  title: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '10px', rowGap: '10px' },
  chip: { minWidth: 'auto', height: '24px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
  // 商品の見比べ・情報の箱
  product: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', columnGap: '10px', alignItems: 'start', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  productText: { display: 'grid', rowGap: '2px', minWidth: 0 },
  name: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  compare: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '8px' },
  // 見比べの列は狭いので、写真の下に文字を置き、名前を折り返す
  productTall: { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '6px', justifyItems: 'center' },
  nameWrap: { whiteSpace: 'normal' },
  compareCol: { display: 'grid', rowGap: '4px', alignContent: 'start', minWidth: 0 },
  compareBox: { display: 'grid', rowGap: '8px', padding: '10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground2 },
  // 何も選んでいないときの、載せた商品の一覧
  list: { display: 'grid', rowGap: '4px' },
  listRow: { display: 'grid', gridTemplateColumns: '20px 32px minmax(0, 1fr) auto', columnGap: '6px', alignItems: 'center', padding: '2px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  num: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, textAlign: 'right' },
  heroNow: { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', columnGap: '10px', alignItems: 'start' },
  heroCands: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '6px' },
  heroCand: { display: 'grid', rowGap: '2px', padding: '4px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  // この配信のねらい(テーマ・切り口)。直す部品の上の、控えめな箱
  aim: { display: 'grid', rowGap: '2px', width: '100%', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, boxSizing: 'border-box' },
  aimBtn: { border: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover } },
  aimTheme: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1 },
  readonly: { display: 'grid', rowGap: '2px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
})

interface Props {
  editor: SimpleEditor
  part: PartRef | null
  /** 商品の一覧で押した商品(選んでいる枠と見比べる。載せた商品か候補の鍵) */
  compareKey: string | null
  /** 見比べている商品を、選んでいる枠に置く */
  onPlace: (key: string) => void
  onCompareDone: () => void
  /** 部品を選び直す(何も選んでいないときの、商品の一覧から) */
  onPick: (p: PartRef | null) => void
}

/** 選んだ部品のペイン(SU1 ⑨)。選んだものによって中身が替わる。入力は、そのまま配信カードの状態に書くので、反映の前からプレビューに写る */
export function PartPane({ editor: e, part, compareKey, onPlace, onCompareDone, onPick }: Props) {
  const t = useT()
  const s = useStyles()
  const byId = new Map(e.products.map((p) => [p.id, p]))
  const tpl = getTemplate(e.template)
  const sections = sectionsOf(e.template)

  const text = (k: SimpleField, label: string, opts: { rows?: number; placeholder?: string; hint?: string } = {}) => (
    <Field label={label} hint={opts.hint} size="small">
      <AutoTextarea size="small" rows={opts.rows ?? 2} autoFocus value={e.form[k]} placeholder={opts.placeholder} onChange={(_, d) => e.setField(k, d.value)} />
    </Field>
  )

  const productBox = (p: Product | undefined, extra?: ReactNode, image?: string, tall = false) =>
    p ? (
      <div className={mergeClasses(s.product, tall && s.productTall)}>
        <ImageThumb src={productImage(p, image)} alt={p.name} width={64} height={80} />
        <span className={s.productText}>
          <span className={mergeClasses(s.name, tall && s.nameWrap)}>
            <AlertMark kind={e.alertKinds.get(p.id)} />
            {p.name}
          </span>
          <span className={s.meta}>{`${p.product_code ?? ''} ・ ${yen(p.price, productMarket(p))}`}</span>
          <span className={s.meta}>{t(`在庫 ${p.stock ?? '-'}`, `Stock ${p.stock ?? '-'}`)}{p.sales_trend_name ? ` ・ ${optionLabel(p.sales_trend_name)}` : ''}</span>
          <span className={s.row}><LowStockBadge product={p} /></span>
          {extra}
        </span>
      </div>
    ) : null

  // 商品の一覧で押した商品と、選んでいる枠の見比べ(SU1 ⑩)
  const compareBlock = (() => {
    if (!compareKey || !part || (part.kind !== 'product' && part.kind !== 'slot')) return null
    const it = e.items.find((i) => i.key === compareKey)
    const cand = it ? undefined : e.candidates.find((c) => c.key === compareKey)
    const other = byId.get((it ?? cand)?.productId ?? '')
    if (!other) return null
    const cur = part.kind === 'product' ? e.items.find((i) => i.key === part.itemKey) : undefined
    if (cur && cur.key === compareKey) return null
    const run = () => onPlace(compareKey)
    return (
      <div className={s.compareBox}>
        <span className={s.label}>{t('見比べる', 'Compare')}</span>
        <div className={s.compare}>
          <div className={s.compareCol}>
            <span className={s.caption}>{cur ? t('この枠の商品', 'In this slot') : t('この枠', 'This slot')}</span>
            {cur ? productBox(byId.get(cur.productId), undefined, cur.imageUrl, true) : <span className={s.caption}>{t('(空き)', '(empty)')}</span>}
          </div>
          <div className={s.compareCol}>
            <span className={s.caption}>{it ? t('押した商品(載せている)', 'Clicked (in this delivery)') : t('押した商品(候補)', 'Clicked (candidate)')}</span>
            {productBox(other, undefined, it?.imageUrl, true)}
          </div>
        </div>
        <div className={s.row}>
          <Button size="small" appearance="primary" icon={<ArrowSwapRegular />} onClick={run}>
            {cur ? t('この枠の商品と入れ替える', 'Swap with the product in this slot') : t('この枠に入れる', 'Put in this slot')}
          </Button>
          <Button size="small" onClick={onCompareDone}>{t('やめる', 'Cancel')}</Button>
        </div>
      </div>
    )
  })()

  const body = (() => {
    if (!part)
      return (
        <>
          <span className={s.caption}>{t('直したい所を、プレビューで押してください(Tab で次の部品、Esc で選ぶのをやめる)。', 'Click what you want to change in the preview (Tab for the next part, Esc to stop).')}</span>
          <span className={s.label}>{t(`載せた商品(${e.items.length})`, `Products (${e.items.length})`)}</span>
          {e.items.length === 0 && <span className={s.caption}>{t('まだ商品がありません。プレビューの空いた枠を押すと、商品を探せます。', 'No products yet. Click an empty slot in the preview to find one.')}</span>}
          <div className={s.list}>
            {e.items.map((it, i) => {
              const p = byId.get(it.productId)
              return (
                <div key={it.key} className={s.listRow} onMouseEnter={() => e.hoverProduct(it.key)} onMouseLeave={() => e.hoverProduct(null)}>
                  <span className={s.num}>{i + 1}</span>
                  <ImageThumb src={productImage(p, it.imageUrl)} alt={p?.name ?? ''} width={32} height={40} />
                  <Button size="small" appearance="transparent" style={{ justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden' }} onClick={() => onPick({ kind: 'product', itemKey: it.key })}>
                    <span className={s.name}>
                      <AlertMark kind={e.alertKinds.get(it.productId)} />
                      {p?.name}
                    </span>
                  </Button>
                  <span className={s.row}>
                    <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0 || e.saving} onClick={() => e.moveItem(i, i - 1)} aria-label={t('前へ', 'Move up')} />
                    <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === e.items.length - 1 || e.saving} onClick={() => e.moveItem(i, i + 1)} aria-label={t('後ろへ', 'Move down')} />
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )
    switch (part.kind) {
      case 'subject':
        return text('subject', t('件名', 'Subject'), { rows: 1, placeholder: e.form.name, hint: t('空のときは配信名が件名になります', 'Empty uses the delivery name') })
      case 'preheader':
        return text('preheader', t('プリヘッダー(受信箱で件名の横に出る文)', 'Preheader (shown next to the subject in the inbox)'), { rows: 2 })
      case 'pushTitle':
        return text('pushTitle', t('通知のタイトル', 'Notification title'), { rows: 1, placeholder: e.form.headline })
      case 'pushBody':
        return text('pushBody', t('通知の本文', 'Notification body'), { rows: 3, placeholder: e.form.copy })
      case 'headline':
      case 'copy':
        return (
          <>
            {part.kind === 'headline' ? text('headline', t('ヘッドライン(メイン画像に載せる大見出し)', 'Headline (on the main image)'), { rows: 1 }) : text('copy', t('コピー(ヘッドラインの下の導入文)', 'Copy (intro below the headline)'), { rows: 3 })}
          </>
        )
      case 'sectionTitle':
      case 'sectionCopy': {
        const i = part.index
        const isTitle = part.kind === 'sectionTitle'
        const value = (isTitle ? e.sectionTitles[i] : e.sectionCopies[i]) ?? ''
        return (
          <Field label={isTitle ? t(`セクション ${i + 1} の見出し`, `Section ${i + 1} heading`) : t(`セクション ${i + 1} のコピー`, `Section ${i + 1} copy`)} size="small" hint={isTitle && !value ? t('空のときは、商品のカテゴリ名を出します', 'Empty shows the product category') : undefined}>
            <AutoTextarea size="small" rows={isTitle ? 1 : 2} autoFocus value={value} onChange={(_, d) => (isTitle ? e.setSectionTitle(i, d.value) : e.setSectionCopy(i, d.value))} />
          </Field>
        )
      }
      case 'hero':
        return (
          <>
            <div className={s.heroNow}>
              {e.hero ? <ImageThumb src={heroImage(e.hero)} alt={e.hero.name} width={120} height={90} /> : <span className={s.caption}>{t('(メイン画像なし)', '(no main image)')}</span>}
              <span className={s.productText}>
                <span className={s.name}>{e.hero?.name ?? t('まだ選んでいません', 'Not chosen yet')}</span>
                {e.heroReason && <span className={s.caption}>{e.heroReason}</span>}
                <span className={s.row}>
                  <Button size="small" icon={<ImageAddRegular />} onClick={e.uploadHero}>{t('持っている画像を上げる…', 'Upload an image…')}</Button>
                  {e.hero && <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={() => e.setHero(undefined, '')}>{t('外す', 'Remove')}</Button>}
                </span>
              </span>
            </div>
            {e.heroCandidates.length > 0 && (
              <>
                <span className={s.label}>{t('AI の候補', 'AI candidates')}</span>
                <div className={s.heroCands}>
                  {e.heroCandidates.map((c) => {
                    const h = e.poolHeroes.find((x) => x.id === c.heroId)
                    return h ? (
                      <button key={c.heroId} type="button" className={s.heroCand} title={c.reason} onClick={() => e.setHero(h.id, c.reason)}>
                        <ImageThumb src={heroImage(h)} alt={h.name} width={80} height={60} />
                        <span className={s.caption}>{h.name}</span>
                      </button>
                    ) : null
                  })}
                </div>
              </>
            )}
            <span className={s.label}>{t('すべての画像から選ぶ', 'Choose from all images')}</span>
            <HeroCandidates heroes={e.poolHeroes} selectedId={e.hero?.id} onSelect={(id) => e.setHero(id, '')} />
            {e.channel === 'email' && (
              <Field label={t('メイン画像のリンク先(空は既定)', 'Main image link (empty uses the default)')} size="small">
                <Input size="small" value={e.links.hero ?? ''} placeholder={e.linkSpots.find((x) => x.kind === 'hero')?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, hero: d.value })} />
              </Field>
            )}
          </>
        )
      case 'product': {
        const it = e.items.find((i) => i.key === part.itemKey)
        if (!it) return <span className={s.caption}>{t('この商品は、もう載っていません', 'This product is no longer in the delivery')}</span>
        const idx = e.items.indexOf(it)
        const sec = sections[sectionIndexAt(sections, idx)]
        return (
          <>
            {productBox(byId.get(it.productId), it.reason ? <span className={s.caption}>{it.reason}</span> : undefined, it.imageUrl)}
            <span className={s.caption}>{t(`${idx + 1} 番目${sec ? `(${sec.label})` : ''}`, `Position ${idx + 1}${sec ? ` (${sec.label})` : ''}`)}</span>
            <span className={s.row}>
              <Button size="small" icon={<OpenRegular />} onClick={() => e.openProduct(it.key)}>{t('詳しい情報・差し替え・画像…', 'Details, swap, image…')}</Button>
            </span>
            <span className={s.row}>
              <Button size="small" icon={<ArrowUpRegular />} disabled={idx === 0 || e.saving} onClick={() => e.moveItem(idx, idx - 1)}>{t('前へ', 'Earlier')}</Button>
              <Button size="small" icon={<ArrowDownRegular />} disabled={idx === e.items.length - 1 || e.saving} onClick={() => e.moveItem(idx, idx + 1)}>{t('後ろへ', 'Later')}</Button>
              <Button
                size="small"
                appearance="subtle"
                icon={<DeleteRegular />}
                disabled={e.saving}
                onClick={() => {
                  e.removeItem(it.key)
                  onPick(null)
                }}
              >
                {t('外す(候補に戻す)', 'Remove (back to candidates)')}
              </Button>
            </span>
            <span className={s.caption}>{t('右の商品の一覧で別の商品を押すと、この枠の商品と見比べて入れ替えられます。プレビューの上で、つかんで並べ替えることもできます。', 'Click another product in the list on the right to compare and swap it into this slot. You can also drag products in the preview to reorder.')}</span>
          </>
        )
      }
      case 'slot': {
        const sec = sectionIndexAt(sections, Math.max(0, part.index))
        const cands = e.candidates.filter((c) => c.section === sec)
        return (
          <>
            <span className={s.caption}>{t('空いた枠に商品を入れます(空いた枠は、前から埋まります)。', 'Put a product in an empty slot (empty slots fill from the front).')}</span>
            {cands.length > 0 && (
              <>
                <span className={s.label}>{t(`このセクションの残りの候補(${cands.length})`, `Remaining candidates for this section (${cands.length})`)}</span>
                {cands.map((c) => {
                  const p = byId.get(c.productId)
                  return p ? (
                    <div key={c.key}>
                      {productBox(p, <Button size="small" appearance="primary" disabled={e.saving} onClick={() => e.addProduct(p.id, e.items.length)}>{t('この枠に入れる', 'Put in this slot')}</Button>)}
                    </div>
                  ) : null
                })}
              </>
            )}
            <span className={s.label}>{t('ほかの商品を探す', 'Search other products')}</span>
            <Candidates products={e.poolProducts} usedIds={new Set(e.items.map((i) => i.productId))} onAdd={(id) => e.addProduct(id, e.items.length)} />
          </>
        )
      }
      case 'button': {
        const slot = e.linkSpots.find((x) => x.kind === 'button' && x.key === part.id)
        return (
          <>
            <span className={s.caption}>{t('ボタンの文言はテンプレートで決まっています(テンプレートの管理で変えます)。', 'The button text comes from the template (change it in Manage templates).')}</span>
            {slot && <Text size={200}>{slot.label}</Text>}
            {e.channel === 'email' ? (
              <Field label={t('リンク先(空は既定)', 'Link (empty uses the default)')} size="small">
                <Input size="small" autoFocus value={e.links.buttons?.[part.id] ?? ''} placeholder={slot?.defaultUrl} onChange={(_, d) => e.setLinks({ ...e.links, buttons: { ...e.links.buttons, [part.id]: d.value } })} />
              </Field>
            ) : (
              <span className={s.caption}>{t('アプリで開く画面は、詳しい画面の「⑤ リンク先」で決めます。', 'The app screen to open is set in “⑤ Links” of the full view.')}</span>
            )}
          </>
        )
      }
      case 'template':
        return (
          <>
            <div className={s.readonly}>
              <span className={s.label}>{t('いまのテンプレート', 'Current template')}</span>
              <span>{tpl.label}</span>
              {tpl.description && <span className={s.caption}>{tpl.description}</span>}
            </div>
            <span className={s.caption}>{t('テンプレートの選び直しは、次の段階で作ります。いまは「⋯」→「詳しい画面へ」の「② テンプレート」で変えられます。', 'Choosing a different template comes in the next stage. For now, change it in “② Template” via “⋯” → “Open full view”.')}</span>
          </>
        )
      case 'overview':
      case 'meta':
        return <MetaFields editor={e} focus={part.field} />
    }
  })()

  const titleOf = (p: PartRef | null): string => {
    if (!p) return t('部品を選んでください', 'Choose a part')
    switch (p.kind) {
      case 'subject': return t('件名', 'Subject')
      case 'preheader': return t('プリヘッダー', 'Preheader')
      case 'pushTitle': return t('通知のタイトル', 'Notification title')
      case 'pushBody': return t('通知の本文', 'Notification body')
      case 'headline': return t('ヘッドライン', 'Headline')
      case 'copy': return t('コピー', 'Copy')
      case 'hero': return t('メイン画像', 'Main image')
      case 'sectionTitle': return t(`セクション ${p.index + 1} の見出し`, `Section ${p.index + 1} heading`)
      case 'sectionCopy': return t(`セクション ${p.index + 1} のコピー`, `Section ${p.index + 1} copy`)
      case 'product': return t('商品', 'Product')
      case 'slot': return t('空いた枠', 'Empty slot')
      case 'button': return t('ボタン', 'Button')
      case 'template': return t('テンプレート', 'Template')
      case 'overview':
      case 'meta': return t('配信の情報', 'Delivery info')
    }
  }

  return (
    <div className={s.root}>
      <div className={s.head}>
        <span className={s.title}>{titleOf(part)}</span>
        {part && (
          <Button size="small" appearance="subtle" onClick={() => onPick(null)}>
            {t('選ぶのをやめる', 'Deselect')}
          </Button>
        )}
      </div>
      {/* 文言・画像・商品を直すときの手がかり(この配信のねらい)。配信の情報を直すときは出さない */}
      {part?.kind !== 'meta' && part?.kind !== 'overview' && <Aim editor={e} />}
      {compareBlock}
      {body}
    </div>
  )
}

/**
 * この配信のねらい(テーマと切り口)。直す部品の上に小さく出し、ねらいを見ながら書けるようにする。
 * テーマは押すとその場で直せる。切り口は、採用した AI の案の補足なので、読むだけ
 */
function Aim({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <div className={s.aim}>
        <AutoTextarea size="small" rows={2} autoFocus value={e.form.theme} placeholder={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise; not in the email)')} onChange={(_, d) => e.setField('theme', d.value)} onBlur={() => setEditing(false)} />
      </div>
    )
  return (
    <button type="button" className={mergeClasses(s.aim, s.aimBtn)} onClick={() => setEditing(true)} title={t('この配信のねらい(テーマ・切り口。メールには出ません)。押すとテーマを直せます', 'What this delivery aims for (theme and angle; not in the email). Click to edit the theme')}>
      <span className={e.form.theme ? s.aimTheme : s.caption}>{e.form.theme || t('テーマを入れる', 'Add a theme')}</span>
      {e.form.copyAngle && <span className={s.caption}>{e.form.copyAngle}</span>}
    </button>
  )
}

/** 配信の管理の項目(制作指示・種類・国・ターゲット・担当・締め切り)。文言を直すときには使わないので、配信の情報の中に置く */
function ManageFields({ editor: e }: { editor: SimpleEditor }) {
  const t = useT()
  const s = useStyles()
  const ages = parseAges(e.form.targetAges)
  return (
    <>
      <Field label={t('制作指示', 'Production notes')} size="small" data-field="instructions">
        <AutoTextarea size="small" rows={3} value={e.form.instructions} onChange={(_, d) => e.setField('instructions', d.value)} />
      </Field>
      <div className={s.twoCol}>
        <Field label={t('種類', 'Type')} size="small" data-field="themeType">
          <Select size="small" value={e.form.themeType} onChange={(_, d) => e.setField('themeType', d.value)}>
            <option value="">{t('未設定', 'Not set')}</option>
            {THEME_TYPES.map((v) => <option key={v} value={v}>{themeTypeLabel(v)}</option>)}
          </Select>
        </Field>
        <Field label={t('国', 'Country')} size="small" data-field="country">
          <Select size="small" value={e.form.country} onChange={(_, d) => e.setField('country', d.value)}>
            <option value="">{t('未設定', 'Not set')}</option>
            {countryOptions.map((o) => <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('ターゲット', 'Target')} size="small" data-field="target">
        <div className={s.root} style={{ rowGap: 6 }}>
          <span className={s.row}>
            {(['', ...TARGET_GENDERS] as TargetGender[]).map((g) => (
              <ToggleButton key={g || 'none'} className={s.chip} size="small" shape="circular" checked={e.form.targetGender === g} appearance={e.form.targetGender === g ? 'primary' : 'outline'} onClick={() => e.setField('targetGender', g)}>
                {genderLabel(g)}
              </ToggleButton>
            ))}
          </span>
          <span className={s.row}>
            <ToggleButton className={s.chip} size="small" shape="circular" checked={!e.form.targetAges} appearance={!e.form.targetAges ? 'primary' : 'outline'} onClick={() => e.setField('targetAges', '')}>
              {t('指定なし', 'Not specified')}
            </ToggleButton>
            {AGE_BANDS.map((a) => {
              const on = ages.includes(a)
              return (
                <ToggleButton key={a} className={s.chip} size="small" shape="circular" checked={on} appearance={on ? 'primary' : 'outline'} onClick={() => e.setField('targetAges', formatAges(on ? ages.filter((x) => x !== a) : [...ages, a]))}>
                  {ageLabel(a)}
                </ToggleButton>
              )
            })}
          </span>
        </div>
      </Field>
      <Field label={t('担当', 'Owner')} size="small" data-field="owner">
        <Input size="small" value={e.form.owner} onChange={(_, d) => e.setField('owner', d.value)} />
      </Field>
      {/* 制作の担当・締め切りは、引き継ぎのタブだけで決める(2 か所で入力しない。FLOWS の C-3) */}
      <div className={s.readonly} data-field="due">
        <span className={s.label}>{t('制作の締め切り・担当', 'Production due & assignee')}</span>
        <span>
          {e.form.productionDue ? new Date(`${e.form.productionDue}T00:00:00`).toLocaleDateString(locale()) : t('(締め切り未設定)', '(no due date)')}
          {' ・ '}
          {e.form.productionOwner || t('(担当未設定)', '(no assignee)')}
        </span>
        <span className={s.caption}>{t('詳しい画面のプロセスのペインの「引き継ぎ」で決めます', 'Set in the Handoff tab of the full view')}</span>
      </div>
    </>
  )
}

/** 配信の情報(上の帯の配信名・配信日時・ステータスを押したとき)。配信の管理の項目も、ここにまとめる */
function MetaFields({ editor: e, focus }: { editor: SimpleEditor; focus?: string }) {
  const t = useT()
  const s = useStyles()
  const ref = useFocusField(focus)
  return (
    <div ref={ref} className={s.root}>
      <Field label={t('配信名', 'Delivery name')} size="small" required data-field="name">
        <Input size="small" value={e.form.name} onChange={(_, d) => e.setField('name', d.value)} />
      </Field>
      <Field label={t('配信日時', 'Send date & time')} size="small" required data-field="scheduledAt">
        <Input size="small" type="datetime-local" value={e.form.scheduledAt} onChange={(_, d) => e.setField('scheduledAt', d.value)} />
      </Field>
      <Field label={t('チャネル', 'Channel')} size="small" data-field="channel" hint={t('変えると、テンプレートもそのチャネルのものになります', 'Changing it also switches the template to that channel')}>
        <Select size="small" value={e.form.channel} onChange={(_, d) => e.setField('channel', d.value)}>
          <option value="">{t('未設定', 'Not set')}</option>
          {channelOptions.map((o) => <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>)}
        </Select>
      </Field>
      <Field label={t('ステータス', 'Status')} size="small" data-field="status">
        <span className={s.row}>
          <span className={s.dot} style={{ backgroundColor: statusColor(e.form.status) }} />
          <Select size="small" value={e.form.status} onChange={(_, d) => e.setField('status', d.value)} style={{ flexGrow: 1 }}>
            {statusOptions.map((o) => <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>)}
            {e.form.status === 'confirmed' && <option value="confirmed">{t('承認済み(週が確定)', 'Approved (week confirmed)')}</option>}
          </Select>
        </span>
      </Field>
      {e.abVariants && (
        <Badge appearance="tint" color="warning">{t('AB テストの配信です。この画面では A 案だけを直します', 'This is an A/B test. This view edits variant A only')}</Badge>
      )}
      <ManageFields editor={e} />
    </div>
  )
}

/** 押した項目の欄へ、最初に入る(data-field の中の入力欄) */
function useFocusField(focus?: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const target = (focus && box.querySelector(`[data-field="${CSS.escape(focus)}"]`)) || box
    const input = target.querySelector<HTMLElement>('input, textarea, select, button')
    target.scrollIntoView({ block: 'nearest' })
    input?.focus()
  }, [focus])
  return ref
}

