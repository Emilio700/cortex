"""Domain/business-logic services, kept separate from HTTP routing.

Historically, business rules (agenda collision checks, status-transition
validation, BMI calculation) lived directly inside FastAPI route handlers,
mixed with request/response orchestration. That made the rules hard to unit
test without spinning up the whole app, and hard to reuse if a second entry
point (e.g. a background job) ever needed the same logic.

This package holds that logic instead. Routers should call into these
services rather than reimplementing the rules inline.
"""
