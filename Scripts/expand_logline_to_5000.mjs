import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDirectory = path.join(root, "docs", "logline");
const manifestPath = path.join(dataDirectory, "manifest.json");

const targets = {
  protagonists: 1200,
  desires: 800,
  daily_triggers: 1200,
  phenomena: 1000,
  settings: 700,
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const unique = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

async function categoryValues(category) {
  const groups = await Promise.all(category.files
    .filter((file) => !file.path.endsWith("_volume.json"))
    .map((file) => readJson(path.join(dataDirectory, file.path))));
  return groups.flat();
}

function takeNew(existing, candidates, count, categoryId) {
  const used = new Set(existing);
  const result = [];
  for (const candidate of unique(candidates)) {
    if (used.has(candidate)) continue;
    used.add(candidate);
    result.push(candidate);
    if (result.length === count) return result;
  }
  throw new Error(`${categoryId}: 候補不足 ${result.length}/${count}`);
}

function combinations(left, right, formatter) {
  return left.flatMap((a) => right.map((b) => formatter(a, b)));
}

const professionalContexts = [
  "夜勤中の", "退職を控えた", "故郷へ戻った", "家族と疎遠になった", "離婚したばかりの",
  "一人暮らしの", "秘密を抱えた", "失踪事件を追う", "仕事を辞めようとしている", "大きな失敗を隠している",
  "家族を亡くした", "町へ赴任したばかりの", "長期休職から復帰した", "余命を告げられた", "過去の事件を忘れられない",
];

const excludedRoleWords = /^(父|母|兄|姉|弟|妹|祖父|祖母|息子|娘|子供|大人|老人|夫|妻|恋人|友人|親友|同級生|同僚|上司|部下|先輩|後輩|隣人|大家|管理人|客|店員|学生|小学生|中学生|高校生|大学生|留学生|浪人生|泥棒|詐欺師|犯人|被害者|目撃者|容疑者|証人|観光客|旅人|ホームレス|酔っ払い|迷子|赤ん坊|妊婦|新郎|新婦|喪主|参列者|遺族|親戚|大家族|一人暮らし|未亡人|孤児|養子|保護者)$/;

async function protagonistCandidates() {
  const roles = await readJson(path.join(root, "docs", "who.json"));
  const contextualRoles = roles.filter((role) => !excludedRoleWords.test(role) && [...role].length >= 2);
  return [
    ...roles,
    ...combinations(professionalContexts, contextualRoles, (context, role) => `${context}${role}`),
  ];
}

const dailyContexts = [
  "朝起きてすぐ", "出かける前に", "仕事の休憩中に", "帰宅してすぐ", "寝る前に",
  "深夜に一人で", "家族が眠った後に", "休日の朝に", "雨の日に", "停電した後に",
];

function dailyTriggerCandidates(existing) {
  const usable = existing.filter((value) => !/^(深夜に|朝起きて|出かける前|仕事の休憩中|帰宅して|寝る前|家族が眠った|休日の朝|雨の日|停電した)/.test(value));
  return combinations(dailyContexts, usable, (context, action) => `${context}${action}`);
}

const people = [
  "家族", "子ども", "両親", "母親", "父親", "兄弟", "姉妹", "配偶者", "恋人", "親友",
  "恩人", "教え子", "患者", "同僚", "町の住人", "事件の被害者", "行方不明者", "自分を信じた人", "自分を裏切った人", "唯一の生存者",
];
const truths = [
  "家族の死の真相", "自分の出生の真相", "町で起きた失踪事件の真相", "事故が起きた本当の理由", "家に隠された過去",
  "親が残した遺言の意味", "自分だけが生き残った理由", "消された一日の出来事", "毎晩見る夢の意味", "自分の記憶が正しいかどうか",
  "家族写真にいる人物の正体", "閉鎖された施設の過去", "町が恐れているものの正体", "死者が伝えようとしていること", "繰り返される事件の原因",
  "自分と同じ顔の人物の正体", "子どもが隠していること", "家族が自分を避ける理由", "誰が嘘をついているのか", "怪異が始まった最初の日",
];
const secrets = [
  "過去に犯した罪", "家族の中にいる偽物", "自分が見た怪物", "事件現場から持ち帰った物", "死者から届く連絡",
  "自分だけが感染している事実", "子どもの本当の父親", "行方不明者の居場所", "事故を起こした人物", "家にある隠し部屋",
  "町で続く儀式", "自分の身体に起きた異変", "毎晩家を訪れる人物", "家族から消えた一人", "自分が死者である事実",
  "他人の記憶を持っていること", "未来から来たこと", "怪物と交わした約束", "呪いを別人へ移したこと", "自分が事件を繰り返していること",
];
const lostThings = [
  "家族との信頼", "失われた十年間", "子どもの頃の記憶", "奪われた名前", "元の顔",
  "自分の声", "眠ることのできる身体", "安全だった家", "町から消えた人々", "死者との最後の時間",
  "事件前の日常", "家族が覚えていた自分", "本来の人生", "奪われた将来", "失踪した友人",
  "自分の影", "現実へ戻る道", "人間だった頃の感情", "失われた一日", "家族の本当の姿",
];
const threats = [
  "家にいる怪物", "受け継いだ呪い", "終わらない夜", "同じ一日の繰り返し", "町に広がる感染",
  "家族へ近づく死者", "自分の身体を奪う人格", "毎晩続く悪夢", "人間のふりをしたもの", "過去から追ってくる人物",
  "自分と同じ顔の人間", "誰にも見えない追跡者", "子どもを呼ぶ声", "死者との約束", "終わっていない儀式",
  "家族を選ぶ怪異", "記憶を奪う現象", "町を囲む霧", "逃げ道を変える建物", "次の犠牲者を決める集団",
];

function desireCandidates() {
  return [
    ...combinations(people, ["守りたい", "救いたい", "取り戻したい"], (person, wish) => `${person}を${wish}`),
    ...people.map((person) => `${person}に真実を伝えたい`),
    ...people.map((person) => `${person}に自分を信じてほしい`),
    ...truths.map((value) => `${value}を知りたい`),
    ...truths.map((value) => `${value}を世間に知らせたい`),
    ...truths.map((value) => `${value}を自分の目で確かめたい`),
    ...secrets.map((value) => `${value}を隠し通したい`),
    ...secrets.map((value) => `${value}を家族に打ち明けたい`),
    ...secrets.map((value) => `${value}を墓場まで持っていきたい`),
    ...lostThings.map((value) => `${value}を取り戻したい`),
    ...lostThings.map((value) => `${value}を守り抜きたい`),
    ...lostThings.map((value) => `${value}を諦めたくない`),
    ...threats.map((value) => `${value}から逃げ切りたい`),
    ...threats.map((value) => `${value}を終わらせたい`),
    ...threats.map((value) => `${value}の正体を暴きたい`),
    ...people.map((value) => `${value}に許してほしい`),
    ...people.map((value) => `${value}から自由になりたい`),
    ...people.map((value) => `${value}に自分を覚えていてほしい`),
    ...people.map((value) => `${value}の期待に応えたい`),
    ...people.map((value) => `${value}との約束を果たしたい`),
    ...people.map((value) => `${value}に本当の自分を見てほしい`),
    ...people.map((value) => `${value}を自分の罪から遠ざけたい`),
    ...people.map((value) => `${value}より先に真相を知りたい`),
    ...truths.map((value) => `${value}を忘れたい`),
    ...secrets.map((value) => `${value}の証拠を消したい`),
    ...secrets.map((value) => `${value}を忘れてしまいたい`),
    ...lostThings.map((value) => `${value}を二度と失いたくない`),
    ...lostThings.map((value) => `${value}と引き換えに誰かを救いたい`),
    ...threats.map((value) => `${value}から家族を守りたい`),
    ...threats.map((value) => `${value}を止めるため自分を犠牲にしたい`),
  ];
}

const placeModifiers = [
  "閉鎖された", "取り壊し直前の", "深夜の", "停電した", "雪に閉ざされた", "住人が消えた",
  "立入禁止の", "地下にある", "海沿いの", "山奥の", "営業を終えた", "避難所になった",
];
const excludedPlaces = /^(家|部屋|車|店|道|海|川|湖|山|森|林|畑|島|町|村|都会|田舎|海外|屋内|屋外)$/;

async function settingCandidates() {
  const places = await readJson(path.join(root, "docs", "where.json"));
  const specificPlaces = places.filter((place) => !excludedPlaces.test(place) && [...place].length >= 2);
  return [
    ...places,
    ...combinations(placeModifiers, specificPlaces, (modifier, place) => `${modifier}${place}`),
  ];
}

const horrorConsequences = [
  "家族の記憶から一人ずつ消えていく",
  "背後にいるものが一歩ずつ近づく",
  "身体に知らない傷が一つ増える",
  "家の中に知らない人の気配が増える",
  "最も大切な人の顔を一人ずつ忘れる",
  "鏡の中の自分が別の行動を始める",
  "翌朝に同じ場所で死者が見つかる",
  "自分と同じ姿の人間が町に現れる",
  "死者から自分の名前を呼ばれる",
  "現実から出口が一つずつ消える",
];

function phenomenonCandidates(dailyTriggers) {
  return combinations(dailyTriggers, horrorConsequences, (trigger, consequence) => `${trigger}たびに${consequence}`);
}

async function main() {
  const manifest = await readJson(manifestPath);
  const byId = new Map(manifest.categories.map((category) => [category.id, category]));
  const current = {};
  for (const id of Object.keys(targets)) current[id] = await categoryValues(byId.get(id));

  const candidates = {
    protagonists: await protagonistCandidates(),
    desires: desireCandidates(),
    daily_triggers: dailyTriggerCandidates(current.daily_triggers),
    settings: await settingCandidates(),
  };
  candidates.phenomena = phenomenonCandidates(current.daily_triggers);

  for (const [id, target] of Object.entries(targets)) {
    const needed = target - current[id].length;
    if (needed <= 0) continue;
    const values = takeNew(current[id], candidates[id], needed, id);
    const filename = `${id}_volume.json`;
    const serialized = `${JSON.stringify(values, null, 2)}\n`;
    await writeFile(path.join(dataDirectory, filename), serialized, "utf8");
    const category = byId.get(id);
    category.files = category.files.filter((file) => file.path !== filename);
    category.version = Math.max(category.version, 4);
    category.files.push({
      path: filename,
      sha256: createHash("sha256").update(serialized).digest("hex"),
      count: values.length,
    });
  }

  manifest.dataVersion = "2026.07.20.3";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

await main();
