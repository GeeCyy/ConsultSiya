'use client';

import { useEffect, useRef, useState } from 'react';

interface DocPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fetchUrl: string;
  token: string;
  filename: string;
}

export default function DocPreviewModal({ isOpen, onClose, title, fetchUrl, token, filename }: DocPreviewModalProps) {
  const [blobUrl, setBlobUrl]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const prevUrlRef                = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setBlobUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, fetchUrl, token]);

  const handleDownload = async () => {
    if (!blobUrl) return;
    setDownloading(true);
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1f22] border border-white/10 rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl"
        style={{ height: 'min(90vh, 860px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-semibold text-white truncate max-w-xs">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {blobUrl && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20 transition-colors disabled:opacity-50"
              >
                {downloading
                  ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 relative rounded-b-2xl overflow-hidden bg-[#16171a]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="w-7 h-7 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
              <span className="text-xs text-gray-500">Loading document…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-400 font-medium">Could not load document</p>
              <p className="text-xs text-gray-500">{error}</p>
            </div>
          )}
          {blobUrl && !loading && (
            <iframe
              src={blobUrl}
              className="w-full h-full border-0"
              title={title}
            />
          )}
        </div>
      </div>
    </div>
  );
}
