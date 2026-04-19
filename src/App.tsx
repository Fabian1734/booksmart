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

function getBotAnswer(optionKeys: string[], correctAnswer: string, accuracy: number): string {
  if (Math.random() < accuracy) return correctAnswer;
  const wrong = optionKeys.filter(o => o !== correctAnswer);
  return wrong[Math.floor(Math.random() * wrong.length)];
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
      // Hole alle Subkategorien
      const { data: subs } = await supabase.from('subcategories').select('*');
      if (!subs) throw new Error('Keine Subkategorien gefunden');

      let totalGroupsCreated = 0;
      let subResults: string[] = [];

      for (const sub of subs) {
        // Hole alle Fragen dieser Subkategorie
        const { data: questionsInSub } = await supabase
          .from('questions')
          .select('id')
          .eq('subcategory_id', sub.id);

        if (!questionsInSub || questionsInSub.length === 0) continue;

        // Hole bereits gruppierte Frage-IDs für diese Subkategorie
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

        // Ungruppierte Fragen
        const ungrouped = questionsInSub.filter(q => !groupedIds.has(q.id));

        console.log(`${sub.name}: ${questionsInSub.length} Fragen insgesamt, ${ungrouped.length} ungruppiert`);

        if (ungrouped.length < 3) continue; // Nicht genug für eine neue Gruppe

        // Höchste bestehende Gruppennummer
        const { data: maxGroups } = await supabase
          .from('question_groups')
          .select('group_number')
          .eq('subcategory_id', sub.id)
          .order('group_number', { ascending: false })
          .limit(1);

        let nextGroupNumber = (maxGroups && maxGroups.length > 0 ? maxGroups[0].group_number : 0) + 1;
        let createdForThisSub = 0;

        // Erstelle 3er-Gruppen aus ungruppierten Fragen
        for (let i = 0; i + 2 < ungrouped.length; i += 3) {
          const { data: newGroup, error: groupError } = await supabase
            .from('question_groups')
            .insert({
              subcategory_id: sub.id,
              group_number: nextGroupNumber,
            })
            .select()
            .single();

          if (groupError || !newGroup) throw groupError;

          const members = [
            { group_id: newGroup.id, question_id: ungrouped[i].id, position: 1 },
            { group_id: newGroup.id, question_id: ungrouped[i + 1].id, position: 2 },
            { group_id: newGroup.id, question_id: ungrouped[i + 2].id, position: 3 },
          ];

          const { error: memberError } = await supabase
            .from('question_group_members')
            .insert(members);

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
                    <div style={{ fontSize: '12px', color: colors.muted }}>
                      {q.category_name} → {q.subcategory_name} → {q.book_title}
                    </div>
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

function UserSearch({ userId, onBack }: { userId: string, onBack: () => void }) {
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
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', searchUsername.trim())
      .single();
    
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
    
    // Prüfe ob bereits eine Freundschaft oder Anfrage existiert
    const { data: existing } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${searchResult.id}),and(requester_id.eq.${searchResult.id},addressee_id.eq.${userId})`);
    
    if (existing && existing.length > 0) {
      const status = existing[0].status;
      if (status === 'accepted') {
        setMessage('Ihr seid bereits befreundet!');
      } else if (status === 'pending') {
        setMessage('Anfrage wurde bereits gesendet.');
      }
      return;
    }
    
    const { error } = await supabase.from('friendships').insert({
      requester_id: userId,
      addressee_id: searchResult.id,
      status: 'pending',
    });
    
    if (error) {
      setMessage('Freundschaftsanfrage konnte nicht gesendet werden.');
    } else {
      // Hole eigenen Username für die Notification
      const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
      
      // Erstelle Notification für den Empfänger
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
          <input 
            style={inputStyle} 
            placeholder="Username eingeben" 
            value={searchUsername} 
            onChange={e => setSearchUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button style={btnPrimary} onClick={handleSearch} disabled={loading}>
            {loading ? 'Suche...' : 'Suchen'}
          </button>
        </div>

        {message && (
          <div style={{ backgroundColor: message.startsWith('✅') ? '#E8F5E9' : '#FDECEA', border: `1px solid ${message.startsWith('✅') ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginBottom: '24px', fontSize: '14px' }}>
            {message}
          </div>
        )}

        {searchResult && (
          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '32px' }}>
            <div style={{ fontSize: '18px', color: colors.text, marginBottom: '20px' }}>{searchResult.username}</div>
            <button style={btnPrimary} onClick={sendFriendRequest}>Freundschaftsanfrage senden</button>
            <button style={btnSecondary}>Zum Duell herausfordern</button>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>ANFRAGEN</h3>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', color: colors.text, marginBottom: '12px' }}>
                  {req.requester.username} möchte mit dir befreundet sein
                </div>
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
                  <div>
                    <div style={{ fontSize: '15px', color: colors.text }}>{friend.username}</div>
                  </div>
                  <button style={{ ...btnSecondary, marginBottom: 0, fontSize: '13px', padding: '8px 16px', width: 'auto' }}>Duell</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Notifications({ userId, onBack }: { userId: string, onBack: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    // Markiere alle als gelesen beim Öffnen
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
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
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
              <div key={notif.id} style={{ 
                backgroundColor: '#FDFAF5', 
                border: '1px solid #C9B99A', 
                borderRadius: '4px', 
                padding: '16px',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{iconForType(notif.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: colors.text, marginBottom: '4px', fontWeight: 'bold' }}>{notif.title}</div>
                  <div style={{ fontSize: '14px', color: colors.text, marginBottom: '6px' }}>{notif.message}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>{timeAgo(notif.created_at)}</div>
                </div>
                <button 
                  onClick={() => deleteNotification(notif.id)}
                  style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}
                  title="Löschen"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function Highscores({ onBack }: { onBack: () => void }) {
  const [scores, setScores] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    const fetchScores = async () => {
      setLoading(true);
      let query = supabase
        .from('scores')
        .select('*, profiles(username), categories(name)')
        .order('points', { ascending: false })
        .limit(20);
      if (selectedCategory !== 'all') query = query.eq('category_id', selectedCategory);
      const { data } = await query;
      setScores(data || []);
      setLoading(false);
    };
    fetchScores();
  }, [selectedCategory]);

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>HIGHSCORES</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button onClick={() => setSelectedCategory('all')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: selectedCategory === 'all' ? colors.primary : colors.light, color: selectedCategory === 'all' ? '#F5F0E8' : colors.text }}>Alle</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: selectedCategory === cat.id ? colors.primary : colors.light, color: selectedCategory === cat.id ? '#F5F0E8' : colors.text }}>{cat.name}</button>
          ))}
        </div>
        {loading ? <p style={{ color: colors.muted, textAlign: 'center' }}>LADEN...</p> : scores.length === 0 ? (
          <p style={{ color: colors.muted, textAlign: 'center' }}>Noch keine Scores.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scores.map((score, i) => (
              <div key={score.id} style={{ backgroundColor: '#FDFAF5', border: `1px solid ${i === 0 ? '#DAA520' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#C9B99A'}`, padding: '14px 16px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: i < 3 ? '20px' : '14px', minWidth: '28px', textAlign: 'center', color: colors.muted }}>{medal(i)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: '15px', marginBottom: '2px' }}>{score.profiles?.username || 'Anonym'}</div>
                  <div style={{ color: colors.muted, fontSize: '12px' }}>{score.categories?.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: colors.primary, fontSize: '18px', fontWeight: 'bold' }}>{score.points}</div>
                  <div style={{ color: colors.muted, fontSize: '12px' }}>{score.correct_count}/{score.total_questions} richtig</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuizRound({ questions, roundNumber, totalRounds, bot, onRoundComplete }: {
  questions: any[], roundNumber: number, totalRounds: number, bot: any,
  onRoundComplete: (userAnswers: boolean[], botAnswers: boolean[]) => void
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [botAnswer, setBotAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [userAnswers, setUserAnswers] = useState<boolean[]>([]);
  const [botAnswers, setBotAnswers] = useState<boolean[]>([]);

  const handleAnswer = (answer: string) => {
    if (selected) return;
    setSelected(answer);

    setTimeout(() => {
      const q = questions[current];
      const optionKeys = q.type === 'true_false' ? ['Wahr', 'Falsch'] : ['A', 'B', 'C', 'D'];
      const bAnswer = getBotAnswer(optionKeys, q.correct_answer, bot.accuracy);
      const userIsCorrect = answer === q.correct_answer;
      const botIsCorrect = bAnswer === q.correct_answer;

      setBotAnswer(bAnswer);
      setShowResult(true);
      setUserAnswers(prev => [...prev, userIsCorrect]);
      setBotAnswers(prev => [...prev, botIsCorrect]);

      setTimeout(() => {
        if (current + 1 >= questions.length) {
          onRoundComplete([...userAnswers, userIsCorrect], [...botAnswers, botIsCorrect]);
        } else {
          setCurrent(c => c + 1);
          setSelected(null);
          setBotAnswer(null);
          setShowResult(false);
        }
      }, 1500);
    }, 1000);
  };

  const q = questions[current];
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingTop: '12px' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>RUNDE {roundNumber} VON {totalRounds}</span>
          <span style={{ color: colors.muted, fontSize: '12px' }}>{current + 1}/{questions.length}</span>
        </div>
        <div style={{ height: '4px', backgroundColor: colors.light, borderRadius: '2px', marginBottom: '28px' }}>
          <div style={{ height: '4px', backgroundColor: colors.primary, borderRadius: '2px', width: `${((current + 1) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: 'clamp(16px, 4vw, 20px)', color: colors.text, lineHeight: '1.6', marginBottom: '24px' }}>{q.question_text}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map(opt => {
            const isCorrect = opt.key === q.correct_answer;
            const isUserSelected = opt.key === selected;
            const isBotSelected = opt.key === botAnswer;
            let bg = '#FDFAF5', border = '1px solid #C9B99A', color = colors.text;

            if (isUserSelected && !showResult) {
              bg = '#E8DFD0';
              border = '2px solid ' + colors.primary;
            }

            if (showResult) {
              if (isCorrect) { bg = '#E8F5E9'; border = '1px solid #4CAF50'; color = '#2E7D32'; }
              else if (isUserSelected) { bg = '#FDECEA'; border = '1px solid #E53935'; color = '#B71C1C'; }
            }

            return (
              <button key={opt.key} onClick={() => handleAnswer(opt.key)} style={{
                padding: '14px 16px', backgroundColor: bg, border, color,
                fontSize: 'clamp(14px, 3.5vw, 16px)', fontFamily: 'Helvetica, Arial, sans-serif',
                cursor: selected ? 'default' : 'pointer', borderRadius: '4px',
                textAlign: 'left', minHeight: '52px', WebkitTapHighlightColor: 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontWeight: 'bold', marginRight: '10px' }}>{opt.key}.</span>{opt.label}
                </span>
                {showResult && (isUserSelected || isBotSelected) && (
                  <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {isUserSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>👤</span>}
                    {isBotSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>{bot.emoji}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntermediateScore({ myScore, botScore, myTotal, botTotal, roundsPlayed, onContinue }: {
  myScore: number, botScore: number, myTotal: number, botTotal: number, roundsPlayed: number, onContinue: () => void
}) {
  const questionsPerRound = QUESTIONS_PER_ROUND;
  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '42px', marginBottom: '16px' }}>📊</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>
          NACH {roundsPlayed} RUNDEN
        </h2>
        <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>ZWISCHENSTAND</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#FDFAF5', border: '2px solid #C9B99A', padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * questionsPerRound} richtig</div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: '2px solid #C9B99A', padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>{bots.find(b => b.level === 1)?.emoji || '🤖'}</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>GEGNER</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>von {roundsPlayed * questionsPerRound} richtig</div>
          </div>
        </div>

        <button style={btnPrimary} onClick={onContinue}>Weiter</button>
      </div>
    </div>
  );
}

function DuelGame({ duel, userId, onFinish }: { duel: any, userId: string, onFinish: () => void }) {
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

  const opponentName = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.name || 'Bot' : 'Gegner';
  const opponentEmoji = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.emoji || '🤖' : '👤';
  const bot = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level) : { name: 'Gegner', emoji: '👤', accuracy: 0.5 };
  const totalRounds = 4;
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
        setTimeout(() => {
          loadQuestionsForSub(randomSub);
        }, 4000);
      }
    };
    autoPickForBot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userChoosesThisRound, availableSubs, currentRound]);

  const loadQuestionsForSub = async (sub: any) => {
    setLoading(true);
    setRoundSubcategories(prev => [...prev, sub]);

    // Hole alle Gruppen dieser Subkategorie (sortiert nach group_number)
    const { data: allGroups } = await supabase
      .from('question_groups')
      .select('id, group_number')
      .eq('subcategory_id', sub.id)
      .order('group_number', { ascending: true });

    if (!allGroups || allGroups.length === 0) {
      setQuestions([]);
      setLoading(false);
      setPhase('playing');
      return;
    }

    // Hole die vom User bereits gespielten Gruppen
    const { data: playedData } = await supabase
      .from('played_groups')
      .select('group_id')
      .eq('user_id', userId);

    const playedIds = new Set(playedData?.map(p => p.group_id) || []);

  // Finde tiefste ungespielte Gruppe, fallback auf erste Gruppe
  const selectedGroup: { id: string; group_number: number } = allGroups.find(g => !playedIds.has(g.id)) || allGroups[0];

   // Wenn alle gespielt: von vorne beginnen (nimm Gruppe 1)
   if (!selectedGroup) {
    selectedGroup = allGroups[0];
  }

  // TypeScript Safety
  if (!selectedGroup) {
    setQuestions([]);
    setLoading(false);
    setPhase('playing');
    return;
  } 

    // Lade die 3 Fragen dieser Gruppe in der richtigen Reihenfolge
    const { data: members } = await supabase
      .from('question_group_members')
      .select('position, questions(*)')
      .eq('group_id', selectedGroup.id)
      .order('position', { ascending: true });

    const groupQuestions = members?.map((m: any) => m.questions).filter(Boolean) || [];

    // Markiere Gruppe als gespielt (nur wenn noch nicht gespielt)
    if (!playedIds.has(selectedGroup.id)) {
      await supabase.from('played_groups').insert({
        user_id: userId,
        group_id: selectedGroup.id,
      });
    }

    // Speichere die Gruppen-Info für die Anzeige
    setRoundSubcategories(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...sub, group_number: selectedGroup.group_number };
      return updated;
    });

    setQuestions(groupQuestions);
    setLoading(false);
    setPhase('playing');
  };

  const handleRoundComplete = async (userAnswers: boolean[], botAnswers: boolean[]) => {
    const newRoundUserAnswers = [...roundUserAnswers, userAnswers];
    const newRoundBotAnswers = [...roundBotAnswers, botAnswers];
    setRoundUserAnswers(newRoundUserAnswers);
    setRoundBotAnswers(newRoundBotAnswers);

    const myTotal = newRoundUserAnswers.flat().filter(Boolean).length;
    const botTotal = newRoundBotAnswers.flat().filter(Boolean).length;

    if (currentRound < totalRounds) {
      if (currentRound === 2 || currentRound === 4) {
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
        total_questions: totalRounds * QUESTIONS_PER_ROUND,
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
    const totalQ = totalRounds * QUESTIONS_PER_ROUND;
    const won = myTotal > botTotal;
    const draw = myTotal === botTotal;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>
            {won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}
          </h2>
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

          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px' }}>
            {roundUserAnswers.map((userRound, roundIdx) => (
              <div key={roundIdx} style={{ marginBottom: roundIdx < roundUserAnswers.length - 1 ? '16px' : 0, paddingBottom: roundIdx < roundUserAnswers.length - 1 ? '16px' : 0, borderBottom: roundIdx < roundUserAnswers.length - 1 ? '1px solid #E8DFD0' : 'none' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '8px' }}>Runde {roundIdx + 1} · {roundSubcategories[roundIdx]?.name}</div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '4px' }}>👤 Du</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {userRound.map((correct, qIdx) => (
                        <div key={qIdx} style={{ width: '20px', height: '20px', borderRadius: '3px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white' }}>
                          {correct ? '✓' : '✗'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '4px' }}>{opponentEmoji} {opponentName.split(' ')[1] || 'Gegner'}</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {roundBotAnswers[roundIdx].map((correct, qIdx) => (
                        <div key={qIdx} style={{ width: '20px', height: '20px', borderRadius: '3px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'white' }}>
                          {correct ? '✓' : '✗'}
                        </div>
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

  if (phase === 'intermediate') {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    return <IntermediateScore myScore={0} botScore={0} myTotal={myTotal} botTotal={botTotal} roundsPlayed={currentRound} onContinue={handleIntermediateContinue} />;
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
          <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', marginTop: '20px' }}>RUNDE {currentRound} VON {totalRounds}</p>
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
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '24px', textAlign: 'center' }}>Zu wenige Fragen in "{roundSubcategories[currentRound - 1]?.name}".<br />Bitte zuerst Fragen hinzufügen.</p>
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
      <QuizRound
        questions={questions}
        roundNumber={currentRound}
        totalRounds={totalRounds}
        bot={bot}
        onRoundComplete={handleRoundComplete}
      />
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [view, setView] = useState<'home' | 'selectCategory' | 'selectOpponent' | 'duel' | 'highscores' | 'admin' | 'users' | 'notifications'>('home');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [activeDuel, setActiveDuel] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

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

    // Polle alle 30 Sekunden für neue Notifications
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const loadUnreadCount = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  };

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
      setView('duel');
    }
  };

  if (view === 'duel' && activeDuel) return (
    <DuelGame duel={activeDuel} userId={user.id} onFinish={() => { setActiveDuel(null); setView('home'); }} />
  );
  if (view === 'highscores') return <Highscores onBack={() => setView('home')} />;
  if (view === 'admin') return <AdminImport onBack={() => setView('home')} />;
  if (view === 'users') return <UserSearch userId={user.id} onBack={() => setView('home')} />;
  if (view === 'notifications') return <Notifications userId={user.id} onBack={() => { setView('home'); loadUnreadCount(); }} />;
  if (view === 'selectOpponent') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('selectCategory')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Wähle deinen Gegner</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>{selectedCategory?.name}</p>

        <p style={{ color: colors.text, fontSize: '14px', marginBottom: '12px', letterSpacing: '1px' }}>GEGEN EINEN BOT</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
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

        <p style={{ color: colors.text, fontSize: '14px', marginBottom: '12px', letterSpacing: '1px' }}>GEGEN EINEN USER</p>
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px', borderRadius: '4px', opacity: 0.5 }}>
          <div style={{ color: colors.muted, fontSize: '14px' }}>👥 Duelle gegen echte User — bald verfügbar</div>
        </div>
      </div>
    </div>
  );

  if (view === 'selectCategory') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>Das Thema pro Runde wählst du später im Duell</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setView('selectOpponent'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between' }}>
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
            <button 
              onClick={() => setView('notifications')} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', position: 'relative', padding: '4px 8px' }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '0', 
                  right: '0', 
                  backgroundColor: '#E53935', 
                  color: 'white', 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  borderRadius: '50%', 
                  minWidth: '18px', 
                  height: '18px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px' }}>Abmelden</button>
          </div>
        </div>
        <p style={{ color: colors.muted, fontSize: '13px', letterSpacing: '1px', marginBottom: '8px' }}>WILLKOMMEN ZURÜCK</p>
        <p style={{ color: colors.text, fontSize: '15px', marginBottom: '32px' }}>{totalQuestions} Fragen hinterlegt</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div onClick={() => setView('selectCategory')} style={{ backgroundColor: colors.primary, padding: '28px 20px', cursor: 'pointer', borderRadius: '4px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚔️</div>
            <div style={{ color: '#F5F0E8', fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>DUELL STARTEN</div>
            <div style={{ color: '#C9A0AC', fontSize: '12px' }}>Bot oder echter Gegner</div>
          </div>
          <div onClick={() => setView('highscores')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🏆</div>
            <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>HIGHSCORES</div>
            <div style={{ color: colors.muted, fontSize: '12px' }}>Beste Spieler anzeigen</div>
          </div>
          <div onClick={() => setView('users')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>👥</div>
            <div style={{ color: colors.text, fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>SPIELER SUCHEN</div>
            <div style={{ color: colors.muted, fontSize: '12px' }}>Freunde & Duelle</div>
          </div>
          {isAdmin && (
            <div onClick={() => setView('admin')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer' }}>
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