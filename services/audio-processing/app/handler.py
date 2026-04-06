import json
import os
import boto3
import openai
import whisper
import tempfile
import uuid
from botocore.exceptions import ClientError

# Initialize AWS clients
s3_client = boto3.client('s3')
ssm_client = boto3.client('ssm')

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
    """Transcribe audio using Whisper"""
    try:
        openai.api_key = openai_api_key
        print("Loading Whisper model...")
        model = whisper.load_model("base")
        print(f"Transcribing audio file: {audio_file_path}")
        result = model.transcribe(audio_file_path)
        return {
            "text": result['text'],
            "language": result.get("language", "unknown"),
            "duration": result.get("segments", [{}])[0].get("end", 0) if result.get("segments") else 0
        }
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        raise


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
            # Extract recording ID from path
            # Expected path: /recordings/{recording-id}/process
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
                    audio_file_path = os.path.join(temp_dir, f"audio_{uuid.uuid4()}.wav")
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
                    
                    transcription_key = f"transcriptions/{key.split('/')[-1].replace('.', '_')}_transcription.json"
                    transcription_path = os.path.join(temp_dir, "transcription.json")
                    
                    with open(transcription_path, 'w') as f:
                        json.dump(transcription_result, f, indent=2)
                    
                    if upload_file_to_s3(transcription_path, bucket, transcription_key):
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
