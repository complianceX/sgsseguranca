FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    clamav clamav-daemon ca-certificates dumb-init netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY clamd.conf /etc/clamav/clamd.conf
COPY freshclam.conf /etc/clamav/freshclam.conf
COPY scan-server.mjs /app/scan-server.mjs
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh \
 && mkdir -p /var/lib/clamav /run/clamav \
 && chown -R clamav:clamav /var/lib/clamav /run/clamav /etc/clamav

EXPOSE 8080 3310

USER clamav
ENTRYPOINT ["dumb-init", "--"]
CMD ["/app/entrypoint.sh"]
