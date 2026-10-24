// 画面の状態を URL に持たせる(ディープリンク。X36)。
// 開いている面・見せ方・日付・フロート(配信カード・詳しい結果・アラート・制作のページ)・国を、URL のクエリと行き来させる。
// URL を送れば、受け取った人が同じ状態で開ける。ブラウザの「戻る」でフロートが閉じ、再読み込みしても開いたまま。
// クエリだけを使う(パスは変えない)ので、Workbench の中継(…/proxy/<ポート>/)の下でも、サーバーを変えずに動く
import { ymd } from './dates'

/** 画面の中の面の名前(App の page)と、URL での名前 */
export type Page = 'calendar' | 'production' | 'results' | 'alerts'
export type LinkView = 'month' | 'week' | 'list' | 'compare' | 'products' | 'impact'

export interface LinkState {
  page: Page
  view?: LinkView
  /** 表示中の期間(週は日曜日、月・一覧はその月の 1 日)。YYYY-MM-DD */
  date?: string
  /** 開いている配信カード(配信の id)と、開いている工程のタブ */
  card?: string
  tab?: string
  /** 詳しい結果(配信の id) */
  result?: string
  /** アラートのフロート。'' = 開いて、商品は選ばない / 商品の id = その商品を選んで開く / undefined = 閉じている */
  alerts?: string
  /** 制作のページ(配信の id) */
  production?: string
  /** 国('' = すべての国) */
  country?: string
  /** 見せ方「商品」の期間(YYYY-MM-DD。X49) */
  from?: string
  to?: string
}

const PAGE_TO_URL: Record<Page, string> = { calendar: 'plan', production: 'production', results: 'results', alerts: 'alerts' }
const URL_TO_PAGE: Record<string, Page> = { plan: 'calendar', production: 'production', results: 'results', alerts: 'alerts' }
const VIEWS: LinkView[] = ['month', 'week', 'list', 'compare', 'products', 'impact']

/** URL のクエリを読む。知らない値は無視する(古いリンク・手で書き換えたリンクでも、開ける所まで開く) */
export function parseLink(search: string): Partial<LinkState> {
  const q = new URLSearchParams(search)
  const out: Partial<LinkState> = {}
  const page = URL_TO_PAGE[q.get('page') ?? '']
  if (page) out.page = page
  const view = q.get('view') as LinkView | null
  if (view && VIEWS.includes(view)) out.view = view
  const date = q.get('date')
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date
  for (const k of ['from', 'to'] as const) {
    const v = q.get(k)
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v
  }
  for (const k of ['card', 'tab', 'result', 'production'] as const) {
    const v = q.get(k)
    if (v) out[k] = v
  }
  if (q.has('alerts')) out.alerts = q.get('alerts') === '1' ? '' : (q.get('alerts') ?? '')
  if (q.has('country')) out.country = q.get('country') === 'all' ? '' : (q.get('country') ?? '')
  return out
}

/** 状態から URL のクエリを作る(既定の値は書かない。短く、読めるように) */
export function linkSearch(s: LinkState): string {
  const q = new URLSearchParams()
  if (s.page !== 'calendar') q.set('page', PAGE_TO_URL[s.page])
  if (s.view) q.set('view', s.view)
  if (s.date && s.view !== 'products') q.set('date', s.date)
  if (s.view === 'products' && s.from && s.to) {
    q.set('from', s.from)
    q.set('to', s.to)
  }
  if (s.country !== undefined) q.set('country', s.country || 'all')
  if (s.card) q.set('card', s.card)
  if (s.card && s.tab) q.set('tab', s.tab)
  if (s.result) q.set('result', s.result)
  if (s.production) q.set('production', s.production)
  if (s.alerts !== undefined) q.set('alerts', s.alerts || '1')
  const text = q.toString()
  return text ? `?${text}` : ''
}

/** フロートが開いているか(新しく開いたときは、「戻る」で閉じられるよう、履歴に積む) */
export const hasFloat = (s: Partial<LinkState>) => !!(s.card || s.result || s.production || s.alerts !== undefined)

/** 日付の文字(YYYY-MM-DD)をその日の 0 時に。書式が違えば undefined */
export function dateOf(text?: string): Date | undefined {
  if (!text) return undefined
  const [y, m, d] = text.split('-').map(Number)
  const v = new Date(y, m - 1, d)
  return Number.isNaN(v.getTime()) ? undefined : v
}

export const dateText = ymd
