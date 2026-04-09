import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { generateUUID } from "../uuid";
import { createHandler, LambdaEvent, LambdaContext } from "../handler";
import OpenAI from 'openai';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface NDISNoteRequest {
  transcript: string;
  participant?: string;
  date?: string;
  location?: string;
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
      .replace(/([.!?])\s*([a-z])/g, (match, punct, letter) => `${punct} ${letter.toUpperCase()}`);

    return cleaned;
  }

  private async analyzeIncidentsAndRisks(transcript: string): Promise<string> {
    const prompt = `
Analyze this transcript for actual incidents or risks that occurred. Use contextual understanding, not keyword matching.

Transcript: "${transcript}"

Determine if any of these ACTUALLY occurred:
- Injury or physical harm
- Aggression or threatening behavior  
- Emotional distress (observable, not assumed)
- Safety risks or hazards
- Escalation or de-escalation events

Rules:
- Only classify as incident if clear evidence exists
- Distinguish minor frustration vs reportable incident
- Use conservative judgment

If incident exists, write factual summary. If none, respond with "No incidents reported".
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }]
      });

      return response.choices[0]?.message?.content?.trim() || "No incidents reported";
    } catch (error) {
      console.error('Error analyzing incidents:', error);
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
      const response = await openai.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }]
      });

      return response.choices[0]?.message?.content?.trim() || "No direct goal alignment stated";
    } catch (error) {
      console.error('Error analyzing goal alignment:', error);
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
      const response = await openai.chat.completions.create({
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
    // Step 1: Clean and normalize transcript
    const cleanedTranscript = this.cleanAndNormalizeTranscript(request.transcript);

    // Step 2: Analyze incidents and risks (parallel with goal alignment)
    const [incidents, goalAlignment] = await Promise.all([
      this.analyzeIncidentsAndRisks(cleanedTranscript),
      this.analyzeGoalAlignment(cleanedTranscript)
    ]);

    // Step 3: Generate structured note
    return await this.generateStructuredNote(cleanedTranscript, incidents, goalAlignment, request);
  }
}

export { NDISNoteGenerator };

const ndisGenerator = new NDISNoteGenerator();

export const handler = createHandler('ndis-notes-service')(async (event: LambdaEvent, context: LambdaContext, userClaims: any) => {
  if (event.httpMethod === "POST") {
    // User is authenticated by API Gateway authorizer
    if (!userClaims) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Unauthorized" })
      };
    }

    try {
      const body: NDISNoteRequest = JSON.parse(event.body || '{}');
      
      if (!body.transcript) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Transcript is required" })
        };
      }

      const ndisNote = await ndisGenerator.generateNDISNote(body);
      
      // Save to database
      const item = {
        id: generateUUID(),
        type: 'ndis-note',
        request: body,
        response: ndisNote,
        userId: userClaims.sub || userClaims['cognito:username'],
        createdAt: new Date().toISOString()
      };
      
      await client.send(new PutCommand({ TableName: TABLE, Item: item }));

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: ndisNote
        })
      };
    } catch (error) {
      console.error('Error processing NDIS note:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: "Internal server error",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      };
    }
  }
  
  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Unsupported method" })
  };
});
