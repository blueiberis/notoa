#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraStack } from '../lib/infra-stack';
const envCapitalized = process.env.AWS_ACCOUNT_ENV_CAPITALIZED ?? 'Prod';

const app = new cdk.App();
new InfraStack(app, `Notoa${envCapitalized}`,{
  description: `Notoa ${envCapitalized} stack — deploys all resources for the ${envCapitalized} environment`,
  certArn: 'arn:aws:acm:us-east-1:221082185791:certificate/a06111a1-5b1d-4712-b94d-bd5268a0d67f',
  domainName: 'notoa.tech',
});
