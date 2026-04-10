import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createHandler, LambdaEvent, LambdaContext } from "../handler";

const sqsClient = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL!;

interface NDISNoteRequest {
  transcript: string;
  participant?: string;
  date?: string;
  location?: string;
  sendEmail?: boolean;
  recordingId?: string;
}

export const handler = createHandler('ndis-notes-service')(async (event: LambdaEvent, context: LambdaContext, userClaims: any) => {
  if (event.httpMethod === "POST") {
    // User is authenticated by API Gateway authorizer
    if (!userClaims) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" })
      };
    }

    try {
      const body: NDISNoteRequest = JSON.parse(event.body || '{}');
      
      if (!body.transcript) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Transcript is required" })
        };
      }

      // Add user context to the request for the processor
      const messageBody = {
        ...body,
        requestId: userClaims.sub || userClaims['cognito:username'],
        recordingId: body.recordingId || null
      };

      // Send message to SQS queue for async processing
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(messageBody)
      }));

      console.log('NDIS note request sent to SQS queue:', {
        requestId: messageBody.requestId,
        participant: body.participant,
        transcriptLength: body.transcript.length
      });

      return {
        statusCode: 202,
        body: JSON.stringify({
          success: true,
          message: "NDIS note generation started. The note will be processed asynchronously and saved to your notes.",
          requestId: messageBody.requestId
        })
      };
    } catch (error) {
      console.error('Error sending NDIS note to queue:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: "Failed to start NDIS note generation",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      };
    }
  }
  
  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Unsupported method" })
  };
});
