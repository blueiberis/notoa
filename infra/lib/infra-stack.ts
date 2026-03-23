import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class NotoaStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const siteBucket = new s3.Bucket(this, 'FrontendBucket', { publicReadAccess: false });
    new cf.Distribution(this, 'CF', { defaultBehavior: { origin: new origins.S3Origin(siteBucket) } });

    const table = new dynamodb.Table(this, 'NotesTable', { partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING } });
    const uploadBucket = new s3.Bucket(this, 'Uploads');

    const notesFn = new lambda.Function(this, 'NotesFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/notes'),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(notesFn);

    const uploadFn = new lambda.Function(this, 'UploadFn', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/upload'),
      environment: { BUCKET: uploadBucket.bucketName },
    });
    uploadBucket.grantWrite(uploadFn);

    const api = new apigw.RestApi(this, 'Api');
    const notes = api.root.addResource('notes');
    notes.addMethod('GET', new apigw.LambdaIntegration(notesFn));
    notes.addMethod('POST', new apigw.LambdaIntegration(notesFn));
    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(uploadFn));

    const userPool = new cognito.UserPool(this, 'NotoaUserPool', { selfSignUpEnabled: true, signInAliases: { email: true } });
    const userPoolClient = new cognito.UserPoolClient(this, 'NotoaUserPoolClient', { userPool, generateSecret: false });

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}
