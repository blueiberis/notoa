'use client';

import { useState, useEffect, useRef } from 'react';
import { getCurrentSession, get, post, del, handleApiResponse } from '@/utils/auth';
import { getEnvVariables } from '../../utils/amplify-check';

interface Recording {
  id: string;
  key: string;
  url: string;
  size: number;
  lastModified: string;
  name: string;
  transcription?: {
    text: string;
    language: string;
    duration: number;
    transcriptionFile?: string;
  };
  transcriptionLoading?: boolean;
  transcriptionError?: string;
}

interface ActiveRecording {
  id: string;
  status: 'recording' | 'paused' | 'stopped';
  startTime: string;
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioErrors, setAudioErrors] = useState<{[key: string]: string}>({});
  const [recordingUrls, setRecordingUrls] = useState<{[key: string]: string}>({});
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchRecordings();
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeRecording && activeRecording.status === 'recording') {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [activeRecording]);

  const fetchRecordings = async () => {
    try {
      const response = await get(`${process.env.NEXT_PUBLIC_API_URL}/recordings`);
      const data = await handleApiResponse(response);
      const recordingsData = data.recordings || [];
      
      // Fetch presigned URLs for all recordings
      const urls: {[key: string]: string} = {};
      for (const recording of recordingsData) {
        try {
          const urlResponse = await get(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${recording.id}/url`);
          const urlData = await handleApiResponse(urlResponse);
          urls[recording.id] = urlData.url || urlData.presignedUrl;
        } catch (err) {
          console.error('Failed to get URL for recording:', recording.id, err);
          urls[recording.id] = recording.url; // Fallback to direct URL
        }
      }
      setRecordingUrls(urls);
      
      // Fetch transcriptions for all recordings
      const recordingsWithTranscriptions = await Promise.all(
        recordingsData.map(async (recording: Recording) => {
          try {
            // Try to fetch transcription from S3
            const transcriptionKey = `transcriptions/${recording.key.split('/').pop()?.replace('.', '_')}_transcription.json`;
            const transcriptionResponse = await get(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${recording.id}/transcription`);
            const transcriptionData = await handleApiResponse(transcriptionResponse);
            
            return {
              ...recording,
              transcription: transcriptionData,
              transcriptionLoading: false,
              transcriptionError: undefined
            };
          } catch (err) {
            // Transcription doesn't exist or failed to load
            console.log('No transcription found for recording:', recording.id);
            return {
              ...recording,
              transcriptionLoading: false,
              transcriptionError: undefined
            };
          }
        })
      );
      
      setRecordings(recordingsWithTranscriptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recordings');
    }
  };

  const startRecording = async () => {
    try {
      // Clear any previous chunks
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, total chunks:', audioChunksRef.current.length);
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred. Please try again.');
      };

      mediaRecorder.start(1000); // Collect data every 1 second
      setRecordingTime(0);

      const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/start`);
      const data = await handleApiResponse(response);
      setActiveRecording({
        id: data.recordingId,
        status: 'recording',
        startTime: data.startTime
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const pauseRecording = async () => {
    if (!mediaRecorderRef.current || !activeRecording) return;

    mediaRecorderRef.current.pause();
    setActiveRecording({ ...activeRecording, status: 'paused' });

    try {
      const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${activeRecording.id}/pause`);
      await handleApiResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause recording');
    }
  };

  const resumeRecording = async () => {
    if (!mediaRecorderRef.current || !activeRecording) return;

    mediaRecorderRef.current.resume();
    setActiveRecording({ ...activeRecording, status: 'recording' });

    try {
      const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${activeRecording.id}/resume`);
      await handleApiResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume recording');
    }
  };

  const saveRecording = async () => {
    if (!mediaRecorderRef.current || !activeRecording) return;

    setIsLoading(true);
    mediaRecorderRef.current.stop();
    
    // Wait for the last dataavailable event
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (audioChunksRef.current.length === 0) {
      setError('No audio data recorded. Please try recording again.');
      setIsLoading(false);
      return;
    }
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    if (audioBlob.size === 0) {
      setError('Audio recording is empty. Please try again.');
      setIsLoading(false);
      return;
    }
    
    console.log('Audio blob size:', audioBlob.size, 'bytes');
    console.log('Audio chunks count:', audioChunksRef.current.length);
    
    const reader = new FileReader();
    
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      
      if (!base64Audio || !base64Audio.includes(',')) {
        setError('Failed to process audio data. Please try again.');
        setIsLoading(false);
        return;
      }
      
      const audioData = base64Audio.split(',')[1];
      
      if (!audioData || audioData.length === 0) {
        setError('Audio data is empty after processing. Please try again.');
        setIsLoading(false);
        return;
      }
      
      console.log('Base64 audio data length:', audioData.length);
      
      try {
        const recordingName = `Recording-${new Date().toISOString().slice(0, 19)}`;
        const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${activeRecording.id}/save`, {
          audioData,
          name: recordingName
        });
        await handleApiResponse(response);
        setActiveRecording(null);
        setRecordingTime(0);
        audioChunksRef.current = [];
        fetchRecordings(); // Refresh the list
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save recording');
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read audio data. Please try again.');
      setIsLoading(false);
    };

    reader.readAsDataURL(audioBlob);
  };

  const processAudioForTranscription = async (recording: Recording) => {
    try {
      console.log('Processing transcription for recording:', recording);
      
      // Update recording state to show loading
      setRecordings(prev => prev.map(r => 
        r.id === recording.id 
          ? { ...r, transcriptionLoading: true, transcriptionError: undefined }
          : r
      ));

      const envVars = getEnvVariables();
      const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${recording.id}/process`, {
        bucket: envVars.s3BucketUploads,
        key: recording.key
      });

      const result = await handleApiResponse(response);
      
      console.log('Transcription result:', result);
      
      // Update recording with transcription data
      setRecordings(prev => prev.map(r => 
        r.id === recording.id 
          ? { ...r, transcription: result.transcription, transcriptionLoading: false }
          : r
      ));

      // Refresh recordings to get updated data
      setTimeout(fetchRecordings, 2000);
    } catch (err) {
      console.error('Failed to process audio for transcription:', err);
      setRecordings(prev => prev.map(r => 
        r.id === recording.id 
          ? { ...r, transcriptionLoading: false, transcriptionError: 'Failed to process audio' }
          : r
      ));
    }
  };

  const discardRecording = async () => {
    if (!activeRecording) return;

    setIsLoading(true);
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    try {
      const response = await del(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${activeRecording.id}/discard`);
      await handleApiResponse(response);
      setActiveRecording(null);
      setRecordingTime(0);
      audioChunksRef.current = [];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard recording');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Audio Recordings</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Recording Controls</h2>
        
        {activeRecording ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${
                  activeRecording.status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'
                }`} />
                <span className="font-medium">
                  {activeRecording.status === 'recording' ? 'Recording' : 'Paused'}
                </span>
              </div>
              <div className="text-lg font-mono">
                {formatTime(recordingTime)}
              </div>
            </div>
            
            <div className="flex space-x-2">
              {activeRecording.status === 'recording' ? (
                <button
                  onClick={pauseRecording}
                  disabled={isLoading}
                  className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  disabled={isLoading}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                >
                  Resume
                </button>
              )}
              
              <button
                onClick={saveRecording}
                disabled={isLoading}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
              
              <button
                onClick={discardRecording}
                disabled={isLoading}
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
              >
                {isLoading ? 'Discarding...' : 'Discard'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startRecording}
            disabled={isLoading}
            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium"
          >
            Start Recording
          </button>
        )}
      </div>

      {/* Recordings List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Saved Recordings</h2>
        
        {recordings.length === 0 ? (
          <p className="text-gray-500">No recordings saved yet.</p>
        ) : (
          <div className="space-y-3">
            {recordings.map((recording, index) => (
              <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{recording.name}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(recording.lastModified).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      Size: {(recording.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  
                  <audio 
                    controls 
                    preload="metadata"
                    src={recordingUrls[recording.id] || recording.url}
                    className="w-64"
                    onLoadStart={() => {
                      console.log('Loading audio:', recording.name);
                      setAudioErrors(prev => ({ ...prev, [recording.id]: '' }));
                    }}
                    onCanPlay={() => {
                      console.log('Audio can play:', recording.name);
                    }}
                    onError={(e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
                      console.error('Audio playback error:', e);
                      const errorMessage = `Failed to load "${recording.name}": ${(e.target as HTMLAudioElement).error?.message || 'Unknown error'}`;
                      setAudioErrors(prev => ({ ...prev, [recording.id]: errorMessage }));
                      setError(errorMessage);
                    }}
                  />
                </div>
                
                {/* Transcription Section */}
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">Transcription</h4>
                    {!recording.transcription && !recording.transcriptionLoading && (
                      <button
                        onClick={() => processAudioForTranscription(recording)}
                        className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                      >
                        Generate Transcription
                      </button>
                    )}
                  </div>
                  
                  {recording.transcriptionLoading && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing audio...</span>
                    </div>
                  )}
                  
                  {recording.transcriptionError && (
                    <div className="text-sm text-red-600">
                      {recording.transcriptionError}
                    </div>
                  )}
                  
                  {recording.transcription && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>Language: {recording.transcription.language}</span>
                        <span>Duration: {Math.round(recording.transcription.duration)}s</span>
                      </div>
                      <div className="bg-gray-50 p-3 rounded text-sm">
                        <p className="whitespace-pre-wrap">{recording.transcription.text}</p>
                      </div>
                      {recording.transcription.transcriptionFile && (
                        <div className="text-xs text-gray-500">
                          <span>Transcription saved to: {recording.transcription.transcriptionFile}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {audioErrors[recording.id] && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                    {audioErrors[recording.id]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
