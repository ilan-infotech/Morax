"""Populate/reset-safe MORAX demo master data.

Run after migrations: `python seed.py`
"""
from app.main import seed_baseline


if __name__ == "__main__":
    seed_baseline()
    print("MORAX baseline seed data is ready.")
