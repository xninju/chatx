import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import pool from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, methods: ["GET", "POST"] }
});

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

// --- User Registration ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      'INSERT INTO users(username, password) VALUES($1, $2) RETURNING id, username',
      [username, hash]
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error('Registration error:', e); // <-- Add this line
    res.status(400).json({ error: 'Username already exists' });
  }
});

// --- User Login ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const userQuery = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const user = userQuery.rows[0];
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(400).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
  res.json({ token });
});

// --- Auth Middleware ---
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// --- Get Messages (protected) ---
app.get('/api/messages', auth, async (req, res) => {
  const messages = await pool.query(
    'SELECT messages.id, messages.text, messages.created_at, users.username FROM messages JOIN users ON messages.user_id = users.id ORDER BY messages.created_at ASC'
  );
  res.json(messages.rows);
});

// --- Socket.IO for Chat ---
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    const user = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.on('message', async (text) => {
    const { id: user_id } = socket.user;
    const result = await pool.query(
      'INSERT INTO messages(user_id, text) VALUES($1, $2) RETURNING id, text, created_at',
      [user_id, text]
    );
    const message = {
      id: result.rows[0].id,
      text: result.rows[0].text,
      created_at: result.rows[0].created_at,
      username: socket.user.username,
    };
    io.emit('message', message);
  });
});

// --- Serve Frontend (Static) ---
// If deploying both frontend and backend from same repo, and your frontend build is in frontend/dist
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendPath));

// For any route not handled by your backend, serve index.html (for React Router support)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- Start ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Backend running on ${PORT}`));
