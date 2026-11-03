// 表 app_settings(仕事の設定。BigQuery の出力の場所・AI のモデルなど)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// 読み書きは、サーバーの /api/settings(server/ccp/appsettings.py)だけ。画面は src/data/appSettings.ts で、まとめごとの値として扱う
export interface AppSettingFields {
  /** まとめ(bq / ai / bq.sync) */
  name: string
  /** 値(JSON) */
  value?: string
  changed_by?: string
  /** screen = 画面で変えた / env = 環境変数から一度だけ写した */
  source?: string
  /** 変えた項目の名前(JSON の配列) */
  changes?: string
}
