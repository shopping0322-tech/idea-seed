#!/usr/bin/env python3
"""Validate category JSON files and optionally refresh manifest hashes/counts."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("docs/manifest.json"))
    parser.add_argument(
        "--update",
        action="store_true",
        help="JSONの実データからcountとsha256を更新する",
    )
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    try:
        manifest = load_json(manifest_path)
    except (OSError, ValueError) as error:
        return fail(str(error))

    errors: list[str] = []
    if manifest.get("schemaVersion") != 1:
        errors.append("schemaVersionは1である必要があります")

    categories = manifest.get("categories")
    if not isinstance(categories, list) or not categories:
        errors.append("categoriesは空でない配列である必要があります")
        categories = []

    category_ids: set[str] = set()
    file_paths: set[str] = set()
    for category in categories:
        category_id = category.get("id")
        if not isinstance(category_id, str) or not category_id:
            errors.append("空のカテゴリIDがあります")
            continue
        if category_id in category_ids:
            errors.append(f"カテゴリIDが重複しています: {category_id}")
        category_ids.add(category_id)

        files = category.get("files")
        if not isinstance(files, list) or not files:
            errors.append(f"filesが空です: {category_id}")
            continue

        category_values: list[str] = []
        for file_info in files:
            relative_path = file_info.get("path")
            if not isinstance(relative_path, str) or not relative_path:
                errors.append(f"ファイルパスが不正です: {category_id}")
                continue
            if relative_path in file_paths:
                errors.append(f"ファイルパスが重複しています: {relative_path}")
            file_paths.add(relative_path)

            data_path = manifest_path.parent / relative_path
            try:
                raw = data_path.read_bytes()
                values = json.loads(raw)
            except (OSError, ValueError) as error:
                errors.append(f"{relative_path}: {error}")
                continue

            if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
                errors.append(f"文字列配列ではありません: {relative_path}")
                continue
            empty = [value for value in values if not value.strip()]
            if empty:
                errors.append(f"空文字列があります: {relative_path}")

            digest = hashlib.sha256(raw).hexdigest()
            if args.update:
                file_info["count"] = len(values)
                file_info["sha256"] = digest
            else:
                if file_info.get("count") != len(values):
                    errors.append(f"countが一致しません: {relative_path}")
                if str(file_info.get("sha256", "")).lower() != digest:
                    errors.append(f"sha256が一致しません: {relative_path}")
            category_values.extend(values)

        if len(set(category_values)) != len(category_values):
            errors.append(f"カテゴリ内に重複があります: {category_id}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    if args.update:
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"更新しました: {manifest_path}")
    else:
        print(f"検証OK: {len(categories)}カテゴリ")
    return 0


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
