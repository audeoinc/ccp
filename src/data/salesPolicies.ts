// 表 sales_policies(販売系の方針)の読み込み。書き込みは、サーバーの取り込み(/api/policies)だけ。
import { makeService } from '../gcp/services'
import type { SalesPolicy } from '../models/salesPolicies'

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string }
}

const svc = makeService('sales_policies')

export const SalesPoliciesService = {
  getAll: (options?: { filter?: string; orderBy?: string[]; top?: number }) => svc.getAll(options) as Promise<Result<SalesPolicy[]>>,
}
