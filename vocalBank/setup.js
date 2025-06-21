import { pool } from "./db.js";

// Save call info when initiated
export async function saveCall({ number, name, prompt, first_message, call_sid, status = "initiated" }) {
  await pool.query(
    `INSERT INTO calls (number, name, prompt, first_message, call_sid, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    [number, name, prompt, first_message, call_sid, status]
  );
}

// Update call status and store dynamic variables (e.g. after webhook)
export async function updateCallStatus(call_sid, status, dynamic_variables = null) {
  await pool.query(
    `UPDATE calls SET status = $1, dynamic_variables = $2, created_at = CURRENT_TIMESTAMP WHERE call_sid = $3`,
    [status, dynamic_variables ? JSON.stringify(dynamic_variables) : null, call_sid]
  );
}

// Save or update conversation topics for a number
export async function saveConversation(number, topics, call_sid) {
  const { rows } = await pool.query(`SELECT id FROM conversations WHERE number = $1`, [number]);
  if (rows.length > 0) {
    await pool.query(
      `UPDATE conversations SET topics = $1, last_call_sid = $2, updated_at = CURRENT_TIMESTAMP WHERE number = $3`,
      [topics, call_sid, number]
    );
  } else {
    await pool.query(
      `INSERT INTO conversations (number, topics, last_call_sid) VALUES ($1, $2, $3)`,
      [number, topics, call_sid]
    );
  }
}

// Retrieve previous topics for a number
export async function getPreviousTopics(number) {
  const { rows } = await pool.query(`SELECT topics FROM conversations WHERE number = $1`, [number]);
  return rows.length > 0 ? rows[0].topics : null;
}