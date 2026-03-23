import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // S3 Bucket for frontend
    const siteBucket = new s3.Bucket(this, `${id}FrontendBucket`, { publicReadAccess: false });

    // CloudFront Distribution
    new cf.Distribution(this, `${id}CF`, {
      defaultBehavior: { origin: new origins.S3Origin(siteBucket) },
    });

    // DynamoDB Table
    const table = new dynamodb.Table(this, `${id}NotesTable`, {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });

    // Upload bucket
    const uploadBucket = new s3.Bucket(this, `${id}Uploads`);

    // Notes Lambda
    const notesFn = new lambda.Function(this, `${id}NotesFn`, {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/notes'),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(notesFn);

    // Upload Lambda
    const uploadFn = new lambda.Function(this, `${id}UploadFn`, {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/upload'),
      environment: { BUCKET: uploadBucket.bucketName },
    });
    uploadBucket.grantWrite(uploadFn);

    // API Gateway
    const api = new apigw.RestApi(this, `${id}Api`);
    const notes = api.root.addResource('notes');
    notes.addMethod('GET', new apigw.LambdaIntegration(notesFn));
    notes.addMethod('POST', new apigw.LambdaIntegration(notesFn));
    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(uploadFn));

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, `${id}UserPool`, {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });
    const userPoolClient = new cognito.UserPoolClient(this, `${id}UserPoolClient`, {
      userPool,
      generateSecret: false,
    });

    // Outputs
    new cdk.CfnOutput(this, `${id}UserPoolId`, { value: userPool.userPoolId });
    new cdk.CfnOutput(this, `${id}UserPoolClientId`, { value: userPoolClient.userPoolClientId });
  }
}
