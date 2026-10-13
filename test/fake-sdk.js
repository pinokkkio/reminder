// Фейковый `sdk` Telegram Serverless для тестов: SQLite в памяти + запись вызовов Bot API.

import { DatabaseSync } from 'node:sqlite';

// ---------- Схема (минимальный DSL, совместимый с tgcloud/schema.js) ----------

function column(type) {
  return (name) => {
    const c = { name, type, mods: [] };
    const self = {
      _col: c,
      primaryKey(opts) { c.mods.push(opts?.autoIncrement ? 'PRIMARY KEY AUTOINCREMENT' : 'PRIMARY KEY'); return self; },
      notNull() { c.mods.push('NOT NULL'); return self; },
      unique() { c.mods.push('UNIQUE'); return self; },
      default(v) { c.mods.push(`DEFAULT ${typeof v === 'string' ? `'${v}'` : v}`); return self; },
    };
    return self;
  };
}

export const integer = column('INTEGER');
export const text = column('TEXT');

export function index(name) {
  return { on: (...cols) => ({ name, cols }) };
}

export function table(name, cols, extra) {
  const refs = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v._col.name]));
  return { _table: true, name, cols: Object.values(cols).map((c) => c._col), indexes: Object.values(extra ? extra(refs) : {}) };
}

export function ddl(schema) {
  const out = [];
  for (const t of Object.values(schema).filter((x) => x?._table)) {
    out.push(`CREATE TABLE ${t.name} (${t.cols.map((c) => [c.name, c.type, ...c.mods].join(' ')).join(', ')})`);
    for (const i of t.indexes) out.push(`CREATE INDEX ${i.name} ON ${t.name} (${i.cols.join(', ')})`);
  }
  return out.join(';\n');
}

// ---------- db ----------

let sqlite = null;

export function resetDb(schema) {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(ddl(schema));
}

const bind = (params = {}) => Object.fromEntries(Object.entries(params).map(([k, v]) => [k.replace(/^[:@$]/, ''), v]));

export const db = {
  async run(query, params) {
    const r = sqlite.prepare(query).run(bind(params));
    return { rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid), rows: [] };
  },
  async all(query, params) {
    return sqlite.prepare(query).all(bind(params));
  },
  async get(query, params) {
    return sqlite.prepare(query).get(bind(params)) ?? null;
  },
};
export default db;

// ---------- Ошибки ----------

export class BotApiError extends Error {
  constructor(code, description, method) {
    super(description);
    this.code = code;
    this.description = description;
    this.method = method;
  }
}

export class EndpointError extends Error {
  constructor(description, parameters) {
    super(description);
    this.description = description;
    this.parameters = parameters;
  }
}

// ---------- api ----------

/** @type {{ method: string, params: any }[]} */
export const calls = [];
/** Если задано — следующий вызов этого метода бросит BotApiError(code). */
export const failures = new Map();

export const api = new Proxy({}, {
  get: (_, method) => async (params) => {
    calls.push({ method, params });
    const code = failures.get(method);
    if (code) {
      failures.delete(method);
      throw new BotApiError(code, `fake error ${code}`, method);
    }
    return method === 'sendMessage' ? { message_id: calls.length } : true;
  },
});

export function resetApi() {
  calls.length = 0;
  failures.clear();
}

export const fetch = globalThis.fetch;
