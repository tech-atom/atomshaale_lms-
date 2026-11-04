FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# In Debian slim images, /usr/share/man directories are stripped to save space.
# We must create /usr/share/man/man1 so JDK post-install symlink scripts don't fail.
RUN mkdir -p /usr/share/man/man1 /usr/share/man/man2 /usr/share/man/man7 \
    && apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        default-jdk-headless \
        nodejs \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["gunicorn", "atomm_lms.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "60", "--access-logfile", "-"]
