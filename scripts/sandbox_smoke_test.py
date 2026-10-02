"""Build and smoke-test the compiler sandbox image.

Run from the repository root after starting Docker:
  python scripts/sandbox_smoke_test.py
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "atomm-lms-compiler-sandbox:smoke"


def run_docker(payload):
    command = ["docker", "run", "--rm", "-i", "--network=none", "--read-only", "--user", "1000:1000", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--pids-limit", "64", "--memory", "256m", "--memory-swap", "256m", "--cpus", "0.5", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--tmpfs", "/workspace:rw,nosuid,size=64m,uid=1000,gid=1000,mode=700", IMAGE]
    result = subprocess.run(command, input=json.dumps(payload), text=True, capture_output=True, timeout=40)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or "sandbox returned non-zero")
    return json.loads(result.stdout)


def main():
    try:
        subprocess.run(["docker", "info"], check=True, capture_output=True)
        subprocess.run(["docker", "build", "-t", IMAGE, "-f", "Compiler/sandbox/Dockerfile", "Compiler/sandbox"], cwd=ROOT, check=True)
        tests = [
            {"code": "print(2 + 3)", "language": "python", "input": ""},
            {"code": "while True: pass", "language": "python", "input": ""},
            {"code": "import urllib.request; urllib.request.urlopen('https://example.com')", "language": "python", "input": ""},
            {"code": "print('x' * 400000)", "language": "python", "input": ""},
        ]
        results = [run_docker(test) for test in tests]
        print(json.dumps(results, indent=2))
        assert results[0]["success"]
        assert results[1]["verdict"] == "Time Limit Exceeded"
        assert results[2]["verdict"] != "Accepted"
        return 0
    except FileNotFoundError:
        print("Docker CLI is not installed or Docker Desktop is unavailable", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        print(f"Docker command failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
