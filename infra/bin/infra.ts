#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraStack } from '../lib/infra-stack';
const envCapitalized = process.env.AWS_ACCOUNT_ENV_CAPITALIZED ?? 'Prod';

const app = new cdk.App();
new InfraStack(app, `Notoa${envCapitalized}`);
