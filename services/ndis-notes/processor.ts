import { SQSHandler, SQSRecord } from 'aws-lambda';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { generateUUID } from "../uuid";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import OpenAI from 'openai';
import { EmailService } from "../email-service";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});
const sqsClient = new SQSClient({});
const TABLE = process.env.TABLE_NAME!;
const PARAMETER_NAME = process.env.PARAMETER_NAME!;
const QUEUE_URL = process.env.QUEUE_URL!;

// Helper function to get OpenAI API key from Parameter Store
async function getOpenAIApiKey(): Promise<string> {
  try {
    const response = await ssmClient.send(new GetParameterCommand({
      Name: PARAMETER_NAME,
      WithDecryption: true
    }));
    
    const parameterValue = response.Parameter?.Value;
    if (!parameterValue) {
      throw new Error('Parameter value is empty');
    }
    
    // Parse the parameter value as key-value pairs (like OPENAI_API_KEY=sk-...)
    const lines = parameterValue.split('\n');
    for (const line of lines) {
      if (line.startsWith('OPENAI_API_KEY=')) {
        const apiKey = line.split('=', 2)[1].trim();
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY value is empty');
        }
        return apiKey;
      }
    }
    
    throw new Error('OPENAI_API_KEY not found in parameter store');
  } catch (error) {
    console.error('Failed to get OpenAI API key from Parameter Store:', error);
    throw error;
  }
}

// Initialize OpenAI client lazily
let openai: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI> {
  if (!openai) {
    const apiKey = await getOpenAIApiKey();
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

interface NDISNoteRequest {
  transcript: string;
  participant?: string;
  date?: string;
  location?: string;
  requestId?: string;
  recordingId?: string;
  email?: string; // Email address passed from frontend - if present, send email
}

interface NDISNoteResponse {
  participant: string;
  date: string;
  location: string;
  supportProvided: string;
  activitiesUndertaken: string;
  participantResponse: string;
  outcomesProgress: string;
  goalAlignment: string;
  incidentsRisks: string;
  nextSteps: string;
}

class NDISNoteGenerator {
  private cleanAndNormalizeTranscript(transcript: string): string {
    // Step 1: Clean & normalize transcript
    let cleaned = transcript
      // Remove filler words
      .replace(/\b(um|uh|like|you know)\b/gi, '')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      // Fix common speech-to-text errors
      .replace(/\b(\w+)ing\b/gi, (match) => match.toLowerCase())
      // Remove repeated words
      .replace(/\b(\w+)\s+\1\b/gi, '$1')
      .trim();

    // Basic grammar correction
    cleaned = cleaned
      .replace(/\bi\s+/gi, 'I ')
      .replace(/\s+([.!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }

  private async analyzeIncidentsAndRisks(transcript: string): Promise<string> {
    const prompt = `
Analyze this transcript for any incidents, risks, or safety concerns.

Transcript: "${transcript}"

Focus on:
- Physical safety incidents (falls, injuries, accidents)
- Medical emergencies or health concerns
- Behavioral incidents (aggression, distress, elopement)
- Environmental hazards
- Missed medications or treatments

Rules:
- Only classify as incident if clear evidence exists
- Distinguish minor frustration vs reportable incident
- Use conservative judgment

If incident exists, write factual summary. If none, respond with "No incidents reported".
`;

    try {
      const openaiClient = await getOpenAIClient();
      const response = await openaiClient.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }]
      });

      return response.choices[0]?.message?.content?.trim() || "No incidents reported";
    } catch (error) {
      console.error('Error analyzing incidents:', error);
      console.error('Parameter Store path:', PARAMETER_NAME);
      console.error('Incident analysis error details:', JSON.stringify(error, null, 2));
      return "Incident analysis unavailable";
    }
  }

  private async analyzeGoalAlignment(transcript: string): Promise<string> {
    const prompt = `
Analyze this transcript for activities that relate to independence, daily living skills, or participant development.

Transcript: "${transcript}"

Identify activities that connect to:
- Independence building
- Daily living skills
- Personal development
- Social skills
- Communication skills
- Mobility/movement skills

Explain the connection clearly. If no clear link exists, respond with "No direct goal alignment stated".
Do not invent goals.
`;

    try {
      const openaiClient = await getOpenAIClient();
      const response = await openaiClient.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }]
      });

      return response.choices[0]?.message?.content?.trim() || "No direct goal alignment stated";
    } catch (error) {
      console.error('Error analyzing goal alignment:', error);
      console.error('Parameter Store path:', PARAMETER_NAME);
      console.error('Goal alignment error details:', JSON.stringify(error, null, 2));
      return "Goal alignment analysis unavailable";
    }
  }

  private async generateStructuredNote(
    cleanedTranscript: string, 
    incidents: string, 
    goalAlignment: string,
    request: NDISNoteRequest
  ): Promise<NDISNoteResponse> {
    const prompt = `
Transform this cleaned transcript into a professional NDIS progress note.

STRICT RULES:
- Use third person (e.g. "The participant...")
- Use neutral, objective, audit-safe language
- No assumptions, no added details
- Replace vague terms with observable facts
- If information is missing, use "Not specified"

Cleaned transcript: "${cleanedTranscript}"

Generate the following fields:
1. Support Provided: What support was delivered
2. Activities Undertaken: What activities were performed
3. Participant Response: How the participant responded
4. Outcomes / Progress Toward Goals: What was achieved

Respond with JSON format:
{
  "supportProvided": "...",
  "activitiesUndertaken": "...",
  "participantResponse": "...",
  "outcomesProgress": "..."
}
`;

    try {
      const openaiClient = await getOpenAIClient();
      const response = await openaiClient.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }]
      });

      const aiResponse = response.choices[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(aiResponse);

      return {
        participant: request.participant || "Not specified",
        date: request.date || new Date().toISOString().split('T')[0],
        location: request.location || "Not specified",
        supportProvided: parsed.supportProvided || "Not specified",
        activitiesUndertaken: parsed.activitiesUndertaken || "Not specified",
        participantResponse: parsed.participantResponse || "Not specified",
        outcomesProgress: parsed.outcomesProgress || "Not specified",
        goalAlignment: goalAlignment,
        incidentsRisks: incidents,
        nextSteps: "Not specified"
      };
    } catch (error) {
      console.error('Error generating structured note:', error);
      console.error('Parameter Store path:', PARAMETER_NAME);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return {
        participant: request.participant || "Not specified",
        date: request.date || new Date().toISOString().split('T')[0],
        location: request.location || "Not specified",
        supportProvided: "Note generation failed",
        activitiesUndertaken: "Note generation failed",
        participantResponse: "Note generation failed",
        outcomesProgress: "Note generation failed",
        goalAlignment: goalAlignment,
        incidentsRisks: incidents,
        nextSteps: "Not specified"
      };
    }
  }

  async generateNDISNote(request: NDISNoteRequest): Promise<NDISNoteResponse> {
    console.log('Starting NDIS note generation for:', request.participant);
    
    try {
      // Step 1: Clean transcript
      const cleanedTranscript = this.cleanAndNormalizeTranscript(request.transcript);
      console.log('Transcript cleaned, length:', cleanedTranscript.length);

      // Step 2: Run parallel analyses
      const [incidents, goalAlignment] = await Promise.all([
        this.analyzeIncidentsAndRisks(cleanedTranscript),
        this.analyzeGoalAlignment(cleanedTranscript)
      ]);

      console.log('Incidents analysis:', incidents);
      console.log('Goal alignment:', goalAlignment);

      // Step 3: Generate structured note
      const ndisNote = await this.generateStructuredNote(
        cleanedTranscript, 
        incidents, 
        goalAlignment, 
        request
      );

      console.log('NDIS note generated successfully');
      return ndisNote;

    } catch (error) {
      console.error('Error in NDIS note generation:', error);
      throw error;
    }
  }
}

export const handler: SQSHandler = async (event) => {
  console.log('Processing SQS event with records:', event.Records.length);
  
  const generator = new NDISNoteGenerator();

  for (const record of event.Records) {
    try {
      console.log('Processing record:', record.messageId);
      
      // Parse the message body
      const messageBody = JSON.parse(record.body);
      const ndisRequest: NDISNoteRequest = messageBody;
      
      console.log('NDIS request parsed:', {
        participant: ndisRequest.participant,
        transcriptLength: ndisRequest.transcript?.length,
        email: ndisRequest.email || 'none'
      });

      // Generate the NDIS note
      const ndisNote = await generator.generateNDISNote(ndisRequest);
      
      console.log('NDIS note generated:', {
        participant: ndisNote.participant,
        date: ndisNote.date,
        supportProvided: ndisNote.supportProvided
      });

      // Send email if valid email address is provided
      let emailSent = false;
      if (ndisRequest.email && ndisRequest.email !== 'none') {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(ndisRequest.email)) {
          try {
            console.log('Sending NDIS note email to:', ndisRequest.email);
            
            // Generate email content
            const emailOptions = EmailService.generateNDISNoteEmail(ndisNote);
            emailOptions.to = ndisRequest.email;
            
            // Send email
            emailSent = await EmailService.sendEmail(emailOptions);
            console.log('Email sent successfully:', emailSent);
          } catch (emailError) {
            console.error('Failed to send email:', emailError);
          }
        } else {
          console.log('Invalid email format provided, skipping email sending:', ndisRequest.email);
        }
      }

      // Save to DynamoDB
      const noteId = generateUUID();
      await client.send(new PutCommand({
        TableName: TABLE,
        Item: {
          id: noteId,
          userId: ndisRequest.requestId || 'system',
          type: 'ndis-note',
          recordingId: ndisRequest.recordingId,
          participant: ndisNote.participant,
          date: ndisNote.date,
          location: ndisNote.location,
          supportProvided: ndisNote.supportProvided,
          activitiesUndertaken: ndisNote.activitiesUndertaken,
          participantResponse: ndisNote.participantResponse,
          outcomesProgress: ndisNote.outcomesProgress,
          goalAlignment: ndisNote.goalAlignment,
          incidentsRisks: ndisNote.incidentsRisks,
          nextSteps: ndisNote.nextSteps,
          createdAt: new Date().toISOString(),
          transcript: ndisRequest.transcript,
          emailSent: emailSent
        }
      }));

      console.log('NDIS note saved to DynamoDB:', noteId, 'Email sent:', emailSent);

      console.log('Successfully processed NDIS note for record:', record.messageId);

    } catch (error) {
      console.error('Error processing SQS record:', record.messageId, error);
      // Don't throw the error to avoid failing the entire batch
      // The message will be returned to the queue for retry
      throw error;
    }
  }

  console.log('All SQS records processed successfully');
};
