"""
Medication search service — integrates with OpenFDA drug API and local cache.

Architecture:
  1. All searches hit the local ``medication_cache`` table first (fast, offline).
  2. If the local cache has few/no results, the service queries OpenFDA
     (https://api.fda.gov/drug/label.json) as a fallback.
  3. Results from OpenFDA are cached locally for subsequent searches.
  4. A scheduled job (see ``app.core.scheduler``) can refresh popular searches.

OpenFDA rate limit: 240 requests per minute per IP (generous, but we cache
aggressively to minimise external calls).
"""
import json
import re
from typing import Any

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.medication_cache import MedicationCache

OPENFDA_BASE = "https://api.fda.gov/drug/label.json"
# Limit results per OpenFDA query so we don't overwhelm the cache with 1000s
# of rows for generic terms
OPENFDA_LIMIT = 25

# Spanish → English drug name mapping for common medications.
# OpenFDA only indexes English names, but Mexican doctors search in Spanish.
# When a Spanish term is detected, we also search its English equivalent.
DRUG_NAME_ES_EN: dict[str, str] = {
    "paracetamol": "acetaminophen",
    "ibuprofeno": "ibuprofen",
    "diclofenaco": "diclofenac",
    "omeprazol": "omeprazole",
    "amoxicilina": "amoxicillin",
    "metformina": "metformin",
    "losartan": "losartan",
    "enalapril": "enalapril",
    "captopril": "captopril",
    "naproxeno": "naproxen",
    "ketorolaco": "ketorolac",
    "tramadol": "tramadol",
    "gabapentina": "gabapentin",
    "pregabalina": "pregabalin",
    "sertralina": "sertraline",
    "fluoxetina": "fluoxetine",
    "levotiroxina": "levothyroxine",
    "prednisona": "prednisone",
    "dexametasona": "dexamethasone",
    "salbutamol": "albuterol",
    "budesonida": "budesonide",
    "clonazepam": "clonazepam",
    "alprazolam": "alprazolam",
    "diazepam": "diazepam",
    "atorvastatina": "atorvastatin",
    "simvastatina": "simvastatin",
    "azitromicina": "azithromycin",
    "ciprofloxacino": "ciprofloxacin",
    "cefalexina": "cephalexin",
    "doxiciclina": "doxycycline",
    "clindamicina": "clindamycin",
    "metronidazol": "metronidazole",
    "ranitidina": "ranitidine",
    "furosemida": "furosemide",
    "espironolactona": "spironolactone",
    "hidroclorotiazida": "hydrochlorothiazide",
    "carvedilol": "carvedilol",
    "metoprolol": "metoprolol",
    "propranolol": "propranolol",
    "amlodipino": "amlodipine",
    "nifedipino": "nifedipine",
    "verapamilo": "verapamil",
    "glibenclamida": "glyburide",
    "insulina": "insulin",
    "loratadina": "loratadine",
    "cetirizina": "cetirizine",
    "difenhidramina": "diphenhydramine",
    "ergocalciferol": "ergocalciferol",
    "colecalciferol": "cholecalciferol",
    "acido_folico": "folic acid",
    "hidroxido": "hydroxide",
    "carbonato": "carbonate",
    "cloruro": "chloride",
    "sodio": "sodium",
    "potasio": "potassium",
    "magnesio": "magnesium",
    "calcio": "calcium",
    "hierro": "iron",
    "zinc": "zinc",
}


# ---------------------------------------------------------------------------
# Local cache search
# ---------------------------------------------------------------------------

def search_local_cache(
    db: Session,
    query: str,
    limit: int = 20,
) -> list[MedicationCache]:
    """Search the local medication cache by brand name, generic name, or
    active ingredient (case-insensitive). Results are ordered by relevance:
    exact match first, then prefix match, then contains match."""
    pattern = f"%{query}%"
    prefix = f"{query}%"

    return (
        db.query(MedicationCache)
        .filter(
            or_(
                MedicationCache.brand_name.ilike(pattern),
                MedicationCache.generic_name.ilike(pattern),
                MedicationCache.active_ingredient.ilike(pattern),
            )
        )
        .order_by(
            # Prioritize: starts-with over contains
            MedicationCache.brand_name.ilike(prefix).desc(),
            MedicationCache.brand_name,
        )
        .limit(limit)
        .all()
    )


def _resolve_search_queries(query: str) -> list[str]:
    """Resolve search queries from a user input, including Spanish→English translation.

    Returns a list of query strings to search for. The original query is always first.
    If the query or any of its partial matches map to a known Spanish drug name,
    the English equivalent is added."""
    queries = [query.strip()]
    query_lower = query.strip().lower().replace(" ", "_")

    # Direct match: "paracetamol" → "acetaminophen"
    if query_lower in DRUG_NAME_ES_EN:
        en = DRUG_NAME_ES_EN[query_lower]
        if en != query_lower.replace("_", " "):
            queries.append(en)

    # Partial match: check if query is a prefix of any Spanish drug name
    if len(query.strip()) >= 3:
        for es_name, en_name in DRUG_NAME_ES_EN.items():
            if es_name.startswith(query_lower) and en_name not in queries:
                queries.append(en_name)

    return queries


# ---------------------------------------------------------------------------
# OpenFDA integration
# ---------------------------------------------------------------------------

def _clean_text(text: Any) -> str:
    """Safely convert a raw value from the FDA JSON to a clean string."""
    if isinstance(text, list):
        text = " ".join(str(t) for t in text)
    return str(text).strip() if text else ""


def _parse_openfda_result(item: dict) -> dict | None:
    """Parse a single OpenFDA drug label result into our cache model fields.

    Returns None if the item lacks enough information to be useful."""
    try:
        openfda = item.get("openfda", {}) or {}
    except Exception:
        openfda = {}

    brand_name = _clean_text(openfda.get("brand_name", ""))
    generic_name = _clean_text(openfda.get("generic_name", ""))
    active_ingredient = _clean_text(openfda.get("substance_name", ""))

    # Skip entries with neither brand nor generic name
    if not brand_name and not generic_name:
        return None

    # Extract active ingredients from the label
    if not active_ingredient:
        active_ingredients_list = openfda.get("active_ingredient", [])
        if active_ingredients_list:
            active_ingredient = _clean_text(active_ingredients_list)

    # Build presentations from the drug label's dosage form + route
    dosage_form = _clean_text(item.get("dosage_and_administration", ""))
    route = _clean_text(item.get("route", ""))

    presentations = []
    if dosage_form:
        # dosage_form may be long text; take first line/sentence as the form
        first_form = dosage_form.split(".")[0].split("\n")[0][:100].strip()
        presentations.append({
            "form": first_form,
            "dosage": "",
            "route": route[:50] if route else "Oral",
        })

    # Extract common dosages from dosage_and_administration text
    common_dosages = []
    if dosage_form:
        # Find patterns like "500 mg", "1 g", "250mg" using regex
        dosage_matches = re.findall(r"(\d+)\s*(mg|g|mcg|ml)", dosage_form, re.IGNORECASE)
        seen = set()
        for amount, unit in dosage_matches:
            normalized = f"{amount}{unit.lower()}"
            if normalized not in seen:
                seen.add(normalized)
                common_dosages.append(f"{amount} {unit.upper()}")

    # Build common frequencies based on typical patterns
    common_frequencies = []
    if item.get("dosage_and_administration"):
        text_lower = dosage_form.lower()
        if "twice" in text_lower or "twice" in text_lower or "two times" in text_lower:
            common_frequencies.append("Cada 12 horas")
        if "once" in text_lower or "daily" in text_lower or "once" in text_lower:
            common_frequencies.append("Cada 24 horas")
        if "three times" in text_lower:
            common_frequencies.append("Cada 8 horas")
        if "four times" in text_lower:
            common_frequencies.append("Cada 6 horas")
        if "every" in text_lower:
            common_frequencies.append("Cada 12 horas")
            common_frequencies.append("Cada 8 horas")

    # Default frequency if nothing was extracted
    if not common_frequencies:
        common_frequencies = ["Cada 8 horas", "Cada 12 horas", "Cada 24 horas"]

    return {
        "brand_name": brand_name or generic_name,
        "generic_name": generic_name or brand_name,
        "active_ingredient": active_ingredient,
        "presentations": presentations or [{"form": "No especificada", "dosage": "", "route": "Oral"}],
        "common_dosages": common_dosages or [],
        "common_frequencies": common_frequencies,
        "data_source": "openfda",
    }


async def fetch_from_openfda(query: str) -> list[dict]:
    """Query the OpenFDA drug label endpoint and return parsed results.

    Tries multiple search strategies in order:
      1. Original query on brand_name, generic_name, and substance_name
      2. If the query matches a Spanish drug name, also searches its English equivalent

    Returns a list of dicts ready to be saved to the cache."""
    # Determine queries to search: original + English translation if available
    queries_to_try = [query]
    query_lower = query.lower().replace(" ", "_")
    if query_lower in DRUG_NAME_ES_EN:
        english = DRUG_NAME_ES_EN[query_lower]
        if english != query_lower:
            queries_to_try.append(english)

    search_strategies = [
        "openfda.brand_name:{q}*",
        "openfda.generic_name:{q}*",
        "openfda.substance_name:{q}*",
    ]
    all_parsed: list[dict] = []
    seen_names: set[str] = set()

    for q in queries_to_try:
        for strategy_template in search_strategies:
            strategy = strategy_template.format(q=q)
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(
                        OPENFDA_BASE, params={"search": strategy, "limit": OPENFDA_LIMIT}
                    )
                    resp.raise_for_status()
                    data = resp.json()
            except (httpx.HTTPError, json.JSONDecodeError, KeyError):
                continue

            results = data.get("results", [])
            for item in results:
                entry = _parse_openfda_result(item)
                if entry:
                    norm = _normalize_brand_name(entry["brand_name"])
                    if norm not in seen_names:
                        seen_names.add(norm)
                        all_parsed.append(entry)

        # If we found enough results, stop searching
        if len(all_parsed) >= OPENFDA_LIMIT:
            break

    return all_parsed


def _normalize_brand_name(name: str) -> str:
    """Normalize a brand name for duplicate detection."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


async def cache_openfda_results(db: Session, query: str) -> int:
    """Fetch results from OpenFDA for a query, store them in the local cache,
    and return the number of new entries saved."""
    results = await fetch_from_openfda(query)
    if not results:
        return 0

    # Get existing brand names to avoid duplicates
    existing = {
        _normalize_brand_name(r.brand_name)
        for r in db.query(MedicationCache.brand_name).all()
    }

    new_count = 0
    for entry in results:
        normalized = _normalize_brand_name(entry["brand_name"])
        if normalized in existing:
            continue

        cache_entry = MedicationCache(
            brand_name=entry["brand_name"],
            generic_name=entry.get("generic_name"),
            active_ingredient=entry.get("active_ingredient"),
            presentations=entry.get("presentations"),
            common_dosages=entry.get("common_dosages", []),
            common_frequencies=entry.get("common_frequencies", []),
            data_source=entry.get("data_source", "openfda"),
        )
        db.add(cache_entry)
        existing.add(normalized)
        new_count += 1

    db.commit()
    return new_count


# ---------------------------------------------------------------------------
# Main search orchestrator
# ---------------------------------------------------------------------------

async def search_medications(db: Session, query: str, limit: int = 20) -> dict:
    """Search medications across local cache and OpenFDA fallback.

    Supports partial searches and Spanish drug names. For example, typing "para"
    will find "Acetaminophen" (via paracetamol→acetaminophen translation).

    Returns a dict with:
      - ``results``: list of medication dicts
      - ``source``: ``"cache"``, ``"openfda"``, or ``"cache+openfda"``
      - ``total``: total result count
    """
    query = query.strip()
    if not query or len(query) < 2:
        return {"results": [], "source": "none", "total": 0}

    # Resolve all search queries (original + English translations)
    search_queries = _resolve_search_queries(query)

    # 1. Search local cache with all resolved queries
    all_cached: list[MedicationCache] = []
    seen_names: set[str] = set()
    for q in search_queries:
        cached = search_local_cache(db, q, limit=limit)
        for c in cached:
            key = c.brand_name.lower()
            if key not in seen_names:
                seen_names.add(key)
                all_cached.append(c)

    # 2. If sufficient results from cache, return them
    if len(all_cached) >= limit:
        return {
            "results": [_med_to_dict(m) for m in all_cached[:limit]],
            "source": "cache",
            "total": len(all_cached),
        }

    # 3. Fallback: fetch from OpenFDA and cache results
    new_count = 0
    for q in search_queries:
        count = await cache_openfda_results(db, q)
        new_count += count

    # 4. Re-search cache (now includes newly cached results)
    all_results: list[MedicationCache] = []
    seen_names2: set[str] = set()
    for q in search_queries:
        results = search_local_cache(db, q, limit=limit)
        for c in results:
            key = c.brand_name.lower()
            if key not in seen_names2:
                seen_names2.add(key)
                all_results.append(c)

    source = "openfda" if new_count > 0 else "cache"

    return {
        "results": [_med_to_dict(m) for m in all_results[:limit]],
        "source": source,
        "total": len(all_results),
    }


def _med_to_dict(med: MedicationCache) -> dict:
    """Convert a MedicationCache ORM row to a plain dict for JSON response."""
    return {
        "id": med.id,
        "brand_name": med.brand_name,
        "generic_name": med.generic_name,
        "active_ingredient": med.active_ingredient,
        "presentations": med.presentations or [],
        "common_dosages": med.common_dosages or [],
        "common_frequencies": med.common_frequencies or [],
        "last_updated": med.last_updated.isoformat() if med.last_updated else None,
        "data_source": med.data_source,
    }
