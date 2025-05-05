// Main application page
"use client";

import dynamic from 'next/dynamic';

// Import the Map component with dynamic import
const DynamicMap = dynamic(() => import('./map'), {
  loading: () => <div style={{ width: '100%', height: '100vh', background: '#000' }}>Loading map...</div>
});

export default function Home() {
  return (
    <main>
      {/* Rendering the Map component that displays the map with wind particles */}
      <DynamicMap />
    </main>
  );
}
