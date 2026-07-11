// Elementary Symphony — Progress & Storage Engine v2.0
// Handles: login, progress tracking, hint logging, mastery stars, localStorage persistence

const PROGRESS = {

  // ── LOGIN ────────────────────────────────────────────────────────
  login(schoolCode, studentId) {
    const key = `es_${schoolCode}_${studentId}`;
    let data = this._load(key);
    if (!data) {
      data = {
        schoolCode, studentId, key,
        createdAt: Date.now(),
        currentUnit: 1,
        currentSession: 1,
        units: {}
      };
      // initialise all 5 units
      VOCAB_DATA.units.forEach(u => {
        data.units[u.id] = {
          unlocked: u.id === 1,
          sessionsDone: 0,
          quizScore: null,
          words: {}
        };
        u.words.forEach(w => {
          data.units[u.id].words[w.word] = {
            stars: 0,           // 0-3
            hintTier: 0,        // highest tier used (0=none)
            attempts: 0,
            correct: 0,
            lastSeen: null
          };
        });
      });
      this._save(key, data);
    }
    this._current = data;
    return data;
  },

  // ── GETTERS ──────────────────────────────────────────────────────
  get current() { return this._current || null; },

  getUnitProgress(unitId) {
    if (!this._current) return null;
    return this._current.units[unitId];
  },

  getWordData(unitId, word) {
    const u = this.getUnitProgress(unitId);
    return u ? u.words[word] : null;
  },

  getTotalStars() {
    if (!this._current) return 0;
    let total = 0;
    Object.values(this._current.units).forEach(u => {
      Object.values(u.words).forEach(w => { total += w.stars; });
    });
    return total;
  },

  getUnitStars(unitId) {
    const u = this.getUnitProgress(unitId);
    if (!u) return 0;
    return Object.values(u.words).reduce((sum, w) => sum + w.stars, 0);
  },

  // ── RECORD ATTEMPT ───────────────────────────────────────────────
  recordAttempt(unitId, word, correct, hintTierUsed = 0) {
    const w = this.getWordData(unitId, word);
    if (!w) return;
    w.attempts++;
    w.lastSeen = Date.now();
    if (hintTierUsed > w.hintTier) w.hintTier = hintTierUsed;
    if (correct) {
      w.correct++;
      // star logic: no hint = +1 star (max 3); hint used = keep current or +1 if below 1
      if (hintTierUsed === 0 && w.stars < 3) w.stars++;
      else if (hintTierUsed === 1 && w.stars < 2) w.stars++;
      else if (w.stars < 1) w.stars = 1;
    }
    this._saveCurrentUser();
    return w;
  },

  // ── UNIT QUIZ SCORE ──────────────────────────────────────────────
  saveQuizScore(unitId, score) {
    const u = this.getUnitProgress(unitId);
    if (!u) return;
    u.quizScore = score;
    u.sessionsDone = 5;
    // unlock next unit
    if (unitId < 5) {
      const next = this._current.units[unitId + 1];
      if (next) next.unlocked = true;
    }
    this._current.currentUnit = Math.min(unitId + 1, 5);
    this._saveCurrentUser();
  },

  // ── STORAGE ──────────────────────────────────────────────────────
  _save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) { console.warn('Storage error', e); }
  },

  _load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  },

  _saveCurrentUser() {
    if (this._current) this._save(this._current.key, this._current);
  },

  // ── REPORT ───────────────────────────────────────────────────────
  generateReport(unitId) {
    const u = this.getUnitProgress(unitId);
    if (!u) return null;
    const unitData = VOCAB_DATA.units.find(x => x.id === unitId);
    return {
      unitId, theme: unitData.theme,
      quizScore: u.quizScore,
      totalStars: this.getUnitStars(unitId),
      maxStars: unitData.words.length * 3,
      words: unitData.words.map(w => ({
        word: w.word,
        ...u.words[w.word]
      }))
    };
  },

  // ── GAME STATE (Resume Facility) ─────────────────────────────────
  saveGameState(unitId, round, wordIndex, score, xp) {
    if (!this._current) return;
    if (!this._current.gameState) this._current.gameState = {};
    this._current.gameState[unitId] = {
      round, wordIndex, score, xp, savedAt: Date.now()
    };
    this._saveCurrentUser();
  },

  getGameState(unitId) {
    if (!this._current || !this._current.gameState) return null;
    const gs = this._current.gameState[unitId];
    if (!gs || gs.round < 1) return null;
    const age = Date.now() - (gs.savedAt || 0);
    if (age > 7 * 24 * 60 * 60 * 1000) return null; // expire after 7 days
    return gs;
  },

  clearGameState(unitId) {
    if (!this._current || !this._current.gameState) return;
    delete this._current.gameState[unitId];
    this._saveCurrentUser();
  },

  // ── LOGOUT ────────────────────────────────────────────────────────
  logout() { this._current = null; }
};