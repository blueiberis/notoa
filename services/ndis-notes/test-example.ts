// Test example for NDIS progress note generation
// This file demonstrates how to use the NDIS service
// Note: The NDIS service now uses async processing via SQS

interface NDISNoteRequest {
  transcript: string;
  participant?: string;
  date?: string;
  location?: string;
  sendEmail?: boolean;
  recordingId?: string;
}

// Example transcript
const exampleTranscript = `
Um, today I worked with Sarah on her personal care routine. She was able to brush her teeth independently but needed some guidance with washing her hair. You know, she was a bit frustrated at first when the soap got in her eyes, but we talked through it and she calmed down. I showed her how to tilt her head back to prevent that from happening again. She practiced the technique a few times and seemed more confident by the end. We also worked on buttoning her shirt - she can do the top buttons but struggles with the smaller ones near the bottom. I suggested using a button hook which she's willing to try next time. Overall she was cooperative and engaged throughout the session.
`;

// Example request
const testRequest = {
  transcript: exampleTranscript,
  participant: "Sarah",
  date: "2026-04-09",
  location: "Community Center"
};

// Example usage (now uses HTTP API with async processing)
/*
async function testNDISGeneration() {
  try {
    console.log('Testing NDIS note generation via API...');
    
    // Make HTTP request to NDIS notes API
    const response = await fetch('https://api.notoa.tech/ndis-notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_AUTH_TOKEN'
      },
      body: JSON.stringify(testRequest)
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (response.status === 202) {
        console.log('NDIS note generation started successfully!');
        console.log('Request ID:', result.requestId);
        console.log('Message:', result.message);
        console.log('The note will be processed asynchronously and saved to your notes.');
      } else {
        // Legacy sync response (if applicable)
        console.log('Generated NDIS Note:');
        console.log('===================');
        console.log(`Participant: ${result.data.participant}`);
        console.log(`Date: ${result.data.date}`);
        console.log(`Location: ${result.data.location}`);
        console.log(`\nSupport Provided: ${result.data.supportProvided}`);
        console.log(`Activities Undertaken: ${result.data.activitiesUndertaken}`);
        console.log(`Participant Response: ${result.data.participantResponse}`);
        console.log(`Outcomes / Progress Toward Goals: ${result.data.outcomesProgress}`);
        console.log(`\nGoal Alignment: ${result.data.goalAlignment}`);
        console.log(`Incidents / Risks: ${result.data.incidentsRisks}`);
        console.log(`Next Steps / Recommendations: ${result.data.nextSteps}`);
      }
    } else {
      console.error('API Error:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('Error testing NDIS generation:', error);
  }
}

testNDISGeneration();
*/

// Expected output format example:
const expectedOutput = {
  participant: "Sarah",
  date: "2026-04-09", 
  location: "Community Center",
  supportProvided: "The participant received guidance and support with personal care routines, including hair washing techniques and buttoning clothing.",
  activitiesUndertaken: "The participant practiced personal hygiene skills, specifically tooth brushing, hair washing, and clothing fastening. She learned proper head positioning for hair washing and was introduced to button hook assistive device.",
  participantResponse: "The participant was initially frustrated when soap entered her eyes but calmed down after discussion. She was cooperative and engaged throughout the session, practiced techniques multiple times, and demonstrated increased confidence.",
  outcomesProgress: "The participant maintained independence with tooth brushing. She learned and practiced proper hair washing technique to prevent soap in eyes. She showed willingness to try assistive devices for buttoning difficulties.",
  goalAlignment: "Activities align with independence in daily living skills and personal care. The session addressed fine motor skills development through buttoning practice and problem-solving skills through technique adaptation.",
  incidentsRisks: "No incidents reported. Minor frustration was noted but resolved through communication and technique adjustment.",
  nextSteps: "Introduce button hook assistive device for clothing fastening. Continue practicing hair washing technique. Monitor progress with fine motor skill development."
};

console.log('NDIS Note Generation Test Example');
console.log('==================================');
console.log('Input transcript:', exampleTranscript);
console.log('\nExpected output format:');
console.log(JSON.stringify(expectedOutput, null, 2));
console.log('\nTo test with actual OpenAI API, uncomment the test function and set OPENAI_API_KEY environment variable.');
