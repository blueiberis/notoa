import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';

interface InfraStackProps extends cdk.StackProps {
  certArn: string;
  domainName: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // Use existing ACM certificate
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      `${id}Cert`,
      props.certArn
    );

    // S3 Bucket for frontend
    const siteBucket = new s3.Bucket(this, `${id}FrontendBucket`, { publicReadAccess: false });

    // CloudFront Distribution
    const distribution = new cf.Distribution(this, `${id}CF`, {
      defaultBehavior: { origin: new origins.S3Origin(siteBucket) },
      certificate,
      domainNames: [`app.${props.domainName}`],
    });

    // DynamoDB Table
    const table = new dynamodb.Table(this, `${id}NotesTable`, {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    });

    // Upload bucket
    const uploadBucket = new s3.Bucket(this, `${id}Uploads`);

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, `${id}UserPool`, {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });

    const userPoolClient = new cognito.UserPoolClient(this, `${id}UserPoolClient`, {
      userPool,
      generateSecret: false,
    });

    // API Gateway with SSL
    const api = new apigw.RestApi(this, `${id}Api`, {
      deployOptions: { stageName: 'prod' },
      domainName: { certificate, domainName: `api.${props.domainName}` },
    });

    // Lambda for Notes
    const notesFn = new lambda.Function(this, `${id}NotesFn`, {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/notes'),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
        API_URL: api.url,
      },
    });
    table.grantReadWriteData(notesFn);

    // Lambda for Upload
    const uploadFn = new lambda.Function(this, `${id}UploadFn`, {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/upload'),
      environment: {
        BUCKET: uploadBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
        API_URL: api.url,
      },
    });
    uploadBucket.grantWrite(uploadFn);

    // API Gateway endpoints
    const notes = api.root.addResource('notes');
    notes.addMethod('GET', new apigw.LambdaIntegration(notesFn));
    notes.addMethod('POST', new apigw.LambdaIntegration(notesFn));

    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(uploadFn));

    // CDK Outputs for frontend / devops
    new cdk.CfnOutput(this, `${id}NextEnv`, {
      value: `NEXT_PUBLIC_REGION=${this.region}
NEXT_PUBLIC_USER_POOL_ID=${userPool.userPoolId}
NEXT_PUBLIC_USER_POOL_CLIENT_ID=${userPoolClient.userPoolClientId}
NEXT_PUBLIC_API_URL=${api.url}
NEXT_PUBLIC_CLOUDFRONT_URL=${distribution.distributionDomainName}`,
    });
  }
}