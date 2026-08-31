from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, detail: str, code: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


class BadRequestError(AppError):
    def __init__(self, detail: str, code: str = "BAD_REQUEST") -> None:
        super().__init__(400, detail, code)


class UnauthorizedError(AppError):
    def __init__(self, detail: str = "Unauthorized", code: str = "UNAUTHORIZED") -> None:
        super().__init__(401, detail, code)


class ForbiddenError(AppError):
    def __init__(self, detail: str = "Forbidden", code: str = "FORBIDDEN") -> None:
        super().__init__(403, detail, code)


class NotFoundError(AppError):
    def __init__(self, detail: str = "Not found", code: str = "NOT_FOUND") -> None:
        super().__init__(404, detail, code)


class ConflictError(AppError):
    def __init__(self, detail: str, code: str = "CONFLICT") -> None:
        super().__init__(409, detail, code)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return await request_validation_exception_handler(request, exc)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler_custom(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return await http_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        # Ghi log chi tiết lỗi hệ thống chưa được bắt
        import logging
        logging.getLogger(__name__).exception("Unhandled server error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
        )


def error_body(detail: str, code: str) -> dict[str, Any]:
    return {"detail": detail, "code": code}
