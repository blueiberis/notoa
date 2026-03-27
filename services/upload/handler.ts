import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { generateUUID } from "../uuid";
import { createHandler, LambdaEvent, LambdaContext } from "../handler";

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET!;

export const handler = createHandler('upload-service')(async (event: LambdaEvent, context: LambdaContext, userClaims: any) => {
  // User must be authenticated for uploads
  if (!userClaims) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" })
    };
  }

  const body = JSON.parse(event.body || '{}');
  const key = `${userClaims.sub || userClaims['cognito:username']}/${generateUUID()}.txt`;
  
  await s3.send(new PutObjectCommand({ 
    Bucket: BUCKET, 
    Key: key, 
    Body: body.content 
  }));
  
  return { 
    statusCode: 200, 
    body: JSON.stringify({ 
      key,
      userId: userClaims.sub || userClaims['cognito:username'],
      uploadedAt: new Date().toISOString()
    }) 
  };
});
