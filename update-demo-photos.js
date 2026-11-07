
import Database from 'better-sqlite3';
import path from 'node:path';

const db = new Database(path.resolve('campusconnect.db'));

const newStudentPhoto = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQqv8hrBmjtQYQmxywmZtJAdsKE_r7oPtNI7noq2TlgiuccVUlLuFU1Yg&s=10';

const result = db.prepare(`
  UPDATE users
  SET profile_picture = ?
  WHERE email = ?
`).run(newStudentPhoto, 'student@campusconnect.demo');

console.log('Rows updated:', result.changes);

console.log(
  db.prepare(`
    SELECT email, profile_picture
    FROM users
    WHERE email = ?
  `).get('student@campusconnect.demo')
);

db.close();
