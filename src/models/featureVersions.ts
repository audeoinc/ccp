// 表 feature_versions(版ごとの公開。X87 の 3.1)の、1 行の型。列を変えたら、server/schema.json と一緒に直す

export interface FeatureVersionRowFields {
  version: string
  /** 1 = 公開 */
  published?: number
  changed_by?: string
}
export interface FeatureVersionRow extends FeatureVersionRowFields {
  id: string
  modified_on?: string
}
