"""Agent 2 (Interview Question Generation) LangGraph State Machine."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Callable
from typing import Any

from langgraph.graph import END, StateGraph

from backend.app.agents.interview.diversity import DiversityError, enforce_diversity
from backend.app.agents.interview.state import Agent2State
from backend.app.agents.interview.tools import (
    get_candidate_cv,
    get_candidate_projects,
    get_candidate_skills,
    get_job_description,
    persist_interview_session,
    validate_coverage,
)
from backend.app.clients.llm import chat_complete

logger = logging.getLogger(__name__)


def build_agent2_graph(
    *,
    llm_client: Any = None,
    supabase_client_provider: Callable[[], Any] | None = None,
    checkpointer: Any = None,
) -> Any:
    """Build and compile the Agent 2 (Interview Question Generator) StateGraph."""

    async def analyze_jd_node(state: Agent2State) -> dict[str, Any]:
        job_id = state.get("job_id", "")
        jd_data = get_job_description.invoke({"job_id": job_id})

        title = jd_data.get("title", "Software Engineer")
        requirements_text = jd_data.get("requirements_text", "")
        technical_skills = jd_data.get("technical_skills", [])
        seniority = jd_data.get("seniority_level", "mid")

        # Extract list of critical requirements
        critical_reqs: list[str] = []
        if isinstance(technical_skills, list) and technical_skills:
            critical_reqs.extend(technical_skills[:6])
        if requirements_text:
            lines = [line.strip("- *• \t") for line in requirements_text.splitlines() if line.strip()]
            for line in lines[:5]:
                if line and line not in critical_reqs:
                    critical_reqs.append(line)

        if not critical_reqs:
            critical_reqs = ["Core Programming", "Problem Solving", "System Architecture", "Team Collaboration"]

        return {
            "jd_analysis": {
                "title": title,
                "seniority": seniority,
                "critical_requirements": critical_reqs,
                "description": jd_data.get("description", ""),
            },
            "refine_count": 0,
            "status": "generating",
        }

    async def fetch_cv_node(state: Agent2State) -> dict[str, Any]:
        candidate_id = state.get("candidate_id", "")
        cv_data = get_candidate_cv.invoke({"candidate_id": candidate_id})
        return {
            "candidate_name": cv_data.get("name", "Candidate"),
            "cv_skills": cv_data.get("skills", []),
            "cv_text": cv_data.get("cv_text", ""),
        }

    async def query_graph_node(state: Agent2State) -> dict[str, Any]:
        candidate_id = state.get("candidate_id", "")
        projects = get_candidate_projects.invoke({"candidate_id": candidate_id})
        get_candidate_skills.invoke({"candidate_id": candidate_id})
        return {
            "project_profiles": projects,
        }

    async def plan_distribution_node(state: Agent2State) -> dict[str, Any]:
        jd_analysis = state.get("jd_analysis") or {}
        seniority = str(jd_analysis.get("seniority", "mid")).lower()

        if "senior" in seniority or "lead" in seniority or "principal" in seniority:
            distribution = {
                "technical": 3,
                "system_design": 3,
                "project_deep_dive": 2,
                "behavioral": 2,
            }
        else:
            distribution = {
                "technical": 4,
                "problem_solving": 2,
                "behavioral": 2,
                "project_deep_dive": 1,
            }

        return {"question_distribution": distribution}

    async def generate_questions_node(state: Agent2State) -> dict[str, Any]:
        jd_analysis = state.get("jd_analysis") or {}
        candidate_name = state.get("candidate_name", "Candidate")
        cv_skills = state.get("cv_skills") or []
        projects = state.get("project_profiles") or []
        distribution = state.get("question_distribution") or {"technical": 3, "behavioral": 2, "system_design": 2}
        critical_reqs = jd_analysis.get("critical_requirements") or []

        prompt = f"""You are an expert technical interviewer designing tailored interview questions.

Job Title: {jd_analysis.get('title')} (Seniority: {jd_analysis.get('seniority')})
Candidate Name: {candidate_name}
Candidate Skills: {', '.join(cv_skills) if cv_skills else 'General Software Engineering'}
Candidate Projects: {json.dumps([p.get('repo_full_name') or p.get('name') for p in projects])}
Target Question Distribution: {json.dumps(distribution)}
Critical Job Requirements to Cover: {json.dumps(critical_reqs)}

Generate a JSON array of interview questions. Each question must strictly follow this JSON schema:
[
  {{
    "id": "uuid-string",
    "text": "The question text",
    "category": "technical" | "behavioral" | "system_design" | "project_deep_dive" | "problem_solving" | "code_review" | "culture_fit",
    "difficulty": "easy" | "medium" | "hard",
    "project_reference": "owner/repo" or null,
    "jd_requirement_mapped": "Specific requirement text from Critical Job Requirements",
    "skills_tested": ["skill1", "skill2"],
    "expected_answer_outline": "Key points expected in a strong answer",
    "rubric": {{"excellent": "...", "acceptable": "...", "poor": "..."}},
    "follow_ups": [{{"text": "...", "difficulty": "hard", "purpose": "..."}}]
  }}
]

Ensure at least 3 distinct categories are used, with at least 15% hard questions.
Output only the valid JSON array with no markdown fences or other text.
"""

        raw_response = ""
        questions: list[dict[str, Any]] = []

        try:
            if callable(llm_client):
                raw_response = llm_client(prompt)
            else:
                raw_response = chat_complete(prompt, json_object=True)

            # Strip markdown fences if present
            cleaned = raw_response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "questions" in parsed:
                questions = parsed["questions"]
            elif isinstance(parsed, list):
                questions = parsed
        except Exception as e:
            logger.warning("LLM question generation parse error: %s", e)

        # Fallback question set if LLM output was empty or failed
        if not questions:
            for idx, req in enumerate(critical_reqs):
                cat = "technical" if idx % 3 == 0 else ("system_design" if idx % 3 == 1 else "behavioral")
                diff = "hard" if idx == 0 else ("medium" if idx % 2 == 0 else "easy")
                questions.append({
                    "id": str(uuid.uuid4()),
                    "text": f"How have you applied {req} in your past projects to solve complex challenges?",
                    "category": cat,
                    "difficulty": diff,
                    "project_reference": projects[0].get("repo_full_name") if projects else None,
                    "jd_requirement_mapped": req,
                    "skills_tested": [req],
                    "expected_answer_outline": f"Clear architectural choices and experience with {req}.",
                    "rubric": {
                        "excellent": "In-depth practical experience and trade-offs",
                        "acceptable": "Basic understanding",
                        "poor": "Vague or no experience",
                    },
                    "follow_ups": [],
                })

        # Enforce diversity
        try:
            diverse_questions = enforce_diversity(questions)
        except DiversityError as e:
            logger.warning("Diversity violation during generation, falling back: %s", e)
            diverse_questions = questions

        return {"generated_questions": diverse_questions}

    async def validate_coverage_node(state: Agent2State) -> dict[str, Any]:
        questions = state.get("generated_questions") or []
        jd_analysis = state.get("jd_analysis") or {}
        critical_reqs = jd_analysis.get("critical_requirements") or []
        threshold = state.get("coverage_threshold", 0.80)

        validation = validate_coverage.invoke({
            "questions": questions,
            "jd_requirements": critical_reqs,
            "threshold": threshold,
        })
        return {"validation_result": validation}

    async def refine_node(state: Agent2State) -> dict[str, Any]:
        validation = state.get("validation_result") or {}
        missing = validation.get("missing") or []
        questions = list(state.get("generated_questions") or [])
        refine_count = state.get("refine_count", 0) + 1

        for req in missing:
            questions.append({
                "id": str(uuid.uuid4()),
                "text": f"Could you walk through how you work with {req} and handle common edge cases?",
                "category": "technical",
                "difficulty": "medium",
                "project_reference": None,
                "jd_requirement_mapped": req,
                "skills_tested": [req],
                "expected_answer_outline": f"Demonstrates hands-on mastery of {req}",
                "rubric": {
                    "excellent": "Deep understanding and best practices",
                    "acceptable": "Working knowledge",
                    "poor": "Unfamiliar",
                },
                "follow_ups": [],
            })

        try:
            refined = enforce_diversity(questions)
        except Exception:
            refined = questions

        return {
            "generated_questions": refined,
            "refine_count": refine_count,
        }

    async def persist_node(state: Agent2State) -> dict[str, Any]:
        candidate_id = state.get("candidate_id", "")
        job_id = state.get("job_id")
        questions = state.get("generated_questions") or []
        distribution = state.get("question_distribution") or {}
        validation = state.get("validation_result") or {}
        coverage_ratio = validation.get("ratio", 1.0)
        threshold = state.get("coverage_threshold", 0.80)
        state_session_id = state.get("session_id") or str(uuid.uuid4())

        session_id = persist_interview_session.invoke({
            "session_id": state_session_id,
            "candidate_id": candidate_id,
            "job_id": job_id,
            "questions": questions,
            "distribution": distribution,
            "coverage_ratio": coverage_ratio,
            "coverage_threshold": threshold,
        })

        return {
            "session_id": session_id or state_session_id,
            "status": "generated",
        }

    # Conditional edge after validation
    def route_after_validation(state: Agent2State) -> str:
        validation = state.get("validation_result") or {}
        if validation.get("passed"):
            return "persist"
        if state.get("refine_count", 0) >= 3:
            return "persist"
        return "refine"

    # Build LangGraph StateGraph
    workflow = StateGraph(Agent2State)
    workflow.add_node("analyze_jd", analyze_jd_node)
    workflow.add_node("fetch_cv", fetch_cv_node)
    workflow.add_node("query_graph", query_graph_node)
    workflow.add_node("plan_distribution", plan_distribution_node)
    workflow.add_node("generate_questions", generate_questions_node)
    workflow.add_node("validate_coverage", validate_coverage_node)
    workflow.add_node("refine", refine_node)
    workflow.add_node("persist", persist_node)

    workflow.set_entry_point("analyze_jd")
    workflow.add_edge("analyze_jd", "fetch_cv")
    workflow.add_edge("fetch_cv", "query_graph")
    workflow.add_edge("query_graph", "plan_distribution")
    workflow.add_edge("plan_distribution", "generate_questions")
    workflow.add_edge("generate_questions", "validate_coverage")
    workflow.add_conditional_edges(
        "validate_coverage",
        route_after_validation,
        {"refine": "refine", "persist": "persist"},
    )
    workflow.add_edge("refine", "validate_coverage")
    workflow.add_edge("persist", END)

    return workflow.compile(checkpointer=checkpointer)


agent2_graph = build_agent2_graph()
