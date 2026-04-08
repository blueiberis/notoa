import json
import os
import boto3
import tempfile
import uuid
from botocore.exceptions import ClientError
from openai import OpenAI

# Initialize AWS clients
s3_client = boto3.client('s3')
ssm_client = boto3.client('ssm')
ses_client = boto3.client('ses')

PARAMETER_NAME = os.environ.get('PARAMETER_NAME')
REGION = os.environ.get('REGION')


def get_openai_api_key():
    """Get OpenAI API key from Parameter Store"""
    try:
        response = ssm_client.get_parameter(Name=PARAMETER_NAME, WithDecryption=True)
        value = response['Parameter']['Value']
        for line in value.split('\n'):
            if line.startswith('OPENAI_API_KEY='):
                return line.split('=', 1)[1].strip()
        raise ValueError("OPENAI_API_KEY not found in parameter")
    except ClientError as e:
        print(f"Error getting parameter from SSM: {e}")
        raise
    except Exception as e:
        print(f"Error parsing parameter: {e}")
        raise


def download_file_from_s3(bucket, key, local_path):
    try:
        s3_client.download_file(bucket, key, local_path)
        print(f"Downloaded {key} from {bucket} to {local_path}")
        return True
    except ClientError as e:
        print(f"Error downloading file from S3: {e}")
        return False


def upload_file_to_s3(local_path, bucket, key):
    try:
        s3_client.upload_file(local_path, bucket, key)
        print(f"Uploaded {local_path} to {bucket}/{key}")
        return True
    except ClientError as e:
        print(f"Error uploading file to S3: {e}")
        return False


def transcribe_audio(audio_file_path, openai_api_key):
    """Transcribe audio using OpenAI API"""
    try:
        client = OpenAI(api_key=openai_api_key)

        print(f"Transcribing audio file: {audio_file_path}")

        with open(audio_file_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="gpt-4o-mini-transcribe",
                file=audio_file
            )

        return {
            "text": transcript.text,
            "language": "unknown",
            "duration": 0
        }

    except Exception as e:
        print(f"Error transcribing audio: {e}")
        raise

def send_transcription_email(user_email, recording_name, transcription_text):
    """Send email notification when transcription is complete"""
    try:
        subject = f"Transcription Complete: {recording_name}"
        
        html_body = f"""
        <html>
        <head></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #333; margin-bottom: 20px;">🎉 Transcription Complete!</h2>
                <p style="color: #666; line-height: 1.5;">Your recording "<strong>{recording_name}</strong>" has been successfully transcribed.</p>
                
                <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
                    <h3 style="color: #333; margin-top: 0;">Transcription:</h3>
                    <p style="color: #555; white-space: pre-wrap; font-family: monospace; background-color: #f9f9f9; padding: 10px; border-radius: 3px; margin: 10px 0;">{transcription_text[:500]}{'...' if len(transcription_text) > 500 else ''}</p>
                </div>
                
                <p style="color: #666; font-size: 14px;">
                    You can view the full transcription in your <a href="https://app.notoa.tech/recordings" style="color: #10b981; text-decoration: none;">recordings dashboard</a>.
                </p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                        This is an automated message from Notoa. Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Transcription Complete: {recording_name}
        
        Your recording "{recording_name}" has been successfully transcribed.
        
        Transcription preview:
        {transcription_text}
        
        You can also access the transcription in your recordings dashboard: https://app.notoa.tech/recordings
        """
        
        response = ses_client.send_email(
            Source='noreply@notoa.tech',
            Destination={'ToAddresses': [user_email]},
            Message={
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {
                    'Html': {'Data': html_body, 'Charset': 'UTF-8'},
                    'Text': {'Data': text_body, 'Charset': 'UTF-8'}
                }
            }
        )
        
        print(f"Email sent successfully to {user_email}")
        return True
        
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def handler(event, context):
    """Lambda handler for audio processing"""
    try:
        print(f"Received event: {json.dumps(event)}")

        # Get OpenAI API key
        openai_api_key = get_openai_api_key()
        print("Successfully retrieved OpenAI API key")

        # Extract request data
        http_method = event.get('httpMethod', 'POST')
        path = event.get('path', '')

        # Handle CORS preflight request
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS',
                    'Content-Type': 'application/json'
                },
                'body': ''
            }

        if http_method == 'POST':
            path_parts = path.strip('/').split('/')
            print(f"Path parts: {path_parts}")

            if len(path_parts) >= 3 and path_parts[0] == 'recordings' and path_parts[2] == 'process':
                recording_id = path_parts[1]
                print(f"Extracted recording ID: {recording_id}")

                # Parse request body
                body = json.loads(event.get('body', '{}'))
                bucket = body.get('bucket')
                key = body.get('key')

                if not bucket or not key:
                    return {
                        'statusCode': 400,
                        'headers': {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                            'Access-Control-Allow-Methods': 'POST,OPTIONS',
                            'Content-Type': 'application/json'
                        },
                        'body': json.dumps({
                            'error': 'Missing required parameters: bucket and key'
                        })
                    }

                with tempfile.TemporaryDirectory() as temp_dir:
                    local_filename = key.split('/')[-1]
                    audio_file_path = os.path.join(temp_dir, local_filename)

                    if not download_file_from_s3(bucket, key, audio_file_path):
                        return {
                            'statusCode': 500,
                            'headers': {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                                'Content-Type': 'application/json'
                            },
                            'body': json.dumps({
                                'error': 'Failed to download audio file from S3'
                            })
                        }

                    transcription_result = transcribe_audio(audio_file_path, openai_api_key)

                    transcription_key = f"transcriptions/{local_filename.replace('.', '_')}_transcription.json"
                    transcription_path = os.path.join(temp_dir, "transcription.json")

                    with open(transcription_path, 'w') as f:
                        json.dump(transcription_result, f, indent=2)

                    if upload_file_to_s3(transcription_path, bucket, transcription_key):
                        # Send email notification
                        try:
                            # Extract user email from request body
                            body = json.loads(event.get('body', '{}'))
                            user_email = body.get('userEmail', 'user@notoa.tech')
                            
                            # Extract recording name from key
                            recording_name = local_filename.replace('_', ' ').replace('.wav', '')
                            
                            # Send notification email
                            send_transcription_email(user_email, recording_name, transcription_result['text'])
                        except Exception as email_error:
                            print(f"Failed to send email notification: {email_error}")
                        
                        return {
                            'statusCode': 200,
                            'headers': {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                                'Content-Type': 'application/json'
                            },
                            'body': json.dumps({
                                'success': True,
                                'transcription': transcription_result,
                                'transcription_file': f"s3://{bucket}/{transcription_key}"
                            })
                        }
                    else:
                        return {
                            'statusCode': 500,
                            'headers': {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                                'Content-Type': 'application/json'
                            },
                            'body': json.dumps({
                                'error': 'Failed to save transcription to S3'
                            })
                        }
            else:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                        'Access-Control-Allow-Methods': 'POST,OPTIONS',
                        'Content-Type': 'application/json'
                    },
                    'body': json.dumps({
                        'error': 'Invalid path format. Expected: /recordings/{recording-id}/process'
                    })
                }
        else:
            return {
                'statusCode': 405,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'error': 'Method not allowed'
                })
            }

    except Exception as e:
        print(f"Error in handler: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
