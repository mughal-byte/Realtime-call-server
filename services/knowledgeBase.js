import mysql from 'mysql2/promise'; 
 
const db = await mysql.createConnection({ 
  host: 'localhost', 
  user: 'root', 
  password: '', 
  database: 'ai_db', 
}); 
 
export async function fetchContextForCall(callId) { 
  const [rows] = await db.query('SELECT knowledge_text FROM kb WHERE call_id = ?', [callId]); 
  return rows.map(r => r.knowledge_text).join('\n'); 
} 
 
 