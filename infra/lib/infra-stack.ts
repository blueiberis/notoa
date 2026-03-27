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
    const adminUrl = `admin.${props.domainName}`;
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
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const uploadBucket = new s3.Bucket(this, `${id}UploadBucket`, {
      bucketName: `${kebabId}-uploads`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- CloudFront Function for routing ---
    const routingFunction = new cf.Function(this, `${id}RoutingFunction`, {
      code: cf.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          
          // Route admin.domain.com to /admin/* 
          if (request.headers['host'] && request.headers['host'].value.includes('admin.')) {
            if (uri === '/') {
              request.uri = '/admin/index.html';
            } else if (!uri.startsWith('/admin/')) {
              request.uri = '/admin' + uri;
            }
          } else {
            // Route app.domain.com to /app/*
            if (uri === '/') {
              request.uri = '/app/index.html';
            } else if (!uri.startsWith('/app/')) {
              request.uri = '/app' + uri;
            }
          }
          
          return request;
        }
      `),
    });

    // --- CloudFront ---
    const distribution = new cf.Distribution(this, `${id}CF`, {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cf.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{
          function: routingFunction,
          eventType: cf.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      certificate,
      domainNames: [appUrl, adminUrl],
      defaultRootObject: "", // Let the function handle routing
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
      // Auto-verify email for password-only signup
      autoVerify: { 
        email: true, // Keep this true but we'll handle auto-confirmation
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireSymbols: false,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this, `${id}UserPoolClient`, {
      userPool,
      generateSecret: false,
      userPoolClientName: `${kebabId}-client`,
    });

    // --- API Gateway ---
    const api = new apigw.RestApi(this, `${id}Api`, {
      restApiName: `${kebabId}-api`,
      deployOptions: { stageName: 'prod' },
      // Enable CORS at the API Gateway level
      defaultCorsPreflightOptions: {
        allowOrigins: [
          `https://${appUrl}`,
          `https://${adminUrl}`,
        ],
        allowMethods: [
          'GET',
          'POST',
          'OPTIONS'
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
        allowCredentials: true,
      },
    });

    // --- Cognito Authorizer ---
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, `${id}Authorizer`, {
      cognitoUserPools: [userPool],
      authorizerName: `${kebabId}-authorizer`,
      identitySource: apigw.IdentitySource.header('Authorization'),
      resultsCacheTtl: cdk.Duration.minutes(5),
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
        FRONTEND_URL: `https://${appUrl}`,
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
    notes.addMethod('POST', new apigw.LambdaIntegration(notesFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });

    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigw.LambdaIntegration(uploadFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });

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

    new cdk.CfnOutput(this, `${id}AdminEnv`, {
      value: `NEXT_PUBLIC_REGION=${this.region}
NEXT_PUBLIC_USER_POOL_ID=${userPool.userPoolId}
NEXT_PUBLIC_USER_POOL_CLIENT_ID=${userPoolClient.userPoolClientId}
NEXT_PUBLIC_API_URL=${apiUrl}
NEXT_PUBLIC_CLOUDFRONT_URL=${adminUrl}`,
    });

    new cdk.CfnOutput(this, `${id}CloudFrontDistributionId`, {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation',
    });
  }
}
