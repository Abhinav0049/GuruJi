require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const IORedis = require('ioredis');

const app = express();
const port = process.env.PORT || 3000;

const REQUEST_LIMIT = process.env.REQUEST_LIMIT || '100kb';
const MAX_IN_MEMORY_PER_COLLECTION = Number(process.env.MAX_IN_MEMORY_PER_COLLECTION) || 20000;
const MAX_ANSWERS_KEYS = Number(process.env.MAX_ANSWERS_KEYS) || 200;
const MAX_NESTING_DEPTH = Number(process.env.MAX_NESTING_DEPTH) || 3;

// Rate limiter defaults (tunable via env)
const RESPONSES_RATE_LIMIT_WINDOW_MS = Number(process.env.RESPONSES_RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute
const RESPONSES_RATE_LIMIT_MAX = Number(process.env.RESPONSES_RATE_LIMIT_MAX) || 120; // max requests per window per IP

// per-tenant rate limiting (uses Redis when available, falls back to in-memory)
const TENANT_RATE_LIMIT_WINDOW_MS = Number(process.env.TENANT_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const TENANT_RATE_LIMIT_MAX = Number(process.env.TENANT_RATE_LIMIT_MAX) || 1000;

// JWT config for tenant auth
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const COOKIE_MAX_AGE = Number(process.env.COOKIE_MAX_AGE) || 1000 * 60 * 60; // 1 hour default
const COOKIE_SECURE = (process.env.COOKIE_SECURE === 'true') || (process.env.NODE_ENV === 'production');
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');

function logger(level, ...args) {
  const ts = new Date().toISOString();
  /* eslint-disable no-console */
  console.log(`[${ts}] [${level}]`, ...args);
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3001', credentials: true }));
app.use(helmet());
app.use(express.json({ limit: REQUEST_LIMIT }));
app.use(cookieParser());

// Rate limiter for responses endpoint (per-IP)
const responsesLimiter = rateLimit({
  windowMs: RESPONSES_RATE_LIMIT_WINDOW_MS,
  max: RESPONSES_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' }
});

// Lightweight in-memory store for dev/testing when no MongoDB is available
const inMemoryStore = new Map();
function genId() {
  try {
    return randomUUID();
  }
  catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

function getInMemoryCollection(name) {
  if (!inMemoryStore.has(name)) inMemoryStore.set(name, []);
  return {
    insertOne: async (doc) => {
      const id = genId();
      const saved = { _id: id, ...doc };
      const arr = inMemoryStore.get(name);
      arr.unshift(saved);
      // enforce cap to avoid unbounded memory growth
      while (arr.length > MAX_IN_MEMORY_PER_COLLECTION) arr.pop();
      return { insertedId: id };
    },
    // find returns an object similar to Mongo driver: find(query).sort(obj).limit(n).toArray()
    find: (query = {}) => {
      const arr = inMemoryStore.get(name).slice();
      const results = arr.filter((d) => {
        for (const k of Object.keys(query)) {
          if (d[k] !== query[k]) return false;
        }
        return true;
      });
      return {
        sort: (sortObj = { createdAt: -1 }) => {
          const sortKey = Object.keys(sortObj)[0];
          const dir = sortObj[sortKey] === -1 ? -1 : 1;
          const sorted = results.sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (av === bv) return 0;
            if (av == null) return 1 * dir;
            if (bv == null) return -1 * dir;
            return (av > bv ? 1 : -1) * dir;
          });
          return {
            limit: (n) => ({ toArray: async () => sorted.slice(0, n) })
          };
        }
      };
    }
  };
}

// Serve static client files. Prefer a built client at client/build if present (for React/Vite builds),
// otherwise fall back to the simple client/ folder used in the scaffold.
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
const clientStaticPath = path.join(__dirname, '..', 'client');

if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  logger('info', 'Serving static files from client/build');
} else if (fs.existsSync(clientStaticPath)) {
  app.use(express.static(clientStaticPath));
  logger('info', 'Serving static files from client/');
} else {
  logger('info', 'No client static files found (client/ or client/build)');
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// SSE: simple server-sent events endpoint (dev-friendly)
// store client res -> meta { companyId }
const sseClients = new Map();
let ssePingInterval = null;
function startSsePing() {
  if (ssePingInterval) return;
  ssePingInterval = setInterval(() => {
      sseClients.forEach((meta, clientRes) => {
        try {
          clientRes.write(': ping\n\n');
        }
        catch (e) {
          // ignore broken connections, will be cleaned up on close
        }
      });
  }, 20000);
}

  // Authenticate middleware for APIs and SSE
  function extractTokenFromReq(req) {
    // first check HTTP-only cookie (preferred)
    try {
      if (req && req.cookies && req.cookies.token) return String(req.cookies.token);
    }
    catch (e) { /* ignore */ }
    // support Authorization header or ?token= for EventSource fallback
    const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    if (req.query && req.query.token) return String(req.query.token);
    return null;
  }

  function verifyTokenMiddleware(req, res, next) {
    const token = extractTokenFromReq(req);
    if (!token) return res.status(401).json({ error: 'missing token' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.tenant = payload; // contains companyId and other claims
      return next();
    }
    catch (e) {
      return res.status(401).json({ error: 'invalid token' });
    }
  }

  app.get('/sse', (req, res) => {
    // Prefer cookie-based auth for EventSource (HTTP-only cookie sent by browser when same-origin or proxied)
    const token = extractTokenFromReq(req);
    if (!token) {
      res.status(401).end('missing token');
      return;
    }
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    }
    catch (e) {
      res.status(401).end('invalid token');
      return;
    }

    res.writeHead(200, {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(':connected\n\n');
    const client = res;
    // store tenant/companyId for filtering
    sseClients.set(client, { companyId: payload.companyId });
    startSsePing();
    req.on('close', () => {
      try { sseClients.delete(client); }
      catch (e) { }
    });
  });

// API: fetch aggregated metrics (company-level, no respondent PII)
app.get('/api/aggregates', async (req, res) => {
  try {
    // tenant scoping: require verified token for aggregates
    if (!req.tenant) {
      // attempt to verify; verifyTokenMiddleware is available but we allow callers that used header/token
      const token = extractTokenFromReq(req);
      if (!token) return res.status(401).json({ error: 'missing token' });
      try { req.tenant = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ error: 'invalid token' }); }
    }
    const { surveyId } = req.query;
    const companyId = req.tenant.companyId;
    // If Mongo is available use an aggregation pipeline for performance and to avoid pulling many documents into memory
    if (db) {
      const match = {};
      if (companyId) match.companyId = String(companyId);
      if (surveyId) match.surveyId = String(surveyId);

      // pipeline: filter, project answers as k/v pairs, unwind, group by key, compute avg and positive percentage
      const pipeline = [
        { $match: match },
        { $project: { companyId: 1, surveyId: 1, createdAt: 1, answersArr: { $objectToArray: '$answers' } } },
        { $unwind: '$answersArr' },
        // convert value to number where possible
        { $addFields: { qid: '$answersArr.k', qval: { $convert: { input: '$answersArr.v', to: 'double', onError: null, onNull: null } } } },
        { $match: { qval: { $ne: null } } },
        { $group: {
            _id: '$qid',
            sum: { $sum: '$qval' },
            count: { $sum: 1 },
            positiveCount: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: { $toString: '$_id' }, regex: '^ee-|^employee' } },
                  { $cond: [{ $gte: ['$qval', 7] }, 1, 0] },
                  { $cond: [{ $gte: ['$qval', 4] }, 1, 0] }
                ]
              }
            }
          } },
        // The above $group is intentionally generic — we'll compute metrics in the next stage
        { $project: { questionId: '$_id', average: { $divide: ['$sum', '$count'] }, positivePercentage: { $cond: [{ $eq: ['$count', 0] }, 0, { $multiply: [{ $divide: ['$positiveCount', '$count'] }, 100] }] }, count: '$count' } },
      ];

      let aggResults = [];
      try {
        aggResults = await db.collection('responses').aggregate(pipeline).toArray();
      }
      catch (e) {
        logger('warn', 'Mongo aggregation failed, falling back to in-memory aggregation', e && e.message);
        // fallback to in-memory below
      }

      if (aggResults && aggResults.length > 0) {
        const modules = { 'ai-readiness': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0, trend: 0 } }, leadership: { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0, trend: 0 } }, 'employee-experience': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0, trend: 0 } } };
        aggResults.forEach((r) => {
          const qid = r.questionId;
          const avg = r.average;
          const pos = Math.round((r.positivePercentage + Number.EPSILON) * 10) / 10;
          if (qid.startsWith('ai-')) modules['ai-readiness'].questionScores.push({ questionId: qid, average: avg, positivePercentage: pos });
          else if (qid.startsWith('leadership-')) modules['leadership'].questionScores.push({ questionId: qid, average: avg, positivePercentage: pos });
          else if (qid.startsWith('ee-') || qid.startsWith('employee')) modules['employee-experience'].questionScores.push({ questionId: qid, average: avg, positivePercentage: pos });
        });
        Object.keys(modules).forEach((modKey) => {
          const qlist = modules[modKey].questionScores;
          modules[modKey].summaryMetrics.totalQuestions = qlist.length;
          if (qlist.length > 0) {
            const avgPos = qlist.reduce((acc, q) => acc + (q.positivePercentage || 0), 0) / qlist.length;
            modules[modKey].summaryMetrics.positiveAverage = Math.round((avgPos + Number.EPSILON) * 10) / 10;
          } else modules[modKey].summaryMetrics.positiveAverage = 0;
        });
        return res.json({ ok: true, aggregates: modules });
      }
    }

    // Fallback: existing in-memory aggregation
    const responses = (typeof db !== 'undefined' && db && db.collection) ? db.collection('responses') : getInMemoryCollection('responses');
    if (!responses) {
      return res.json({ ok: true, aggregates: { 'ai-readiness': { summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0 }, questionScores: [], sectionData: [] }, leadership: { summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0 }, questionScores: [], sectionData: [] }, 'employee-experience': { summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: 0 }, questionScores: [], sectionData: [] } } });
    }

    const q = {};
    if (companyId) q.companyId = String(companyId);
    if (surveyId) q.surveyId = String(surveyId);

    const docs = await responses.find(q).sort({ createdAt: -1 }).limit(10000).toArray();

    const questionStats = {};
    let totalRespondents = 0;
    docs.forEach((doc) => {
      if (doc.answers && typeof doc.answers === 'object') {
        totalRespondents += 1;
        Object.entries(doc.answers).forEach(([qid, rawVal]) => {
          const val = typeof rawVal === 'number' ? rawVal : Number(rawVal);
          if (!Number.isFinite(val)) return;
          if (!questionStats[qid]) questionStats[qid] = { sum: 0, count: 0, positiveCount: 0 };
          questionStats[qid].sum += val;
          questionStats[qid].count += 1;
          const prefix = String(qid).split('-')[0];
          const threshold = (prefix === 'ee' || prefix === 'employee') ? 7 : 4;
          if (val >= threshold) questionStats[qid].positiveCount += 1;
        });
      }
      else if (doc.question && typeof doc.response !== 'undefined') {
        const qid = doc.question;
        const val = typeof doc.response === 'number' ? doc.response : Number(doc.response);
        if (!Number.isFinite(val)) return;
        if (!questionStats[qid]) questionStats[qid] = { sum: 0, count: 0, positiveCount: 0 };
        questionStats[qid].sum += val;
        questionStats[qid].count += 1;
        const prefix = String(qid).split('-')[0];
        const threshold = (prefix === 'ee' || prefix === 'employee') ? 7 : 4;
        if (val >= threshold) questionStats[qid].positiveCount += 1;
      }
    });

    const modules = {
      'ai-readiness': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } },
      'leadership': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } },
      'employee-experience': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } }
    };

    Object.entries(questionStats).forEach(([qid, stats]) => {
      const avg = stats.sum / stats.count;
      const positivePct = stats.count > 0 ? (stats.positiveCount / stats.count) * 100 : 0;
      if (qid.startsWith('ai-')) {
        modules['ai-readiness'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      }
      else if (qid.startsWith('leadership-')) {
        modules['leadership'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      }
      else if (qid.startsWith('ee-') || qid.startsWith('employee')) {
        modules['employee-experience'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      }
    });

    Object.keys(modules).forEach((modKey) => {
      const qlist = modules[modKey].questionScores;
      modules[modKey].summaryMetrics.totalQuestions = qlist.length;
      if (qlist.length > 0) {
        const avgPos = qlist.reduce((acc, q) => acc + (q.positivePercentage || 0), 0) / qlist.length;
        modules[modKey].summaryMetrics.positiveAverage = Math.round((avgPos + Number.EPSILON) * 10) / 10;
      }
      else {
        modules[modKey].summaryMetrics.positiveAverage = 0;
      }
    });

    return res.json({ ok: true, aggregates: modules });
  }
  catch (err) {
    logger('error', 'GET /api/aggregates error', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'internal server error' });
  }
});

// validate response payloads
function validateResponsePayload(body) {
  if (!body || typeof body !== 'object') return 'Body must be an object';
  const { companyId, surveyId, answers } = body;
  if (!companyId || typeof companyId !== 'string') return 'companyId must be a non-empty string';
  if (!surveyId || typeof surveyId !== 'string') return 'surveyId must be a non-empty string';
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'answers must be an object';
  if (Object.keys(answers).length === 0) return 'answers must have at least one entry';
  // Ensure answers values are numbers or numeric strings or arrays of numbers
  // Limit keys and nesting depth to avoid huge payloads
  if (Object.keys(answers).length > MAX_ANSWERS_KEYS) return `answers has too many keys (max ${MAX_ANSWERS_KEYS})`;
  function getDepth(obj, cur = 0) {
    if (obj === null || typeof obj !== 'object') return cur;
    let md = cur;
    for (const v of Object.values(obj)) {
      if (typeof v === 'object' && v !== null) {
        const d = getDepth(v, cur + 1);
        if (d > md) md = d;
        if (md > MAX_NESTING_DEPTH) return md;
      }
    }
    return md;
  }
  if (getDepth(answers, 0) > MAX_NESTING_DEPTH) return `answers nesting too deep (max ${MAX_NESTING_DEPTH})`;
  for (const [k, v] of Object.entries(answers)) {
    if (Array.isArray(v)) {
      if (!v.every((x) => typeof x === 'number' || (!Number.isNaN(Number(x)) && x !== null && x !== ''))) return `answers.${k} must be number or array of numbers`;
    }
    else if (typeof v === 'object' && v !== null) {
      // allow nested objects but skip strict numeric check
      continue;
    }
    else if (typeof v !== 'number' && Number.isNaN(Number(v))) {
      return `answers.${k} must be numeric`;
    }
  }
  return null;
}

// Tenant-aware rate limiter middleware
async function tenantRateLimiter(req, res, next) {
  try {
    const tenantId = req.tenant && req.tenant.companyId ? String(req.tenant.companyId) : (req.body && req.body.companyId ? String(req.body.companyId) : null);
    if (!tenantId) return res.status(400).json({ error: 'missing tenant/companyId' });
    // If Redis available use it for accurate counts
    if (redisPub) {
      const key = `rl:${tenantId}:${Math.floor(Date.now() / TENANT_RATE_LIMIT_WINDOW_MS)}`;
      const v = await redisPub.incr(key);
      if (v === 1) await redisPub.pexpire(key, TENANT_RATE_LIMIT_WINDOW_MS);
      if (v > TENANT_RATE_LIMIT_MAX) return res.status(429).json({ error: 'tenant rate limit exceeded' });
      return next();
    }
    // fallback in-memory per-tenant counters
    const storeKey = `tenant_rl__${tenantId}`;
    if (!inMemoryStore.has(storeKey)) inMemoryStore.set(storeKey, { count: 0, windowStart: Date.now() });
    const entry = inMemoryStore.get(storeKey);
    if (Date.now() - entry.windowStart > TENANT_RATE_LIMIT_WINDOW_MS) { entry.count = 0; entry.windowStart = Date.now(); }
    entry.count += 1;
    if (entry.count > TENANT_RATE_LIMIT_MAX) return res.status(429).json({ error: 'tenant rate limit exceeded' });
    return next();
  }
  catch (e) {
    logger('warn', 'tenantRateLimiter error', e && e.message);
    return next();
  }
}

// API: submit a survey response (dev-friendly, no auth required)
// protect responses endpoint with token middleware
app.post('/api/responses', responsesLimiter, verifyTokenMiddleware, tenantRateLimiter, async (req, res) => {
  try {
    const validationError = validateResponsePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const { companyId, surveyId, respondentId, answers } = req.body;
    // enforce tenant scoping: token.companyId must match the payload.companyId
    if (!req.tenant || String(req.tenant.companyId) !== String(companyId)) return res.status(403).json({ error: 'companyId does not match token' });
    const responses = (typeof db !== 'undefined' && db && db.collection) ? db.collection('responses') : getInMemoryCollection('responses');

    // Normalize answers: convert numeric strings to numbers, leave nested objects/arrays as-is
    const normalizedAnswers = {};
    for (const [k, v] of Object.entries(answers)) {
      if (Array.isArray(v)) normalizedAnswers[k] = v.map((x) => (typeof x === 'number' ? x : (Number.isNaN(Number(x)) ? x : Number(x))));
      else if (typeof v === 'object' && v !== null) normalizedAnswers[k] = v;
      else normalizedAnswers[k] = (typeof v === 'number' ? v : (Number.isNaN(Number(v)) ? v : Number(v)));
    }

    const doc = { companyId: String(companyId), surveyId: String(surveyId), respondentId: respondentId || null, answers: normalizedAnswers, createdAt: new Date() };
    let result;
    if (db) {
      try {
        result = await db.collection('responses').insertOne(doc);
      }
      catch (e) {
        logger('warn', 'Mongo insert failed, falling back to in-memory store', e && e.message);
        const inCol = getInMemoryCollection('responses');
        result = await inCol.insertOne(doc);
      }
    }
    else {
      const inCol = getInMemoryCollection('responses');
      result = await inCol.insertOne(doc);
    }
    const saved = { _id: result.insertedId, ...doc };

    // Publish to SSE clients only if Mongo change stream is NOT active.
    // When a replica-set is in use we rely on MongoDB change streams to drive realtime events
    // to avoid duplicate notifications. If change-stream is unavailable we keep in-process publish.
    if (!mongoChangeStream && !redisPub) {
      const payload = { surveyId: saved.surveyId, companyId: saved.companyId, timestamp: saved.createdAt, summary: { submitted: 1 } };
      const text = `event: response:created\n` + `data: ${JSON.stringify(payload)}\n\n`;
      sseClients.forEach((meta, clientRes) => {
        try {
          clientRes.write(text);
        }
        catch (e) { /* ignore write errors per-client */ }
      });
    }
    // Publish to Redis so other instances can forward the event (best-effort)
    if (redisPub) {
      try {
        const payload = { type: 'insert', companyId: saved.companyId, surveyId: saved.surveyId, doc: { _id: saved._id, createdAt: saved.createdAt } };
        redisPub.publish('responses', JSON.stringify(payload));
      }
      catch (e) { logger('warn', 'Failed to publish response to Redis', e && e.message); }
    }

    // If Mongo change stream is active it will publish changes to SSE clients;
    // otherwise we publish directly above to in-process SSE clients.

    return res.json({ ok: true, response: saved });
  }
  catch (err) {
    logger('error', 'POST /api/responses error', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'internal server error' });
  }
});

const server = http.createServer(app);

// MongoDB client and DB handle (optional)
let dbClient = null;
let db = null;
let mongoChangeStream = null;
let redisPub = null;
let redisSub = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function tryConnectRedis() {
  try {
    redisPub = new IORedis(REDIS_URL);
    redisSub = new IORedis(REDIS_URL);
    // attach safe error handlers to avoid uncaught AggregateError logging
    redisPub.on('error', (err) => { logger('warn', 'redisPub error', err && err.message); });
    redisSub.on('error', (err) => { logger('warn', 'redisSub error', err && err.message); });
    // subscribe to responses channel
    await redisSub.subscribe('responses');
    redisSub.on('message', (channel, message) => {
      if (channel !== 'responses') return;
      try {
        const payload = JSON.parse(message);
        // forward to SSE clients filtered by tenant
        sseClients.forEach((meta, clientRes) => {
          try {
            if (meta && meta.companyId && payload.companyId && String(meta.companyId) === String(payload.companyId)) {
              const text = `event: response:changed\n` + `data: ${JSON.stringify(payload)}\n\n`;
              clientRes.write(text);
            }
          }
          catch (e) { }
        });
      }
      catch (e) { logger('warn', 'Invalid redis message', e && e.message); }
    });
    logger('info', 'Connected to Redis for pub/sub');
  }
  catch (e) {
    logger('warn', 'Could not connect to Redis; continuing without Redis pub/sub', e && e.message);
    redisPub = null; redisSub = null;
  }
}

async function tryConnectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger('info', 'No MONGODB_URI provided — running with in-memory fallback');
    return;
  }
  try {
    dbClient = new MongoClient(uri, { maxPoolSize: 10 });
    await dbClient.connect();
    db = dbClient.db(process.env.MONGODB_DB || undefined);
    logger('info', 'Connected to MongoDB');

    try {
      const coll = db.collection('responses');
      mongoChangeStream = coll.watch([], { fullDocument: 'updateLookup' });
      mongoChangeStream.on('change', (change) => {
        try {
            const doc = change.fullDocument || null;
            const payload = { type: change.operationType, doc: doc ? { _id: doc._id, companyId: doc.companyId, surveyId: doc.surveyId, createdAt: doc.createdAt } : null };
            // If Redis is available we rely on the application write path to publish events
            // to Redis (avoids duplicate messages). If Redis isn't available, forward events directly.
            if (!redisPub) {
              const text = `event: response:changed\n` + `data: ${JSON.stringify(payload)}\n\n`;
              sseClients.forEach((meta, clientRes) => {
                try { clientRes.write(text); } catch (e) { }
              });
            }
        }
        catch (e) { logger('warn', 'Error processing change stream event', e); }
      });
      mongoChangeStream.on('error', (err) => {
        logger('warn', 'Mongo change stream error — disabling change stream', err && err.message);
        try { mongoChangeStream.close(); } catch (e) { }
        mongoChangeStream = null;
      });
      logger('info', 'Mongo change stream established for responses collection');
    }
    catch (e) {
      logger('warn', 'Could not open change stream (likely single-node Mongo). SSE will still work via in-process publish.');
    }
  }
  catch (e) {
    logger('error', 'MongoDB connection failed — continuing with in-memory fallback', e.message || e);
    try { if (dbClient) await dbClient.close(); } catch (e2) { }
    dbClient = null;
    db = null;
  }
}

tryConnectMongo();
tryConnectRedis();

// Dev helper: simple login endpoint that returns a signed JWT for a tenant/companyId
app.post('/api/login', express.json(), (req, res) => {
  const { companyId } = req.body || {};
  if (!companyId || typeof companyId !== 'string') return res.status(400).json({ error: 'companyId required' });
  const token = jwt.sign({ companyId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  // Set HTTP-only cookie for auth so EventSource clients can use it without exposing token in JS
  // Dev-friendly: SameSite=lax and not secure so it works on localhost. In production, set Secure and SameSite appropriately.
    try {
      res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: COOKIE_SAMESITE, secure: COOKIE_SECURE, maxAge: COOKIE_MAX_AGE });
    }
    catch (e) {
      logger('warn', 'Failed to set cookie on login response', e && e.message);
    }
  return res.json({ ok: true });
});

// Logout - clears the auth cookie
app.post('/api/logout', (req, res) => {
  try {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAMESITE });
  }
  catch (e) { logger('warn', 'Failed to clear cookie on logout', e && e.message); }
  return res.json({ ok: true });
});

// Admin: clear responses (dangerous) — requires header `x-admin-secret` matching ADMIN_SECRET env var
// NOTE: admin clear-responses endpoint removed to avoid accidental destructive operations.
// If you need to purge data, run a controlled migration or use a one-off admin script with proper access controls.

// Graceful shutdown
function shutdown() {
  logger('info', 'Shutting down server...');
  // stop SSE ping
  if (ssePingInterval) {
    clearInterval(ssePingInterval);
    ssePingInterval = null;
  }
  // close SSE client responses
  sseClients.forEach((clientRes) => {
    try {
      clientRes.write(':shutdown\n\n');
      clientRes.end();
    }
    catch (e) { }
  });
  try {
    // close Mongo change stream and client if present
    try { if (mongoChangeStream) { mongoChangeStream.close(); mongoChangeStream = null; } } catch (e) { }
    try { if (dbClient) { dbClient.close().catch(() => {}); dbClient = null; db = null; } } catch (e) { }
    try { if (redisSub) { redisSub.quit().catch(()=>{}); redisSub = null; } } catch (e) { }
    try { if (redisPub) { redisPub.quit().catch(()=>{}); redisPub = null; } } catch (e) { }
    server.close(() => {
      process.exit(0);
    });
  }
  catch (e) {
    logger('error', 'Error during shutdown', e);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason, p) => {
  logger('error', 'Unhandled Rejection at Promise', reason, p);
  // try to shutdown gracefully
  setTimeout(() => process.exit(1), 2000);
});

process.on('uncaughtException', (err) => {
  logger('error', 'Uncaught Exception', err);
  // as state may be corrupted, exit after logging
  setTimeout(() => process.exit(1), 2000);
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
