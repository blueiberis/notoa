'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCurrentSession, post, handleApiResponse } from '@/utils/auth';

interface NDISNoteRequest {
  transcript: string;
  participant?: string;
  date?: string;
  location?: string;
  sendEmail?: boolean;
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

export default function NDISNotes() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const [transcript, setTranscript] = useState('');
  const [participant, setParticipant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<NDISNoteResponse | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleGenerateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;

    setIsProcessing(true);
    setGeneratedNote(null);
    setEmailSent(false);

    try {
      const request: NDISNoteRequest = {
        transcript: transcript.trim(),
        participant: participant.trim() || undefined,
        date: date || undefined,
        location: location.trim() || undefined,
        sendEmail
      };

      const response = await post(`${process.env.NEXT_PUBLIC_API_URL}/ndis-notes`, request);
      const data = await handleApiResponse(response);
      
      setGeneratedNote(data.data);
      setEmailSent(data.emailSent);
      
      // Reset form
      setTranscript('');
      setParticipant('');
      setLocation('');
    } catch (error) {
      console.error('Failed to generate NDIS note:', error);
      alert('Failed to generate NDIS note. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">Notoa NDIS Notes</h1>
            <div className="flex items-center space-x-4">
              <nav className="flex space-x-4">
                <Link 
                  href="/dashboard" 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Notes
                </Link>
                <Link 
                  href="/ndis-notes" 
                  className="text-blue-600 hover:text-blue-700 px-3 py-2 rounded-md text-sm font-medium bg-blue-50"
                >
                  NDIS Notes
                </Link>
                <Link 
                  href="/recordings" 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Recordings
                </Link>
              </nav>
              <span className="text-sm text-gray-600">Welcome, {user.username}</span>
              <button
                onClick={handleSignOut}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Input Form */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Generate NDIS Progress Note</h2>
              <form onSubmit={handleGenerateNote} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transcript *
                  </label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste or type the voice transcript here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={6}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Participant Name
                    </label>
                    <input
                      type="text"
                      value={participant}
                      onChange={(e) => setParticipant(e.target.value)}
                      placeholder="e.g., Sarah Smith"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Community Center"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="sendEmail"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="sendEmail" className="ml-2 block text-sm text-gray-700">
                    Send note via email
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || !transcript.trim()}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-md"
                >
                  {isProcessing ? 'Generating...' : 'Generate NDIS Note'}
                </button>
              </form>
            </div>

            {/* Generated Note */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Generated NDIS Note</h2>
              
              {isProcessing && (
                <div className="text-center py-8">
                  <div className="text-gray-500">Processing transcript with AI...</div>
                </div>
              )}

              {!loading && !generatedNote && (
                <div className="text-center py-8 text-gray-500">
                  Complete the form and click "Generate NDIS Note" to create a professional NDIS progress note.
                </div>
              )}

              {generatedNote && (
                <div className="space-y-4">
                  {emailSent && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <div className="text-green-800 text-sm">Note has been sent via email</div>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <span className="font-medium">Participant:</span> {generatedNote.participant}
                      </div>
                      <div>
                        <span className="font-medium">Date:</span> {generatedNote.date}
                      </div>
                      <div>
                        <span className="font-medium">Location:</span> {generatedNote.location}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-gray-900">Support Provided</h4>
                        <p className="text-gray-700 text-sm">{generatedNote.supportProvided}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900">Activities Undertaken</h4>
                        <p className="text-gray-700 text-sm">{generatedNote.activitiesUndertaken}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900">Participant Response</h4>
                        <p className="text-gray-700 text-sm">{generatedNote.participantResponse}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900">Outcomes / Progress</h4>
                        <p className="text-gray-700 text-sm">{generatedNote.outcomesProgress}</p>
                      </div>

                      <div className="bg-green-50 rounded p-3">
                        <h4 className="font-medium text-green-900">Goal Alignment</h4>
                        <p className="text-green-800 text-sm">{generatedNote.goalAlignment}</p>
                      </div>

                      <div className={`rounded p-3 ${generatedNote.incidentsRisks.includes('No incidents') ? 'bg-green-50' : 'bg-yellow-50'}`}>
                        <h4 className={`font-medium ${generatedNote.incidentsRisks.includes('No incidents') ? 'text-green-900' : 'text-yellow-900'}`}>
                          Incidents / Risks
                        </h4>
                        <p className={`text-sm ${generatedNote.incidentsRisks.includes('No incidents') ? 'text-green-800' : 'text-yellow-800'}`}>
                          {generatedNote.incidentsRisks}
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900">Next Steps</h4>
                        <p className="text-gray-700 text-sm">{generatedNote.nextSteps}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
