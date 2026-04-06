import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
//import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';

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
            // Route app.domain.com to /app/* with SPA fallback
            if (uri === '/') {
              request.uri = '/app/index.html';
            } else if (!uri.startsWith('/app/')) {
              request.uri = '/app' + uri;
            }
            
            // SPA fallback: if not a file (no extension), serve index.html
            if (!uri.includes('.')) {
              request.uri = '/app/index.html';
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

    const recordingsTable = new dynamodb.Table(this, `${id}RecordingsTable`, {
      tableName: `${kebabId}-recordings`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
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
          'PUT',
          'DELETE',
          'OPTIONS'
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
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
    const notesFn = new NodejsFunction(this, `${id}NotesFn`, {
      functionName: `${kebabId}-notes-fn`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: '../services/notes/handler.ts',
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
        commandHooks: {
          beforeBundling: (inputDir, outputDir) => [
            'npm install',
          ],
          afterBundling: (inputDir, outputDir) => [],
          beforeInstall: (inputDir, outputDir) => [],
        },
      },
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

    const uploadFn = new NodejsFunction(this, `${id}UploadFn`, {
      functionName: `${kebabId}-upload-fn`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: '../services/upload/handler.ts',
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
      },
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

    // --- Recordings Lambda Function ---
    const recordingsFn = new NodejsFunction(this, `${id}RecordingsFn`, {
      functionName: `${kebabId}-recordings-fn`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: '../services/recordings/handler.ts',
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        BUCKET: uploadBucket.bucketName,
        RECORDINGS_TABLE_NAME: recordingsTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
      },
      logGroup: new logs.LogGroup(this, `${id}RecordingsFnLogGroup`, {
        logGroupName: `/aws/lambda/${kebabId}-recordings-fn`,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });
    
    // Ensure table is created before Lambda
    recordingsFn.node.addDependency(recordingsTable);
    
    uploadBucket.grantReadWrite(recordingsFn);
    recordingsTable.grantReadWriteData(recordingsFn);

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

    const recordings = api.root.addResource('recordings');
    recordings.addMethod('GET', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingsStart = recordings.addResource('start');
    recordingsStart.addMethod('POST', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingId = recordings.addResource('{recording-id}');
    const recordingPause = recordingId.addResource('pause');
    recordingPause.addMethod('POST', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingResume = recordingId.addResource('resume');
    recordingResume.addMethod('POST', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingSave = recordingId.addResource('save');
    recordingSave.addMethod('POST', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingDiscard = recordingId.addResource('discard');
    recordingDiscard.addMethod('DELETE', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingUrl = recordingId.addResource('url');
    recordingUrl.addMethod('GET', new apigw.LambdaIntegration(recordingsFn), {
      authorizationType: apigw.AuthorizationType.COGNITO,
      authorizer,
    });
    
    const recordingTranscription = recordingId.addResource('transcription');
    recordingTranscription.addMethod('GET', new apigw.LambdaIntegration(recordingsFn), {
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

    const secureParamLambda = new lambda.Function(this, 'SecureParamLambda', {
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async function(event) {
          const { SSMClient, GetParameterCommand, PutParameterCommand } = await import("@aws-sdk/client-ssm");
          const client = new SSMClient({});

          const name = event.ResourceProperties.Name;
          const value = event.ResourceProperties.Value;

          try {
            // Check if the parameter already exists
            await client.send(new GetParameterCommand({ Name: name }));
            // Exists, do nothing to preserve manual changes
            console.log(\`Parameter "\${name}" already exists, skipping creation.\`);
          } catch (err) {
            if (err.name === 'ParameterNotFound') {
              // Parameter doesn't exist, create it
              await client.send(new PutParameterCommand({
                Name: name,
                Type: "SecureString",
                Value: value,
              }));
              console.log(\`Parameter "\${name}" created successfully.\`);
            } else {
              // Unexpected error
              throw err;
            }
          }

          return { PhysicalResourceId: name };
        };
      `),
    });

    secureParamLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:PutParameter', 'ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/attributes/${kebabId}`],
    }));

    new cr.Provider(this, 'SecureParamProvider', {
      onEventHandler: secureParamLambda,
    });

    new cdk.CustomResource(this, 'MySecureParam', {
      serviceToken: new cr.Provider(this, 'Provider', {
        onEventHandler: secureParamLambda,
      }).serviceToken,
      properties: {
        Name: `/attributes/${kebabId}`,
        Value: 'placeholder',
      },
    });

    // Output Parameter Store name
    new cdk.CfnOutput(this, `${id}EnvParameterStoreName`, {
      value: `/attributes/${kebabId}`,
      description: 'Parameter Store path for environment variables',
    });

    // --- Audio Processing Lambda Function ---
    const audioProcessingFn = new lambda.DockerImageFunction(this, `${id}AudioProcessingFn`, {
      functionName: `${kebabId}-audio-processing-fn`,
      code: lambda.DockerImageCode.fromImageAsset('../services/audio-processing'),
      memorySize: 2048,
      timeout: cdk.Duration.minutes(15),
      environment: {
        PARAMETER_NAME: `/attributes/${kebabId}`,
        REGION: this.region,
      },
      logGroup: new logs.LogGroup(this, `${id}AudioProcessingFnLogGroup`, {
        logGroupName: `/aws/lambda/${kebabId}-audio-processing-fn`,
        retention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    // Grant access to Parameter Store
    audioProcessingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/attributes/${kebabId}`],
    }));

    // Grant access to S3 bucket for audio files
    uploadBucket.grantRead(audioProcessingFn);
    uploadBucket.grantWrite(audioProcessingFn);

    // Add API Gateway route for audio processing
    recordings.addResource('process').addMethod('POST', new apigw.LambdaIntegration(audioProcessingFn, {
      proxy: true,
    }), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
  }
}
