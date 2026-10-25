# Respaldos de MediSuite: pg_dump diario + tar del volumen de archivos, retención local,
# cifrado opcional con age y copia opcional a almacenamiento S3 compatible con rclone.
FROM postgres:17-alpine
RUN apk add --no-cache age rclone tzdata coreutils
COPY --chmod=0755 backup.sh restore.sh /usr/local/bin/
ENV BACKUP_DIR=/backups \
    BACKUP_TIME=03:15 \
    BACKUP_RETENTION_DAYS=14 \
    TZ=America/Mexico_City
VOLUME /backups
HEALTHCHECK --interval=1h --timeout=10s --start-period=10m \
  CMD backup.sh check
ENTRYPOINT ["backup.sh"]
CMD ["loop"]
