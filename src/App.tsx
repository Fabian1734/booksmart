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
  fontFamily: 'Georgia, serif',
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
  fontFamily: 'Georgia, serif',
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

const QUESTIONS_PER_ROUND = 5;

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
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>HIGHSCORES</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button onClick={() => setSelectedCategory('all')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', backgroundColor: selectedCategory === 'all' ? colors.primary : colors.light, color: selectedCategory === 'all' ? '#F5F0E8' : colors.text }}>Alle</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', backgroundColor: selectedCategory === cat.id ? colors.primary : colors.light, color: selectedCategory === cat.id ? '#F5F0E8' : colors.text }}>{cat.name}</button>
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

function QuizRound({ questions, roundNumber, totalRounds, onRoundComplete }: {
  questions: any[], roundNumber: number, totalRounds: number,
  onRoundComplete: (correct: number) => void
}) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);

  const handleAnswer = (answer: string) => {
    if (selected) return;
    const isCorrect = answer === questions[current].correct_answer;
    setSelected(answer);
    const newCorrect = isCorrect ? correct + 1 : correct;
    if (isCorrect) setCorrect(newCorrect);

    setTimeout(() => {
      if (current + 1 >= questions.length) {
        onRoundComplete(newCorrect);
      } else {
        setCurrent(c => c + 1);
        setSelected(null);
      }
    }, 1200);
  };

  const q = questions[current];
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
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
            const isSelected = opt.key === selected;
            let bg = '#FDFAF5', border = '1px solid #C9B99A', color = colors.text;
            if (selected) {
              if (isCorrect) { bg = '#E8F5E9'; border = '1px solid #4CAF50'; color = '#2E7D32'; }
              else if (isSelected) { bg = '#FDECEA'; border = '1px solid #E53935'; color = '#B71C1C'; }
            }
            return (
              <button key={opt.key} onClick={() => handleAnswer(opt.key)} style={{
                padding: '14px 16px', backgroundColor: bg, border, color,
                fontSize: 'clamp(14px, 3.5vw, 16px)', fontFamily: 'Georgia, serif',
                cursor: selected ? 'default' : 'pointer', borderRadius: '4px',
                textAlign: 'left', minHeight: '52px', WebkitTapHighlightColor: 'transparent',
              }}>
                <span style={{ fontWeight: 'bold', marginRight: '10px' }}>{opt.key}.</span>{opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DuelGame({ duel, userId, onFinish }: { duel: any, userId: string, onFinish: () => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [roundSubcategories, setRoundSubcategories] = useState<any[]>([]);
  const [done, setDone] = useState(false);
  const [myTotalScore, setMyTotalScore] = useState(0);
  const [botTotalScore, setBotTotalScore] = useState(0);
  const [phase, setPhase] = useState<'selectSub' | 'playing'>('selectSub');
  const [availableSubs, setAvailableSubs] = useState<any[]>([]);

  const opponentName = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.name || 'Bot' : 'Gegner';
  const opponentEmoji = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.emoji || '🤖' : '👤';
  const botAccuracy = duel.opponent_is_bot ? bots.find(b => b.level === duel.bot_level)?.accuracy || 0.5 : 0;
  const totalRounds = 4;

  const userChoosesThisRound = currentRound === 1 || currentRound === 3;

  useEffect(() => {
    supabase.from('subcategories').select('*').eq('category_id', duel.category_id).then(({ data }) => {
      setAvailableSubs(data || []);
    });
  }, [duel.category_id]);

  useEffect(() => {
    const autoPickForBot = async () => {
      if (phase === 'selectSub' && !userChoosesThisRound && availableSubs.length > 0) {
        const randomSub = availableSubs[Math.floor(Math.random() * availableSubs.length)];
        await loadQuestionsForSub(randomSub);
      }
    };
    autoPickForBot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userChoosesThisRound, availableSubs, currentRound]);

  const loadQuestionsForSub = async (sub: any) => {
    setLoading(true);
    setRoundSubcategories(prev => [...prev, sub]);
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('subcategory_id', sub.id)
      .limit(QUESTIONS_PER_ROUND);
    setQuestions(data || []);
    setLoading(false);
    setPhase('playing');
  };

  const handleRoundComplete = async (correct: number) => {
    const newRoundScores = [...roundScores, correct];
    setRoundScores(newRoundScores);

    if (currentRound < totalRounds) {
      setCurrentRound(r => r + 1);
      setPhase('selectSub');
      setQuestions([]);
    } else {
      const myTotal = newRoundScores.reduce((a, b) => a + b, 0);
      setMyTotalScore(myTotal);

      if (duel.opponent_is_bot) {
        let botTotal = 0;
        for (let i = 0; i < totalRounds * QUESTIONS_PER_ROUND; i++) {
          if (Math.random() < botAccuracy) botTotal++;
        }
        setBotTotalScore(botTotal);

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
      }
      setDone(true);
    }
  };

  if (done) {
    const won = myTotalScore > botTotalScore;
    const draw = myTotalScore === botTotalScore;
    const totalQ = totalRounds * QUESTIONS_PER_ROUND;
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Georgia, serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
          <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>
            {won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}
          </h2>
          <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '13px', letterSpacing: '1px' }}>4 RUNDEN ABGESCHLOSSEN</p>

          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
            {roundScores.map((s, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < roundScores.length - 1 ? '1px solid #E8DFD0' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: colors.text, fontSize: '13px', fontWeight: 'bold' }}>Runde {i + 1}</span>
                  <span style={{ color: colors.text, fontSize: '13px', fontWeight: 'bold' }}>{s}/{QUESTIONS_PER_ROUND} richtig</span>
                </div>
                <div style={{ color: colors.muted, fontSize: '12px' }}>{roundSubcategories[i]?.name}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>👤</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>DU</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{myTotalScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
            <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{opponentEmoji}</div>
              <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '6px' }}>{opponentName.split(' ')[1]?.toUpperCase() || opponentName.toUpperCase()}</div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: colors.primary }}>{botTotalScore}</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>von {totalQ} richtig</div>
            </div>
          </div>
          <button style={btnPrimary} onClick={onFinish}>Zurück zum Dashboard</button>
        </div>
      </div>
    );
  }

  if (phase === 'selectSub') {
    if (!userChoosesThisRound) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif' }}>
          <p style={{ color: colors.muted, letterSpacing: '2px' }}>{opponentName.split(' ')[1]?.toUpperCase() || 'GEGNER'} WÄHLT...</p>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
          <p style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px', marginBottom: '6px', marginTop: '20px' }}>RUNDE {currentRound} VON {totalRounds}</p>
          <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Du wählst das Thema</h2>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>Für diese Runde</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {availableSubs.map(sub => (
              <div key={sub.id} onClick={() => loadQuestionsForSub(sub)} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '16px 20px', cursor: 'pointer', borderRadius: '4px', color: colors.text, fontSize: '15px' }}>
                {sub.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (questions.length < QUESTIONS_PER_ROUND) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', marginBottom: '24px', textAlign: 'center' }}>Zu wenige Fragen in "{roundSubcategories[currentRound - 1]?.name}".<br />Bitte zuerst Fragen hinzufügen.</p>
      <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück zum Dashboard</button>
    </div>
  );

  return (
    <div>
      <div style={{ backgroundColor: colors.light, padding: '8px 16px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
        <span style={{ color: colors.muted, fontSize: '12px', letterSpacing: '1px' }}>
          {roundSubcategories[currentRound - 1]?.name.toUpperCase()} · {userChoosesThisRound ? 'DEINE WAHL' : `${(opponentName.split(' ')[1] || 'GEGNER').toUpperCase()} HAT GEWÄHLT`}
        </span>
      </div>
      <QuizRound
        questions={questions}
        roundNumber={currentRound}
        totalRounds={totalRounds}
        onRoundComplete={handleRoundComplete}
      />
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [view, setView] = useState<'home' | 'selectCategory' | 'selectOpponent' | 'duel' | 'highscores'>('home');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [activeDuel, setActiveDuel] = useState<any>(null);

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
  }, []);

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

  if (view === 'selectOpponent') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('selectCategory')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
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
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>Das Thema pro Runde wählst du später im Duell</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setView('selectOpponent'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '28px' }}>{icons[cat.name] || '📚'}</div>
              <div style={{ color: colors.text, fontSize: '16px' }}>{cat.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingTop: '12px' }}>
          <h1 style={{ color: colors.primary, letterSpacing: '2px', margin: 0, fontSize: 'clamp(20px, 5vw, 28px)' }}>BOOKSMART</h1>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px' }}>Abmelden</button>
        </div>
        <p style={{ color: colors.muted, fontSize: '13px', letterSpacing: '1px', marginBottom: '32px' }}>WILLKOMMEN ZURÜCK</p>
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
    if (data.user) await supabase.from('profiles').insert({ id: data.user.id, username });
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
        <h2 style={{ textAlign: 'center', color: colors.primary, fontFamily: 'Georgia, serif', letterSpacing: '2px', marginBottom: '32px' }}>ANMELDEN</h2>
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
        <h2 style={{ textAlign: 'center', color: colors.primary, fontFamily: 'Georgia, serif', letterSpacing: '2px', marginBottom: '32px' }}>REGISTRIEREN</h2>
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
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
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