"""Concurrent compiler API load test.

Example:
  python scripts/load_test_compiler.py --url https://lms.example.com/exam/api/compile-code/ --users 3000 --cookie sessionid=...
"""

import argparse
import json
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PAYLOAD = {"code": "print(2 + 3)", "language": "python", "input": ""}


def request_json(url, method="GET", body=None, cookie=None):
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    request = Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers=headers,
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=60) as response:
            data = json.loads(response.read())
            return response.status, data, time.perf_counter() - started
    except (HTTPError, URLError, TimeoutError) as exc:
        return getattr(exc, "code", 0), {"error": str(exc)}, time.perf_counter() - started


def run_one(url, cookie, poll_seconds):
    status, data, submit_time = request_json(url, "POST", PAYLOAD, cookie)
    if status != 202 or not data.get("job_id"):
        return {"submit": submit_time, "complete": None, "status": status, "error": data}

    status_url = url.rstrip("/") + "/" + str(data["job_id"]) + "/"
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        time.sleep(poll_seconds)
        status, result, poll_time = request_json(status_url, cookie=cookie)
        if status >= 400:
            return {"submit": submit_time, "complete": None, "status": status, "error": result}
        if result.get("status") in {"queued", "pending", "started", "retry"}:
            continue
        return {
            "submit": submit_time,
            "complete": time.perf_counter(),
            "status": status,
            "error": result.get("error") if not result.get("success") else None,
        }
    return {"submit": submit_time, "complete": None, "status": 408, "error": "poll timeout"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--users", type=int, default=100)
    parser.add_argument("--cookie", default="")
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    args = parser.parse_args()
    workers = args.workers or min(args.users, 256)
    started = time.perf_counter()
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_one, args.url, args.cookie, args.poll_seconds) for _ in range(args.users)]
        for future in as_completed(futures):
            results.append(future.result())

    submissions = [item["submit"] for item in results]
    completed = [item for item in results if item["complete"] is not None]
    errors = [item for item in results if item["status"] >= 400 or item.get("error")]
    print(json.dumps({
        "users": args.users,
        "client_workers": workers,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "accepted_or_completed": len(completed),
        "errors": len(errors),
        "submit_p50_seconds": round(statistics.median(submissions), 3) if submissions else None,
        "submit_p95_seconds": round(statistics.quantiles(submissions, n=20)[18], 3) if len(submissions) >= 20 else None,
        "sample_errors": errors[:10],
    }, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
