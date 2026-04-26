import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';

const colors = {
  bg: '#F5F0E8',
  primary: '#6B1E2E',
  text: '#3D2B1F',
  muted: '#8B6F5E',
  light: '#E8DFD0',
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
  border: '1px solid #C9B99A',
  backgroundColor: '#FDFAF5',
  color: '#3D2B1F',
  fontFamily: fontBody,
  boxSizing: 'border-box',
  borderRadius: '2px',
  marginBottom: '12px',
  outline: 'none',
  WebkitAppearance: 'none',
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '18px 16px',
  backgroundColor: '#6B1E2E',
  color: '#F5F0E8',
  fontSize: '16px',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  fontFamily: fontBody,
  borderRadius: '2px',
  marginBottom: '12px',
  WebkitTapHighlightColor: 'transparent',
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  backgroundColor: 'transparent',
  color: '#6B1E2E',
  border: '2px solid #6B1E2E',
};

const bots = [
  { name: 'Lernender Maxim', level: 1, accuracy: 0.3, emoji: '🐣' },
  { name: 'Wissbegierige Aleksandra', level: 2, accuracy: 0.55, emoji: '📖' },
  { name: 'Professor Fabian', level: 3, accuracy: 0.8, emoji: '🎓' },
];

const QUESTIONS_PER_ROUND = 3;
const TOTAL_ROUNDS = 4;

function getBotAnswer(optionKeys: string[], correctAnswer: string, accuracy: number): string {
  if (Math.random() < accuracy) return correctAnswer;
  const wrong = optionKeys.filter(o => o !== correctAnswer);
  return wrong[Math.floor(Math.random() * wrong.length)];
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
      <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '16px' }}>
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
        <div style={{ backgroundColor: message.type === 'success' ? '#E8F5E9' : '#FDECEA', border: `1px solid ${message.type === 'success' ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text }}>
          {message.text}
        </div>
      )}
    </div>
  );
}

// EXCEL EXPORT/IMPORT KOMPONENTE
function ExcelExportImport() {
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
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

  const handleExport = async () => {
    if (!selectedSubcategory) {
      setMessage({ type: 'error', text: 'Bitte Subkategorie auswählen' });
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, books(title)')
        .eq('subcategory_id', selectedSubcategory);
      if (error) throw error;
      if (!questions || questions.length === 0) {
        setMessage({ type: 'error', text: 'Keine Fragen in dieser Subkategorie gefunden' });
        setExporting(false);
        return;
      }
      const exportData = questions.map(q => ({
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
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fragen');
      const subcatName = subcategories.find(s => s.id === selectedSubcategory)?.name || 'fragen';
      const fileName = `${subcatName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setMessage({ type: 'success', text: `✅ ${questions.length} Fragen exportiert: ${fileName}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `❌ Fehler: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedSubcategory) {
      setMessage({ type: 'error', text: 'Bitte zuerst Kategorie und Subkategorie auswählen!' });
      e.target.value = '';
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
      if (rows.length === 0) throw new Error('Excel-Datei ist leer');

      const bookIds = Array.from(new Set(rows.map(r => r.book_id).filter(Boolean)));
      const { data: existingBooks } = await supabase.from('books').select('id').in('id', bookIds);
      const validBookIds = new Set(existingBooks?.map(b => b.id) || []);

      const questionIdsInExcel = rows.map(r => r.question_id).filter(Boolean);
      let validQuestionIds = new Set<string>();
      if (questionIdsInExcel.length > 0) {
        const { data: existingQuestions } = await supabase.from('questions').select('id').in('id', questionIdsInExcel);
        validQuestionIds = new Set(existingQuestions?.map(q => q.id) || []);
      }

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
        const questionData = {
          category_id: selectedCategory,
          subcategory_id: selectedSubcategory,
          book_id: row.book_id,
          question_text: row.question_text,
          type: row.type || 'multiple_choice',
          correct_answer: String(row.correct_answer),
          option_a: row.option_a || null,
          option_b: row.option_b || null,
          option_c: row.option_c || null,
          option_d: row.option_d || null,
          difficulty: parseInt(row.difficulty) || 2,
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

      if (toInsert.length > 0) {
        const { error } = await supabase.from('questions').insert(toInsert);
        if (error) errors.push(`Insert fehlgeschlagen: ${error.message}`);
        else insertCount = toInsert.length;
      }

      let msg = '';
      if (updateCount > 0) msg += `✅ ${updateCount} Fragen aktualisiert\n`;
      if (insertCount > 0) msg += `✅ ${insertCount} neue Fragen hinzugefügt\n`;
      if (errors.length > 0) msg += `⚠️ ${errors.length} Fehler:\n${errors.slice(0, 5).join('\n')}`;
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
        Exportiere Fragen einer Subkategorie als Excel, bearbeite sie und lade sie wieder hoch.
      </p>
      <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Kategorie</label>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }}>
          <option value="">— Kategorie wählen —</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Subkategorie</label>
        <select value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={!selectedCategory} style={{ ...inputStyle, marginBottom: '0', opacity: selectedCategory ? 1 : 0.5 }}>
          <option value="">— Subkategorie wählen —</option>
          {subcategories.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexDirection: 'column', marginBottom: '20px' }}>
        <button style={{ ...btnPrimary, opacity: !selectedSubcategory || exporting ? 0.5 : 1 }} onClick={handleExport} disabled={!selectedSubcategory || exporting}>
          {exporting ? 'Exportiere...' : '📥 Excel exportieren'}
        </button>
        <label style={{ ...btnSecondary, display: 'block', textAlign: 'center', opacity: !selectedSubcategory || importing ? 0.5 : 1, cursor: !selectedSubcategory || importing ? 'not-allowed' : 'pointer' }}>
          {importing ? 'Importiere...' : '📤 Excel importieren'}
          <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={!selectedSubcategory || importing} style={{ display: 'none' }} />
        </label>
      </div>
      {message && (
        <div style={{ backgroundColor: message.type === 'success' ? '#E8F5E9' : '#FDECEA', border: `1px solid ${message.type === 'success' ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', fontSize: '14px', color: colors.text, whiteSpace: 'pre-line' }}>
          {message.text}
        </div>
      )}
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#FFF9E6', borderRadius: '4px', fontSize: '12px', color: colors.muted, lineHeight: '1.6' }}>
        <strong>💡 Hinweise:</strong><br />
        • <strong>question_id leer</strong> = Neue Frage wird hinzugefügt<br />
        • <strong>question_id vorhanden</strong> = Bestehende Frage wird überschrieben<br />
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

        let groupedIds = new Set<string>();
        if (existingGroups && existingGroups.length > 0) {
          const groupIds = existingGroups.map(g => g.id);
          const { data: existingMembers } = await supabase
            .from('question_group_members')
            .select('question_id')
            .in('group_id', groupIds);
          groupedIds = new Set(existingMembers?.map(m => m.question_id) || []);
        }

        const ungrouped = questionsInSub.filter(q => !groupedIds.has(q.id));
        if (ungrouped.length < 3) continue;

        const { data: maxGroups } = await supabase
          .from('question_groups')
          .select('group_number')
          .eq('subcategory_id', sub.id)
          .order('group_number', { ascending: false })
          .limit(1);

        let nextGroupNumber = (maxGroups && maxGroups.length > 0 ? maxGroups[0].group_number : 0) + 1;
        let createdForThisSub = 0;

        for (let i = 0; i + 2 < ungrouped.length; i += 3) {
          const { data: newGroup, error: groupError } = await supabase
            .from('question_groups')
            .insert({ subcategory_id: sub.id, group_number: nextGroupNumber })
            .select()
            .single();

          if (groupError || !newGroup) throw groupError;

          const members = [
            { group_id: newGroup.id, question_id: ungrouped[i].id, position: 1 },
            { group_id: newGroup.id, question_id: ungrouped[i + 1].id, position: 2 },
            { group_id: newGroup.id, question_id: ungrouped[i + 2].id, position: 3 },
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

        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px' }}>CSV-Format:</h3>
          <pre style={{ fontSize: '12px', color: colors.muted, overflowX: 'auto', backgroundColor: colors.light, padding: '12px', borderRadius: '4px' }}>
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
            <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px' }}>
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
          <div style={{ backgroundColor: result.startsWith('✅') ? '#E8F5E9' : '#FDECEA', border: `1px solid ${result.startsWith('✅') ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text }}>
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
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>Gemeldete Fragen</h3>
          <ReportedQuestions />
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
            <div style={{ backgroundColor: groupResult.startsWith('✅') ? '#E8F5E9' : groupResult.startsWith('ℹ️') ? '#FFF9E6' : '#FDECEA', border: `1px solid ${groupResult.startsWith('✅') ? '#4CAF50' : groupResult.startsWith('ℹ️') ? '#FFC107' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginTop: '16px', fontSize: '14px', color: colors.text, whiteSpace: 'pre-line' }}>
              {groupResult}
            </div>
          )}
        </div>
      </div>
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
        <button onClick={() => setFilter('open')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: filter === 'open' ? colors.primary : colors.light, color: filter === 'open' ? '#F5F0E8' : colors.text }}>Offen ({reports.filter(r => r.status === 'open').length})</button>
        <button onClick={() => setFilter('all')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: filter === 'all' ? colors.primary : colors.light, color: filter === 'all' ? '#F5F0E8' : colors.text }}>Alle</button>
      </div>

      {reports.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px' }}>Keine Reports</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(report => (
            <div key={report.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px' }}>
              <div style={{ fontSize: '13px', color: colors.muted, marginBottom: '8px' }}>
                Gemeldet von {report.reported_by?.username} · {new Date(report.created_at).toLocaleDateString('de-CH')}
              </div>
              <div style={{ fontSize: '14px', color: colors.text, marginBottom: '8px', fontWeight: 'bold' }}>
                {report.questions?.question_text}
              </div>
              <div style={{ fontSize: '13px', color: colors.text, marginBottom: '12px', padding: '12px', backgroundColor: '#FFF9E6', borderRadius: '4px' }}>
                💬 {report.reason}
              </div>
              <div style={{ fontSize: '12px', color: colors.muted, marginBottom: '12px' }}>
                Status: <span style={{ fontWeight: 'bold', color: report.status === 'open' ? '#E53935' : report.status === 'resolved' ? '#4CAF50' : colors.muted }}>{report.status}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {report.status === 'open' && (
                  <>
                    <button onClick={() => updateStatus(report.id, 'in_progress')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>In Bearbeitung</button>
                    <button onClick={() => updateStatus(report.id, 'resolved')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Erledigt</button>
                    <button onClick={() => updateStatus(report.id, 'dismissed')} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: colors.muted, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Ablehnen</button>
                  </>
                )}
                <button onClick={() => deleteQuestion(report.questions.id)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#E53935', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Frage löschen</button>
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
              <div key={notif.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
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
          <div style={{ backgroundColor: message.startsWith('✅') ? '#E8F5E9' : '#FDECEA', border: `1px solid ${message.startsWith('✅') ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginBottom: '24px', fontSize: '14px' }}>{message}</div>
        )}

        {searchResult && (
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '32px' }}>
            <div style={{ fontSize: '18px', color: colors.text, marginBottom: '20px' }}>{searchResult.username}</div>
            <button style={btnPrimary} onClick={sendFriendRequest}>Freundschaftsanfrage senden</button>
            <button style={btnSecondary} onClick={() => onChallenge(searchResult)}>Zum Duell herausfordern</button>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>ANFRAGEN</h3>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
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
                <div key={f.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

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

  const submitReport = async () => {
    if (!reportingQuestion || !reportReason.trim()) return;
    
    const { error } = await supabase.from('question_reports').insert({
      question_id: reportingQuestion.id,
      reported_by: userId,
      reason: reportReason.trim(),
    });

    if (error) {
      setReportSuccess('❌ Fehler beim Senden');
    } else {
      setReportSuccess('✅ Frage wurde gemeldet');
      setTimeout(() => {
        setReportingQuestion(null);
        setReportReason('');
        setReportSuccess('');
      }, 2000);
    }
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
        
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px' }}>
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
                  <div key={qIdx} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '15px', color: colors.text, marginBottom: '12px', fontWeight: 'bold' }}>Frage {qIdx + 1}</div>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: '16px', lineHeight: '1.5' }}>{q.question_text}</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {options.map(opt => {
                        const isCorrect = opt.key === q.correct_answer;
                        const isMyAnswer = opt.key === myAnswer;
                        const isOppAnswer = opt.key === oppAnswer;
                        
                        let bg = 'white';
                        let border = '1px solid #E8DFD0';
                        if (isCorrect) { bg = '#E8F5E9'; border = '1px solid #4CAF50'; }

                        return (
                          <div key={opt.key} style={{ backgroundColor: bg, border, padding: '10px 12px', borderRadius: '4px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              <span style={{ fontWeight: 'bold', marginRight: '8px' }}>{opt.key}.</span>
                              {opt.label}
                              {isCorrect && <span style={{ marginLeft: '8px', color: '#4CAF50', fontSize: '16px' }}>✓</span>}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {isMyAnswer && <span style={{ fontSize: '11px', backgroundColor: myCorrect ? '#E8F5E9' : '#FDECEA', padding: '2px 6px', borderRadius: '3px' }}>Du</span>}
                              {isOppAnswer && <span style={{ fontSize: '11px', backgroundColor: oppCorrect ? '#E8F5E9' : '#FDECEA', padding: '2px 6px', borderRadius: '3px' }}>{oppName}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button 
                      onClick={() => setReportingQuestion(q)} 
                      style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #E53935', color: '#E53935', borderRadius: '4px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}
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

      {reportingQuestion && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
          <div style={{ backgroundColor: colors.bg, borderRadius: '8px', padding: '24px', maxWidth: '500px', width: '100%' }}>
            <h3 style={{ fontSize: '18px', color: colors.text, marginBottom: '12px' }}>Frage melden</h3>
            <p style={{ fontSize: '14px', color: colors.text, marginBottom: '8px', lineHeight: '1.4' }}>{reportingQuestion.question_text}</p>
            <textarea 
              value={reportReason} 
              onChange={e => setReportReason(e.target.value)}
              placeholder="Was ist das Problem mit dieser Frage?"
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
            />
            {reportSuccess && <div style={{ fontSize: '14px', marginBottom: '12px', color: reportSuccess.startsWith('✅') ? '#4CAF50' : '#E53935' }}>{reportSuccess}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{ ...btnPrimary, marginBottom: 0 }} onClick={submitReport}>Melden</button>
              <button style={{ ...btnSecondary, marginBottom: 0 }} onClick={() => { setReportingQuestion(null); setReportReason(''); setReportSuccess(''); }}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Highscores({ onBack, userId }: { onBack: () => void, userId: string }) {
  const [tab, setTab] = useState<'stats' | 'leaderboard' | 'myduels'>('stats');
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

  const pctColor = (pct: number) => pct >= 70 ? '#4CAF50' : pct >= 50 ? '#FF9800' : '#E53935';

  if (selectedDuel) return <DuelDetail duel={selectedDuel} userId={userId} onBack={() => setSelectedDuel(null)} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>STATISTIK</h2>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: `1px solid ${colors.light}`, paddingBottom: '0' }}>
          {(['stats', 'leaderboard', 'myduels'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 16px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: 'transparent', color: tab === t ? colors.primary : colors.muted, borderBottom: tab === t ? `2px solid ${colors.primary}` : '2px solid transparent', fontWeight: tab === t ? 'bold' : 'normal', letterSpacing: '1px' }}>
              {t === 'stats' ? 'MEINE STATS' : t === 'leaderboard' ? 'RANGLISTE' : 'MEINE DUELLE'}
            </button>
          ))}
        </div>

        {loading ? <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>LADEN...</p> : (
          <>
            {/* MEINE STATS */}
            {tab === 'stats' && (
              <div>
                {myStats.length === 0 ? (
                  <p style={{ color: colors.muted, textAlign: 'center', padding: '48px 0' }}>Noch keine Duelle gespielt</p>
                ) : myStats.map(cat => (
                  <div key={cat.id} style={{ marginBottom: '8px' }}>
                    <div onClick={() => { setExpandedCategory(expandedCategory === cat.id ? null : cat.id); loadSubStats(cat.id); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                      <div style={{ backgroundColor: '#FAF8F4', border: '1px solid #E8DFD0', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '8px 16px' }}>
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
                      <div key={s.id} style={{ backgroundColor: '#FDFAF5', border: `1px solid ${i === 0 ? '#DAA520' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#C9B99A'}`, padding: '14px 16px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                        <div key={d.id} onClick={() => setSelectedDuel(d)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold', marginBottom: '2px' }}>vs {oppName}</div>
                            <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', color: colors.text, marginBottom: '2px' }}>{myScore} : {oppScore}</div>
                            <div style={{ fontSize: '12px', color: won ? '#4CAF50' : draw ? colors.muted : '#E53935' }}>{won ? 'Gewonnen' : draw ? 'Unentschieden' : 'Verloren'}</div>
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

function QuizRound({ questions, roundNumber, totalRounds, bot, onRoundComplete }: {
  questions: any[], roundNumber: number, totalRounds: number, bot: any | null,
  onRoundComplete: (userAnswers: boolean[], botAnswers: boolean[] | null, selectedAnswers: string[]) => void
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [botAnswer, setBotAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [userAnswers, setUserAnswers] = useState<boolean[]>([]);
  const [botAnswers, setBotAnswers] = useState<boolean[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(15);
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
    setTimeLeft(15);
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
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

  const timerPct = (timeLeft / 15) * 100;
  const timerColor = timeLeft > 8 ? '#4CAF50' : timeLeft > 4 ? '#FF9800' : '#E53935';

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
            let bg = '#FDFAF5', border = `1px solid #C9B99A`, color = colors.text;
            if (isUserSelected && !showResult) { bg = '#E8DFD0'; border = `2px solid ${colors.primary}`; }
            if (showResult) {
              if (isCorrect) { bg = '#E8F5E9'; border = '2px solid #4CAF50'; color = '#2E7D32'; }
              else if (isUserSelected) { bg = '#FDECEA'; border = '2px solid #E53935'; color = '#B71C1C'; }
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
                  boxShadow: isUserSelected && !showResult ? '0 2px 8px rgba(107,30,46,0.15)' : 'none',
                }}
              >
                <span style={{ flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontWeight: '600', marginRight: '10px', opacity: 0.6 }}>{opt.key}.</span>{opt.label}
                </span>
                <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {showResult && isCorrect && <span style={{ fontSize: '18px' }}>✓</span>}
                  {showResult && isUserSelected && !isCorrect && <span style={{ fontSize: '18px' }}>✗</span>}
                  {showResult && bot && isUserSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>👤</span>}
                  {showResult && bot && isBotSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>{bot.emoji}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntermediateScore({ myTotal, botTotal, roundsPlayed, onContinue }: { myTotal: number, botTotal: number, roundsPlayed: number, onContinue: () => void }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>📊</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>NACH {roundsPlayed} RUNDEN</h2>
        <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>ZWISCHENSTAND</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#FDFAF5', border: '2px solid #C9B99A', padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * QUESTIONS_PER_ROUND} richtig</div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: '2px solid #C9B99A', padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>🤖</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>GEGNER</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * QUESTIONS_PER_ROUND} richtig</div>
          </div>
        </div>
        <button style={btnPrimary} onClick={onContinue}>Weiter</button>
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
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<'selectSub' | 'announcement' | 'playing' | 'intermediate'>('selectSub');
  const [availableSubs, setAvailableSubs] = useState<any[]>([]);
  const [announcementSub, setAnnouncementSub] = useState<any>(null);
  const [playedGroupIdsInDuel, setPlayedGroupIdsInDuel] = useState<string[]>([]);
  const opponentName = bots.find(b => b.level === duel.bot_level)?.name || 'Bot';
  const opponentEmoji = bots.find(b => b.level === duel.bot_level)?.emoji || '🤖';
  const bot = bots.find(b => b.level === duel.bot_level) || { name: 'Gegner', emoji: '👤', accuracy: 0.5 };
  const userChoosesThisRound = currentRound === 1 || currentRound === 3;

  useEffect(() => {
    const loadSubsWithCounts = async () => {
      const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', duel.category_id);
      const subsWithCounts: any[] = [];
      for (const sub of subs || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subcategory_id', sub.id);
        subsWithCounts.push({ ...sub, question_count: count || 0 });
      }
      setAvailableSubs(subsWithCounts);
    };
    loadSubsWithCounts();
  }, [duel.category_id]);

  useEffect(() => {
    const autoPickForBot = async () => {
      if (phase === 'selectSub' && !userChoosesThisRound && availableSubs.length > 0) {
        const randomSub = availableSubs[Math.floor(Math.random() * availableSubs.length)];
        setAnnouncementSub(randomSub);
        setPhase('announcement');
        setTimeout(() => { loadQuestionsForSub(randomSub); }, 4000);
      }
    };
    autoPickForBot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userChoosesThisRound, availableSubs, currentRound]);

  const loadQuestionsForSub = async (sub: any) => {
    setLoading(true);
    setRoundSubcategories(prev => [...prev, sub]);

    const selectedGroup = await findBestGroup(sub.id, [userId], playedGroupIdsInDuel);
    if (!selectedGroup) {
      setQuestions([]);
      setLoading(false);
      setPhase('playing');
      return;
    }
    setPlayedGroupIdsInDuel(prev => [...prev, selectedGroup.id]);

    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', selectedGroup.id)
      .order('position', { ascending: true });

    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    await supabase.from('played_groups').upsert(
      { user_id: userId, group_id: selectedGroup.id },
      { onConflict: 'user_id,group_id', ignoreDuplicates: true }
    );

    setRoundSubcategories(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...sub, group_number: selectedGroup.group_number };
      return updated;
    });

    setQuestions(groupQuestions);
    setLoading(false);
    setPhase('playing');
  };

  const handleRoundComplete = async (userAnswers: boolean[], botAnswers: boolean[] | null) => {
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

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
          <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>4 RUNDEN ABGESCHLOSSEN</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{opponentEmoji}</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{opponentName.split(' ')[1]?.toUpperCase() || 'GEGNER'}</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
          </div>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'intermediate') {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    return <IntermediateScore myTotal={myTotal} botTotal={botTotal} roundsPlayed={currentRound} onContinue={handleIntermediateContinue} />;
  }

  if (phase === 'announcement' && announcementSub) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{opponentEmoji}</div>
          <h2 style={{ color: colors.primary, fontSize: 'clamp(18px, 5vw, 22px)', marginBottom: '12px', letterSpacing: '1px' }}>{opponentName.toUpperCase()}</h2>
          <p style={{ color: colors.text, fontSize: '16px', marginBottom: '8px' }}>hat gewählt:</p>
          <p style={{ color: colors.primary, fontSize: 'clamp(18px, 4vw, 20px)', fontWeight: 'bold', letterSpacing: '1px' }}>{announcementSub.name}</p>
        </div>
      </div>
    );
  }

  if (phase === 'selectSub') {
    if (!userChoosesThisRound) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <p style={{ color: colors.muted, letterSpacing: '2px' }}>{opponentName.split(' ')[1]?.toUpperCase() || 'GEGNER'} WÄHLT...</p>
        </div>
      );
    }
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
          <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', marginTop: '20px' }}>RUNDE {currentRound} VON {TOTAL_ROUNDS}</p>
          <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Du wählst das Thema</h2>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Für diese Runde</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {availableSubs.map(sub => (
              <div key={sub.id} onClick={() => loadQuestionsForSub(sub)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px 20px', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: colors.text, fontSize: '15px' }}>{sub.name}</div>
                <div style={{ color: colors.muted, fontSize: '14px' }}>{sub.question_count} Fragen</div>
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
          {userChoosesThisRound ? 'DEINE WAHL' : `${(opponentName.split(' ')[1] || 'GEGNER').toUpperCase()} HAT GEWÄHLT`}
        </span>
      </div>
      <QuizRound questions={questions} roundNumber={currentRound} totalRounds={TOTAL_ROUNDS} bot={bot} onRoundComplete={handleRoundComplete} />
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



  const isChallenger = duel.challenger_id === userId;
  const opponentId = isChallenger ? duel.opponent_id : duel.challenger_id;
  const roundsData = duelData.rounds_data || [];

  useEffect(() => {
    const loadInit = async () => {
      setLoading(true);
      const { data: oppProfile } = await supabase.from('profiles').select('username').eq('id', opponentId).single();
      setOpponentProfile(oppProfile);

      const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', duel.category_id);
      const subsWithCounts: any[] = [];
      for (const sub of subs || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subcategory_id', sub.id);
        subsWithCounts.push({ ...sub, question_count: count || 0 });
      }
      setAvailableSubs(subsWithCounts);
      setLoading(false);

      determineNextPhase(roundsData);
    };
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
      newTurnUserId = lastRound.chosen_by === userId ? opponentId : userId;
    } else {
      newTurnUserId = opponentId;
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

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', paddingTop: '40px' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
          <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>4 RUNDEN ABGESCHLOSSEN</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{opponentProfile?.username?.toUpperCase() || 'GEGNER'}</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{oppScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
            {roundsData.map((round: any, roundIdx: number) => (
              <div key={roundIdx} style={{ marginBottom: roundIdx < roundsData.length - 1 ? '16px' : 0, paddingBottom: roundIdx < roundsData.length - 1 ? '16px' : 0, borderBottom: roundIdx < roundsData.length - 1 ? '1px solid #E8DFD0' : 'none' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Runde {round.round} · {round.subcategory_name} · Gruppe {round.group_number}</div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '4px' }}>👤 Du</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(isChallenger ? round.challenger_answers : round.opponent_answers)?.map((correct: boolean, qIdx: number) => (
                        <div key={qIdx} style={{ width: '20px', height: '20px', borderRadius: '3px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white' }}>{correct ? '✓' : '✗'}</div>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '4px' }}>👤 {opponentProfile?.username || 'Gegner'}</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(isChallenger ? round.opponent_answers : round.challenger_answers)?.map((correct: boolean, qIdx: number) => (
                        <div key={qIdx} style={{ width: '20px', height: '20px', borderRadius: '3px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white' }}>{correct ? '✓' : '✗'}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
        <QuizRound questions={currentQuestions} roundNumber={roundNum} totalRounds={TOTAL_ROUNDS} bot={null} onRoundComplete={handleRoundComplete} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {availableSubs.map(sub => (
            <div key={sub.id} onClick={() => selectSubAndPlay(sub)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px 20px', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: colors.text, fontSize: '15px' }}>{sub.name}</div>
              <div style={{ color: colors.muted, fontSize: '14px' }}>{sub.question_count} Fragen</div>
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
                if (myScore > oppScore) { statusText = 'Gewonnen 🏆'; statusColor = '#4CAF50'; }
                else if (myScore < oppScore) { statusText = 'Verloren'; statusColor = '#E53935'; }
                else { statusText = 'Unentschieden'; statusColor = colors.muted; }
              } else if (isMyTurn) {
                statusText = 'Du bist dran!';
                statusColor = colors.primary;
              } else {
                statusText = `Warte auf ${opponent?.username}`;
              }

              return (
                <div key={d.id} onClick={() => onOpenDuel(d)} style={{ backgroundColor: '#FDFAF5', border: `1px solid ${isMyTurn && !isDone ? colors.primary : '#C9B99A'}`, borderRadius: '4px', padding: '16px', cursor: 'pointer' }}>
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
            <div key={cat.id} onClick={() => startDuel(cat)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
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


function Profile({ userId, onChallenge, onLogout }: { userId: string, onChallenge: (opp: any) => void, onLogout: () => void }) {  const [profile, setProfile] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [searching, setSearching] = useState(false);

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
      <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: avatarColor(profile?.username || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: '26px', fontWeight: 'bold', flexShrink: 0, fontFamily: fontDisplay, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          {profile?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontSize: '18px', color: colors.text, fontWeight: 'bold' }}>{profile?.username}</div>
          <div style={{ fontSize: '13px', color: colors.muted }}>{profile?.email}</div>
        </div>
      </div>

      {/* Spieler suchen */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '10px' }}>SPIELER SUCHEN</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Username" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <button onClick={handleSearch} disabled={searching} style={{ ...btnPrimary, width: 'auto', padding: '0 20px', marginBottom: 0, fontSize: '13px' }}>Suchen</button>
        </div>
        {searchMsg && <div style={{ fontSize: '13px', color: searchMsg.startsWith('✅') ? '#4CAF50' : '#E53935', marginTop: '8px' }}>{searchMsg}</div>}
        {searchResult && (
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div key={req.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: colors.text }}>{req.requester.username}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => acceptRequest(req.id)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Annehmen</button>
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
            <div key={f.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: colors.text }}>{friend.username}</span>
              <button onClick={() => onChallenge(friend)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>Duell</button>
            </div>
          );
        })}
      </div>

<div style={{ marginTop: '32px' }}>
  <button onClick={onLogout} style={{ ...btnSecondary, color: '#E53935', borderColor: '#E53935' }}>
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [myActiveDuels, setMyActiveDuels] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  const loadUnreadCount = async () => {
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    setUnreadCount(count || 0);
  };

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
    loadUnreadCount();
    loadActiveDuels();
    loadOnlineUsers();
    const interval = setInterval(() => { loadUnreadCount(); loadActiveDuels(); }, 30000);
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
  if (subView === 'notifications') return <Notifications userId={user.id} onBack={() => { setSubView('none'); loadUnreadCount(); }} />;
  if (subView === 'userDuelCategory' && challengingUser) return <UserDuelCategorySelect opponent={challengingUser} userId={user.id} onBack={() => setSubView('none')} onStart={(duel) => { setChallengingUser(null); setActiveDuel(duel); setSubView('userDuel'); }} />;

  if (subView === 'selectOpponentBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setSubView('selectCategoryBot')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: '20px', marginBottom: '6px', fontWeight: 'normal' }}>Wähle einen Bot</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>{selectedCategory?.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bots.map(bot => (
            <div key={bot.name} onClick={() => startBotDuel(bot)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setSubView('selectOpponentBot'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px' }}>
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
      <div style={{ backgroundColor: colors.primary, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#F5F0E8', letterSpacing: '2px', margin: 0, fontSize: '20px', fontWeight: '900', fontFamily: fontDisplay }}>BOOKSMART</h1>
          <TotalQuestionsCount />
        </div>        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setSubView('notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', position: 'relative', padding: '6px' }}>
              🔔
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: '#E53935', color: 'white', fontSize: '10px', fontWeight: 'bold', borderRadius: '50%', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>

        {/* HOME TAB */}
        {tab === 'home' && (
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            <section>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '12px' }}>AKTUELLE DUELLE</div>
              {myActiveDuels.length === 0 ? (
                <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #E8DFD0', borderRadius: '4px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ color: colors.muted, fontSize: '14px', margin: 0 }}>Keine laufenden Duelle</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myTurnDuels.map(d => {
                    const isChallenger = d.challenger_id === user.id;
                    const opponent = isChallenger ? d.opponent : d.challenger;
                    return (
                      <div key={d.id} onClick={() => { setActiveDuel(d); setSubView('userDuel'); }} style={{ backgroundColor: '#FDFAF5', border: `2px solid ${colors.primary}`, borderRadius: '4px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold', marginBottom: '2px' }}>vs {opponent?.username}</div>
                          <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                        </div>
                        <div style={{ backgroundColor: colors.primary, color: '#F5F0E8', fontSize: '11px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '2px', letterSpacing: '1px' }}>DU BIST DRAN</div>
                      </div>
                    );
                  })}
                  {waitingDuels.map(d => {
                    const isChallenger = d.challenger_id === user.id;
                    const opponent = isChallenger ? d.opponent : d.challenger;
                    return (
                      <div key={d.id} onClick={() => { setActiveDuel(d); setSubView('userDuel'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #E8DFD0', borderRadius: '4px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '15px', color: colors.text, marginBottom: '2px' }}>vs {opponent?.username}</div>
                          <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: colors.muted }}>wartet...</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '2px', marginBottom: '12px' }}>NEUES QUIZ STARTEN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div onClick={() => setSubView('selectCategoryBot')} style={{ backgroundColor: colors.primary, borderRadius: '4px', padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '24px' }}>🤖</div>
                  <div>
                    <div style={{ color: '#F5F0E8', fontSize: '15px', fontWeight: 'bold', marginBottom: '2px' }}>Duell vs Bot</div>
                    <div style={{ color: '#C9A0AC', fontSize: '12px' }}>Spiele gegen eine KI</div>
                  </div>
                </div>
                <div onClick={() => { setChallengingUser(null); setSubView('userDuelCategory'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '24px' }}>⚔️</div>
                  <div>
                    <div style={{ color: colors.text, fontSize: '15px', fontWeight: 'bold', marginBottom: '2px' }}>Duell vs User</div>
                    <div style={{ color: colors.muted, fontSize: '12px' }}>Fordere einen Spieler heraus</div>
                  </div>
                </div>
                {onlineUsers.length > 0 && (
                  <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #E8DFD0', borderRadius: '4px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '10px' }}>SPIELER</div>
                    {onlineUsers.slice(0, 5).map(u => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <span style={{ fontSize: '14px', color: colors.text }}>{u.username}</span>
                        <button onClick={() => { setChallengingUser(u); setSubView('userDuelCategory'); }} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${colors.primary}`, color: colors.primary, borderRadius: '2px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '1px' }}>HERAUSFORDERN</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: `${NAV_HEIGHT}px`, backgroundColor: '#FDFAF5', borderTop: `1px solid ${colors.light}`, display: 'flex', zIndex: 200 }}>
      {([
          { id: 'home' as const, label: 'Start', icon: '🏠' },
          { id: 'stats' as const, label: 'Statistik', icon: '📊' },
          { id: 'profile' as const, label: 'Profil', icon: '👤' },
          ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: '⚙️' }] : []),
        ]).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSubView('none'); }} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: tab === t.id ? colors.primary : colors.muted, fontFamily: 'Helvetica, Arial, sans-serif' }}>
            <span style={{ fontSize: '22px' }}>{t.icon}</span>
            <span style={{ fontSize: '10px', letterSpacing: '1px', fontWeight: tab === t.id ? 'bold' : 'normal' }}>{t.label.toUpperCase()}</span>
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


