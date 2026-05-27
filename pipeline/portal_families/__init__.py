"""Portal-family parsers for SP municipal sites.

Each module exposes:
    find_documents(cod_ibge: int, url_base: str) -> list[dict]
where each dict has keys: tipo, ano, url_pdf, titulo, numero_lei (optional).
"""
