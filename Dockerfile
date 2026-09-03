ARG UI_RUNTIME_IMAGE="quay.io/nginx/nginx-unprivileged:1.31.5-alpine3.24@sha256:aa8c9087d36d93e9d650c5365f883b421e8214aedbad24ade52b844c583358f1"

FROM ${UI_RUNTIME_IMAGE}

ARG OCI_SOURCE="https://github.com/cloudinfraz/s3proxy-rs"
ARG OCI_REVISION="unknown"
ARG OCI_VERSION="0.0.0"

LABEL org.opencontainers.image.source="$OCI_SOURCE" \
      org.opencontainers.image.revision="$OCI_REVISION" \
      org.opencontainers.image.version="$OCI_VERSION"

COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
