'use client';

import { useRef, useState } from 'react';
import SignaturePad from './SignaturePad';

export type SlipFormMode = 'auto' | 'manual';

interface AdvisingSlipStepProps {
  /** 'full' = auto/manual radio choice (booking a new consultation).
   *  'manual-only' = just the download + upload block (replacing/submitting a slip
   *  for a consultation that already exists — there's no signature/auto option here). */
  mode: 'full' | 'manual-only';
  isDark: boolean;
  token: string;
  apiUrl: string;
  proofFile: File | null;
  onProofFileChange: (file: File | null) => void;
  formMode?: SlipFormMode;
  onFormModeChange?: (m: SlipFormMode) => void;
  signature?: string | null;
  onSignatureChange?: (sig: string | null) => void;
  rememberSignature?: boolean;
  onRememberSignatureChange?: (v: boolean) => void;
}

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function AdvisingSlipStep({
  mode, isDark, token, apiUrl, proofFile, onProofFileChange,
  formMode = 'auto', onFormModeChange,
  signature = null, onSignatureChange,
  rememberSignature = true, onRememberSignatureChange,
}: AdvisingSlipStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState('');

  const tp = isDark ? 'text-white' : 'text-gray-900';
  const ts = isDark ? 'text-gray-400' : 'text-gray-500';

  const handleDownloadTemplate = async () => {
    const res = await fetch(`${apiUrl}/api/forms/blank-slip`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'advising-slip-FM-AS-11-02.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) { setFileError('Only PDF, JPG, and PNG files are allowed.'); return; }
    if (file.size > MAX_FILE_BYTES) { setFileError('File must be under 10 MB.'); return; }
    setFileError('');
    onProofFileChange(file);
  };

  const manualBlock = (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={handleDownloadTemplate}
        className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ring-1 transition-colors ${isDark ? 'bg-sky-500/10 text-sky-400 ring-sky-500/20 hover:bg-sky-500/20' : 'bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100'}`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Download Blank Form Template
      </button>
      <p className={`text-[11px] ${ts}`}>Fill it out, then upload the completed PDF below.</p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg ring-1 transition-colors ${isDark ? 'bg-white/[0.04] text-gray-300 ring-white/10 hover:bg-white/[0.08]' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        {proofFile ? proofFile.name.slice(0, 28) + (proofFile.name.length > 28 ? '…' : '') : 'Choose PDF File'}
      </button>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />
      {fileError && <p className="text-red-500 text-[10px]">{fileError}</p>}
    </div>
  );

  if (mode === 'manual-only') return manualBlock;

  return (
    <>
      <div className="space-y-2 mb-4">
        {(['auto', 'manual'] as const).map(m => (
          <label key={m} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="advisingSlipFormMode"
              checked={formMode === m}
              onChange={() => {
                onFormModeChange?.(m);
                if (m === 'manual') onSignatureChange?.(null);
                else { onProofFileChange(null); setFileError(''); }
              }}
              className="accent-[#0EA5E9] mt-0.5 flex-shrink-0"
            />
            <div>
              <span className={`text-xs font-medium ${tp}`}>
                {m === 'auto' ? 'Use automatic form' : "I'll fill and submit the form myself"}
              </span>
              <p className={`text-[11px] mt-0.5 ${ts}`}>
                {m === 'auto'
                  ? 'Draw your signature below, or skip and we\'ll stamp your name and student number automatically.'
                  : 'Download the blank form, fill it out, and upload the completed PDF.'}
              </p>
            </div>
          </label>
        ))}
      </div>

      {formMode === 'auto' && (
        <>
          <p className={`text-[11px] mb-2 ${ts}`}>Signature <span className={isDark ? 'text-gray-600' : 'text-gray-400'}>(optional — leave blank to use auto-stamp)</span></p>
          <SignaturePad value={signature} onChange={sig => onSignatureChange?.(sig)} isDark={isDark} />
          {signature && (
            <label className={`flex items-center gap-2 mt-2.5 text-xs cursor-pointer ${ts}`}>
              <input type="checkbox" checked={rememberSignature} onChange={e => onRememberSignatureChange?.(e.target.checked)} className="accent-[#0EA5E9]" />
              Remember my signature for next time
            </label>
          )}
        </>
      )}

      {formMode === 'manual' && manualBlock}
    </>
  );
}
