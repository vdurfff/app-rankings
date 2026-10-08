import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const appstore = require("app-store-scraper");

// ---------- 1. 地区与国家（每个 region 2-3 个人口最大 / 最具代表性的市场） ----------
// 格式: region -> [[国家代码, 关键词语言], ...]
const MARKETS = {
  "North America":   [["us", "en"], ["ca", "en"]],
  "Latin America":   [["br", "pt"], ["mx", "es"], ["co", "es"]],
  "Western Europe":  [["de", "de"], ["gb", "en"], ["fr", "fr"]],
  "Southern Europe": [["it", "it"], ["es", "es"]],
  "Eastern Europe":  [["ru", "ru"], ["pl", "pl"], ["ua", "uk"]],
  "East Asia":       [["cn", "zh"], ["jp", "ja"], ["kr", "ko"]],
  "South Asia":      [["in", "hi"], ["pk", "en"], ["np", "en"]],
  "Southeast Asia":  [["id", "id"], ["ph", "en"], ["vn", "vi"]],
  "Middle East":     [["tr", "tr"], ["sa", "ar"], ["ae", "ar"]],
  "Africa":          [["ng", "en"], ["eg", "ar"], ["za", "en"]],
  "Oceania":         [["au", "en"], ["nz", "en"]],
};

// ---------- 2. 各语言的食谱关键词（始终附带英文关键词） ----------
const KEYWORDS = {
  en: "recipe|cook|meal plan|meal prep",
  de: "rezept|kochen|backen",
  fr: "recette|cuisine|cuisiner",
  es: "receta|cocina|cocinar",
  it: "ricett|cucina|cucinare",
  pt: "receita|culinária|cozinha",
  pl: "przepis|gotowan|kuchni",
  ru: "рецепт|кулинар|готов",
  uk: "рецепт|кулінар|готув",
  tr: "tarif|yemek",
  ja: "レシピ|料理|クッキング",
  ko: "레시피|요리",
  zh: "食谱|菜谱|烹饪|料理|做饭",
  hi: "रेसिपी|व्यंजन|खाना",
  id: "resep|masak",
  vi: "công thức|nấu ăn|món ăn",
  ar: "وصفات|وصفة|طبخ",
};
const reFor = (lang) => new RegExp(`${KEYWORDS[lang]}|${KEYWORDS.en}`, "i");

// ---------- 3. 其他设置 ----------
const CHARTS = { free: "TOP_FREE_IOS", grossing: "TOP_GROSSING_IOS" };
const NUM = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const names = Object.fromEntries(
  JSON.parse(fs.readFileSync("apple-app-store-countries.json", "utf8")).map(
    (c) => [c.country_code, c.country_name]
  )
);

// ---------- 4. 抓取 ----------
const raw = [];      // 完整记录（含美食分类榜单中的原始位置，便于核对）
const failed = [];   // 失败记录：区分“没有数据”和“抓取失败”

for (const [region, countries] of Object.entries(MARKETS)) {
  for (const [code, lang] of countries) {
    const re = reFor(lang);
    for (const [chartKey, chartName] of Object.entries(CHARTS)) {
      try {
        const apps = await appstore.list({
          category: appstore.category.FOOD_AND_DRINK,
          collection: appstore.collection[chartName],
          country: code,
          num: NUM,
          fullDetail: true, // 返回 reviews / score 等详情字段
        });
        if (!apps.length) failed.push({ code, chartKey, reason: "empty result" });
        if (apps.length && apps[0].reviews === undefined)
          console.error(`${code} ${chartKey}: WARNING reviews field missing, check field names`);

        // 先在美食分类榜单里筛出食谱类，再按原有顺序重新编号 -> recipe rank
        let recipeRank = 0;
        apps.forEach((a, i) => {
          if (re.test(`${a.title} ${a.description}`)) {
            recipeRank += 1;
            raw.push({
              id: a.id,
              name: a.title,
              country: names[code] ?? code,
              country_code: code,
              region,
              chart: chartKey,
              rank: recipeRank,          // 食谱类应用中的排名
              food_chart_position: i + 1, // 在整个美食分类榜里的位置（参考用）
              developer: a.developer,
              score: a.score,
              reviews: a.reviews,
              reviews_current_version: a.currentVersionReviews,
              description: a.description,
            });
          }
        });
        console.error(`${code} ${chartKey}: ${recipeRank} recipe apps / ${apps.length}`);
      } catch (e) {
        failed.push({ code, chartKey, reason: e.message });
        console.error(`${code} ${chartKey}: FAILED ${e.message}`);
      }
      await sleep(2000);
    }
  }
}

// ---------- 5. 输出 ----------
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const DESC_MAX = 300; // CSV 里 description 最多保留的字符数；完整文本在 recipe_raw.json
const cleanDesc = (s) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim(); // 换行/多空格压成一个空格
  return t.length > DESC_MAX ? t.slice(0, DESC_MAX) + "…" : t;
};
const toCsv = (rows) =>
  ["id,name,country,region,rank,reviews,score,reviews_current_version,description"]
    .concat(
      rows.map((r) =>
        [
          r.id, r.name, r.country, r.region, r.rank,
          r.reviews, r.score, r.reviews_current_version,
          cleanDesc(r.description),
        ]
          .map(csvCell)
          .join(",")
      )
    )
    .join("\n");

for (const chartKey of Object.keys(CHARTS)) {
  const rows = raw.filter((r) => r.chart === chartKey);
  fs.writeFileSync(`recipe_dataset_${chartKey}.csv`, "\uFEFF" + toCsv(rows)); // BOM 防止 Excel 中文乱码
}
fs.writeFileSync("recipe_raw.json", JSON.stringify(raw, null, 2));
fs.writeFileSync("recipe_failed.json", JSON.stringify(failed, null, 2));
console.error(`done: ${raw.length} rows, ${failed.length} failures`);
