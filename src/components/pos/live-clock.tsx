'use client';

import { useEffect, useState } from 'react';

export function LiveClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center">
      <span className="text-white/70 text-2xl font-bold tabular-nums font-mono">{time}</span>
      <span className="text-white/30 text-xs font-medium mt-0.5">{date}</span>
    </div>
  );
}
