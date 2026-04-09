# NDIS Progress Note Generation Service

This service generates compliant NDIS progress notes from raw voice transcripts using AI-powered semantic analysis.

## Features

- **Intelligent Transcript Processing**: Uses language understanding to clean and normalize voice transcripts
- **Semantic Incident Analysis**: Analyzes context to identify actual incidents vs casual mentions
- **Goal Alignment Inference**: Identifies connections to independence, daily living skills, and development
- **Audit-Ready Output**: Generates structured, professional NDIS notes in standard format
- **AWS Integration**: Stores generated notes in DynamoDB with user authentication

## API Endpoint

**POST** `/ndis-notes`

### Request Body

```json
{
  "transcript": "Raw voice transcript text",
  "participant": "Participant name (optional)",
  "date": "YYYY-MM-DD (optional)",
  "location": "Location (optional)"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "participant": "Participant name",
    "date": "2026-04-09",
    "location": "Location",
    "supportProvided": "Description of support provided",
    "activitiesUndertaken": "Activities performed",
    "participantResponse": "How participant responded",
    "outcomesProgress": "Progress toward goals",
    "goalAlignment": "Connection to NDIS goals",
    "incidentsRisks": "Incident analysis",
    "nextSteps": "Recommendations"
  }
}
```

## Processing Steps

### 1. Clean & Normalize Transcript
- Removes filler words (um, uh, like, you know)
- Corrects grammar and sentence structure
- Preserves all original meaning and detail
- Resolves speech-to-text errors using context

### 2. Incident & Risk Analysis
- Uses semantic understanding to identify actual incidents
- Distinguishes between minor frustration vs reportable incidents
- Conservative judgment to avoid false positives
- Analyzes for injury, aggression, distress, safety risks

### 3. Goal Alignment
- Identifies activities related to independence building
- Connects to daily living skills and personal development
- Explains connections clearly
- Does not invent goals not supported by transcript

### 4. Structured Note Generation
- Transforms into professional NDIS format
- Uses third-person, objective language
- Replaces vague terms with observable facts
- Maintains strict factual accuracy

## Environment Variables

- `OPENAI_API_KEY`: OpenAI API key for AI processing
- `TABLE_NAME`: DynamoDB table name for storage
- `AWS_REGION`: AWS region for services

## Dependencies

- `openai`: AI processing using gpt-5-nano model for semantic analysis
- `@aws-sdk/client-dynamodb`: AWS DynamoDB client
- `@aws-sdk/lib-dynamodb`: DynamoDB document client

## Testing

See `test-example.ts` for usage examples and expected output format.

## Security

- Requires user authentication via API Gateway authorizer
- Stores all notes with user ID tracking
- Validates input transcript presence
- Handles errors gracefully without exposing sensitive information

## Compliance

- Generates audit-ready NDIS compliant notes
- Uses conservative incident reporting
- Maintains factual accuracy
- Follows NDIS documentation standards
