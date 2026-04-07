import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { LevyNotice } from "@/lib/pdf/templates/levy-notice";
import type { LevyNoticeProps } from "@/lib/pdf/types";

function getR2() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = process.env.R2_BUCKET_NAME ?? "msm-company-logos";

/**
 * Generate a levy notice PDF, upload to R2, return the public URL.
 */
export async function generateAndUploadLevyPDF(
  props: LevyNoticeProps,
  subdivisionId: string,
  referenceNumber: string,
): Promise<string> {
  // Generate PDF buffer
  const element = createElement(LevyNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  // Upload to R2
  const key = `levies/${subdivisionId}/${referenceNumber}.pdf`;
  const r2 = getR2();

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  return publicUrl;
}

/**
 * Generate a levy notice PDF buffer (for email attachment, no R2 upload).
 */
export async function generateLevyPDFBuffer(props: LevyNoticeProps): Promise<Buffer> {
  const element = createElement(LevyNotice, props);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(element as any);
}
