// 撮影・デモ用: 設定の健康診断(src/data/health.ts)の身代わり。見本の結果(足りない・失敗・注意を 1 つずつ含む)を返す
import type { HealthItem, HealthService as Real } from '../data/health'

const ITEMS: HealthItem[] = [
  { area: 'net', status: 'ok', text: 'サーバーから外(インターネット)に出られます', fix: '', goto: '' },
  { area: 'db', status: 'ok', text: 'つながりました(PostgreSQL 16.4)。DATABASE_URL(scheme=postgresql+asyncpg host=localhost port=5432 db=ccp user=ccp)', fix: '', goto: '' },
  { area: 'google', status: 'ok', text: 'Google の認証: このサーバーのアカウント / プロジェクト sample-project / 場所 global', fix: '', goto: '' },
  { area: 'ai', status: 'ok', text: 'Gemini(gemini-3.5-flash) を呼べました(1.4 秒。DB の設定)', fix: '', goto: '' },
  { area: 'bq', status: 'ok', text: '商品(SPU): sample-project.ccp_export.spu(列は仕様どおり)', fix: '', goto: '' },
  { area: 'bq', status: 'failed', text: 'SKU: 必須の列がありません(color_name)', fix: 'BigQuery の出力で、BIGQUERY_EXPORT.md の列名に AS で合わせる', goto: 'dataimport' },
  { area: 'bq', status: 'warn', text: '場所のない出力: 販売チャネルごとの順位(取り込みません)', fix: '使うなら ⚙ →「データの取り込み」で場所を入れる', goto: 'dataimport' },
  { area: 'sync', status: 'ok', text: '定期の取り込み: 入', fix: '', goto: '' },
  { area: 'sync', status: 'failed', text: 'SKU: 止めています(SKU の 31 行が、どの商品(SPU)にも当たりません)。最後に取り込めたのは 2026-11-02 10:12', fix: '⚙ →「データの取り込み」で、その行の理由を見る', goto: 'dataimport' },
  { area: 'assets', status: 'missing', text: '写真の場所(ASSET_DIR=/home/jupyter/ccp-images)に写真がありません', fix: '引っ越し用のパックを取り込む(import-pack)', goto: '' },
  { area: 'guard', status: 'warn', text: '画面にパスワードも、手前のログインもありません', fix: 'Workbench の中継など、内側からしか開けないなら、このままでよい。外から開けるなら APP_PASSWORD を設定する', goto: 'secrets' },
  { area: 'static', status: 'ok', text: '画面のビルドがあります(/home/jupyter/ccp/dist-gcp)', fix: '', goto: '' },
]
const counts = () => ({ ok: 0, missing: 0, failed: 0, warn: 0, ...Object.fromEntries((['ok', 'missing', 'failed', 'warn'] as const).map((s) => [s, ITEMS.filter((i) => i.status === s).length])) })

export const HealthService: typeof Real = {
  check: async () => {
    await new Promise((r) => setTimeout(r, 1200))
    return { data: { items: ITEMS, counts: counts(), checkedAt: Date.now() / 1000 } }
  },
  summary: async () => ({ data: counts() }),
}
