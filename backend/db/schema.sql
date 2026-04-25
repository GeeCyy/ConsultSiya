CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) CHECK (role IN ('student', 'professor', 'admin')) NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  student_number VARCHAR(50) UNIQUE NOT NULL,
  program VARCHAR(100),
  year_level INTEGER,
  phone VARCHAR(50),
  email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS professors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
  day VARCHAR(20) NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  location TEXT
);

CREATE TABLE IF NOT EXISTS consultations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  professor_id INTEGER REFERENCES professors(id) ON DELETE CASCADE,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  nature_of_advising TEXT,
  nature_of_advising_specify TEXT,
  mode VARCHAR(10) CHECK (mode IN ('F2F', 'OL')),
  uploaded_form_path VARCHAR(255),
  meeting_link TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultation_details (
  id SERIAL PRIMARY KEY,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
  action_taken TEXT,
  referral TEXT,
  referral_specify TEXT,
  remarks TEXT,
  completed_at TIMESTAMP DEFAULT NOW()
);
