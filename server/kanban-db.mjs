/**
 * Kanban Database — Persistência SQLite local
 * 
 * Substitui kanban-data.json por um banco SQLite robusto.
 * Migra dados existentes do JSON na primeira inicialização.
 * 
 * Tabelas:
 *   - boards: boards do kanban
 *   - board_columns: colunas de cada board  
 *   - cards: cards com todos os campos
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'kanban.db');
const LEGACY_JSON = join(__dirname, 'kanban-data.json');

// ─── Schema ──────────────────────────────────────────────────

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      team_id TEXT PRIMARY KEY,
      workdir TEXT NOT NULL,
      kanban_file TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS board_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL,
      col_id TEXT NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (team_id) REFERENCES boards(team_id),
      UNIQUE(team_id, col_id)
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      col TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER DEFAULT 3,
      assignees TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT,
      team_id TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES boards(team_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cards_col ON cards(col);
    CREATE INDEX IF NOT EXISTS idx_cards_team ON cards(team_id);
  `);
}

// ─── Migration from JSON ─────────────────────────────────────

function migrateFromJson(db) {
  // Checa se já tem dados
  const count = db.prepare('SELECT COUNT(*) as n FROM boards').get();
  if (count.n > 0) return; // Já migrado

  if (!existsSync(LEGACY_JSON)) return; // Sem dados para migrar

  let data;
  try {
    data = JSON.parse(readFileSync(LEGACY_JSON, 'utf-8'));
  } catch {
    return;
  }

  const insertBoard = db.prepare(
    'INSERT OR IGNORE INTO boards (team_id, workdir, kanban_file) VALUES (?, ?, ?)'
  );
  const insertColumn = db.prepare(
    'INSERT OR IGNORE INTO board_columns (team_id, col_id, title, position) VALUES (?, ?, ?, ?)'
  );
  const insertCard = db.prepare(
    `INSERT OR IGNORE INTO cards (id, title, description, col, priority, assignees, skills, notes, created_at, completed_at, team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const migrate = db.transaction(() => {
    for (const board of data.boards || []) {
      insertBoard.run(board.team_id, board.workdir, board.kanban_file);
      (board.columns || []).forEach((col, idx) => {
        insertColumn.run(board.team_id, col.id, col.title, idx);
      });
    }

    for (const card of data.cards || []) {
      insertCard.run(
        card.id,
        card.title,
        card.description || '',
        card.column || 'backlog',
        card.priority || 3,
        JSON.stringify(card.assignees || []),
        JSON.stringify(card.skills || []),
        card.notes || '',
        card.created_at || new Date().toISOString(),
        card.completed_at || null,
        card._team_id || 'c22f69a564d6'
      );
    }
  });

  migrate();
  console.log(`  ✅ Migrados ${data.cards?.length || 0} cards do JSON para SQLite`);
}

// ─── Database Instance ───────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

createSchema(db);
migrateFromJson(db);

// ─── Prepared Statements ─────────────────────────────────────

// ─── Limite de cards na coluna "done" ────────────────────────
const DONE_COLUMN_LIMIT = 10;

const stmts = {
  getBoards: db.prepare('SELECT * FROM boards'),
  getColumns: db.prepare('SELECT col_id, title FROM board_columns WHERE team_id = ? ORDER BY position'),
  
  getAllCards: db.prepare('SELECT * FROM cards'),
  getCardsByTeam: db.prepare('SELECT * FROM cards WHERE team_id = ?'),
  getCardsByCol: db.prepare('SELECT * FROM cards WHERE col = ?'),
  getCardsByTeamAndCol: db.prepare('SELECT * FROM cards WHERE team_id = ? AND col = ?'),
  getCardById: db.prepare('SELECT * FROM cards WHERE id = ?'),
  
  countCardsByTeam: db.prepare('SELECT COUNT(*) as n FROM cards WHERE team_id = ?'),
  countCardsByCol: db.prepare('SELECT COUNT(*) as n FROM cards WHERE col = ?'),
  
  // Busca os cards mais antigos da coluna done (por completed_at, depois created_at)
  oldestDoneCards: db.prepare(
    `SELECT id FROM cards WHERE col = 'done'
     ORDER BY COALESCE(completed_at, created_at) ASC
     LIMIT ?`
  ),
  
  moveCard: db.prepare('UPDATE cards SET col = ?, completed_at = ? WHERE id = ?'),
  
  insertCard: db.prepare(
    `INSERT INTO cards (id, title, description, col, priority, assignees, skills, notes, created_at, completed_at, team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  
  nextCardId: db.prepare('SELECT COUNT(*) as n FROM cards'),

  updateCard: db.prepare(
    `UPDATE cards SET title = ?, description = ?, col = ?, priority = ?, assignees = ?, skills = ?, notes = ?, completed_at = ?
     WHERE id = ?`
  ),

  deleteCard: db.prepare('DELETE FROM cards WHERE id = ?'),
};

// ─── Public API ──────────────────────────────────────────────

function rowToCard(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.col,
    priority: row.priority,
    assignees: JSON.parse(row.assignees || '[]'),
    skills: JSON.parse(row.skills || '[]'),
    notes: row.notes,
    created_at: row.created_at,
    completed_at: row.completed_at,
    _team_id: row.team_id,
  };
}

export function listBoards() {
  const boards = stmts.getBoards.all();
  return boards.map((b) => {
    const columns = stmts.getColumns.all(b.team_id).map((c) => ({
      id: c.col_id,
      title: c.title,
    }));
    const totalCards = stmts.countCardsByTeam.get(b.team_id).n;
    return {
      workdir: b.workdir,
      kanban_file: b.kanban_file,
      team_id: b.team_id,
      columns,
      total_cards: totalCards,
    };
  });
}

export function getCards({ team_id, column } = {}) {
  let rows;
  if (team_id && column) {
    rows = stmts.getCardsByTeamAndCol.all(team_id, column);
  } else if (team_id) {
    rows = stmts.getCardsByTeam.all(team_id);
  } else if (column) {
    rows = stmts.getCardsByCol.all(column);
  } else {
    rows = stmts.getAllCards.all();
  }
  return rows.map(rowToCard);
}

export function moveCard(cardId, column) {
  const card = stmts.getCardById.get(cardId);
  if (!card) return null;
  
  const completedAt = column === 'done' ? new Date().toISOString() : card.completed_at;
  stmts.moveCard.run(column, completedAt, cardId);
  
  // Auto-limpeza: se a coluna "done" excedeu o limite, remove as mais antigas
  if (column === 'done') {
    pruneOldDoneCards();
  }
  
  return rowToCard(stmts.getCardById.get(cardId));
}

/**
 * Remove os cards mais antigos da coluna "done" quando excede o limite.
 * Mantém apenas os DONE_COLUMN_LIMIT mais recentes.
 */
function pruneOldDoneCards() {
  const count = stmts.countCardsByCol.get('done').n;
  if (count <= DONE_COLUMN_LIMIT) return [];

  const excess = count - DONE_COLUMN_LIMIT;
  const oldCards = stmts.oldestDoneCards.all(excess);
  
  const removed = [];
  for (const { id } of oldCards) {
    stmts.deleteCard.run(id);
    removed.push(id);
  }
  
  if (removed.length > 0) {
    console.log(`  🧹 Auto-limpeza: removidos ${removed.length} cards antigos da coluna done: ${removed.join(', ')}`);
  }
  
  return removed;
}

// Limpeza inicial ao carregar o banco
pruneOldDoneCards();

export function addCard({ title, description, column, priority, skills, team_id }) {
  const count = stmts.nextCardId.get().n;
  const newId = `TASK-${String(count + 1).padStart(3, '0')}`;
  
  stmts.insertCard.run(
    newId,
    title || 'Sem título',
    description || '',
    column || 'backlog',
    priority || 3,
    JSON.stringify([]),
    JSON.stringify(skills || []),
    '',
    new Date().toISOString(),
    null,
    team_id || 'c22f69a564d6'
  );
  
  return rowToCard(stmts.getCardById.get(newId));
}

export function updateCard(cardId, updates) {
  const card = stmts.getCardById.get(cardId);
  if (!card) return null;

  stmts.updateCard.run(
    updates.title ?? card.title,
    updates.description ?? card.description,
    updates.column ?? card.col,
    updates.priority ?? card.priority,
    updates.assignees ? JSON.stringify(updates.assignees) : card.assignees,
    updates.skills ? JSON.stringify(updates.skills) : card.skills,
    updates.notes ?? card.notes,
    updates.completed_at ?? card.completed_at,
    cardId
  );

  return rowToCard(stmts.getCardById.get(cardId));
}

export function deleteCard(cardId) {
  const card = stmts.getCardById.get(cardId);
  if (!card) return false;
  stmts.deleteCard.run(cardId);
  return true;
}

export function close() {
  db.close();
}

export default {
  listBoards,
  getCards,
  moveCard,
  addCard,
  updateCard,
  deleteCard,
  close,
};
