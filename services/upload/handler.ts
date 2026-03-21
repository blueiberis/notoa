import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuid } from "uuid";

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET!;

export const handler = async (event: any) => {
  const body = JSON.parse(event.body);
  const key = `${uuid()}.txt`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body.content }));
  return { statusCode: 200, body: JSON.stringify({ key }) };
};
