// 表 feature_logs(機能の公開・非公開の記録。X87 の 3.1)の、1 行の型。列を変えたら、server/schema.json と一緒に直す

export interface FeatureLogFields {
  /** 機能の ID か、版の公開なら version:v1 の形 */
  feature_id: string
  action?: 'retarget' | 'publish' | 'unpublish' | 'stop' | 'early' | 'follow'
  before_value?: string
  after_value?: string
  reason?: string
  actor?: string
}
export interface FeatureLog extends FeatureLogFields {
  id: string
  created_on?: string
}
