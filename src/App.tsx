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

  const playCount: Record<string, number> = {};
  playedData?.forEach(p => {
    playCount[p.group_id] = (playCount[p.group_id] || 0) + 1;
  });

  const neverPlayed = allGroups.find(g => !playCount[g.id]);
  if (neverPlayed) return neverPlayed;
  return allGroups[0];
}

// ─── CSV Import types ─────────────────────────────────────────────────────────
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
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  };

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const q: any = {};
    headers.forEach((header, idx) => { q[header] = values[idx] || ''; });
    q.difficulty = parseInt(q.difficulty) || 1;
    questions.push(q as CSVQuestion);
  }
  return questions;
}

// ─── Single Question View ─────────────────────────────────────────────────────
// Shows one question at a time with animation:
// 1. User selects → answer highlighted 1s
// 2. Correct/wrong revealed + opponent answer shown (if available)
// 3. Auto-advance after 1.5s more
function SingleQuestion({
  question,
  questionIndex,
  totalQuestions,
  onAnswer,
  opponentSelections,
  opponentName,
}: {
  question: any;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (answerKey: string) => void;
  opponentSelections?: string[];
  opponentName?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const options = question.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [
        { key: 'A', label: question.option_a },
        { key: 'B', label: question.option_b },
        { key: 'C', label: question.option_c },
        { key: 'D', label: question.option_d },
      ].filter(o => o.label);

  const opponentAnswer = opponentSelections?.[questionIndex];

  const handleSelect = (key: string) => {
    if (selected || revealed) return;
    setSelected(key);
    // After 1s show correct/wrong
    setTimeout(() => {
      setRevealed(true);
      // After another 1.5s advance
      setTimeout(() => {
        onAnswer(key);
      }, 1500);
    }, 1000);
  };

  const getOptionStyle = (key: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: '100%',
      textAlign: 'left',
      padding: '14px 16px',
      borderRadius: '4px',
      cursor: selected ? 'default' : 'pointer',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '14px',
      color: colors.text,
      border: '1px solid #E8DFD0',
      backgroundColor: 'white',
      transition: 'all 0.25s',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    };

    if (!selected) return base;

    if (revealed) {
      if (key === question.correct_answer) {
        return { ...base, backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' };
      }
      if (key === selected && key !== question.correct_answer) {
        return { ...base, backgroundColor: '#FDECEA', border: '2px solid #E53935' };
      }
    } else {
      // Just selected, not yet revealed
      if (key === selected) {
        return { ...base, backgroundColor: '#EDE7F6', border: '2px solid #7E57C2' };
      }
    }
    return base;
  };

  return (
    <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
          FRAGE {questionIndex + 1} VON {totalQuestions}
        </span>
        {revealed && (
          <span style={{ fontSize: '16px' }}>
            {selected === question.correct_answer ? '✅' : '❌'}
          </span>
        )}
      </div>
      <div style={{ color: colors.text, fontSize: '15px', marginBottom: '20px', lineHeight: '1.6', fontWeight: 'bold' }}>
        {question.question_text}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleSelect(opt.key)}
            style={getOptionStyle(opt.key)}
            disabled={!!selected}
          >
            <span>
              <span style={{ fontWeight: 'bold', marginRight: '10px' }}>{opt.key}.</span>
              {opt.label}
              {revealed && opt.key === question.correct_answer && (
                <span style={{ marginLeft: '8px', color: '#4CAF50' }}>✓</span>
              )}
            </span>
            <span style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
              {opt.key === selected && (
                <span style={{ fontSize: '11px', backgroundColor: revealed ? (selected === question.correct_answer ? '#C8E6C9' : '#FDECEA') : '#EDE7F6', padding: '2px 8px', borderRadius: '3px', color: revealed ? (selected === question.correct_answer ? '#2E7D32' : '#C62828') : '#4527A0' }}>
                  Du
                </span>
              )}
              {revealed && opponentAnswer === opt.key && opponentName && (
                <span style={{ fontSize: '11px', backgroundColor: opponentAnswer === question.correct_answer ? '#C8E6C9' : '#FDECEA', padding: '2px 8px', borderRadius: '3px', color: opponentAnswer === question.correct_answer ? '#2E7D32' : '#C62828' }}>
                  {opponentName}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Quiz Round (one question at a time) ─────────────────────────────────────
function QuizRound({
  questions,
  roundNumber,
  totalRounds,
  bot,
  opponentSelections,
  opponentName,
  onRoundComplete,
}: {
  questions: any[];
  roundNumber: number;
  totalRounds: number;
  bot: any;
  opponentSelections?: string[];
  opponentName?: string;
  onRoundComplete: (userAnswers: boolean[], botAnswers: boolean[] | null, selectedAnswers: string[]) => void | Promise<void>;
}) {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [collectedAnswers, setCollectedAnswers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleAnswer = async (answerKey: string) => {
    const newAnswers = [...collectedAnswers, answerKey];
    setCollectedAnswers(newAnswers);

    if (newAnswers.length < questions.length) {
      setCurrentQuestionIdx(idx => idx + 1);
    } else {
      // All questions answered
      setSubmitting(true);
      const userCorrect = questions.map((q, i) => newAnswers[i] === q.correct_answer);
      const botSelections = bot
        ? questions.map((q: any) => {
            const optionKeys = q.type === 'true_false'
              ? ['Wahr', 'Falsch']
              : ['A', 'B', 'C', 'D'].filter(k => q[`option_${k.toLowerCase()}`]);
            return getBotAnswer(optionKeys, q.correct_answer, bot.accuracy);
          })
        : null;
      const botCorrect = botSelections ? botSelections.map((a, idx) => a === questions[idx].correct_answer) : null;
      await onRoundComplete(userCorrect, botCorrect, newAnswers);
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>SPEICHERN...</p>
      </div>
    );
  }

  const currentQ = questions[currentQuestionIdx];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '20px' }}>
          RUNDE {roundNumber} VON {totalRounds}
        </p>
        <SingleQuestion
          question={currentQ}
          questionIndex={currentQuestionIdx}
          totalQuestions={questions.length}
          onAnswer={handleAnswer}
          opponentSelections={opponentSelections}
          opponentName={opponentName}
        />
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '24px' }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: i < currentQuestionIdx ? colors.primary : i === currentQuestionIdx ? '#7E57C2' : colors.light,
              transition: 'background-color 0.3s',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Intermediate Score ───────────────────────────────────────────────────────
function IntermediateScore({ myTotal, botTotal, roundsPlayed, onContinue, opponentName }: {
  myTotal: number; botTotal: number; roundsPlayed: number; onContinue: () => void; opponentName?: string;
}) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>📊</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>ZWISCHENSTAND</h2>
        <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>NACH RUNDE {roundsPlayed}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${myTotal >= botTotal ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${botTotal > myTotal ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>🤖</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{(opponentName || 'GEGNER').toUpperCase()}</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
          </div>
        </div>
        <button style={btnPrimary} onClick={onContinue}>Weiter</button>
      </div>
    </div>
  );
}

// ─── Round Summary (end of game) ─────────────────────────────────────────────
function RoundSummary({ roundsData, isChallenger, opponentName }: {
  roundsData: any[];
  isChallenger: boolean;
  opponentName: string;
}) {
  return (
    <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px' }}>
      <h3 style={{ color: colors.text, fontSize: '15px', marginBottom: '16px', letterSpacing: '1px' }}>RUNDENÜBERSICHT</h3>
      {roundsData.map((round: any, roundIdx: number) => {
        const myAnswers: boolean[] = (isChallenger ? round.challenger_answers : round.opponent_answers) || [];
        const oppAnswers: boolean[] = (isChallenger ? round.opponent_answers : round.challenger_answers) || [];
        const mySelections: string[] = (isChallenger ? round.challenger_selections : round.opponent_selections) || [];
        const oppSelections: string[] = (isChallenger ? round.opponent_selections : round.challenger_selections) || [];

        return (
          <div key={roundIdx} style={{ marginBottom: roundIdx < roundsData.length - 1 ? '20px' : 0, paddingBottom: roundIdx < roundsData.length - 1 ? '20px' : 0, borderBottom: roundIdx < roundsData.length - 1 ? '1px solid #E8DFD0' : 'none' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text, marginBottom: '10px' }}>
              Runde {round.round} · {round.subcategory_name} · Gruppe {round.group_number}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '6px' }}>👤 Du</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {myAnswers.map((correct, qIdx) => (
                    <div key={qIdx} style={{ width: '28px', height: '28px', borderRadius: '4px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'white', fontWeight: 'bold' }}>
                      {mySelections[qIdx] || (correct ? '✓' : '✗')}
                    </div>
                  ))}
                  <div style={{ fontSize: '13px', color: colors.muted, alignSelf: 'center', marginLeft: '6px' }}>
                    {myAnswers.filter(Boolean).length}/{myAnswers.length}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: colors.muted, marginBottom: '6px' }}>👤 {opponentName}</div>
                {oppAnswers.length > 0 ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {oppAnswers.map((correct, qIdx) => (
                      <div key={qIdx} style={{ width: '28px', height: '28px', borderRadius: '4px', backgroundColor: correct ? '#4CAF50' : '#E53935', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'white', fontWeight: 'bold' }}>
                        {oppSelections[qIdx] || (correct ? '✓' : '✗')}
                      </div>
                    ))}
                    <div style={{ fontSize: '13px', color: colors.muted, alignSelf: 'center', marginLeft: '6px' }}>
                      {oppAnswers.filter(Boolean).length}/{oppAnswers.length}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: colors.muted, fontStyle: 'italic' }}>Noch nicht gespielt</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Admin Import ─────────────────────────────────────────────────────────────
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
      try { setQuestions(parseCSV(text)); setResult(''); }
      catch { setResult('Fehler beim Parsen der CSV-Datei.'); }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (questions.length === 0) return;
    setImporting(true); setResult('');
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
        if (!categoryId || !subcategoryId || !bookId) throw new Error(`Nicht gefunden: ${q.question_text.substring(0, 50)}`);
        return { category_id: categoryId, subcategory_id: subcategoryId, book_id: bookId, question_text: q.question_text, type: q.type, correct_answer: q.correct_answer, option_a: q.option_a || null, option_b: q.option_b || null, option_c: q.option_c || null, option_d: q.option_d || null, difficulty: q.difficulty };
      });
      const { error } = await supabase.from('questions').insert(toInsert);
      if (error) throw error;
      setResult(`✅ ${toInsert.length} Fragen erfolgreich importiert!`);
      setQuestions([]); setCsvText('');
    } catch (err: any) { setResult(`❌ Fehler: ${err.message}`); }
    finally { setImporting(false); }
  };

  const handleCreateGroups = async () => {
    setGrouping(true); setGroupResult('');
    try {
      const { data: subs } = await supabase.from('subcategories').select('*');
      if (!subs) throw new Error('Keine Subkategorien gefunden');
      let totalGroupsCreated = 0; const subResults: string[] = [];
      for (const sub of subs) {
        const { data: questionsInSub } = await supabase.from('questions').select('id').eq('subcategory_id', sub.id);
        if (!questionsInSub || questionsInSub.length === 0) continue;
        const { data: existingGroups } = await supabase.from('question_groups').select('id').eq('subcategory_id', sub.id);
        let groupedIds = new Set<string>();
        if (existingGroups && existingGroups.length > 0) {
          const groupIds = existingGroups.map(g => g.id);
          const { data: existingMembers } = await supabase.from('question_group_members').select('question_id').in('group_id', groupIds);
          groupedIds = new Set(existingMembers?.map(m => m.question_id) || []);
        }
        const ungrouped = questionsInSub.filter(q => !groupedIds.has(q.id));
        if (ungrouped.length < 3) continue;
        const { data: maxGroups } = await supabase.from('question_groups').select('group_number').eq('subcategory_id', sub.id).order('group_number', { ascending: false }).limit(1);
        let nextGroupNumber = (maxGroups && maxGroups.length > 0 ? maxGroups[0].group_number : 0) + 1;
        let createdForThisSub = 0;
        for (let i = 0; i + 2 < ungrouped.length; i += 3) {
          const { data: newGroup, error: groupError } = await supabase.from('question_groups').insert({ subcategory_id: sub.id, group_number: nextGroupNumber }).select().single();
          if (groupError || !newGroup) throw groupError;
          await supabase.from('question_group_members').insert([
            { group_id: newGroup.id, question_id: ungrouped[i].id, position: 1 },
            { group_id: newGroup.id, question_id: ungrouped[i + 1].id, position: 2 },
            { group_id: newGroup.id, question_id: ungrouped[i + 2].id, position: 3 },
          ]);
          nextGroupNumber++; createdForThisSub++; totalGroupsCreated++;
        }
        if (createdForThisSub > 0) subResults.push(`${sub.name}: ${createdForThisSub} neue Gruppen`);
      }
      setGroupResult(totalGroupsCreated === 0 ? 'ℹ️ Keine neuen Gruppen erstellt.' : `✅ ${totalGroupsCreated} neue Gruppen:\n${subResults.join('\n')}`);
    } catch (err: any) { setGroupResult(`❌ Fehler: ${err.message}`); }
    finally { setGrouping(false); }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>FRAGEN IMPORTIEREN</h2>
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px' }}>CSV-Format:</h3>
          <pre style={{ fontSize: '12px', color: colors.muted, overflowX: 'auto', backgroundColor: colors.light, padding: '12px', borderRadius: '4px' }}>
{`question_text,type,correct_answer,option_a,option_b,option_c,option_d,difficulty,category_name,subcategory_name,book_title`}
          </pre>
        </div>
        <input type="file" accept=".csv" onChange={handleFileUpload} style={{ marginBottom: '24px', fontFamily: 'Helvetica, Arial, sans-serif' }} />
        {questions.length > 0 && (
          <>
            <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '12px' }}>Preview: {questions.length} Fragen</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {questions.slice(0, 5).map((q, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < 4 ? `1px solid ${colors.light}` : 'none' }}>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: '4px' }}>{q.question_text}</div>
                    <div style={{ fontSize: '12px', color: colors.muted }}>{q.category_name} → {q.subcategory_name}</div>
                  </div>
                ))}
              </div>
            </div>
            <button style={btnPrimary} onClick={handleImport} disabled={importing}>{importing ? 'Importiere...' : `${questions.length} Fragen importieren`}</button>
          </>
        )}
        {result && <div style={{ backgroundColor: result.startsWith('✅') ? '#E8F5E9' : '#FDECEA', border: `1px solid ${result.startsWith('✅') ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginTop: '16px', fontSize: '14px' }}>{result}</div>}
        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>3er-Gruppen verwalten</h3>
          <button style={btnPrimary} onClick={handleCreateGroups} disabled={grouping}>{grouping ? 'Erstelle...' : 'Gruppen erstellen'}</button>
          {groupResult && <div style={{ backgroundColor: groupResult.startsWith('✅') ? '#E8F5E9' : groupResult.startsWith('ℹ️') ? '#FFF9E6' : '#FDECEA', border: `1px solid ${groupResult.startsWith('✅') ? '#4CAF50' : groupResult.startsWith('ℹ️') ? '#FFC107' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginTop: '16px', fontSize: '14px', whiteSpace: 'pre-line' }}>{groupResult}</div>}
        </div>
        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${colors.light}` }}>
          <h3 style={{ fontSize: '16px', color: colors.text, marginBottom: '8px' }}>Gemeldete Fragen</h3>
          <ReportedQuestions />
        </div>
      </div>
    </div>
  );
}

function ReportedQuestions() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  useEffect(() => { loadReports(); }, [filter]); // eslint-disable-line

  const loadReports = async () => {
    setLoading(true);
    let query = supabase.from('question_reports').select('*, questions(*), reported_by:profiles!question_reports_reported_by_fkey(username)').order('created_at', { ascending: false });
    if (filter === 'open') query = query.eq('status', 'open');
    const { data } = await query;
    setReports(data || []); setLoading(false);
  };

  const updateStatus = async (reportId: string, newStatus: string) => {
    await supabase.from('question_reports').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', reportId);
    loadReports();
  };

  const deleteQuestion = async (questionId: string) => {
    if (!window.confirm('Frage wirklich löschen?')) return;
    await supabase.from('questions').delete().eq('id', questionId);
    loadReports();
  };

  if (loading) return <p style={{ color: colors.muted, fontSize: '13px' }}>Lade...</p>;
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['open', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', backgroundColor: filter === f ? colors.primary : colors.light, color: filter === f ? '#F5F0E8' : colors.text }}>
            {f === 'open' ? 'Offen' : 'Alle'}
          </button>
        ))}
      </div>
      {reports.length === 0 ? <p style={{ color: colors.muted, fontSize: '13px' }}>Keine Reports</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map(report => (
            <div key={report.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px' }}>
              <div style={{ fontSize: '14px', color: colors.text, fontWeight: 'bold', marginBottom: '8px' }}>{report.questions?.question_text}</div>
              <div style={{ fontSize: '13px', color: colors.text, marginBottom: '12px', padding: '10px', backgroundColor: '#FFF9E6', borderRadius: '4px' }}>💬 {report.reason}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {report.status === 'open' && (
                  <>
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

// ─── Notifications ────────────────────────────────────────────────────────────
function Notifications({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); markAllAsRead(); }, [userId]); // eslint-disable-line

  const loadNotifications = async () => {
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    setNotifications(data || []); setLoading(false);
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    loadNotifications();
  };

  const iconForType = (type: string) => ({ friend_request: '👥', duel_challenge: '⚔️', duel_turn: '🎯', duel_completed: '🏁' }[type] || '🔔');

  const timeAgo = (dateStr: string) => {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min`;
    if (diffMin < 1440) return `vor ${Math.floor(diffMin / 60)} Std`;
    return `vor ${Math.floor(diffMin / 1440)} Tagen`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>BENACHRICHTIGUNGEN</h2>
        {loading ? <p style={{ color: colors.muted, textAlign: 'center' }}>LADEN...</p> : notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔕</div>
            <p style={{ color: colors.muted }}>Keine Benachrichtigungen</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {notifications.map(notif => (
              <div key={notif.id} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{iconForType(notif.type)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold', marginBottom: '4px' }}>{notif.title}</div>
                  <div style={{ fontSize: '14px', color: colors.text, marginBottom: '6px' }}>{notif.message}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>{timeAgo(notif.created_at)}</div>
                </div>
                <button onClick={() => deleteNotification(notif.id)} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User Search / Friends ────────────────────────────────────────────────────
function UserSearch({ userId, onBack, onChallenge }: { userId: string; onBack: () => void; onChallenge: (opponent: any) => void }) {
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => { loadFriends(); loadPendingRequests(); }, [userId]); // eslint-disable-line

  const loadFriends = async () => {
    const { data } = await supabase.from('friendships').select('*, requester:profiles!friendships_requester_id_fkey(id, username), addressee:profiles!friendships_addressee_id_fkey(id, username)').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).eq('status', 'accepted');
    setFriends(data || []);
  };

  const loadPendingRequests = async () => {
    const { data } = await supabase.from('friendships').select('*, requester:profiles!friendships_requester_id_fkey(id, username)').eq('addressee_id', userId).eq('status', 'pending');
    setPendingRequests(data || []);
  };

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;
    setLoading(true); setMessage('');
    const { data, error } = await supabase.from('profiles').select('id, username').ilike('username', searchUsername.trim()).single();
    if (error || !data) { setMessage('Kein User gefunden.'); setSearchResult(null); }
    else if (data.id === userId) { setMessage('Das bist du selbst!'); setSearchResult(null); }
    else setSearchResult(data);
    setLoading(false);
  };

  const sendFriendRequest = async () => {
    if (!searchResult) return;
    const { data: existing } = await supabase.from('friendships').select('*').or(`and(requester_id.eq.${userId},addressee_id.eq.${searchResult.id}),and(requester_id.eq.${searchResult.id},addressee_id.eq.${userId})`);
    if (existing && existing.length > 0) { setMessage(existing[0].status === 'accepted' ? 'Bereits befreundet!' : 'Anfrage bereits gesendet.'); return; }
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: searchResult.id, status: 'pending' });
    if (error) { setMessage('Fehler beim Senden.'); return; }
    const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
    await supabase.from('notifications').insert({ user_id: searchResult.id, type: 'friend_request', title: 'Neue Freundschaftsanfrage', message: `${myProfile?.username} möchte mit dir befreundet sein` });
    setMessage('✅ Anfrage gesendet!'); setSearchResult(null); setSearchUsername('');
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    loadFriends(); loadPendingRequests();
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
        <input style={inputStyle} placeholder="Username eingeben" value={searchUsername} onChange={e => setSearchUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <button style={btnPrimary} onClick={handleSearch} disabled={loading}>{loading ? 'Suche...' : 'Suchen'}</button>
        {message && <div style={{ backgroundColor: message.startsWith('✅') ? '#E8F5E9' : '#FDECEA', border: `1px solid ${message.startsWith('✅') ? '#4CAF50' : '#E53935'}`, borderRadius: '4px', padding: '16px', marginBottom: '24px', fontSize: '14px' }}>{message}</div>}
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

// ─── Map Quiz ─────────────────────────────────────────────────────────────────
function MapQuiz({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [clickedPoint, setClickedPoint] = useState<{ x: number; y: number } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [distance, setDistance] = useState(0);
  const [points, setPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const MAP_ROUNDS = 10;
  const svgWidth = 400; const svgHeight = 500;
  const swissBox = { minLat: 45.818, maxLat: 47.808, minLon: 5.956, maxLon: 10.492 };

  useEffect(() => {
    supabase.from('map_locations').select('*').then(({ data }) => {
      if (data) setLocations(data.sort(() => Math.random() - 0.5).slice(0, MAP_ROUNDS));
      setLoading(false);
    });
  }, []);

  const latLonToSVG = (lat: number, lon: number) => ({
    x: ((lon - swissBox.minLon) / (swissBox.maxLon - swissBox.minLon)) * svgWidth,
    y: svgHeight - ((lat - swissBox.minLat) / (swissBox.maxLat - swissBox.minLat)) * svgHeight,
  });

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (showResult) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const y = ((e.clientY - rect.top) / rect.height) * svgHeight;
    setClickedPoint({ x, y });
    const correct = latLonToSVG(locations[currentRound].latitude, locations[currentRound].longitude);
    const dist = Math.sqrt(Math.pow(x - correct.x, 2) + Math.pow(y - correct.y, 2));
    const earned = Math.max(0, Math.floor(100 - dist));
    setDistance(Math.round(dist)); setPoints(earned); setTotalPoints(p => p + earned); setShowResult(true);
    setTimeout(() => {
      if (currentRound + 1 >= MAP_ROUNDS) setGameOver(true);
      else { setCurrentRound(r => r + 1); setClickedPoint(null); setShowResult(false); }
    }, 3000);
  };

  if (loading) return <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p></div>;

  if (gameOver) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>🗺️</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '32px' }}>QUIZ BEENDET</h2>
        <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${colors.primary}`, padding: '32px 20px', borderRadius: '4px', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: colors.primary, marginBottom: '8px' }}>{totalPoints}</div>
          <div style={{ fontSize: '14px', color: colors.muted }}>von 1000 Punkten</div>
        </div>
        <button style={btnPrimary} onClick={onBack}>Zurück</button>
      </div>
    </div>
  );

  const loc = locations[currentRound];
  const correctPos = latLonToSVG(loc.latitude, loc.longitude);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>RUNDE {currentRound + 1} / {MAP_ROUNDS}</span>
          <span style={{ color: colors.primary, fontSize: '16px', fontWeight: 'bold' }}>{totalPoints} Punkte</span>
        </div>
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: colors.text, marginBottom: '8px' }}>Wo liegt {loc.name}?</h2>
        </div>
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px' }}>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', cursor: showResult ? 'default' : 'crosshair', backgroundColor: '#E8F4F8', borderRadius: '4px' }} onClick={handleMapClick}>
            <path d="M50,250 L100,200 L150,180 L200,170 L250,175 L300,200 L350,250 L380,300 L370,350 L340,400 L300,430 L250,450 L200,460 L150,450 L100,420 L60,380 L40,330 Z" fill="#C8E6C9" stroke="#2E7D32" strokeWidth="2" />
            {clickedPoint && <circle cx={clickedPoint.x} cy={clickedPoint.y} r="8" fill="#E53935" stroke="white" strokeWidth="2" />}
            {showResult && <>
              <circle cx={correctPos.x} cy={correctPos.y} r="8" fill="#4CAF50" stroke="white" strokeWidth="2" />
              <line x1={clickedPoint!.x} y1={clickedPoint!.y} x2={correctPos.x} y2={correctPos.y} stroke="#666" strokeWidth="1" strokeDasharray="4" />
            </>}
          </svg>
        </div>
        {showResult && (
          <div style={{ backgroundColor: points > 70 ? '#E8F5E9' : points > 40 ? '#FFF9E6' : '#FDECEA', border: `1px solid ${points > 70 ? '#4CAF50' : points > 40 ? '#FFC107' : '#E53935'}`, borderRadius: '4px', padding: '16px', textAlign: 'center', marginTop: '16px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{points > 70 ? '🎯' : points > 40 ? '👍' : '😅'}</div>
            <div style={{ fontSize: '18px', color: colors.text, fontWeight: 'bold' }}>+{points} Punkte</div>
            <div style={{ fontSize: '13px', color: colors.muted }}>Distanz: {distance} Pixel</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Duel Detail (history view) ───────────────────────────────────────────────
function DuelDetail({ duel, userId, onBack }: { duel: any; userId: string; onBack: () => void }) {
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
    (async () => {
      setLoading(true);
      const allRoundQuestions: any[][] = [];
      for (const round of roundsData) {
        const { data: members } = await supabase.from('question_group_members').select('position, questions(*)').eq('group_id', round.group_id).order('position', { ascending: true });
        allRoundQuestions.push(members?.map((m: any) => m.questions).filter(Boolean) || []);
      }
      setQuestions(allRoundQuestions); setLoading(false);
    })();
  }, [duel.id]); // eslint-disable-line

  const submitReport = async () => {
    if (!reportingQuestion || !reportReason.trim()) return;
    const { error } = await supabase.from('question_reports').insert({ question_id: reportingQuestion.id, reported_by: userId, reason: reportReason.trim() });
    setReportSuccess(error ? '❌ Fehler' : '✅ Gemeldet');
    if (!error) setTimeout(() => { setReportingQuestion(null); setReportReason(''); setReportSuccess(''); }, 2000);
  };

  if (loading) return <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p></div>;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: colors.text, fontSize: '20px', margin: 0 }}>vs {oppName}</h2>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.primary }}>{myScore} : {oppScore}</div>
          </div>
        </div>
        {roundsData.map((round: any, roundIdx: number) => {
          const roundQuestions = questions[roundIdx] || [];
          const mySelections: string[] = (isChallenger ? round.challenger_selections : round.opponent_selections) || [];
          const oppSelections: string[] = (isChallenger ? round.opponent_selections : round.challenger_selections) || [];
          const myAnswers: boolean[] = (isChallenger ? round.challenger_answers : round.opponent_answers) || [];
          const oppAnswers: boolean[] = (isChallenger ? round.opponent_answers : round.challenger_answers) || [];

          return (
            <div key={roundIdx} style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '14px', color: colors.text, marginBottom: '12px', letterSpacing: '1px' }}>RUNDE {round.round} · {round.subcategory_name} · Gruppe {round.group_number}</h3>
              {roundQuestions.map((q: any, qIdx: number) => {
                const options = q.type === 'true_false'
                  ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
                  : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);
                return (
                  <div key={qIdx} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: '12px', fontWeight: 'bold' }}>{q.question_text}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                      {options.map(opt => {
                        const isCorrect = opt.key === q.correct_answer;
                        const isMyAns = opt.key === mySelections[qIdx];
                        const isOppAns = opt.key === oppSelections[qIdx];
                        return (
                          <div key={opt.key} style={{ backgroundColor: isCorrect ? '#E8F5E9' : 'white', border: isCorrect ? '1px solid #4CAF50' : '1px solid #E8DFD0', padding: '10px 12px', borderRadius: '4px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><span style={{ fontWeight: 'bold', marginRight: '8px' }}>{opt.key}.</span>{opt.label}{isCorrect && <span style={{ marginLeft: '8px', color: '#4CAF50' }}>✓</span>}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isMyAns && <span style={{ fontSize: '11px', backgroundColor: myAnswers[qIdx] ? '#C8E6C9' : '#FDECEA', padding: '2px 6px', borderRadius: '3px' }}>Du</span>}
                              {isOppAns && <span style={{ fontSize: '11px', backgroundColor: oppAnswers[qIdx] ? '#C8E6C9' : '#FDECEA', padding: '2px 6px', borderRadius: '3px' }}>{oppName}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => setReportingQuestion(q)} style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #E53935', color: '#E53935', borderRadius: '4px', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif' }}>⚠️ Melden</button>
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
            <p style={{ fontSize: '14px', color: colors.text, marginBottom: '8px' }}>{reportingQuestion.question_text}</p>
            <textarea value={reportReason} onChange={e => setReportReason(e.target.value)} placeholder="Was ist das Problem?" style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} />
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

// ─── Highscores ───────────────────────────────────────────────────────────────
function Highscores({ onBack, userId }: { onBack: () => void; userId: string }) {
  const [tab, setTab] = useState<'leaderboard' | 'myduels'>('leaderboard');
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myDuels, setMyDuels] = useState<any[]>([]);
  const [selectedDuel, setSelectedDuel] = useState<any>(null);

  useEffect(() => {
    if (tab === 'leaderboard') {
      supabase.from('scores').select('*, profiles(username), categories(name)').order('points', { ascending: false }).limit(20).then(({ data }) => { setScores(data || []); setLoading(false); });
    } else {
      setLoading(true);
      supabase.from('duels').select('*, challenger:profiles!duels_challenger_id_fkey(username), opponent:profiles!duels_opponent_id_fkey(username), categories(name)').or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`).eq('status', 'completed').order('completed_at', { ascending: false }).then(({ data }) => { setMyDuels(data || []); setLoading(false); });
    }
  }, [tab, userId]);

  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

  if (selectedDuel) return <DuelDetail duel={selectedDuel} userId={userId} onBack={() => setSelectedDuel(null)} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{tab === 'leaderboard' ? 'HIGHSCORES' : 'MEINE DUELLE'}</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {(['leaderboard', 'myduels'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', backgroundColor: tab === t ? colors.primary : colors.light, color: tab === t ? '#F5F0E8' : colors.text }}>
              {t === 'leaderboard' ? 'Bestenliste' : 'Meine Duelle'}
            </button>
          ))}
        </div>
        {loading ? <p style={{ color: colors.muted, textAlign: 'center' }}>LADEN...</p> : tab === 'leaderboard' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {scores.map((s, i) => (
              <div key={s.id || i} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: colors.muted, fontSize: '14px', minWidth: '28px' }}>{medal(i)}</span>
                  <div>
                    <div style={{ color: colors.text, fontSize: '15px', fontWeight: 'bold' }}>{s.profiles?.username || 'Unbekannt'}</div>
                    <div style={{ color: colors.muted, fontSize: '12px' }}>{s.categories?.name}</div>
                  </div>
                </div>
                <div style={{ color: colors.primary, fontSize: '18px', fontWeight: 'bold' }}>{s.points || 0}</div>
              </div>
            ))}
          </div>
        ) : myDuels.length === 0 ? <p style={{ color: colors.muted, textAlign: 'center' }}>Noch keine Duelle</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myDuels.map(d => {
              const isC = d.challenger_id === userId;
              const opp = isC ? d.opponent : d.challenger;
              const myS = isC ? (d.challenger_score || 0) : (d.opponent_score || 0);
              const oppS = isC ? (d.opponent_score || 0) : (d.challenger_score || 0);
              const won = myS > oppS; const draw = myS === oppS;
              const oppName = d.opponent_is_bot ? bots.find(b => b.level === d.bot_level)?.name || 'Bot' : opp?.username;
              return (
                <div key={d.id} onClick={() => setSelectedDuel(d)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold' }}>vs {oppName}</div>
                    <div style={{ fontSize: '16px', color: colors.text }}>{myS} : {oppS}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '12px', color: colors.muted }}>{d.categories?.name}</div>
                    <div style={{ fontSize: '13px', color: won ? '#4CAF50' : draw ? colors.muted : '#E53935' }}>{won ? 'Gewonnen 🏆' : draw ? 'Unentschieden' : 'Verloren'}</div>
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

// ─── Subcategory Selector ─────────────────────────────────────────────────────
// Shows 4 randomised options. Tracks which subs were already shown in this duel.
function SubcategorySelector({
  allSubs,
  shownSubIds,
  roundNumber,
  totalRounds,
  chooserName,
  isMyTurn,
  opponentName,
  onSelect,
}: {
  allSubs: any[];
  shownSubIds: string[];
  roundNumber: number;
  totalRounds: number;
  chooserName: string;
  isMyTurn: boolean;
  opponentName: string;
  onSelect: (sub: any) => void;
}) {
  const [options, setOptions] = useState<any[]>([]);

  useEffect(() => {
    if (!isMyTurn || allSubs.length === 0) return;

    // Subs already used as choices in previous rounds
    const usedAsChoiceIds = new Set(shownSubIds);

    // Build pool: prefer never-shown, fall back to all
    const neverShown = allSubs.filter(s => !usedAsChoiceIds.has(s.id));
    const pool = neverShown.length >= 4 ? neverShown : allSubs;

    // Pick 4 random
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setOptions(shuffled.slice(0, Math.min(4, shuffled.length)));
  }, [isMyTurn, allSubs.length, shownSubIds.length]); // eslint-disable-line

  if (!isMyTurn) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: colors.muted, letterSpacing: '2px' }}>{opponentName.toUpperCase()} WÄHLT...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', marginTop: '20px' }}>RUNDE {roundNumber} VON {totalRounds}</p>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>
          {chooserName === 'Du' ? 'Du wählst das Thema' : `${chooserName} wählt das Thema`}
        </h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Wähle eine der folgenden Optionen</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map(sub => (
            <div key={sub.id} onClick={() => onSelect(sub)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: colors.text, fontSize: '16px' }}>{sub.name}</div>
              <div style={{ color: colors.muted, fontSize: '13px' }}>{sub.question_count || ''} Fragen</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BOT DUEL ─────────────────────────────────────────────────────────────────
function BotDuelGame({ duel, userId, onFinish }: { duel: any; userId: string; onFinish: () => void }) {
  const [allSubs, setAllSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<'selectSub' | 'announcement' | 'playing' | 'intermediate' | 'done'>('selectSub');
  const [questions, setQuestions] = useState<any[]>([]);
  const [roundSubcategories, setRoundSubcategories] = useState<any[]>([]);
  const [roundUserAnswers, setRoundUserAnswers] = useState<boolean[][]>([]);
  const [roundBotAnswers, setRoundBotAnswers] = useState<boolean[][]>([]);
  const [roundUserSelections, setRoundUserSelections] = useState<string[][]>([]);
  const [announcementSub, setAnnouncementSub] = useState<any>(null);
  // Track which sub IDs were shown as choices so far
  const [shownSubIds, setShownSubIds] = useState<string[]>([]);

  const bot = bots.find(b => b.level === duel.bot_level) || bots[0];
  const userChoosesThisRound = currentRound === 1 || currentRound === 3;

  useEffect(() => {
    (async () => {
      const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', duel.category_id);
      const subsWithCounts: any[] = [];
      for (const s of subs || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subcategory_id', s.id);
        subsWithCounts.push({ ...s, question_count: count || 0 });
      }
      setAllSubs(subsWithCounts);
      setLoading(false);
    })();
  }, [duel.category_id]);

  // Bot auto-picks when it's its turn
  useEffect(() => {
    if (phase === 'selectSub' && !userChoosesThisRound && allSubs.length > 0) {
      // Bot picks from subs not yet shown
      const notShown = allSubs.filter(s => !shownSubIds.includes(s.id));
      const pool = notShown.length > 0 ? notShown : allSubs;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setAnnouncementSub(pick);
      setShownSubIds(prev => [...prev, pick.id]);
      setPhase('announcement');
      setTimeout(() => loadQuestionsForSub(pick), 3000);
    }
  }, [phase, userChoosesThisRound, allSubs.length]); // eslint-disable-line

  const loadQuestionsForSub = async (sub: any) => {
    setLoading(true);
    const group = await findBestGroup(sub.id, [userId]);
    if (!group) { setQuestions([]); setLoading(false); setPhase('playing'); return; }

    const { data: members } = await supabase.from('question_group_members').select('position, questions(*)').eq('group_id', group.id).order('position', { ascending: true });
    const qs = members?.map((m: any) => m.questions).filter(Boolean) || [];

    const { data: alreadyPlayed } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', group.id).maybeSingle();
    if (!alreadyPlayed) await supabase.from('played_groups').insert({ user_id: userId, group_id: group.id });

    setRoundSubcategories(prev => {
      const updated = [...prev];
      updated[currentRound - 1] = { ...sub, group_id: group.id, group_number: group.group_number };
      return updated;
    });
    setQuestions(qs);
    setLoading(false);
    setPhase('playing');
  };

  const handleSubSelect = (sub: any) => {
    setShownSubIds(prev => [...prev, sub.id]);
    loadQuestionsForSub(sub);
  };

  const handleRoundComplete = async (userAnswers: boolean[], botAnswers: boolean[] | null, selectedAnswers: string[]) => {
    const newUserAnswers = [...roundUserAnswers, userAnswers];
    const newBotAnswers = [...roundBotAnswers, botAnswers || []];
    const newUserSelections = [...roundUserSelections, selectedAnswers];
    setRoundUserAnswers(newUserAnswers);
    setRoundBotAnswers(newBotAnswers);
    setRoundUserSelections(newUserSelections);

    const myTotal = newUserAnswers.flat().filter(Boolean).length;
    const botTotal = newBotAnswers.flat().filter(Boolean).length;

    if (currentRound < TOTAL_ROUNDS) {
      // Show intermediate after every round
      setPhase('intermediate');
    } else {
      // Game over
      await supabase.from('scores').insert({ user_id: userId, category_id: duel.category_id, points: myTotal * 10, correct_count: myTotal, total_questions: TOTAL_ROUNDS * QUESTIONS_PER_ROUND });
      await supabase.from('duels').update({ status: 'completed', challenger_score: myTotal, opponent_score: botTotal, completed_at: new Date().toISOString() }).eq('id', duel.id);
      setPhase('done');
    }
  };

  const handleIntermediateContinue = () => {
    setCurrentRound(r => r + 1);
    setPhase('selectSub');
    setQuestions([]);
  };

  if (loading && phase !== 'playing') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (phase === 'done') {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    const won = myTotal > botTotal; const draw = myTotal === botTotal;
    const totalQ = TOTAL_ROUNDS * QUESTIONS_PER_ROUND;

    // Build rounds data for summary
    const roundsDataForSummary = roundSubcategories.map((sub, i) => ({
      round: i + 1,
      subcategory_name: sub.name,
      group_number: sub.group_number,
      challenger_answers: roundUserAnswers[i] || [],
      opponent_answers: roundBotAnswers[i] || [],
      challenger_selections: roundUserSelections[i] || [],
      opponent_selections: [],
    }));

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
            <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
                <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
                <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ}</div>
              </div>
              <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{bot.emoji}</div>
                <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{bot.name.split(' ')[1]?.toUpperCase()}</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotal}</div>
                <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ}</div>
              </div>
            </div>
          </div>
          <RoundSummary roundsData={roundsDataForSummary} isChallenger={true} opponentName={bot.name} />
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'intermediate') {
    const myTotal = roundUserAnswers.flat().filter(Boolean).length;
    const botTotal = roundBotAnswers.flat().filter(Boolean).length;
    return <IntermediateScore myTotal={myTotal} botTotal={botTotal} roundsPlayed={currentRound} onContinue={handleIntermediateContinue} opponentName={bot.name} />;
  }

  if (phase === 'announcement' && announcementSub) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica, Arial, sans-serif', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{bot.emoji}</div>
          <h2 style={{ color: colors.primary, fontSize: 'clamp(18px, 5vw, 22px)', marginBottom: '12px', letterSpacing: '1px' }}>{bot.name.toUpperCase()}</h2>
          <p style={{ color: colors.text, fontSize: '16px', marginBottom: '8px' }}>hat gewählt:</p>
          <p style={{ color: colors.primary, fontSize: 'clamp(18px, 4vw, 20px)', fontWeight: 'bold', letterSpacing: '1px' }}>{announcementSub.name}</p>
        </div>
      </div>
    );
  }

  if (phase === 'selectSub') {
    return (
      <SubcategorySelector
        allSubs={allSubs}
        shownSubIds={shownSubIds}
        roundNumber={currentRound}
        totalRounds={TOTAL_ROUNDS}
        chooserName="Du"
        isMyTurn={userChoosesThisRound}
        opponentName={bot.name}
        onSelect={handleSubSelect}
      />
    );
  }

  // phase === 'playing'
  if (questions.length < QUESTIONS_PER_ROUND) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', marginBottom: '24px', textAlign: 'center' }}>Zu wenige Fragen verfügbar.</p>
      <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück</button>
    </div>
  );

  return (
    <div>
      <div style={{ backgroundColor: colors.light, padding: '8px 16px', fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center' }}>
        <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
          {roundSubcategories[currentRound - 1]?.name?.toUpperCase()} · GRUPPE {roundSubcategories[currentRound - 1]?.group_number}
        </span>
      </div>
      <QuizRound
        questions={questions}
        roundNumber={currentRound}
        totalRounds={TOTAL_ROUNDS}
        bot={bot}
        onRoundComplete={handleRoundComplete}
      />
    </div>
  );
}

// ─── USER DUEL ────────────────────────────────────────────────────────────────
function UserDuelGame({ duel, userId, onFinish }: { duel: any; userId: string; onFinish: () => void }) {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'selectSub' | 'playing' | 'waiting' | 'intermediate' | 'done'>('selectSub');
  const [allSubs, setAllSubs] = useState<any[]>([]);
  const [currentQuestions, setCurrentQuestions] = useState<any[]>([]);
  const [currentRoundInfo, setCurrentRoundInfo] = useState<any>(null);
  const [opponentProfile, setOpponentProfile] = useState<any>(null);
  const [duelData, setDuelData] = useState<any>(duel);
  const [showIntermediate, setShowIntermediate] = useState(false);

  const isChallenger = duel.challenger_id === userId;
  const opponentId = isChallenger ? duel.opponent_id : duel.challenger_id;
  const roundsData: any[] = duelData.rounds_data || [];

  // Sub IDs that were already presented as options this duel
  const shownSubIds = roundsData.map((r: any) => r.subcategory_id).filter(Boolean);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: oppProfile } = await supabase.from('profiles').select('username').eq('id', opponentId).single();
      setOpponentProfile(oppProfile);

      const { data: subs } = await supabase.from('subcategories').select('*').eq('category_id', duel.category_id);
      const subsWithCounts: any[] = [];
      for (const s of subs || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subcategory_id', s.id);
        subsWithCounts.push({ ...s, question_count: count || 0 });
      }
      setAllSubs(subsWithCounts);
      setLoading(false);
      determinePhase(duelData);
    })();
  }, [duel.id]); // eslint-disable-line

  const whoChoosesRound = (round: number) => (round === 1 || round === 3) ? duel.challenger_id : duel.opponent_id;

  const determinePhase = (data: any) => {
    const rounds: any[] = data.rounds_data || [];
    if (data.status === 'completed') { setPhase('done'); return; }
    if (data.current_turn_user_id !== userId) { setPhase('waiting'); return; }

    // Check if there's an unplayed round (opponent chose, now I must play)
    const lastRound = rounds[rounds.length - 1];
    if (lastRound) {
      const iHavePlayed = isChallenger ? !!lastRound.challenger_answers : !!lastRound.opponent_answers;
      if (!iHavePlayed) { setPhase('playing'); loadExistingRound(lastRound); return; }
    }
    setPhase('selectSub');
  };

  const loadExistingRound = async (roundInfo: any) => {
    setLoading(true);
    const { data: members } = await supabase.from('question_group_members').select('position, questions(*)').eq('group_id', roundInfo.group_id).order('position', { ascending: true });
    const qs = members?.map((m: any) => m.questions).filter(Boolean) || [];
    const { data: ap } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', roundInfo.group_id).maybeSingle();
    if (!ap) await supabase.from('played_groups').insert({ user_id: userId, group_id: roundInfo.group_id });
    setCurrentQuestions(qs);
    setCurrentRoundInfo(roundInfo);
    setLoading(false);
    setPhase('playing');
  };

  const handleSubSelect = async (sub: any) => {
    setLoading(true);
    const nextRound = roundsData.length + 1;
    const group = await findBestGroup(sub.id, [userId, opponentId]);
    if (!group) { setLoading(false); return; }

    const { data: members } = await supabase.from('question_group_members').select('position, questions(*)').eq('group_id', group.id).order('position', { ascending: true });
    const qs = members?.map((m: any) => m.questions).filter(Boolean) || [];
    const { data: ap } = await supabase.from('played_groups').select('id').eq('user_id', userId).eq('group_id', group.id).maybeSingle();
    if (!ap) await supabase.from('played_groups').insert({ user_id: userId, group_id: group.id });

    const roundInfo = {
      round: nextRound,
      subcategory_id: sub.id,
      subcategory_name: sub.name,
      group_id: group.id,
      group_number: group.group_number,
      chosen_by: userId,
    };
    setCurrentQuestions(qs);
    setCurrentRoundInfo(roundInfo);
    setLoading(false);
    setPhase('playing');
  };

  const handleRoundComplete = async (userAnswers: boolean[], _bot: any, selectedAnswers: string[]) => {
    setLoading(true);
    const newRoundsData = [...roundsData];
    const roundIdx = newRoundsData.findIndex((r: any) => r.round === currentRoundInfo.round);

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
    const bothAnswered = !!(lastRound.challenger_answers && lastRound.opponent_answers);
    const roundNumber = newRoundsData.length;
    const isLastRound = roundNumber === TOTAL_ROUNDS && bothAnswered;

    let newStatus = duelData.status;
    let newTurnUserId = duelData.current_turn_user_id;

    if (isLastRound) {
      newStatus = 'completed';
      newTurnUserId = null;
    } else if (bothAnswered) {
      // Next round: different chooser
      const nextRound = roundNumber + 1;
      newTurnUserId = whoChoosesRound(nextRound);
    } else {
      // Partner must play this round
      newTurnUserId = opponentId;
    }

    const challengerScore = newRoundsData.reduce((s: number, r: any) => s + (r.challenger_answers?.filter(Boolean).length || 0), 0);
    const opponentScore = newRoundsData.reduce((s: number, r: any) => s + (r.opponent_answers?.filter(Boolean).length || 0), 0);

    await supabase.from('duels').update({
      rounds_data: newRoundsData,
      status: newStatus,
      current_turn_user_id: newTurnUserId,
      challenger_score: challengerScore,
      opponent_score: opponentScore,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', duelData.id);

    // Notification
    if (newTurnUserId === opponentId) {
      const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
      await supabase.from('notifications').insert({
        user_id: opponentId,
        type: newStatus === 'completed' ? 'duel_completed' : 'duel_turn',
        title: newStatus === 'completed' ? 'Duell beendet' : 'Du bist dran!',
        message: newStatus === 'completed'
          ? `Das Duell gegen ${myProfile?.username} ist fertig!`
          : `${myProfile?.username} hat eine Runde beendet`,
        related_id: duelData.id,
      });
    }

    const newDuelData = { ...duelData, rounds_data: newRoundsData, status: newStatus, current_turn_user_id: newTurnUserId };
    setDuelData(newDuelData);
    setLoading(false);

    if (newStatus === 'completed') {
      setPhase('done');
    } else {
      // Show intermediate after each completed exchange (both played same round)
      if (bothAnswered) {
        setShowIntermediate(true);
      } else {
        setPhase('waiting');
      }
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  // Intermediate between rounds (when both have played same round)
  if (showIntermediate) {
    const rounds: any[] = duelData.rounds_data || [];
    const myTotal = rounds.reduce((s: number, r: any) => s + ((isChallenger ? r.challenger_answers : r.opponent_answers)?.filter(Boolean).length || 0), 0);
    const oppTotal = rounds.reduce((s: number, r: any) => s + ((isChallenger ? r.opponent_answers : r.challenger_answers)?.filter(Boolean).length || 0), 0);
    return (
      <IntermediateScore
        myTotal={myTotal}
        botTotal={oppTotal}
        roundsPlayed={rounds.length}
        opponentName={opponentProfile?.username || 'Gegner'}
        onContinue={() => { setShowIntermediate(false); setPhase('waiting'); }}
      />
    );
  }

  if (phase === 'done') {
    const rounds: any[] = duelData.rounds_data || [];
    const myTotal = rounds.reduce((s: number, r: any) => s + ((isChallenger ? r.challenger_answers : r.opponent_answers)?.filter(Boolean).length || 0), 0);
    const oppTotal = rounds.reduce((s: number, r: any) => s + ((isChallenger ? r.opponent_answers : r.challenger_answers)?.filter(Boolean).length || 0), 0);
    const won = myTotal > oppTotal; const draw = myTotal === oppTotal;
    const totalQ = TOTAL_ROUNDS * QUESTIONS_PER_ROUND;
    const oppName = opponentProfile?.username || 'Gegner';

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, padding: '20px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
            <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>{won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
                <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotal}</div>
                <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ}</div>
              </div>
              <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
                <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{oppName.toUpperCase()}</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{oppTotal}</div>
                <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ}</div>
              </div>
            </div>
          </div>
          <RoundSummary roundsData={rounds} isChallenger={isChallenger} opponentName={oppName} />
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
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '32px' }}>Du bekommst eine Benachrichtigung wenn du wieder dran bist.</p>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'playing') {
    // Get opponent's selections for this round (if they already played)
    const thisRound = (duelData.rounds_data || []).find((r: any) => r.round === currentRoundInfo?.round);
    const oppSelections: string[] | undefined = thisRound
      ? (isChallenger ? thisRound.opponent_selections : thisRound.challenger_selections)
      : undefined;

    return (
      <div>
        <div style={{ backgroundColor: colors.light, padding: '8px 16px', fontFamily: 'Helvetica, Arial, sans-serif', textAlign: 'center' }}>
          <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
            {currentRoundInfo?.subcategory_name?.toUpperCase()} · GRUPPE {currentRoundInfo?.group_number}
          </span>
        </div>
        <QuizRound
          questions={currentQuestions}
          roundNumber={currentRoundInfo?.round || 1}
          totalRounds={TOTAL_ROUNDS}
          bot={null}
          opponentSelections={oppSelections}
          opponentName={opponentProfile?.username}
          onRoundComplete={handleRoundComplete}
        />
      </div>
    );
  }

  // phase === 'selectSub'
  const nextRound = roundsData.length + 1;
  const isMyTurnToChoose = whoChoosesRound(nextRound) === userId;

  return (
    <SubcategorySelector
      allSubs={allSubs}
      shownSubIds={shownSubIds}
      roundNumber={nextRound}
      totalRounds={TOTAL_ROUNDS}
      chooserName={isMyTurnToChoose ? 'Du' : (opponentProfile?.username || 'Gegner')}
      isMyTurn={isMyTurnToChoose}
      opponentName={opponentProfile?.username || 'Gegner'}
      onSelect={handleSubSelect}
    />
  );
}

// ─── Duels List ───────────────────────────────────────────────────────────────
function DuelsList({ userId, onOpenDuel, onBack, onNewUserDuel }: {
  userId: string; onOpenDuel: (duel: any) => void; onBack: () => void; onNewUserDuel: () => void;
}) {
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from('duels').select('*, challenger:profiles!duels_challenger_id_fkey(id, username), opponent:profiles!duels_opponent_id_fkey(id, username), categories(name)').or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`).eq('opponent_is_bot', false).order('created_at', { ascending: false }).then(({ data }) => { setDuels(data || []); setLoading(false); });
  }, [userId]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>USER-DUELLE</h2>
        <button style={btnPrimary} onClick={onNewUserDuel}>+ Neues Duell starten</button>
        {loading ? <p style={{ color: colors.muted, textAlign: 'center', marginTop: '24px' }}>LADEN...</p> : duels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚔️</div>
            <p style={{ color: colors.muted }}>Noch keine Duelle</p>
          </div>
        ) : (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {duels.map(d => {
              const isC = d.challenger_id === userId;
              const opp = isC ? d.opponent : d.challenger;
              const myS = isC ? (d.challenger_score || 0) : (d.opponent_score || 0);
              const oppS = isC ? (d.opponent_score || 0) : (d.challenger_score || 0);
              const isMyTurn = d.current_turn_user_id === userId;
              const isDone = d.status === 'completed';
              let statusText = isDone ? (myS > oppS ? 'Gewonnen 🏆' : myS < oppS ? 'Verloren' : 'Unentschieden') : isMyTurn ? 'Du bist dran!' : `Warte auf ${opp?.username}`;
              let statusColor = isDone ? (myS > oppS ? '#4CAF50' : myS < oppS ? '#E53935' : colors.muted) : isMyTurn ? colors.primary : colors.muted;
              return (
                <div key={d.id} onClick={() => onOpenDuel(d)} style={{ backgroundColor: '#FDFAF5', border: `1px solid ${isMyTurn && !isDone ? colors.primary : '#C9B99A'}`, borderRadius: '4px', padding: '16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '15px', color: colors.text, fontWeight: 'bold' }}>vs {opp?.username}</div>
                    {isDone && <div style={{ fontSize: '14px', color: colors.text }}>{myS} : {oppS}</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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

// ─── User Duel Category Select ────────────────────────────────────────────────
function UserDuelCategorySelect({ opponent, userId, onBack, onStart }: {
  opponent: any; userId: string; onBack: () => void; onStart: (duel: any) => void;
}) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase.from('categories').select('*');
      const result: any[] = [];
      for (const cat of cats || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
        result.push({ ...cat, question_count: count || 0 });
      }
      setCategories(result); setLoading(false);
    })();
  }, []);

  const startDuel = async (category: any) => {
    const { data, error } = await supabase.from('duels').insert({
      challenger_id: userId, opponent_id: opponent.id, opponent_is_bot: false,
      category_id: category.id, status: 'challenger_turn', current_turn_user_id: userId, rounds_data: [],
    }).select('*, categories(name)').single();
    if (error) { alert('Fehler beim Erstellen'); return; }
    const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', userId).single();
    await supabase.from('notifications').insert({ user_id: opponent.id, type: 'duel_challenge', title: 'Neue Herausforderung', message: `${myProfile?.username} hat dich zum Duell herausgefordert`, related_id: data.id });
    onStart(data);
  };

  const icons: Record<string, string> = { 'Geschichte der Schweiz': '🇨🇭', 'Philosophie & Denker': '💭', 'Weltgeschichte': '🌍' };

  if (loading) return <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: colors.muted, fontFamily: 'Helvetica, Arial, sans-serif', letterSpacing: '2px' }}>LADEN...</p></div>;

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

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  type View = 'home' | 'selectCategoryBot' | 'selectOpponentBot' | 'botDuel' | 'userDuel' | 'userDuelsList' | 'userSearch' | 'userDuelCategory' | 'highscores' | 'admin' | 'notifications' | 'mapQuiz';
  const [view, setView] = useState<View>('home');
  const [categories, setCategories] = useState<any[]>([]);
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
    const { count } = await supabase.from('duels').select('*', { count: 'exact', head: true }).eq('opponent_is_bot', false).eq('current_turn_user_id', user.id);
    setActiveDuelsCount(count || 0);
  };

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase.from('categories').select('*');
      const result: any[] = [];
      for (const cat of cats || []) {
        const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
        result.push({ ...cat, question_count: count || 0 });
      }
      setCategories(result);
      const { count: total } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      setTotalQuestions(total || 0);
    })();
    supabase.from('profiles').select('is_admin').eq('id', user.id).single().then(({ data }) => setIsAdmin(data?.is_admin || false));
    loadUnreadCount();
    loadActiveDuelsCount();
    const interval = setInterval(() => { loadUnreadCount(); loadActiveDuelsCount(); }, 30000);
    return () => clearInterval(interval);
  }, [user.id]); // eslint-disable-line

  const icons: Record<string, string> = { 'Geschichte der Schweiz': '🇨🇭', 'Philosophie & Denker': '💭', 'Weltgeschichte': '🌍' };

  const startBotDuel = async (bot: any) => {
    const { data } = await supabase.from('duels').insert({ challenger_id: user.id, opponent_is_bot: true, bot_level: bot.level, category_id: selectedCategory.id, status: 'challenger_turn' }).select().single();
    if (data) { setActiveDuel(data); setView('botDuel'); }
  };

  if (view === 'botDuel' && activeDuel) return <BotDuelGame duel={activeDuel} userId={user.id} onFinish={() => { setActiveDuel(null); setView('home'); loadActiveDuelsCount(); }} />;
  if (view === 'userDuel' && activeDuel) return <UserDuelGame duel={activeDuel} userId={user.id} onFinish={() => { setActiveDuel(null); setView('userDuelsList'); loadActiveDuelsCount(); }} />;
  if (view === 'highscores') return <Highscores onBack={() => setView('home')} userId={user.id} />;
  if (view === 'admin') return <AdminImport onBack={() => setView('home')} />;
  if (view === 'notifications') return <Notifications userId={user.id} onBack={() => { setView('home'); loadUnreadCount(); }} />;
  if (view === 'userSearch') return <UserSearch userId={user.id} onBack={() => setView('home')} onChallenge={(opp) => { setChallengingUser(opp); setView('userDuelCategory'); }} />;
  if (view === 'mapQuiz') return <MapQuiz userId={user.id} onBack={() => setView('home')} />;
  if (view === 'userDuelCategory' && challengingUser) return <UserDuelCategorySelect opponent={challengingUser} userId={user.id} onBack={() => setView('userSearch')} onStart={(duel) => { setChallengingUser(null); setActiveDuel(duel); setView('userDuel'); }} />;
  if (view === 'userDuelsList') return <DuelsList userId={user.id} onOpenDuel={(duel) => { setActiveDuel(duel); setView('userDuel'); }} onBack={() => setView('home')} onNewUserDuel={() => setView('userSearch')} />;

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
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '0', right: '0', backgroundColor: '#E53935', color: 'white', fontSize: '11px', fontWeight: 'bold', borderRadius: '50%', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unreadCount}</span>}
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
            {activeDuelsCount > 0 && <span style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: '#F5F0E8', color: colors.primary, fontSize: '12px', fontWeight: 'bold', borderRadius: '12px', padding: '3px 8px' }}>{activeDuelsCount} dran</span>}
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

// ─── App ──────────────────────────────────────────────────────────────────────
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
    supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
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

  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setMode('home'); };

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