from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ParsedCvLine(BaseModel):
    name: str
    value: str


class CvHeaderInfo(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None


class IngestResponse(BaseModel):
    status: str
    markdown: str | None = None
    lines: list[ParsedCvLine] = []
    header: CvHeaderInfo | None = None


class SetResumePublicRequest(BaseModel):
    is_public: bool


class SetResumePublicResponse(BaseModel):
    id: str
    is_public: bool
    message: str


class DeleteResumeResponse(BaseModel):
    id: str
    deleted: bool
    message: str


