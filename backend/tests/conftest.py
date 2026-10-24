"""Pytest configuration.

Sets the environment variables required by ``app.core.config`` before any
application module is imported, so unit tests can run without a real .env file
or database connection (the engine is created lazily and never connects here).
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")
os.environ.setdefault("ENVIRONMENT", "development")
