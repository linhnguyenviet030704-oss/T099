from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from backend.app.api.schemas.application import (
    ApplicationUpdateStatusRequest,
)
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.services.application_service import (
    ApplicationService,
    assert_recruiter_owns_job_application,
    validate_status_transition,
)

# === 1. Test validate_status_transition ===

def test_validate_status_transition_valid_cases():
    """Kiểm tra các luồng chuyển trạng thái hợp lệ theo sơ đồ state machine."""
    # pending -> screening, interview, rejected, withdrawn
    validate_status_transition("pending", "screening")
    validate_status_transition("pending", "interview")
    validate_status_transition("pending", "rejected")
    validate_status_transition("pending", "withdrawn")

    # screening -> interview, rejected, withdrawn
    validate_status_transition("screening", "interview")
    validate_status_transition("screening", "rejected")
    validate_status_transition("screening", "withdrawn")

    # interview -> offer, rejected, withdrawn
    validate_status_transition("interview", "offer")
    validate_status_transition("interview", "rejected")
    validate_status_transition("interview", "withdrawn")

    # offer -> accepted, rejected, withdrawn
    validate_status_transition("offer", "accepted")
    validate_status_transition("offer", "rejected")
    validate_status_transition("offer", "withdrawn")

    # old_status == new_status (no-op)
    validate_status_transition("pending", "pending")
    validate_status_transition("interview", "interview")


def test_validate_status_transition_invalid_cases():
    """Kiểm tra các luồng chuyển trạng thái không hợp lệ bị chặn với BadRequestError."""
    # pending không được nhảy cóc lên offer hoặc accepted
    with pytest.raises(BadRequestError):
        validate_status_transition("pending", "offer")

    with pytest.raises(BadRequestError):
        validate_status_transition("pending", "accepted")

    # screening không được nhảy cóc lên offer hoặc accepted
    with pytest.raises(BadRequestError):
        validate_status_transition("screening", "offer")

    with pytest.raises(BadRequestError):
        validate_status_transition("screening", "accepted")

    # interview không được nhảy cóc lên accepted (phải qua offer)
    with pytest.raises(BadRequestError):
        validate_status_transition("interview", "accepted")

    # accepted / rejected / withdrawn là trạng thái terminal (không thể chuyển tiếp)
    with pytest.raises(BadRequestError):
        validate_status_transition("accepted", "rejected")

    with pytest.raises(BadRequestError):
        validate_status_transition("rejected", "interview")

    with pytest.raises(BadRequestError):
        validate_status_transition("withdrawn", "pending")


# === 2. Test assert_recruiter_owns_job_application ===

def test_assert_recruiter_owns_job_application_success():
    """Nhà tuyển dụng có quyền quản trị công ty sở hữu việc làm."""
    recruiter_id = uuid4()
    company_id = uuid4()
    app = {"job_posts": {"company_id": str(company_id)}}

    client = MagicMock()
    table_mock = MagicMock()
    client.table.return_value = table_mock
    select_mock = MagicMock()
    table_mock.select.return_value = select_mock
    select_mock.eq.return_value = select_mock
    select_mock.in_.return_value = select_mock
    select_mock.maybe_single.return_value = select_mock
    select_mock.execute.return_value = MagicMock(data={"id": str(uuid4()), "role": "owner"})

    # Không raise exception
    assert_recruiter_owns_job_application(
        application=app,
        recruiter_user_id=recruiter_id,
        client=client,
    )


def test_assert_recruiter_owns_job_application_forbidden():
    """Nhà tuyển dụng không thuộc công ty đăng tuyển -> ForbiddenError."""
    recruiter_id = uuid4()
    company_id = uuid4()
    app = {"job_posts": {"company_id": str(company_id)}}

    client = MagicMock()
    table_mock = MagicMock()
    client.table.return_value = table_mock
    select_mock = MagicMock()
    table_mock.select.return_value = select_mock
    select_mock.eq.return_value = select_mock
    select_mock.in_.return_value = select_mock
    select_mock.maybe_single.return_value = select_mock
    select_mock.execute.return_value = MagicMock(data=None)

    with pytest.raises(ForbiddenError):
        assert_recruiter_owns_job_application(
            application=app,
            recruiter_user_id=recruiter_id,
            client=client,
        )


# === 3. Test ApplicationService ===

@pytest.mark.asyncio
async def test_get_detail_candidate_own_success():
    """Ứng viên xem chi tiết đơn ứng tuyển của chính mình."""
    app_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()
    resume_id = uuid4()

    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(resume_id),
        "current_status": "pending",
        "applied_at": "2026-08-30T10:00:00Z",
        "job_posts": {"title": "Senior Python Developer"},
        "profiles": {"full_name": "Nguyen Van A", "email": "a@example.com"},
    }

    email_repo = AsyncMock()
    client = MagicMock()

    service = ApplicationService(app_repo, email_repo, client)
    res = await service.get_detail(app_id, candidate_id, "candidate")

    assert res.id == app_id
    assert res.current_status == "pending"
    assert res.applicant_name == "Nguyen Van A"
    assert res.job_title == "Senior Python Developer"


@pytest.mark.asyncio
async def test_get_detail_candidate_forbidden_other_user():
    """Ứng viên không được xem đơn của người khác -> ForbiddenError."""
    app_id = uuid4()
    candidate_id = uuid4()
    other_candidate_id = uuid4()

    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = {
        "id": str(app_id),
        "job_post_id": str(uuid4()),
        "applicant_user_id": str(other_candidate_id),
        "resume_id": str(uuid4()),
        "current_status": "pending",
        "applied_at": "2026-08-30T10:00:00Z",
    }

    service = ApplicationService(app_repo, AsyncMock(), MagicMock())
    with pytest.raises(ForbiddenError):
        await service.get_detail(app_id, candidate_id, "candidate")


@pytest.mark.asyncio
async def test_get_detail_not_found():
    """Đơn ứng tuyển không tồn tại -> NotFoundError."""
    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = None

    service = ApplicationService(app_repo, AsyncMock(), MagicMock())
    with pytest.raises(NotFoundError):
        await service.get_detail(uuid4(), uuid4(), "recruiter")


@pytest.mark.asyncio
async def test_update_status_and_enqueue_email():
    """Nhà tuyển dụng đổi trạng thái và gửi email thông báo."""
    app_id = uuid4()
    recruiter_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()
    resume_id = uuid4()
    company_id = uuid4()

    app_data = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(resume_id),
        "current_status": "pending",
        "applied_at": "2026-08-30T10:00:00Z",
        "job_posts": {"company_id": str(company_id), "title": "AI Engineer"},
        "profiles": {"full_name": "Le Van B", "email": "b@example.com"},
    }

    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = app_data
    app_repo.update_status.return_value = (
        {"current_status": "interview"},
        {
            "stage": "interview",
            "note": "Mời phỏng vấn qua Google Meet",
            "is_system_generated": False,
            "created_at": "2026-08-30T11:00:00Z",
            "changed_by_user_id": str(recruiter_id),
        },
    )

    email_repo = AsyncMock()
    email_repo.enqueue.return_value = uuid4()

    client = MagicMock()
    table_mock = MagicMock()
    client.table.return_value = table_mock
    select_mock = MagicMock()
    table_mock.select.return_value = select_mock
    select_mock.eq.return_value = select_mock
    select_mock.in_.return_value = select_mock
    select_mock.maybe_single.return_value = select_mock
    select_mock.execute.return_value = MagicMock(data={"id": str(uuid4()), "role": "recruiter"})

    service = ApplicationService(app_repo, email_repo, client)

    req = ApplicationUpdateStatusRequest(
        new_status="interview",
        note="Mời phỏng vấn qua Google Meet",
        send_email=True,
    )
    res = await service.update_status(app_id, recruiter_id, req)

    assert res.application.current_status == "interview"
    assert res.new_stage.stage == "interview"
    assert res.email_enqueued is True
    email_repo.enqueue.assert_called_once()


@pytest.mark.asyncio
async def test_update_status_with_interview_schedule_creates_invitation():
    """Nhà tuyển dụng đổi trạng thái sang interview kèm các mốc thời gian đề xuất."""
    app_id = uuid4()
    recruiter_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()
    company_id = uuid4()

    app_data = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(uuid4()),
        "current_status": "screening",
        "applied_at": "2026-08-30T10:00:00Z",
        "job_posts": {"company_id": str(company_id), "title": "Frontend Engineer"},
        "profiles": {"full_name": "Tran C", "email": "c@example.com"},
    }

    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = app_data
    app_repo.update_status.return_value = (
        {"current_status": "interview"},
        {
            "stage": "interview",
            "note": "Hẹn phỏng vấn kỹ thuật",
            "is_system_generated": False,
            "created_at": "2026-08-30T11:00:00Z",
            "changed_by_user_id": str(recruiter_id),
        },
    )

    interview_repo = AsyncMock()
    interview_repo.create.return_value = {
        "id": str(uuid4()),
        "application_id": str(app_id),
        "proposed_time_slots": ["2026-09-02T09:00:00Z", "2026-09-02T14:00:00Z"],
        "location": "Văn phòng Tầng 4",
        "meeting_link": "https://meet.google.com/abc-defg-hij",
        "note": "Vui lòng chuẩn bị laptop",
        "status": "pending",
        "created_at": "2026-08-30T11:00:00Z",
    }

    client = MagicMock()
    table_mock = MagicMock()
    client.table.return_value = table_mock
    select_mock = MagicMock()
    table_mock.select.return_value = select_mock
    select_mock.eq.return_value = select_mock
    select_mock.in_.return_value = select_mock
    select_mock.maybe_single.return_value = select_mock
    select_mock.execute.return_value = MagicMock(data={"id": str(uuid4()), "role": "recruiter"})

    service = ApplicationService(app_repo, AsyncMock(), client, interview_repo)

    from backend.app.api.schemas.application import InterviewScheduleInput

    req = ApplicationUpdateStatusRequest(
        new_status="interview",
        note="Hẹn phỏng vấn kỹ thuật",
        interview_schedule=InterviewScheduleInput(
            proposed_time_slots=["2026-09-02T09:00:00Z", "2026-09-02T14:00:00Z"],
            location="Văn phòng Tầng 4",
            meeting_link="https://meet.google.com/abc-defg-hij",
            note="Vui lòng chuẩn bị laptop",
        ),
    )
    res = await service.update_status(app_id, recruiter_id, req)

    assert res.application.current_status == "interview"
    assert res.interview_invitation is not None
    assert len(res.interview_invitation.proposed_time_slots) == 2
    assert res.interview_invitation.location == "Văn phòng Tầng 4"
    interview_repo.create.assert_called_once()


@pytest.mark.asyncio
async def test_candidate_confirm_interview_slot():
    """Ứng viên chọn 1 mốc thời gian phù hợp và xác nhận lịch hẹn."""
    app_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()

    app_data = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(uuid4()),
        "current_status": "interview",
    }
    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = app_data

    interview_repo = AsyncMock()
    interview_repo.candidate_confirm_slot.return_value = {
        "id": str(uuid4()),
        "application_id": str(app_id),
        "scheduled_at": "2026-09-02T09:00:00Z",
        "proposed_time_slots": ["2026-09-02T09:00:00Z", "2026-09-02T14:00:00Z"],
        "status": "confirmed",
        "responded_at": "2026-08-30T12:00:00Z",
        "created_at": "2026-08-30T11:00:00Z",
    }

    service = ApplicationService(app_repo, AsyncMock(), MagicMock(), interview_repo)

    from backend.app.api.schemas.application import CandidateInterviewResponseRequest

    req = CandidateInterviewResponseRequest(
        action="confirm",
        selected_slot="2026-09-02T09:00:00Z",
    )
    res = await service.candidate_respond_interview(app_id, candidate_id, req)

    assert res.status == "confirmed"
    assert res.scheduled_at is not None
    interview_repo.candidate_confirm_slot.assert_called_once_with(
        application_id=app_id,
        selected_slot="2026-09-02T09:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_candidate_request_reschedule():
    """Ứng viên chọn không có lịch phù hợp và đề xuất mốc thời gian mới."""
    app_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()

    app_data = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(uuid4()),
        "current_status": "interview",
    }
    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = app_data

    interview_repo = AsyncMock()
    interview_repo.candidate_request_reschedule.return_value = {
        "id": str(uuid4()),
        "application_id": str(app_id),
        "proposed_time_slots": ["2026-09-02T09:00:00Z"],
        "candidate_proposed_slots": ["2026-09-03T10:00:00Z", "2026-09-04T15:00:00Z"],
        "candidate_response_note": "Em bận công tác ngày 02/09",
        "status": "reschedule_requested",
        "responded_at": "2026-08-30T12:00:00Z",
        "created_at": "2026-08-30T11:00:00Z",
    }

    service = ApplicationService(app_repo, AsyncMock(), MagicMock(), interview_repo)

    from backend.app.api.schemas.application import CandidateInterviewResponseRequest

    req = CandidateInterviewResponseRequest(
        action="reschedule",
        proposed_time_slots=["2026-09-03T10:00:00Z", "2026-09-04T15:00:00Z"],
        note="Em bận công tác ngày 02/09",
    )
    res = await service.candidate_respond_interview(app_id, candidate_id, req)

    assert res.status == "reschedule_requested"
    assert len(res.candidate_proposed_slots) == 2
    assert res.candidate_response_note == "Em bận công tác ngày 02/09"


# === 7. Test validate_and_normalize_time_slots ===

def test_validate_and_normalize_time_slots_valid():
    """Khoảng thời gian hợp lệ, không trùng lặp và cách nhau ít nhất 4 giờ."""
    from backend.app.services.application_service import validate_and_normalize_time_slots

    slots = [
        {"start_time": "2026-09-01T09:00:00", "end_time": "2026-09-01T10:00:00"},
        {"start_time": "2026-09-01T14:00:00", "end_time": "2026-09-01T15:00:00"}, # Cách slot 1 đúng 4h (10h -> 14h)
        "2026-09-02T08:30:00/2026-09-02T09:30:00",
    ]
    normalized = validate_and_normalize_time_slots(slots)
    assert len(normalized) == 3
    assert "2026-09-01T09:00:00/2026-09-01T10:00:00" in normalized[0]
    assert "2026-09-01T14:00:00/2026-09-01T15:00:00" in normalized[1]


def test_validate_and_normalize_time_slots_overlap():
    """Báo lỗi khi các khoảng thời gian bị trùng lặp."""
    from backend.app.services.application_service import validate_and_normalize_time_slots

    slots = [
        {"start_time": "2026-09-01T09:00:00", "end_time": "2026-09-01T11:00:00"},
        {"start_time": "2026-09-01T10:00:00", "end_time": "2026-09-01T12:00:00"}, # Trùng với slot 1
    ]
    with pytest.raises(BadRequestError) as exc_info:
        validate_and_normalize_time_slots(slots)
    assert "trùng lặp" in str(exc_info.value)


def test_validate_and_normalize_time_slots_under_4_hours_gap():
    """Báo lỗi khi các khoảng thời gian cách nhau dưới 4 giờ."""
    from backend.app.services.application_service import validate_and_normalize_time_slots

    slots = [
        {"start_time": "2026-09-01T09:00:00", "end_time": "2026-09-01T10:00:00"},
        {"start_time": "2026-09-01T12:00:00", "end_time": "2026-09-01T13:00:00"}, # Chỉ cách 2h (10h -> 12h)
    ]
    with pytest.raises(BadRequestError) as exc_info:
        validate_and_normalize_time_slots(slots)
    assert "cách nhau ít nhất 4 giờ" in str(exc_info.value)


def test_validate_and_normalize_time_slots_invalid_duration():
    """Báo lỗi khi end_time <= start_time hoặc thời lượng dưới 15 phút."""
    from backend.app.services.application_service import validate_and_normalize_time_slots

    with pytest.raises(BadRequestError):
        validate_and_normalize_time_slots([
            {"start_time": "2026-09-01T10:00:00", "end_time": "2026-09-01T09:00:00"}
        ])

    with pytest.raises(BadRequestError):
        validate_and_normalize_time_slots([
            {"start_time": "2026-09-01T10:00:00", "end_time": "2026-09-01T10:05:00"} # 5 phút < 15 phút
        ])


def test_extract_slot_start_iso():
    """Kiểm tra trích xuất start_time từ các định dạng chuỗi slot khác nhau."""
    from backend.app.services.application_service import extract_slot_start_iso

    # Dạng start/end với ISO datetime
    assert extract_slot_start_iso("2026-09-11T17:00:00/2026-09-15T11:00:00") == "2026-09-11T17:00:00"
    # Dạng start - end
    assert extract_slot_start_iso("2026-09-11T09:00:00 - 2026-09-11T10:00:00") == "2026-09-11T09:00:00"
    # Dạng ISO có timezone Z
    assert extract_slot_start_iso("2026-09-11T17:00:00Z") == "2026-09-11T17:00:00+00:00"
    # Dạng ISO timestamp đơn lẻ
    assert extract_slot_start_iso("2026-09-11T17:00:00") == "2026-09-11T17:00:00"


@pytest.mark.asyncio
async def test_candidate_confirm_slot_with_range_string():
    """Ứng viên xác nhận slot có dạng chuỗi range start/end -> repository nhận start ISO hợp lệ."""
    from backend.app.api.schemas.application import CandidateInterviewResponseRequest
    from backend.app.services.application_service import ApplicationService

    app_id = uuid4()
    candidate_id = uuid4()
    job_id = uuid4()

    app_data = {
        "id": str(app_id),
        "job_post_id": str(job_id),
        "applicant_user_id": str(candidate_id),
        "resume_id": str(uuid4()),
        "current_status": "interview",
    }
    app_repo = AsyncMock()
    app_repo.get_by_id.return_value = app_data

    interview_repo = AsyncMock()
    interview_repo.candidate_confirm_slot.return_value = {
        "id": str(uuid4()),
        "application_id": str(app_id),
        "scheduled_at": "2026-09-11T17:00:00",
        "proposed_time_slots": ["2026-09-11T17:00:00/2026-09-15T11:00:00"],
        "status": "confirmed",
        "responded_at": "2026-09-01T12:00:00Z",
        "created_at": "2026-09-01T11:00:00Z",
    }

    service = ApplicationService(app_repo, AsyncMock(), MagicMock(), interview_repo)

    req = CandidateInterviewResponseRequest(
        action="confirm",
        selected_slot="2026-09-11T17:00:00/2026-09-15T11:00:00",
    )
    res = await service.candidate_respond_interview(app_id, candidate_id, req)

    assert res.status == "confirmed"
    assert res.scheduled_at is not None
    interview_repo.candidate_confirm_slot.assert_called_once_with(
        application_id=app_id,
        selected_slot="2026-09-11T17:00:00",
    )


