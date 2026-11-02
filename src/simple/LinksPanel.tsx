// 配信カードのリンクの一覧(G1・G2。2026-11-02 Plan と Production のシンプル版を仕上げる)。左のバーの「リンク」で開く。
// 部品ごとに開かなくても、配信の全部のリンク(メイン画像・ボタン・商品)を一度に見て、メイン画像・ボタンのリンク先はその場でまとめて直せる
// (以前の詳しい配信カードの LinkOverlay・LinksEditor にあったもの)。
// 行の形は、制作の材料のリンクの行(production/MaterialRows の LinkMaterialRows)と同じ。値と直し方は editor の links・setLinks(部品のペインと同じもの。
// 打てばそのまま入り、自動で保存する)。商品のリンク先は商品ページなので、ここでは見る・写すだけ
import { Input, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { filled } from '../slots'
import { useT } from '../i18n'
import { typo } from '../typo'
import { CopyButton } from '../CopyButton'
import { OpenLink } from '../LinkText'
import { AppScreenField } from '../AppLinksEditor'
import { FeatureBadge } from '../FeatureBadge'
import type { LinkSlot } from '../links'
import type { PartRef } from './parts'
import type { SimpleEditor } from './editor'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '16px', alignContent: 'start', minWidth: 0 },
  section: { display: 'grid', rowGap: '6px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  title: { ...typo.heading, flexGrow: 1, minWidth: 0 },
  list: { display: 'grid', rowGap: '4px', minWidth: 0 },
  // 1 行(場所・直す欄・計測用のパラメーターつきの URL)。行の形は制作の材料の行と同じ
  row: { display: 'grid', rowGap: '4px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  // 場所の名前を押すと、プレビューのその部品を選ぶ(部品のペインで、ほかの中身も直せる)
  place: { ...typo.valueStrong, justifySelf: 'start', padding: 0, border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: tokens.colorNeutralForeground1, ':hover': { color: tokens.colorBrandForeground1, textDecorationLine: 'underline' } },
  placeOn: { color: tokens.colorBrandForeground1 },
  edit: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  // 実際に送る URL(計測用のパラメーターつき)。長いので小さく薄く、どこでも折り返す
  tracked: { display: 'flex', alignItems: 'start', columnGap: '2px', minWidth: 0 },
  url: { flexGrow: 1, minWidth: 0, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  caption: typo.caption,
})

interface Props {
  editor: SimpleEditor
  /** 選んでいる部品(その部品の行に印) */
  part: PartRef | null
  /** 場所の名前を押したとき(その部品を選ぶ) */
  onPick: (p: PartRef) => void
}

/** 場所(メイン画像・ボタン)の部品 */
const partOf = (slot: LinkSlot): PartRef => (slot.kind === 'hero' ? { kind: 'hero' } : { kind: 'button', id: slot.key })
const samePlace = (slot: LinkSlot, p: PartRef | null) => !!p && (slot.kind === 'hero' ? p.kind === 'hero' : p.kind === 'button' && p.id === slot.key)

export function LinksPanel({ editor: e, part, onPick }: Props) {
  const s = useStyles()
  const t = useT()
  const email = e.channel === 'email'
  const value = (slot: LinkSlot) => (slot.kind === 'hero' ? e.links.hero : e.links.buttons?.[slot.key]) ?? ''
  const setValue = (slot: LinkSlot, v: string) => e.setLinks(slot.kind === 'hero' ? { ...e.links, hero: v } : { ...e.links, buttons: { ...e.links.buttons, [slot.key]: v } })
  // 商品の枠のリンク(メールだけ。アプリの通知に商品のリンクはない)
  const products = email
    ? filled(e.items)
        .map((it) => ({ key: it.key, link: e.productLinkOf(it.key) }))
        .filter((r): r is { key: string; link: { name: string; url: string } } => !!r.link?.url)
    : []
  const tracked = e.linkSpots.map((slot) => ({ label: slot.label, url: email ? e.linkUrlOf(slot) : '' }))
  const copyAll = [...tracked.filter((r) => r.url).map((r) => `${r.label}: ${r.url}`), ...products.map((r) => `${r.link.name}: ${r.link.url}`)].join('\n')
  return (
    <div className={s.root}>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.title}>{email ? t(`リンク先(${e.linkSpots.length})`, `Links (${e.linkSpots.length})`) : t(`押したときに開く画面(${e.linkSpots.length})`, `Screens opened on tap (${e.linkSpots.length})`)}</span>
          <FeatureBadge id="content.links.list" />
          {email && <CopyButton text={copyAll} label={t('リンクをすべてコピー(計測用のパラメーターつき)', 'Copy all links (with tracking)')} />}
        </div>
        {e.linkSpots.length ? (
          <div className={s.list}>
            {e.linkSpots.map((slot, i) => (
              <div key={slot.key} className={s.row}>
                <Tooltip content={t('プレビューで、この部品を選ぶ', 'Select this part in the preview')} relationship="description">
                  <button type="button" className={mergeClasses(s.place, samePlace(slot, part) && s.placeOn)} onClick={() => onPick(partOf(slot))}>
                    {slot.label}
                  </button>
                </Tooltip>
                {email ? (
                  <>
                    {/* 空なら既定のリンク先(薄く出す)。打てばそのまま入り、自動で保存する(部品のペインのリンク先と同じ値) */}
                    <span className={s.edit}>
                      <Input
                        className={s.grow}
                        size="small"
                        value={value(slot)}
                        placeholder={slot.defaultUrl}
                        disabled={e.saving}
                        aria-label={t(`${slot.label} のリンク先(空は既定)`, `${slot.label} link (empty uses the default)`)}
                        onChange={(_, d) => setValue(slot, d.value)}
                      />
                      <OpenLink url={value(slot).trim() || slot.defaultUrl} />
                    </span>
                    {tracked[i].url && (
                      <span className={s.tracked}>
                        <span className={s.url}>{tracked[i].url}</span>
                        <CopyButton text={tracked[i].url} label={t('計測用のパラメーターつきの URL をコピー', 'Copy the URL with tracking')} />
                      </span>
                    )}
                  </>
                ) : (
                  <AppScreenField links={e.links} onLinks={e.setLinks} slot={slot} items={e.items} products={e.products} campaign={e.fcmCampaign} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className={s.caption}>{t('リンクを付ける場所はありません', 'No link spots')}</span>
        )}
      </div>
      {products.length > 0 && (
        <div className={s.section}>
          <div className={s.head}>
            <span className={s.title}>{t(`商品のリンク先(${products.length})`, `Product links (${products.length})`)}</span>
          </div>
          <span className={s.caption}>{t('商品のリンク先は、その商品のページです(ここでは直せません)', 'Product links go to each product page (not editable here)')}</span>
          <div className={s.list}>
            {products.map((r) => (
              <div key={r.key} className={s.row}>
                <Tooltip content={t('プレビューで、この商品を選ぶ', 'Select this product in the preview')} relationship="description">
                  <button type="button" className={mergeClasses(s.place, part?.kind === 'product' && part.itemKey === r.key && s.placeOn)} onClick={() => onPick({ kind: 'product', itemKey: r.key })}>
                    {r.link.name}
                  </button>
                </Tooltip>
                <span className={s.tracked}>
                  <span className={s.url}>{r.link.url}</span>
                  <CopyButton text={r.link.url} label={t('計測用のパラメーターつきの URL をコピー', 'Copy the URL with tracking')} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
