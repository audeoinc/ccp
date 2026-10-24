import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dropdown, MessageBar, MessageBarBody, Option, SearchBox, Spinner, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular } from '@fluentui/react-icons'
import { appPath } from '../appRoot'
import { CopyButton } from './CopyButton'
import { DevApi, isFailure, type ImageKind, type ImageList, type ImageRow, type LinkState } from './api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 },
  bar: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  search: { width: '260px' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  counts: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, display: 'flex', gap: '12px', marginLeft: 'auto' },
  scroll: {
    overflow: 'auto',
    maxHeight: 'calc(100vh - 190px)',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: { borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, width: '100%' },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground3,
    textAlign: 'left',
    padding: '4px 8px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
    fontWeight: tokens.fontWeightSemibold,
  },
  td: { padding: '4px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, verticalAlign: 'top', maxWidth: '320px' },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  // URL は 1 行に切る(全文はマウスを載せると出る)
  url: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' },
  nowrap: { whiteSpace: 'nowrap' },
  clip: { overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' },
  // 文の列(説明・使われている所)は、細かく折り返さない幅を持たせる
  wide: { minWidth: '200px' },
  // 画像は切らずに全体を見せる(contain)。置いた枠より大きいものは、マウスを載せると大きく出す
  thumb: {
    width: '72px',
    height: '54px',
    objectFit: 'contain',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    display: 'block',
  },
  noImage: { width: '72px', height: '54px', display: 'grid', placeItems: 'center', color: tokens.colorNeutralForeground4, backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall },
  preview: {
    position: 'fixed',
    zIndex: 10,
    pointerEvents: 'none',
    maxWidth: '420px',
    maxHeight: '420px',
    objectFit: 'contain',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusMedium,
  },
  uses: { display: 'flex', flexDirection: 'column', gap: '2px' },
  unused: { color: tokens.colorNeutralForeground4 },
  sub: { color: tokens.colorNeutralForeground3 },
})

const KIND_LABEL: Record<ImageKind, string> = { heroes: 'メイン画像', parts: '部品の画像', creative: '素材', products: '商品画像' }
const LINK: Record<LinkState, { label: string; color: 'success' | 'danger' | 'informative' | 'subtle' | 'warning' }> = {
  ok: { label: 'あり', color: 'success' },
  missing: { label: '壊れたリンク', color: 'danger' },
  external: { label: '外の URL', color: 'informative' },
  empty: { label: '画像なし', color: 'subtle' },
  unknown: { label: '確かめられない', color: 'warning' },
}
const ROLE: Record<string, string> = { main: 'メイン', sub: 'サブ', master: '控え', master_main: 'マスタのメイン' }
type StateFilter = 'all' | 'missing' | 'external' | 'empty' | 'unused'
const STATE_LABEL: Record<StateFilter, string> = { all: 'すべて', missing: '壊れたリンク', external: '外の URL', empty: '画像なし', unused: '使われていない' }

/** 種類ごとに足す列(名前と、行から出す文字) */
const EXTRA: Record<ImageKind, { label: string; value: (r: ImageRow) => string; wide?: boolean }[]> = {
  heroes: [{ label: '画像コード', value: (r) => String(r.image_code ?? '') }],
  parts: [{ label: '種類', value: (r) => String(r.kind ?? '') }],
  creative: [],
  products: [
    { label: '商品コード', value: (r) => String(r.product_code ?? '') },
    { label: '役割', value: (r) => [ROLE[String(r.role)] ?? String(r.role ?? ''), r.angle ? String(r.angle) : ''].filter(Boolean).join(' / ') },
    { label: '説明', value: (r) => String(r.caption ?? ''), wide: true },
  ],
}

const day = (v?: string | null) => (v ? v.slice(0, 10) : '')
// 画像の URL: アプリの中のパス(/img/…)は、Workbench の中継(/proxy/<ポート>/)の下でも開けるように
const shown = (u?: string | null) => (u ? appPath(u) : '')

const usesText = (r: ImageRow) => r.used.map((u) => `${u.type === 'card' ? '配信' : 'テンプレート'}: ${u.name}${u.at ? `(${day(u.at)})` : ''}`).join(' / ')

function toTsv(kind: ImageKind, rows: ImageRow[]): string {
  const extra = EXTRA[kind]
  const head = ['ID', '名前', '市場', ...extra.map((e) => e.label), '使われている所', '登録元', '上げた人', '登録日', 'リンク', '画像の URL']
  const cell = (v: string) => v.replace(/[\t\r\n]+/g, ' ')
  return [head, ...rows.map((r) => [r.id, r.name ?? '', r.market ?? '', ...extra.map((e) => e.value(r)), usesText(r), r.origin ?? '', r.uploaded_by ?? '', day(r.created_on), LINK[r.link].label, r.image_url ?? ''])]
    .map((line) => line.map((v) => cell(String(v))).join('\t'))
    .join('\n')
}

/**
 * 開発用の画面の「画像の一覧」(docs/DEVTOOLS.md の 9 章。サーバーは ccp/devimages.py)。CCP が持つ画像を、種類ごとに 1 つの表で見る。
 * 見るだけ(直すのは CCP の画面で)。どこで使われているか・壊れたリンクがないかを、取り込みのあとなどに確かめるため
 */
export function ImagesTab() {
  const s = useStyles()
  const [kind, setKind] = useState<ImageKind>('heroes')
  // 「読み直す」のたびに増やす。読み終えた結果は、どの種類・何回目のものかを持つ(読み込み中かは、それと比べて決める)
  const [tick, setTick] = useState(0)
  const [got, setGot] = useState<{ key: string; data: ImageList | null; error: string } | null>(null)
  const [query, setQuery] = useState('')
  const [market, setMarket] = useState('')
  const [state, setState] = useState<StateFilter>('all')
  const [hover, setHover] = useState<{ src: string; x: number; y: number } | null>(null)

  const key = `${kind}:${tick}`
  useEffect(() => {
    let alive = true
    void DevApi.images(kind).then((r) => {
      if (alive) setGot(isFailure(r) ? { key: `${kind}:${tick}`, data: null, error: r.error } : { key: `${kind}:${tick}`, data: r, error: '' })
    })
    return () => {
      alive = false
    }
  }, [kind, tick])
  const loading = got?.key !== key
  // 読み直している間も、同じ種類の前の結果は出しておく
  const data = got?.data?.kind === kind ? got.data : null
  const error = got?.key === key ? got.error : ''

  const rows = useMemo(() => {
    const all = data?.kind === kind ? data.rows : []
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((r) => {
      if (market && r.market !== market) return false
      if (state === 'unused' ? r.used.length > 0 : state !== 'all' && r.link !== state) return false
      if (!words.length) return true
      const hay = [r.id, r.name, r.image_url, r.origin, r.uploaded_by, usesText(r), ...EXTRA[kind].map((e) => e.value(r))].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [data, kind, query, market, state])

  const all = data?.kind === kind ? data.rows : []
  const markets = [...new Set(all.map((r) => r.market).filter((m): m is string => !!m))].sort()
  const missing = all.filter((r) => r.link === 'missing').length
  const unused = all.filter((r) => r.used.length === 0).length

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <TabList size="small" selectedValue={kind} onTabSelect={(_, d) => setKind(d.value as ImageKind)}>
          {(Object.keys(KIND_LABEL) as ImageKind[]).map((k) => (
            <Tab key={k} value={k}>
              {KIND_LABEL[k]}
            </Tab>
          ))}
        </TabList>
        <SearchBox className={s.search} size="small" placeholder="名前・ID・コード・使われている所で探す" value={query} onChange={(_, d) => setQuery(d.value)} />
        <Dropdown size="small" style={{ minWidth: '110px' }} value={market || '市場: すべて'} selectedOptions={[market]} onOptionSelect={(_, d) => setMarket(d.optionValue ?? '')}>
          <Option value="">市場: すべて</Option>
          {markets.map((m) => (
            <Option key={m} value={m}>
              {m}
            </Option>
          ))}
        </Dropdown>
        <Dropdown size="small" style={{ minWidth: '140px' }} value={`状態: ${STATE_LABEL[state]}`} selectedOptions={[state]} onOptionSelect={(_, d) => setState((d.optionValue as StateFilter) ?? 'all')}>
          {(Object.keys(STATE_LABEL) as StateFilter[]).map((k) => (
            <Option key={k} value={k}>
              {STATE_LABEL[k]}
            </Option>
          ))}
        </Dropdown>
        <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={() => setTick((t) => t + 1)} disabled={loading}>
          読み直す
        </Button>
        <CopyButton label="TSV でコピー" title="スプレッドシートにそのまま貼れる形(いま絞り込んでいる行)" text={() => toTsv(kind, rows)} />
        {data?.kind === kind && (
          <span className={s.counts}>
            <span>
              {rows.length === all.length ? `${all.length} 件` : `${rows.length} / ${all.length} 件`}
              {data.truncated ? '(上限で切った)' : ''}
            </span>
            <span>壊れたリンク {missing}</span>
            <span>使われていない {unused}</span>
          </span>
        )}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {data?.note && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{data.note}</MessageBarBody>
        </MessageBar>
      )}
      {loading && !data && <Spinner size="small" label="読み込み中…" />}
      {data?.kind === kind && (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>画像</th>
                <th className={s.th}>名前 / ID</th>
                <th className={s.th}>市場</th>
                {EXTRA[kind].map((e) => (
                  <th key={e.label} className={s.th}>
                    {e.label}
                  </th>
                ))}
                <th className={s.th}>使われている所</th>
                <th className={s.th}>登録元</th>
                <th className={s.th}>登録日</th>
                <th className={s.th}>リンク</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={s.td}>
                    {r.image_url && r.link !== 'missing' ? (
                      <a href={shown(r.image_url)} target="_blank" rel="noreferrer">
                        <img
                          className={s.thumb}
                          src={shown(r.image_url)}
                          alt={r.name ?? ''}
                          loading="lazy"
                          onMouseEnter={(e) => setHover({ src: shown(r.image_url), x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                          onMouseLeave={() => setHover(null)}
                        />
                      </a>
                    ) : (
                      <span className={s.noImage}>—</span>
                    )}
                  </td>
                  <td className={s.td}>
                    <div>{r.name || <span className={s.unused}>(名前なし)</span>}</div>
                    <div className={s.mono}>{r.id}</div>
                    {r.image_url && (
                      <div className={s.url} title={r.image_url}>
                        {r.image_url}
                      </div>
                    )}
                  </td>
                  <td className={s.td}>{r.market ?? ''}</td>
                  {EXTRA[kind].map((e) => (
                    <td key={e.label} className={mergeClasses(s.td, e.wide ? s.wide : s.nowrap)}>
                      {e.value(r)}
                    </td>
                  ))}
                  <td className={mergeClasses(s.td, s.wide)}>
                    {r.used.length ? (
                      <div className={s.uses}>
                        {r.used.map((u) => (
                          <span key={`${u.type}-${u.id}`}>
                            <span className={s.sub}>{u.type === 'card' ? '配信' : 'テンプレート'}:</span> {u.name}
                            {u.at && <span className={s.sub}>({day(u.at)})</span>}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className={s.unused}>使われていない</span>
                    )}
                  </td>
                  <td className={mergeClasses(s.td, s.nowrap)}>
                    <div className={s.clip} title={r.origin ?? ''}>
                      {r.origin ?? ''}
                    </div>
                    {r.uploaded_by && <div className={s.sub}>{r.uploaded_by}</div>}
                  </td>
                  <td className={mergeClasses(s.td, s.nowrap)}>{day(r.created_on)}</td>
                  <td className={mergeClasses(s.td, s.nowrap)}>
                    <Badge appearance="tint" color={LINK[r.link].color}>
                      {LINK[r.link].label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hover && (
        <img
          className={s.preview}
          src={hover.src}
          alt=""
          // マウスの右下に出す。画面の端に近いときは、左・上に寄せる
          style={{ left: Math.min(hover.x + 16, window.innerWidth - 436), top: Math.min(hover.y + 16, window.innerHeight - 436) }}
        />
      )}
    </div>
  )
}
