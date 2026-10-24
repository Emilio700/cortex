"""Reports Pydantic schemas (Fase 3.7)"""
from datetime import date, datetime
from decimal import Decimal
from typing import List

from pydantic import BaseModel

from app.models.appointment import AppointmentStatus


class AppointmentStatusCount(BaseModel):
    status: AppointmentStatus
    count: int


class DailyCount(BaseModel):
    day: date
    count: int


class TopServiceRow(BaseModel):
    service_id: int
    service_name: str
    times_charged: int
    total_amount: Decimal


class ReportsSummary(BaseModel):
    """Aggregate operational report over a date range (Fase 3.7).

    Consolidates the stats a clinic actually asks for day to day (appointment
    volume/status mix, most-requested services, patients seen) into one
    response instead of several thin endpoints.
    """

    start_date: datetime
    end_date: datetime

    appointments_total: int
    appointments_by_status: List[AppointmentStatusCount]
    appointments_daily: List[DailyCount]

    top_services: List[TopServiceRow]

    patients_attended_count: int
    patients_attended_daily: List[DailyCount]
