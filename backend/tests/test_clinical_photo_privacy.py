import io

from PIL import Image

from app.utils.uploads import sanitize_clinical_photo


def test_clinical_photo_is_reencoded_without_exif_and_has_thumbnail():
    source = Image.new("RGB", (1200, 800), color=(120, 30, 80))
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = "sensitive metadata"
    raw = io.BytesIO()
    source.save(raw, format="JPEG", exif=exif)

    normalized, thumbnail, mime = sanitize_clinical_photo(raw.getvalue(), "image/jpeg")

    with Image.open(io.BytesIO(normalized)) as clean:
        assert mime == "image/jpeg"
        assert clean.getexif().get(270) is None
        assert clean.size == (800, 1200)
    with Image.open(io.BytesIO(thumbnail)) as preview:
        assert max(preview.size) <= 480
