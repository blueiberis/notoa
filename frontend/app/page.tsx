'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/notes`)
      .then(res => res.json())
      .then(setNotes);
  }, []);

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Notoa Notes</h1>
      {notes.length ? notes.map((n: any) => (
        <div key={n.id} className="border p-2 mb-2">{n.content}</div>
      )) : <p>No notes yet</p>}
    </main>
  );
}
