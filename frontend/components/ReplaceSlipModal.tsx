'use client';

import { useState } from 'react';
import AdvisingSlipStep from './AdvisingSlipStep';

interface ReplaceSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultationId: number;
  token: string;
  apiUrl: string;
  isDark: boolean;
  title: string;
  onSuccess: () => void | Promise<void>;
}

export default function ReplaceSlipModal({
  isOpen, onClose, consultationId, token, apiUrl, isDark, title, onSuccess,
}: ReplaceSlipModalProps) {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setProofFile(null);
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!proofFile) return;
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('proof', proofFile);
      const res = await fetch(`${apiUrl}/api/consultations/${consultationId}/proof`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) { setError(data.error || 'Failed to submit the slip.'); return; }
      setProofFile(null);
      await onSuccess();
      onClose();
    } catch {
      setError('Failed to submit the slip. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4" onClick={handleClose}>
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl ${isDark ? 'bg-[#1e1f22] border-white/10' : 'bg-white border-gray-200'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</span>
          <button
            onClick={handleClose}
            className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <AdvisingSlipStep
            mode="manual-only"
            isDark={isDark}
            token={token}
            apiUrl={apiUrl}
            proofFile={proofFile}
            onProofFileChange={setProofFile}
          />
          {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
        </div>

        <div className={`flex items-center justify-end gap-2 px-5 py-4 border-t ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
          <button
            onClick={handleClose}
            disabled={submitting}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !proofFile}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
