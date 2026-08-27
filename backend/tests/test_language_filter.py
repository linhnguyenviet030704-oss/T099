"""Unit and integration tests for language validation and routing rejection."""
from __future__ import annotations

from uuid import uuid4

import pytest

from backend.app.agents.evaluation.types import IntentType, RejectionReason
from backend.app.agents.nodes.router import classify_intent as node_classify_intent
from backend.app.agents.routing import RoutingAgent
from backend.app.agents.routing.intents import (
    classify_intent,
    is_supported_language,
    validate_content,
)
from backend.app.api.schemas.chat import ChatRequest
from backend.app.services.chat_service import UNSUPPORTED_LANGUAGE_RESPONSE, ChatService


class TestLanguageDetectionSupported:
    """Test valid Vietnamese and English inputs."""

    @pytest.mark.parametrize(
        "query",
        [
            "Tìm việc làm AI Engineer tại Hà Nội",
            "Đánh giá CV của tôi",
            "Tôi cần học thêm kỹ năng gì để làm DevOps?",
            "Gợi ý công việc phù hợp với hồ sơ",
            "Danh sách các vị trí đang tuyển dụng tại TP HCM",
            "Xin chào, tôi muốn tìm việc",
            "Cảm ơn bạn rất nhiều",
        ],
    )
    def test_vietnamese_with_diacritics(self, query: str) -> None:
        is_supported, lang = is_supported_language(query)
        assert is_supported is True
        assert lang == "vi"

    @pytest.mark.parametrize(
        "query",
        [
            "tim viec lam tai ha noi",
            "danh gia cv cua toi",
            "goi y ung vien phu hop",
            "cac cong viec hien co",
            "toi muon tim viec backend developer",
            "xin chao ban",
        ],
    )
    def test_vietnamese_without_diacritics(self, query: str) -> None:
        is_supported, lang = is_supported_language(query)
        assert is_supported is True
        assert lang == "vi"

    @pytest.mark.parametrize(
        "query",
        [
            "Looking for Python Backend Developer jobs in Hanoi",
            "Can you review my resume and provide feedback?",
            "What skills do I need to become a Data Scientist?",
            "Show all available jobs",
            "Recommend suitable candidates for this opening",
            "Hello, I need assistance with job search",
            "Thank you very much",
        ],
    )
    def test_english_sentences(self, query: str) -> None:
        is_supported, lang = is_supported_language(query)
        assert is_supported is True
        assert lang == "en"

    @pytest.mark.parametrize(
        "query",
        [
            "AI Engineer",
            "Python",
            "FastAPI",
            "Logistic",
            "DevOps",
            "Data Science",
            "React Developer",
            "#2",
            "FPT",
            "VNG",
        ],
    )
    def test_short_technical_and_entity_queries(self, query: str) -> None:
        is_supported, _ = is_supported_language(query)
        assert is_supported is True


class TestLanguageDetectionUnsupported:
    """Test rejection of non-English and non-Vietnamese inputs."""

    @pytest.mark.parametrize(
        "query",
        [
            # Chinese
            "我想找一份人工智能工程师的工作",
            "你好，请帮我评估简历",
            "推荐适合我的工作",
            # Japanese
            "AIエンジニアの仕事を探しています",
            "こんにちは、履歴書をレビューしてください",
            "おすすめの求人情報を教えてください",
            # Korean
            "AI 엔지니어 일자리를 찾고 있습니다",
            "안녕하세요, 제 이력서를 평가해 주세요",
            "채용 공고 목록을 보여주세요",
            # Russian
            "Привет, найди мне работу Python разработчика",
            "Оцените мое резюме пожалуйста",
            "Список открытых вакансий в Москве",
            # Arabic
            "مرحبا اريد وظيفة مهندس ذكاء اصطناعي",
            "يرجى تقييم سيرتي الذاتية",
            # Thai
            "สวัสดีครับ หางานโปรแกรมเมอร์ Python",
            # Hindi
            "नमस्ते, मुझे सॉफ्टवेयर इंजीनियर की नौकरी चाहिए",
        ],
    )
    def test_non_latin_scripts_rejected(self, query: str) -> None:
        is_supported, _ = is_supported_language(query)
        assert is_supported is False

    @pytest.mark.parametrize(
        "query",
        [
            # French
            "Bonjour, je cherche un emploi de développeur Python à Paris",
            "Quelles sont les compétences requises pour ce poste?",
            "Merci de bien vouloir évaluer mon CV",
            # German
            "Ich suche eine Stelle als Softwareentwickler in Berlin",
            "Guten Tag, bitte bewerten Sie meinen Lebenslauf",
            "Welche Fähigkeiten brauche ich für diesen Beruf?",
            # Spanish
            "Hola, busco trabajo de desarrollador de software en Madrid",
            "¿Cuáles son los puestos de trabajo disponibles?",
            "Por favor evalúa mi currículum",
            # Portuguese
            "Olá, procuro uma vaga de desenvolvedor backend",
            "Muito obrigado pela ajuda",
            # Italian
            "Ciao, cerco lavoro come sviluppatore web",
            "Buongiorno, quali sono le posizioni aperte?",
            # Japanese Romaji
            "Konnichiwa, arigatou gozaimasu",
        ],
    )
    def test_foreign_latin_languages_rejected(self, query: str) -> None:
        is_supported, _ = is_supported_language(query)
        assert is_supported is False


class TestIntentClassificationLanguageRejection:
    """Test classify_intent returns UNSUPPORTED_LANGUAGE intent for foreign inputs."""

    @pytest.mark.parametrize(
        "query",
        [
            "我想找一份工作",
            "Bonjour, je cherche un emploi",
            "Ich suche einen Job",
            "Hola, busco trabajo",
            "AIエンジニアの求人",
            "Привет, найди работу",
        ],
    )
    def test_classify_intent_unsupported_language(self, query: str) -> None:
        result = classify_intent(query)
        assert result.intent == IntentType.UNSUPPORTED_LANGUAGE
        assert result.needs_db is False
        assert result.needs_cv is False
        assert result.dispatch_target is None
        assert result.needs_vector_search is False

    @pytest.mark.parametrize(
        "query",
        [
            "Bonjour, je cherche un emploi",
            "Ich suche eine Stelle",
            "我想找工作",
        ],
    )
    def test_node_classify_intent_unsupported(self, query: str) -> None:
        res = node_classify_intent(query)
        assert res["intent"] == "UNSUPPORTED_LANGUAGE"
        assert res["needs_db_query"] is False


class TestValidationContentLanguageRejection:
    """Test validate_content rejects unsupported languages."""

    def test_validate_content_rejects_foreign(self) -> None:
        foreign_text = "Bonjour, " + "je cherche un emploi de développeur à Paris. " * 5
        is_valid, reason = validate_content(foreign_text)
        assert is_valid is False
        assert reason == RejectionReason.UNSUPPORTED_LANGUAGE


class TestRoutingAgentLanguageRejection:
    """Test full RoutingAgent graph rejects unsupported language queries."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "query",
        [
            "Bonjour, je cherche un emploi de développeur Python",
            "Ich suche eine Stelle als Softwareentwickler",
            "我想在河内找一份人工智能工程师的工作",
            "こんにちは、AIエンジニアの仕事を探しています",
            "Hola, busco trabajo de desarrollador",
        ],
    )
    async def test_routing_agent_rejects_foreign_language(self, query: str) -> None:
        agent = RoutingAgent()
        result = await agent.route(query)

        assert result.is_valid is False
        assert result.is_rejected() is True
        assert result.intent == IntentType.UNSUPPORTED_LANGUAGE
        assert result.rejection_reason == RejectionReason.UNSUPPORTED_LANGUAGE
        assert result.dispatch_target is None
        assert "tiếng Việt và tiếng Anh" in str(result.response)


class TestChatServiceLanguageShortCircuit:
    """Test ChatService short-circuits on unsupported languages without invoking recommend/match."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "query",
        [
            "Bonjour, je cherche un emploi",
            "Ich suche einen Job",
            "我想找一份工作",
            "Hola, busco trabajo de programador",
        ],
    )
    async def test_chat_short_circuits_on_foreign_language(self, query: str) -> None:
        recommend_called = False
        match_called = False

        async def fake_recommend(*args, **kwargs):
            nonlocal recommend_called
            recommend_called = True
            raise AssertionError("recommend_jobs should NOT be called for unsupported language")

        async def fake_match(*args, **kwargs):
            nonlocal match_called
            match_called = True
            raise AssertionError("match_candidates should NOT be called for unsupported language")

        service = ChatService(
            fetch_jobs=lambda: [],
            recommend_jobs=fake_recommend,
            match_candidates=fake_match,
            dispatch_evaluation=None,
            supabase_client=None,
        )

        request = ChatRequest(message=query)
        response = await service.chat(request, actor_id=uuid4())

        assert recommend_called is False
        assert match_called is False
        assert response.response == UNSUPPORTED_LANGUAGE_RESPONSE
        assert response.jobs == []
        assert response.candidates == []
