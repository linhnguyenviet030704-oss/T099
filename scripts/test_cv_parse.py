"""Parse → clean → LLM summarize CVs in data/test_CV_parse/CV → parsed_CV.

Skips embedding. Prompt: backend/app/prompts/system/summarize.txt

Usage:
    python scripts/test_cv_parse.py
    python scripts/test_cv_parse.py --limit 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.agents.ingest.graph import build_ingest_graph

SRC = ROOT / "data" / "test_CV_parse" / "CV"
OUT = ROOT / "data" / "test_CV_parse" / "parsed_CV"


async def ingest_one(graph, path: Path) -> dict:
    started = time.perf_counter()
    result = await graph.ainvoke(
        {
            "raw_bytes": path.read_bytes(),
            "mime_type": "application/pdf",
        }
    )
    elapsed = round(time.perf_counter() - started, 2)
    markdown = result.get("markdown") or ""
    metadata = dict(result.get("metadata") or {})
    (OUT / f"{path.stem}.md").write_text(markdown, encoding="utf-8")
    (OUT / f"{path.stem}.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "file": path.name,
        "chars": len(markdown),
        "skills": metadata.get("skills") or [],
        "titles": metadata.get("titles") or [],
        "summary": (metadata.get("summary") or "")[:80],
        "seconds": elapsed,
    }


async def run(limit: int | None) -> None:
    files = sorted(p for p in SRC.iterdir() if p.is_file() and p.suffix.lower() == ".pdf")
    if limit is not None:
        files = files[:limit]
    if not files:
        raise SystemExit(f"No PDFs in {SRC}")

    OUT.mkdir(parents=True, exist_ok=True)
    graph = build_ingest_graph(embed=False)
    rows: list[dict] = []
    for path in files:
        try:
            row = await ingest_one(graph, path)
            rows.append(row)
            print(
                f"{row['file']}\t{row['seconds']}s\tchars={row['chars']}\t"
                f"skills={row['skills']}\ttitles={row['titles']}".encode(
                    sys.stdout.encoding or "utf-8", errors="replace"
                ).decode(sys.stdout.encoding or "utf-8", errors="replace")
            )
            if row["summary"]:
                safe = row["summary"].encode(sys.stdout.encoding or "ascii", errors="replace").decode(
                    sys.stdout.encoding or "ascii", errors="replace"
                )
                print(f"  summary: {safe}")
        except Exception as exc:
            print(f"{path.name}\tERROR\t{type(exc).__name__}: {exc}")
            rows.append({"file": path.name, "error": f"{type(exc).__name__}: {exc}"})
    (OUT / "_batch_report.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(run(args.limit))


if __name__ == "__main__":
    main()
