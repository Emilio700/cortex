"""Triage business rules: derived clinical calculations.

Extracted verbatim from ``app/routers/triage.py`` (Fase 2.3 of the roadmap).
"""
from typing import Optional


def calculate_bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    """
    Calculate BMI (Body Mass Index)

    Args:
        weight_kg: Weight in kilograms
        height_cm: Height in centimeters

    Returns:
        BMI value rounded to 1 decimal place, or None if either input is missing
    """
    if not weight_kg or not height_cm:
        return None

    height_m = height_cm / 100
    return round(weight_kg / (height_m**2), 1)
