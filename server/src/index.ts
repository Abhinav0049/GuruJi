import express from 'express';
import http from 'http';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { MongoClient, Db } from 'mongodb';
// Kafka producer/consumer are optional for local dev. Provide safe stubs
// so the TypeScript server builds/runs when Kafka modules are not present.
let initProducer: () => Promise<void> = async () => { return; };
let produceResponseEvent: (companyId: string, surveyId: string, saved: any) => Promise<void> = async () => { return; };
let startConsumer: () => Promise<void> = async () => { return; };
// Kafka removed: no runtime producer/consumer in this build (calls are no-ops)
import { subscribeSSE, publishEvent } from './sse';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const server = http.createServer(app);

// SSE client registry and publish helpers moved to `sse.ts`

// MongoDB setup
const MONGODB_URI = process.env.MONGODB_URI || process.env.VITE_MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || process.env.VITE_MONGODB_DATABASE || 'leap-survey';

let mongoClient: MongoClient | undefined;
let db: any; // may be a real Db or an in-memory fallback for dev
let useInMemoryDb = false;

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGODB_URI, { connectTimeoutMS: 10000 });
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB);
    console.log('Connected to MongoDB', MONGODB_URI, 'db=', MONGODB_DB);
    useInMemoryDb = false;
  } catch (err: any) {
    // Fallback to a lightweight in-memory store for local dev/testing when Mongo isn't available
    console.warn('Could not connect to MongoDB, falling back to in-memory DB for dev:', err && err.message ? err.message : err);
    // Try spinning up an embedded MongoDB for local dev using mongodb-memory-server
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { MongoMemoryServer } = require('mongodb-memory-server');
      console.log('Starting embedded MongoDB (mongodb-memory-server) for local development...');
      const mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      mongoClient = new MongoClient(memUri, { connectTimeoutMS: 10000 });
      await mongoClient.connect();
      db = mongoClient.db(MONGODB_DB);
      useInMemoryDb = false;
      console.log('Connected to embedded MongoDB');
    } catch (memErr) {
      // If embedded Mongo isn't available, fallback to the lightweight Map store
      useInMemoryDb = true;
      const store = new Map<string, any[]>();
      const getCollection = (name: string) => {
        if (!store.has(name)) store.set(name, []);
        return {
          insertOne: async (doc: any) => {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            const saved = { _id: id, ...doc };
            store.get(name)!.unshift(saved);
            return { insertedId: id };
          },
          find: (query: any = {}) => {
            const arr = store.get(name)!.slice();
            const results = arr.filter((d) => {
              for (const k of Object.keys(query)) {
                if (d[k] !== query[k]) return false;
              }
              return true;
            });
            return {
              sort: () => ({
                limit: (n: number) => ({ toArray: async () => results.slice(0, n) })
              })
            };
          }
        };
      };
      db = { collection: (name: string) => getCollection(name) };
      console.warn('mongodb-memory-server not available; using lightweight in-memory store (not persisted)');
    }
  }
}

// Simple JWT auth middleware for API endpoints
function jwtAuthRequired(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization header required' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') as any;
    (req as any).auth = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminRequired(req: express.Request, res: express.Response, next: express.NextFunction) {
  const payload = (req as any).auth as any;
  if (!payload || !payload.isAdmin) return res.status(403).json({ error: 'admin role required' });
  return next();
}

// SSE subscribe endpoint (logic in sse.ts)
app.get('/sse', subscribeSSE);

// publishEvent is implemented in sse.ts and imported above

// API: submit a survey response
app.post('/api/responses', jwtAuthRequired, async (req, res) => {
  try {
    const payload = (req as any).auth as any;
    const { companyId, surveyId, respondentId, answers } = req.body;
    if (!companyId || !surveyId || !answers) return res.status(400).json({ error: 'companyId, surveyId and answers required' });
    if (String(payload.companyId) !== String(companyId)) return res.status(403).json({ error: 'Token not valid for companyId' });

    const responses = db.collection('responses');
    const now = new Date();
    const doc = { companyId: String(companyId), surveyId: String(surveyId), respondentId: respondentId || null, answers, createdAt: now };
    const result = await responses.insertOne(doc);

    // Update materialized aggregates collection (upsert per company+survey)
    try {
      const aggregates = db.collection('aggregates');
      const key = { companyId: String(companyId), surveyId: String(surveyId) };
      const incs: any = { responseCount: 1 };
      // answers expected to be an object mapping questionId -> numeric value OR an array of {questionId, answer}
      if (Array.isArray(answers)) {
        answers.forEach((a: any) => {
          const qid = String(a.questionId);
          const val = Number(a.answer || 0);
          if (!Number.isFinite(val)) return;
          incs[`questions.${qid}.count`] = (incs[`questions.${qid}.count`] || 0) + 1;
          incs[`questions.${qid}.sum`] = (incs[`questions.${qid}.sum`] || 0) + val;
          const prefix = qid.split('-')[0];
          const threshold = (prefix === 'ee' || prefix === 'employee') ? 7 : 4;
          if (val >= threshold) {
            incs[`questions.${qid}.positiveCount`] = (incs[`questions.${qid}.positiveCount`] || 0) + 1;
          }
        });
      } else if (answers && typeof answers === 'object') {
        Object.entries(answers).forEach(([qid, raw]) => {
          const val = Number(raw);
          if (!Number.isFinite(val)) return;
          incs[`questions.${qid}.count`] = (incs[`questions.${qid}.count`] || 0) + 1;
          incs[`questions.${qid}.sum`] = (incs[`questions.${qid}.sum`] || 0) + val;
          const prefix = String(qid).split('-')[0];
          const threshold = (prefix === 'ee' || prefix === 'employee') ? 7 : 4;
          if (val >= threshold) {
            incs[`questions.${qid}.positiveCount`] = (incs[`questions.${qid}.positiveCount`] || 0) + 1;
          }
        });
      }
      const update: any = { $inc: incs, $set: { lastUpdated: now } };
      await aggregates.updateOne(key, update, { upsert: true });
      // Read back the updated buckets for affected questions and compute exact positivePercentage
      try {
        const updated = await aggregates.findOne(key as any);
        const qBuckets = (updated && updated.questions) ? updated.questions : {};
        const affectedQids = Array.isArray(answers) ? answers.map((a: any) => String(a.questionId)) : Object.keys(answers || {});
        const setObj: any = {};
        affectedQids.forEach((qid: string) => {
          const q = qBuckets[qid];
          if (q && q.count > 0) {
            const pct = Math.round(((Number(q.positiveCount || 0) / Number(q.count)) * 100 + Number.EPSILON) * 10) / 10;
            setObj[`questions.${qid}.positivePercentage`] = pct;
          }
        });
        if (Object.keys(setObj).length > 0) {
          await aggregates.updateOne(key, { $set: setObj });
        }

        // Compute and persist summaryMetrics for quick reads: positiveAverage, totalQuestions, responseCount, medianQuestionScore, topDemographic
        try {
          const updated2 = await aggregates.findOne(key as any);
          const buckets = (updated2 && updated2.questions) ? updated2.questions : {};
          const responseCount = Number(updated2?.responseCount || 0);
          const perQuestion = Object.entries(buckets).map(([qid, stats]: any) => {
            const cnt = Number(stats.count || 0);
            const sum = Number(stats.sum || 0);
            const avg = cnt > 0 ? (sum / cnt) : 0;
            const positivePct = Number(stats.positivePercentage || 0);
            return { qid, avg, positivePct, cnt };
          });
          const totalQuestions = perQuestion.length;
          // median of question averages
          const sortedAvgs = perQuestion.map(p => p.avg).sort((a, b) => a - b);
          let medianQuestionScore = 0;
          if (sortedAvgs.length > 0) {
            const mid = Math.floor(sortedAvgs.length / 2);
            medianQuestionScore = sortedAvgs.length % 2 === 1 ? sortedAvgs[mid] : (sortedAvgs[mid - 1] + sortedAvgs[mid]) / 2;
            medianQuestionScore = Math.round((medianQuestionScore + Number.EPSILON) * 10) / 10;
          }

          // Attempt to compute topDemographic by scanning recent responses for demographic fields
          let topDemographic: any = null;
          try {
            const respDocs = await responses.find(key).limit(1000).toArray();
            const demCounts: Record<string, number> = {};
            respDocs.forEach((d: any) => {
              if (d.demographics && typeof d.demographics === 'object') {
                Object.values(d.demographics).forEach((v: any) => {
                  if (!v) return;
                  const name = String(v);
                  demCounts[name] = (demCounts[name] || 0) + 1;
                });
              } else if (d.answers && typeof d.answers === 'object') {
                Object.entries(d.answers).forEach(([k, v]: any) => {
                  if (k.startsWith('dem-') || k.startsWith('dept') || k.toLowerCase().includes('department') || k.toLowerCase().includes('team')) {
                    if (!v) return;
                    const name = String(v);
                    demCounts[name] = (demCounts[name] || 0) + 1;
                  }
                });
              }
            });
            const entries = Object.entries(demCounts);
            if (entries.length > 0) {
              entries.sort((a, b) => b[1] - a[1]);
              const [group, count] = entries[0];
              topDemographic = { group, count, pct: responseCount > 0 ? Math.round((count / responseCount) * 100) : 0 };
            }
          } catch (demErr) {
            console.warn('failed to compute topDemographic', demErr);
          }

          const summaryMetrics = {
            positiveAverage: perQuestion.length > 0 ? Math.round((perQuestion.reduce((s: number, p: any) => s + (Number(p.positivePct) || 0), 0) / perQuestion.length + Number.EPSILON) * 10) / 10 : 0,
            totalQuestions,
            responseCount,
            medianQuestionScore,
            topDemographic
          };
          await aggregates.updateOne(key, { $set: { summaryMetrics } });
        } catch (sErr) {
          console.warn('failed to compute/store summaryMetrics', sErr);
        }
      } catch (pctErr) {
        console.warn('failed to compute positivePercentage for aggregates', pctErr);
      }
    } catch (aggErr) {
      console.warn('could not update aggregates materialized store', aggErr);
    }

    // publish to SSE clients (aggregated event only)
    publishEvent('response:created', { companyId, surveyId, timestamp: now.toISOString() });

    // Kafka disabled in this build — no-op for event production

    // Return only a minimal acknowledgement to avoid echoing respondent-level data
    return res.json({ ok: true, insertedId: result.insertedId });
  } catch (err: any) {
    console.error('POST /api/responses error', err);
    return res.status(500).json({ error: err.message || 'internal server error' });
  }
});

// API: fetch responses
// Raw responses endpoint: restricted to admin users only. Company users should use /api/aggregates.
app.get('/api/responses', jwtAuthRequired, adminRequired, async (req, res) => {
  try {
    const { companyId, surveyId, limit = '100' } = req.query;
    const responses = db.collection('responses');
    const q: any = {};
    if (companyId) q.companyId = String(companyId);
    if (surveyId) q.surveyId = String(surveyId);
    const docs = await responses.find(q).sort({ createdAt: -1 }).limit(Number(limit)).toArray();
    return res.json({ ok: true, responses: docs });
  } catch (err: any) {
    console.error('GET /api/responses error', err);
    return res.status(500).json({ error: err.message || 'internal server error' });
  }
});

// API: fetch aggregated metrics (company-level, no respondent PII)
app.get('/api/aggregates', async (req, res) => {
  try {
    const { companyId, surveyId } = req.query;
    // basic validation
    if (!companyId && !surveyId) {
      // allow admin/global aggregates when neither provided
      console.warn('Requesting global aggregates (no companyId, no surveyId)');
    }
    const aggregatesColl = db.collection('aggregates');
    const key: any = {};
    if (companyId) key.companyId = String(companyId);
    if (surveyId) key.surveyId = String(surveyId);

    // Try to read from materialized aggregates first
    let aggDoc: any = null;
    try {
      if (Object.keys(key).length > 0) {
        aggDoc = await aggregatesColl.findOne(key as any);
      }
    } catch (e) {
      console.warn('aggregates collection not available or read failed', e);
    }

    // Helper to build module shapes from question sums/counts
    const buildModulesFromQuestionBuckets = (questionBuckets: Record<string, any>, responseCount: number) => {
      const modules = {
        'ai-readiness': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount, trend: 0 } },
        'leadership': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount, trend: 0 } },
        'employee-experience': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount, trend: 0 } }
      } as any;
      Object.entries(questionBuckets || {}).forEach(([qid, stats]: any) => {
        const cnt = stats.count || 0;
        const sum = stats.sum || 0;
        if (cnt <= 0) return;
        const avg = sum / cnt;
        // Determine positive percentage using same heuristic as computed-on-read
        const prefix = String(qid).split('-')[0];
        const threshold = prefix === 'ee' || prefix === 'employee' ? 7 : 4;
        const positivePct = Math.round(((Array.isArray(stats.positiveCount) ? (stats.positiveCount[0] || 0) : (stats.positiveCount || 0)) / cnt) * 100 * 10) / 10 || (avg >= threshold ? 100 : 0);
        const q = { questionId: qid, average: avg, positivePercentage: positivePct };
        if (qid.startsWith('ai-')) modules['ai-readiness'].questionScores.push(q);
        else if (qid.startsWith('leadership-')) modules['leadership'].questionScores.push(q);
        else if (qid.startsWith('ee-') || qid.startsWith('employee')) modules['employee-experience'].questionScores.push(q);
      });

      Object.keys(modules).forEach((modKey) => {
        const qlist = modules[modKey].questionScores;
        modules[modKey].summaryMetrics.totalQuestions = qlist.length;
        if (qlist.length > 0) {
          const avgPos = qlist.reduce((acc: number, q: any) => acc + (q.positivePercentage || 0), 0) / qlist.length;
          modules[modKey].summaryMetrics.positiveAverage = Math.round((avgPos + Number.EPSILON) * 10) / 10;
        } else modules[modKey].summaryMetrics.positiveAverage = 0;
      });
      return modules;
    };

    if (aggDoc) {
      const modules = buildModulesFromQuestionBuckets(aggDoc.questions || {}, aggDoc.responseCount || 0);
      // compute medianQuestionScore per module and attach topDemographic if possible
      try {
        // compute median from question averages
        Object.keys(modules).forEach((modKey) => {
          const qlist = modules[modKey].questionScores || [];
          const avgs = qlist.map((q: any) => q.average).sort((a: number, b: number) => a - b);
          let median = 0;
          if (avgs.length > 0) {
            const mid = Math.floor(avgs.length / 2);
            median = avgs.length % 2 === 1 ? avgs[mid] : (avgs[mid - 1] + avgs[mid]) / 2;
            median = Math.round((median + Number.EPSILON) * 10) / 10;
          }
          modules[modKey].summaryMetrics = modules[modKey].summaryMetrics || {};
          modules[modKey].summaryMetrics.medianQuestionScore = median;
        });

        // Try to compute a topDemographic from recent responses (apply globally)
        try {
          const responsesColl = db.collection('responses');
          const respDocs = await responsesColl.find(key).limit(1000).toArray();
          const demCounts: Record<string, number> = {};
          respDocs.forEach((d: any) => {
            if (d.demographics && typeof d.demographics === 'object') {
              Object.values(d.demographics).forEach((v: any) => {
                if (!v) return;
                const name = String(v);
                demCounts[name] = (demCounts[name] || 0) + 1;
              });
            } else if (d.answers && typeof d.answers === 'object') {
              Object.entries(d.answers).forEach(([k, v]: any) => {
                if (k.startsWith('dem-') || k.startsWith('dept') || k.toLowerCase().includes('department') || k.toLowerCase().includes('team')) {
                  if (!v) return;
                  const name = String(v);
                  demCounts[name] = (demCounts[name] || 0) + 1;
                }
              });
            }
          });
          const entries = Object.entries(demCounts);
          let topDemographic: any = null;
          if (entries.length > 0) {
            entries.sort((a, b) => b[1] - a[1]);
            const [group, count] = entries[0];
            topDemographic = { group, count, pct: (aggDoc.responseCount ? Math.round((count / aggDoc.responseCount) * 100) : 0) };
          }
          if (topDemographic) {
            Object.keys(modules).forEach((modKey) => {
              modules[modKey].summaryMetrics = modules[modKey].summaryMetrics || {};
              modules[modKey].summaryMetrics.topDemographic = topDemographic;
            });
          }
        } catch (demErr) {
          console.warn('Could not compute topDemographic from responses', demErr);
        }
      } catch (e) {
        console.warn('Failed to enrich modules with median/topDemographic', e);
      }

      return res.json({ ok: true, aggregates: modules });
    }

    // Fallback: compute from raw responses
    const responses = db.collection('responses');
    const q: any = {};
    if (companyId) q.companyId = String(companyId);
    if (surveyId) q.surveyId = String(surveyId);
    const docs = await responses.find(q).sort({ createdAt: -1 }).limit(10000).toArray();

    // Accumulate per-question stats
    const questionStats: Record<string, { sum: number; count: number; positiveCount: number }> = {};
    let totalRespondents = 0;
    docs.forEach((doc: any) => {
      if (doc.answers && typeof doc.answers === 'object') {
        totalRespondents += 1;
        Object.entries(doc.answers).forEach(([qid, rawVal]) => {
          const val = typeof rawVal === 'number' ? rawVal : Number(rawVal);
          if (!Number.isFinite(val)) return;
          if (!questionStats[qid]) questionStats[qid] = { sum: 0, count: 0, positiveCount: 0 };
          questionStats[qid].sum += val;
          questionStats[qid].count += 1;
          const prefix = String(qid).split('-')[0];
          const threshold = prefix === 'ee' || prefix === 'employee' || prefix === 'ee' ? 7 : 4;
          if (val >= threshold) questionStats[qid].positiveCount += 1;
        });
      } else if (doc.question && typeof doc.response !== 'undefined') {
        const qid = doc.question;
        const val = typeof doc.response === 'number' ? doc.response : Number(doc.response);
        if (!Number.isFinite(val)) return;
        if (!questionStats[qid]) questionStats[qid] = { sum: 0, count: 0, positiveCount: 0 };
        questionStats[qid].sum += val;
        questionStats[qid].count += 1;
        const prefix = String(qid).split('-')[0];
        const threshold = prefix === 'ee' || prefix === 'employee' ? 7 : 4;
        if (val >= threshold) questionStats[qid].positiveCount += 1;
      }
    });

    // Organize into modules
    const modules = {
      'ai-readiness': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } },
      'leadership': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } },
      'employee-experience': { questionScores: [], sectionData: [], summaryMetrics: { positiveAverage: 0, totalQuestions: 0, responseCount: totalRespondents, trend: 0 } }
    } as any;

    Object.entries(questionStats).forEach(([qid, stats]) => {
      const avg = stats.sum / stats.count;
      const positivePct = stats.count > 0 ? (stats.positiveCount / stats.count) * 100 : 0;
      if (qid.startsWith('ai-')) {
        modules['ai-readiness'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      } else if (qid.startsWith('leadership-')) {
        modules['leadership'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      } else if (qid.startsWith('ee-') || qid.startsWith('employee') || qid.startsWith('ee')) {
        modules['employee-experience'].questionScores.push({ questionId: qid, average: avg, positivePercentage: Math.round(positivePct * 10) / 10 });
      }
    });

    Object.keys(modules).forEach((modKey) => {
      const qlist = modules[modKey].questionScores;
      modules[modKey].summaryMetrics.totalQuestions = qlist.length;
      if (qlist.length > 0) {
        const avgPos = qlist.reduce((acc: number, q: any) => acc + (q.positivePercentage || 0), 0) / qlist.length;
        modules[modKey].summaryMetrics.positiveAverage = Math.round((avgPos + Number.EPSILON) * 10) / 10;
      } else {
        modules[modKey].summaryMetrics.positiveAverage = 0;
      }
    });

    // Compute median per module and topDemographic from raw responses
    try {
      Object.keys(modules).forEach((modKey) => {
        const qlist = modules[modKey].questionScores || [];
        const avgs = qlist.map((q: any) => q.average).sort((a: number, b: number) => a - b);
        let median = 0;
        if (avgs.length > 0) {
          const mid = Math.floor(avgs.length / 2);
          median = avgs.length % 2 === 1 ? avgs[mid] : (avgs[mid - 1] + avgs[mid]) / 2;
          median = Math.round((median + Number.EPSILON) * 10) / 10;
        }
        modules[modKey].summaryMetrics = modules[modKey].summaryMetrics || {};
        modules[modKey].summaryMetrics.medianQuestionScore = median;
      });

      // topDemographic calculation
      const demCounts: Record<string, number> = {};
      docs.forEach((d: any) => {
        if (d.demographics && typeof d.demographics === 'object') {
          Object.values(d.demographics).forEach((v: any) => {
            if (!v) return;
            demCounts[String(v)] = (demCounts[String(v)] || 0) + 1;
          });
        } else if (d.answers && typeof d.answers === 'object') {
          Object.entries(d.answers).forEach(([k, v]: any) => {
            if (k.startsWith('dem-') || k.startsWith('dept') || k.toLowerCase().includes('department') || k.toLowerCase().includes('team')) {
              if (!v) return;
              demCounts[String(v)] = (demCounts[String(v)] || 0) + 1;
            }
          });
        }
      });
      const demEntries = Object.entries(demCounts);
      if (demEntries.length > 0) {
        demEntries.sort((a, b) => b[1] - a[1]);
        const [group, count] = demEntries[0];
        const topDemographic = { group, count, pct: totalRespondents > 0 ? Math.round((count / totalRespondents) * 100) : 0 };
        Object.keys(modules).forEach((modKey) => {
          modules[modKey].summaryMetrics = modules[modKey].summaryMetrics || {};
          modules[modKey].summaryMetrics.topDemographic = topDemographic;
        });
      }
    } catch (err2) {
      console.warn('Failed to compute fallback median/topDemographic', err2);
    }

    return res.json({ ok: true, aggregates: modules });
  }
  catch (err: any) {
    console.error('GET /api/aggregates error', err);
    return res.status(500).json({ error: err.message || 'internal server error' });
  }
});

// Simple health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await connectMongo();
  // Ensure indexes for performance on materialized aggregates and responses
  try {
    if (!useInMemoryDb && db && typeof db.collection === 'function') {
      const aggColl = db.collection('aggregates');
      if (aggColl && typeof aggColl.createIndex === 'function') {
        await aggColl.createIndex({ companyId: 1, surveyId: 1 });
      }
      const respColl = db.collection('responses');
      if (respColl && typeof respColl.createIndex === 'function') {
        await respColl.createIndex({ companyId: 1, surveyId: 1, createdAt: -1 });
      }
      console.log('Ensured DB indexes for aggregates and responses');
    } else {
      console.log('Skipping DB index creation: using in-memory fallback');
    }
  } catch (idxErr) {
    console.warn('Failed to ensure DB indexes:', idxErr);
  }
  // Kafka disabled — no producer/consumer will be started in this build
  if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => console.log(`SSE + Mongo server listening on ${PORT}`));
  }
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

// graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  try { await mongoClient?.close(); } catch (e) {}
  server.close(() => process.exit(0));
});

export { app, server };