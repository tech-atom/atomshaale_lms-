FROM python:3.13-slim

COPY --from=docker:27.5.1-cli /usr/local/bin/docker /usr/local/bin/docker

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
    && rm -rf /var/lib/apt/lists/* \
    && command -v javac \
    && javac -version \
    && command -v java \
    && java -version \
    && docker --version

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "from packaging.version import Version; import redis; assert Version(redis.__version__) >= Version('6.4.0'), f'Redis-py {redis.__version__} is too old for the configured Kombu transport'"
COPY . .

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /var/tmp/lms_uploads \
    && chown -R appuser:appuser /app /var/tmp/lms_uploads \
    && chmod 700 /var/tmp/lms_uploads
USER appuser

EXPOSE 8000
CMD ["gunicorn", "atomm_lms.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "60", "--access-logfile", "-"]
