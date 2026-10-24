"""Small text-sanitization helpers for user-supplied free-text fields."""
import re

# Strips ASCII control characters (except normal whitespace like \t, \n, \r,
# which .strip() already trims from the edges) - these have shown up in
# uploaded document titles/lab names with no validation at all today.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_text(value: str, max_length: int) -> str:
    """Strip control characters and clamp length for a free-text field.

    This does not HTML-escape the value: the frontend renders these fields as
    plain text (React escapes by default; there is no ``dangerouslySetInnerHTML``
    in this codebase), so the actual risk closed here is stored garbage bytes
    and unbounded length, not script injection.
    """
    cleaned = _CONTROL_CHARS_RE.sub("", value).strip()
    return cleaned[:max_length]
