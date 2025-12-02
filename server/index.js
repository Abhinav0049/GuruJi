require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Lightweight in-memory store for dev/testing when no MongoDB is available
const inMemoryStore = new Map();
function getInMemoryCollection(name) {
  if (!inMemoryStore.has(name)) inMemoryStore.set(name, []);
  return {
    insertOne: async (doc) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const saved = { _id: id, ...doc };
      inMemoryStore.get(name).unshift(saved);
      return { insertedId: id };
    },
    find: (query = {}) => {
      const arr = inMemoryStore.get(name).slice();
      const results = arr.filter((d) => {
        for (const k of Object.keys(query)) {
          if (d[k] !== query[k]) return false;
        }
        return true;
      });
      return {
        sort: () => ({
          limit: (n) => ({ toArray: async () => results.slice(0, n) })
        })
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
  console.log('Serving static files from client/build');
} else if (fs.existsSync(clientStaticPath)) {
  app.use(express.static(clientStaticPath));
  console.log('Serving static files from client/');
} else {
  console.log('No client static files found (client/ or client/build)');
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// SSE: simple server-sent events endpoint (dev-friendly)
const sseClients = new Set();
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders?.();
  res.write(':connected\n\n');
  const client = res;
  sseClients.add(client);
  req.on('close', () => {
    sseClients.delete(client);
  });
});

// API: fetch aggregated metrics (company-level, no respondent PII)
app.get('/api/aggregates', async (req, res) => {
  try {
    const { companyId, surveyId } = req.query;
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
    console.error('GET /api/aggregates error', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'internal server error' });
  }
});

// API: submit a survey response (dev-friendly, no auth required)
app.post('/api/responses', async (req, res) => {
  try {
    const { companyId, surveyId, respondentId, answers } = req.body;
    if (!companyId || !surveyId || !answers) return res.status(400).json({ error: 'companyId, surveyId and answers required' });
    const responses = (typeof db !== 'undefined' && db && db.collection) ? db.collection('responses') : getInMemoryCollection('responses');
    const doc = { companyId: String(companyId), surveyId: String(surveyId), respondentId: respondentId || null, answers, createdAt: new Date() };
    const result = await responses.insertOne(doc);
    const saved = { _id: result.insertedId, ...doc };

    // Publish to SSE clients (aggregated event)
    const payload = { surveyId: saved.surveyId, companyId: saved.companyId, timestamp: saved.createdAt, summary: { submitted: 1 } };
    const text = `event: response:created\n` + `data: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach((clientRes) => {
      try {
        clientRes.write(text);
      }
      catch (e) { /* ignore */ }
    });

    // Also broadcast via socket.io for other clients
    try {
      io.emit('server:response', { companyId: saved.companyId, surveyId: saved.surveyId, timestamp: saved.createdAt });
    }
    catch (e) { }

    return res.json({ ok: true, response: saved });
  }
  catch (err) {
    console.error('POST /api/responses error', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'internal server error' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id}`);
  socket.emit('server:welcome', { message: 'Welcome! socket.io connected.' });

  socket.on('client:test', (data) => {
    console.log('Received client:test', data);
    // Echo back to the sender
    socket.emit('server:echo', { received: data });
    // Broadcast to others
    socket.broadcast.emit('server:broadcast', { from: socket.id, data });
  });

  socket.on('disconnect', (reason) => {
    console.log(`socket disconnected: ${socket.id} (${reason})`);
  });
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  io.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
