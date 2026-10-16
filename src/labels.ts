import {
  ProductCategory,
  ProductSalesTrend,
  ProductSeason,
  ProductWeather,
  type Product,
} from './models/products'
import { HeroImagePurpose, HeroImageSeason, type HeroImage } from './models/heroImages'

// 選択肢の表示名(○○_name の項目)は、値から求める
const pick = (map: Record<string, string>, value?: string, name?: string) => name || (value === undefined ? undefined : map[value])

export function withProductLabels(p: Product): Product {
  return {
    ...p,
    category_name: pick(ProductCategory, p.category, p.category_name),
    sales_trend_name: pick(ProductSalesTrend, p.sales_trend, p.sales_trend_name),
    season_name: pick(ProductSeason, p.season, p.season_name),
    weather_name: pick(ProductWeather, p.weather, p.weather_name),
  }
}

export function withHeroLabels(h: HeroImage): HeroImage {
  return {
    ...h,
    purpose_name: pick(HeroImagePurpose, h.purpose, h.purpose_name),
    season_name: pick(HeroImageSeason, h.season, h.season_name),
  }
}
