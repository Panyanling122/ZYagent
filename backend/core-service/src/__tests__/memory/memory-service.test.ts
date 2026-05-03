/**
 * Memory Service Unit Tests
 * Tests L1 temporary window, L2 daily summary, L3 knowledge base
 * Uses jest.mock to simulate Database dependency
 */

// Mock Database
jest.mock('../../db', () => ({
  Database: {
    getInstance: jest.fn(),
  },
  pool: {
    query: jest.fn(),
  },
}));

import { Database, pool } from '../../db';

// ---- Types ----
interface Message {
  id: string;
  soulId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface L2Summary {
  id: string;
  soulId: string;
  date: string;
  summary: string;
  topics: string[];
  createdAt: number;
}

interface L3Knowledge {
  id: string;
  soulId: string;
  topic: string;
  content: string;
  confidence: number;
  updatedAt: number;
}

// ---- MemoryService Implementation ----
class MemoryService {
  private l1Window: Map<string, Message[]> = new Map();
  private l1TimeoutMs: number;
  private l1Timestamps: Map<string, number> = new Map();
  private db: typeof pool;

  constructor(l1TimeoutMs: number = 5 * 60 * 1000) {
    this.l1TimeoutMs = l1TimeoutMs;
    this.db = pool;
  }

  // L1: Temporary Window
  async addL1Message(soulId: string, message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    const entry: Message = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    const window = this.l1Window.get(soulId) || [];
    window.push(entry);
    this.l1Window.set(soulId, window);
    this.l1Timestamps.set(soulId, Date.now());

    // Persist to L1 table for recovery
    await this.db.query(
      'INSERT INTO l1_messages (id, soul_id, role, content, timestamp, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [entry.id, soulId, entry.role, entry.content, entry.timestamp, JSON.stringify(entry.metadata || {})]
    );

    return entry;
  }

  async getL1Window(soulId: string): Promise<Message[]> {
    // Check if window expired
    const lastAccess = this.l1Timestamps.get(soulId);
    if (lastAccess && Date.now() - lastAccess > this.l1TimeoutMs) {
      this.l1Window.delete(soulId);
      this.l1Timestamps.delete(soulId);
      return [];
    }

    return this.l1Window.get(soulId) || [];
  }

  isL1Expired(soulId: string): boolean {
    const lastAccess = this.l1Timestamps.get(soulId);
    if (!lastAccess) return true;
    return Date.now() - lastAccess > this.l1TimeoutMs;
  }

  clearL1Window(soulId: string): void {
    this.l1Window.delete(soulId);
    this.l1Timestamps.delete(soulId);
  }

  // L2: Daily Summary
  async createL2Summary(soulId: string, summary: string, topics: string[]): Promise<L2Summary> {
    const date = new Date().toISOString().split('T')[0];
    const entry: L2Summary = {
      id: this.generateId(),
      soulId,
      date,
      summary,
      topics,
      createdAt: Date.now(),
    };

    await this.db.query(
      'INSERT INTO l2_summaries (id, soul_id, date, summary, topics, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [entry.id, soulId, date, summary, topics, entry.createdAt]
    );

    return entry;
  }

  async getL2Summaries(soulId: string, limit: number = 30): Promise<L2Summary[]> {
    const result = await this.db.query(
      'SELECT * FROM l2_summaries WHERE soul_id = $1 ORDER BY date DESC LIMIT $2',
      [soulId, limit]
    );
    return result.rows || [];
  }

  async getL2SummaryByDate(soulId: string, date: string): Promise<L2Summary | null> {
    const result = await this.db.query(
      'SELECT * FROM l2_summaries WHERE soul_id = $1 AND date = $2 LIMIT 1',
      [soulId, date]
    );
    return result.rows?.[0] || null;
  }

  // L3: Knowledge Base
  async updateL3Knowledge(soulId: string, topic: string, content: string, confidence: number = 1.0): Promise<L3Knowledge> {
    const existing = await this.db.query(
      'SELECT id FROM l3_knowledge WHERE soul_id = $1 AND topic = $2 LIMIT 1',
      [soulId, topic]
    );

    const now = Date.now();
    if (existing.rows?.length > 0) {
      // Merge: update existing
      await this.db.query(
        'UPDATE l3_knowledge SET content = $1, confidence = $2, updated_at = $3 WHERE soul_id = $4 AND topic = $5',
        [content, confidence, now, soulId, topic]
      );
      return {
        id: existing.rows[0].id,
        soulId,
        topic,
        content,
        confidence,
        updatedAt: now,
      };
    } else {
      const id = this.generateId();
      await this.db.query(
        'INSERT INTO l3_knowledge (id, soul_id, topic, content, confidence, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, soulId, topic, content, confidence, now]
      );
      return { id, soulId, topic, content, confidence, updatedAt: now };
    }
  }

  async getL3Knowledge(soulId: string, topic?: string): Promise<L3Knowledge[]> {
    if (topic) {
      const result = await this.db.query(
        'SELECT * FROM l3_knowledge WHERE soul_id = $1 AND topic = $2 ORDER BY confidence DESC',
        [soulId, topic]
      );
      return result.rows || [];
    }
    const result = await this.db.query(
      'SELECT * FROM l3_knowledge WHERE soul_id = $1 ORDER BY updated_at DESC',
      [soulId]
    );
    return result.rows || [];
  }

  async mergeL3Knowledge(soulId: string, newEntries: Array<{ topic: string; content: string; confidence: number }>): Promise<number> {
    let merged = 0;
    for (const entry of newEntries) {
      await this.updateL3Knowledge(soulId, entry.topic, entry.content, entry.confidence);
      merged++;
    }
    return merged;
  }

  // Topic extraction
  extractTopics(text: string): string[] {
    const topics: string[] = [];

    // Extract key entities using regex patterns
    // 1. Quoted phrases
    const quoted = text.match(/"([^"]{3,50})"/g);
    if (quoted) {
      topics.push(...quoted.map(q => q.replace(/"/g, '')));
    }

    // 2. Capitalized phrases (potential proper nouns)
    const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (capitalized) {
      topics.push(...capitalized);
    }

    // 3. Technical terms
    const techTerms = text.match(/\b(?:API|JSON|HTTP|REST|GraphQL|database|server|client|function|class|method)\b/gi);
    if (techTerms) {
      topics.push(...techTerms.map(t => t.toLowerCase()));
    }

    // Deduplicate and filter
    return [...new Set(topics)].filter(t => t.length >= 2).slice(0, 10);
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    memoryService = new MemoryService(5 * 60 * 1000); // 5 min timeout
    mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== L1 Tests ====================
  describe('L1 Temporary Window', () => {
    it('should add message to L1 window', async () => {
      const message = await memoryService.addL1Message('soul-1', {
        soulId: 'soul-1',
        role: 'user',
        content: 'Hello there',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello there');
      expect(message.timestamp).toBeGreaterThan(0);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should retrieve L1 window messages', async () => {
      await memoryService.addL1Message('soul-1', { soulId: 'soul-1', role: 'user', content: 'Msg 1' });
      await memoryService.addL1Message('soul-1', { soulId: 'soul-1', role: 'assistant', content: 'Reply 1' });

      const window = await memoryService.getL1Window('soul-1');

      expect(window).toHaveLength(2);
      expect(window[0].content).toBe('Msg 1');
      expect(window[1].role).toBe('assistant');
    });

    it('should return empty array for unknown soul', async () => {
      const window = await memoryService.getL1Window('unknown-soul');
      expect(window).toEqual([]);
    });

    it('should expire L1 window after timeout', async () => {
      const shortService = new MemoryService(100); // 100ms timeout
      await shortService.addL1Message('soul-x', { soulId: 'soul-x', role: 'user', content: 'test' });

      // Wait for expiration
      await new Promise(r => setTimeout(r, 150));

      const window = await shortService.getL1Window('soul-x');
      expect(window).toEqual([]);
    });

    it('should detect expired L1 window', async () => {
      const shortService = new MemoryService(1); // 1ms timeout
      await shortService.addL1Message('soul-y', { soulId: 'soul-y', role: 'user', content: 'test' });

      await new Promise(r => setTimeout(r, 10));

      expect(shortService.isL1Expired('soul-y')).toBe(true);
    });

    it('should detect non-expired L1 window', async () => {
      await memoryService.addL1Message('soul-z', { soulId: 'soul-z', role: 'user', content: 'test' });
      expect(memoryService.isL1Expired('soul-z')).toBe(false);
    });

    it('should clear L1 window on demand', async () => {
      await memoryService.addL1Message('soul-c', { soulId: 'soul-c', role: 'user', content: 'test' });
      memoryService.clearL1Window('soul-c');

      const window = await memoryService.getL1Window('soul-c');
      expect(window).toEqual([]);
    });

    it('should persist L1 message to database', async () => {
      await memoryService.addL1Message('soul-1', {
        soulId: 'soul-1',
        role: 'user',
        content: 'Persist me',
        metadata: { source: 'wechat' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO l1_messages'),
        expect.arrayContaining([
          expect.any(String),
          'soul-1',
          'user',
          'Persist me',
          expect.any(Number),
          expect.any(String),
        ])
      );
    });

    it('should maintain separate windows per soul', async () => {
      await memoryService.addL1Message('soul-a', { soulId: 'soul-a', role: 'user', content: 'A' });
      await memoryService.addL1Message('soul-b', { soulId: 'soul-b', role: 'user', content: 'B' });

      const windowA = await memoryService.getL1Window('soul-a');
      const windowB = await memoryService.getL1Window('soul-b');

      expect(windowA).toHaveLength(1);
      expect(windowB).toHaveLength(1);
      expect(windowA[0].content).toBe('A');
      expect(windowB[0].content).toBe('B');
    });
  });

  // ==================== L2 Tests ====================
  describe('L2 Daily Summary', () => {
    it('should create L2 summary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const summary = await memoryService.createL2Summary('soul-1', 'User asked about APIs', ['API', 'REST']);

      expect(summary.id).toBeDefined();
      expect(summary.soulId).toBe('soul-1');
      expect(summary.summary).toBe('User asked about APIs');
      expect(summary.topics).toEqual(['API', 'REST']);
      expect(summary.date).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should persist L2 summary to database', async () => {
      await memoryService.createL2Summary('soul-1', 'Summary text', ['topic1']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO l2_summaries'),
        expect.arrayContaining([
          expect.any(String),
          'soul-1',
          expect.any(String),
          'Summary text',
          ['topic1'],
          expect.any(Number),
        ])
      );
    });

    it('should retrieve L2 summaries with limit', async () => {
      const mockSummaries = [
        { id: 's1', soul_id: 'soul-1', date: '2026-04-01', summary: 'Day 1' },
        { id: 's2', soul_id: 'soul-1', date: '2026-04-02', summary: 'Day 2' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockSummaries, rowCount: 2 });

      const summaries = await memoryService.getL2Summaries('soul-1', 30);

      expect(summaries).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC LIMIT'),
        ['soul-1', 30]
      );
    });

    it('should get L2 summary by specific date', async () => {
      const mockSummary = { id: 's1', soul_id: 'soul-1', date: '2026-04-01', summary: 'Day summary' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSummary], rowCount: 1 });

      const summary = await memoryService.getL2SummaryByDate('soul-1', '2026-04-01');

      expect(summary).toEqual(mockSummary);
    });

    it('should return null when date not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const summary = await memoryService.getL2SummaryByDate('soul-1', '2025-01-01');

      expect(summary).toBeNull();
    });
  });

  // ==================== L3 Tests ====================
  describe('L3 Knowledge Base', () => {
    it('should create new L3 knowledge entry', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT existing
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT

      const knowledge = await memoryService.updateL3Knowledge('soul-1', 'API Design', 'REST is stateless', 0.95);

      expect(knowledge.topic).toBe('API Design');
      expect(knowledge.content).toBe('REST is stateless');
      expect(knowledge.confidence).toBe(0.95);
    });

    it('should update existing L3 knowledge entry', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'k1' }], rowCount: 1 }) // SELECT existing
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE

      const knowledge = await memoryService.updateL3Knowledge('soul-1', 'API Design', 'Updated content', 0.98);

      expect(knowledge.id).toBe('k1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE l3_knowledge'),
        expect.arrayContaining([
          'Updated content',
          0.98,
          expect.any(Number),
          'soul-1',
          'API Design',
        ])
      );
    });

    it('should retrieve L3 knowledge for soul', async () => {
      const mockKnowledge = [
        { id: 'k1', soul_id: 'soul-1', topic: 'API', content: 'REST', confidence: 0.9 },
        { id: 'k2', soul_id: 'soul-1', topic: 'DB', content: 'SQL', confidence: 0.85 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockKnowledge, rowCount: 2 });

      const knowledge = await memoryService.getL3Knowledge('soul-1');

      expect(knowledge).toHaveLength(2);
    });

    it('should retrieve L3 knowledge by topic', async () => {
      const mockKnowledge = [{ id: 'k1', soul_id: 'soul-1', topic: 'API', content: 'REST', confidence: 0.9 }];
      mockQuery.mockResolvedValueOnce({ rows: mockKnowledge, rowCount: 1 });

      const knowledge = await memoryService.getL3Knowledge('soul-1', 'API');

      expect(knowledge).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND topic ='),
        ['soul-1', 'API']
      );
    });

    it('should merge multiple L3 knowledge entries', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const entries = [
        { topic: 'Topic A', content: 'Content A', confidence: 0.8 },
        { topic: 'Topic B', content: 'Content B', confidence: 0.9 },
      ];

      const merged = await memoryService.mergeL3Knowledge('soul-1', entries);

      expect(merged).toBe(2);
    });

    it('should use default confidence of 1.0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const knowledge = await memoryService.updateL3Knowledge('soul-1', 'Topic', 'Content');

      expect(knowledge.confidence).toBe(1.0);
    });
  });

  // ==================== Topic Extraction ====================
  describe('extractTopics', () => {
    it('should extract quoted phrases', () => {
      const text = 'The concept of "machine learning" is important in "artificial intelligence".';
      const topics = memoryService.extractTopics(text);

      expect(topics).toContain('machine learning');
      expect(topics).toContain('artificial intelligence');
    });

    it('should extract capitalized words', () => {
      const text = 'OpenAI released GPT-4 and Claude is from Anthropic.';
      const topics = memoryService.extractTopics(text);

      expect(topics.length).toBeGreaterThan(0);
    });

    it('should extract technical terms', () => {
      const text = 'We need to design the API and database for the REST server.';
      const topics = memoryService.extractTopics(text);

      expect(topics.some(t => t.toLowerCase().includes('api'))).toBe(true);
      expect(topics.some(t => t.toLowerCase().includes('database'))).toBe(true);
    });

    it('should deduplicate topics', () => {
      const text = 'API design is hard. API design requires thought.';
      const topics = memoryService.extractTopics(text);

      // Check no duplicates
      const uniqueTopics = [...new Set(topics)];
      expect(topics.length).toBe(uniqueTopics.length);
    });

    it('should handle empty string', () => {
      const topics = memoryService.extractTopics('');
      expect(topics).toEqual([]);
    });

    it('should limit to 10 topics', () => {
      const text = '"topic1" "topic2" "topic3" "topic4" "topic5" "topic6" "topic7" "topic8" "topic9" "topic10" "topic11" "topic12"';
      const topics = memoryService.extractTopics(text);

      expect(topics.length).toBeLessThanOrEqual(10);
    });
  });
});
