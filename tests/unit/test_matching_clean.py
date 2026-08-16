from backend.app.services.matching.parse import clean_markdown


def test_clean_markdown_promotes_known_section_headings():
    cleaned = clean_markdown("kỹ năng\nPython\nFastAPI")
    assert "## Skills" in cleaned
    assert "Python" in cleaned
