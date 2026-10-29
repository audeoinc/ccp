// 機能の公開・非公開(X87)の表の型。列を変えたら、server/schema.json と一緒に直す。
// feature_settings = 機能ごとの上書き(行がなければ、コードの版・版に従う)。版ごとの公開は featureVersions.ts、記録は featureLogs.ts

/** 機能ごとの上書き: 版に従う / 止める(不具合のときなど)/ 先に出す */
export const FeatureMode = {
  follow: '版に従う',
  stop: '止める',
  early: '先に出す',
} as const
export type FeatureMode = keyof typeof FeatureMode

/** 書き込める列 */
export interface FeatureSettingFields {
  feature_id: string
  /** 段 ① の形の名残(読まない) */
  enabled?: number
  changed_by?: string
  /** 付け替えた版(空ならコードの値) */
  version?: string
  mode?: FeatureMode
  /** 止める・先に出すときの理由 */
  reason?: string
}

/** 読んだ 1 行 */
export interface FeatureSetting extends FeatureSettingFields {
  id: string
  modified_on?: string
}
