import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { createHandler, LambdaEvent, LambdaContext } from "../handler";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

export const handler = createHandler('notes-service')(async (event: LambdaEvent, context: LambdaContext, userClaims: any) => {
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

    const body = JSON.parse(event.body || '{}');
    const item = { 
      id: uuid(), 
      content: body.content,
      userId: userClaims.sub || userClaims['cognito:username'],
      createdAt: new Date().toISOString()
    };
    
    await client.send(new PutCommand({ TableName: TABLE, Item: item }));
    return {
      statusCode: 200,
      body: JSON.stringify(item)
    };
  }
  
  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Unsupported method" })
  };
});
