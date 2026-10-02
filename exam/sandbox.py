"""Docker-backed execution boundary for untrusted compiler submissions."""

import json
import subprocess

from django.conf import settings


class SandboxUnavailable(RuntimeError):
    pass


def run_sandboxed(payload):
    """Run compiler work in a disposable, resource-limited container."""
    image = settings.COMPILER_SANDBOX_IMAGE
    if not image:
        raise SandboxUnavailable("Compiler sandbox image is not configured")

    command = [
            settings.COMPILER_DOCKER_BINARY,
            "run",
            "--rm",
            "--init",
            "--network=none",
            "--read-only",
            "--user", "1000:1000",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--pids-limit", str(settings.COMPILER_SANDBOX_PIDS),
            "--memory", str(settings.COMPILER_SANDBOX_MEMORY),
            "--memory-swap", str(settings.COMPILER_SANDBOX_MEMORY),
            "--cpus", str(settings.COMPILER_SANDBOX_CPUS),
            "--ulimit", "nofile=64:64",
            "--ulimit", "fsize=1048576:1048576",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
            "--tmpfs", "/workspace:rw,nosuid,size=64m,uid=1000,gid=1000,mode=700",
            image,
        ]
    try:
        completed = subprocess.run(
            command,
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=settings.COMPILER_SANDBOX_WALL_TIMEOUT,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as exc:
        raise SandboxUnavailable("Docker is not installed on the compiler worker") from exc
    except subprocess.TimeoutExpired as exc:
        raise SandboxUnavailable("Compiler sandbox exceeded its wall-clock limit") from exc
    output = completed.stdout[-settings.COMPILER_OUTPUT_LIMIT:]
    if completed.returncode != 0:
        error = completed.stderr[-settings.COMPILER_OUTPUT_LIMIT:] or "Sandbox execution failed"
        raise RuntimeError(error)
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Compiler sandbox returned invalid output") from exc
