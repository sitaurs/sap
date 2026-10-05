FROM postgis/postgis:18-3.6 AS pgvector-build

ARG PGVECTOR_VERSION=v0.8.6

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates git postgresql-server-dev-18 \
    && git clone --depth 1 --branch "${PGVECTOR_VERSION}" https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && make -C /tmp/pgvector \
    && make -C /tmp/pgvector install \
    && rm -rf /tmp/pgvector /var/lib/apt/lists/*

FROM postgis/postgis:18-3.6

COPY --from=pgvector-build /usr/lib/postgresql/18/lib/vector.so /usr/lib/postgresql/18/lib/vector.so
COPY --from=pgvector-build /usr/share/postgresql/18/extension/vector* /usr/share/postgresql/18/extension/
