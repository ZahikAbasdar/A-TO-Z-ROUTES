from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


# ── Standard response envelope ────────────────────────────────────────────────

class APIResponse(BaseModel, Generic[T]):
    """Every API endpoint returns this shape."""
    success: bool
    message: str
    data: Optional[T] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """For list endpoints with pagination."""
    success: bool = True
    message: str = "OK"
    data: list[T]
    total: int
    page: int
    per_page: int
    pages: int


# ── Response helpers ──────────────────────────────────────────────────────────

def success_response(data: Any = None, message: str = "Success") -> dict:
    return {"success": True, "message": message, "data": data}


def error_response(message: str, data: Any = None) -> dict:
    return {"success": False, "message": message, "data": data}


# ── Custom exceptions ─────────────────────────────────────────────────────────

class AppException(Exception):
    """Base application exception."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", status_code=404)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, status_code=401)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message, status_code=403)


class ConflictException(AppException):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, status_code=409)


class ValidationException(AppException):
    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=422)
