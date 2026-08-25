"""Parse CV PDFs to structured Markdown. No LLM.

Usage:
    python scripts/parse_cv.py
    python scripts/parse_cv.py --input "C:\\Users\\Admin\\Downloads\\CV"
    python scripts/parse_cv.py --input path/to/one.pdf --out data/parsed
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.services.matching.parse import parse_resume_bytes

DEFAULT_INPUT = Path(r"C:\Users\Admin\Downloads\CV")
DEFAULT_OUT = ROOT / "data" / "test_CV_parse" / "parsed_CV"


def parse_one(path: Path, out_dir: Path) -> dict:
    parsed = parse_resume_bytes(
        path.read_bytes(),
        mime_type="application/pdf",
        source_name=path.name,
    )
    md = parsed.get("markdown") or ""
    meta = parsed.get("metadata") or {}
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{path.stem}.md").write_text(md, encoding="utf-8")
    (out_dir / f"{path.stem}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "file": path.name,
        "chars": len(md),
        "seniority": meta.get("seniority"),
        "years": meta.get("years_experience"),
        "major": meta.get("major_field"),
        "sub": meta.get("sub_field"),
        "skills": (meta.get("skills") or [])[:8],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    src = args.input
    files = [src] if src.is_file() else sorted(p for p in src.iterdir() if p.suffix.lower() == ".pdf")
    if args.limit is not None:
        files = files[: args.limit]
    if not files:
        raise SystemExit(f"No PDFs in {src}")
    rows = []
    for path in files:
        try:
            row = parse_one(path, args.out)
            rows.append(row)
            print(
                f"{row['file']}\tseniority={row['seniority']}\tyears={row['years']}\t"
                f"{row['major']}/{row['sub']}\tskills={row['skills']}"
            )
        except Exception as exc:
            print(f"{path.name}\tERROR\t{type(exc).__name__}: {exc}")
            rows.append({"file": path.name, "error": f"{type(exc).__name__}: {exc}"})
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "_batch_report.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
