import logging

from backend.app.observability.logger import _SensitiveDataFilter, configure_logging, safe_extra


def test_safe_extra_drops_sensitive_keys():
    result = safe_extra(user_id="u1", password="p", api_key="k", Authorization="Bearer x", note="ok")
    assert result == {"user_id": "u1", "note": "ok"}


def test_sensitive_data_filter_redacts_matching_attrs():
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    record.authorization = "Bearer abc"
    record.user_id = "u1"

    assert _SensitiveDataFilter().filter(record) is True
    assert record.authorization == "***REDACTED***"
    assert record.user_id == "u1"


def test_configure_logging_installs_sensitive_data_filter():
    configure_logging("INFO")
    root = logging.getLogger()
    assert any(isinstance(f, _SensitiveDataFilter) for f in root.filters)
