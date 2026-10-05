#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SAP_APP_DIR:-/opt/sap/app}"
COMPOSE_FILE="$APP_DIR/deploy/compose.yml"
cd "$APP_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --username=sap --dbname=sap --format=custom --compress=6 \
  | docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T -i api \
      node --input-type=module -e '
        import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (body.byteLength < 1024) throw new Error("PostgreSQL backup stream is unexpectedly small");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const key = `db-backups/sap/${timestamp}.dump`;
        const s3 = new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: process.env.S3_REGION,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          },
        });

        try {
          await s3.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: "application/vnd.postgresql.custom",
          }));
          const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
          if (head.ContentLength !== body.byteLength) throw new Error("Uploaded backup size did not verify");
          console.log(JSON.stringify({ ok: true, key, bytes: body.byteLength }));
        } finally {
          s3.destroy();
        }
      '
