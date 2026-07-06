from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter


BASE_DIR = Path(__file__).resolve().parent
SOURCE_WORKBOOK = BASE_DIR / "数据源" / "化工百科.xlsx"
LITE_WORKBOOK = BASE_DIR / "组分表Lite.xlsx"
OUTPUT_WORKBOOK = BASE_DIR / "数据源" / "化工百科_已对齐.xlsx"
REVIEW_WORKBOOK = BASE_DIR / "数据源" / "化工百科_对齐复核清单.xlsx"


GREEK_TRANSLATE = str.maketrans(
    {
        "α": "alpha",
        "β": "beta",
        "γ": "gamma",
        "δ": "delta",
        "ε": "epsilon",
        "Α": "alpha",
        "Β": "beta",
        "Γ": "gamma",
        "Δ": "delta",
        "Ε": "epsilon",
    }
)

PUNCT_TRANSLATE = str.maketrans(
    {
        "（": "(",
        "）": ")",
        "，": ",",
        "；": ";",
        "：": ":",
        "－": "-",
        "—": "-",
        "‐": "-",
        "–": "-",
        "―": "-",
        "·": "",
        "・": "",
        "／": "/",
        "、": ";",
        "﹑": ";",
        "﹔": ";",
        "【": "[",
        "】": "]",
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
    }
)

LOOSE_RX = re.compile(r"[^0-9a-z\u4e00-\u9fff]+")
SEP_RX = re.compile(r"[;；,，/\\|]+")
LEADING_DESCRIPTOR_RX = re.compile(
    r"^(?:n,n|n|o|m|p|d|l|dl|r|s|rs|sr|alpha|beta|gamma|delta|epsilon|omega|\d+)+"
)


def strict_key(value: object) -> str | None:
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value)).translate(GREEK_TRANSLATE).translate(PUNCT_TRANSLATE)
    text = text.strip().lower()
    text = re.sub(r"\s+", "", text)
    return text or None


def loose_key(value: object) -> str | None:
    text = strict_key(value)
    if not text:
        return None
    text = LOOSE_RX.sub("", text)
    return text or None


def skeleton_key(value: object) -> str | None:
    text = loose_key(value)
    if not text:
        return None
    prev = None
    while prev != text:
        prev = text
        text = LEADING_DESCRIPTOR_RX.sub("", text)
    return text or None


def split_parts(value: object) -> list[str]:
    if value is None:
        return []
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if not text:
        return []
    return [part.strip() for part in SEP_RX.split(text) if part.strip()]


def strip_page_note(text: str) -> str:
    while True:
        new_text = re.sub(r"\(\d+页\)$", "", text)
        if new_text == text:
            return text
        text = new_text


def dedupe(values: Iterable[int]) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def to_int_id(value: object) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if value is None:
        raise ValueError("missing id")
    text = str(value).strip()
    if not text:
        raise ValueError("missing id")
    if re.fullmatch(r"\d+(\.0+)?", text):
        return int(float(text))
    return int(text)


@dataclass(frozen=True)
class LookupMaps:
    exact: dict[str, dict[str, list[int]]]
    loose: dict[str, dict[str, list[int]]]
    skeleton: dict[str, dict[str, list[int]]]


@dataclass
class Resolution:
    status: str
    chosen_id: int | None
    score: int
    runner_up: int
    path: str
    evidence: str
    candidates: list[int]


def build_lookup_maps() -> LookupMaps:
    wb = load_workbook(LITE_WORKBOOK, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers = [ws.cell(2, c).value for c in range(1, ws.max_column + 1)]
    index = {header: i + 1 for i, header in enumerate(headers) if header}

    categories = ("cn_name", "cn_alias", "en_name", "en_alias", "iupac", "cas")
    exact: dict[str, dict[str, list[int]]] = {cat: defaultdict(list) for cat in categories}
    loose: dict[str, dict[str, list[int]]] = {cat: defaultdict(list) for cat in categories}
    skeleton: dict[str, dict[str, list[int]]] = {cat: defaultdict(list) for cat in categories}

    for row in ws.iter_rows(min_row=3, values_only=True):
        comp_id = to_int_id(row[index["nPCdataCompID"] - 1])
        field_values = {
            "cn_name": [row[index["sCompNameCN"] - 1]],
            "cn_alias": split_parts(row[index["sCompNameCNAliasList"] - 1]),
            "en_name": [row[index["sCompName"] - 1]],
            "en_alias": split_parts(row[index["sCompNameAliasList"] - 1]),
            "iupac": [row[index["sIUPACName"] - 1]],
            "cas": [row[index["sCASNo"] - 1]],
        }
        for cat, values in field_values.items():
            for value in values:
                ek = strict_key(value)
                lk = loose_key(value)
                sk = skeleton_key(value)
                if ek:
                    exact[cat][ek].append(comp_id)
                if lk:
                    loose[cat][lk].append(comp_id)
                if sk:
                    skeleton[cat][sk].append(comp_id)

    for mapping in (exact, loose, skeleton):
        for cat in mapping:
            for key, values in list(mapping[cat].items()):
                mapping[cat][key] = dedupe(values)

    return LookupMaps(exact=exact, loose=loose, skeleton=skeleton)


def extract_redirect_targets(description: object) -> list[str]:
    if not isinstance(description, str):
        return []
    text = strict_key(description)
    if not text:
        return []

    targets: list[str] = []
    for match in re.finditer(r"(见|又称|亦称|简称|俗称|通常称|指见|称)", text):
        remainder = text[match.end() :]
        remainder = re.split(r"[。.!?？!]", remainder, 1)[0]
        for part in SEP_RX.split(remainder):
            token = strict_key(part)
            if not token:
                continue
            token = strip_page_note(token)
            token = token.rstrip("。.").strip()
            if token and token not in targets:
                targets.append(token)
    return targets


def split_english_tokens(value: object) -> list[str]:
    if value is None:
        return []
    parts = []
    for part in split_parts(value):
        if not part:
            continue
        parts.append(part)
    return parts


def source_redirect_closure(term_key: str, source_index: dict[str, list[tuple[int, object]]], depth: int = 0) -> set[str]:
    out = {term_key}
    for _, desc in source_index.get(term_key, []):
        for target in extract_redirect_targets(desc):
            if target not in out:
                out.add(target)
                if target in source_index and depth < 6:
                    out |= source_redirect_closure(target, source_index, depth + 1)
    return out


def candidate_scores(token: object, maps: LookupMaps) -> dict[int, tuple[int, str]]:
    scores: dict[int, tuple[int, str]] = {}
    variants = [
        (strict_key(token), "exact"),
        (loose_key(token), "loose"),
        (skeleton_key(token), "skeleton"),
    ]
    score_table = {
        ("exact", "cas"): 120,
        ("exact", "cn_name"): 100,
        ("exact", "cn_alias"): 96,
        ("exact", "en_name"): 92,
        ("exact", "en_alias"): 88,
        ("exact", "iupac"): 84,
        ("loose", "cas"): 110,
        ("loose", "cn_name"): 82,
        ("loose", "cn_alias"): 78,
        ("loose", "en_name"): 74,
        ("loose", "en_alias"): 70,
        ("loose", "iupac"): 66,
        ("skeleton", "cas"): 105,
        ("skeleton", "cn_name"): 72,
        ("skeleton", "cn_alias"): 68,
        ("skeleton", "en_name"): 64,
        ("skeleton", "en_alias"): 60,
        ("skeleton", "iupac"): 56,
    }
    for key, mode in variants:
        if not key:
            continue
        mapping = getattr(maps, mode)
        for cat in ("cas", "cn_name", "cn_alias", "en_name", "en_alias", "iupac"):
            candidates = mapping[cat].get(key)
            if not candidates:
                continue
            base_score = score_table[(mode, cat)]
            for comp_id in candidates:
                prev = scores.get(comp_id)
                if prev is None or base_score > prev[0]:
                    scores[comp_id] = (base_score, f"{mode}:{cat}:{key}")
    return scores


def resolve_row(term: object, english: object, description: object, maps: LookupMaps, source_index: dict[str, list[tuple[int, object]]]) -> Resolution:
    # Gather tokens from the row itself and from source redirects.
    tokens: list[str] = []
    term_key = strict_key(term)
    if term_key:
        tokens.append(term_key)
        tokens.append(loose_key(term_key) or "")
        tokens.append(skeleton_key(term_key) or "")
        tokens.extend(source_redirect_closure(term_key, source_index))

    for part in split_english_tokens(english):
        tokens.append(strict_key(part) or "")
        tokens.append(loose_key(part) or "")
        tokens.append(skeleton_key(part) or "")

    for target in extract_redirect_targets(description):
        tokens.append(target)
        if target in source_index:
            tokens.extend(source_redirect_closure(target, source_index))

    tokens = [tok for tok in tokens if tok]
    deduped: list[str] = []
    seen = set()
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        deduped.append(token)

    scores: dict[int, int] = {}
    evidence: dict[int, list[str]] = defaultdict(list)
    for token in deduped:
        token_scores = candidate_scores(token, maps)
        bonus = 3 if token in source_index else 0
        for comp_id, (score, source) in token_scores.items():
            total = score + bonus
            prev = scores.get(comp_id)
            if prev is None or total > prev:
                scores[comp_id] = total
                evidence[comp_id] = [source]
            elif total == prev and source not in evidence[comp_id]:
                evidence[comp_id].append(source)

    if not scores:
        return Resolution("unmatched", None, 0, 0, "", "", [])

    ranked = sorted(scores.items(), key=lambda item: (item[1], -item[0]), reverse=True)
    top_id, top_score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    top_candidates = [comp_id for comp_id, score in ranked if score == top_score]

    # Aggressive acceptance: accept a strong top candidate even when there are ties,
    # but preserve a review record for very close runners-up.
    if top_score >= 45 or (top_score >= 30 and top_score - runner_up >= 5):
        status = "matched"
        path = ";".join(evidence[top_id][:4])
        return Resolution(status, top_id, top_score, runner_up, path, ";".join(deduped[:8]), top_candidates)

    return Resolution("ambiguous", None, top_score, runner_up, "", ";".join(deduped[:8]), top_candidates)


def format_attempts(evidence: str, candidates: list[int]) -> str:
    cand_text = ",".join(map(str, candidates[:20]))
    return f"{evidence} => {cand_text}"


def style_sheet(ws, widths: list[int]) -> None:
    ws.freeze_panes = "A2"
    header_font = Font(bold=True)
    for cell in ws[1]:
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")

    if not SOURCE_WORKBOOK.exists():
        raise FileNotFoundError(f"Missing source workbook: {SOURCE_WORKBOOK}")
    if not LITE_WORKBOOK.exists():
        raise FileNotFoundError(f"Missing lite workbook: {LITE_WORKBOOK}")

    maps = build_lookup_maps()

    source_wb = load_workbook(SOURCE_WORKBOOK)
    source_ws = source_wb["保留"]

    source_index: dict[str, list[tuple[int, object]]] = defaultdict(list)
    source_rows: list[tuple[int, object, object, object, object]] = []
    for row_idx in range(2, source_ws.max_row + 1):
        seq = source_ws.cell(row_idx, 1).value
        term = source_ws.cell(row_idx, 2).value
        english = source_ws.cell(row_idx, 3).value
        description = source_ws.cell(row_idx, 4).value
        source_rows.append((row_idx, seq, term, english, description))
        key = strict_key(term)
        if key:
            source_index[key].append((row_idx, description))

    stats = Counter()
    matched_rows: list[list[object]] = []
    ambiguous_rows: list[list[object]] = []
    unmatched_rows: list[list[object]] = []
    conflict_rows: list[list[object]] = []

    for row_idx, seq, term, english, description in source_rows:
        if row_idx == 2:
            continue

        target_cell = source_ws.cell(row_idx, 6)
        current_value = target_cell.value
        resolution = resolve_row(term, english, description, maps, source_index)

        if resolution.status == "matched":
            stats["matched"] += 1
            resolved_id = resolution.chosen_id
            assert resolved_id is not None
            if current_value not in (None, ""):
                existing_id = to_int_id(current_value)
                if existing_id != resolved_id:
                    conflict_rows.append(
                        [
                            row_idx,
                            seq,
                            term,
                            english,
                            description,
                            existing_id,
                            resolved_id,
                            resolution.score,
                            resolution.runner_up,
                            resolution.path,
                            resolution.evidence,
                        ]
                    )
                else:
                    target_cell.value = existing_id
            else:
                target_cell.value = resolved_id

            matched_rows.append(
                [
                    row_idx,
                    seq,
                    term,
                    english,
                    description,
                    resolved_id,
                    resolution.score,
                    resolution.runner_up,
                    resolution.path,
                    format_attempts(resolution.evidence, resolution.candidates),
                ]
            )
        elif resolution.status == "ambiguous":
            stats["ambiguous"] += 1
            ambiguous_rows.append(
                [
                    row_idx,
                    seq,
                    term,
                    english,
                    description,
                    ",".join(map(str, resolution.candidates)),
                    resolution.score,
                    resolution.runner_up,
                    format_attempts(resolution.evidence, resolution.candidates),
                ]
            )
        else:
            stats["unmatched"] += 1
            unmatched_rows.append(
                [
                    row_idx,
                    seq,
                    term,
                    english,
                    description,
                    resolution.evidence,
                ]
            )

    source_wb.save(OUTPUT_WORKBOOK)

    review_wb = Workbook()
    stats_ws = review_wb.active
    stats_ws.title = "统计"
    stats_ws.append(["项目", "数量"])
    stats_ws.append(["已匹配", stats["matched"]])
    stats_ws.append(["歧义", stats["ambiguous"]])
    stats_ws.append(["未命中", stats["unmatched"]])
    stats_ws.append(["写入冲突", len(conflict_rows)])
    stats_ws.append(["输出文件", str(OUTPUT_WORKBOOK)])
    stats_ws.append(["源文件", str(SOURCE_WORKBOOK)])
    stats_ws.append(["主数据源", str(LITE_WORKBOOK)])
    style_sheet(stats_ws, [18, 18])

    amb_ws = review_wb.create_sheet("歧义")
    amb_ws.append(["行号", "序号", "中文词条", "英文名", "中文解释", "候选nPCdataCompID", "最高分", "次高分", "命中过程"])
    for row in ambiguous_rows:
        amb_ws.append(row)
    style_sheet(amb_ws, [10, 10, 18, 24, 60, 28, 12, 12, 90])

    miss_ws = review_wb.create_sheet("未命中")
    miss_ws.append(["行号", "序号", "中文词条", "英文名", "中文解释", "命中过程"])
    for row in unmatched_rows:
        miss_ws.append(row)
    style_sheet(miss_ws, [10, 10, 18, 24, 60, 90])

    if conflict_rows:
        conflict_ws = review_wb.create_sheet("冲突")
        conflict_ws.append(["行号", "序号", "中文词条", "英文名", "中文解释", "原值", "拟写入值", "最高分", "次高分", "命中过程", "证据"])
        for row in conflict_rows:
            conflict_ws.append(row)
        style_sheet(conflict_ws, [10, 10, 18, 24, 60, 12, 12, 12, 12, 90, 90])

    review_wb.save(REVIEW_WORKBOOK)

    print(f"Matched: {stats['matched']}")
    print(f"Ambiguous: {stats['ambiguous']}")
    print(f"Unmatched: {stats['unmatched']}")
    print(f"Conflicts: {len(conflict_rows)}")
    print(f"Output workbook: {OUTPUT_WORKBOOK}")
    print(f"Review workbook: {REVIEW_WORKBOOK}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
