"""Verify scheduler jobs are registered."""
from app.core.scheduler import scheduler

jobs = scheduler.get_jobs()
print(f"Scheduler running: {scheduler.running}")
print(f"Total jobs: {len(jobs)}")
for j in jobs:
    print(f"  {j.id:35s} {str(j.trigger)[:60]}")
