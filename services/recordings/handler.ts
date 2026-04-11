import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateUUID } from "../uuid";
import { createHandler, LambdaEvent, LambdaContext } from "../handler";
import fetch from 'node-fetch';

const s3 = new S3Client({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const BUCKET = process.env.BUCKET!;
const RECORDINGS_TABLE = process.env.RECORDINGS_TABLE_NAME!;

// Debug logging
console.log('Environment variables:', {
  BUCKET: !!BUCKET,
  RECORDINGS_TABLE: !!RECORDINGS_TABLE,
  RECORDINGS_TABLE_VALUE: RECORDINGS_TABLE
});

// Validate environment variables
if (!RECORDINGS_TABLE) {
  throw new Error('RECORDINGS_TABLE_NAME environment variable is not set');
}

interface RecordingMetadata {
  id: string;
  userId: string;
  status: 'recording' | 'paused' | 'stopped' | 'saved' | 'discarded';
  startTime: string;
  endTime?: string;
  duration?: number;
  s3Key?: string;
  s3Url?: string;
  name?: string;
  size?: number;
}

export const handler = createHandler('recordings-service')(async (event: LambdaEvent, context: LambdaContext, userClaims: any) => {
  if (!userClaims) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized" })
    };
  }

  const userId = userClaims.sub || userClaims['cognito:username'];
  const { httpMethod, path } = event;

  // GET /recordings - List user's recordings
  if (httpMethod === "GET" && path === "/recordings") {
    try {
      // Get recordings from DynamoDB
      const scanResult = await ddbClient.send(new ScanCommand({
        TableName: RECORDINGS_TABLE,
        FilterExpression: 'userId = :userId AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':status': 'saved'
        }
      }));
      
      const recordings = scanResult.Items?.map((item: any) => ({
        id: item.id,
        name: item.name || `Recording-${item.startTime}`,
        size: item.size || 0,
        lastModified: item.endTime || item.startTime,
        key: item.s3Key || '',
        userId: item.userId
      })) || [];

      return {
        statusCode: 200,
        body: JSON.stringify({ recordings })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to list recordings", error: (error as Error).message })
      };
    }
  }

  // GET /recordings/{id}/url - Get presigned URL for recording
  if (httpMethod === "GET" && path && path.match(/^\/recordings\/[^\/]+\/url$/)) {
    const recordingId = path.split('/')[2];
    
    try {
      // Get recording from DynamoDB
      const getResult = await ddbClient.send(new GetCommand({
        TableName: RECORDINGS_TABLE,
        Key: { id: recordingId, userId }
      }));
      
      if (!getResult.Item || getResult.Item.userId !== userId) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording not found" })
        };
      }

      const recording = getResult.Item as any;
      
      if (!recording.s3Key) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording file not found" })
        };
      }

      // Generate presigned URL (valid for 1 hour)
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: recording.s3Key
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          id: recording.id,
          name: recording.name,
          size: recording.size,
          lastModified: recording.endTime,
          url: signedUrl, // Use presigned URL
          presignedUrl: signedUrl // Also include for clarity
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to get recording URL", error: (error as Error).message })
      };
    }
  }

  // POST /recordings/start - Start recording
  if (httpMethod === "POST" && path === "/recordings/start") {
    const recordingId = generateUUID();
    const startTime = new Date().toISOString();
    
    // Save to DynamoDB
    await ddbClient.send(new PutCommand({
      TableName: RECORDINGS_TABLE,
      Item: {
        id: recordingId,
        userId,
        status: 'recording',
        startTime
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        recordingId,
        status: 'recording',
        startTime
      })
    };
  }

  // POST /recordings/{id}/pause - Pause recording
  if (httpMethod === "POST" && path && path.match(/^\/recordings\/[^\/]+\/pause$/)) {
    const recordingId = path.split('/')[2];
    
    // Get recording from DynamoDB
    const getResult = await ddbClient.send(new GetCommand({
      TableName: RECORDINGS_TABLE,
      Key: { id: recordingId, userId }
    }));
    
    if (!getResult.Item || getResult.Item.userId !== userId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Recording not found" })
      };
    }

    // Update status to paused
    await ddbClient.send(new PutCommand({
      TableName: RECORDINGS_TABLE,
      Item: {
        ...getResult.Item,
        status: 'paused'
      }
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        recordingId,
        status: 'paused'
      })
    };
  }

  // POST /recordings/{id}/resume - Resume recording
  if (httpMethod === "POST" && path && path.match(/^\/recordings\/[^\/]+\/resume$/)) {
    const recordingId = path.split('/')[2];
    
    // Get recording from DynamoDB
    const getResult = await ddbClient.send(new GetCommand({
      TableName: RECORDINGS_TABLE,
      Key: { id: recordingId, userId }
    }));
    
    if (!getResult.Item || getResult.Item.userId !== userId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Recording not found" })
      };
    }

    // Update status to recording
    await ddbClient.send(new PutCommand({
      TableName: RECORDINGS_TABLE,
      Item: {
        ...getResult.Item,
        status: 'recording'
      }
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        recordingId,
        status: 'recording'
      })
    };
  }

  // POST /recordings/{id}/save - Save recording
  if (httpMethod === "POST" && path && path.match(/^\/recordings\/[^\/]+\/save$/)) {
    const recordingId = path.split('/')[2];
    
    // Get recording from DynamoDB
    const getResult = await ddbClient.send(new GetCommand({
      TableName: RECORDINGS_TABLE,
      Key: { id: recordingId, userId }
    }));
    
    if (!getResult.Item || getResult.Item.userId !== userId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Recording not found" })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { audioData, name } = body;
    
    if (!audioData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Audio data is required" })
      };
    }

    try {
      const recordingName = name || `Recording-${new Date().toISOString().slice(0, 19)}`;
      const key = `recordings/${userId}/${recordingName}.webm`;
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: audioBuffer,
        ContentType: 'audio/webm',
        Metadata: {
          userId,
          recordingId,
          originalStartTime: getResult.Item.startTime,
          savedAt: new Date().toISOString()
        }
      }));

      // Update recording in DynamoDB with S3 info
      await ddbClient.send(new PutCommand({
        TableName: RECORDINGS_TABLE,
        Item: {
          ...getResult.Item,
          status: 'saved',
          endTime: new Date().toISOString(),
          s3Key: key,
          s3Url: `https://${BUCKET}.s3.amazonaws.com/${key}`,
          name: recordingName,
          size: audioBuffer.length
        }
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          recordingId,
          status: 'saved',
          key,
          url: `https://${BUCKET}.s3.amazonaws.com/${key}`,
          name: recordingName
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to save recording", error: (error as Error).message })
      };
    }
  }

  // DELETE /recordings/{id}/discard - Discard recording
  if (httpMethod === "DELETE" && path && path.match(/^\/recordings\/[^\/]+\/discard$/)) {
    const recordingId = path.split('/')[2];
    
    // Get recording from DynamoDB
    const getResult = await ddbClient.send(new GetCommand({
      TableName: RECORDINGS_TABLE,
      Key: { id: recordingId, userId }
    }));
    
    if (!getResult.Item || getResult.Item.userId !== userId) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Recording not found" })
      };
    }

    // Update recording status to discarded
    await ddbClient.send(new PutCommand({
      TableName: RECORDINGS_TABLE,
      Item: {
        ...getResult.Item,
        status: 'discarded',
        endTime: new Date().toISOString()
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        recordingId,
        status: 'discarded'
      })
    };
  }

  // GET /recordings/{id}/transcription - Get transcription for recording
  if (httpMethod === "GET" && path && path.match(/^\/recordings\/[^\/]+\/transcription$/)) {
    const recordingId = path.split('/')[2];
    
    try {
      // Get recording from DynamoDB
      const getResult = await ddbClient.send(new GetCommand({
        TableName: RECORDINGS_TABLE,
        Key: { id: recordingId, userId }
      }));
      
      if (!getResult.Item || getResult.Item.userId !== userId) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording not found" })
        };
      }

      const recording = getResult.Item as RecordingMetadata;
      if (!recording.s3Key) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording file not found" })
        };
      }

      // Try to get transcription from S3
      const transcriptionKey = `transcriptions/${recording.s3Key.split('/').pop()?.replace('.', '_')}_transcription.json`;
      
      try {
        const transcriptionResult = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: transcriptionKey
        }));

        const transcriptionData = await transcriptionResult.Body?.transformToString();
        
        if (!transcriptionData) {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: "Transcription not found" })
          };
        }

        const transcription = JSON.parse(transcriptionData);
        
        return {
          statusCode: 200,
          body: JSON.stringify(transcription)
        };
      } catch (s3Error) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Transcription not found" })
        };
      }
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to get transcription", error: (error as Error).message })
      };
    }
  }

  // POST /recordings/{id}/ndis-note - Generate NDIS note from recording transcription
  if (httpMethod === "POST" && path && path.match(/^\/recordings\/[^\/]+\/ndis-note$/)) {
    const recordingId = path.split('/')[2];
    
    try {
      // Get recording from DynamoDB
      const getResult = await ddbClient.send(new GetCommand({
        TableName: RECORDINGS_TABLE,
        Key: { id: recordingId, userId }
      }));
      
      if (!getResult.Item || getResult.Item.userId !== userId) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording not found" })
        };
      }

      const recording = getResult.Item as RecordingMetadata;
      if (!recording.s3Key) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Recording file not found" })
        };
      }

      // Get transcription from S3
      const transcriptionKey = `transcriptions/${recording.s3Key.split('/').pop()?.replace('.', '_')}_transcription.json`;
      
      try {
        const transcriptionResult = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: transcriptionKey
        }));

        const transcriptionData = await transcriptionResult.Body?.transformToString();
        
        if (!transcriptionData) {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: "Transcription not found" })
          };
        }

        const transcription = JSON.parse(transcriptionData);
        
        // Forward to NDIS notes service
        const body = JSON.parse(event.body || '{}');
        const ndisRequest = {
          transcript: transcription.transcript || transcription.text || JSON.stringify(transcription),
          participant: body.participant || recording.name,
          date: body.date || recording.startTime?.split('T')[0],
          location: body.location || 'Not specified',
          email: body.email || userClaims.email // Use email from frontend or user claims
        };

        // Call NDIS notes service via HTTP
        let ndisNote;
        let emailSent = false;
        
        try {
          // Make HTTP call to NDIS notes service
          const ndisResponse = await fetch(`${process.env.API_URL}/ndis-notes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': event.headers?.Authorization || ''
            },
            body: JSON.stringify({
              ...ndisRequest,
              recordingId: recordingId
            })
          });
          
          if (ndisResponse.ok) {
            const ndisResult = await ndisResponse.json();
            // For async processing, we get a 202 with requestId
            if (ndisResponse.status === 202) {
              return {
                statusCode: 202,
                body: JSON.stringify({
                  success: true,
                  message: "NDIS note generation started. The note will be processed asynchronously and saved to your notes.",
                  requestId: ndisResult.requestId,
                  recordingId: recordingId,
                  recordingName: recording.name
                })
              };
            } else {
              // Legacy sync response (if needed)
              ndisNote = ndisResult.data;
              emailSent = ndisResult.emailSent || false;
              
              return {
                statusCode: 200,
                body: JSON.stringify({
                  success: true,
                  data: ndisNote,
                  emailSent: emailSent,
                  recordingId: recordingId,
                  recordingName: recording.name
                })
              };
            }
          } else {
            throw new Error(`NDIS service returned ${ndisResponse.status}`);
          }
        } catch (httpError) {
          console.error('Failed to call NDIS service:', httpError);
          return {
            statusCode: 500,
            body: JSON.stringify({ 
              message: "Failed to generate NDIS note", 
              error: httpError instanceof Error ? httpError.message : "Unknown error"
            })
          };
        }
        
      } catch (s3Error) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "Transcription not found" })
        };
      }
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to generate NDIS note", error: (error as Error).message })
      };
    }
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ message: "Endpoint not found" })
  };
});
