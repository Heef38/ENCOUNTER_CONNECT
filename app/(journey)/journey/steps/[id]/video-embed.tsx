'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * Click-to-play YouTube facade. A cold-loaded <iframe> is unreliable on
 * mobile (renders a black, non-interactive box). Instead we show the video's
 * thumbnail with a play button; tapping it swaps in the real player with
 * inline autoplay — a real user gesture, which mobile browsers require.
 */
export function VideoEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`}
          className="absolute inset-0 h-full w-full"
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Play ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/15">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
              <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
