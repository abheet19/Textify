FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TEXTIFY_REQUIRE_ACCESS_CODE=1 \
    PORT=8080

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/__init__.py app/main.py app/rag.py app/guard.py ./app/
COPY app/web ./app/web

RUN groupadd --gid 10001 textify \
    && useradd --uid 10001 --gid textify --create-home --home-dir /home/textify \
        --shell /usr/sbin/nologin textify

# Keep revision-only metadata after expensive dependency layers for reusable builds.
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/abheet19/Textify" \
      org.opencontainers.image.revision="${VCS_REF}"
ENV TEXTIFY_RELEASE_SHA="${VCS_REF}"
USER textify:textify

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
