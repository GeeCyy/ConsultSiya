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
      { label: '🗺️ Take a navigation tour', next: 'restart_tour' },
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
      { label: '🔍 Find a professor',           next: 'find_prof'    },
      { label: '📅 How to book',                next: 'booking'      },
      { label: '📋 About my consultations',     next: 'my_consults'  },
      { label: 'ℹ️ About Consulta',             next: 'about'        },
      { label: '🗺️ Take a navigation tour',     next: 'restart_tour' },
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

// ── Admin tree ────────────────────────────────────────────────────────────────
const ADMIN_TREE: Record<string, TreeNode> = {
  root: {
    message: "Hi! I'm the Consulta Admin Assistant. What do you need help with?",
    options: [
      { label: '👥 Managing Accounts',       next: 'accounts'     },
      { label: '✅ Approving Consultations',  next: 'approvals'    },
      { label: '📅 Academic Calendar',        next: 'calendar'     },
      { label: '📊 Reports & History',        next: 'reports'      },
      { label: '📣 Announcements',            next: 'announce'     },
      { label: 'ℹ️ About Consulta',           next: 'about'        },
    ],
  },

  // ── Accounts ──
  accounts: {
    message: 'What do you need help with regarding accounts?',
    options: [
      { label: 'How to add a professor',      next: 'acct_add_prof'  },
      { label: 'How to add a student',        next: 'acct_add_stu'   },
      { label: 'How to ban/unban a user',     next: 'acct_ban'       },
      { label: 'How to delete an account',    next: 'acct_delete'    },
      { label: 'Viewing a profile',           next: 'acct_view'      },
      { label: '← Back',                     next: 'root'           },
    ],
  },
  acct_add_prof: {
    message: 'To add a professor account:\n1. Go to Accounts\n2. Click Add Professor\n3. Fill in their name, email, department, and set a password\n4. Click Save\n\nThe professor can log in immediately and update their profile.',
    options: [{ label: 'More about accounts', next: 'accounts' }, { label: '← Main menu', next: 'root' }],
  },
  acct_add_stu: {
    message: 'To add a student account:\n1. Go to Accounts\n2. Click Add Student\n3. Fill in their name, email, student ID, program, and set a password\n4. Click Save\n\nStudents can also self-register if registration is open.',
    options: [{ label: 'More about accounts', next: 'accounts' }, { label: '← Main menu', next: 'root' }],
  },
  acct_ban: {
    message: 'To ban or unban a user:\n1. Go to Accounts\n2. Find the user and click their name\n3. In the profile modal, click Ban User (or Unban if already banned)\n4. Confirm the action\n\nBanned users cannot log in. Their data is preserved.',
    options: [{ label: 'More about accounts', next: 'accounts' }, { label: '← Main menu', next: 'root' }],
  },
  acct_delete: {
    message: 'To delete an account:\n1. Go to Accounts\n2. Find the user\n3. Click Delete and confirm\n\nWarning: deleting an account is permanent and removes all associated data including consultations.',
    options: [{ label: 'More about accounts', next: 'accounts' }, { label: '← Main menu', next: 'root' }],
  },
  acct_view: {
    message: 'To view a user profile:\n1. Go to Accounts\n2. Click any user\'s name or avatar\n3. A modal opens with their full profile, contact info, and consultation history\n\nYou can also edit or take action (ban/delete) directly from this modal.',
    options: [{ label: 'More about accounts', next: 'accounts' }, { label: '← Main menu', next: 'root' }],
  },

  // ── Approvals ──
  approvals: {
    message: 'What would you like to know about consultations?',
    options: [
      { label: 'Approving pending requests',  next: 'appr_approve'   },
      { label: 'Viewing all consultations',   next: 'appr_view'      },
      { label: 'Filtering by status',         next: 'appr_filter'    },
      { label: '← Back',                     next: 'root'           },
    ],
  },
  appr_approve: {
    message: 'To approve pending consultations:\n1. Go to Consultations\n2. Filter by Pending status\n3. Review the booking details\n4. Click Approve\n\nOr use the Quick Action "Approve Pending" on the Home tab to see all pending requests at once.',
    options: [{ label: 'More about consultations', next: 'approvals' }, { label: '← Main menu', next: 'root' }],
  },
  appr_view: {
    message: 'To view all consultations:\n1. Go to Consultations tab\n2. All bookings across all professors are listed here\n3. Use the search bar to find by student or professor name\n\nConsultations are sorted by date (most recent first).',
    options: [{ label: 'More about consultations', next: 'approvals' }, { label: '← Main menu', next: 'root' }],
  },
  appr_filter: {
    message: 'To filter consultations:\n1. Go to Consultations tab\n2. Use the status filter pills: All · Pending · Confirmed · Completed · Cancelled · Missed\n3. Use the search box to narrow by name or date\n\nYou can combine filters for a more specific view.',
    options: [{ label: 'More about consultations', next: 'approvals' }, { label: '← Main menu', next: 'root' }],
  },

  // ── Calendar ──
  calendar: {
    message: 'What do you need help with for the Academic Calendar?',
    options: [
      { label: 'Setting the term dates',     next: 'cal_term'     },
      { label: 'Blocking dates (holidays)',  next: 'cal_block'    },
      { label: 'Marking exam weeks',         next: 'cal_exam'     },
      { label: 'Online / F2F mode weeks',    next: 'cal_mode'     },
      { label: '← Back',                    next: 'root'         },
    ],
  },
  cal_term: {
    message: 'To configure the term:\n1. Go to Home tab\n2. In the Term Configuration card, set the Term Label, Start Date, Total Weeks, Midterm Week, and Finals Week\n3. Click Save\n\nChanges apply immediately to the academic calendar visible to all users.',
    options: [{ label: 'More about calendar', next: 'calendar' }, { label: '← Main menu', next: 'root' }],
  },
  cal_block: {
    message: 'To block a date (e.g. holiday):\n1. Go to Calendar tab\n2. Click on a date\n3. Select "Block Date"\n4. Optionally add a label (e.g. "Rizal Day")\n\nBlocked dates show in red on the calendar and students cannot book slots on those dates.',
    options: [{ label: 'More about calendar', next: 'calendar' }, { label: '← Main menu', next: 'root' }],
  },
  cal_exam: {
    message: 'To mark a week as exam week:\n1. Go to Calendar tab\n2. Click on any date in the target week\n3. Select "Mark as Exam Week"\n\nExam weeks are highlighted on the calendar for both professors and students.',
    options: [{ label: 'More about calendar', next: 'calendar' }, { label: '← Main menu', next: 'root' }],
  },
  cal_mode: {
    message: 'To set online/F2F mode for a week:\n1. Go to Calendar tab\n2. Click on any date in the target week\n3. Select the mode (Online, F2F, or Hybrid)\n\nMode overrides are visible to professors when they schedule slots for that week.',
    options: [{ label: 'More about calendar', next: 'calendar' }, { label: '← Main menu', next: 'root' }],
  },

  // ── Reports ──
  reports: {
    message: 'What do you need help with for reports?',
    options: [
      { label: 'Viewing system reports',     next: 'rep_view'    },
      { label: 'Term Archive',               next: 'rep_archive' },
      { label: '← Back',                    next: 'root'        },
    ],
  },
  rep_view: {
    message: 'To view system reports:\n1. Go to Reports tab\n2. View consultation counts by professor, student, or status\n3. Filter by term or date range\n4. Export as Excel or PDF using the download buttons\n\nReports cover all consultations across all professors.',
    options: [{ label: 'More about reports', next: 'reports' }, { label: '← Main menu', next: 'root' }],
  },
  rep_archive: {
    message: 'The Term Archive stores closed academic terms:\n1. Go to Term Archive tab\n2. Browse past terms and their consultation records\n3. Click any term to view its full consultation history\n\nArchived data is read-only and preserved permanently.',
    options: [{ label: 'More about reports', next: 'reports' }, { label: '← Main menu', next: 'root' }],
  },

  // ── Announcements ──
  announce: {
    message: 'What do you need help with for announcements?',
    options: [
      { label: 'How to post an announcement', next: 'ann_add'    },
      { label: 'How to edit/delete one',       next: 'ann_edit'  },
      { label: 'Pinning an announcement',      next: 'ann_pin'   },
      { label: '← Back',                       next: 'root'      },
    ],
  },
  ann_add: {
    message: 'To post an announcement:\n1. Go to Home tab\n2. In the Announcements section, click Add\n3. Write a title and body\n4. Choose type: Info or Warning\n5. Optionally pin it\n6. Click Post\n\nAll users (professors and students) see announcements in their notification panel.',
    options: [{ label: 'More about announcements', next: 'announce' }, { label: '← Main menu', next: 'root' }],
  },
  ann_edit: {
    message: 'To edit or delete an announcement:\n1. Go to Home tab\n2. Find the announcement in the list\n3. Click the edit icon (pencil) to update it, or the trash icon to delete\n\nDeletion is permanent and the announcement is removed from all notification panels.',
    options: [{ label: 'More about announcements', next: 'announce' }, { label: '← Main menu', next: 'root' }],
  },
  ann_pin: {
    message: 'To pin an announcement:\n1. When creating or editing, toggle the "Pinned" option\n2. Pinned announcements appear at the top of the list for all users\n\nOnly one announcement should be pinned at a time for clarity.',
    options: [{ label: 'More about announcements', next: 'announce' }, { label: '← Main menu', next: 'root' }],
  },

  // ── About ──
  about: {
    message: 'Consulta is the SOIT Academic Consultation System at Mapúa University.\n\nAs admin you can:\n• Manage all professor and student accounts\n• Configure the academic calendar and term\n• Monitor all consultations system-wide\n• Post announcements to all users\n• View reports and export data\n• Archive past terms',
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

function parseReply(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#4F6BED;font-weight:500;text-decoration:underline">$1</a>')
    .replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '<a href="$2" style="color:#4F6BED;font-weight:500;text-decoration:underline">$1</a>')
    .replace(/\n/g, '<br>');
}

type AiStructuredResponse = { message: string; action?: { label: string; route: string } };

function parseAiResponse(content: string): AiStructuredResponse {
  // Walk the string and extract the first balanced { } block that contains a "message" field
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const parsed = JSON.parse(content.slice(start, i + 1));
          if (parsed && typeof parsed.message === 'string') return parsed as AiStructuredResponse;
        } catch {}
        start = -1;
      }
    }
  }
  return { message: content };
}

// ── Widget ────────────────────────────────────────────────────────────────────
export default function ChatbotWidget({
  token,
  role = 'professor',
}: {
  token: string | null;
  role?: 'professor' | 'student' | 'admin';
}) {
  const tree = role === 'student' ? STUDENT_TREE : role === 'admin' ? ADMIN_TREE : PROF_TREE;

  const [open,        setOpen]    = useState(false);
  const [nodeId,      setNodeId]  = useState('root');
  const [loading,     setLoading] = useState(false);
  const [apiMessage,  setApiMsg]  = useState('');
  const [apiOptions,  setApiOpts] = useState<TreeOption[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);
  const [mobileTab, setMobileTab] = useState<'faq' | 'ai'>('faq');
  const [tourFocused, setTourFocused] = useState(false);

  // Reset to root on close
  useEffect(() => {
    if (open) return;
    setNodeId('root');
    setLoading(false);
    setApiMsg('');
    setApiOpts([]);
    setChatMessages([]);
    setChatInput('');
  }, [open]);

  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  async function sendChatMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    const next = [...chatMessages, { role: 'user' as const, content: trimmed }];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

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

    if (opt.next === 'restart_tour') {
      window.dispatchEvent(new CustomEvent('consulta-restart-tour'));
      setOpen(false);
      return;
    }

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

  useEffect(() => {
    setIsDark(localStorage.getItem('consulta-theme') === 'dark');
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consulta-theme-change', handler);
    return () => window.removeEventListener('consulta-theme-change', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTourFocused((e as CustomEvent<{ active: boolean }>).detail.active);
    window.addEventListener('consulta-tour-chatbot', handler);
    return () => window.removeEventListener('consulta-tour-chatbot', handler);
  }, []);

  const rootOptionCount = tree['root'].options.length;

  const panelBg      = isDark ? '#1e1f22' : '#ffffff';
  const panelBorder  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
  const headerBg     = isDark ? '#2b2d31' : '#f8f9fb';
  const headerBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const headerTitle  = isDark ? '#ffffff' : '#111827';
  const headerSub    = isDark ? '#9ca3af' : '#6b7280';
  const subtitleTxt  = isDark ? '#9ca3af' : '#6b7280';
  const answerBg     = isDark ? '#383a40' : '#eaecf0';
  const answerTxt    = isDark ? '#d1d5db' : '#374151';
  const topicBg      = isDark ? '#2b2d31' : '#f3f4f6';
  const topicHover   = isDark ? '#35373c' : '#e5e7eb';
  const topicTxt     = isDark ? '#dbdee1' : '#1f2937';
  const footerBg     = isDark ? '#2b2d31' : '#f8f9fb';
  const footerBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const footerTxt    = isDark ? '#6b7280' : '#9ca3af';
  const aiBubbleBg   = isDark ? '#2a2a3e' : '#ededf5';
  const aiTxt        = isDark ? '#c4c9d4' : '#374151';
  const inputBg      = isDark ? '#2b2d31' : '#f5f5f5';
  const inputTxt     = isDark ? '#dbdee1' : '#111827';
  const inputBorder  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <div className={`fixed bottom-5 right-3 sm:right-5 ${tourFocused ? 'z-[203]' : 'z-[55]'} flex flex-col items-end gap-3`}>

      {/* ── FAQ panel ── */}
      {open && (
        <div
          className="w-[calc(100vw-24px)] sm:w-[700px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(700px, calc(100vh - 80px))', backgroundColor: panelBg, border: `1px solid ${panelBorder}` }}
        >

          {/* ── Two-column header ── */}
          <div className="flex flex-shrink-0" style={{ borderBottom: `1px solid ${headerBorder}` }}>

            {/* Left header: FAQ (desktop only) */}
            <div
              className="hidden sm:flex items-center gap-3 px-4 py-3 w-[300px] flex-shrink-0"
              style={{ backgroundColor: headerBg, borderRight: `1px solid ${headerBorder}` }}
            >
              <div className="w-8 h-8 rounded-full bg-[#0EA5E9] flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: headerTitle }}>FAQ</p>
                <p className="text-[11px]" style={{ color: headerSub }}>Choose a topic</p>
              </div>
            </div>

            {/* Right header: Ask the AI + close (desktop only) */}
            <div
              className="hidden sm:flex items-center gap-3 px-4 py-3 flex-1"
              style={{ backgroundColor: headerBg }}
            >
              <div className="w-8 h-8 rounded-full bg-[#4F6BED] flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: headerTitle }}>Ask the AI</p>
                <p className="text-[11px]" style={{ color: headerSub }}>Ask me anything</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mobile header: active tab title + close */}
            <div
              className="flex sm:hidden items-center gap-3 px-4 py-3 flex-1"
              style={{ backgroundColor: headerBg }}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${mobileTab === 'faq' ? 'bg-[#0EA5E9]' : 'bg-[#4F6BED]'}`}>
                {mobileTab === 'faq' ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: headerTitle }}>
                  {mobileTab === 'faq' ? 'FAQ' : 'Ask the AI'}
                </p>
                <p className="text-[11px]" style={{ color: headerSub }}>
                  {mobileTab === 'faq' ? 'Choose a topic' : 'Ask me anything'}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile tab switcher */}
          <div
            className="flex sm:hidden flex-shrink-0"
            style={{ borderBottom: `1px solid ${headerBorder}`, backgroundColor: headerBg }}
          >
            {(['faq', 'ai'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className="flex-1 py-2 text-xs font-semibold transition-colors"
                style={{
                  color: mobileTab === tab ? '#4F6BED' : headerSub,
                  borderBottom: mobileTab === tab ? '2px solid #4F6BED' : '2px solid transparent',
                  backgroundColor: 'transparent',
                }}
              >
                {tab === 'faq' ? 'FAQ Topics' : 'Ask AI'}
              </button>
            ))}
          </div>

          {/* ── Two-column body ── */}
          <div className="flex flex-row flex-1" style={{ minHeight: 0 }}>

            {/* Left column: FAQ topics */}
            <div
              className={`flex-col flex-shrink-0 sm:w-[300px] w-full ${mobileTab === 'faq' ? 'flex' : 'hidden'} sm:flex`}
              style={{ minHeight: 0, borderRight: `1px solid ${headerBorder}` }}
            >
              {/* Scrollable topic area */}
              <div ref={bodyRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                {isRoot && (
                  <p className="px-4 pt-4 pb-2 text-xs" style={{ color: subtitleTxt }}>
                    Select a topic to get an instant answer.
                  </p>
                )}
                {!isRoot && (
                  <div className="px-4 pt-4 pb-3">
                    <div className="rounded-xl px-3 py-3 text-xs leading-relaxed"
                      style={{ backgroundColor: answerBg, color: answerTxt }}>
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
                {!loading && (
                  <div className="px-3 pb-3 pt-1 space-y-1.5">
                    {displayOpts.map(opt => (
                      <button
                        key={opt.next}
                        onClick={() => selectOption(opt)}
                        className="w-full text-left flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.98]"
                        style={{ backgroundColor: topicBg, color: topicTxt }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = topicHover; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = topicBg; }}
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

              {/* Left column footer */}
              <div
                className="px-4 py-2.5 flex items-center justify-between flex-shrink-0"
                style={{ backgroundColor: footerBg, borderTop: `1px solid ${footerBorder}` }}
              >
                <span className="text-[11px]" style={{ color: footerTxt }}>{rootOptionCount} topics available</span>
                {!isRoot ? (
                  <button
                    onClick={() => { setNodeId('root'); setApiMsg(''); setApiOpts([]); }}
                    className="text-[11px] text-[#CC0000] hover:underline transition-colors"
                  >
                    All topics
                  </button>
                ) : (
                  <span className="text-[11px]" style={{ color: footerTxt }}>All topics</span>
                )}
              </div>
            </div>

            {/* Right column: AI chat */}
            <div
              className={`flex-col flex-1 ${mobileTab === 'ai' ? 'flex' : 'hidden'} sm:flex`}
              style={{ minHeight: 0 }}
            >
              {/* Messages area */}
              <div
                ref={aiScrollRef}
                className="flex-1 overflow-y-auto px-3 py-3"
                style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                {chatMessages.length === 0 && !chatLoading && (
                  <p style={{ fontSize: 12, color: isDark ? '#555770' : '#9ca3af', textAlign: 'center', paddingTop: 24 }}>
                    Ask a question about ConsultSiya…
                  </p>
                )}
                {chatMessages.map((msg, i) => {
                  const isFirstInAiRun = msg.role === 'assistant' && (i === 0 || chatMessages[i - 1].role === 'user');
                  return (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      style={{ animation: 'chatbot-fadein 0.2s ease-out' }}
                    >
                      {isFirstInAiRun && (
                        <span
                          className="mb-1"
                          style={{ fontSize: 10, fontWeight: 600, color: '#fff', backgroundColor: '#4F6BED', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.05em' }}
                        >
                          AI
                        </span>
                      )}
                      {msg.role === 'user' ? (
                        <div
                          className="max-w-[85%] whitespace-pre-wrap"
                          style={{
                            fontSize: 13, lineHeight: 1.6, padding: '7px 11px',
                            color: '#ffffff', backgroundColor: '#4F6BED',
                            borderRadius: '12px 12px 3px 12px',
                          }}
                        >
                          {msg.content}
                        </div>
                      ) : (() => {
                        const parsed = parseAiResponse(msg.content);
                        return (
                          <>
                            <div
                              className="max-w-[85%]"
                              style={{
                                fontSize: 13, lineHeight: 1.6, padding: '7px 11px',
                                color: aiTxt, backgroundColor: aiBubbleBg,
                                borderRadius: '12px 12px 12px 3px',
                              }}
                              dangerouslySetInnerHTML={{ __html: parseReply(parsed.message) }}
                            />
                            {parsed.action && (
                              <button
                                onClick={() => {
                                  const route = parsed.action!.route;
                                  const url = new URL(route, window.location.origin);
                                  const tab = url.searchParams.get('view');
                                  if (url.pathname === window.location.pathname) {
                                    if (tab) {
                                      window.dispatchEvent(new CustomEvent('consulta-tab-change', { detail: tab }));
                                    } else {
                                      // Already on this page with no specific tab — just close
                                      setOpen(false);
                                    }
                                  } else {
                                    window.location.href = route;
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  cursor: 'pointer',
                                  border: 'none',
                                  marginTop: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  padding: '5px 12px',
                                  backgroundColor: '#4F6BED',
                                  color: '#fff',
                                  borderRadius: 9999,
                                  textDecoration: 'none',
                                }}
                              >
                                {parsed.action.label}
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                </svg>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
                {chatLoading && (
                  <div
                    className="flex flex-col items-start"
                    style={{ animation: 'chatbot-fadein 0.2s ease-out' }}
                  >
                    <div style={{ padding: '9px 13px', backgroundColor: aiBubbleBg, borderRadius: '12px 12px 12px 3px', display: 'flex', gap: 5, alignItems: 'center' }}>
                      {[0, 1, 2].map(d => (
                        <span
                          key={d}
                          style={{
                            width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4F6BED',
                            display: 'inline-block',
                            animation: 'chatbot-pulse 1.4s ease-in-out infinite',
                            animationDelay: `${d * 0.2}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Input area */}
              <div
                className="flex-shrink-0 flex items-center gap-2 px-3 pb-3 pt-2"
                style={{ borderTop: `1px solid ${footerBorder}` }}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
                  placeholder="Ask a question..."
                  disabled={chatLoading}
                  style={{
                    flex: 1,
                    height: 36,
                    fontSize: 13,
                    padding: '0 14px',
                    borderRadius: 9999,
                    backgroundColor: inputBg,
                    color: inputTxt,
                    border: `1px solid ${inputBorder}`,
                    outline: 'none',
                    opacity: chatLoading ? 0.5 : 1,
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#4F6BED')}
                  onBlur={e => (e.currentTarget.style.borderColor = inputBorder)}
                />
                <button
                  onClick={() => sendChatMessage(chatInput)}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: '#4F6BED',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                    border: 'none',
                    cursor: chatLoading || !chatInput.trim() ? 'default' : 'pointer',
                  }}
                  aria-label="Send"
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes chatbot-fadein {
              from { opacity: 0; transform: translateY(4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes chatbot-pulse {
              0%, 60%, 100% { transform: scale(1);   opacity: 0.5; }
              30%           { transform: scale(1.35); opacity: 1;   }
            }
          `}</style>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        data-tour="chatbot-fab"
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-[#0EA5E9] shadow-lg shadow-sky-900/40 flex items-center justify-center hover:bg-[#0284C7] hover:scale-105 active:scale-95 transition-all"
        aria-label="Open Consulta Assistant"
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <img src="/chatbot-icon.jpg" alt="Assistant" className="w-10 h-10 rounded-full object-cover" />
        )}
      </button>
    </div>
  );
}
