/**
 * db.js — Activist App · MySQL Database Layer
 *
 * Entities:
 *   users 
 *   events
 *   user_reports
 *   event_messages
 *   direct_message
 *
 * Dependencies:  npm install mysql2 dotenv
 * Environment variables (or .env file):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */

'use strict';

require('dotenv').config();;
const mysql = require('mysql2/promise');

// ─── Connection Pool ──────────────────────────────────────────────────────────

let pool;

/**
 * Create (or reuse) the connection pool and ensure all tables exist.
 * Call once at application startup.
 */
async function connect() {
  if (pool) return pool;

  const dbName = process.env.DB_NAME || 'activist_app';

  // Step 1: Connect WITHOUT a database to create it if needed
  const tempConn = await mysql.createConnection({
    host:     process.env.DB_HOST   || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'password',
  });

  await tempConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await tempConn.end();

  // Step 2: Now create the pool pointed at the (guaranteed) database
  pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: dbName,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           'Z',
  });

  await _initSchema();
  console.log('[db] Connected and schema ready.');
  return pool;
}

/** Release all connections — call on graceful shutdown. */
async function disconnect() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[db] Pool closed.');
  }
}

/** Execute a parameterised query against the pool. */
async function query(sql, params = []) {
  if (!pool) throw new Error('Call db.connect() before running queries.');
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Schema Bootstrap

async function _initSchema() {
  const statements = [
    // users
    `CREATE TABLE IF NOT EXISTS users (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(60)  NOT NULL UNIQUE,
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name  VARCHAR(120),
      bio           TEXT,
      role          ENUM('member','admin') NOT NULL DEFAULT 'member',
      is_verified     TINYINT(1)   NOT NULL DEFAULT 0,
      is_active     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // events
    `CREATE TABLE IF NOT EXISTS events (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      creator_id    INT UNSIGNED NOT NULL,
      title         VARCHAR(255) NOT NULL,
      description   TEXT,
      location      VARCHAR(512),
      starts_at     DATETIME,
      ends_at       DATETIME,
      status        ENUM('draft','published','cancelled','completed')
                    NOT NULL DEFAULT 'draft',
      created_at    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_event_creator FOREIGN KEY (creator_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // event_participants (many-to-many)
    `CREATE TABLE IF NOT EXISTS event_participants (
      event_id   INT UNSIGNED NOT NULL,
      user_id    INT UNSIGNED NOT NULL,
      role       ENUM('attendee','organiser') NOT NULL DEFAULT 'attendee',
      joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, user_id),
      CONSTRAINT fk_ep_event FOREIGN KEY (event_id)
        REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_ep_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // user_reports
    `CREATE TABLE IF NOT EXISTS user_reports (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      reporter_id  INT UNSIGNED NOT NULL,              -- user filing the report
      reported_id  INT UNSIGNED NOT NULL,              -- user being reported
      event_id     INT UNSIGNED,                       -- optional: incident happened in this event
      reason       ENUM('harassment','hate_speech','spam','misinformation',
                        'impersonation','threats','other')
                   NOT NULL DEFAULT 'other',
      description  TEXT,
      status       ENUM('pending','under_review','resolved','dismissed')
                   NOT NULL DEFAULT 'pending',
      reviewed_by  INT UNSIGNED,                       -- admin who handled the report
      reviewed_at  DATETIME,
      resolution   TEXT,                               -- admin's resolution note
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_rep_reported FOREIGN KEY (reported_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_rep_event FOREIGN KEY (event_id)
        REFERENCES events(id) ON DELETE SET NULL,
      CONSTRAINT fk_rep_reviewer FOREIGN KEY (reviewed_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // event_messages (group chat)
    `CREATE TABLE IF NOT EXISTS event_messages (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id   INT UNSIGNED NOT NULL,
      sender_id  INT UNSIGNED NOT NULL,
      body       TEXT         NOT NULL,
      sent_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted TINYINT(1)   NOT NULL DEFAULT 0,
      CONSTRAINT fk_em_event  FOREIGN KEY (event_id)
        REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_em_sender FOREIGN KEY (sender_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // direct_messages
    `CREATE TABLE IF NOT EXISTS direct_messages (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sender_id   INT UNSIGNED NOT NULL,
      receiver_id INT UNSIGNED NOT NULL,
      body        TEXT         NOT NULL,
      sent_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted  TINYINT(1)   NOT NULL DEFAULT 0,
      CONSTRAINT fk_dm_sender   FOREIGN KEY (sender_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_dm_receiver FOREIGN KEY (receiver_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const sql of statements) {
    await pool.execute(sql);
  }
}

// Helper

/** Build a SET clause from a plain object, returning { clause, values }. */
function _buildSet(fields) {
  const keys   = Object.keys(fields);
  const clause = keys.map(k => `\`${k}\` = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  return { clause, values };
}

// ═════════════════════════════════════════════════════════════════════════════
// USERS
// ═════════════════════════════════════════════════════════════════════════════

const users = {
  /**
   * Create a new user.
   * @param {{ username, email, password_hash, display_name?, bio?, role? }} data
   */
  async create(data) {
    const { username, email, password_hash, display_name = null,
            bio = null, role = 'member' } = data;

    const result = await query(
      `INSERT INTO users (username, email, password_hash, display_name, bio, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, password_hash, display_name, bio,  role]
    );
    return users.getById(result.insertId);
  },

  /** Retrieve a user by primary key. */
  async getById(id) {
    const rows = await query(
      `SELECT id, username, email, display_name, bio, role, is_active, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /** Retrieve a user by username or email. */
  async getByCredential(usernameOrEmail) {
    const rows = await query(
      `SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [usernameOrEmail, usernameOrEmail]
    );
    return rows[0] || null;
  },

  /** List all users (with optional pagination). */
  async list({ limit = 50, offset = 0, role = null } = {}) {
    const params = [];
    let sql = `SELECT id, username, email, display_name, role, is_active, is_verified, created_at
               FROM users WHERE 1=1`;
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return query(sql, params);
  },

  /**
   * Update a user's profile fields.
   * @param {number} id
   * @param {{ display_name?, bio?, role?, is_active?, password_hash? }} fields
   */
  async update(id, fields) {
    const allowed = ['display_name', 'bio', 'role', 'is_active', 'password_hash'];
    const safe    = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(safe).length) throw new Error('No valid fields to update.');
    const { clause, values } = _buildSet(safe);
    await query(`UPDATE users SET ${clause} WHERE id = ?`, [...values, id]);
    return users.getById(id);
  },

  /** Soft-delete (deactivate) a user. */
  async deactivate(id) {
    await query(`UPDATE users SET is_active = 0 WHERE id = ?`, [id]);
    return users.getById(id);
  },

    /** Mark user as verified (deactivate) a user. */
  async verify(id) {
    await query(`UPDATE users SET is_verified = 1 WHERE id = ?`, [id]);
    return users.getById(id);
  },

  /** Hard-delete a user (cascades to all related data). */
  async delete(id) {
    await query(`DELETE FROM users WHERE id = ?`, [id]);
    return { deleted: true, id };
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═════════════════════════════════════════════════════════════════════════════

const events = {
  /**
   * Create a new event.
   * @param {{ creator_id, title, description?, location?,
   *           starts_at?, ends_at?, status?}} data
   */
  async create(data) {
    const {
      creator_id, title,
      description = null, location = null,
      starts_at = null, ends_at = null,
      status = 'draft',
    } = data;

    const result = await query(
      `INSERT INTO events
         (creator_id, title, description, location, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [creator_id, title, description, location,  starts_at, ends_at, status]
    );
    // Auto-enrol creator as organiser
    await events.addParticipant(result.insertId, creator_id, 'organiser');
    return events.getById(result.insertId);
  },

  /** Retrieve a single event by id. */
  async getById(id) {
    const rows = await query(
      `SELECT e.*, u.username AS creator_username
       FROM events e
       JOIN users u ON u.id = e.creator_id
       WHERE e.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /** List events (filter by status, creator or location keywords). */
  async list({ limit = 50, offset = 0, status = null, creator_id = null, search = null } = {}) {
    const params = [];
    let sql = `SELECT e.*, u.username AS creator_username
               FROM events e
               JOIN users u ON u.id = e.creator_id
               WHERE 1=1`;
    if (status)     { sql += ' AND e.status = ?';          params.push(status); }
    if (creator_id) { sql += ' AND e.creator_id = ?';      params.push(creator_id); }
    if (search)     { sql += ' AND (e.title LIKE ? OR e.description LIKE ?)';
                      params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY e.starts_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return query(sql, params);
  },

  /**
   * Update event fields.
   * @param {number} id
   * @param {{ title?, description?, location?, 
   *           starts_at?, ends_at?, status?}} fields
   */
  async update(id, fields) {
    const allowed = ['title','description','location',
                     'starts_at','ends_at','status'];
    const safe    = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(safe).length) throw new Error('No valid fields to update.');
    const { clause, values } = _buildSet(safe);
    await query(`UPDATE events SET ${clause} WHERE id = ?`, [...values, id]);
    return events.getById(id);
  },

  /** Delete an event (cascades to messages, participants, signals). */
  async delete(id) {
    await query(`DELETE FROM events WHERE id = ?`, [id]);
    return { deleted: true, id };
  },

  // ── Participants ──────────────────────────────────────────────────────────

  async addParticipant(eventId, userId, role = 'attendee') {
    await query(
      `INSERT IGNORE INTO event_participants (event_id, user_id, role) VALUES (?, ?, ?)`,
      [eventId, userId, role]
    );
    return { eventId, userId, role };
  },

  async removeParticipant(eventId, userId) {
    await query(
      `DELETE FROM event_participants WHERE event_id = ? AND user_id = ?`,
      [eventId, userId]
    );
    return { removed: true, eventId, userId };
  },

  async listParticipants(eventId) {
    return query(
      `SELECT u.id, u.username, u.display_name, ep.role, ep.joined_at
       FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
       WHERE ep.event_id = ?
       ORDER BY ep.joined_at ASC`,
      [eventId]
    );
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// USER REPORTS
// ═════════════════════════════════════════════════════════════════════════════

const reports = {
  /**
   * File a report against a user.
   * @param {{ reporter_id, reported_id, reason?, description?, event_id? }} data
   */
  async create(data) {
    const {
      reporter_id, reported_id,
      reason = 'other', description = null,
      event_id = null,
    } = data;

    if (reporter_id === reported_id) {
      throw new Error('A user cannot report themselves.');
    }

    const result = await query(
      `INSERT INTO user_reports
         (reporter_id, reported_id, event_id, reason, description)
       VALUES (?, ?, ?, ?, ?)`,
      [reporter_id, reported_id, event_id, reason, description]
    );
    return reports.getById(result.insertId);
  },

  async getById(id) {
    const rows = await query(
      `SELECT r.*,
              u1.username AS reporter_username,
              u2.username AS reported_username,
              u3.username AS reviewer_username
       FROM user_reports r
       JOIN users u1 ON u1.id = r.reporter_id
       JOIN users u2 ON u2.id = r.reported_id
       LEFT JOIN users u3 ON u3.id = r.reviewed_by
       WHERE r.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * List reports — filterable by status, reported user, reporter, or event.
   */
  async list({ reporter_id = null, reported_id = null, event_id = null,
               status = null, reason = null, limit = 50, offset = 0 } = {}) {
    const params = [];
    let sql = `SELECT r.*,
                      u1.username AS reporter_username,
                      u2.username AS reported_username
               FROM user_reports r
               JOIN users u1 ON u1.id = r.reporter_id
               JOIN users u2 ON u2.id = r.reported_id
               WHERE 1=1`;
    if (reporter_id != null) { sql += ' AND r.reporter_id = ?'; params.push(reporter_id); }
    if (reported_id != null) { sql += ' AND r.reported_id = ?'; params.push(reported_id); }
    if (event_id    != null) { sql += ' AND r.event_id = ?';    params.push(event_id); }
    if (status)              { sql += ' AND r.status = ?';      params.push(status); }
    if (reason)              { sql += ' AND r.reason = ?';      params.push(reason); }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return query(sql, params);
  },

  /**
   * Update a report's description or reason before it is reviewed.
   * @param {number} id
   * @param {{ reason?, description?, }} fields
   */
  async update(id, fields) {
    const allowed = ['reason', 'description'];
    const safe    = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(safe).length) throw new Error('No valid fields to update.');
    const { clause, values } = _buildSet(safe);
    await query(`UPDATE user_reports SET ${clause} WHERE id = ?`, [...values, id]);
    return reports.getById(id);
  },

  /**
   * Admin: update the review status and leave a resolution note.
   * @param {number} id  — report id
   * @param {number} reviewerId  — admin user id
   * @param {'under_review'|'resolved'|'dismissed'} status
   * @param {string} [resolution]  — optional admin note
   */
  async review(id, reviewerId, status, resolution = null) {
    const validStatuses = ['under_review', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    await query(
      `UPDATE user_reports
       SET status = ?, reviewed_by = ?, reviewed_at = NOW(), resolution = ?
       WHERE id = ?`,
      [status, reviewerId, resolution, id]
    );
    return reports.getById(id);
  },

  /** Delete a report (e.g. filed in error). */
  async delete(id) {
    await query(`DELETE FROM user_reports WHERE id = ?`, [id]);
    return { deleted: true, id };
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// EVENT CHAT (group messages inside an event)
// ═════════════════════════════════════════════════════════════════════════════

const eventChat = {
  /**
   * Send a message to an event's chat.
   * @param {{ event_id, sender_id, body }} data
   */
  async send(data) {
    const { event_id, sender_id, body } = data;
    const result = await query(
      `INSERT INTO event_messages (event_id, sender_id, body) VALUES (?, ?, ?)`,
      [event_id, sender_id, body]
    );
    return eventChat.getById(result.insertId);
  },

  async getById(id) {
    const rows = await query(
      `SELECT m.*, u.username AS sender_username
       FROM event_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /** Retrieve all (non-deleted) messages for an event, oldest first. */
  async list(eventId, { limit = 100, offset = 0 } = {}) {
    return query(
      `SELECT m.*, u.username AS sender_username
       FROM event_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.event_id = ? AND m.is_deleted = 0
       ORDER BY m.sent_at ASC
       LIMIT ? OFFSET ?`,
      [eventId, limit, offset]
    );
  },

  /** Soft-delete a message. */
  async delete(id) {
    await query(
      `UPDATE event_messages SET is_deleted = 1, body = '[message deleted]' WHERE id = ?`,
      [id]
    );
    return { deleted: true, id };
  },

  /** Hard-delete (admin only). */
  async hardDelete(id) {
    await query(`DELETE FROM event_messages WHERE id = ?`, [id]);
    return { deleted: true, id };
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// DIRECT MESSAGES (private 1-to-1 chat)
// ═════════════════════════════════════════════════════════════════════════════

const directMessages = {
  /**
   * Send a direct message.
   * @param {{ sender_id, receiver_id, body }} data
   */
  async send(data) {
    const { sender_id, receiver_id, body } = data;
    const result = await query(
      `INSERT INTO direct_messages (sender_id, receiver_id, body) VALUES (?, ?, ?)`,
      [sender_id, receiver_id, body]
    );
    return directMessages.getById(result.insertId);
  },

  async getById(id) {
    const rows = await query(
      `SELECT m.*,
              s.username AS sender_username,
              r.username AS receiver_username
       FROM direct_messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       WHERE m.id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Get the full conversation between two users.
   * Marks unread messages as read for the requesting user.
   */
  async getConversation(userA, userB, { limit = 100, offset = 0 } = {}) {
    // Mark messages sent TO userA as read
    await query(
      `UPDATE direct_messages
       WHERE sender_id = ? AND receiver_id = ? AND is_deleted = 0`,
      [userB, userA]
    );

    return query(
      `SELECT m.*,
              s.username AS sender_username,
              r.username AS receiver_username
       FROM direct_messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       WHERE ((m.sender_id = ? AND m.receiver_id = ?)
           OR (m.sender_id = ? AND m.receiver_id = ?))
         AND m.is_deleted = 0
       ORDER BY m.sent_at ASC
       LIMIT ? OFFSET ?`,
      [userA, userB, userB, userA, limit, offset]
    );
  },

  /** List all conversation partners for a user (most recent first). */
  async listConversations(userId) {
    return query(
      `SELECT
         partner_id,
         u.username  AS partner_username,
         last_body,
         last_sent_at,
         unread_count
       FROM (
         SELECT
           IF(m.sender_id = ?, m.receiver_id, m.sender_id) AS partner_id,
           SUBSTRING_INDEX(GROUP_CONCAT(m.body ORDER BY m.sent_at DESC), ',', 1) AS last_body,
           MAX(m.sent_at) AS last_sent_at,
           SUM(m.sender_id != ? AND m.is_deleted = 0) AS unread_count
         FROM direct_messages m
         WHERE (m.sender_id = ? OR m.receiver_id = ?) AND m.is_deleted = 0
         GROUP BY partner_id
       ) conv
       JOIN users u ON u.id = conv.partner_id
       ORDER BY conv.last_sent_at DESC`,
      [userId, userId, userId, userId]
    );
  },

  /** Soft-delete. */
  async delete(id) {
    await query(
      `UPDATE direct_messages SET is_deleted = 1, body = '[message deleted]' WHERE id = ?`,
      [id]
    );
    return { deleted: true, id };
  },

  /** Hard-delete (admin only). */
  async hardDelete(id) {
    await query(`DELETE FROM direct_messages WHERE id = ?`, [id]);
    return { deleted: true, id };
  },
};

// API

module.exports = {
  connect,
  disconnect,
  query,           // escape hatch for raw queries
  users,
  events,
  reports,
  eventChat,
  directMessages,
};