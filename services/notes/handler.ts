import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;

export const handler = async (event: any) => {
  if (event.httpMethod === "GET") {
    const data = await client.send(new ScanCommand({ TableName: TABLE }));
    return { statusCode: 200, body: JSON.stringify(data.Items) };
  }
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body);
    const item = { id: uuid(), content: body.content };
    await client.send(new PutCommand({ TableName: TABLE, Item: item }));
    return { statusCode: 200, body: JSON.stringify(item) };
  }
  return { statusCode: 400, body: JSON.stringify({ message: "Unsupported" }) };
};
