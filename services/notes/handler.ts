import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  console.log('🔐 Received event:', JSON.stringify(event, null, 2));

  // API Gateway authorizer handles JWT verification
  // User info is available in event.requestContext.authorizer.claims
  const userClaims = event.requestContext?.authorizer?.claims;

  if (event.httpMethod === "GET") {
    // For GET requests, no auth required (public endpoint)
    const data = await client.send(new ScanCommand({ TableName: TABLE }));
    return { 
      statusCode: 200, 
      body: JSON.stringify(data.Items) 
    };
  }
  
  if (event.httpMethod === "POST") {
    // User is authenticated by API Gateway authorizer
    if (!userClaims) {
      return { 
        statusCode: 401, 
        body: JSON.stringify({ message: "Unauthorized" }) 
      };
    }

    try {
      const body = JSON.parse(event.body);
      const item = { 
        id: uuid(), 
        content: body.content,
        userId: userClaims.sub || userClaims['cognito:username'], // User ID from JWT claims
        createdAt: new Date().toISOString()
      };
      
      await client.send(new PutCommand({ TableName: TABLE, Item: item }));
      return { 
        statusCode: 200, 
        body: JSON.stringify(item) 
      };
      
    } catch (error) {
      console.error('❌ Error processing request:', error);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ message: "Internal server error" }) 
      };
    }
  }
  
  return { 
    statusCode: 400, 
    body: JSON.stringify({ message: "Unsupported method" }) 
  };
};
