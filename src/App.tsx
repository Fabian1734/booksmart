import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const colors = {
  bg: '#F5F0E8',
  primary: '#6B1E2E',
  text: '#3D2B1F',
  muted: '#8B6F5E',
  light: '#E8DFD0',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  fontSize: '16px',
  border: '1px solid #C9B99A',
  backgroundColor: '#FDFAF5',
  color: '#3D2B1F',
  fontFamily: 'Helvetica, Arial, sans-serif',
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
  fontFamily: 'Helvetica, Arial, sans-serif',
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
async function findBestGroup(subcategoryId: string, userIds: string[]): Promise<{ id: string; group_number: number } | null> {
  const { data: allGroups } = await supabase
    .from('question_groups')
    .select('id, group_number')
    .eq('subcategory_id', subcategoryId)
    .order('group_number', { ascending: true });

  if (!allGroups || allGroups.length === 0) return null;

  const { data: playedData } = await supabase
    .from('played_groups')
    .select('group_id, user_id')
    .in('user_id', userIds);

  // Zähle wie oft jede Gruppe von den angegebenen Usern gespielt wurde
  const playCount: Record<string, number> = {};
  playedData?.forEach(p => {
    playCount[p.group_id] = (playCount[p.group_id] || 0) + 1;
  });

  // Finde tiefste Gruppe, die keiner der User gespielt hat
  const neverPlayed = allGroups.find(g => !playCount[g.id]);
  if (neverPlayed) return neverPlayed;

  // Alle gespielt -> nimm tiefste
  return allGroups[0];
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

function MapQuiz({ userId, onBack }: { userId: string, onBack: () => void }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [clickedPoint, setClickedPoint] = useState<{ x: number, y: number } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [distance, setDistance] = useState(0);
  const [points, setPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);

  const TOTAL_ROUNDS = 10;
  const svgWidth = 400;
  const svgHeight = 500;

  const swissBox = {
    minLat: 45.818,
    maxLat: 47.808,
    minLon: 5.956,
    maxLon: 10.492
  };

  useEffect(() => {
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocations = async () => {
    const { data } = await supabase.from('map_locations').select('*');
    if (data) {
      const shuffled = data.sort(() => Math.random() - 0.5).slice(0, TOTAL_ROUNDS);
      setLocations(shuffled);
    }
    setLoading(false);
  };

  const latLonToSVG = (lat: number, lon: number) => {
    const x = ((lon - swissBox.minLon) / (swissBox.maxLon - swissBox.minLon)) * svgWidth;
    const y = svgHeight - ((lat - swissBox.minLat) / (swissBox.maxLat - swissBox.minLat)) * svgHeight;
    return { x, y };
  };

  const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (showResult) return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const y = ((e.clientY - rect.top) / rect.height) * svgHeight;
    
    setClickedPoint({ x, y });

    const currentLocation = locations[currentRound];
    const correctPos = latLonToSVG(currentLocation.latitude, currentLocation.longitude);
    const dist = calculateDistance(x, y, correctPos.x, correctPos.y);
    
    const earnedPoints = Math.max(0, Math.floor(100 - dist));
    
    setDistance(Math.round(dist));
    setPoints(earnedPoints);
    setTotalPoints(prev => prev + earnedPoints);
    setShowResult(true);

    setTimeout(() => {
      if (currentRound + 1 >= TOTAL_ROUNDS) {
        setGameOver(true);
      } else {
        setCurrentRound(prev => prev + 1);
        setClickedPoint(null);
        setShowResult(false);
      }
    }, 3000);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (gameOver) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>🗺️</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>QUIZ BEENDET</h2>
          <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>10 ORTE PLATZIERT</p>
          <div style={{ backgroundColor: '#FDFAF5', border: '2px solid ' + colors.primary, padding: '32px 20px', borderRadius: '4px', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: colors.primary, marginBottom: '8px' }}>{totalPoints}</div>
            <div style={{ fontSize: '14px', color: colors.muted }}>von 1000 Punkten</div>
          </div>
          <button style={btnPrimary} onClick={onBack}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  const currentLocation = locations[currentRound];
  const correctPos = latLonToSVG(currentLocation.latitude, currentLocation.longitude);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>RUNDE {currentRound + 1} VON {TOTAL_ROUNDS}</span>
          <span style={{ color: colors.primary, fontSize: '16px', fontWeight: 'bold' }}>{totalPoints} Punkte</span>
        </div>

        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: colors.text, marginBottom: '8px' }}>Wo liegt {currentLocation.name}?</h2>
          <p style={{ fontSize: '13px', color: colors.muted }}>
            {currentLocation.type === 'city' ? '📍 Stadt' : currentLocation.type === 'mountain' ? '⛰️ Berg' : '🌊 See'}
          </p>
        </div>

        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '16px' }}>
          <svg 
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', cursor: showResult ? 'default' : 'crosshair', backgroundColor: '#E8F4F8', borderRadius: '4px' }}
            onClick={handleMapClick}
          >
            <path d="M50,250 L100,200 L150,180 L200,170 L250,175 L300,200 L350,250 L380,300 L370,350 L340,400 L300,430 L250,450 L200,460 L150,450 L100,420 L60,380 L40,330 Z" 
              fill="#C8E6C9" stroke="#2E7D32" strokeWidth="2" />
            
            {clickedPoint && (
              <circle cx={clickedPoint.x} cy={clickedPoint.y} r="8" fill="#E53935" stroke="white" strokeWidth="2" />
            )}
            
            {showResult && (
              <>
                <circle cx={correctPos.x} cy={correctPos.y} r="8" fill="#4CAF50" stroke="white" strokeWidth="2" />
                <line x1={clickedPoint!.x} y1={clickedPoint!.y} x2={correctPos.x} y2={correctPos.y} stroke="#666" strokeWidth="1" strokeDasharray="4" />
              </>
            )}
          </svg>
        </div>

        {showResult && (
          <div style={{ backgroundColor: points > 70 ? '#E8F5E9' : points > 40 ? '#FFF9E6' : '#FDECEA', border: `1px solid ${points > 70 ? '#4CAF50' : points > 40 ? '#FFC107' : '#E53935'}`, borderRadius: '4px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{points > 70 ? '🎯' : points > 40 ? '👍' : '😅'}</div>
            <div style={{ fontSize: '18px', color: colors.text, marginBottom: '4px', fontWeight: 'bold' }}>+{points} Punkte</div>
            <div style={{ fontSize: '13px', color: colors.muted }}>Distanz: {distance} Pixel</div>
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

  function MapQuiz({ userId, onBack }: { userId: string, onBack: () => void }) {
    const [locations, setLocations] = useState<any[]>([]);
    const [currentRound, setCurrentRound] = useState(0);
    const [clickedPoint, setClickedPoint] = useState<{ x: number, y: number } | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [distance, setDistance] = useState(0);
    const [points, setPoints] = useState(0);
    const [totalPoints, setTotalPoints] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [loading, setLoading] = useState(true);
  
    const TOTAL_ROUNDS = 10;
    const svgWidth = 400;
    const svgHeight = 500;
  
    // Schweiz Bounding Box (approximiert)
    const swissBox = {
      minLat: 45.818,
      maxLat: 47.808,
      minLon: 5.956,
      maxLon: 10.492
    };
  
    useEffect(() => {
      loadLocations();
    }, []);
  
    const loadLocations = async () => {
      const { data } = await supabase.from('map_locations').select('*');
      if (data) {
        // Shuffle und nimm 10
        const shuffled = data.sort(() => Math.random() - 0.5).slice(0, TOTAL_ROUNDS);
        setLocations(shuffled);
      }
      setLoading(false);
    };
  
    const latLonToSVG = (lat: number, lon: number) => {
      const x = ((lon - swissBox.minLon) / (swissBox.maxLon - swissBox.minLon)) * svgWidth;
      const y = svgHeight - ((lat - swissBox.minLat) / (swissBox.maxLat - swissBox.minLat)) * svgHeight;
      return { x, y };
    };
  
    const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
      return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    };
  
    const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
      if (showResult) return;
      
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
      const y = ((e.clientY - rect.top) / rect.height) * svgHeight;
      
      setClickedPoint({ x, y });
  
      const currentLocation = locations[currentRound];
      const correctPos = latLonToSVG(currentLocation.latitude, currentLocation.longitude);
      const dist = calculateDistance(x, y, correctPos.x, correctPos.y);
      
      // Punkte: max 100 bei perfekt, 0 ab 100px Distanz
      const earnedPoints = Math.max(0, Math.floor(100 - dist));
      
      setDistance(Math.round(dist));
      setPoints(earnedPoints);
      setTotalPoints(prev => prev + earnedPoints);
      setShowResult(true);
  
      setTimeout(() => {
        if (currentRound + 1 >= TOTAL_ROUNDS) {
          setGameOver(true);
        } else {
          setCurrentRound(prev => prev + 1);
          setClickedPoint(null);
          setShowResult(false);
        }
      }, 3000);
    };
  
    if (loading) return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
      </div>
    );
  
    if (gameOver) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>🗺️</div>
            <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>QUIZ BEENDET</h2>
            <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>10 ORTE PLATZIERT</p>
            <div style={{ backgroundColor: '#FDFAF5', border: '2px solid ' + colors.primary, padding: '32px 20px', borderRadius: '4px', marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: colors.primary, marginBottom: '8px' }}>{totalPoints}</div>
              <div style={{ fontSize: '14px', color: colors.muted }}>von 1000 Punkten</div>
            </div>
            <button style={btnPrimary} onClick={onBack}>Zurück zum Dashboard</button>
          </div>
        </div>
      );
    }
  
    const currentLocation = locations[currentRound];
    const correctPos = latLonToSVG(currentLocation.latitude, currentLocation.longitude);
  
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>RUNDE {currentRound + 1} VON {TOTAL_ROUNDS}</span>
            <span style={{ color: colors.primary, fontSize: '16px', fontWeight: 'bold' }}>{totalPoints} Punkte</span>
          </div>
  
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: colors.text, marginBottom: '8px' }}>Wo liegt {currentLocation.name}?</h2>
            <p style={{ fontSize: '13px', color: colors.muted }}>
              {currentLocation.type === 'city' ? '📍 Stadt' : currentLocation.type === 'mountain' ? '⛰️ Berg' : '🌊 See'}
            </p>
          </div>
  
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '16px' }}>
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', height: 'auto', cursor: showResult ? 'default' : 'crosshair', backgroundColor: '#E8F4F8', borderRadius: '4px' }}
              onClick={handleMapClick}
            >
              {/* Schweiz Umriss (vereinfacht) */}
              <path d="M50,250 L100,200 L150,180 L200,170 L250,175 L300,200 L350,250 L380,300 L370,350 L340,400 L300,430 L250,450 L200,460 L150,450 L100,420 L60,380 L40,330 Z" 
                fill="#C8E6C9" stroke="#2E7D32" strokeWidth="2" />
              
              {/* Geklickter Punkt */}
              {clickedPoint && (
                <circle cx={clickedPoint.x} cy={clickedPoint.y} r="8" fill="#E53935" stroke="white" strokeWidth="2" />
              )}
              
              {/* Korrekter Punkt (nur nach Klick) */}
              {showResult && (
                <>
                  <circle cx={correctPos.x} cy={correctPos.y} r="8" fill="#4CAF50" stroke="white" strokeWidth="2" />
                  <line x1={clickedPoint!.x} y1={clickedPoint!.y} x2={correctPos.x} y2={correctPos.y} stroke="#666" strokeWidth="1" strokeDasharray="4" />
                </>
              )}
            </svg>
          </div>
  
          {showResult && (
            <div style={{ backgroundColor: points > 70 ? '#E8F5E9' : points > 40 ? '#FFF9E6' : '#FDECEA', border: `1px solid ${points > 70 ? '#4CAF50' : points > 40 ? '#FFC107' : '#E53935'}`, borderRadius: '4px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{points > 70 ? '🎯' : points > 40 ? '👍' : '😅'}</div>
              <div style={{ fontSize: '18px', color: colors.text, marginBottom: '4px', fontWeight: 'bold' }}>+{points} Punkte</div>
              <div style={{ fontSize: '13px', color: colors.muted }}>Distanz: {distance} Pixel</div>
            </div>
          )}
        </div>
      </div>
    );
  }



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
  const [tab, setTab] = useState<'leaderboard' | 'myduels'>('leaderboard');
  const [scores, setScores] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [myDuels, setMyDuels] = useState<any[]>([]);
  const [selectedDuel, setSelectedDuel] = useState<any>(null);

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    if (tab === 'leaderboard') {
      const fetchScores = async () => {
        setLoading(true);
        let query = supabase.from('scores').select('*, profiles(username), categories(name)').order('points', { ascending: false }).limit(20);
        if (selectedCategory !== 'all') query = query.eq('category_id', selectedCategory);
        const { data } = await query;
        setScores(data || []);
        setLoading(false);
      };
      fetchScores();
    } else {
      loadMyDuels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, tab, userId]);

  const loadMyDuels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('duels')
      .select(`
        *,
        challenger:profiles!duels_challenger_id_fkey(username),
        opponent:profiles!duels_opponent_id_fkey(username),
        categories(name)
      `)
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    setMyDuels(data || []);
    setLoading(false);
  };

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

  if (selectedDuel) {
    return <DuelDetail duel={selectedDuel} userId={userId} onBack={() => setSelectedDuel(null)} />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>
          {tab === 'leaderboard' ? 'HIGHSCORES' : 'MEINE DUELLE'}
        </h2>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button onClick={() => setTab('leaderboard')} style={{ padding: '10px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', backgroundColor: tab === 'leaderboard' ? colors.primary : colors.light, color: tab === 'leaderboard' ? '#F5F0E8' : colors.text }}>Bestenliste</button>
          <button onClick={() => setTab('myduels')} style={{ padding: '10px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', backgroundColor: tab === 'myduels' ? colors.primary : colors.light, color: tab === 'myduels' ? '#F5F0E8' : colors.text }}>Meine Duelle</button>
        </div>

        {tab === 'myduels' ? (
          loading ? <p style={{ color: colors.muted, textAlign: 'center' }}>LADEN...</p> : myDuels.length === 0 ? (
            <p style={{ color: colors.muted, textAlign: 'center' }}>Noch keine abgeschlossenen Duelle</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {myDuels.map(d => {
                const isChallenger = d.challenger_id === userId;
                const opponent = isChallenger ? d.opponent : d.challenger;
                const myScore = isChallenger ? (d.challenger_score || 0) : (d.opponent_score || 0);
                const oppScore = isChallenger ? (d.opponent_score || 0) : (d.challenger_score || 0);
                const won = myScore > oppScore;
                const draw = myScore === oppScore;
                const oppName = d.opponent_is_bot ? bots.find(b => b.level === d.bot_level)?.name || 'Bot' : opponent?.username;
                
                return (
                  <div key={d.id} onClick={() => setSelectedDuel(d)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold' }}>vs {oppName}</div>
                      <div style={{ fontSize: '16px', color: colors.text }}>{myScore} : {oppScore}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                      <div style={{ fontSize: '13px', color: won ? '#4CAF50' : draw ? colors.muted : '#E53935' }}>
                        {won ? 'Gewonnen 🏆' : draw ? 'Unentschieden' : 'Verloren'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            
  


// BOT-DUELL
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

    const selectedGroup = await findBestGroup(sub.id, [userId]);
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

    // Check if already played
    const { data: alreadyPlayed } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', selectedGroup.id).maybeSingle();
    if (!alreadyPlayed) {
      await supabase.from('played_groups').insert({ user_id: userId, group_id: selectedGroup.id });
    }

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

// USER-DUELL (asynchron)
function UserDuelGame({ duel, userId, onFinish }: { duel: any, userId: string, onFinish: () => void }) {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'overview' | 'selectSub' | 'playing' | 'waiting' | 'done'>('overview');
  const [availableSubs, setAvailableSubs] = useState<any[]>([]);
  const [currentQuestions, setCurrentQuestions] = useState<any[]>([]);
  const [currentRoundInfo, setCurrentRoundInfo] = useState<any>(null);
  const [opponentProfile, setOpponentProfile] = useState<any>(null);
  const [duelData, setDuelData] = useState<any>(duel);

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

      // Determine phase based on duel state
      determineNextPhase(roundsData);
    };
    loadInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.id]);

  const determineNextPhase = (rounds: any[]) => {
    // Check if duel is complete
    if (rounds.length === TOTAL_ROUNDS && rounds[TOTAL_ROUNDS - 1].challenger_answers && rounds[TOTAL_ROUNDS - 1].opponent_answers) {
      setPhase('done');
      return;
    }
    // Check current state
    if (duelData.current_turn_user_id !== userId) {
      setPhase('waiting');
      return;
    }
    setPhase('overview');
  };

  // Round is "my turn" if current_turn_user_id === userId
  // Possible actions based on state:
  // - No rounds yet: challenger must choose sub (round 1)
  // - Round has only challenger's sub/answers: opponent plays same sub
  // - Round has both answers: next round, check whose turn to choose

  

  const selectSubAndPlay = async (sub: any) => {
    setLoading(true);
    
    const currentRound = roundsData.length;
    const isNewRound = roundsData.length < TOTAL_ROUNDS && (
      currentRound === 0 || 
      (roundsData[currentRound - 1]?.challenger_answers && roundsData[currentRound - 1]?.opponent_answers)
    );

    let selectedGroup;
    let roundData: any;

    if (isNewRound) {
      // New round - find best group for both users
      selectedGroup = await findBestGroup(sub.id, [userId, opponentId]);
      if (!selectedGroup) {
        setLoading(false);
        return;
      }
      roundData = {
        round: currentRound + 1,
        subcategory_id: sub.id,
        subcategory_name: sub.name,
        group_id: selectedGroup.id,
        group_number: selectedGroup.group_number,
        chosen_by: userId,
      };
    } else {
      // Playing existing round (same sub/group as opponent)
      const existingRound = roundsData[currentRound - 1];
      selectedGroup = { id: existingRound.group_id, group_number: existingRound.group_number };
      roundData = existingRound;
    }

    // Load questions for this group
    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', selectedGroup.id)
      .order('position', { ascending: true });
    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    // Mark as played
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
    setLoading(true);

    const currentRound = currentRoundInfo.round;
    const newRoundsData = [...roundsData];
    const roundIdx = newRoundsData.findIndex((r: any) => r.round === currentRound);

    if (roundIdx === -1) {
      // New round
      newRoundsData.push({
        ...currentRoundInfo,
        [isChallenger ? 'challenger_answers' : 'opponent_answers']: userAnswers,
        [isChallenger ? 'challenger_selections' : 'opponent_selections']: selectedAnswers,
      });
    } else {
      // Playing existing round
      newRoundsData[roundIdx] = {
        ...newRoundsData[roundIdx],
        [isChallenger ? 'challenger_answers' : 'opponent_answers']: userAnswers,
        [isChallenger ? 'challenger_selections' : 'opponent_selections']: selectedAnswers,
      };
    }

    // Determine next turn
    const lastRound = newRoundsData[newRoundsData.length - 1];
    const bothAnswered = lastRound.challenger_answers && lastRound.opponent_answers;
    
    let newStatus = duelData.status;
    let newTurnUserId = duelData.current_turn_user_id;

    if (newRoundsData.length === TOTAL_ROUNDS && bothAnswered) {
      newStatus = 'completed';
    } else if (bothAnswered) {
      // Round complete, next round - the user who didn't choose this round chooses next
      newTurnUserId = lastRound.chosen_by === userId ? opponentId : userId;
    } else {
      // Partner must now play the same round
      newTurnUserId = opponentId;
    }

    // Calculate scores
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

    // Send notification to opponent
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

    // Update local state
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

  // Whose turn to choose subcategory?
  // Round 1 & 3: challenger chooses
  // Round 2 & 4: opponent chooses
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

  // Phase: overview - determine if user needs to choose or play existing
  const currentRound = roundsData.length;
  const lastRound = currentRound > 0 ? roundsData[currentRound - 1] : null;
  const needsToPlayExistingRound = lastRound && !(isChallenger ? lastRound.challenger_answers : lastRound.opponent_answers);

  if (needsToPlayExistingRound) {
    // Play the round that opponent just chose
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

  // User must choose subcategory
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

// Duell-Übersicht
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

// Kategorie-Auswahl beim Starten eines User-Duells
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

    // Send notification
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

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [view, setView] = useState<'home' | 'selectCategoryBot' | 'selectOpponentBot' | 'botDuel' | 'userDuel' | 'userDuelsList' | 'userSearch' | 'userDuelCategory' | 'highscores' | 'admin' | 'notifications' | 'mapQuiz'>('home');  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [activeDuel, setActiveDuel] = useState<any>(null);
  const [challengingUser, setChallengingUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeDuelsCount, setActiveDuelsCount] = useState(0);

  const loadUnreadCount = async () => {
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    setUnreadCount(count || 0);
  };

  const loadActiveDuelsCount = async () => {
    const { count } = await supabase
      .from('duels')
      .select('*', { count: 'exact', head: true })
      .eq('opponent_is_bot', false)
      .eq('current_turn_user_id', user.id);
    setActiveDuelsCount(count || 0);
  };

  useEffect(() => {
    const loadData = async () => {
      const { data: cats } = await supabase.from('categories').select('*');
      const categoriesWithCounts: any[] = [];
      for (const cat of cats || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
        categoriesWithCounts.push({ ...cat, question_count: count || 0 });
      }
      setCategories(categoriesWithCounts);
      const { count: total } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      setTotalQuestions(total || 0);
    };

    supabase.from('profiles').select('is_admin').eq('id', user.id).single().then(({ data }) => {
      setIsAdmin(data?.is_admin || false);
    });

    loadData();
    loadUnreadCount();
    loadActiveDuelsCount();

    const interval = setInterval(() => {
      loadUnreadCount();
      loadActiveDuelsCount();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const icons: Record<string, string> = {
    'Geschichte der Schweiz': '🇨🇭',
    'Philosophie & Denker': '💭',
    'Weltgeschichte': '🌍',
  };

  const startBotDuel = async (bot: any) => {
    const { data } = await supabase.from('duels').insert({
      challenger_id: user.id,
      opponent_is_bot: true,
      bot_level: bot.level,
      category_id: selectedCategory.id,
      status: 'challenger_turn',
    }).select().single();
    if (data) {
      setActiveDuel(data);
      setView('botDuel');
    }
  };

  if (view === 'botDuel' && activeDuel) return <BotDuelGame duel={activeDuel} userId={user.id} onFinish={() => { setActiveDuel(null); setView('home'); loadActiveDuelsCount(); }} />;
  if (view === 'userDuel' && activeDuel) return <UserDuelGame duel={activeDuel} userId={user.id} onFinish={() => { setActiveDuel(null); setView('userDuelsList'); loadActiveDuelsCount(); }} />;
  if (view === 'highscores') return <Highscores onBack={() => setView('home')} userId={user.id} />;
  if (view === 'admin') return <AdminImport onBack={() => setView('home')} />;
  if (view === 'notifications') return <Notifications userId={user.id} onBack={() => { setView('home'); loadUnreadCount(); }} />;
  if (view === 'userSearch') return <UserSearch userId={user.id} onBack={() => setView('home')} onChallenge={(opp) => { setChallengingUser(opp); setView('userDuelCategory'); }} />;
  if (view === 'mapQuiz') return <MapQuiz userId={user.id} onBack={() => setView('home')} />;
  if (view === 'userDuelCategory' && challengingUser) return <UserDuelCategorySelect opponent={challengingUser} userId={user.id} onBack={() => setView('userSearch')} onStart={(duel) => { setChallengingUser(null); setActiveDuel(duel); setView('userDuel'); }} />;
  if (view === 'userDuelsList')
  if (view === 'selectOpponentBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('selectCategoryBot')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Wähle einen Bot</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>{selectedCategory?.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bots.map(bot => (
            <div key={bot.name} onClick={() => startBotDuel(bot)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '28px', flexShrink: 0 }}>{bot.emoji}</div>
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

  if (view === 'selectCategoryBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>Das Thema pro Runde wählst du später im Duell</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setView('selectOpponentBot'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingTop: '12px' }}>
          <h1 style={{ color: colors.primary, letterSpacing: '2px', margin: 0, fontSize: 'clamp(20px, 5vw, 28px)' }}>BOOKSMART</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => setView('notifications')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', position: 'relative', padding: '4px 8px' }}>
              🔔
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '0', right: '0', backgroundColor: '#E53935', color: 'white', fontSize: '11px', fontWeight: 'bold', borderRadius: '50%', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount}</span>
              )}
            </button>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px' }}>Abmelden</button>
          </div>
        </div>
        <p style={{ color: colors.muted, fontSize: '13px', letterSpacing: '1px', marginBottom: '8px' }}>WILLKOMMEN ZURÜCK</p>
        <p style={{ color: colors.text, fontSize: '15px', marginBottom: '32px' }}>{totalQuestions} Fragen hinterlegt</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div onClick={() => setView('selectCategoryBot')} style={{ backgroundColor: colors.primary, padding: '28px 20px', cursor: 'pointer', borderRadius: '4px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🤖</div>
            <div style={{ color: '#F5F0E8', fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>DUELL VS BOT</div>
            <div style={{ color: '#C9A0AC', fontSize: '12px' }}>Spiele gegen einen Bot</div>
          </div>
          <div onClick={() => setView('userDuelsList')} style={{ backgroundColor: colors.primary, padding: '28px 20px', cursor: 'pointer', borderRadius: '4px', position: 'relative' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚔️</div>
            <div style={{ color: '#F5F0E8', fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>DUELL VS USER</div>
            <div style={{ color: '#C9A0AC', fontSize: '12px' }}>Spiele gegen echte Spieler</div>
            {activeDuelsCount > 0 && (
              <span style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: '#F5F0E8', color: colors.primary, fontSize: '12px', fontWeight: 'bold', borderRadius: '12px', padding: '3px 8px' }}>{activeDuelsCount} dran</span>
            )}
          </div>
          <div onClick={() => setView('highscores')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🏆</div>
            <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>HIGHSCORES</div>
            <div style={{ color: colors.muted, fontSize: '12px' }}>Beste Spieler</div>
          </div>

          <div onClick={() => setView('mapQuiz')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🗺️</div>
            <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>KARTEN-QUIZ</div>
            <div style={{ color: colors.muted, fontSize: '12px' }}>Schweizer Geografie</div>
          </div>

          <div onClick={() => setView('userSearch')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>👥</div>
            <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>FREUNDE</div>
            <div style={{ color: colors.muted, fontSize: '12px' }}>Spieler suchen</div>
          </div>
          {isAdmin && (
            <div onClick={() => setView('admin')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚙️</div>
              <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>ADMIN</div>
              <div style={{ color: colors.muted, fontSize: '12px' }}>Fragen importieren</div>
            </div>
          )}
        </div>
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
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
        <h1 style={{ fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 'bold', color: colors.primary, margin: '0 0 8px 0', letterSpacing: '2px' }}>BOOKSMART</h1>
        <p style={{ fontSize: 'clamp(12px, 3vw, 16px)', color: colors.muted, letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '48px' }}>Wissen aus Büchern</p>
        <button style={btnPrimary} onClick={() => setMode('login')}>Anmelden</button>
        <button style={btnSecondary} onClick={() => setMode('register')}>Registrieren</button>
        <p style={{ marginTop: '48px', fontSize: '12px', color: '#A0896E', letterSpacing: '1px', lineHeight: '1.8' }}>Geschichte der Schweiz · Philosophie & Denker · Weltgeschichte</p>
      </div>
    </div>
  );
}

export default App;
