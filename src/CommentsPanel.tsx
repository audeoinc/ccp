import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select, Spinner, Textarea, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleRegular, CommentRegular } from '@fluentui/react-icons'
import { Cr854_cardnotesService, type Cr854_cardnotes } from './gcpdata/Cr854_cardnotesService'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { locale, tr, useT } from './i18n'
import { loadPref, savePref } from './settings'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', minWidth: 0, paddingTop: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  card: { display: 'grid', rowGap: '6px', padding: '10px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  cardOpen: { borderLeft: `3px solid ${tokens.colorPaletteDarkOrangeBorderActive}` },
  meta: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  body: { fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', color: tokens.colorNeutralForeground1 },
  // 対応した内容(対応済みにしたときの記録)
  fix: { display: 'grid', rowGap: '2px', paddingLeft: '10px', borderLeft: `2px solid ${tokens.colorPaletteGreenBorder2}` },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  form: { display: 'grid', rowGap: '6px' },
  formRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px' },
  error: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1 },
})

interface Props {
  /** 保存済みの配信カードの ID(新規作成中は undefined。コメントは、保存してから) */
  cardId?: string
  /** 載せた商品(メールの並び順の商品 ID)。商品ごとのコメントの対象 */
  productIds: string[]
  /** 商品名の表示用(全件) */
  products: Cr854_products[]
  /** 対応した人の既定値(企画の担当者) */
  owner: string
  people: string[]
  /** 未対応の数が変わったとき(タブの数を、閉じなくても合わせるため) */
  onOpenCount?: (n: number) => void
}

// コメントを書く人は、配信ごとに変わらない(レビューする人)ので、ブラウザごとに覚えておく
const AUTHOR_KEY = 'comment.author'
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * レビューのコメント(指摘)と、その対応(バックログ W5)。配信全体か、載せた商品 1 つに付ける。
 * 質問と同じく、配信カードの「保存」を待たずに、その場で保存する。対応済みにしたものは、何をしたかを添えて残す(消さない)
 */
export function CommentsPanel({ cardId, productIds, products, owner, people, onOpenCount }: Props) {
  const styles = useStyles()
  const t = useT()
  const [notes, setNotes] = useState<Cr854_cardnotes[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [author, setAuthor] = useState(() => loadPref<string>(AUTHOR_KEY, ''))
  const [target, setTarget] = useState('')
  const [body, setBody] = useState('')
  const [fixes, setFixes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!cardId) return
    const res = await Cr854_cardnotesService.getAll({ filter: `_cr854_deliverycard_value eq ${cardId}`, orderBy: ['createdon asc'] })
    if (!res.success) {
      setError(res.error?.message ?? tr('コメントを読み込めませんでした', 'Could not load the comments'))
      return
    }
    setNotes(res.data ?? [])
  }, [cardId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const comments = (notes ?? []).filter((n) => n.cr854_kind === 'comment')
  const open = comments.filter((n) => !n.cr854_resolved).length
  useEffect(() => {
    if (notes) onOpenCount?.(open)
  }, [notes, open, onOpenCount])

  const productName = (id?: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? t('(外した商品)', '(removed product)')
  // 対象に選べるのは、載せた商品(同じ商品が 2 回あっても 1 つ)
  const targets = [...new Set(productIds)]

  const run = async (f: () => Promise<{ success: boolean; error?: { message: string } }>) => {
    setBusy(true)
    setError(null)
    const res = await f()
    if (!res.success) setError(res.error?.message ?? tr('保存できませんでした', 'Could not save'))
    await load()
    setBusy(false)
  }

  const add = () =>
    run(async () => {
      savePref(AUTHOR_KEY, author.trim())
      const res = await Cr854_cardnotesService.create({
        'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${cardId})`,
        ...(target ? { 'cr854_product@odata.bind': `/cr854_products(${target})` } : {}),
        cr854_kind: 'comment',
        cr854_author: author.trim(),
        cr854_body: body.trim(),
        cr854_resolved: 0,
      })
      if (res.success) setBody('')
      return res
    })

  // 対応済みにする: 何をしたか(任意)を、返信の列に残す
  const resolve = (n: Cr854_cardnotes) =>
    run(async () => {
      const text = (fixes[n.cr854_cardnoteid] ?? '').trim()
      const res = await Cr854_cardnotesService.update(n.cr854_cardnoteid, {
        cr854_resolved: 1,
        cr854_reply: text,
        cr854_repliedby: owner.trim(),
        cr854_repliedat: new Date().toISOString(),
      })
      if (res.success) setFixes((x) => ({ ...x, [n.cr854_cardnoteid]: '' }))
      return res
    })
  const reopen = (n: Cr854_cardnotes) => run(() => Cr854_cardnotesService.update(n.cr854_cardnoteid, { cr854_resolved: 0 }))

  return (
    <div className={styles.root}>
      <div>
        <div className={styles.head}>
          <CommentRegular />
          {t('レビューのコメント', 'Review comments')}
          {open > 0 && <Badge appearance="tint" color="warning" size="small">{t(`未対応 ${open}`, `${open} open`)}</Badge>}
        </div>
        <div className={styles.caption}>
          {t('配信全体、または載せた商品に、指摘を残します。その場で保存します(配信カードの「保存」は不要です)。', 'Leave feedback on the whole delivery or on a featured product. Saved right away (no need to press Save).')}
        </div>
      </div>
      {!cardId && <div className={styles.caption}>{t('配信カードを保存すると、コメントを付けられます。', 'Save the delivery card to add comments.')}</div>}
      {cardId && notes === null && <Spinner size="tiny" />}
      {error && <div className={styles.error}>{error}</div>}
      {comments.map((n) => (
        <div key={n.cr854_cardnoteid} className={mergeClasses(styles.card, !n.cr854_resolved && styles.cardOpen)} style={n.cr854_resolved ? { opacity: 0.75 } : undefined}>
          <div className={styles.meta}>
            <span>{`${n.cr854_author || t('(名前なし)', '(no name)')} · ${when(n.createdon)}`}</span>
            <Badge appearance="outline" color={n._cr854_product_value ? 'brand' : 'informative'} size="small">
              {n._cr854_product_value ? productName(n._cr854_product_value) : t('配信全体', 'Whole delivery')}
            </Badge>
          </div>
          <div className={styles.body}>{n.cr854_body}</div>
          {n.cr854_resolved ? (
            <>
              {(n.cr854_reply || n.cr854_repliedat) && (
                <div className={styles.fix}>
                  <div className={styles.meta}>{`${t('対応', 'Fix')} · ${n.cr854_repliedby || t('(名前なし)', '(no name)')} · ${when(n.cr854_repliedat)}`}</div>
                  {n.cr854_reply && <div className={styles.body}>{n.cr854_reply}</div>}
                </div>
              )}
              <div className={styles.actions}>
                <Badge appearance="tint" color="success" size="small" icon={<CheckmarkCircleRegular />}>{t('対応済み', 'Resolved')}</Badge>
                <Button size="small" appearance="subtle" disabled={busy} onClick={() => void reopen(n)}>{t('未対応に戻す', 'Reopen')}</Button>
              </div>
            </>
          ) : (
            <div className={styles.form}>
              <Textarea
                size="small"
                resize="vertical"
                placeholder={t('対応した内容(任意。例: 商品を差し替えた)', 'What was done (optional, e.g. swapped the product)')}
                value={fixes[n.cr854_cardnoteid] ?? ''}
                onChange={(_, d) => setFixes((x) => ({ ...x, [n.cr854_cardnoteid]: d.value }))}
              />
              <div className={styles.actions}>
                <Button size="small" appearance="primary" icon={<CheckmarkCircleRegular />} disabled={busy} onClick={() => void resolve(n)}>
                  {t('対応済みにする', 'Mark resolved')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      {cardId && notes && comments.length === 0 && <div className={styles.caption}>{t('まだコメントはありません。', 'No comments yet.')}</div>}
      {cardId && (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <Field label={t('コメントする人', 'Comment by')} size="small">
              <Input size="small" list="ccp-comment-people" value={author} onChange={(_, d) => setAuthor(d.value)} />
            </Field>
            <Field label={t('対象', 'About')} size="small">
              <Select size="small" value={target} onChange={(_, d) => setTarget(d.value)}>
                <option value="">{t('配信全体', 'Whole delivery')}</option>
                {targets.map((id) => (
                  <option key={id} value={id}>{productName(id)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <datalist id="ccp-comment-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <Textarea size="small" resize="vertical" placeholder={t('レビューの指摘(例: 前日のメールと商品がかぶっている)', 'Review feedback (e.g. same products as the previous day)')} value={body} onChange={(_, d) => setBody(d.value)} />
          <div className={styles.actions}>
            <Button size="small" disabled={busy || !body.trim() || !author.trim()} onClick={() => void add()}>
              {t('コメントを追加', 'Add comment')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
