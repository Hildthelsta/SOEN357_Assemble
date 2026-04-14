const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// Connect DB on startup
db.connect();

// Test route
app.get('/', (req, res) => {
  res.send('API is running');
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});

// Create user
app.post('/users', async (req, res) => {
  try {
    const user = await db.users.create(req.body);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user
app.get('/users/:id', async (req, res) => {
  const user = await db.users.getById(req.params.id);
  res.json(user);
});

// Create event
app.post('/events', async (req, res) => {
  try {
    const event = await db.events.create(req.body);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List events
app.get('/events', async (req, res) => {
  const events = await db.events.list(req.query);
  res.json(events);
});

// Send direct message
app.post('/messages', async (req, res) => {
  const msg = await db.directMessages.send(req.body);
  res.json(msg);
});

// Get conversation
app.get('/messages/:userA/:userB', async (req, res) => {
  const { userA, userB } = req.params;
  const messages = await db.directMessages.getConversation(userA, userB);
  res.json(messages);
});

// Get events for a user
app.get('/users/:id/events', async (req, res) => {
  try {
    const events = await db.events.getForUser(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get discovery events for a user
app.get('/users/:id/discover-events', async (req, res) => {
  try {
    const events = await db.events.getNotForUser(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await db.users.getByCredential(email);

  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  if (user.password_hash !== password) {
    return res.status(401).json({ error: "Wrong password" });
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  });
});

//Adds event to a user's bookmarked events
app.post('/events/:id/join', async (req, res) => {
  try {
    const eventId = req.params.id;
    const { user_id } = req.body;

    await db.events.addParticipant(eventId, user_id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//Removes event from a user's bookmarked events
app.post('/events/:id/leave', async (req, res) => {
  const { user_id } = req.body;
  const eventId = req.params.id;

  await db.events.removeParticipant(eventId, user_id);

  res.json({ success: true });
});

//deletes an event(admin function)
app.delete('/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const { user_id } = req.body;

    const user = await db.users.getById(user_id);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can delete events" });
    }

    await db.events.delete(eventId);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
