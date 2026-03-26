import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

interface InfraStackProps extends cdk.StackProps {
  certArn: string;
  domainName: string;
}

// Helper: convert PascalCase or camelCase to kebab-case
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const kebabId = toKebabCase(id);
    const appUrl = `app.${props.domainName}`;
    const apiUrl = `api.${props.domainName}`;

    // --- ACM Certificate ---
    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      `${id}Cert`,
      props.certArn
    );

    // --- S3 Buckets ---
    const siteBucket = new s3.Bucket(this, `${id}FrontendBucket`, {
      bucketName: `${kebabId}-frontend`,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const uploadBucket = new s3.Bucket(this, `${id}UploadBucket`, {
      bucketName: `${kebabId}-uploads`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- CloudFront ---
    const distribution = new cf.Distribution(this, `${id}CF`, {
      defaultBehavior: { origin: S3BucketOrigin.withOriginAccessControl(siteBucket) },
      certificate,
      domainNames: [appUrl],
    });

    // --- DynamoDB ---
    const table = new dynamodb.Table(this, `${id}NotesTable`, {
      tableName: `${kebabId}-notes`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Cognito ---
    const userPool = new cognito.UserPool(this, `${id}UserPool`, {
      userPoolName: `${kebabId}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });

    const userPoolClient = new cognito.UserPoolClient(this, `${id}UserPoolClient`, {
      userPool,
      generateSecret: false,
      userPoolClientName: `${kebabId}-client`,
    });

    // --- API Gateway ---
    const api = new apigw.RestApi(this, `${id}Api`, {
      restApiName: `${kebabId}-api`,
      deployOptions: { stageName: 'prod' }, // automatically deploy
    });

    // --- Lambda Functions ---
    const notesFn = new lambda.Function(this, `${id}NotesFn`, {
      functionName: `${kebabId}-notes-fn`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/notes'),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
      },
      logGroup: new logs.LogGroup(this, `${id}NotesFnLogGroup`, {
        logGroupName: `/aws/lambda/${kebabId}-notes-fn`,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });
    table.grantReadWriteData(notesFn);

    const uploadFn = new lambda.Function(this, `${id}UploadFn`, {
      functionName: `${kebabId}-upload-fn`,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../services/upload'),
      environment: {
        BUCKET: uploadBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
      },
      logGroup: new logs.LogGroup(this, `${id}UploadFnLogGroup`, {
        logGroupName: `/aws/lambda/${kebabId}-upload-fn`,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });
    uploadBucket.grantWrite(uploadFn);

    // --- API Gateway Methods ---
    const notes = api.root.addResource('notes');
    notes.addMethod('GET', new apigw.LambdaIntegration(notesFn));
    notes.addMethod('POST', new apigw.LambdaIntegration(notesFn));

    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(uploadFn));

    // --- API Gateway Custom Domain ---
    const apiDomain = new apigw.DomainName(this, `${id}ApiDomain`, {
      domainName: apiUrl,
      certificate,
      endpointType: apigw.EndpointType.EDGE,
    });

    new apigw.BasePathMapping(this, `${id}ApiDomainMapping`, {
      domainName: apiDomain,
      restApi: api,
      stage: api.deploymentStage,
    });

    // --- Grant Lambda Invoke to API Gateway ---
    notesFn.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));
    uploadFn.grantInvoke(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // --- CDK Outputs ---
    new cdk.CfnOutput(this, `${id}NextEnv`, {
      value: `NEXT_PUBLIC_REGION=${this.region}
NEXT_PUBLIC_USER_POOL_ID=${userPool.userPoolId}
NEXT_PUBLIC_USER_POOL_CLIENT_ID=${userPoolClient.userPoolClientId}
NEXT_PUBLIC_API_URL=${apiUrl}
NEXT_PUBLIC_CLOUDFRONT_URL=${appUrl}`,
    });

    new cdk.CfnOutput(this, `${id}CloudFrontDistributionId`, {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation',
    });
  }
}
