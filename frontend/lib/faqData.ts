// Decision-tree FAQ data for ConsultSiya.
// Each node is either a BRANCH (has children) or a LEAF (has answer).
// Add new entries here — no code changes needed in the component.

export type FaqAction = {
  label: string;
  // Internal route to navigate to, or null for informational-only
  route: string | null;
};

export type FaqNode = {
  id: string;
  // Label shown on the button / in breadcrumb
  label: string;
  // Set for leaf nodes — the answer displayed to the user
  answer?: string;
  // Optional action buttons shown below the answer
  actions?: FaqAction[];
  // Set for branch nodes — the list of child topics
  children?: FaqNode[];
};

// ── Root menu ─────────────────────────────────────────────────────────────────
export const FAQ_ROOT: FaqNode[] = [
  {
    id: 'booking',
    label: 'How do I book a consultation?',
    children: [
      {
        id: 'booking-steps',
        label: 'Step-by-step booking guide',
        answer:
          'To book a consultation:\n\n1. Open your Student Dashboard.\n2. Click "Book a Consultation".\n3. Browse available professor schedules and select one.\n4. Pick a date and a 30-minute time slot.\n5. Choose your mode: Face-to-Face (F2F) or Online (OL).\n6. Select the nature of your concern from the list.\n7. Submit your booking — it starts as Pending.\n8. The professor will confirm (or reschedule) your booking.',
        actions: [{ label: 'Go to Student Dashboard', route: '/dashboard/student' }],
      },
      {
        id: 'booking-modes',
        label: 'What is F2F vs Online mode?',
        answer:
          'Face-to-Face (F2F): You meet the professor in person at the location listed on their schedule (e.g., a specific room number).\n\nOnline (OL): The professor provides a meeting link (Google Meet, Zoom, etc.) after confirming your booking. Join at least 2 minutes before your scheduled time.',
      },
      {
        id: 'booking-cancel',
        label: 'How do I cancel a booking?',
        answer:
          'Open the consultation in your Student Dashboard under "My Consultations". Click the Cancel button on the booking you want to cancel.\n\nPlease only cancel if necessary — repeated no-shows may restrict future bookings.',
        actions: [{ label: 'Go to My Consultations', route: '/dashboard/student' }],
      },
      {
        id: 'booking-status',
        label: 'What do the booking statuses mean?',
        answer:
          'Pending — Your booking was submitted and is waiting for the professor to review.\n\nConfirmed — The professor approved your booking. For Online sessions, a meeting link will be provided.\n\nCompleted — The consultation was held and the professor logged the outcome.\n\nCancelled — The booking was cancelled by you or the professor.\n\nRescheduled — The professor indicated the session needs a new time. Please rebook.',
      },
    ],
  },
  {
    id: 'professors',
    label: 'Who handles my concern?',
    children: [
      {
        id: 'concern-thesis',
        label: 'Thesis / Design Subject concerns',
        answer:
          'For Thesis and Design Subject concerns, consult any professor in your program department who lists thesis advising as a specialty.\n\nBrowse professor schedules on your dashboard to find available slots.',
        actions: [{ label: 'Browse Professor Schedules', route: '/dashboard/student' }],
      },
      {
        id: 'concern-subjects',
        label: 'Mentoring / Subject clarification',
        answer:
          'For clarification on topics or subjects you are enrolled in, consult the professor who teaches the subject, or browse available advising slots on your dashboard.',
        actions: [{ label: 'Browse Professor Schedules', route: '/dashboard/student' }],
      },
      {
        id: 'concern-requirements',
        label: 'Course requirements / grades',
        answer:
          'For concerns about course requirements or grades, contact the professor teaching the course directly, or book an advising session through the system.',
        actions: [{ label: 'Book a Consultation', route: '/dashboard/student' }],
      },
      {
        id: 'concern-electives',
        label: 'Electives / Curriculum tracks',
        answer:
          'For questions about electives and curriculum tracks, consult your program adviser. Browse their schedule on your dashboard and book an appointment.',
        actions: [{ label: 'Browse Professor Schedules', route: '/dashboard/student' }],
      },
      {
        id: 'concern-ojt',
        label: 'Internship / OJT matters',
        answer:
          'For OJT/Internship concerns, consult your OJT coordinator or program adviser. Book an advising session through the system.',
        actions: [{ label: 'Book a Consultation', route: '/dashboard/student' }],
      },
      {
        id: 'concern-placement',
        label: 'Job placement / Employment',
        answer:
          'For job placement and employment concerns, visit the Center for Career Services or consult an adviser through ConsultSiya.',
        actions: [{ label: 'Book a Consultation', route: '/dashboard/student' }],
      },
      {
        id: 'concern-personal',
        label: 'Personal / Family concerns',
        answer:
          'For personal or family concerns, you may be referred to the Center for Guidance and Counseling.\n\nYou can still start by booking a consultation with a professor — they can provide a referral if needed.',
        actions: [{ label: 'Book a Consultation', route: '/dashboard/student' }],
      },
    ],
  },
  {
    id: 'files',
    label: 'Advising slip & file upload',
    children: [
      {
        id: 'files-download',
        label: 'Where do I get the advising slip?',
        answer:
          'You can download the blank advising slip template from your Student Dashboard.\n\nGo to any consultation → click "Download Blank Slip". Print it, have it signed by the professor during your session, then upload the signed copy.',
        actions: [{ label: 'Go to My Consultations', route: '/dashboard/student' }],
      },
      {
        id: 'files-upload',
        label: 'How do I upload my signed form?',
        answer:
          'After your consultation:\n\n1. Open the consultation in "My Consultations".\n2. Click the upload icon next to the consultation.\n3. Select your signed form file (PDF, JPG, or PNG — max 10 MB).\n4. Submit.\n\nUpload within 48 hours of your session.',
        actions: [{ label: 'Go to My Consultations', route: '/dashboard/student' }],
      },
      {
        id: 'files-types',
        label: 'What file types are accepted?',
        answer:
          'Accepted formats: PDF, JPG, JPEG, PNG.\nMaximum file size: 10 MB.\n\nMake sure the document is clearly legible and all required fields are filled and signed.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & login help',
    children: [
      {
        id: 'account-pending',
        label: 'My account says "Pending Approval"',
        answer:
          'After registering, your account must be approved by a system administrator before you can log in.\n\nThis is a manual process — there is no email notification. Check back after 1 business day. If approval is taking too long, contact the SOIT admin office.',
      },
      {
        id: 'account-locked',
        label: 'My account is locked',
        answer:
          'Accounts are locked for 15 minutes after 5 consecutive incorrect password attempts.\n\nWait for the lockout to expire and try again with the correct credentials.\n\nIf the problem persists, contact your system administrator to manually reset the lockout.',
      },
      {
        id: 'account-password',
        label: 'I forgot my password',
        answer:
          'Password self-reset is not available yet. Contact your system administrator or the SOIT admin office to have your password reset.\n\nIf your account was created by an admin, the default password is: Welcome@123 — change it immediately after logging in.',
      },
      {
        id: 'account-profile',
        label: 'How do I update my profile?',
        answer:
          'Go to your Dashboard → Profile tab. You can update:\n• Full name\n• Contact number / email\n• Program and year level (students)\n• Department (professors)\n\nClick Save when done.',
        actions: [
          { label: 'Student Profile', route: '/dashboard/student' },
          { label: 'Professor Profile', route: '/dashboard/professor' },
        ],
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Professor schedules (for professors)',
    children: [
      {
        id: 'schedule-create',
        label: 'How do I add a schedule slot?',
        answer:
          'Go to your Professor Dashboard → Manage Schedules.\n\n1. Click "Add Schedule".\n2. Select a specific date.\n3. Add one or more time ranges.\n4. Set a location (room number or "Online").\n5. Confirm the slot.\n\nStudents can now see and book this slot.',
        actions: [{ label: 'Go to Manage Schedules', route: '/dashboard/professor' }],
      },
      {
        id: 'schedule-delete',
        label: 'How do I remove a schedule slot?',
        answer:
          'Go to Professor Dashboard → Manage Schedules. Find the slot you want to remove and click the Delete (trash) icon.\n\nNote: You cannot delete a slot that has confirmed bookings.',
        actions: [{ label: 'Go to Manage Schedules', route: '/dashboard/professor' }],
      },
      {
        id: 'schedule-confirm',
        label: 'How do I confirm a student booking?',
        answer:
          'Go to Professor Dashboard → My Consultations. Find the Pending booking and click "Confirm".\n\nFor Online (OL) sessions, you will be prompted to enter a meeting link before confirming.',
        actions: [{ label: 'Go to My Consultations', route: '/dashboard/professor' }],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & exports',
    children: [
      {
        id: 'reports-download',
        label: 'How do I export a consultation report?',
        answer:
          'Go to Professor Dashboard → Export Report.\n\nChoose a period (Weekly, Semester, or Full Year) and download as:\n• Excel (.xlsx) — for data analysis\n• PDF — for submission or printing',
        actions: [{ label: 'Go to Export Report', route: '/dashboard/professor' }],
      },
      {
        id: 'reports-prefilled',
        label: 'How do I get a pre-filled advising slip?',
        answer:
          'In Professor Dashboard → My Consultations, open a completed consultation. Click "Download Advising Slip" to get a PDF pre-filled with the student\'s details, nature of advising, and consultation date.',
        actions: [{ label: 'Go to My Consultations', route: '/dashboard/professor' }],
      },
    ],
  },
  {
    id: 'home-help',
    label: 'Home page & system info',
    children: [
      {
        id: 'home-week',
        label: 'What is the Week indicator?',
        answer:
          'The Week badge (shown in the top-right corner) displays the current academic week and whether classes are In-Person or Online.\n\nIt updates automatically based on the configured academic calendar.',
      },
      {
        id: 'home-calendar',
        label: 'How does the academic calendar work?',
        answer:
          'The Home page shows an interactive calendar for the current semester. It highlights:\n• Today\n• Exam weeks (midterm and finals)\n• Online class weeks\n• Philippine public holidays\n\nClick a date to see details.',
        actions: [{ label: 'Go to Home Page', route: '/dashboard/home' }],
      },
      {
        id: 'home-help-center',
        label: 'Where is the Help Center?',
        answer:
          'The Help Center is accessible from the sidebar of any dashboard page — look for "Help Center" at the bottom of the navigation menu.',
        actions: [{ label: 'Open Help Center', route: '/dashboard/help' }],
      },
    ],
  },
  {
    id: 'contact',
    label: 'Contact & support',
    answer:
      'For account issues, system bugs, or urgent concerns:\n\n• Visit the SOIT admin office\n• Contact your department secretary\n• Ask your professor to escalate to the system administrator\n\nFor general usage questions, browse the Help Center or use this FAQ.',
    actions: [{ label: 'Open Help Center', route: '/dashboard/help' }],
  },
];
