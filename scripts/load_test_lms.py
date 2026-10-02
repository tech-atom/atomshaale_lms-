"""Run an authenticated, concurrent LMS exam workflow against staging.

Example:
  python scripts/load_test_lms.py --url https://staging.example.com \
    --users-file staging-users.csv --users 100 \
    --scheduled-exam 00000000-0000-0000-0000-000000000000 \
    --compile-rate 0.1 --report reports/lms-100.json
"""

import argparse
import csv
import json
import random
import re
import statistics
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener


CSRF_RE = re.compile(r'name=["\']csrfmiddlewaretoken["\'][^>]*value=["\']([^"\']+)', re.I)
CSRF_RE_REVERSED = re.compile(r'value=["\']([^"\']+)["\'][^>]*name=["\']csrfmiddlewaretoken["\']', re.I)


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, msg, headers, newurl):
        return None


def percentile(values, level):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((level / 100) * (len(ordered) - 1)))))
    return round(ordered[index], 4)


def read_users(path, limit):
    with open(path, newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    missing = [field for field in ("email", "password") if not rows or field not in rows[0]]
    if missing:
        raise ValueError(f"users file must contain columns: {', '.join(missing)}")
    if len(rows) < limit:
        raise ValueError(f"users file contains {len(rows)} users, but {limit} requested")
    return rows[:limit]


class StudentSession:
    def __init__(self, base_url, row, scheduled_exam_id, compile_rate, timeout):
        self.base_url = base_url.rstrip("/")
        self.row = row
        self.scheduled_exam_id = scheduled_exam_id
        self.compile_rate = compile_rate
        self.timeout = timeout
        self.cookies = CookieJar()
        self.opener = build_opener(NoRedirectHandler, HTTPCookieProcessor(self.cookies))
        self.csrf = ""
        self.device_token = str(uuid.uuid4())
        self.timings = []

    def request(self, path, method="GET", payload=None, csrf=False):
        url = path if path.startswith("http") else self.base_url + path
        headers = {"Accept": "application/json, text/html"}
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode()
        if csrf and self.csrf:
            headers["X-CSRFToken"] = self.csrf
        request = Request(url, data=data, method=method, headers=headers)
        started = time.perf_counter()
        try:
            response = self.opener.open(request, timeout=self.timeout)
            body = response.read()
            status = response.status
        except HTTPError as exc:
            body = exc.read()
            status = exc.code
        except (URLError, TimeoutError) as exc:
            return 0, {}, time.perf_counter() - started, str(exc)
        elapsed = time.perf_counter() - started
        content_type = response.headers.get("Content-Type", "") if "response" in locals() else ""
        if "json" in content_type or body[:1] in (b"{", b"["):
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                parsed = {"raw": body[:200].decode(errors="replace")}
        else:
            parsed = {"html": body.decode(errors="replace")}
        return status, parsed, elapsed, ""

    def login(self):
        status, page, _, error = self.request("/users/login/")
        if error or status >= 400:
            return False, f"login page {status}: {error or page}"
        html = page.get("html", "")
        match = CSRF_RE.search(html) or CSRF_RE_REVERSED.search(html)
        self.csrf = match.group(1) if match else next(
            (cookie.value for cookie in self.cookies if cookie.name == "csrftoken"),
            "",
        )
        form = urlencode({
            "csrfmiddlewaretoken": self.csrf,
            "email": self.row["email"],
            "password": self.row["password"],
        }).encode()
        request = Request(self.base_url + "/users/login/", data=form, method="POST", headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": self.csrf,
            "X-Requested-With": "XMLHttpRequest",
        })
        started = time.perf_counter()
        try:
            response = self.opener.open(request, timeout=self.timeout)
            body = response.read()
            status = response.status
        except HTTPError as exc:
            body = exc.read()
            status = exc.code
        except (URLError, TimeoutError) as exc:
            return False, f"login request: {exc}"
        self.timings.append(("login", time.perf_counter() - started, status))
        if status >= 400:
            return False, f"login {status}: {body[:200].decode(errors='replace')}"
        return True, ""

    def run(self):
        started = time.perf_counter()
        try:
            ok, error = self.login()
            if not ok:
                return self.result(False, error, started)

            status, exams, elapsed, error = self.request("/exam/api/student/exam/")
            self.timings.append(("exam_list", elapsed, status))
            if status >= 400 or error:
                return self.result(False, f"exam list {status}: {error or exams}", started)
            scheduled_id = self.scheduled_exam_id
            if not scheduled_id:
                available = exams.get("exams", [])
                scheduled_id = available[0]["scheduled_exam_id"] if available else ""
            if not scheduled_id:
                return self.result(False, "no scheduled exam available", started)

            questions_path = f"/exam/api/student/exam/{scheduled_id}/questions/?device_token={self.device_token}"
            status, questions, elapsed, error = self.request(questions_path)
            self.timings.append(("questions", elapsed, status))
            if status >= 400 or error:
                return self.result(False, f"questions {status}: {error or questions}", started)

            question_rows = questions.get("questions", [])
            answers = self.make_answers(question_rows)
            live_payload = {
                "schedule_id": scheduled_id,
                "current_question": 1,
                "tab_switch_count": 0,
                "question_time_map": {},
                "status": "active",
                "temp_answers": answers,
                "device_token": self.device_token,
            }
            status, live, elapsed, error = self.request("/exam/api/student/exam/live-update/", "POST", live_payload, True)
            self.timings.append(("autosave", elapsed, status))
            if status >= 400 or error:
                return self.result(False, f"autosave {status}: {error or live}", started)

            time.sleep(random.uniform(0.05, 0.25))
            if self.compile_rate and random.random() < self.compile_rate:
                compile_payload = {"code": "print(2 + 3)", "language": "python", "input": ""}
                status, job, elapsed, error = self.request("/exam/api/compile-code/", "POST", compile_payload, True)
                self.timings.append(("compile_submit", elapsed, status))
                if status == 202 and job.get("job_id"):
                    self.poll_compile(job["job_id"])

            status, submitted, elapsed, error = self.request(
                f"/exam/api/student/exam/{scheduled_id}/submit/",
                "POST",
                {"answers": answers, "device_token": self.device_token},
                True,
            )
            self.timings.append(("submit", elapsed, status))
            return self.result(status < 400 and not error, f"submit {status}: {error or submitted}" if status >= 400 or error else "", started)
        except Exception as exc:
            return self.result(False, f"unexpected: {exc}", started)

    def poll_compile(self, job_id):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            time.sleep(0.5)
            status, result, elapsed, error = self.request(f"/exam/api/compile-code/{job_id}/")
            self.timings.append(("compile_poll", elapsed, status))
            if status >= 400 or error or result.get("status") not in {"queued", "pending", "started", "retry"}:
                return

    @staticmethod
    def make_answers(questions):
        answers = []
        for question in questions:
            if question.get("type") in {"MCQ", "TF"} and question.get("options"):
                answer = next(iter(question["options"]))
            elif question.get("type") == "Code":
                answer = json.dumps({"code": "print(2 + 3)", "language": "python"})
            else:
                answer = "load-test answer"
            answers.append({"question_id": question["id"], "answer": answer})
        return answers

    def result(self, success, error, started):
        return {"success": success, "error": error, "elapsed": time.perf_counter() - started, "timings": self.timings}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--users-file", required=True)
    parser.add_argument("--users", type=int, required=True)
    parser.add_argument("--scheduled-exam", default="")
    parser.add_argument("--compile-rate", type=float, default=0.1)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--report", default="")
    args = parser.parse_args()
    if not 0 <= args.compile_rate <= 1:
        parser.error("--compile-rate must be between 0 and 1")
    users = read_users(args.users_file, args.users)
    workers = args.workers or min(args.users, 256)
    started = time.perf_counter()
    results = []
    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(StudentSession(args.url, row, args.scheduled_exam, args.compile_rate, args.timeout).run) for row in users]
        for future in as_completed(futures):
            with lock:
                results.append(future.result())
    latencies = [result["elapsed"] for result in results]
    errors = [result for result in results if not result["success"]]
    report = {
        "users": args.users,
        "client_workers": workers,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "successful_students": len(results) - len(errors),
        "failed_students": len(errors),
        "error_rate": round(len(errors) / args.users, 6) if args.users else 0,
        "latency_p50_seconds": percentile(latencies, 50),
        "latency_p95_seconds": percentile(latencies, 95),
        "latency_p99_seconds": percentile(latencies, 99),
        "sample_errors": [result["error"] for result in errors[:10]],
        "results": results,
        "metrics": {"source": "external monitoring required"},
    }
    print(json.dumps(report, indent=2))
    if args.report:
        with open(args.report, "w", encoding="utf-8") as stream:
            json.dump(report, stream, indent=2)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())