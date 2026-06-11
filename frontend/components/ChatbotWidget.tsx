'use client';

import { useState, useRef, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Tree types ────────────────────────────────────────────────────────────────
type TreeOption = { label: string; next: string };
type TreeNode = {
  message: string;
  options: TreeOption[];
  apiQuery?: string; // if set, POST /api/chat with this text before showing options
};

// ── Professor tree ────────────────────────────────────────────────────────────
const PROF_TREE: Record<string, TreeNode> = {
  root: {
    message: "Hi! I'm the Consulta Assistant. How can I help you today?",
    options: [
      { label: '📅 Managing Schedules',  next: 'schedules'      },
      { label: '👥 Consultations',        next: 'consultations'  },
      { label: '📊 Reports & Export',     next: 'reports'        },
      { label: '📆 Booking Calendar',     next: 'calendar'       },
      { label: 'ℹ️ About Consulta',       next: 'about'          },
    ],
  },

  // ── Schedules ──
  schedules: {
    message: 'What would you like to know about schedules?',
    options: [
      { label: 'How to add a slot',    next: 'sched_add'    },
      { label: 'How to edit a slot',   next: 'sched_edit'   },
      { label: 'How to remove a slot', next: 'sched_remove' },
      { label: '← Back',              next: 'root'          },
    ],
  },
  sched_add: {
    message: 'To add a consultation slot:\n1. Go to Manage Schedules\n2. Click a date on the calendar\n3. Enter a location (optional, for F2F)\n4. Set your start and end times\n5. Click Add Slot\n\nYou can add multiple time ranges per slot using "+ Add Time Range".',
    options: [
      { label: 'More about schedules', next: 'schedules' },
      { label: '← Main menu',         next: 'root'       },
    ],
  },
  sched_edit: {
    message: 'To edit a slot:\n1. Go to Manage Schedules\n2. Find the slot in Your Slots\n3. Click Edit\n4. Modify the date, time ranges, or location\n5. Confirm changes\n\nNote: slots with active bookings will warn you before saving.',
    options: [
      { label: 'More about schedules', next: 'schedules' },
      { label: '← Main menu',         next: 'root'       },
    ],
  },
  sched_remove: {
    message: 'To remove a slot:\n1. Go to Manage Schedules\n2. Find the slot you want to delete\n3. Click Remove and confirm\n\nNote: you cannot remove slots that have confirmed bookings.',
    options: [
      { label: 'More about schedules', next: 'schedules' },
      { label: '← Main menu',         next: 'root'       },
    ],
  },

  // ── Consultations ──
  consultations: {
    message: 'What would you like to know about consultations?',
    options: [
      { label: 'Confirming a booking',  next: 'consult_confirm'    },
      { label: 'Marking as completed',  next: 'consult_complete'   },
      { label: 'Cancelling a booking',  next: 'consult_cancel'     },
      { label: 'Rescheduling',          next: 'consult_reschedule' },
      { label: '← Back',               next: 'root'               },
    ],
  },
  consult_confirm: {
    message: 'To confirm a consultation:\n1. Go to My Consultations\n2. Find a pending booking\n3. Click Confirm\n4. For online sessions, add a meeting link (optional)\n5. The student will be notified.',
    options: [
      { label: 'More about consultations', next: 'consultations' },
      { label: '← Main menu',             next: 'root'          },
    ],
  },
  consult_complete: {
    message: 'To mark as completed:\n1. Go to My Consultations\n2. Find the confirmed consultation\n3. Click Complete\n4. Select the action taken (Resolved / For Follow-up / Referred to)\n5. Add optional remarks and submit\n\nCompleted consultations move to History.',
    options: [
      { label: 'More about consultations', next: 'consultations' },
      { label: '← Main menu',             next: 'root'          },
    ],
  },
  consult_cancel: {
    message: 'To cancel a consultation:\n1. Go to My Consultations\n2. Find the booking\n3. Click Cancel\n4. Enter a reason (required)\n5. The student will be notified.',
    options: [
      { label: 'More about consultations', next: 'consultations' },
      { label: '← Main menu',             next: 'root'          },
    ],
  },
  consult_reschedule: {
    message: 'To reschedule:\n1. Go to My Consultations\n2. Find the booking\n3. Click Reschedule\n4. Select a new date and time\n5. The student will be notified\n\nRescheduled consultations show a "Rescheduled" status badge.',
    options: [
      { label: 'More about consultations', next: 'consultations' },
      { label: '← Main menu',             next: 'root'          },
    ],
  },

  // ── Reports ──
  reports: {
    message: 'What would you like to know about reports?',
    options: [
      { label: 'Export as Excel', next: 'export_excel' },
      { label: 'Export as PDF',   next: 'export_pdf'   },
      { label: '← Back',         next: 'root'          },
    ],
  },
  export_excel: {
    message: 'To export as Excel:\n1. Go to Export Report\n2. Click Download as Excel (.xlsx)\n3. The file downloads automatically\n\nThe report includes all consultations, student details, dates, and outcomes.',
    options: [
      { label: 'More about reports', next: 'reports' },
      { label: '← Main menu',       next: 'root'    },
    ],
  },
  export_pdf: {
    message: 'To export as PDF:\n1. Go to Export Report\n2. Click Download as PDF\n3. The file downloads automatically\n\nThe PDF contains a formatted summary of all your consultations.',
    options: [
      { label: 'More about reports', next: 'reports' },
      { label: '← Main menu',       next: 'root'    },
    ],
  },

  // ── Calendar ──
  calendar: {
    message: 'What would you like to know about the Booking Calendar?',
    options: [
      { label: 'What does the calendar show?', next: 'calendar_info'   },
      { label: 'Understanding color codes',    next: 'calendar_colors' },
      { label: '← Back',                      next: 'root'            },
    ],
  },
  calendar_info: {
    message: 'The Booking Calendar shows all your scheduled slots on a monthly view.\n\n• Dots on dates = you have a slot that day\n• Click any date to see its consultations\n• Navigate months with the arrow buttons',
    options: [
      { label: 'Color codes',  next: 'calendar_colors' },
      { label: '← Main menu', next: 'root'             },
    ],
  },
  calendar_colors: {
    message: 'Calendar color guide:\n• Green dot — slot is open, no bookings\n• Amber/orange dot — slot has bookings\n• Red cell — admin-blocked date (holiday)\n• Blue — online mode week\n• Orange — exam/midterm week',
    options: [
      { label: 'More about calendar', next: 'calendar' },
      { label: '← Main menu',        next: 'root'      },
    ],
  },

  // ── About ──
  about: {
    message: 'Consulta is the SOIT Academic Consultation System at Mapúa University.\n\nIt allows professors to manage consultation schedules and students to book appointments.\n\nKey features:\n• Schedule management with multiple time ranges\n• Online & face-to-face consultations\n• PDF advising slips\n• Excel & PDF report exports\n• Admin-managed academic calendar',
    options: [{ label: '← Main menu', next: 'root' }],
  },
};

// ── Student tree ──────────────────────────────────────────────────────────────
const STUDENT_TREE: Record<string, TreeNode> = {
  root: {
    message: "Hi! I'm the Consulta Assistant. What do you need help with?",
    options: [
      { label: '🔍 Find a professor',         next: 'find_prof'   },
      { label: '📅 How to book',              next: 'booking'     },
      { label: '📋 About my consultations',   next: 'my_consults' },
      { label: 'ℹ️ About Consulta',           next: 'about'       },
    ],
  },

  // ── Find professor ──
  find_prof: {
    message: 'What type of concern do you have?',
    options: [
      { label: 'Thesis / Design Subject',       next: 'api_thesis'        },
      { label: 'Subject mentoring / grades',    next: 'api_mentoring'     },
      { label: 'Course requirements',           next: 'api_requirements'  },
      { label: 'Electives / Curriculum',        next: 'api_electives'     },
      { label: 'Internship / OJT',              next: 'api_internship'    },
      { label: 'Career / Employment',           next: 'api_career'        },
      { label: 'Personal matters',              next: 'api_personal'      },
      { label: 'Show all professors',           next: 'api_all'           },
      { label: '← Back',                       next: 'root'              },
    ],
  },
  api_thesis:       { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles thesis concerns?' },
  api_mentoring:    { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles mentoring and subject concerns?' },
  api_requirements: { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles course requirements and grades?' },
  api_electives:    { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles electives and curriculum concerns?' },
  api_internship:   { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles internship and OJT concerns?' },
  api_career:       { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles career and employment concerns?' },
  api_personal:     { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Who handles personal and family concerns?' },
  api_all:          { message: '', options: [{ label: '← Back', next: 'find_prof' }, { label: '← Main menu', next: 'root' }], apiQuery: 'Show me all professors' },

  // ── Booking ──
  booking: {
    message: 'What would you like to know about booking?',
    options: [
      { label: 'How to book step by step', next: 'book_how'   },
      { label: 'F2F vs Online modes',      next: 'book_modes' },
      { label: 'What happens after I book?', next: 'book_after' },
      { label: '← Back',                  next: 'root'        },
    ],
  },
  book_how: {
    message: 'To book a consultation:\n1. Click Book a Consultation\n2. Choose a professor\n3. Select an available time slot\n4. Choose F2F or Online mode\n5. Describe your concern\n6. Submit\n\nYour booking will be pending until the professor confirms it.',
    options: [
      { label: 'More booking questions', next: 'booking' },
      { label: '← Main menu',           next: 'root'    },
    ],
  },
  book_modes: {
    message: 'Consultation modes:\n\n• Face-to-Face (F2F) — meet at the professor\'s listed room/location\n\n• Online — professor provides a meeting link (Zoom, Teams, etc.) after confirming\n\nAvailable modes depend on what the professor set up for that slot.',
    options: [
      { label: 'More booking questions', next: 'booking' },
      { label: '← Main menu',           next: 'root'    },
    ],
  },
  book_after: {
    message: 'After submitting:\n1. Status shows as Pending\n2. Professor confirms or reschedules\n3. Once confirmed → check for room/meeting link details\n4. Attend the consultation\n5. Professor marks it completed\n\nYou can track everything in My Consultations.',
    options: [
      { label: 'More booking questions', next: 'booking' },
      { label: '← Main menu',           next: 'root'    },
    ],
  },

  // ── My consultations ──
  my_consults: {
    message: 'What would you like to know?',
    options: [
      { label: 'What the statuses mean', next: 'consult_status' },
      { label: 'How to cancel a booking', next: 'consult_cancel' },
      { label: '← Back',                 next: 'root'           },
    ],
  },
  consult_status: {
    message: 'Consultation statuses:\n\n• Pending — waiting for professor to confirm\n• Confirmed — accepted; check for meeting details\n• Completed — consultation is done\n• Cancelled — either party cancelled\n• Rescheduled — moved to a new time\n• Missed — time passed without completion',
    options: [
      { label: 'More consultation questions', next: 'my_consults' },
      { label: '← Main menu',                next: 'root'        },
    ],
  },
  consult_cancel: {
    message: 'To cancel a booking:\n1. Go to My Consultations\n2. Find the pending or confirmed booking\n3. Click Cancel\n4. Provide a reason\n\nPlease cancel only when necessary — repeated cancellations are tracked.',
    options: [
      { label: 'More consultation questions', next: 'my_consults' },
      { label: '← Main menu',                next: 'root'        },
    ],
  },

  // ── About ──
  about: {
    message: 'Consulta is the SOIT Academic Consultation System at Mapúa University.\n\nIt connects students with professors for academic consultations.\n\nKey features:\n• Book online or face-to-face consultations\n• Digital advising slips (PDF)\n• Track consultation history\n• Admin-managed academic calendar',
    options: [{ label: '← Main menu', next: 'root' }],
  },
};

// ── Renderers ─────────────────────────────────────────────────────────────────
function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
  );
}

function FaqAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-0.5">
      {text.split('\n').map((line, i) => (
        <p key={i} className="leading-relaxed">{renderBold(line)}</p>
      ))}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────
export default function ChatbotWidget({
  token,
  role = 'professor',
}: {
  token: string | null;
  role?: 'professor' | 'student';
}) {
  const tree = role === 'student' ? STUDENT_TREE : PROF_TREE;

  const [open,        setOpen]    = useState(false);
  const [nodeId,      setNodeId]  = useState('root');
  const [loading,     setLoading] = useState(false);
  const [apiMessage,  setApiMsg]  = useState('');
  const [apiOptions,  setApiOpts] = useState<TreeOption[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Reset to root on close
  useEffect(() => {
    if (open) return;
    setNodeId('root');
    setLoading(false);
    setApiMsg('');
    setApiOpts([]);
  }, [open]);

  // Scroll answer into view on node change
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [nodeId]);

  const currentNode  = tree[nodeId] ?? tree['root'];
  const displayMsg   = apiMessage  || currentNode.message;
  const displayOpts  = apiOptions.length > 0 ? apiOptions : currentNode.options;
  const isRoot       = nodeId === 'root';

  const selectOption = async (opt: TreeOption) => {
    if (loading) return;
    setApiMsg('');
    setApiOpts([]);

    const nextNode = tree[opt.next] ?? tree['root'];

    if (nextNode.apiQuery) {
      setNodeId(opt.next);
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: nextNode.apiQuery }),
        });
        const data = await res.json();
        setApiMsg(data.reply || data.error || 'No response.');
      } catch {
        setApiMsg('Could not reach the assistant. Please try again.');
      } finally {
        setLoading(false);
        setApiOpts(nextNode.options);
      }
      return;
    }

    setNodeId(opt.next);
  };

  const rootOptionCount = tree['root'].options.length;

  return (
    <div className="fixed bottom-5 right-3 sm:right-5 z-[55] flex flex-col items-end gap-3">

      {/* ── FAQ panel ── */}
      {open && (
        <div
          className="w-[calc(100vw-24px)] sm:w-80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[480px] sm:max-h-[520px]"
          style={{ backgroundColor: '#1e1f22', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ backgroundColor: '#2b2d31', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-8 h-8 rounded-full bg-[#0EA5E9] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">FAQ</p>
              <p className="text-[11px] text-gray-400">Choose a topic</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>

            {/* Root subtitle */}
            {isRoot && (
              <p className="px-4 pt-4 pb-2 text-xs text-gray-400">
                Select a topic to get an instant answer.
              </p>
            )}

            {/* Answer area — only shown when not at root */}
            {!isRoot && (
              <div className="px-4 pt-4 pb-3">
                <div className="rounded-xl px-3 py-3 text-xs text-gray-300 leading-relaxed"
                  style={{ backgroundColor: '#383a40' }}>
                  {loading ? (
                    <div className="flex items-center gap-1.5 py-1">
                      {[0, 1, 2].map(n => (
                        <span key={n} className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                          style={{ animationDelay: `${n * 150}ms` }} />
                      ))}
                    </div>
                  ) : displayMsg ? (
                    <FaqAnswer text={displayMsg} />
                  ) : null}
                </div>
              </div>
            )}

            {/* Option buttons */}
            {!loading && (
              <div className="px-3 pb-3 pt-1 space-y-1.5">
                {displayOpts.map(opt => (
                  <button
                    key={opt.next}
                    onClick={() => selectOption(opt)}
                    className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.98]"
                    style={{ backgroundColor: '#2b2d31', color: '#dbdee1' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#35373c'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2b2d31'; }}
                  >
                    <span>{opt.label}</span>
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-2.5 flex items-center justify-between flex-shrink-0"
            style={{ backgroundColor: '#2b2d31', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px] text-gray-500">{rootOptionCount} topics available</span>
            {!isRoot && (
              <button
                onClick={() => { setNodeId('root'); setApiMsg(''); setApiOpts([]); }}
                className="text-[11px] text-[#CC0000] hover:underline transition-colors"
              >
                All topics
              </button>
            )}
            {isRoot && <span className="text-[11px] text-gray-500">All topics</span>}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-[#0EA5E9] shadow-lg shadow-sky-900/40 flex items-center justify-center hover:bg-[#0284C7] hover:scale-105 active:scale-95 transition-all"
        aria-label="Open Consulta Assistant"
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        )}
      </button>
    </div>
  );
}
