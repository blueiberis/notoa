import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { CognitoIdentityProviderClient, GetIdCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = CognitoIdentityProviderClient.from({});
const TABLE = process.env.TABLE_NAME!;

// Helper function to verify JWT token
const verifyToken = async (token: string): Promise<any> => {
  try {
    const command = new GetIdCommand({ IdentityId: token });
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error('Invalid token');
  }
};

export const handler = async (event: any) => {
  console.log('🔐 Received event:', JSON.stringify(event, null, 2));

  // CORS headers for all responses - use actual frontend domain
  const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod === "GET") {
    // For GET requests, no auth required
    const data = await client.send(new ScanCommand({ TableName: TABLE }));
    return { 
      statusCode: 200, 
      headers: corsHeaders,
      body: JSON.stringify(data.Items) 
    };
  }
  
  if (event.httpMethod === "POST") {
    // For POST requests, verify JWT
    const token = event.headers?.Authorization?.replace('Bearer ', '');
    
    if (!token) {
      return { 
        statusCode: 401, 
        headers: corsHeaders,
        body: JSON.stringify({ message: "Authorization header required" }) 
      };
    }

    try {
      // Verify the JWT token
      const tokenData = await verifyToken(token);
      console.log('✅ JWT verified:', tokenData);
      
      const body = JSON.parse(event.body);
      const item = { 
        id: uuid(), 
        content: body.content,
        userId: tokenData.UserId || 'unknown', // Add user ID to note
        createdAt: new Date().toISOString()
      };
      
      await client.send(new PutCommand({ TableName: TABLE, Item: item }));
      return { 
        statusCode: 200, 
        headers: corsHeaders,
        body: JSON.stringify(item) 
      };
      
    } catch (error) {
      console.error('❌ JWT verification failed:', error);
      return { 
        statusCode: 401, 
        headers: corsHeaders,
        body: JSON.stringify({ message: "Invalid or expired token" }) 
      };
    }
  }
  
  return { 
    statusCode: 400, 
    headers: corsHeaders,
    body: JSON.stringify({ message: "Unsupported method" }) 
  };
};
