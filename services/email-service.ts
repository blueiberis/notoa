import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION });

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export class EmailService {
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const command = new SendEmailCommand({
        Destination: { ToAddresses: [options.to] },
        Message: {
          Subject: { Data: options.subject },
          Body: {
            Html: { Data: options.htmlBody },
            ...(options.textBody && { Text: { Data: options.textBody } })
          }
        },
        Source: process.env.SES_FROM_ADDRESS!
      });

      await ses.send(command);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  static generateNDISNoteEmail(ndisNote: any): EmailOptions {
    const subject = `NDIS Progress Note - ${ndisNote.participant} - ${ndisNote.date}`;
    
    const htmlBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin: 0 0 10px 0;">NDIS Progress Note</h1>
          <div style="display: flex; gap: 20px; color: #7f8c8d; font-size: 14px;">
            <span><strong>Participant:</strong> ${ndisNote.participant}</span>
            <span><strong>Date:</strong> ${ndisNote.date}</span>
            <span><strong>Location:</strong> ${ndisNote.location}</span>
          </div>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Support Provided</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.supportProvided}</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Activities Undertaken</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.activitiesUndertaken}</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Participant Response</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.participantResponse}</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Outcomes / Progress Toward Goals</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.outcomesProgress}</p>
        </div>

        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: #27ae60; margin: 0 0 10px 0;">Goal Alignment</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.goalAlignment}</p>
        </div>

        <div style="background: ${ndisNote.incidentsRisks.includes('No incidents') ? '#e8f5e8' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="color: ${ndisNote.incidentsRisks.includes('No incidents') ? '#27ae60' : '#856404'}; margin: 0 0 10px 0;">Incidents / Risks</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.incidentsRisks}</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px;">
          <h3 style="color: #2c3e50; margin: 0 0 10px 0;">Next Steps / Recommendations</h3>
          <p style="margin: 0; line-height: 1.6;">${ndisNote.nextSteps}</p>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1; color: #7f8c8d; font-size: 12px;">
          <p>This NDIS progress note was generated on ${new Date().toLocaleString()}</p>
          <p>For questions about this note, please contact your service provider.</p>
        </div>
      </body>
      </html>
    `;

    const textBody = `
NDIS PROGRESS NOTE
==================

Participant: ${ndisNote.participant}
Date: ${ndisNote.date}
Location: ${ndisNote.location}

SUPPORT PROVIDED:
${ndisNote.supportProvided}

ACTIVITIES UNDERTAKEN:
${ndisNote.activitiesUndertaken}

PARTICIPANT RESPONSE:
${ndisNote.participantResponse}

OUTCOMES / PROGRESS TOWARD GOALS:
${ndisNote.outcomesProgress}

GOAL ALIGNMENT:
${ndisNote.goalAlignment}

INCIDENTS / RISKS:
${ndisNote.incidentsRisks}

NEXT STEPS / RECOMMENDATIONS:
${ndisNote.nextSteps}

---
Generated on ${new Date().toLocaleString()}
`;

    return {
      to: '', // Will be set when sending
      subject,
      htmlBody,
      textBody
    };
  }
}
