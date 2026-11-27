# syntax=docker/dockerfile:1
FROM debian:bookworm-slim@sha256:e67eeead736ff7bbe258ef088bff683635c561b1fcfefad0806c1df4ab49ce0e

ARG TARGETARCH
ARG RENODE_VERSION=1.17.0
ARG RENODE_SHA256_AMD64=4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f
ARG RENODE_SHA256_ARM64=e9051578411441bfb47b77de0381cfba3badce03663367fab561472fd7807f1f

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-venv libicu72 \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) asset="linux-portable"; sum="${RENODE_SHA256_AMD64}" ;; \
      arm64) asset="linux-arm64-portable"; sum="${RENODE_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/renode.tar.gz "https://github.com/renode/renode/releases/download/v${RENODE_VERSION}/renode-${RENODE_VERSION}.${asset}.tar.gz"; \
    echo "${sum}  /tmp/renode.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/renode; \
    tar xzf /tmp/renode.tar.gz -C /opt/renode --strip-components=1; \
    rm /tmp/renode.tar.gz

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev python3-dev \
    && python3 -m venv /opt/renode-venv \
    && /opt/renode-venv/bin/pip install -r /opt/renode/tests/requirements.txt \
    && apt-get purge -y --auto-remove gcc libc6-dev python3-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PATH=/opt/renode-venv/bin:/opt/renode:$PATH \
    RENODE_VERSION=${RENODE_VERSION}

WORKDIR /work
CMD ["renode-test", "--version"]
