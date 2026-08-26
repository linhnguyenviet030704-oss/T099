"""Compare flow flags and helpers.

Compare endpoints use CV + DB but NOT vector search:
- needs_cv = True (compare candidates/jobs based on CV content)
- needs_db = True (fetch job + resumes from DB)
- needs_vector_search = False (operate on provided data directly)

ponytail: explicit flag surface so reviewers can see the decision in code.
Upgrade path: if a future compare flow needs similarity search, flip the flag.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CompareFlowFlags:
    """Resource usage flags for compare flows."""

    needs_cv: bool = True
    needs_db: bool = True
    needs_vector_search: bool = False
    requires_user_cv: bool = True


# Single source of truth for compare flows
COMPARE_CANDIDATES_FLAGS = CompareFlowFlags(
    needs_cv=True,
    needs_db=True,
    needs_vector_search=False,
    requires_user_cv=True,
)

COMPARE_JOBS_FLAGS = CompareFlowFlags(
    needs_cv=True,
    needs_db=True,
    needs_vector_search=False,
    requires_user_cv=True,
)


def assert_compare_flow_is_pure(flags: CompareFlowFlags) -> None:
    """Runtime check: compare flows must not use vector search.

    Use this at the start of any compare endpoint handler to make the constraint
    visible in code review and to fail loudly if someone accidentally adds VS.
    """
    if flags.needs_vector_search:
        raise RuntimeError(
            "Compare flow should not use vector search. "
            "It operates on already-provided CVs and JDs."
        )