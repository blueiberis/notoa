'use client';

import { useState, useEffect, useRef } from 'react';
import { getCurrentSession, get, post, del, handleApiResponse } from '@/utils/auth';

interface Recording {
  key: string;
  url: string;
  size: number;
  lastModified: string;
  name: string;
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
      setRecordings(data.recordings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recordings');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
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
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const reader = new FileReader();
    
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      
      try {
        const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/recordings/${activeRecording.id}/save`, {
          audioData: base64Audio.split(',')[1], // Remove data:audio/webm;base64, prefix
          name: `Recording-${new Date().toISOString().slice(0, 19)}`
        });
        await handleApiResponse(response);
        setActiveRecording(null);
        setRecordingTime(0);
        fetchRecordings(); // Refresh the list
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save recording');
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsDataURL(audioBlob);
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
                    src={recording.url}
                    className="w-64"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
