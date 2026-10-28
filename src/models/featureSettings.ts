// 表 feature_settings(機能の公開・非公開。X87)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// feature_id は src/features.ts の機能(大・中の id も入れられる)。'*' は、行のない機能の扱い

/** 書き込める列 */
export interface FeatureSettingFields {
  feature_id: string
  /** 1 = 公開 / 0 = 非公開 */
  enabled?: number
  changed_by?: string
}

/** 読んだ 1 行 */
export interface FeatureSetting extends FeatureSettingFields {
  id: string
  modified_on?: string
}
