import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';

const colors = {
  bg: '#FAFAF8',
  primary: '#1A1A1A',
  text: '#1A1A1A',
  muted: 'rgba(0,0,0,0.4)',
  light: 'rgba(0,0,0,0.08)',
};

const fontDisplay = "'Playfair Display', Georgia, serif";
const fontBody = "'DM Sans', Helvetica, Arial, sans-serif";

function avatarColor(username: string): string {
  const colors = ['#6B1E2E', '#1E4D6B', '#2E6B1E', '#6B4F1E', '#4B1E6B', '#1E6B5B', '#6B1E4F'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: '16px',
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: '#FFFFFF',
  color: '#3D2B1F',
  fontFamily: fontBody,
  boxSizing: 'border-box',
  borderRadius: '4px',
  marginBottom: '12px',
  outline: 'none',
  WebkitAppearance: 'none',
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '18px 16px',
  backgroundColor: colors.primary,
  color: colors.bg,
  fontSize: '16px',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  fontFamily: fontBody,
  borderRadius: '4px',
  marginBottom: '12px',
  WebkitTapHighlightColor: 'transparent',
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  backgroundColor: 'transparent',
  color: colors.primary,
  border: `2px solid ${colors.primary}`,
};

const bots = [
  { name: 'Walter Tell', level: 1, accuracy: 0.3, emoji: '🏹' },
  { name: 'Winkelried', level: 2, accuracy: 0.55, emoji: '⚔️' },
  { name: 'General Guisan', level: 3, accuracy: 0.8, emoji: '🎖️' },
];

/** Kurzname für UI (z. B. „Tell“, „Winkelried“, „Guisan“); ein Wort = ganzer Name. */
function shortBotDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Gegner';
  return parts.slice(1).join(' ');
}

/** Gleiches Balken-Icon wie im unteren Tab „Statistik“. */
function TabStatsIcon({ size = 48, stroke = colors.primary }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="12" width="4" height="8" />
      <rect x="10" y="8" width="4" height="12" />
      <rect x="17" y="4" width="4" height="16" />
    </svg>
  );
}

const QUESTIONS_PER_ROUND = 3;
const TOTAL_ROUNDS = 4;
const QUESTION_TIME_SECONDS = 21;

function getBotAnswer(optionKeys: string[], correctAnswer: string, accuracy: number): string {
  if (Math.random() < accuracy) return correctAnswer;
  const wrong = optionKeys.filter(o => o !== correctAnswer);
  return wrong[Math.floor(Math.random() * wrong.length)];
}

function shuffleOptions<T>(options: T[]): T[] {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Hilfsfunktion: Tiefste ungespielte Gruppe für einen oder zwei User
async function findBestGroup(subcategoryId: string, userIds: string[], excludeGroupIds: string[] = []): Promise<{ id: string; group_number: number } | null> {
  const { data: allGroups } = await supabase
    .from('question_groups')
    .select('id, group_number')
    .eq('subcategory_id', subcategoryId)
    .order('group_number', { ascending: true });

  if (!allGroups || allGroups.length === 0) return null;

  const availableGroups = allGroups.filter(g => !excludeGroupIds.includes(g.id));
  if (availableGroups.length === 0) return allGroups[0];

  const allGroupIds = availableGroups.map(g => g.id);
  const { data: playedData } = await supabase
    .from('played_groups')
    .select('group_id')
    .in('user_id', userIds)
    .in('group_id', allGroupIds);

  const playCount: Record<string, number> = {};
  availableGroups.forEach(g => { playCount[g.id] = 0; });
  playedData?.forEach(p => {
    playCount[p.group_id] = (playCount[p.group_id] || 0) + 1;
  });

  const minCount = Math.min(...availableGroups.map(g => playCount[g.id]));
  const candidate = availableGroups.find(g => playCount[g.id] === minCount);
  return candidate || availableGroups[0];
}

/** Wie User-Duelle: bis zu 4 Subkategorien (mit Gruppen, noch nicht in dieser Duell-Serie), priorisiert nach ungespielten Gruppen. */
async function buildDuelSubcategoryPickOptions(
  categoryId: string,
  playedSubcategoryIds: string[],
  userIdsForPlayedCheck: string[]
): Promise<{ pickOptions: any[]; allEligible: any[] }> {
  const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', categoryId);
  const subsWithCounts: any[] = [];

  for (const sub of subs || []) {
    if (playedSubcategoryIds.includes(sub.id)) continue;

    const { data: allGroups } = await supabase.from('question_groups').select('id').eq('subcategory_id', sub.id);
    if (!allGroups || allGroups.length === 0) continue;

    const groupIds = allGroups.map(g => g.id);
    const { data: userPlayed } = await supabase
      .from('played_groups')
      .select('group_id')
      .in('user_id', userIdsForPlayedCheck)
      .in('group_id', groupIds);
    const playedGroupIds = new Set(userPlayed?.map(p => p.group_id) || []);
    const unplayedCount = allGroups.filter(g => !playedGroupIds.has(g.id)).length;

    const { count: questionCount } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('subcategory_id', sub.id);

    subsWithCounts.push({
      ...sub,
      question_count: questionCount || 0,
      unplayed_groups: unplayedCount,
      has_unplayed: unplayedCount > 0,
    });
  }

  subsWithCounts.sort((a, b) => {
    if (a.has_unplayed && !b.has_unplayed) return -1;
    if (!a.has_unplayed && b.has_unplayed) return 1;
    return 0;
  });

  const selected = subsWithCounts.slice(0, 4);
  const pickOptions = selected.length > 0 ? selected : subsWithCounts.slice(0, Math.min(3, subsWithCounts.length));
  return { pickOptions, allEligible: subsWithCounts };
}

interface CSVQuestion {
  question_text: string;
  type: 'multiple_choice' | 'true_false';
  correct_answer: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  difficulty: number;
  category_name: string;
  subcategory_name: string;
  book_title: string;
}

function parseCSV(text: string): CSVQuestion[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const questions: CSVQuestion[] = [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const q: any = {};
    headers.forEach((header, idx) => {
      q[header] = values[idx] || '';
    });
    q.difficulty = parseInt(q.difficulty) || 1;
    questions.push(q as CSVQuestion);
  }
  return questions;
}


function AddBook() {
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      supabase.from('subcategories').select('*').eq('category_id', selectedCategory).order('name').then(({ data }) => {
        setSubcategories(data || []);
        setSelectedSubcategory('');
      });
    } else {
      setSubcategories([]);
      setSelectedSubcategory('');
    }
  }, [selectedCategory]);

  const handleSave = async () => {
    if (!title.trim() || !selectedSubcategory) {
      setMessage({ type: 'error', text: 'Titel und Subkategorie sind pflicht' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from('books').insert({
      title: title.trim(),
      author: author.trim() || null,
      year: year ? parseInt(year) : null,
      category_id: selectedCategory,
      subcategory_id: selectedSubcategory,
    });
    if (error) {
      setMessage({ type: 'error', text: `❌ Fehler: ${error.message}` });
    } else {
      setMessage({ type: 'success', text: `✅ Buch "${title}" hinzugefügt` });
      setTitle('');
      setAuthor('');
      setYear('');
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Kategorie</label>
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }}>
          <option value="">— Kategorie wählen —</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Subkategorie</label>
        <select value={selectedSubcategory} onChange={e => setSelectedSubcategory(e.target.value)} disabled={!selectedCategory} style={{ ...inputStyle, marginBottom: '16px', opacity: selectedCategory ? 1 : 0.5 }}>
          <option value="">— Subkategorie wählen —</option>
          {subcategories.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Titel *</label>
        <input style={inputStyle} placeholder="Buchtitel" value={title} onChange={e => setTitle(e.target.value)} />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Autor</label>
        <input style={inputStyle} placeholder="Autor (optional)" value={author} onChange={e => setAuthor(e.target.value)} />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Jahr</label>
        <input style={inputStyle} placeholder="Erscheinungsjahr (optional)" value={year} onChange={e => setYear(e.target.value)} type="number" />
      </div>

      <button style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }} onClick={handleSave} disabled={saving}>
        {saving ? 'Speichern...' : 'Buch speichern'}
      </button>

      {message && (
        <div style={{ backgroundColor: message.type === 'success' ? '#EAF4EF' : '#F7F2EB', border: `1px solid ${message.type === 'success' ? '#2D6A4F' : '#A68A64'}`, borderRadius: '8px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text }}>
          {message.text}
        </div>
      )}
    </div>
  );
}

// EXCEL EXPORT/IMPORT KOMPONENTE
const EXPORT_PAGE_SIZE = 1000;
const RATING_FETCH_CHUNK = 150;

type ExportScope = 'subcategory' | 'category' | 'all';

async function fetchPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < EXPORT_PAGE_SIZE) break;
    from += EXPORT_PAGE_SIZE;
  }
  return all;
}

async function fetchRatingsForQuestions(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const all: any[] = [];
  for (let i = 0; i < questionIds.length; i += RATING_FETCH_CHUNK) {
    const chunk = questionIds.slice(i, i + RATING_FETCH_CHUNK);
    const { data, error } = await supabase
      .from('question_ratings')
      .select(`
        question_id,
        rating,
        created_at,
        updated_at,
        rater:profiles!question_ratings_user_id_fkey ( username )
      `)
      .in('question_id', chunk);
    if (error) {
      const missingTable = error.code === 'PGRST205' || error.message?.includes('question_ratings');
      if (missingTable) return [];
      throw error;
    }
    all.push(...(data || []));
  }
  return all;
}

function questionExportMeta(q: any) {
  const sub = q.subcategories;
  return {
    category_name: sub?.categories?.name || '',
    subcategory_name: sub?.name || '',
  };
}

function answerSuccessPct(correct: number, wrong: number): string {
  const total = correct + wrong;
  if (total === 0) return '';
  return `${Math.round((correct / total) * 100)}`;
}

async function recordQuestionAnswer(questionId: string, isCorrect: boolean) {
  const { error } = await supabase.rpc('record_question_answer', {
    p_question_id: questionId,
    p_is_correct: isCorrect,
  });
  if (error) {
    const missing = error.code === 'PGRST202' || error.message?.includes('record_question_answer');
    if (!missing) console.warn('record_question_answer:', error.message);
  }
}

async function recordUserBookAnswer(bookId: string | undefined, isCorrect: boolean) {
  if (!bookId) return;
  const { error } = await supabase.rpc('record_user_book_answer', {
    p_book_id: bookId,
    p_is_correct: isCorrect,
  });
  if (error) {
    const missing = error.code === 'PGRST202' || error.message?.includes('record_user_book_answer');
    if (!missing) console.warn('record_user_book_answer:', error.message);
  }
}

type UserBookAgg = { correct: number; wrong: number };

async function aggregateUserBookStatsFromDuels(userId: string): Promise<Map<string, UserBookAgg>> {
  const bookMap = new Map<string, UserBookAgg>();
  const groupCache = new Map<string, { book_id: string }[]>();

  const duels = await fetchPaginated<any>(async (from, to) =>
    supabase
      .from('duels')
      .select('rounds_data, challenger_id')
      .eq('status', 'completed')
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .range(from, to),
  );

  const addAnswers = (members: { book_id: string }[], answers: boolean[] | undefined) => {
    if (!answers?.length) return;
    answers.forEach((isCorrect, i) => {
      const bookId = members[i]?.book_id;
      if (!bookId) return;
      const entry = bookMap.get(bookId) || { correct: 0, wrong: 0 };
      if (isCorrect) entry.correct += 1;
      else entry.wrong += 1;
      bookMap.set(bookId, entry);
    });
  };

  for (const duel of duels) {
    const isChallenger = duel.challenger_id === userId;
    for (const round of duel.rounds_data || []) {
      if (!round?.group_id) continue;
      let members = groupCache.get(round.group_id);
      if (!members) {
        const { data: groupMembers, error } = await supabase
          .from('question_group_members')
          .select('position, questions ( book_id )')
          .eq('group_id', round.group_id)
          .order('position', { ascending: true });
        if (error) throw error;
        members = (groupMembers || [])
          .map(m => ({ book_id: (m.questions as any)?.book_id }))
          .filter((m): m is { book_id: string } => !!m.book_id);
        groupCache.set(round.group_id, members);
      }
      addAnswers(members, isChallenger ? round.challenger_answers : round.opponent_answers);
    }
  }

  return bookMap;
}

async function loadUserBookRecommendations(userId: string) {
  const merged = new Map<string, UserBookAgg>();

  const { data: dbRows, error: dbError } = await supabase
    .from('user_book_answer_stats')
    .select('book_id, correct_count, wrong_count')
    .eq('user_id', userId);

  const tableMissing = dbError?.code === 'PGRST205' || dbError?.message?.includes('user_book_answer_stats');

  if (!tableMissing && !dbError && dbRows?.length) {
    dbRows.forEach(r => merged.set(r.book_id, { correct: r.correct_count, wrong: r.wrong_count }));
  } else if (!tableMissing && !dbError && (dbRows?.length ?? 0) === 0) {
    const fromDuels = await aggregateUserBookStatsFromDuels(userId);
    if (fromDuels.size > 0) {
      const payload = Array.from(fromDuels.entries()).map(([book_id, s]) => ({
        user_id: userId,
        book_id,
        correct_count: s.correct,
        wrong_count: s.wrong,
        updated_at: new Date().toISOString(),
      }));
      const UPSERT_CHUNK = 100;
      for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
        await supabase.from('user_book_answer_stats').upsert(payload.slice(i, i + UPSERT_CHUNK));
      }
      fromDuels.forEach((v, id) => merged.set(id, v));
    }
  } else if (tableMissing) {
    const fromDuels = await aggregateUserBookStatsFromDuels(userId);
    fromDuels.forEach((v, id) => merged.set(id, v));
  }

  if (merged.size === 0) return [];

  const bookIds = Array.from(merged.keys());
  const { data: bookRows } = await supabase.from('books').select('id, title, author').in('id', bookIds);
  const bookMeta = new Map((bookRows || []).map(b => [b.id, b]));

  return Array.from(merged.entries())
    .map(([bookId, s]) => {
      const total = s.correct + s.wrong;
      const wrongPct = total > 0 ? Math.round((s.wrong / total) * 100) : 0;
      const meta = bookMeta.get(bookId);
      return {
        bookId,
        title: meta?.title || 'Unbekanntes Buch',
        author: meta?.author || '',
        correct: s.correct,
        wrong: s.wrong,
        total,
        wrongPct,
      };
    })
    .filter(b => b.total > 0)
    .sort((a, b) => b.wrongPct - a.wrongPct || b.total - a.total);
}

async function fetchAnswerStatsForQuestions(questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, { correct_count: number; wrong_count: number }>();
  const map = new Map<string, { correct_count: number; wrong_count: number }>();
  for (let i = 0; i < questionIds.length; i += RATING_FETCH_CHUNK) {
    const chunk = questionIds.slice(i, i + RATING_FETCH_CHUNK);
    const { data, error } = await supabase
      .from('question_answer_stats')
      .select('question_id, correct_count, wrong_count')
      .in('question_id', chunk);
    if (error) {
      const missingTable = error.code === 'PGRST205' || error.message?.includes('question_answer_stats');
      if (missingTable) return map;
      throw error;
    }
    data?.forEach(row => map.set(row.question_id, row));
  }
  return map;
}


function normalizeImportName(name: unknown): string {
  return String(name ?? '').trim().toLowerCase();
}

function buildSubcategoryLookup(subcategories: { id: string; name: string; category_id: string }[]) {
  const subByCatAndName = new Map<string, { id: string; category_id: string }>();
  subcategories.forEach(s => {
    subByCatAndName.set(`${s.category_id}|${normalizeImportName(s.name)}`, s);
  });
  return subByCatAndName;
}

function resolveQuestionTargets(
  row: any,
  scope: ExportScope,
  selectedCategory: string,
  selectedSubcategory: string,
  categoriesByName: Map<string, string>,
  subByCatAndName: Map<string, { id: string; category_id: string }>,
): { category_id: string; subcategory_id: string } | { error: string } {
  if (scope === 'subcategory') {
    if (!selectedCategory || !selectedSubcategory) {
      return { error: 'Kategorie/Subkategorie nicht gewählt' };
    }
    return { category_id: selectedCategory, subcategory_id: selectedSubcategory };
  }
  if (scope === 'category') {
    const subName = normalizeImportName(row.subcategory_name);
    if (!subName) return { error: 'subcategory_name fehlt' };
    const sub = subByCatAndName.get(`${selectedCategory}|${subName}`);
    if (!sub) return { error: `Subkategorie "${row.subcategory_name}" nicht gefunden` };
    return { category_id: selectedCategory, subcategory_id: sub.id };
  }
  const catName = normalizeImportName(row.category_name);
  const subName = normalizeImportName(row.subcategory_name);
  if (!catName) return { error: 'category_name fehlt' };
  if (!subName) return { error: 'subcategory_name fehlt' };
  const categoryId = categoriesByName.get(catName);
  if (!categoryId) return { error: `Kategorie "${row.category_name}" nicht gefunden` };
  const sub = subByCatAndName.get(`${categoryId}|${subName}`);
  if (!sub) return { error: `Subkategorie "${row.subcategory_name}" nicht gefunden` };
  return { category_id: categoryId, subcategory_id: sub.id };
}

async function fetchIdsInChunks(table: 'books' | 'questions', ids: string[]): Promise<Set<string>> {
  const valid = new Set<string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += RATING_FETCH_CHUNK) {
    const chunk = unique.slice(i, i + RATING_FETCH_CHUNK);
    const { data, error } = await supabase.from(table).select('id').in('id', chunk);
    if (error) throw error;
    data?.forEach(row => valid.add(row.id));
  }
  return valid;
}

async function loadImportLookup(scope: ExportScope, selectedCategory: string) {
  const { data: allCategories, error: catError } = await supabase.from('categories').select('id, name');
  if (catError) throw catError;
  let subcategories: { id: string; name: string; category_id: string }[];
  if (scope === 'all') {
    subcategories = await fetchPaginated(async (from, to) =>
      supabase.from('subcategories').select('id, name, category_id').range(from, to),
    );
  } else {
    const { data, error } = await supabase
      .from('subcategories')
      .select('id, name, category_id')
      .eq('category_id', selectedCategory);
    if (error) throw error;
    subcategories = data || [];
  }
  return { categories: allCategories || [], subcategories };
}

function ExcelExportImport() {
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [scope, setScope] = useState<ExportScope>('subcategory');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      supabase.from('subcategories').select('*').eq('category_id', selectedCategory).order('name').then(({ data }) => {
        setSubcategories(data || []);
        setSelectedSubcategory('');
      });
    } else {
      setSubcategories([]);
      setSelectedSubcategory('');
    }
  }, [selectedCategory]);

  const canUseScope =
    scope === 'all' ||
    (scope === 'category' && !!selectedCategory) ||
    (scope === 'subcategory' && !!selectedSubcategory);

  const handleExport = async () => {
    if (!canUseScope) {
      setMessage({
        type: 'error',
        text: scope === 'subcategory'
          ? 'Bitte Subkategorie auswählen'
          : scope === 'category'
            ? 'Bitte Kategorie auswählen'
            : 'Export nicht möglich',
      });
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      const questionSelect = '*, books(title), subcategories(name, categories(name))';
      const questions = await fetchPaginated<any>(async (from, to) => {
        let query = supabase.from('questions').select(questionSelect);
        if (scope === 'subcategory') query = query.eq('subcategory_id', selectedSubcategory);
        else if (scope === 'category') query = query.eq('category_id', selectedCategory);
        return query.range(from, to);
      });

      if (questions.length === 0) {
        setMessage({ type: 'error', text: 'Keine Fragen für diesen Export gefunden' });
        setExporting(false);
        return;
      }

      const questionIds = questions.map(q => q.id);
      const [ratings, answerStats] = await Promise.all([
        fetchRatingsForQuestions(questionIds),
        fetchAnswerStatsForQuestions(questionIds),
      ]);
      const ratingsByQuestion = new Map<string, any[]>();
      ratings.forEach(r => {
        const list = ratingsByQuestion.get(r.question_id) || [];
        list.push(r);
        ratingsByQuestion.set(r.question_id, list);
      });

      const exportData = questions.map(q => {
        const qRatings = ratingsByQuestion.get(q.id) || [];
        const avg = qRatings.length
          ? (qRatings.reduce((sum, r) => sum + r.rating, 0) / qRatings.length).toFixed(2)
          : '';
        const meta = questionExportMeta(q);
        const stats = answerStats.get(q.id);
        const correct = stats?.correct_count ?? 0;
        const wrong = stats?.wrong_count ?? 0;
        return {
          category_name: meta.category_name,
          subcategory_name: meta.subcategory_name,
          question_id: q.id,
          book_id: q.book_id,
          book_title: q.books?.title || '',
          question_text: q.question_text,
          type: q.type,
          correct_answer: q.correct_answer,
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          difficulty: q.difficulty,
          rating_count: qRatings.length,
          rating_average: avg,
          answer_correct_count: correct,
          answer_wrong_count: wrong,
          answer_success_pct: answerSuccessPct(correct, wrong),
        };
      });

      const ratingsExport = ratings.map(r => {
        const q = questions.find(qx => qx.id === r.question_id);
        const meta = q ? questionExportMeta(q) : { category_name: '', subcategory_name: '' };
        return {
          question_id: r.question_id,
          category_name: meta.category_name,
          subcategory_name: meta.subcategory_name,
          question_text: q?.question_text || '',
          rater_username: r.rater?.username || '',
          rating: r.rating,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      const wsQuestions = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsQuestions, 'Fragen');
      if (ratingsExport.length > 0) {
        const wsRatings = XLSX.utils.json_to_sheet(ratingsExport);
        XLSX.utils.book_append_sheet(wb, wsRatings, 'Bewertungen');
      }

      const date = new Date().toISOString().split('T')[0];
      let fileName: string;
      if (scope === 'subcategory') {
        const subcatName = subcategories.find(s => s.id === selectedSubcategory)?.name || 'subkategorie';
        fileName = `${subcatName.replace(/\s+/g, '_')}_${date}.xlsx`;
      } else if (scope === 'category') {
        const catName = categories.find(c => c.id === selectedCategory)?.name || 'kategorie';
        fileName = `${catName.replace(/\s+/g, '_')}_alle_${date}.xlsx`;
      } else {
        fileName = `alle_fragen_${date}.xlsx`;
      }

      XLSX.writeFile(wb, fileName);
      const ratingsNote = ratings.length > 0
        ? `, ${ratings.length} Bewertung${ratings.length === 1 ? '' : 'en'}`
        : ratings.length === 0 && questionIds.length > 0
          ? ' (keine Bewertungen)'
          : '';
      setMessage({
        type: 'success',
        text: `✅ ${questions.length} Fragen exportiert${ratingsNote}: ${fileName}`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: `❌ Fehler: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canUseScope) {
      setMessage({
        type: 'error',
        text: scope === 'subcategory'
          ? 'Bitte Subkategorie auswählen'
          : scope === 'category'
            ? 'Bitte Kategorie auswählen'
            : 'Import nicht möglich',
      });
      e.target.value = '';
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames.includes('Fragen')
        ? 'Fragen'
        : workbook.SheetNames[0];
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      if (rows.length === 0) throw new Error('Excel-Datei ist leer (Blatt „Fragen“)');

      const { categories: lookupCategories, subcategories: lookupSubs } = await loadImportLookup(scope, selectedCategory);
      const categoriesByName = new Map(lookupCategories.map(c => [normalizeImportName(c.name), c.id]));
      const subByCatAndName = buildSubcategoryLookup(lookupSubs);

      const bookIds = Array.from(new Set(rows.map(r => r.book_id).filter(Boolean)));
      const validBookIds = bookIds.length > 0 ? await fetchIdsInChunks('books', bookIds) : new Set<string>();

      const questionIdsInExcel = rows.map(r => r.question_id).filter(Boolean);
      const validQuestionIds = questionIdsInExcel.length > 0
        ? await fetchIdsInChunks('questions', questionIdsInExcel)
        : new Set<string>();

      const toInsert: any[] = [];
      const toUpdate: any[] = [];
      const errors: string[] = [];

      rows.forEach((row, idx) => {
        if (!row.book_id || !validBookIds.has(row.book_id)) {
          errors.push(`Zeile ${idx + 2}: book_id "${row.book_id}" existiert nicht`);
          return;
        }
        if (!row.question_text) {
          errors.push(`Zeile ${idx + 2}: question_text fehlt`);
          return;
        }
        if (!row.correct_answer) {
          errors.push(`Zeile ${idx + 2}: correct_answer fehlt`);
          return;
        }
        const targets = resolveQuestionTargets(
          row,
          scope,
          selectedCategory,
          selectedSubcategory,
          categoriesByName,
          subByCatAndName,
        );
        if ('error' in targets) {
          errors.push(`Zeile ${idx + 2}: ${targets.error}`);
          return;
        }
        const questionData = {
          category_id: targets.category_id,
          subcategory_id: targets.subcategory_id,
          book_id: row.book_id,
          question_text: row.question_text,
          type: row.type || 'multiple_choice',
          correct_answer: String(row.correct_answer),
          option_a: row.option_a || null,
          option_b: row.option_b || null,
          option_c: row.option_c || null,
          option_d: row.option_d || null,
          difficulty: parseInt(row.difficulty, 10) || 2,
        };
        if (row.question_id && validQuestionIds.has(row.question_id)) {
          toUpdate.push({ id: row.question_id, ...questionData });
        } else if (row.question_id && !validQuestionIds.has(row.question_id)) {
          errors.push(`Zeile ${idx + 2}: question_id existiert nicht in DB`);
        } else {
          toInsert.push(questionData);
        }
      });

      let updateCount = 0;
      let insertCount = 0;

      for (const q of toUpdate) {
        const { id, ...updateData } = q;
        const { error } = await supabase.from('questions').update(updateData).eq('id', id);
        if (error) errors.push(`Update fehlgeschlagen für ID ${id}: ${error.message}`);
        else updateCount++;
      }

      const INSERT_CHUNK = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from('questions').insert(chunk);
        if (error) errors.push(`Insert fehlgeschlagen (Zeilen ${i + 1}–${i + chunk.length}): ${error.message}`);
        else insertCount += chunk.length;
      }

      let msg = '';
      if (updateCount > 0) msg += `✅ ${updateCount} Fragen aktualisiert\n`;
      if (insertCount > 0) msg += `✅ ${insertCount} neue Fragen hinzugefügt\n`;
      if (errors.length > 0) msg += `⚠️ ${errors.length} Fehler:\n${errors.slice(0, 8).join('\n')}`;
      if (errors.length > 8) msg += `\n… und ${errors.length - 8} weitere`;
      if (!msg) msg = 'Keine Änderungen';
      setMessage({ type: errors.length > 0 && updateCount === 0 && insertCount === 0 ? 'error' : 'success', text: msg });
    } catch (err: any) {
      setMessage({ type: 'error', text: `❌ Fehler: ${err.message}` });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
      <h3 style={{ fontSize: '18px', color: colors.text, marginBottom: '16px' }}>📊 Excel Export / Import</h3>
      <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '20px' }}>
        Export und Import: Subkategorie, ganze Kategorie oder alle Fragen. Bewertungen werden nur exportiert.
      </p>
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Umfang (Export & Import)</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as ExportScope)}
          style={{ ...inputStyle, marginBottom: '16px' }}
        >
          <option value="subcategory">Eine Subkategorie</option>
          <option value="category">Ganze Kategorie</option>
          <option value="all">Alle Fragen</option>
        </select>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Kategorie</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          disabled={scope === 'all'}
          style={{ ...inputStyle, marginBottom: '16px', opacity: scope === 'all' ? 0.5 : 1 }}
        >
          <option value="">— Kategorie wählen —</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Subkategorie</label>
        <select
          value={selectedSubcategory}
          onChange={(e) => setSelectedSubcategory(e.target.value)}
          disabled={scope !== 'subcategory' || !selectedCategory}
          style={{ ...inputStyle, marginBottom: '0', opacity: scope === 'subcategory' && selectedCategory ? 1 : 0.5 }}
        >
          <option value="">— Subkategorie wählen —</option>
          {subcategories.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexDirection: 'column', marginBottom: '20px' }}>
        <button style={{ ...btnPrimary, opacity: !canUseScope || exporting ? 0.5 : 1 }} onClick={handleExport} disabled={!canUseScope || exporting}>
          {exporting ? 'Exportiere...' : '📥 Excel exportieren'}
        </button>
        <label style={{ ...btnSecondary, display: 'block', textAlign: 'center', opacity: !canUseScope || importing ? 0.5 : 1, cursor: !canUseScope || importing ? 'not-allowed' : 'pointer' }}>
          {importing ? 'Importiere...' : '📤 Excel importieren'}
          <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={!canUseScope || importing} style={{ display: 'none' }} />
        </label>
      </div>
      {message && (
        <div style={{ backgroundColor: message.type === 'success' ? '#EAF4EF' : '#F7F2EB', border: `1px solid ${message.type === 'success' ? '#2D6A4F' : '#A68A64'}`, borderRadius: '8px', padding: '16px', fontSize: '14px', color: colors.text, whiteSpace: 'pre-line' }}>
          {message.text}
        </div>
      )}
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#FFF9E6', borderRadius: '8px', fontSize: '12px', color: colors.muted, lineHeight: '1.6' }}>
        <strong>💡 Hinweise:</strong><br />
        • Export enthält Blatt <strong>Fragen</strong> (Bewertungen + Antwort-Statistik: answer_correct_count, answer_wrong_count, answer_success_pct) und ggf. <strong>Bewertungen</strong><br />
        • Import liest das Blatt <strong>Fragen</strong> (wie beim Export)<br />
        • <strong>Subkategorie-Import:</strong> Kategorie + Subkategorie oben wählen<br />
        • <strong>Kategorie-Import:</strong> Kategorie wählen, pro Zeile <strong>subcategory_name</strong> nötig<br />
        • <strong>Alle Fragen:</strong> pro Zeile <strong>category_name</strong> und <strong>subcategory_name</strong> nötig<br />
        • <strong>question_id leer</strong> = neue Frage · <strong>question_id vorhanden</strong> = Update<br />
        • <strong>book_id</strong> muss eine UUID eines existierenden Buchs sein
      </div>
    </div>
  );
}


function AdminImport({ onBack }: { onBack: () => void }) {
  const [, setCsvText] = useState('');
  const [questions, setQuestions] = useState<CSVQuestion[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState('');
  const [grouping, setGrouping] = useState(false);
  const [groupResult, setGroupResult] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      try {
        const parsed = parseCSV(text);
        setQuestions(parsed);
        setResult('');
      } catch (err) {
        setResult('Fehler beim Parsen der CSV-Datei.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (questions.length === 0) return;
    setImporting(true);
    setResult('');

    try {
      const { data: categories } = await supabase.from('categories').select('id, name');
      const { data: subcategories } = await supabase.from('subcategories').select('id, name, category_id');
      const { data: books } = await supabase.from('books').select('id, title');

      const catMap = new Map(categories?.map(c => [c.name, c.id]) || []);
      const subMap = new Map(subcategories?.map(s => [s.name, s.id]) || []);
      const bookMap = new Map(books?.map(b => [b.title, b.id]) || []);

      const toInsert = questions.map(q => {
        const categoryId = catMap.get(q.category_name);
        const subcategoryId = subMap.get(q.subcategory_name);
        const bookId = bookMap.get(q.book_title);

        if (!categoryId || !subcategoryId || !bookId) {
          throw new Error(`Kategorie, Subkategorie oder Buch nicht gefunden für: ${q.question_text.substring(0, 50)}...`);
        }

        return {
          category_id: categoryId,
          subcategory_id: subcategoryId,
          book_id: bookId,
          question_text: q.question_text,
          type: q.type,
          correct_answer: q.correct_answer,
          option_a: q.option_a || null,
          option_b: q.option_b || null,
          option_c: q.option_c || null,
          option_d: q.option_d || null,
          difficulty: q.difficulty,
        };
      });

      const { error } = await supabase.from('questions').insert(toInsert);
      if (error) throw error;

      setResult(`✅ ${toInsert.length} Fragen erfolgreich importiert!`);
      setQuestions([]);
      setCsvText('');
    } catch (err: any) {
      setResult(`❌ Fehler: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCreateGroups = async () => {
    setGrouping(true);
    setGroupResult('');
    try {
      const { data: subs } = await supabase.from('subcategories').select('*');
      if (!subs) throw new Error('Keine Subkategorien gefunden');

      let totalGroupsCreated = 0;
      let subResults: string[] = [];

      for (const sub of subs) {
        const { data: questionsInSub } = await supabase
          .from('questions')
          .select('id')
          .eq('subcategory_id', sub.id);

          if (!questionsInSub || questionsInSub.length === 0) continue;

          const { data: existingGroups } = await supabase
            .from('question_groups')
            .select('id')
            .eq('subcategory_id', sub.id);
  
          if (existingGroups && existingGroups.length > 0) {
            const groupIds = existingGroups.map(g => g.id);
            await supabase.from('question_group_members').delete().in('group_id', groupIds);
            await supabase.from('question_groups').delete().in('id', groupIds);
          }
  
          const allQuestions = [...questionsInSub];
          for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
          }
          if (allQuestions.length < 3) continue;
  
          let nextGroupNumber = 1;
        let createdForThisSub = 0;

        for (let i = 0; i + 2 < allQuestions.length; i += 3) {
          const { data: newGroup, error: groupError } = await supabase
            .from('question_groups')
            .insert({ subcategory_id: sub.id, group_number: nextGroupNumber })
            .select()
            .single();

          if (groupError || !newGroup) throw groupError;

          const members = [
            { group_id: newGroup.id, question_id: allQuestions[i].id, position: 1 },
            { group_id: newGroup.id, question_id: allQuestions[i + 1].id, position: 2 },
            { group_id: newGroup.id, question_id: allQuestions[i + 2].id, position: 3 },
          ];

          const { error: memberError } = await supabase.from('question_group_members').insert(members);
          if (memberError) throw memberError;

          nextGroupNumber++;
          createdForThisSub++;
          totalGroupsCreated++;
        }

        if (createdForThisSub > 0) {
          subResults.push(`${sub.name}: ${createdForThisSub} neue Gruppen`);
        }
      }

      if (totalGroupsCreated === 0) {
        setGroupResult('ℹ️ Keine neuen Gruppen erstellt (nicht genug ungruppierte Fragen).');
      } else {
        setGroupResult(`✅ ${totalGroupsCreated} neue Gruppen erstellt:\n${subResults.join('\n')}`);
      }
    } catch (err: any) {
      setGroupResult(`❌ Fehler: ${err.message}`);
    } finally {
      setGrouping(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>FRAGEN IMPORTIEREN</h2>

        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px' }}>CSV-Format:</h3>
          <pre style={{ fontSize: '12px', color: colors.muted, overflowX: 'auto', backgroundColor: colors.light, padding: '12px', borderRadius: '8px' }}>
{`question_text,type,correct_answer,option_a,option_b,option_c,option_d,difficulty,category_name,subcategory_name,book_title
Welches Jahr...,multiple_choice,A,1515,1520,1525,1530,2,Geschichte der Schweiz,Alte Eidgenossenschaft,Marignano`}
          </pre>
          <p style={{ fontSize: '13px', color: colors.muted, marginTop: '12px' }}>
            <strong>type:</strong> multiple_choice oder true_false<br />
            <strong>correct_answer:</strong> A, B, C, D oder Wahr/Falsch<br />
            <strong>difficulty:</strong> 1 (leicht), 2 (mittel), 3 (schwer)
          </p>
        </div>

        <input type="file" accept=".csv" onChange={handleFileUpload} style={{ marginBottom: '24px', fontFamily: 'Helvetica, Arial, sans-serif' }} />

        {questions.length > 0 && (
          <>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px' }}>Preview: {questions.length} Fragen</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {questions.slice(0, 5).map((q, i) => (
                  <div key={i} style={{ padding: '12px 0', borderBottom: i < 4 ? `1px solid ${colors.light}` : 'none' }}>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: '4px' }}>{q.question_text}</div>
                    <div style={{ fontSize: '12px', color: colors.muted }}>{q.category_name} → {q.subcategory_name} → {q.book_title}</div>
                  </div>
                ))}
                {questions.length > 5 && <div style={{ fontSize: '12px', color: colors.muted, paddingTop: '12px' }}>... und {questions.length - 5} weitere</div>}
              </div>
            </div>
            <button style={btnPrimary} onClick={handleImport} disabled={importing}>
              {importing ? 'Importiere...' : `${questions.length} Fragen importieren`}
            </button>
          </>
        )}

        {result && (
          <div style={{ backgroundColor: result.startsWith('✅') ? '#EAF4EF' : '#F7F2EB', border: `1px solid ${result.startsWith('✅') ? '#2D6A4F' : '#A68A64'}`, borderRadius: '8px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text }}>
            {result}
          </div>
        )}

        {/* NEUE EXCEL EXPORT/IMPORT KOMPONENTE */}
        <ExcelExportImport />

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>📚 Buch hinzufügen</h3>
          <AddBook />
        </div>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>Reporting Inbox</h3>
          <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>Gemeldete Fragen von Spielern</p>
          <ReportedQuestions />
        </div>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>Fragen-Bewertungen</h3>
          <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>Sterne-Bewertungen (1–5) von Spielern nach Duellen</p>
          <QuestionRatingsInbox />
        </div>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>Antwort-Statistik</h3>
          <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>
            Wie oft Fragen richtig oder falsch beantwortet werden (Zeitüberschreitung zählt als falsch)
          </p>
          <QuestionAnswerStatsInbox />
        </div>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>3er-Gruppen verwalten</h3>
          <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>
            Erstellt automatisch 3er-Gruppen aus allen ungruppierten Fragen. Jede Gruppe bekommt eine aufsteigende Nummer pro Subkategorie.
          </p>
          <button style={btnPrimary} onClick={handleCreateGroups} disabled={grouping}>
            {grouping ? 'Erstelle Gruppen...' : 'Gruppen erstellen'}
          </button>
          {groupResult && (
            <div style={{ backgroundColor: groupResult.startsWith('✅') ? '#EAF4EF' : groupResult.startsWith('ℹ️') ? '#FFF9E6' : '#F7F2EB', border: `1px solid ${groupResult.startsWith('✅') ? '#2D6A4F' : groupResult.startsWith('ℹ️') ? '#FFC107' : '#A68A64'}`, borderRadius: '8px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text, whiteSpace: 'pre-line' }}>
              {groupResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


type AnswerStatsSort = 'attempts' | 'success_asc' | 'wrong_desc';

function QuestionAnswerStatsInbox() {
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [sortBy, setSortBy] = useState<AnswerStatsSort>('attempts');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rebuildMessage, setRebuildMessage] = useState('');

  useEffect(() => {
    supabase.from('categories').select('id, name').order('name').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      supabase.from('subcategories').select('id, name').eq('category_id', selectedCategory).order('name')
        .then(({ data }) => { setSubcategories(data || []); setSelectedSubcategory(''); });
    } else {
      setSubcategories([]);
      setSelectedSubcategory('');
    }
  }, [selectedCategory]);

  const loadStats = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const allRows = await fetchPaginated<any>(async (from, to) => {
        let query = supabase
          .from('questions')
          .select(`
            id,
            question_text,
            subcategories ( name, categories ( name ) ),
            question_answer_stats ( correct_count, wrong_count )
          `);
        if (selectedSubcategory) query = query.eq('subcategory_id', selectedSubcategory);
        else if (selectedCategory) query = query.eq('category_id', selectedCategory);
        return query.range(from, to);
      });

      const mapped = allRows.map(q => {
        const stats = Array.isArray(q.question_answer_stats)
          ? q.question_answer_stats[0]
          : q.question_answer_stats;
        const correct = stats?.correct_count ?? 0;
        const wrong = stats?.wrong_count ?? 0;
        const total = correct + wrong;
        const meta = questionExportMeta(q);
        return {
          id: q.id,
          question_text: q.question_text,
          category_name: meta.category_name,
          subcategory_name: meta.subcategory_name,
          correct,
          wrong,
          total,
          successPct: total > 0 ? Math.round((correct / total) * 100) : null,
        };
      });

      const sorted = [...mapped].sort((a, b) => {
        if (sortBy === 'success_asc') {
          const ap = a.successPct ?? 101;
          const bp = b.successPct ?? 101;
          if (ap !== bp) return ap - bp;
          return b.total - a.total;
        }
        if (sortBy === 'wrong_desc') {
          if (b.wrong !== a.wrong) return b.wrong - a.wrong;
          return b.total - a.total;
        }
        return b.total - a.total;
      });

      setRows(sorted);
    } catch (err: any) {
      const missing = err.message?.includes('question_answer_stats');
      setLoadError(
        missing
          ? 'Tabelle question_answer_stats fehlt. Bitte supabase/question_answer_stats.sql im Supabase SQL Editor ausführen.'
          : `Fehler beim Laden: ${err.message}`,
      );
      setRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedSubcategory, sortBy]);

  const rebuildFromDuels = async () => {
    if (!window.confirm(
      'Alle Antwort-Zähler werden aus abgeschlossenen Spieler-Duellen neu berechnet (überschreibt bestehende Werte). Bot-Partien zählen nur mit, wenn sie nach dem Update gespielt wurden. Fortfahren?',
    )) return;
    setRebuilding(true);
    setRebuildMessage('');
    try {
      const stats = new Map<string, { correct: number; wrong: number }>();
      const groupCache = new Map<string, string[]>();

      const duels = await fetchPaginated<any>(async (from, to) =>
        supabase
          .from('duels')
          .select('rounds_data, opponent_is_bot')
          .eq('status', 'completed')
          .range(from, to),
      );

      const addAnswers = (questionIds: string[], answers: boolean[] | undefined) => {
        if (!answers?.length) return;
        answers.forEach((isCorrect, i) => {
          const qid = questionIds[i];
          if (!qid) return;
          const entry = stats.get(qid) || { correct: 0, wrong: 0 };
          if (isCorrect) entry.correct += 1;
          else entry.wrong += 1;
          stats.set(qid, entry);
        });
      };

      for (const duel of duels) {
        for (const round of duel.rounds_data || []) {
          if (!round?.group_id) continue;
          let questionIds = groupCache.get(round.group_id);
          if (!questionIds) {
            const { data: members, error } = await supabase
              .from('question_group_members')
              .select('question_id, position')
              .eq('group_id', round.group_id)
              .order('position', { ascending: true });
            if (error) throw error;
            questionIds = members?.map(m => m.question_id) || [];
            groupCache.set(round.group_id, questionIds);
          }
          addAnswers(questionIds, round.challenger_answers);
          if (!duel.opponent_is_bot) addAnswers(questionIds, round.opponent_answers);
        }
      }

      const { error: deleteError } = await supabase
        .from('question_answer_stats')
        .delete()
        .neq('question_id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) throw deleteError;

      const payload = Array.from(stats.entries()).map(([question_id, s]) => ({
        question_id,
        correct_count: s.correct,
        wrong_count: s.wrong,
        updated_at: new Date().toISOString(),
      }));

      const UPSERT_CHUNK = 200;
      for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
        const chunk = payload.slice(i, i + UPSERT_CHUNK);
        const { error } = await supabase.from('question_answer_stats').upsert(chunk);
        if (error) throw error;
      }

      setRebuildMessage(`✅ ${payload.length} Fragen aus ${duels.length} Duellen neu berechnet`);
      await loadStats();
    } catch (err: any) {
      setRebuildMessage(`❌ ${err.message}`);
    }
    setRebuilding(false);
  };

  const withData = rows.filter(r => r.total > 0);
  const totals = withData.reduce((acc, r) => ({ correct: acc.correct + r.correct, wrong: acc.wrong + r.wrong }), { correct: 0, wrong: 0 });
  const overallTotal = totals.correct + totals.wrong;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: '1 1 160px' }}>
          <option value="">Alle Kategorien</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedSubcategory} onChange={e => setSelectedSubcategory(e.target.value)} disabled={!selectedCategory} style={{ ...inputStyle, marginBottom: 0, flex: '1 1 160px', opacity: selectedCategory ? 1 : 0.5 }}>
          <option value="">Alle Subkategorien</option>
          {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as AnswerStatsSort)} style={{ ...inputStyle, marginBottom: 0, flex: '1 1 200px' }}>
          <option value="attempts">Meiste Antworten</option>
          <option value="success_asc">Niedrigste Erfolgsquote</option>
          <option value="wrong_desc">Meiste Fehlantworten</option>
        </select>
      </div>
      <button type="button" style={{ ...btnSecondary, width: 'auto', padding: '12px 20px', marginBottom: '16px' }} onClick={rebuildFromDuels} disabled={rebuilding || loading}>
        {rebuilding ? 'Berechne neu…' : 'Aus Duellen neu berechnen'}
      </button>
      {rebuildMessage ? (
        <p style={{ fontSize: '13px', color: colors.text, marginBottom: '12px', whiteSpace: 'pre-line' }}>{rebuildMessage}</p>
      ) : null}
      {loadError ? (
        <div style={{ backgroundColor: '#F7F2EB', border: '1px solid #A68A64', borderRadius: '8px', padding: '14px', marginBottom: '16px', fontSize: '13px', color: colors.text }}>
          {loadError}
        </div>
      ) : null}
      {!loadError && (
        <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>
          {withData.length} Fragen mit Daten
          {overallTotal > 0 ? ` · ${totals.correct} richtig / ${totals.wrong} falsch (${answerSuccessPct(totals.correct, totals.wrong)}% Erfolg)` : ''}
        </p>
      )}
      {loading ? (
        <p style={{ color: colors.muted, fontSize: '13px' }}>Lade Statistik…</p>
      ) : rows.length === 0 && !loadError ? (
        <p style={{ color: colors.muted, fontSize: '13px' }}>Noch keine Antwort-Daten. Spiele Duelle oder berechne aus bestehenden Duellen neu.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
          {rows.map(row => (
            <div key={row.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', color: colors.muted, marginBottom: '4px' }}>
                    {row.category_name}{row.subcategory_name ? ` · ${row.subcategory_name}` : ''}
                  </div>
                  <div style={{ fontSize: '14px', color: colors.text, lineHeight: 1.45 }}>{row.question_text}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {row.total > 0 ? (
                    <>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: row.successPct !== null && row.successPct < 50 ? '#A68A64' : '#2D6A4F' }}>
                        {row.successPct}%
                      </div>
                      <div style={{ fontSize: '12px', color: colors.muted }}>
                        <span style={{ color: '#2D6A4F' }}>{row.correct}✓</span>
                        {' · '}
                        <span style={{ color: '#A68A64' }}>{row.wrong}✗</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: colors.muted }}>—</div>
                  )}
                </div>
              </div>
              {row.total > 0 ? (
                <div style={{ height: '5px', backgroundColor: colors.light, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${row.successPct}%`, backgroundColor: '#2D6A4F', borderRadius: '3px' }} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionRatingsInbox() {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    loadRatings();
  }, []);

  const loadRatings = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('question_ratings')
      .select(`
        id,
        rating,
        created_at,
        updated_at,
        questions ( question_text ),
        rater:profiles!question_ratings_user_id_fkey ( username )
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      const missingTable = error.code === 'PGRST205' || error.message?.includes('question_ratings');
      setLoadError(
        missingTable
          ? 'Tabelle question_ratings fehlt. Bitte supabase/question_ratings.sql im Supabase SQL Editor ausführen.'
          : `Fehler beim Laden: ${error.message}`,
      );
      setRatings([]);
    } else {
      setRatings(data || []);
    }
    setLoading(false);
  };

  const avg = ratings.length
    ? (ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length).toFixed(1)
    : null;

  if (loading) return <p style={{ color: colors.muted, fontSize: '13px' }}>Lade Bewertungen…</p>;

  return (
    <div>
      {loadError ? (
        <div style={{ backgroundColor: '#F7F2EB', border: '1px solid #A68A64', borderRadius: '8px', padding: '14px', marginBottom: '16px', fontSize: '13px', color: colors.text, lineHeight: 1.5 }}>
          {loadError}
        </div>
      ) : null}
      {!loadError && (
        <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '16px' }}>
          {ratings.length} Bewertung{ratings.length === 1 ? '' : 'en'}
          {avg ? ` · Ø ${avg} Sterne` : ''}
          {ratings.length >= 200 ? ' (neueste 200)' : ''}
        </p>
      )}
      {ratings.length === 0 && !loadError ? (
        <p style={{ color: colors.muted, fontSize: '13px' }}>Noch keine Bewertungen</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '480px', overflowY: 'auto' }}>
          {ratings.map((row) => (
            <div key={row.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px', letterSpacing: '2px', color: '#B8860B', flexShrink: 0 }}>
                  {'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}
                </span>
                <span style={{ fontSize: '12px', color: colors.muted, textAlign: 'right' }}>
                  {row.rater?.username || 'Unbekannt'}
                  <br />
                  {new Date(row.updated_at || row.created_at).toLocaleString('de-CH')}
                </span>
              </div>
              <div style={{ fontSize: '14px', color: colors.text, lineHeight: 1.45 }}>
                {row.questions?.question_text || '— Frage gelöscht —'}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={loadRatings}
        style={{ ...btnSecondary, marginTop: '16px', width: 'auto', padding: '10px 20px', fontSize: '13px' }}
      >
        Aktualisieren
      </button>
    </div>
  );
}

function ReportedQuestions() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadReports = async () => {
    setLoading(true);
    let query = supabase
      .from('question_reports')
      .select('*, questions(*), reported_by:profiles!question_reports_reported_by_fkey(username)')
      .order('created_at', { ascending: false });

    if (filter === 'open') query = query.eq('status', 'open');

    const { data } = await query;
    setReports(data || []);
    setLoading(false);
  };

  const updateStatus = async (reportId: string, newStatus: string) => {
    await supabase.from('question_reports').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', reportId);
    loadReports();
  };

  const deleteQuestion = async (questionId: string) => {
    if (!window.confirm('Frage wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    await supabase.from('questions').delete().eq('id', questionId);
    loadReports();
  };

  if (loading) return <p style={{ color: colors.muted, fontSize: '13px' }}>Lade Reports...</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setFilter('open')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: filter === 'open' ? colors.primary : colors.light, color: filter === 'open' ? colors.bg : colors.text }}>Offen ({reports.filter(r => r.status === 'open').length})</button>
        <button onClick={() => setFilter('all')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: filter === 'all' ? colors.primary : colors.light, color: filter === 'all' ? colors.bg : colors.text }}>Alle</button>
      </div>

      {reports.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px' }}>Keine Reports</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(report => (
            <div key={report.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '13px', color: colors.muted, marginBottom: '8px' }}>
                Gemeldet von {report.reported_by?.username} · {new Date(report.created_at).toLocaleDateString('de-CH')}
              </div>
              <div style={{ fontSize: '14px', color: colors.text, marginBottom: '8px', fontWeight: 'bold' }}>
                {report.questions?.question_text}
              </div>
              <div style={{ fontSize: '13px', color: colors.text, marginBottom: '12px', padding: '12px', backgroundColor: '#FFF9E6', borderRadius: '8px' }}>
                💬 {report.reason}
              </div>
              <div style={{ fontSize: '12px', color: colors.muted, marginBottom: '12px' }}>
                Status: <span style={{ fontWeight: 'bold', color: report.status === 'open' ? '#A68A64' : report.status === 'resolved' ? '#2D6A4F' : colors.muted }}>{report.status}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {report.status === 'open' && (
                  <>
                    <button onClick={() => updateStatus(report.id, 'in_progress')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>In Bearbeitung</button>
                    <button onClick={() => updateStatus(report.id, 'resolved')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#2D6A4F', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Erledigt</button>
                    <button onClick={() => updateStatus(report.id, 'dismissed')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: colors.muted, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Ablehnen</button>
                  </>
                )}
                <button onClick={() => deleteQuestion(report.questions.id)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '8px', cursor: 'pointer' }}>Frage löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ userId, onBack }: { userId: string, onBack: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    markAllAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadNotifications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications(data || []);
    setLoading(false);
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    loadNotifications();
  };

  const iconForType = (type: string) => {
    switch (type) {
      case 'friend_request': return '👥';
      case 'duel_challenge': return '⚔️';
      case 'duel_turn': return '🎯';
      case 'duel_completed': return '🏁';
      default: return '🔔';
    }
  };

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min`;
    if (diffH < 24) return `vor ${diffH} Std`;
    if (diffD < 7) return `vor ${diffD} Tagen`;
    return date.toLocaleDateString('de-CH');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>BENACHRICHTIGUNGEN</h2>
        {loading ? (
          <p style={{ color: colors.muted, textAlign: 'center' }}>LADEN...</p>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔕</div>
            <p style={{ color: colors.muted, fontSize: '15px' }}>Keine Benachrichtigungen</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {notifications.map(notif => (
              <div key={notif.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{iconForType(notif.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: colors.text, marginBottom: '4px', fontWeight: 'bold' }}>{notif.title}</div>
                  <div style={{ fontSize: '14px', color: colors.text, marginBottom: '6px' }}>{notif.message}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>{timeAgo(notif.created_at)}</div>
                </div>
                <button onClick={() => deleteNotification(notif.id)} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }} title="Löschen">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UserSearch({ userId, onBack, onChallenge }: { userId: string, onBack: () => void, onChallenge: (opponent: any) => void }) {
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    loadFriends();
    loadPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(id, username), addressee:profiles!friendships_addressee_id_fkey(id, username)')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');
    setFriends(data || []);
  };

  const loadPendingRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(id, username)')
      .eq('addressee_id', userId)
      .eq('status', 'pending');
    setPendingRequests(data || []);
  };

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.from('profiles').select('id, username').ilike('username', searchUsername.trim()).single();
    if (error || !data) {
      setMessage('Kein User mit diesem Namen gefunden.');
      setSearchResult(null);
    } else if (data.id === userId) {
      setMessage('Das bist du selbst!');
      setSearchResult(null);
    } else {
      setSearchResult(data);
    }
    setLoading(false);
  };

  const sendFriendRequest = async () => {
    if (!searchResult) return;
    const { data: existing } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${searchResult.id}),and(requester_id.eq.${searchResult.id},addressee_id.eq.${userId})`);
    if (existing && existing.length > 0) {
      const status = existing[0].status;
      if (status === 'accepted') setMessage('Ihr seid bereits befreundet!');
      else if (status === 'pending') setMessage('Anfrage wurde bereits gesendet.');
      return;
    }
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: searchResult.id, status: 'pending' });
    if (error) {
      setMessage('Freundschaftsanfrage konnte nicht gesendet werden.');
    } else {
      const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
      await supabase.from('notifications').insert({
        user_id: searchResult.id,
        type: 'friend_request',
        title: 'Neue Freundschaftsanfrage',
        message: `${myProfile?.username || 'Jemand'} möchte mit dir befreundet sein`,
      });
      setMessage('✅ Freundschaftsanfrage gesendet!');
      setSearchResult(null);
      setSearchUsername('');
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    loadFriends();
    loadPendingRequests();
  };

  const rejectRequest = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    loadPendingRequests();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>SPIELER SUCHEN</h2>

        <div style={{ marginBottom: '32px' }}>
          <input style={inputStyle} placeholder="Username eingeben" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <button style={btnPrimary} onClick={handleSearch} disabled={loading}>{loading ? 'Suche...' : 'Suchen'}</button>
        </div>

        {message && (
          <div style={{ backgroundColor: message.startsWith('✅') ? '#EAF4EF' : '#F7F2EB', border: `1px solid ${message.startsWith('✅') ? '#2D6A4F' : '#A68A64'}`, borderRadius: '8px', padding: '16px', marginBottom: '24px', fontSize: '14px' }}>{message}</div>
        )}

        {searchResult && (
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '32px' }}>
            <div style={{ fontSize: '18px', color: colors.text, marginBottom: '20px' }}>{searchResult.username}</div>
            <button style={btnPrimary} onClick={sendFriendRequest}>Freundschaftsanfrage senden</button>
            <button style={btnSecondary} onClick={() => onChallenge(searchResult)}>Zum Duell herausfordern</button>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>ANFRAGEN</h3>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', color: colors.text, marginBottom: '12px' }}>{req.requester.username} möchte mit dir befreundet sein</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={{ ...btnPrimary, marginBottom: 0, fontSize: '14px', padding: '10px' }} onClick={() => acceptRequest(req.id)}>Annehmen</button>
                  <button style={{ ...btnSecondary, marginBottom: 0, fontSize: '14px', padding: '10px' }} onClick={() => rejectRequest(req.id)}>Ablehnen</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {friends.length > 0 && (
          <div>
            <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>FREUNDE</h3>
            {friends.map(f => {
              const friend = f.requester.id === userId ? f.addressee : f.requester;
              return (
                <div key={f.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '15px', color: colors.text }}>{friend.username}</div>
                  <button style={{ ...btnSecondary, marginBottom: 0, fontSize: '13px', padding: '8px 16px', width: 'auto' }} onClick={() => onChallenge(friend)}>Duell</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DuelDetail({ duel, userId, onBack }: { duel: any, userId: string, onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<any[][]>([]);
  const [reportingQuestion, setReportingQuestion] = useState<any>(null);

  const isChallenger = duel.challenger_id === userId;
  const opponent = isChallenger ? duel.opponent : duel.challenger;
  const myScore = isChallenger ? (duel.challenger_score || 0) : (duel.opponent_score || 0);
  const oppScore = isChallenger ? (duel.opponent_score || 0) : (duel.challenger_score || 0);
  const oppName = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.name || 'Bot' : opponent?.username;
  const roundsData = duel.rounds_data || [];

  useEffect(() => {
    loadAllQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.id]);

  const loadAllQuestions = async () => {
    setLoading(true);
    const allRoundQuestions: any[][] = [];
    
    for (const round of roundsData) {
      const { data: members } = await supabase
        .from('question_group_members')
        .select('position, questions(*)')
        .eq('group_id', round.group_id)
        .order('position', { ascending: true });
      const qs = members?.map((m: any) => m.questions).filter(Boolean) || [];
      allRoundQuestions.push(qs);
    }
    
    setQuestions(allRoundQuestions);
    setLoading(false);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ color: colors.text, fontSize: '20px', margin: 0 }}>vs {oppName}</h2>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.primary }}>{myScore} : {oppScore}</div>
          </div>
          <div style={{ fontSize: '13px', color: colors.muted }}>{duel.categories?.name}</div>
        </div>

        {roundsData.map((round: any, roundIdx: number) => {
          const roundQuestions = questions[roundIdx] || [];
          const myAnswers = isChallenger ? round.challenger_answers : round.opponent_answers;
          const mySelections = isChallenger ? round.challenger_selections : round.opponent_selections;
          const oppAnswers = isChallenger ? round.opponent_answers : round.challenger_answers;
          const oppSelections = isChallenger ? round.opponent_selections : round.challenger_selections;

          return (
            <div key={roundIdx} style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>
                RUNDE {round.round} · {round.subcategory_name} · Gruppe {round.group_number}
              </h3>
              
              {roundQuestions.map((q: any, qIdx: number) => {
                const myCorrect = myAnswers?.[qIdx];
                const oppCorrect = oppAnswers?.[qIdx];
                const myAnswer = mySelections?.[qIdx];
                const oppAnswer = oppSelections?.[qIdx];

                const options = q.type === 'true_false'
                  ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
                  : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

                return (
                  <div key={qIdx} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '15px', color: colors.text, marginBottom: '12px', fontWeight: 'bold' }}>Frage {qIdx + 1}</div>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: '16px', lineHeight: '1.5' }}>{q.question_text}</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {options.map(opt => {
                        const isCorrect = opt.key === q.correct_answer;
                        const isMyAnswer = opt.key === myAnswer;
                        const isOppAnswer = opt.key === oppAnswer;
                        
                        let bg = 'white';
                        let border = '0.5px solid rgba(0,0,0,0.08)';
                        if (isCorrect) { bg = '#EAF4EF'; border = '1px solid #2D6A4F'; }

                        return (
                          <div key={opt.key} style={{ backgroundColor: bg, border, padding: '10px 12px', borderRadius: '8px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              <span style={{ fontWeight: 'bold', marginRight: '8px' }}>{opt.key}.</span>
                              {opt.label}
                              {isCorrect && <span style={{ marginLeft: '8px', color: '#2D6A4F', fontSize: '16px' }}>✓</span>}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {isMyAnswer && <span style={{ fontSize: '11px', backgroundColor: myCorrect ? '#EAF4EF' : '#F7F2EB', padding: '2px 6px', borderRadius: '3px' }}>Du</span>}
                              {isOppAnswer && <span style={{ fontSize: '11px', backgroundColor: oppCorrect ? '#EAF4EF' : '#F7F2EB', padding: '2px 6px', borderRadius: '3px' }}>{oppName}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button 
                      onClick={() => setReportingQuestion(q)} 
                      style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${colors.primary}`, color: colors.primary, borderRadius: '8px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}
                    >
                      ⚠️ Frage melden
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {reportingQuestion ? (
        <QuestionReportModal
          question={{ id: reportingQuestion.id, question_text: reportingQuestion.question_text }}
          userId={userId}
          onClose={() => setReportingQuestion(null)}
        />
      ) : null}
    </div>
  );
}

function BookRecommender({ userId }: { userId: string }) {
  const [items, setItems] = useState<{
    bookId: string;
    title: string;
    author: string;
    correct: number;
    wrong: number;
    total: number;
    wrongPct: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await loadUserBookRecommendations(userId);
        if (!cancelled) setItems(list);
      } catch (err) {
        console.warn('BookRecommender:', err);
        if (!cancelled) setItems([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const wrongPctColor = (pct: number) => (pct >= 70 ? '#A68A64' : pct >= 50 ? '#FF9800' : '#6B7B8C');

  if (loading) {
    return <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>LADEN...</p>;
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '20px', lineHeight: 1.5 }}>
        Bücher mit den meisten Fehlern — ideal zum Nachlesen. Sortiert nach Fehlerquote (höchste zuerst).
      </p>
      {items.length === 0 ? (
        <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>Noch keine Buch-Daten. Spiele ein paar Duelle!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((book, index) => (
            <div
              key={book.bookId}
              style={{
                backgroundColor: '#FFFFFF',
                border: `1px solid ${index === 0 ? '#A68A64' : 'rgba(0,0,0,0.08)'}`,
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: index < 3 ? '#F7F2EB' : colors.light,
                color: index < 3 ? '#A68A64' : colors.muted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {index + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', color: colors.text, fontWeight: 600, marginBottom: '2px' }}>{book.title}</div>
                {book.author ? (
                  <div style={{ fontSize: '12px', color: colors.muted, marginBottom: '8px' }}>{book.author}</div>
                ) : null}
                <div style={{ height: '5px', backgroundColor: colors.light, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${book.wrongPct}%`, backgroundColor: wrongPctColor(book.wrongPct), borderRadius: '3px' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: wrongPctColor(book.wrongPct) }}>{book.wrongPct}%</div>
                <div style={{ fontSize: '11px', color: colors.muted }}>falsch</div>
                <div style={{ fontSize: '11px', color: colors.muted, marginTop: '2px' }}>{book.wrong}✗ · {book.correct}✓</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Highscores({ onBack, userId }: { onBack: () => void, userId: string }) {
  const [tab, setTab] = useState<'stats' | 'books' | 'leaderboard' | 'myduels'>('stats');
  const [scores, setScores] = useState<any[]>([]);
  const [, setCategories] = useState<any[]>([]);  const [loading, setLoading] = useState(true);
  const [myDuels, setMyDuels] = useState<any[]>([]);
  const [selectedDuel, setSelectedDuel] = useState<any>(null);
  const [myStats, setMyStats] = useState<any[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [subStats, setSubStats] = useState<Record<string, any[]>>({});

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (tab === 'stats') loadMyStats();
    else if (tab === 'leaderboard') loadLeaderboard();
    else loadMyDuels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const loadMyStats = async () => {
    setLoading(true);
    // Load all played duels for this user
    const { data: duels } = await supabase
      .from('duels')
      .select('*, categories(id, name)')
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .eq('status', 'completed');

    const { data: cats } = await supabase.from('categories').select('*');

    const statsMap: Record<string, { correct: number, total: number, name: string }> = {};
    (cats || []).forEach(cat => { statsMap[cat.id] = { correct: 0, total: 0, name: cat.name }; });

    (duels || []).forEach((d: any) => {
      const isChallenger = d.challenger_id === userId;
      const answers = isChallenger ? d.rounds_data?.flatMap((r: any) => r.challenger_answers || []) : d.rounds_data?.flatMap((r: any) => r.opponent_answers || []);
      if (!answers || !d.category_id) return;
      if (!statsMap[d.category_id]) statsMap[d.category_id] = { correct: 0, total: 0, name: d.categories?.name || '' };
      statsMap[d.category_id].correct += answers.filter(Boolean).length;
      statsMap[d.category_id].total += answers.length;
    });

    const result = Object.entries(statsMap)
      .map(([id, s]) => ({ id, ...s, pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null }))
      .filter(s => s.total > 0)
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));

    setMyStats(result);
    setLoading(false);
  };

  const loadSubStats = async (categoryId: string) => {
    if (subStats[categoryId]) return;
    const { data: duels } = await supabase
      .from('duels')
      .select('rounds_data, challenger_id')
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .eq('status', 'completed')
      .eq('category_id', categoryId);

    const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', categoryId);
    const subMap: Record<string, { correct: number, total: number, name: string }> = {};
    (subs || []).forEach(s => { subMap[s.id] = { correct: 0, total: 0, name: s.name }; });

    (duels || []).forEach((d: any) => {
      const isChallenger = d.challenger_id === userId;
      (d.rounds_data || []).forEach((r: any) => {
        const answers = isChallenger ? r.challenger_answers : r.opponent_answers;
        if (!answers || !r.subcategory_id) return;
        if (!subMap[r.subcategory_id]) subMap[r.subcategory_id] = { correct: 0, total: 0, name: r.subcategory_name || '' };
        subMap[r.subcategory_id].correct += answers.filter(Boolean).length;
        subMap[r.subcategory_id].total += answers.length;
      });
    });

    const result = Object.entries(subMap)
      .map(([id, s]) => ({ id, ...s, pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null }))
      .filter(s => s.total > 0)
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));

    setSubStats(prev => ({ ...prev, [categoryId]: result }));
  };

  const loadLeaderboard = async () => {
    setLoading(true);
    const { data: duels } = await supabase
      .from('duels')
      .select('challenger_id, opponent_id, rounds_data, category_id, categories(name)')
      .eq('status', 'completed');

    const userMap: Record<string, { correct: number, total: number }> = {};
    (duels || []).forEach((d: any) => {
      if (!d.rounds_data) return;
      const cAnswers = d.rounds_data.flatMap((r: any) => r.challenger_answers || []);
      const oAnswers = d.rounds_data.flatMap((r: any) => r.opponent_answers || []);
      if (!userMap[d.challenger_id]) userMap[d.challenger_id] = { correct: 0, total: 0 };
      userMap[d.challenger_id].correct += cAnswers.filter(Boolean).length;
      userMap[d.challenger_id].total += cAnswers.length;
      if (d.opponent_id) {
        if (!userMap[d.opponent_id]) userMap[d.opponent_id] = { correct: 0, total: 0 };
        userMap[d.opponent_id].correct += oAnswers.filter(Boolean).length;
        userMap[d.opponent_id].total += oAnswers.length;
      }
    });

    const userIds = Object.keys(userMap).filter(id => userMap[id].total >= 9);
    if (userIds.length === 0) { setScores([]); setLoading(false); return; }

    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds);
    const profileMap = new Map((profiles || []).map(p => [p.id, p.username]));

    const result = userIds.map(id => ({
      id,
      username: profileMap.get(id) || 'Anonym',
      correct: userMap[id].correct,
      total: userMap[id].total,
      pct: Math.round((userMap[id].correct / userMap[id].total) * 100),
    })).sort((a, b) => b.pct - a.pct);

    setScores(result);
    setLoading(false);
  };

  const loadMyDuels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('duels')
      .select(`*, challenger:profiles!duels_challenger_id_fkey(username), opponent:profiles!duels_opponent_id_fkey(username), categories(name)`)
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    setMyDuels(data || []);
    setLoading(false);
  };

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

  const pctColor = (pct: number) => pct >= 70 ? '#2D6A4F' : pct >= 50 ? '#FF9800' : '#A68A64';

  if (selectedDuel) return <DuelDetail duel={selectedDuel} userId={userId} onBack={() => setSelectedDuel(null)} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>STATISTIK</h2>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${colors.light}`, paddingBottom: '0', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {([
            { id: 'stats' as const, label: 'MEINE STATS' },
            { id: 'books' as const, label: 'Book Recommender' },
            { id: 'leaderboard' as const, label: 'RANGLISTE' },
            { id: 'myduels' as const, label: 'MEINE DUELLE' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 12px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontSize: '12px',
                backgroundColor: 'transparent',
                color: tab === t.id ? colors.primary : colors.muted,
                borderBottom: tab === t.id ? `2px solid ${colors.primary}` : '2px solid transparent',
                fontWeight: tab === t.id ? 'bold' : 'normal',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'books' ? (
          <BookRecommender userId={userId} />
        ) : loading ? <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>LADEN...</p> : (
          <>
            {/* MEINE STATS */}
            {tab === 'stats' && (
              <div>
                {myStats.length === 0 ? (
                  <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>Noch keine Duelle gespielt</p>
                ) : myStats.map(cat => (
                  <div key={cat.id} style={{ marginBottom: '8px' }}>
                    <div onClick={() => { setExpandedCategory(expandedCategory === cat.id ? null : cat.id); loadSubStats(cat.id); }} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', color: colors.text, marginBottom: '6px' }}>{cat.name}</div>
                        <div style={{ height: '6px', backgroundColor: colors.light, borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '6px', backgroundColor: pctColor(cat.pct), borderRadius: '3px', width: `${cat.pct}%`, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: pctColor(cat.pct) }}>{cat.pct}%</div>
                        <div style={{ fontSize: '11px', color: colors.muted }}>{cat.correct}/{cat.total}</div>
                      </div>
                      <div style={{ color: colors.muted, fontSize: '12px' }}>{expandedCategory === cat.id ? '▲' : '▼'}</div>
                    </div>
                    {expandedCategory === cat.id && (
                      <div style={{ backgroundColor: '#FAF8F4', border: '0.5px solid rgba(0,0,0,0.08)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px 16px' }}>
                        {!subStats[cat.id] ? (
                          <p style={{ color: colors.muted, fontSize: '13px', padding: '8px 0' }}>Laden...</p>
                        ) : subStats[cat.id].length === 0 ? (
                          <p style={{ color: colors.muted, fontSize: '13px', padding: '8px 0' }}>Keine Daten</p>
                        ) : subStats[cat.id].map(sub => (
                          <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: `1px solid ${colors.light}` }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', color: colors.text, marginBottom: '4px' }}>{sub.name}</div>
                              <div style={{ height: '4px', backgroundColor: colors.light, borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '4px', backgroundColor: pctColor(sub.pct), borderRadius: '2px', width: `${sub.pct}%` }} />
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '15px', fontWeight: 'bold', color: pctColor(sub.pct) }}>{sub.pct}%</div>
                              <div style={{ fontSize: '11px', color: colors.muted }}>{sub.correct}/{sub.total}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* RANGLISTE */}
            {tab === 'leaderboard' && (
              <div>
                {scores.length === 0 ? (
                  <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>Noch keine Daten (min. 3 Duelle nötig)</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {scores.map((s, i) => (
                      <div key={s.id} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${i === 0 ? '#DAA520' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#C9B99A'}`, padding: '14px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: i < 3 ? '20px' : '14px', minWidth: '28px', textAlign: 'center' }}>{medal(i)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: colors.text, fontSize: '15px', marginBottom: '4px' }}>{s.username}{s.id === userId ? ' (du)' : ''}</div>
                          <div style={{ height: '5px', backgroundColor: colors.light, borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '5px', backgroundColor: pctColor(s.pct), borderRadius: '3px', width: `${s.pct}%` }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ color: pctColor(s.pct), fontSize: '18px', fontWeight: 'bold' }}>{s.pct}%</div>
                          <div style={{ color: colors.muted, fontSize: '11px' }}>{s.correct}/{s.total}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MEINE DUELLE */}
            {tab === 'myduels' && (
              <div>
                {myDuels.length === 0 ? (
                  <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>Noch keine abgeschlossenen Duelle</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {myDuels.map(d => {
                      const isChallenger = d.challenger_id === userId;
                      const opponent = isChallenger ? d.opponent : d.challenger;
                      const myScore = isChallenger ? (d.challenger_score || 0) : (d.opponent_score || 0);
                      const oppScore = isChallenger ? (d.opponent_score || 0) : (d.challenger_score || 0);
                      const won = myScore > oppScore;
                      const draw = myScore === oppScore;
                      const oppName = d.opponent_is_bot ? bots.find(b => b.level === d.bot_level)?.name || 'Bot' : opponent?.username;
                      return (
                        <div key={d.id} onClick={() => setSelectedDuel(d)} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold', marginBottom: '2px' }}>vs {oppName}</div>
                            <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', color: colors.text, marginBottom: '2px' }}>{myScore} : {oppScore}</div>
                            <div style={{ fontSize: '12px', color: won ? '#2D6A4F' : draw ? colors.muted : '#A68A64' }}>{won ? 'Gewonnen' : draw ? 'Unentschieden' : 'Verloren'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const BOT_CHOSEN_DISPLAY_MS = 2000;
const BOT_PLAYING_DURATION_MS = 4000;

function BotCategoryPickFlow({
  emoji,
  name,
  subcategoryName,
  onComplete,
}: {
  emoji: string;
  name: string;
  subcategoryName: string;
  onComplete: () => void;
}) {
  const [uiPhase, setUiPhase] = useState<'chosen' | 'playing'>('chosen');
  const [barFill, setBarFill] = useState(false);
  const completedRef = React.useRef(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const id = window.setTimeout(() => setUiPhase('playing'), BOT_CHOSEN_DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (uiPhase !== 'playing') return;
    completedRef.current = false;
    setBarFill(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setBarFill(true));
    });

    const timer = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
    }, BOT_PLAYING_DURATION_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [uiPhase]);

  if (uiPhase === 'chosen') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: fontBody }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', width: '100%' }}>
          <div style={{ fontSize: 'clamp(52px, 16vw, 80px)', marginBottom: '20px', lineHeight: 1 }}>{emoji}</div>
          <p style={{ color: colors.text, fontSize: 'clamp(17px, 4vw, 20px)', fontFamily: fontBody, lineHeight: 1.5 }}>
            <strong>{name}</strong> hat <strong style={{ color: colors.primary }}>{subcategoryName}</strong> gewählt
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: fontBody }}>
      <div style={{ textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <div style={{ fontSize: 'clamp(52px, 16vw, 80px)', marginBottom: '20px', lineHeight: 1 }}>{emoji}</div>
        <p style={{ color: colors.text, fontSize: 'clamp(17px, 4vw, 20px)', marginBottom: '28px', fontFamily: fontBody }}>
          <strong>{name}</strong> spielt
        </p>
        <div style={{ height: '6px', backgroundColor: colors.light, borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
          <div
            style={{
              height: '100%',
              width: '100%',
              backgroundColor: colors.primary,
              borderRadius: '3px',
              transform: barFill ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'left center',
              transition: `transform ${BOT_PLAYING_DURATION_MS}ms linear`,
              willChange: 'transform',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function QuizRound({ questions, roundNumber, totalRounds, bot, userId, onRoundComplete }: {
  questions: any[], roundNumber: number, totalRounds: number, bot: any | null, userId?: string,
  onRoundComplete: (userAnswers: boolean[], botAnswers: boolean[] | null, selectedAnswers: string[]) => void
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [botAnswer, setBotAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [userAnswers, setUserAnswers] = useState<boolean[]>([]);
  const [botAnswers, setBotAnswers] = useState<boolean[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS);
  const [timerActive, setTimerActive] = useState(true);
  const [streak, setStreak] = useState(0);
  const [showStreak, setShowStreak] = useState(false);
  const [animateQuestion, setAnimateQuestion] = useState(false);
  const [shakeAnswer, setShakeAnswer] = useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // CSS animations injected once
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(40px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideInLeft {
        from { opacity: 0; transform: translateX(-40px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
      }
      @keyframes popIn {
        0% { transform: scale(0.5); opacity: 0; }
        70% { transform: scale(1.2); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      .slide-in { animation: slideInRight 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) both; }
      .shake { animation: shake 0.4s ease both; }
      .pop-in { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
      .pulse { animation: pulse 0.6s ease infinite; }
    `;
    style.id = 'quiz-animations';
    if (!document.getElementById('quiz-animations')) document.head.appendChild(style);
  }, []);

  // Timer
  React.useEffect(() => {
    if (!timerActive || showResult) return;
    setTimeLeft(QUESTION_TIME_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer('__timeout__');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, timerActive]);

  // Animate question on change
  React.useEffect(() => {
    setAnimateQuestion(true);
    const t = setTimeout(() => setAnimateQuestion(false), 400);
    return () => clearTimeout(t);
  }, [current]);

  const handleAnswer = (answer: string) => {
    if (selected || !timerActive) return;
    clearInterval(timerRef.current!);
    setTimerActive(false);
    setSelected(answer);

    setTimeout(() => {
      const q = questions[current];
      const optionKeys = q.type === 'true_false' ? ['Wahr', 'Falsch'] : ['A', 'B', 'C', 'D'];
      const isTimeout = answer === '__timeout__';
      const userIsCorrect = !isTimeout && answer === q.correct_answer;
      if (userId && q?.id) {
        recordQuestionAnswer(q.id, userIsCorrect);
        recordUserBookAnswer(q.book_id, userIsCorrect);
      }

      let bAnswer: string | null = null;
      let botIsCorrect = false;
      if (bot) {
        bAnswer = getBotAnswer(optionKeys, q.correct_answer, bot.accuracy);
        botIsCorrect = bAnswer === q.correct_answer;
        setBotAnswer(bAnswer);
      }

      // Streak
      if (userIsCorrect) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak >= 2) {
          setShowStreak(true);
          setTimeout(() => setShowStreak(false), 1500);
        }
      } else {
        setStreak(0);
        if (!isTimeout) setShakeAnswer(true);
        setTimeout(() => setShakeAnswer(false), 500);
      }

      setShowResult(true);
      const newUserAnswers = [...userAnswers, userIsCorrect];
      const newBotAnswers = bot ? [...botAnswers, botIsCorrect] : botAnswers;
      const newSelectedAnswers = [...selectedAnswers, isTimeout ? '' : answer];
      setUserAnswers(newUserAnswers);
      if (bot) setBotAnswers(newBotAnswers);
      setSelectedAnswers(newSelectedAnswers);

      setTimeout(() => {
        if (current + 1 >= questions.length) {
          onRoundComplete(newUserAnswers, bot ? newBotAnswers : null, newSelectedAnswers);
        } else {
          setCurrent(c => c + 1);
          setSelected(null);
          setBotAnswer(null);
          setShowResult(false);
          setTimerActive(true);
          setShakeAnswer(false);
        }
      }, 1500);
    }, 300);
  };

  const q = questions[current];
  const options = useMemo(() => {
    if (q.type === 'true_false') {
      const base = [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }];
      return shuffleOptions(base).map(o => ({ ...o, displayLetter: o.key }));
    }
    const baseOptions = [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);
    const shuffled = shuffleOptions(baseOptions);
    return shuffled.map((o, i) => ({
      ...o,
      displayLetter: String.fromCharCode('A'.charCodeAt(0) + i),
    }));
  }, [q]);

  const timerPct = (timeLeft / QUESTION_TIME_SECONDS) * 100;
  const timerGreenAbove = Math.round(QUESTION_TIME_SECONDS * (8 / 15));
  const timerOrangeAbove = Math.round(QUESTION_TIME_SECONDS * (4 / 15));
  const timerColor = timeLeft > timerGreenAbove ? '#2D6A4F' : timeLeft > timerOrangeAbove ? '#FF9800' : '#A68A64';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: fontBody }}>
      {/* Streak Banner */}
      {showStreak && (
        <div className="pop-in" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#FF9800', color: 'white', padding: '10px 24px', borderRadius: '24px', fontSize: '16px', fontWeight: 'bold', zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(255,152,0,0.4)' }}>
          🔥 {streak}x Streak!
        </div>
      )}

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingTop: '12px' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', fontFamily: fontBody }}>RUNDE {roundNumber} VON {totalRounds}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {streak >= 2 && <span style={{ fontSize: '13px', color: '#FF9800', fontWeight: 'bold' }}>🔥 {streak}</span>}
            <span style={{ color: timerColor, fontSize: '15px', fontWeight: 'bold', minWidth: '28px', textAlign: 'right', transition: 'color 0.3s' }}>{timeLeft}s</span>
          </div>
        </div>

        {/* Timer bar */}
        <div style={{ height: '4px', backgroundColor: colors.light, borderRadius: '2px', marginBottom: '8px', overflow: 'hidden' }}>
          <div style={{ height: '4px', backgroundColor: timerColor, borderRadius: '2px', width: `${timerPct}%`, transition: 'width 1s linear, background-color 0.3s' }} />
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
          {questions.map((_, i) => (
            <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: i < current ? colors.primary : i === current ? colors.primary : colors.light, opacity: i < current ? 0.4 : 1, transition: 'background-color 0.3s' }} />
          ))}
        </div>

        {/* Question */}
        <div className={animateQuestion ? 'slide-in' : ''}>
          <p style={{ fontSize: 'clamp(17px, 4vw, 22px)', color: colors.text, lineHeight: '1.6', marginBottom: '28px', fontFamily: fontDisplay, fontWeight: '700' }}>{q.question_text}</p>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map(opt => {
            const isCorrect = opt.key === q.correct_answer;
            const isUserSelected = opt.key === selected;
            const isBotSelected = opt.key === botAnswer;
            let bg = '#FFFFFF', border = `1px solid rgba(0,0,0,0.08)`, color = colors.text;
            if (isUserSelected && !showResult) { bg = 'rgba(0,0,0,0.08)'; border = `2px solid ${colors.primary}`; }
            if (showResult) {
              if (isCorrect) { bg = '#EAF4EF'; border = '2px solid #2D6A4F'; color = '#1B4332'; }
              else if (isUserSelected) { bg = '#F7F2EB'; border = '2px solid #A68A64'; color = '#6B5635'; }
            }
            return (
              <button
                key={opt.key}
                onClick={() => handleAnswer(opt.key)}
                className={showResult && isUserSelected && !isCorrect && shakeAnswer ? 'shake' : showResult && isCorrect ? 'pulse' : ''}
                style={{
                  padding: '16px', backgroundColor: bg, border, color,
                  fontSize: 'clamp(14px, 3.5vw, 16px)', fontFamily: fontBody,
                  cursor: selected ? 'default' : 'pointer', borderRadius: '8px',
                  textAlign: 'left', minHeight: '54px', WebkitTapHighlightColor: 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background-color 0.2s, border-color 0.2s, transform 0.1s',
                  transform: isUserSelected && !showResult ? 'scale(0.98)' : 'scale(1)',
                  boxShadow: isUserSelected && !showResult ? '0 2px 8px rgba(26,26,26,0.12)' : 'none',
                }}
              >
                <span style={{ flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontWeight: '600', marginRight: '10px', opacity: 0.6 }}>{opt.displayLetter}.</span>{opt.label}
                </span>
                <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {showResult && isCorrect && <span style={{ fontSize: '18px' }}>✓</span>}
                  {showResult && isUserSelected && !isCorrect && <span style={{ fontSize: '18px' }}>✗</span>}
                  {showResult && bot && isUserSelected && <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '8px', padding: '2px 5px', fontSize: '12px' }}>👤</span>}
                  {showResult && bot && isBotSelected && <span style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '8px', padding: '2px 5px', fontSize: '12px' }}>{bot.emoji}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatSelectionLabel(sel: string | undefined): string {
  if (sel === undefined || sel === '' || sel === '__timeout__') return '— (abgelaufen)';
  return sel;
}

function QuestionStarRating({ questionId, userId }: { questionId: string; userId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!questionId || !userId) return;
    let cancelled = false;
    supabase
      .from('question_ratings')
      .select('rating')
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setRating(data.rating);
      });
    return () => { cancelled = true; };
  }, [questionId, userId]);

  const saveRating = async (value: number) => {
    if (!questionId || !userId) return;
    setSaving(true);
    setNote('');
    const updatedAt = new Date().toISOString();

    const { data: existing, error: fetchError } = await supabase
      .from('question_ratings')
      .select('id')
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      setSaving(false);
      const missingTable = fetchError.code === 'PGRST205' || fetchError.message?.includes('question_ratings');
      setNote(missingTable ? 'Bewertungen: Tabelle fehlt (SQL in Supabase ausführen)' : 'Speichern fehlgeschlagen');
      return;
    }

    const { error } = existing?.id
      ? await supabase.from('question_ratings').update({ rating: value, updated_at: updatedAt }).eq('id', existing.id)
      : await supabase.from('question_ratings').insert({
          question_id: questionId,
          user_id: userId,
          rating: value,
        });

    setSaving(false);
    if (error) {
      const missingTable = error.code === 'PGRST205' || error.message?.includes('question_ratings');
      setNote(missingTable ? 'Bewertungen: Tabelle fehlt (SQL in Supabase ausführen)' : 'Speichern fehlgeschlagen');
      return;
    }
    setRating(value);
    setNote('Gespeichert');
    setTimeout(() => setNote(''), 1500);
  };

  const display = hover || rating || 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: colors.muted, marginRight: '4px' }}>Bewerten</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={saving}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => saveRating(n)}
          aria-label={`${n} von 5 Sternen`}
          style={{
            background: 'none',
            border: 'none',
            cursor: saving ? 'default' : 'pointer',
            fontSize: '22px',
            lineHeight: 1,
            padding: '0 2px',
            color: display >= n ? '#B8860B' : 'rgba(0,0,0,0.15)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ★
        </button>
      ))}
      {rating ? <span style={{ fontSize: '11px', color: colors.muted, marginLeft: '4px' }}>{rating}/5</span> : null}
      {note ? <span style={{ fontSize: '11px', color: colors.muted, width: '100%' }}>{note}</span> : null}
    </div>
  );
}

function QuestionReportModal({
  question,
  userId,
  onClose,
}: {
  question: { id: string; question_text: string };
  userId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      setStatus('Bitte kurz beschreiben, was das Problem ist.');
      return;
    }
    setSubmitting(true);
    setStatus('');
    const { error } = await supabase.from('question_reports').insert({
      question_id: question.id,
      reported_by: userId,
      reason: reason.trim(),
      status: 'open',
    });
    setSubmitting(false);
    if (error) {
      setStatus('❌ Meldung konnte nicht gesendet werden.');
      return;
    }
    setStatus('✅ Frage wurde gemeldet. Danke!');
    setTimeout(onClose, 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: colors.bg, borderRadius: '8px', padding: '24px', maxWidth: '500px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: '18px', color: colors.text, marginBottom: '12px', fontFamily: fontBody }}>Frage melden</h3>
        <p style={{ fontSize: '14px', color: colors.text, marginBottom: '12px', lineHeight: 1.5 }}>{question.question_text}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Was ist das Problem mit dieser Frage?"
          style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
        />
        {status ? (
          <p style={{ fontSize: '13px', marginBottom: '12px', color: status.startsWith('✅') ? '#2D6A4F' : '#A68A64' }}>{status}</p>
        ) : null}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" style={{ ...btnPrimary, marginBottom: 0, opacity: submitting ? 0.6 : 1 }} onClick={submit} disabled={submitting}>
            {submitting ? 'Senden…' : 'Melden'}
          </button>
          <button type="button" style={{ ...btnSecondary, marginBottom: 0 }} onClick={onClose} disabled={submitting}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionReviewBlock({
  q,
  questionLabel,
  mySelection,
  myCorrect,
  opponentSelection,
  opponentCorrect,
  myName,
  oppName,
  showOpponent,
  headerRightExtra,
  userId,
}: {
  q: any;
  questionLabel: string;
  mySelection: string;
  myCorrect: boolean;
  opponentSelection?: string;
  opponentCorrect?: boolean;
  myName: string;
  oppName: string;
  showOpponent: boolean;
  headerRightExtra?: string;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter((o: { label: string }) => o.label);
  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px', backgroundColor: '#FFFFFF' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', background: open ? 'rgba(0,0,0,0.04)' : '#FFFFFF',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <span style={{ fontSize: '13px', color: colors.text, fontWeight: '600' }}>{questionLabel}</span>
        <span style={{ fontSize: '12px', color: colors.muted, flexShrink: 0 }}>
          {open ? '▲' : '▼'} {myCorrect ? '✓' : '✗'}
          {headerRightExtra || (showOpponent && opponentCorrect !== undefined ? ` · ${opponentCorrect ? '✓' : '✗'} ${oppName}` : '')}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '14px', color: colors.text, lineHeight: 1.5, marginTop: '12px', marginBottom: '12px' }}>{q.question_text}</p>
          <div style={{ fontSize: '12px', color: colors.muted, marginBottom: '10px' }}>
            <strong style={{ color: colors.text }}>{myName}:</strong> {formatSelectionLabel(mySelection)} {myCorrect ? '✓' : '✗'}
            {showOpponent && opponentSelection !== undefined && (
              <span style={{ display: 'block', marginTop: '4px' }}><strong style={{ color: colors.text }}>{oppName}:</strong> {formatSelectionLabel(opponentSelection)} {opponentCorrect ? '✓' : '✗'}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {options.map((opt: { key: string; label: string }) => {
              const isCorrect = opt.key === q.correct_answer;
              const mine = !!mySelection && opt.key === mySelection;
              const theirs = showOpponent && !!opponentSelection && opt.key === opponentSelection;
              let bg = '#FAFAF8';
              let bd = '1px solid rgba(0,0,0,0.08)';
              if (isCorrect) { bg = '#EAF4EF'; bd = '1px solid #2D6A4F'; }
              else if (mine && !myCorrect) { bg = '#F7F2EB'; bd = '1px solid #A68A64'; }
              return (
                <div key={opt.key} style={{ backgroundColor: bg, border: bd, borderRadius: '6px', padding: '8px 10px', fontSize: '13px', color: colors.text }}>
                  <strong style={{ opacity: 0.6 }}>{opt.key}.</strong> {opt.label}
                  {isCorrect && <span style={{ color: '#2D6A4F', marginLeft: '8px', fontSize: '12px' }}>richtig</span>}
                  {mine && <span style={{ marginLeft: '8px', fontSize: '11px', color: colors.muted }}>({myName})</span>}
                  {theirs && <span style={{ marginLeft: '8px', fontSize: '11px', color: colors.muted }}>({oppName})</span>}
                </div>
              );
            })}
          </div>
          {userId && q?.id ? (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <QuestionStarRating questionId={q.id} userId={userId} />
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  alignSelf: 'flex-start',
                  backgroundColor: 'transparent',
                  border: `1px solid ${colors.primary}`,
                  color: colors.primary,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: fontBody,
                }}
              >
                Frage melden
              </button>
            </div>
          ) : null}
        </div>
      )}
      {reportOpen && userId && q?.id ? (
        <QuestionReportModal
          question={{ id: q.id, question_text: q.question_text }}
          userId={userId}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}

type BotRoundReview = {
  round: number;
  subcategoryName: string;
  groupNumber?: number;
  userAnswers: boolean[];
  botAnswers: boolean[];
  questions: any[];
  userSelections: string[];
};

function BotDuelRoundsOverview({ rounds, opponentShort, userId }: { rounds: BotRoundReview[]; opponentShort: string; userId: string }) {
  if (rounds.length === 0) return null;
  return (
    <div style={{ textAlign: 'left', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '14px', color: colors.text, letterSpacing: '1px', marginBottom: '12px', fontWeight: 'bold' }}>RUNDENÜBERSICHT</h3>
      {rounds.map((r) => (
        <div key={r.round} style={{ marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '10px' }}>
            Runde {r.round} · {r.subcategoryName}{r.groupNumber != null ? ` · Gruppe ${r.groupNumber}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            {r.userAnswers.map((uOk, qi) => (
              <div key={qi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: colors.muted }}>
                <span>Frage {qi + 1}</span>
                <span>
                  <span style={{ color: uOk ? '#2D6A4F' : '#A68A64', fontWeight: 'bold' }}>Du {uOk ? '✓' : '✗'}</span>
                  <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
                  <span style={{ color: r.botAnswers[qi] ? '#2D6A4F' : '#A68A64', fontWeight: 'bold' }}>{opponentShort} {r.botAnswers[qi] ? '✓' : '✗'}</span>
                </span>
              </div>
            ))}
          </div>
          {(r.questions || []).map((q: any, qi: number) => (
            <QuestionReviewBlock
              key={q.id || `${r.round}-${qi}`}
              q={q}
              questionLabel={`Frage ${qi + 1}`}
              mySelection={r.userSelections[qi] || ''}
              myCorrect={!!r.userAnswers[qi]}
              myName="Du"
              oppName={opponentShort}
              showOpponent={false}
              headerRightExtra={` · ${opponentShort} ${r.botAnswers[qi] ? '✓' : '✗'}`}
              userId={userId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function UserDuelRoundsOverview({
  rounds,
  questionsByRound,
  myName,
  oppName,
  isChallenger,
  userId,
}: {
  rounds: any[];
  questionsByRound: any[][];
  myName: string;
  oppName: string;
  isChallenger: boolean;
  userId: string;
}) {
  if (!rounds.length) return null;
  return (
    <div style={{ textAlign: 'left', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '14px', color: colors.text, letterSpacing: '1px', marginBottom: '12px', fontWeight: 'bold' }}>RUNDENÜBERSICHT</h3>
      {rounds.map((r: any, ri: number) => {
        const myAns = isChallenger ? r.challenger_answers : r.opponent_answers;
        const oppAns = isChallenger ? r.opponent_answers : r.challenger_answers;
        const mySel = isChallenger ? r.challenger_selections : r.opponent_selections;
        const oppSel = isChallenger ? r.opponent_selections : r.challenger_selections;
        const qs = questionsByRound[ri] || [];
        return (
          <div key={ri} style={{ marginBottom: '18px', paddingBottom: '14px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '10px' }}>
              Runde {r.round} · {r.subcategory_name} · Gruppe {r.group_number}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {(myAns || []).map((uOk: boolean, qi: number) => (
                <div key={qi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: colors.muted }}>
                  <span>Frage {qi + 1}</span>
                  <span>
                    <span style={{ color: uOk ? '#2D6A4F' : '#A68A64', fontWeight: 'bold' }}>{myName} {uOk ? '✓' : '✗'}</span>
                    <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
                    <span style={{ color: oppAns?.[qi] ? '#2D6A4F' : '#A68A64', fontWeight: 'bold' }}>{oppName} {oppAns?.[qi] ? '✓' : '✗'}</span>
                  </span>
                </div>
              ))}
            </div>
            {qs.map((q: any, qi: number) => (
              <QuestionReviewBlock
                key={q.id || `${r.round}-${qi}`}
                q={q}
                questionLabel={`Frage ${qi + 1}`}
                mySelection={mySel?.[qi] || ''}
                myCorrect={!!myAns?.[qi]}
                opponentSelection={oppSel?.[qi] || ''}
                opponentCorrect={!!oppAns?.[qi]}
                myName={myName}
                oppName={oppName}
                showOpponent
                userId={userId}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function IntermediateScore({
  myTotal,
  botTotal,
  roundsPlayed,
  onContinue,
  roundSummaries,
  opponentShort,
  opponentName,
  opponentEmoji,
  userId,
}: {
  myTotal: number;
  botTotal: number;
  roundsPlayed: number;
  onContinue: () => void;
  roundSummaries: BotRoundReview[];
  opponentShort: string;
  opponentName: string;
  opponentEmoji: string;
  userId: string;
}) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px 16px 32px', fontFamily: 'Helvetica, Arial, sans-serif', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', maxWidth: '560px', width: '100%', margin: '0 auto' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
          <TabStatsIcon size={42} stroke={colors.primary} />
        </div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>NACH {roundsPlayed} RUNDEN</h2>
        <p style={{ color: colors.muted, marginBottom: '24px', fontSize: '13px', letterSpacing: '1px' }}>ZWISCHENSTAND</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: '2px solid rgba(0,0,0,0.08)', padding: '20px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * QUESTIONS_PER_ROUND} richtig</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', border: '2px solid rgba(0,0,0,0.08)', padding: '20px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '22px', marginBottom: '6px', lineHeight: 1 }}>{opponentEmoji}</div>
            <div style={{ fontSize: '11px', color: colors.text, letterSpacing: '0.5px', marginBottom: '6px', lineHeight: 1.35, fontWeight: 600 }}>{opponentName}</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * QUESTIONS_PER_ROUND} richtig</div>
          </div>
        </div>
        <button type="button" style={{ ...btnPrimary, marginBottom: '24px' }} onClick={onContinue}>Weiter</button>
        <div style={{ textAlign: 'left' }}>
          <BotDuelRoundsOverview rounds={roundSummaries} opponentShort={opponentShort} userId={userId} />
        </div>
      </div>
    </div>
  );
}

function BotDuelGame({ duel, userId, onFinish }: { duel: any, userId: string, onFinish: () => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundUserAnswers, setRoundUserAnswers] = useState<boolean[][]>([]);
  const [roundBotAnswers, setRoundBotAnswers] = useState<boolean[][]>([]);
  const [roundSubcategories, setRoundSubcategories] = useState<any[]>([]);
  const [roundQuestionsPlayed, setRoundQuestionsPlayed] = useState<any[][]>([]);
  const [roundUserSelectionsPlayed, setRoundUserSelectionsPlayed] = useState<string[][]>([]);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<'selectSub' | 'playing' | 'intermediate'>('selectSub');
  const [userPickOptions, setUserPickOptions] = useState<any[]>([]);
  const [eligibleBotSubs, setEligibleBotSubs] = useState<any[]>([]);
  const [pickOptionsLoading, setPickOptionsLoading] = useState(false);
  const [playedGroupsCache, setPlayedGroupsCache] = useState<string[]>([]);
  const [botCategoryPicking, setBotCategoryPicking] = useState(false);
  const [botPickedSub, setBotPickedSub] = useState<any>(null);
  const botCategoryPickStarted = React.useRef(false);

  const opponentName = bots.find(b => b.level === duel.bot_level)?.name || 'Bot';
  const opponentEmoji = bots.find(b => b.level === duel.bot_level)?.emoji || '🤖';
  const bot = bots.find(b => b.level === duel.bot_level) || { name: 'Gegner', emoji: '👤', accuracy: 0.5 };
  const userChoosesThisRound = currentRound === 1 || currentRound === 3;

  useEffect(() => {
    if (phase !== 'selectSub' || loading) return;
    let cancelled = false;
    setPickOptionsLoading(true);
    (async () => {
      const playedSubIds = roundSubcategories.map(s => s.id);
      const { pickOptions, allEligible } = await buildDuelSubcategoryPickOptions(duel.category_id, playedSubIds, [userId]);
      if (cancelled) return;
      setUserPickOptions(pickOptions);
      setEligibleBotSubs(allEligible);
      setPickOptionsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [phase, currentRound, duel.category_id, userId, roundSubcategories, loading]);

  useEffect(() => {
    if (phase !== 'selectSub' || userChoosesThisRound || eligibleBotSubs.length === 0 || pickOptionsLoading) {
      setBotCategoryPicking(false);
      setBotPickedSub(null);
      return;
    }
    botCategoryPickStarted.current = false;
    const randomSub = eligibleBotSubs[Math.floor(Math.random() * eligibleBotSubs.length)];
    setBotPickedSub(randomSub);
    setBotCategoryPicking(true);
  }, [phase, userChoosesThisRound, eligibleBotSubs, currentRound, pickOptionsLoading]);

  const loadQuestionsForSub = async (sub: any) => {
    setLoading(true);
    setRoundSubcategories(prev => [...prev, sub]);

    const selectedGroup = await findBestGroupWithCache(sub.id, [userId], playedGroupsCache);
    if (!selectedGroup) {
      setQuestions([]);
      setLoading(false);
      setPhase('playing');
      return;
    }

    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', selectedGroup.id)
      .order('position', { ascending: true });

    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    const { error: insertError } = await supabase.from('played_groups').insert({ user_id: userId, group_id: selectedGroup.id });
    if (insertError) console.error('played_groups insert failed:', insertError);
    else setPlayedGroupsCache(prev => [...prev, selectedGroup.id]);

    setRoundSubcategories(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...sub, group_number: selectedGroup.group_number };
      return updated;
    });

    setQuestions(groupQuestions);
    setLoading(false);
    setPhase('playing');
  };

  const handleBotCategoryPickComplete = React.useCallback(() => {
    if (!botPickedSub || botCategoryPickStarted.current) return;
    botCategoryPickStarted.current = true;
    setBotCategoryPicking(false);
    const sub = botPickedSub;
    setBotPickedSub(null);
    loadQuestionsForSub(sub);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botPickedSub]);

  const findBestGroupWithCache = async (subcategoryId: string, userIds: string[], localCache: string[]) => {
    const { data: allGroups } = await supabase
      .from('question_groups')
      .select('id, group_number')
      .eq('subcategory_id', subcategoryId)
      .order('group_number', { ascending: true });

    if (!allGroups || allGroups.length === 0) return null;

    const allGroupIds = allGroups.map(g => g.id);
    const { data: playedData } = await supabase
      .from('played_groups')
      .select('group_id')
      .in('user_id', userIds)
      .in('group_id', allGroupIds);

    const playCount: Record<string, number> = {};
    allGroups.forEach(g => { playCount[g.id] = 0; });
    playedData?.forEach(p => {
      playCount[p.group_id] = (playCount[p.group_id] || 0) + 1;
    });
    localCache.forEach(gid => {
      if (playCount[gid] !== undefined) playCount[gid]++;
    });

    const minCount = Math.min(...allGroups.map(g => playCount[g.id]));
    const candidate = allGroups.find(g => playCount[g.id] === minCount);
    return candidate || allGroups[0];
  };

  const handleRoundComplete = async (userAnswers: boolean[], botAnswers: boolean[] | null, selectedAnswers?: string[]) => {
    setRoundQuestionsPlayed(prev => [...prev, questions.map((q: any) => ({ ...q }))]);
    setRoundUserSelectionsPlayed(prev => [...prev, selectedAnswers || []]);
    const newRoundUserAnswers = [...roundUserAnswers, userAnswers];
    const newRoundBotAnswers = [...roundBotAnswers, botAnswers || []];
    setRoundUserAnswers(newRoundUserAnswers);
    setRoundBotAnswers(newRoundBotAnswers);

    const myTotal = newRoundUserAnswers.flat().filter(Boolean).length;
    const botTotal = newRoundBotAnswers.flat().filter(Boolean).length;

    if (currentRound < TOTAL_ROUNDS) {
      if (currentRound === 2) {
        setPhase('intermediate');
      } else {
        setCurrentRound(r => r + 1);
        setPhase('selectSub');
        setQuestions([]);
      }
    } else {
      await supabase.from('scores').insert({
        user_id: userId,
        category_id: duel.category_id,
        points: myTotal * 10,
        correct_count: myTotal,
        total_questions: TOTAL_ROUNDS * QUESTIONS_PER_ROUND,
      });
      await supabase.from('duels').update({
        status: 'completed',
        challenger_score: myTotal,
        opponent_score: botTotal,
        completed_at: new Date().toISOString(),
      }).eq('id', duel.id);
      setDone(true);
    }
  };

  const handleIntermediateContinue = () => {
    setCurrentRound(r => r + 1);
    setPhase('selectSub');
    setQuestions([]);
  };

  if (done) {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    const totalQ = TOTAL_ROUNDS * QUESTIONS_PER_ROUND;
    const won = myTotal > botTotal;
    const draw = myTotal === botTotal;
    const nR = roundUserAnswers.length;
    const oppShort = shortBotDisplayName(opponentName);
    const finalSummaries: BotRoundReview[] = Array.from({ length: nR }, (_, i) => ({
      round: i + 1,
      subcategoryName: roundSubcategories[i]?.name || '—',
      groupNumber: roundSubcategories[i]?.group_number,
      userAnswers: roundUserAnswers[i] || [],
      botAnswers: roundBotAnswers[i] || [],
      questions: roundQuestionsPlayed[i] || [],
      userSelections: roundUserSelectionsPlayed[i] || [],
    }));

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px 16px 40px', fontFamily: 'Helvetica, Arial, sans-serif', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', maxWidth: '560px', width: '100%', margin: '0 auto' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
          <p style={{ color: colors.muted, marginBottom: '24px', fontSize: '13px', letterSpacing: '1px' }}>4 RUNDEN ABGESCHLOSSEN</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#FFFFFF', border: `2px solid ${won || draw ? colors.primary : 'rgba(0,0,0,0.12)'}`, padding: '20px 12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', border: `2px solid ${!won && !draw ? colors.primary : 'rgba(0,0,0,0.12)'}`, padding: '20px 12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{opponentEmoji}</div>
              <div style={{ fontSize: '11px', color: colors.text, letterSpacing: '0.5px', marginBottom: '6px', lineHeight: 1.35, fontWeight: 600 }}>{opponentName}</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <BotDuelRoundsOverview rounds={finalSummaries} opponentShort={oppShort} userId={userId} />
          </div>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'intermediate') {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    const intSummaries: BotRoundReview[] = roundSubcategories.slice(0, currentRound).map((sub, i) => ({
      round: i + 1,
      subcategoryName: sub?.name || '—',
      groupNumber: sub?.group_number,
      userAnswers: roundUserAnswers[i] || [],
      botAnswers: roundBotAnswers[i] || [],
      questions: roundQuestionsPlayed[i] || [],
      userSelections: roundUserSelectionsPlayed[i] || [],
    }));
    const oppShort = shortBotDisplayName(opponentName);
    return (
      <IntermediateScore
        myTotal={myTotal}
        botTotal={botTotal}
        roundsPlayed={currentRound}
        onContinue={handleIntermediateContinue}
        roundSummaries={intSummaries}
        opponentShort={oppShort}
        opponentName={opponentName}
        opponentEmoji={opponentEmoji}
        userId={userId}
      />
    );
  }

  if (phase === 'selectSub') {
    if (!userChoosesThisRound) {
      if (pickOptionsLoading && eligibleBotSubs.length === 0) {
        return (
          <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
          </div>
        );
      }
      if (!pickOptionsLoading && eligibleBotSubs.length === 0) {
        return (
          <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
            <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '24px', textAlign: 'center' }}>Kein Thema verfügbar für die Bot-Runde.</p>
            <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück zum Dashboard</button>
          </div>
        );
      }
      if (botCategoryPicking && botPickedSub) {
        return (
          <BotCategoryPickFlow
            emoji={opponentEmoji}
            name={opponentName}
            subcategoryName={botPickedSub.name}
            onComplete={handleBotCategoryPickComplete}
          />
        );
      }
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <p style={{ color: colors.muted, letterSpacing: '2px' }}>{shortBotDisplayName(opponentName).toUpperCase()} WÄHLT...</p>
        </div>
      );
    }
    if (pickOptionsLoading) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
        </div>
      );
    }
    if (userPickOptions.length === 0) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
          <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '24px', textAlign: 'center' }}>Keine passenden Themen für diese Runde.<br />Es braucht Subkategorien mit Fragengruppen, die du noch nicht gespielt hast.</p>
          <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      );
    }
    const opts = userPickOptions.slice(0, 4);
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
          <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', marginTop: '20px' }}>RUNDE {currentRound} VON {TOTAL_ROUNDS}</p>
          <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Du wählst das Thema</h2>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Für diese Runde — wähle eine von vier Themen</p>
          <div style={{ display: 'grid', gridTemplateColumns: opts.length >= 4 ? '1fr 1fr' : opts.length === 3 ? '1fr 1fr' : '1fr', gap: '12px' }}>
            {opts.map((sub, idx) => (
              <div key={sub.id} onClick={() => loadQuestionsForSub(sub)} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', padding: '20px 16px', cursor: 'pointer', borderRadius: '8px', minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gridColumn: opts.length === 3 && idx === 2 ? 'span 2' : 'auto' }}>
                <div style={{ color: colors.text, fontSize: '15px', fontWeight: 'bold', marginBottom: '6px' }}>{sub.name}</div>
                <div style={{ color: colors.muted, fontSize: '12px' }}>{sub.question_count} Fragen</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (questions.length < QUESTIONS_PER_ROUND) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '24px', textAlign: 'center' }}>Zu wenige Fragen in "{roundSubcategories[currentRound - 1]?.name}".<br />Bitte zuerst Fragen hinzufügen und Gruppen erstellen.</p>
      <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück zum Dashboard</button>
    </div>
  );

  return (
    <div>
      <div style={{ backgroundColor: colors.light, padding: '8px 16px', fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center' }}>
        <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
          {roundSubcategories[currentRound - 1]?.name.toUpperCase()}
          {roundSubcategories[currentRound - 1]?.group_number && ` · GRUPPE ${roundSubcategories[currentRound - 1].group_number}`}
          {' · '}
          {userChoosesThisRound ? 'DEINE WAHL' : `${shortBotDisplayName(opponentName).toUpperCase()} HAT GEWÄHLT`}
        </span>
      </div>
      <QuizRound questions={questions} roundNumber={currentRound} totalRounds={TOTAL_ROUNDS} bot={bot} userId={userId} onRoundComplete={handleRoundComplete} />
    </div>
  );
}

function UserDuelGame({ duel, userId, onFinish }: { duel: any, userId: string, onFinish: () => void }) {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'overview' | 'selectSub' | 'playing' | 'waiting' | 'done'>('overview');
  const [availableSubs, setAvailableSubs] = useState<any[]>([]);
  const [currentQuestions, setCurrentQuestions] = useState<any[]>([]);
  const [currentRoundInfo, setCurrentRoundInfo] = useState<any>(null);
  const [opponentProfile, setOpponentProfile] = useState<any>(null);
  const [duelData, setDuelData] = useState<any>(duel);
  const [playedGroupIdsInDuel, setPlayedGroupIdsInDuel] = useState<string[]>([]);
  const [reviewQuestionsByRound, setReviewQuestionsByRound] = useState<any[][]>([]);

  const isChallenger = duel.challenger_id === userId;
  const opponentId = isChallenger ? duel.opponent_id : duel.challenger_id;
  const roundsData = duelData.rounds_data || [];

  useEffect(() => {
    if (phase !== 'done') return;
    const rounds = duelData.rounds_data || [];
    if (!rounds.length) return;
    let cancelled = false;
    setReviewQuestionsByRound([]);
    (async () => {
      const all: any[][] = [];
      for (const r of rounds) {
        if (!r.group_id) {
          all.push([]);
          continue;
        }
        const { data: members } = await supabase
          .from('question_group_members')
          .select('position, questions(*)')
          .eq('group_id', r.group_id)
          .order('position', { ascending: true });
        all.push(members?.map((m: any) => m.questions).filter(Boolean) || []);
      }
      if (!cancelled) setReviewQuestionsByRound(all);
    })();
    return () => { cancelled = true; };
  }, [phase, duelData.id, duelData.rounds_data]);

  const loadInit = async () => {
    setLoading(true);
    const { data: oppProfile } = await supabase.from('profiles').select('username').eq('id', opponentId).single();
    setOpponentProfile(oppProfile);
  
    const alreadyPlayedSubIds = roundsData.map((r: any) => r.subcategory_id);
    const { pickOptions } = await buildDuelSubcategoryPickOptions(duel.category_id, alreadyPlayedSubIds, [userId, opponentId]);
    setAvailableSubs(pickOptions);
    setLoading(false);
  
    determineNextPhase(roundsData);
  };
  useEffect(() => {
    loadInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.id]);
  const determineNextPhase = (rounds: any[]) => {
    if (rounds.length === TOTAL_ROUNDS && rounds[TOTAL_ROUNDS - 1].challenger_answers && rounds[TOTAL_ROUNDS - 1].opponent_answers) {
      setPhase('done');
      return;
    }
    if (duelData.current_turn_user_id !== userId) {
      setPhase('waiting');
      return;
    }
    setPhase('overview');
  };

  const selectSubAndPlay = async (sub: any) => {
    setLoading(true);
    
    const currentRound = roundsData.length;
    const isNewRound = roundsData.length < TOTAL_ROUNDS && (
      currentRound === 0 || 
      (roundsData[currentRound - 1]?.challenger_answers && roundsData[currentRound - 1]?.opponent_answers)
    );

    let selectedGroup: { id: string; group_number: number } | null = null;
    let roundData: any;

    if (isNewRound) {
      const existingGroupIds = roundsData.map((r: any) => r.group_id).filter(Boolean);
      selectedGroup = await findBestGroup(sub.id, [userId, opponentId], [...existingGroupIds, ...playedGroupIdsInDuel]);
      if (!selectedGroup) {
        setLoading(false);
        return;
      }
      setPlayedGroupIdsInDuel(prev => [...prev, selectedGroup!.id]);
      roundData = {
        round: currentRound + 1,
        subcategory_id: sub.id,
        subcategory_name: sub.name,
        group_id: selectedGroup.id,
        group_number: selectedGroup.group_number,
        chosen_by: userId,
      };
    } else {
      const existingRound = roundsData[currentRound - 1];
      selectedGroup = { id: existingRound.group_id, group_number: existingRound.group_number };
      roundData = existingRound;
    }

    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', selectedGroup.id)
      .order('position', { ascending: true });
    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    const { data: alreadyPlayed } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', selectedGroup.id).maybeSingle();
    if (!alreadyPlayed) {
      await supabase.from('played_groups').insert({ user_id: userId, group_id: selectedGroup.id });
    }

    setCurrentQuestions(groupQuestions);
    setCurrentRoundInfo(roundData);
    setLoading(false);
    setPhase('playing');
  };

  const playExistingRound = async () => {
    setLoading(true);
    const currentRound = roundsData[roundsData.length - 1];
    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', currentRound.group_id)
      .order('position', { ascending: true });
    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    const { data: alreadyPlayed } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', currentRound.group_id).maybeSingle();
    if (!alreadyPlayed) {
      await supabase.from('played_groups').insert({ user_id: userId, group_id: currentRound.group_id });
    }

    setCurrentQuestions(groupQuestions);
    setCurrentRoundInfo(currentRound);
    setLoading(false);
    setPhase('playing');
  };

  const handleRoundComplete = async (userAnswers: boolean[], _bot: any, selectedAnswers: string[]) => {
    // Optimistic update — UI reagiert sofort
    const optimisticRoundsData = [...roundsData];
    const optIdx = optimisticRoundsData.findIndex((r: any) => r.round === currentRoundInfo?.round);
    if (optIdx !== -1) {
      optimisticRoundsData[optIdx] = {
        ...optimisticRoundsData[optIdx],
        [isChallenger ? 'challenger_answers' : 'opponent_answers']: userAnswers,
        [isChallenger ? 'challenger_selections' : 'opponent_selections']: selectedAnswers,
      };
    }
    setDuelData((prev: any) => ({ ...prev, rounds_data: optimisticRoundsData }));
    setLoading(true);

    const currentRound = currentRoundInfo.round;
    const newRoundsData = [...roundsData];
    const roundIdx = newRoundsData.findIndex((r: any) => r.round === currentRound);

    if (roundIdx === -1) {
      newRoundsData.push({
        ...currentRoundInfo,
        [isChallenger ? 'challenger_answers' : 'opponent_answers']: userAnswers,
        [isChallenger ? 'challenger_selections' : 'opponent_selections']: selectedAnswers,
      });
    } else {
      newRoundsData[roundIdx] = {
        ...newRoundsData[roundIdx],
        [isChallenger ? 'challenger_answers' : 'opponent_answers']: userAnswers,
        [isChallenger ? 'challenger_selections' : 'opponent_selections']: selectedAnswers,
      };
    }

    const lastRound = newRoundsData[newRoundsData.length - 1];
    const bothAnswered = lastRound.challenger_answers && lastRound.opponent_answers;
    
    let newStatus = duelData.status;
    let newTurnUserId = duelData.current_turn_user_id;
    
    if (newRoundsData.length === TOTAL_ROUNDS && bothAnswered) {
      newStatus = 'completed';
    } else if (bothAnswered) {
      const nextRound = newRoundsData.length + 1;
      newTurnUserId = whoChoosesRound(nextRound);
    } else {
      newTurnUserId = userId === duel.challenger_id ? duel.opponent_id : duel.challenger_id;
    }

    const challengerScore = newRoundsData.reduce((sum: number, r: any) => sum + (r.challenger_answers?.filter(Boolean).length || 0), 0);
    const opponentScore = newRoundsData.reduce((sum: number, r: any) => sum + (r.opponent_answers?.filter(Boolean).length || 0), 0);

    const { error } = await supabase.from('duels').update({
      rounds_data: newRoundsData,
      status: newStatus,
      current_turn_user_id: newStatus === 'completed' ? null : newTurnUserId,
      challenger_score: challengerScore,
      opponent_score: opponentScore,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', duelData.id);

    if (error) {
      console.error('Failed to update duel:', error);
    }

    if (newStatus !== 'completed' && newTurnUserId === opponentId) {
      const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
      await supabase.from('notifications').insert({
        user_id: opponentId,
        type: 'duel_turn',
        title: 'Du bist dran!',
        message: `${myProfile?.username} hat eine Runde beendet - du bist jetzt am Zug`,
        related_id: duelData.id,
      });
    } else if (newStatus === 'completed') {
      const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
      await supabase.from('notifications').insert({
        user_id: opponentId,
        type: 'duel_completed',
        title: 'Duell beendet',
        message: `Das Duell gegen ${myProfile?.username} ist fertig - schau dir das Ergebnis an!`,
        related_id: duelData.id,
      });
    }

    setDuelData({
      ...duelData,
      rounds_data: newRoundsData,
      status: newStatus,
      current_turn_user_id: newStatus === 'completed' ? null : newTurnUserId,
    });

    setLoading(false);

    if (newStatus === 'completed') {
      setPhase('done');
    } else if (newTurnUserId === userId) {
      setPhase('overview');
    } else {
      setPhase('waiting');
    }
  };

  const whoChoosesRound = (round: number) => round === 1 || round === 3 ? duel.challenger_id : duel.opponent_id;

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (phase === 'done') {
    const challengerScore = roundsData.reduce((sum: number, r: any) => sum + (r.challenger_answers?.filter(Boolean).length || 0), 0);
    const opponentScore = roundsData.reduce((sum: number, r: any) => sum + (r.opponent_answers?.filter(Boolean).length || 0), 0);
    const myScore = isChallenger ? challengerScore : opponentScore;
    const oppScore = isChallenger ? opponentScore : challengerScore;
    const won = myScore > oppScore;
    const draw = myScore === oppScore;
    const totalQ = TOTAL_ROUNDS * QUESTIONS_PER_ROUND;
    const oppName = opponentProfile?.username || 'Gegner';

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px 16px 40px', fontFamily: 'Helvetica, Arial, sans-serif', overflowY: 'auto' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center', paddingTop: '24px' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
          <p style={{ color: colors.muted, marginBottom: '24px', fontSize: '13px', letterSpacing: '1px' }}>4 RUNDEN ABGESCHLOSSEN</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#FFFFFF', border: `2px solid ${won || draw ? colors.primary : 'rgba(0,0,0,0.12)'}`, padding: '20px 12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', border: `2px solid ${!won && !draw ? colors.primary : 'rgba(0,0,0,0.12)'}`, padding: '20px 12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{opponentProfile?.username?.toUpperCase() || 'GEGNER'}</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{oppScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            {roundsData.length === 0 ? null : reviewQuestionsByRound.length === roundsData.length ? (
              reviewQuestionsByRound.some(qs => qs.length > 0) ? (
                <UserDuelRoundsOverview
                  rounds={roundsData}
                  questionsByRound={reviewQuestionsByRound}
                  myName="Du"
                  oppName={oppName}
                  isChallenger={isChallenger}
                  userId={userId}
                />
              ) : (
                <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>Fragen für die Übersicht konnten nicht geladen werden.</p>
              )
            ) : (
              <p style={{ color: colors.muted, fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>Runden und Fragen werden geladen…</p>
            )}
          </div>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>⏳</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '12px', fontSize: 'clamp(18px, 5vw, 24px)' }}>WARTEN AUF GEGNER</h2>
          <p style={{ color: colors.text, fontSize: '15px', marginBottom: '24px' }}>{opponentProfile?.username} ist jetzt am Zug</p>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '32px' }}>Du bekommst eine Benachrichtigung sobald du wieder dran bist.</p>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'playing') {
    const roundNum = currentRoundInfo.round;
    return (
      <div>
        <div style={{ backgroundColor: colors.light, padding: '8px 16px', fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
            {currentRoundInfo.subcategory_name.toUpperCase()} · GRUPPE {currentRoundInfo.group_number}
          </span>
        </div>
        <QuizRound questions={currentQuestions} roundNumber={roundNum} totalRounds={TOTAL_ROUNDS} bot={null} userId={userId} onRoundComplete={handleRoundComplete} />
      </div>
    );
  }

  const currentRound = roundsData.length;
  const lastRound = currentRound > 0 ? roundsData[currentRound - 1] : null;
  const needsToPlayExistingRound = lastRound && !(isChallenger ? lastRound.challenger_answers : lastRound.opponent_answers);

  if (needsToPlayExistingRound) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
          <button onClick={onFinish} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
          <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px' }}>RUNDE {lastRound.round} VON {TOTAL_ROUNDS}</p>
          <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>{opponentProfile?.username} hat gewählt</h2>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Thema: {lastRound.subcategory_name} · Gruppe {lastRound.group_number}</p>
          <button style={btnPrimary} onClick={playExistingRound}>Runde spielen</button>
        </div>
      </div>
    );
  }

  const nextRound = currentRound + 1;
  const userShouldChoose = whoChoosesRound(nextRound) === userId;

  if (!userShouldChoose) {
    setPhase('waiting');
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onFinish} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px' }}>RUNDE {nextRound} VON {TOTAL_ROUNDS}</p>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Du wählst das Thema</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Gegen {opponentProfile?.username}</p>
        <div style={{ display: 'grid', gridTemplateColumns: availableSubs.length >= 4 ? '1fr 1fr' : availableSubs.length === 3 ? '1fr 1fr' : '1fr', gap: '12px' }}>
          {availableSubs.slice(0, 4).map((sub, idx) => (
            <div key={sub.id} onClick={() => selectSubAndPlay(sub)} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', padding: '20px 16px', cursor: 'pointer', borderRadius: '8px', minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gridColumn: availableSubs.length === 3 && idx === 2 ? 'span 2' : 'auto' }}>
              <div style={{ color: colors.text, fontSize: '15px', fontWeight: 'bold', marginBottom: '6px' }}>{sub.name}</div>
              <div style={{ color: colors.muted, fontSize: '12px' }}>{sub.question_count} Fragen</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DuelsList({ userId, onOpenDuel, onBack, onNewUserDuel }: { userId: string, onOpenDuel: (duel: any) => void, onBack: () => void, onNewUserDuel: () => void }) {
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDuels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadDuels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('duels')
      .select(`
        *,
        challenger:profiles!duels_challenger_id_fkey(id, username),
        opponent:profiles!duels_opponent_id_fkey(id, username),
        categories(name)
      `)
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .eq('opponent_is_bot', false)
      .order('created_at', { ascending: false });
    setDuels(data || []);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>USER-DUELLE</h2>
        
        <button style={btnPrimary} onClick={onNewUserDuel}>+ Neues Duell starten</button>
        
        {loading ? (
          <p style={{ color: colors.muted, textAlign: 'center', marginTop: '24px' }}>LADEN...</p>
        ) : duels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚔️</div>
            <p style={{ color: colors.muted, fontSize: '15px' }}>Noch keine Duelle</p>
          </div>
        ) : (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {duels.map((d) => {
              const isChallenger = d.challenger_id === userId;
              const opponent = isChallenger ? d.opponent : d.challenger;
              const myScore = isChallenger ? (d.challenger_score || 0) : (d.opponent_score || 0);
              const oppScore = isChallenger ? (d.opponent_score || 0) : (d.challenger_score || 0);
              const isMyTurn = d.current_turn_user_id === userId;
              const isDone = d.status === 'completed';
              
              let statusText = '';
              let statusColor = colors.muted;
              if (isDone) {
                if (myScore > oppScore) { statusText = 'Gewonnen 🏆'; statusColor = '#2D6A4F'; }
                else if (myScore < oppScore) { statusText = 'Verloren'; statusColor = '#A68A64'; }
                else { statusText = 'Unentschieden'; statusColor = colors.muted; }
              } else if (isMyTurn) {
                statusText = 'Du bist dran!';
                statusColor = colors.primary;
              } else {
                statusText = `Warte auf ${opponent?.username}`;
              }

              return (
                <div key={d.id} onClick={() => onOpenDuel(d)} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${isMyTurn && !isDone ? colors.primary : '#C9B99A'}`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold' }}>vs {opponent?.username}</div>
                    {isDone && <div style={{ fontSize: '14px', color: colors.text }}>{myScore} : {oppScore}</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                    <div style={{ fontSize: '13px', color: statusColor, fontWeight: isMyTurn && !isDone ? 'bold' : 'normal' }}>{statusText}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UserDuelCategorySelect({ opponent, userId, onBack, onStart }: { opponent: any, userId: string, onBack: () => void, onStart: (duel: any) => void }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: cats } = await supabase.from('categories').select('*');
      const catsWithCounts: any[] = [];
      for (const cat of cats || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
        catsWithCounts.push({ ...cat, question_count: count || 0 });
      }
      setCategories(catsWithCounts);
      setLoading(false);
    };
    load();
  }, []);

  const startDuel = async (category: any) => {
    const { data, error } = await supabase.from('duels').insert({
      challenger_id: userId,
      opponent_id: opponent.id,
      opponent_is_bot: false,
      category_id: category.id,
      status: 'challenger_turn',
      current_turn_user_id: userId,
      rounds_data: [],
    }).select('*, categories(name)').single();

    if (error) {
      console.error(error);
      alert('Fehler beim Erstellen des Duells');
      return;
    }

    const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
    await supabase.from('notifications').insert({
      user_id: opponent.id,
      type: 'duel_challenge',
      title: 'Neue Duell-Herausforderung',
      message: `${myProfile?.username} hat dich zum Duell herausgefordert in ${category.name}`,
      related_id: data.id,
    });

    onStart(data);
  };

  const icons: Record<string, string> = {
    'Geschichte der Schweiz': '🇨🇭',
    'Philosophie & Denker': '💭',
    'Weltgeschichte': '🌍',
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Duell gegen {opponent.username}</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>Wähle eine Kategorie</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => startDuel(cat)} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', padding: '20px 16px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '28px' }}>{icons[cat.name] || '📚'}</div>
                <div style={{ color: colors.text, fontSize: '16px' }}>{cat.name}</div>
              </div>
              <div style={{ color: colors.muted, fontSize: '14px' }}>{cat.question_count} Fragen</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


interface BeforeInstallPromptEventStub extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function Profile({ userId, onChallenge, onLogout }: { userId: string, onChallenge: (opp: any) => void, onLogout: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [searching, setSearching] = useState(false);
  const [pwaDeferred, setPwaDeferred] = useState<BeforeInstallPromptEventStub | null>(null);
  const [pwaStandalone, setPwaStandalone] = useState(false);
  const [pwaInstallNote, setPwaInstallNote] = useState('');
  const [pwaHelpOpen, setPwaHelpOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const updateStandalone = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      setPwaStandalone(mq.matches || nav.standalone === true);
    };
    updateStandalone();
    mq.addEventListener('change', updateStandalone);

    const onBip = (e: Event) => {
      e.preventDefault();
      setPwaDeferred(e as BeforeInstallPromptEventStub);
      setPwaInstallNote('');
    };
    const onInstalled = () => {
      setPwaDeferred(null);
      setPwaInstallNote('App wurde hinzugefügt.');
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      mq.removeEventListener('change', updateStandalone);
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIosSafariLike =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const handlePwaInstallClick = async () => {
    if (!pwaDeferred) return;
    setPwaInstallNote('');
    try {
      await pwaDeferred.prompt();
      const { outcome } = await pwaDeferred.userChoice;
      setPwaDeferred(null);
      setPwaInstallNote(outcome === 'accepted' ? 'Wird zum Startbildschirm hinzugefügt …' : '');
    } catch {
      setPwaInstallNote('Installation konnte nicht gestartet werden.');
    }
  };

  useEffect(() => {
    if (pwaDeferred) setPwaHelpOpen(false);
  }, [pwaDeferred]);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => setProfile(data));
    loadFriends();
    loadPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(id, username), addressee:profiles!friendships_addressee_id_fkey(id, username)')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');
    setFriends(data || []);
  };

  const loadPendingRequests = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(id, username)')
      .eq('addressee_id', userId)
      .eq('status', 'pending');
    setPendingRequests(data || []);
  };

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;
    setSearching(true);
    setSearchMsg('');
    const { data, error } = await supabase.from('profiles').select('id, username').ilike('username', searchUsername.trim()).single();
    if (error || !data) { setSearchMsg('Kein User gefunden.'); setSearchResult(null); }
    else if (data.id === userId) { setSearchMsg('Das bist du selbst!'); setSearchResult(null); }
    else setSearchResult(data);
    setSearching(false);
  };

  const sendFriendRequest = async () => {
    if (!searchResult) return;
    const { data: existing } = await supabase.from('friendships').select('*').or(`and(requester_id.eq.${userId},addressee_id.eq.${searchResult.id}),and(requester_id.eq.${searchResult.id},addressee_id.eq.${userId})`);
    if (existing && existing.length > 0) { setSearchMsg('Anfrage bereits vorhanden oder bereits befreundet.'); return; }
    await supabase.from('friendships').insert({ requester_id: userId, addressee_id: searchResult.id, status: 'pending' });
    const { data: me } = await supabase.from('profiles').select('username').eq('id', userId).single();
    await supabase.from('notifications').insert({ user_id: searchResult.id, type: 'friend_request', title: 'Neue Freundschaftsanfrage', message: `${me?.username} möchte mit dir befreundet sein` });
    setSearchMsg('✅ Anfrage gesendet!');
    setSearchResult(null);
    setSearchUsername('');
  };

  const acceptRequest = async (id: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id);
    loadFriends(); loadPendingRequests();
  };

  const rejectRequest = async (id: string) => {
    await supabase.from('friendships').delete().eq('id', id);
    loadPendingRequests();
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Profil */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: avatarColor(profile?.username || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: '26px', fontWeight: 'bold', flexShrink: 0, fontFamily: fontDisplay, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          {profile?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontSize: '18px', color: colors.text, fontWeight: 'bold' }}>{profile?.username}</div>
          <div style={{ fontSize: '13px', color: colors.muted }}>{profile?.email}</div>
        </div>
      </div>

      {/* Booksmart.ch als PWA */}
      {pwaStandalone ? (
        <div style={{ marginBottom: '24px', padding: '14px 16px', backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '8px' }}>BOOKSMART.CH</div>
          <p style={{ fontSize: '14px', color: colors.text, margin: 0, lineHeight: 1.5 }}>Booksmart läuft als installierte App auf deinem Gerät.</p>
        </div>
      ) : (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '10px' }}>BOOKSMART.CH ALS APP</div>
          <p style={{ fontSize: '13px', color: colors.text, lineHeight: 1.5, marginBottom: '14px' }}>
            Lege eine Verknüpfung zu <strong>booksmart.ch</strong> auf dem Startbildschirm ab — öffnen wie eine normale App.
          </p>
          {pwaDeferred ? (
            <button type="button" onClick={handlePwaInstallClick} style={btnPrimary}>
              Booksmart.ch zum Startbildschirm hinzufügen
            </button>
          ) : (
            <button type="button" onClick={() => setPwaHelpOpen(o => !o)} style={btnSecondary}>
              {pwaHelpOpen ? 'Anleitung ausblenden' : 'Zum Startbildschirm hinzufügen (Anleitung)'}
            </button>
          )}
          {pwaInstallNote ? (
            <p style={{ fontSize: '13px', color: colors.muted, marginTop: '12px', marginBottom: 0 }}>{pwaInstallNote}</p>
          ) : null}
          {pwaHelpOpen && !pwaDeferred ? (
            <div style={{ marginTop: '14px', padding: '14px 16px', backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '13px', color: colors.text, lineHeight: 1.55 }}>
              {isIosSafariLike ? (
                <>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>iPhone / iPad (Safari)</strong>
                  <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
                    <li>Öffne <strong>https://booksmart.ch</strong> in Safari.</li>
                    <li>Tippe auf die <strong>Teilen</strong>-Taste (Quadrat mit Pfeil nach oben).</li>
                    <li>Wähle <strong>«Zum Home-Bildschirm»</strong> und bestätige mit «Hinzufügen».</li>
                  </ol>
                </>
              ) : (
                <>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>Android und Desktop (Chrome / Edge)</strong>
                  <ol style={{ margin: '0 0 0 18px', padding: 0 }}>
                    <li>Öffne <strong>https://booksmart.ch</strong> im Browser.</li>
                    <li>Am ehesten in <strong>Chrome</strong>: Menü (⋮) → «App installieren» oder «Zum Startbildschirm hinzufügen».</li>
                    <li>Alternativ: Installations-Symbol in der Adressleiste (falls sichtbar).</li>
                  </ol>
                  <p style={{ margin: '12px 0 0 0', color: colors.muted, fontSize: '12px' }}>Wenn du hier keinen Dialog siehst, nutze die Schritte oben — auf dem iPhone immer über Safari.</p>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Spieler suchen */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '10px' }}>SPIELER SUCHEN</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Username" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <button onClick={handleSearch} disabled={searching} style={{ ...btnPrimary, width: 'auto', padding: '0 20px', marginBottom: 0, fontSize: '13px' }}>Suchen</button>
        </div>
        {searchMsg && <div style={{ fontSize: '13px', color: searchMsg.startsWith('✅') ? '#2D6A4F' : '#A68A64', marginTop: '8px' }}>{searchMsg}</div>}
        {searchResult && (
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: colors.text }}>{searchResult.username}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={sendFriendRequest} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Freund</button>
              <button onClick={() => onChallenge(searchResult)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Duell</button>
            </div>
          </div>
        )}
      </div>

      {/* Anfragen */}
      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '10px' }}>ANFRAGEN ({pendingRequests.length})</div>
          {pendingRequests.map(req => (
            <div key={req.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: colors.text }}>{req.requester.username}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => acceptRequest(req.id)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#2D6A4F', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Annehmen</button>
                <button onClick={() => rejectRequest(req.id)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', color: colors.muted, border: `1px solid ${colors.muted}`, borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Ablehnen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Freunde */}
      <div>
        <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '10px' }}>FREUNDE ({friends.length})</div>
        {friends.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: '14px' }}>Noch keine Freunde</p>
        ) : friends.map(f => {
          const friend = f.requester.id === userId ? f.addressee : f.requester;
          return (
            <div key={f.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: colors.text }}>{friend.username}</span>
              <button onClick={() => onChallenge(friend)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Duell</button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '32px' }}>
        <button type="button" onClick={onLogout} style={btnSecondary}>
          Abmelden
        </button>
      </div>
    </div>
  );
}

function TotalQuestionsCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    supabase.from('questions').select('*', { count: 'exact', head: true }).then(({ count }) => setCount(count || 0));
  }, []);
  if (count === 0) return null;
  return (
    <p style={{ color: 'rgba(245,240,232,0.7)', fontSize: '11px', margin: '2px 0 0 0', letterSpacing: '0.5px' }}>
      {count} Fragen · Schweizer Geschichte · Weltgeschichte · mehr
    </p>
  );
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [tab, setTab] = useState<'home' | 'stats' | 'profile' | 'admin'>('home');
  const [subView, setSubView] = useState<'none' | 'selectCategoryBot' | 'selectOpponentBot' | 'botDuel' | 'userDuel' | 'userDuelCategory' | 'notifications'>('none');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [activeDuel, setActiveDuel] = useState<any>(null);
  const [challengingUser, setChallengingUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myActiveDuels, setMyActiveDuels] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  const loadActiveDuels = async () => {
    const { data } = await supabase
      .from('duels')
      .select(`*, challenger:profiles!duels_challenger_id_fkey(username), opponent:profiles!duels_opponent_id_fkey(username), categories(name)`)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .eq('opponent_is_bot', false)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });
    setMyActiveDuels(data || []);
  };

  const loadOnlineUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, username').neq('id', user.id).limit(10);
    setOnlineUsers(data || []);
  };

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
    supabase.from('profiles').select('is_admin').eq('id', user.id).single().then(({ data }) => setIsAdmin(data?.is_admin || false));
    loadActiveDuels();
    loadOnlineUsers();
    const interval = setInterval(() => { loadActiveDuels(); }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const startBotDuel = async (bot: any) => {
    const { data } = await supabase.from('duels').insert({
      challenger_id: user.id, opponent_is_bot: true, bot_level: bot.level,
      category_id: selectedCategory.id, status: 'challenger_turn',
    }).select().single();
    if (data) { setActiveDuel(data); setSubView('botDuel'); }
  };

  const goHome = () => { setSubView('none'); setActiveDuel(null); loadActiveDuels(); };

  // Full-screen subviews
  if (subView === 'botDuel' && activeDuel) return <BotDuelGame duel={activeDuel} userId={user.id} onFinish={goHome} />;
  if (subView === 'userDuel' && activeDuel) return <UserDuelGame duel={activeDuel} userId={user.id} onFinish={goHome} />;
  if (subView === 'notifications') return <Notifications userId={user.id} onBack={() => setSubView('none')} />;
  if (subView === 'userDuelCategory' && challengingUser) return <UserDuelCategorySelect opponent={challengingUser} userId={user.id} onBack={() => setSubView('none')} onStart={(duel) => { setChallengingUser(null); setActiveDuel(duel); setSubView('userDuel'); }} />;

  if (subView === 'selectOpponentBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setSubView('selectCategoryBot')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: '20px', marginBottom: '6px', fontWeight: 'normal' }}>Wähle einen Bot</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>{selectedCategory?.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bots.map(bot => (
            <div key={bot.name} onClick={() => startBotDuel(bot)} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', padding: '16px', cursor: 'pointer', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '28px' }}>{bot.emoji}</div>
              <div>
                <div style={{ color: colors.text, fontSize: '15px', marginBottom: '2px' }}>{bot.name}</div>
                <div style={{ color: colors.muted, fontSize: '12px' }}>{bot.level === 1 ? 'Einfach — ca. 30% richtig' : bot.level === 2 ? 'Mittel — ca. 55% richtig' : 'Schwer — ca. 80% richtig'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (subView === 'selectCategoryBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setSubView('none')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: '20px', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setSubView('selectOpponentBot'); }} style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', padding: '20px 16px', cursor: 'pointer', borderRadius: '8px' }}>
              <div style={{ color: colors.text, fontSize: '16px' }}>{cat.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const myTurnDuels = myActiveDuels.filter(d => d.current_turn_user_id === user.id);
  const waitingDuels = myActiveDuels.filter(d => d.current_turn_user_id !== user.id);

  const NAV_HEIGHT = 64;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif', paddingBottom: `${NAV_HEIGHT}px` }}>

      {/* Header */}
      <div style={{ backgroundColor: '#1A1A1A', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div>
            <h1 style={{ color: '#F5F0E8', letterSpacing: '3px', margin: 0, fontSize: '18px', fontWeight: '500', fontFamily: fontDisplay }}>BOOKSMART</h1>
            <TotalQuestionsCount />
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        {/* HOME TAB */}
        {tab === 'home' && (
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            <section>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '12px' }}>
                AKTUELLE DUELLE ({myTurnDuels.length})
              </div>
              {myActiveDuels.length === 0 ? (
                <div style={{ backgroundColor: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ color: 'rgba(0,0,0,0.4)', fontSize: '14px', margin: 0 }}>Keine laufenden Duelle</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myTurnDuels.map(d => {
                    const isChallenger = d.challenger_id === user.id;
                    const opponent = isChallenger ? d.opponent : d.challenger;
                    return (
                      <div key={d.id} onClick={() => { setActiveDuel(d); setSubView('userDuel'); }} style={{ backgroundColor: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderLeft: '3px solid #1A1A1A', borderRadius: '8px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', color: '#1A1A1A', fontWeight: '500', marginBottom: '2px' }}>vs {opponent?.username}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.4)' }}>{d.categories?.name} · Du bist dran</div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#1A1A1A' }}>SPIELEN</div>
                      </div>
                    );
                  })}
                  {waitingDuels.map(d => {
                    const isChallenger = d.challenger_id === user.id;
                    const opponent = isChallenger ? d.opponent : d.challenger;
                    return (
                      <div key={d.id} onClick={() => { setActiveDuel(d); setSubView('userDuel'); }} style={{ backgroundColor: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6 }}>
                        <div>
                          <div style={{ fontSize: '14px', color: '#1A1A1A', fontWeight: '500', marginBottom: '2px' }}>vs {opponent?.username}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.4)' }}>{d.categories?.name}</div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.35)' }}>wartet...</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.4)', letterSpacing: '2px', marginBottom: '12px', fontWeight: '500' }}>NEUES QUIZ STARTEN</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                <div onClick={() => setSubView('selectCategoryBot')} style={{ backgroundColor: '#1A1A1A', borderRadius: '8px', padding: '20px 16px', cursor: 'pointer' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth="1.5" style={{ marginBottom: '8px' }}><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14l2.83 2.83m4.48 4.48l2.83 2.83"/></svg>
                  <div style={{ color: '#F5F0E8', fontSize: '13px', fontWeight: '500' }}>Bot Duell</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>Gegen KI spielen</div>
                </div>
                <div onClick={() => { setChallengingUser(null); setSubView('userDuelCategory'); }} style={{ backgroundColor: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '20px 16px', cursor: 'pointer' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="1.5" style={{ marginBottom: '8px' }}><path d="M12 4v16m-4-4l4 4 4-4"/><line x1="5" y1="4" x2="19" y2="4"/></svg>
                  <div style={{ color: '#1A1A1A', fontSize: '13px', fontWeight: '500' }}>Neues Duell</div>
                  <div style={{ color: 'rgba(0,0,0,0.4)', fontSize: '11px', marginTop: '2px' }}>Spieler herausfordern</div>
                </div>
              </div>
                {onlineUsers.length > 0 && (
                  <div style={{ backgroundColor: '#FFFFFF', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '12px 16px', marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.4)', letterSpacing: '1px', marginBottom: '10px' }}>SPIELER</div>
                    {onlineUsers.slice(0, 5).map(u => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <span style={{ fontSize: '14px', color: '#1A1A1A' }}>{u.username}</span>
                        <button onClick={() => { setChallengingUser(u); setSubView('userDuelCategory'); }} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: 'transparent', border: '0.5px solid #1A1A1A', color: '#1A1A1A', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '1px' }}>HERAUSFORDERN</button>
                      </div>
                    ))}
                  </div>
                )}
            </section>

            
          </div>
        )}

        {/* STATS TAB */}
        {tab === 'stats' && <Highscores onBack={() => setTab('home')} userId={user.id} />}

        {/* ADMIN TAB */}
        {tab === 'admin' && isAdmin && <AdminImport onBack={() => setTab('home')} />}

        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <Profile
            userId={user.id}
            onChallenge={(opp) => { setChallengingUser(opp); setSubView('userDuelCategory'); }}
            onLogout={onLogout}
          />
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: `${NAV_HEIGHT}px`, backgroundColor: '#FFFFFF', borderTop: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', zIndex: 200 }}>
      {([
          { id: 'home' as const, label: 'Start', svg: (
            <>
              <path d="M3 12l9-8 9 8" />
              <path d="M5 10v10h14V10" />
            </>
          ) },
          { id: 'stats' as const, label: 'Statistik', svg: (
            <>
              <rect x="3" y="12" width="4" height="8" />
              <rect x="10" y="8" width="4" height="12" />
              <rect x="17" y="4" width="4" height="16" />
            </>
          ) },
          { id: 'profile' as const, label: 'Profil', svg: (
            <>
              <circle cx="12" cy="8" r="4" />
              <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7" />
            </>
          ) },
          ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', svg: (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14l2.83 2.83m4.48 4.48l2.83 2.83" />
            </>
          ) }] : []),
        ] as const).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSubView('none'); }} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === t.id ? '#1A1A1A' : 'rgba(0,0,0,0.25)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {t.svg}
            </svg>
            <span style={{ fontSize: '10px', letterSpacing: '1px', fontWeight: tab === t.id ? 'bold' : 'normal', color: tab === t.id ? '#1A1A1A' : 'rgba(0,0,0,0.3)' }}>{t.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}



function App() {
  const [mode, setMode] = useState<'home' | 'login' | 'register'>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    supabase.from('questions').select('*', { count: 'exact', head: true }).then(({ count }) => setTotalQuestions(count || 0));
  }, []);

  const handleLogin = async () => {
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true); setError('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.user) await supabase.from('profiles').insert({ id: data.user.id, username, email });
    setLoading(false); setMode('login');
    setError('Registrierung erfolgreich! Bitte anmelden.');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut(); setUser(null); setMode('home');
  };

  if (user) return <Dashboard user={user} onLogout={handleLogout} />;

  if (mode === 'login') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: colors.primary, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px', marginBottom: '32px' }}>ANMELDEN</h2>
        {error && <p style={{ color: error.includes('erfolgreich') ? 'green' : 'red', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        <input style={inputStyle} placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} type="email" />
        <input style={inputStyle} placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} type="password" />
        <button style={btnPrimary} onClick={handleLogin} disabled={loading}>{loading ? 'Laden...' : 'Anmelden'}</button>
        <button style={btnSecondary} onClick={() => setMode('register')}>Noch kein Konto?</button>
        <button style={{ ...btnSecondary, border: 'none', color: colors.muted }} onClick={() => setMode('home')}>Zurück</button>
      </div>
    </div>
  );

  if (mode === 'register') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', color: colors.primary, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px', marginBottom: '32px' }}>REGISTRIEREN</h2>
        {error && <p style={{ color: 'red', textAlign: 'center', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        <input style={inputStyle} placeholder="Benutzername" value={username} onChange={e => setUsername(e.target.value)} />
        <input style={inputStyle} placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} type="email" />
        <input style={inputStyle} placeholder="Passwort (min. 6 Zeichen)" value={password} onChange={e => setPassword(e.target.value)} type="password" />
        <button style={btnPrimary} onClick={handleRegister} disabled={loading}>{loading ? 'Laden...' : 'Konto erstellen'}</button>
        <button style={btnSecondary} onClick={() => setMode('login')}>Bereits ein Konto?</button>
        <button style={{ ...btnSecondary, border: 'none', color: colors.muted }} onClick={() => setMode('home')}>Zurück</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📚</div>
        <h1 style={{ fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: '900', color: colors.primary, margin: '0 0 8px 0', letterSpacing: '2px', fontFamily: fontDisplay }}>BOOKSMART</h1>
        <p style={{ fontSize: 'clamp(13px, 3vw, 16px)', color: colors.muted, marginBottom: '48px', lineHeight: '1.5' }}>
          <span style={{ fontWeight: '600', color: colors.primary }}>{totalQuestions > 0 ? totalQuestions : '...'}</span> Fragen zur Geschichte der Schweiz, Weltgeschichte und mehr.
        </p>        <button style={btnPrimary} onClick={() => setMode('login')}>Anmelden</button>
        <button style={btnSecondary} onClick={() => setMode('register')}>Registrieren</button>
        <p style={{ marginTop: '48px', fontSize: '12px', color: '#A0896E', letterSpacing: '1px', lineHeight: '1.8' }}>Geschichte der Schweiz · Philosophie & Denker · Weltgeschichte</p>
      </div>
    </div>
  );
}

export default App;


