import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const loglineDirectory = path.join(root, "docs", "logline");
const manifest = JSON.parse(await readFile(path.join(loglineDirectory, "manifest.json"), "utf8"));

const mappings = [
  { categoryId: "protagonists", source: "who.json", output: "protagonists_scene_vocabulary.json" },
  { categoryId: "settings", source: "where.json", output: "settings_scene_vocabulary.json" },
];

for (const mapping of mappings) {
  const category = manifest.categories.find((item) => item.id === mapping.categoryId);
  if (!category) throw new Error(`カテゴリがありません: ${mapping.categoryId}`);

  const existingGroups = await Promise.all(category.files.map(async (file) => (
    JSON.parse(await readFile(path.join(loglineDirectory, file.path), "utf8"))
  )));
  const existing = new Set(existingGroups.flat());
  const source = JSON.parse(await readFile(path.join(root, "docs", mapping.source), "utf8"));
  const values = source.filter((value) => !existing.has(value));

  if (values.length !== new Set(values).size) throw new Error(`重複があります: ${mapping.output}`);
  await writeFile(path.join(loglineDirectory, mapping.output), `${JSON.stringify(values, null, 2)}\n`, "utf8");
}
