FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc g++ openjdk-17-jre-headless openjdk-17-jdk-headless \
       nodejs python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home --shell /usr/sbin/nologin compiler

COPY runner.py /opt/compiler/runner.py
RUN chmod 0555 /opt/compiler/runner.py
USER compiler
WORKDIR /workspace
ENTRYPOINT ["python3", "/opt/compiler/runner.py"]
