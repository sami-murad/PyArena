from __future__ import annotations


class ServiceError(Exception):
    """A domain error that maps cleanly onto an HTTP status code."""

    def __init__(
        self, status_code: int, message: str, code: str | None = None, retry_after: float | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.retry_after = retry_after


def not_found(message: str = "Not found.") -> ServiceError:
    return ServiceError(404, message, "not_found")


def forbidden(message: str = "You do not have access to this resource.") -> ServiceError:
    return ServiceError(403, message, "forbidden")


def conflict(message: str, code: str = "conflict") -> ServiceError:
    return ServiceError(409, message, code)


def too_many(message: str, retry_after: float | None = None) -> ServiceError:
    return ServiceError(429, message, "rate_limited", retry_after)
