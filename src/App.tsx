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

function getBotAnswer(optionKeys: string[], correctAnswer: string, accuracy: number): string {
  if (Math.random() < accuracy) return correctAnswer;
  const wrong = optionKeys.filter(o => o !== correctAnswer);
  return wrong[Math.floor(Math.random() * wrong.length)];
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
      if (selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }
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
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0', WebkitTapHighlightColor: 'transparent' }}>← Zurück</button>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '24px', fontSize: 'clamp(18px, 5vw, 24px)' }}>HIGHSCORES</h2>

        {/* Kategorie Filter */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button onClick={() => setSelectedCategory('all')} style={{
            padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px',
            backgroundColor: selectedCategory === 'all' ? colors.primary : colors.light,
            color: selectedCategory === 'all' ? '#F5F0E8' : colors.text,
          }}>Alle</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px',
              backgroundColor: selectedCategory === cat.id ? colors.primary : colors.light,
              color: selectedCategory === cat.id ? '#F5F0E8' : colors.text,
            }}>{cat.name}</button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: colors.muted, textAlign: 'center', letterSpacing: '1px' }}>LADEN...</p>
        ) : scores.length === 0 ? (
          <p style={{ color: colors.muted, textAlign: 'center' }}>Noch keine Scores in dieser Kategorie.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {scores.map((score, i) => (
              <div key={score.id} style={{
                backgroundColor: i < 3 ? '#FDFAF5' : '#FAF7F2',
                border: `1px solid ${i === 0 ? '#DAA520' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#C9B99A'}`,
                padding: '14px 16px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
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

function BotDuelResult({ userCorrect, botCorrect, total, botName, botEmoji, category, onBack }: any) {
  const userPct = Math.round((userCorrect / total) * 100);
  const botPct = Math.round((botCorrect / total) * 100);
  const won = userCorrect > botCorrect;
  const draw = userCorrect === botCorrect;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Georgia, serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px', fontSize: 'clamp(18px, 5vw, 24px)' }}>
          {won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}
        </h2>
        <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '14px', letterSpacing: '1px' }}>{category.name.toUpperCase()}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>👤</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '8px' }}>DU</div>
            <div style={{ fontSize: 'clamp(28px, 8vw, 36px)', fontWeight: 'bold', color: colors.primary }}>{userPct}%</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>{userCorrect}/{total} richtig</div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '20px 12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{botEmoji}</div>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px', marginBottom: '8px' }}>{botName.split(' ')[1]?.toUpperCase()}</div>
            <div style={{ fontSize: 'clamp(28px, 8vw, 36px)', fontWeight: 'bold', color: colors.primary }}>{botPct}%</div>
            <div style={{ fontSize: '12px', color: colors.muted }}>{botCorrect}/{total} richtig</div>
          </div>
        </div>
        <button style={btnPrimary} onClick={onBack}>Zurück zum Dashboard</button>
      </div>
    </div>
  );
}

function Quiz({ category, userId, bot, onFinish }: any) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [botAnswer, setBotAnswer] = useState<string | null>(null);
  const [userCorrect, setUserCorrect] = useState(0);
  const [botCorrect, setBotCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('questions').select('*').eq('category_id', category.id).limit(10).then(({ data }) => {
      setQuestions(data || []);
      setLoading(false);
    });
  }, [category]);

  const handleAnswer = async (answer: string) => {
    if (selected) return;
    const q = questions[current];
    const optionKeys = q.type === 'true_false' ? ['Wahr', 'Falsch'] : ['A', 'B', 'C', 'D'];
    const bAnswer = getBotAnswer(optionKeys, q.correct_answer, bot.accuracy);
    const userIsCorrect = answer === q.correct_answer;
    const botIsCorrect = bAnswer === q.correct_answer;
    setSelected(answer);
    setBotAnswer(bAnswer);
    const newUserCorrect = userIsCorrect ? userCorrect + 1 : userCorrect;
    const newBotCorrect = botIsCorrect ? botCorrect + 1 : botCorrect;
    if (userIsCorrect) setUserCorrect(newUserCorrect);
    if (botIsCorrect) setBotCorrect(newBotCorrect);

    setTimeout(async () => {
      if (current + 1 >= questions.length) {
        await supabase.from('scores').insert({
          user_id: userId,
          category_id: category.id,
          points: newUserCorrect * 10,
          correct_count: newUserCorrect,
          total_questions: questions.length,
        });
        setDone(true);
      } else {
        setCurrent(c => c + 1);
        setSelected(null);
        setBotAnswer(null);
      }
    }, 1500);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (questions.length === 0) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', marginBottom: '24px', textAlign: 'center' }}>Noch keine Fragen in dieser Kategorie.</p>
      <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück</button>
    </div>
  );

  if (done) return (
    <BotDuelResult userCorrect={userCorrect} botCorrect={botCorrect} total={questions.length} botName={bot.name} botEmoji={bot.emoji} category={category} onBack={onFinish} />
  );

  const q = questions[current];
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', borderRadius: '4px', padding: '10px 16px', marginBottom: '12px', marginTop: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px' }}>DU</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: colors.primary }}>{userCorrect}</div>
          </div>
          <div style={{ alignSelf: 'center', color: colors.muted, fontSize: '13px' }}>{current + 1}/{questions.length}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: colors.muted, letterSpacing: '1px' }}>{bot.emoji} {bot.name.split(' ')[1]?.toUpperCase()}</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: colors.primary }}>{botCorrect}</div>
          </div>
        </div>
        <div style={{ height: '4px', backgroundColor: colors.light, borderRadius: '2px', marginBottom: '24px' }}>
          <div style={{ height: '4px', backgroundColor: colors.primary, borderRadius: '2px', width: `${((current + 1) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: 'clamp(16px, 4vw, 20px)', color: colors.text, lineHeight: '1.6', marginBottom: '24px' }}>{q.question_text}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map(opt => {
            const isCorrect = opt.key === q.correct_answer;
            const isUserSelected = opt.key === selected;
            const isBotSelected = opt.key === botAnswer;
            let bg = '#FDFAF5', border = '1px solid #C9B99A', color = colors.text;
            if (selected) {
              if (isCorrect) { bg = '#E8F5E9'; border = '1px solid #4CAF50'; color = '#2E7D32'; }
              else if (isUserSelected) { bg = '#FDECEA'; border = '1px solid #E53935'; color = '#B71C1C'; }
            }
            return (
              <button key={opt.key} onClick={() => handleAnswer(opt.key)} style={{
                padding: '14px 16px', backgroundColor: bg, border, color,
                fontSize: 'clamp(14px, 3.5vw, 16px)', fontFamily: 'Georgia, serif',
                cursor: selected ? 'default' : 'pointer', borderRadius: '4px',
                textAlign: 'left', transition: 'all 0.2s', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                WebkitTapHighlightColor: 'transparent', minHeight: '52px',
              }}>
                <span style={{ flex: 1, paddingRight: '8px' }}>
                  <span style={{ fontWeight: 'bold', marginRight: '10px' }}>{opt.key}.</span>{opt.label}
                </span>
                {selected && (isUserSelected || isBotSelected) && (
                  <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {isUserSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>👤</span>}
                    {isBotSelected && <span style={{ backgroundColor: '#E8DFD0', borderRadius: '4px', padding: '2px 5px', fontSize: '12px' }}>{bot.emoji}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {selected && (
          <p style={{ marginTop: '14px', fontSize: '13px', color: colors.muted, textAlign: 'center' }}>
            {bot.name} hat {botAnswer === q.correct_answer ? '✓ richtig' : '✗ falsch'} geantwortet
          </p>
        )}
      </div>
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [view, setView] = useState<'home' | 'selectCategory' | 'selectBot' | 'quiz' | 'highscores'>('home');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedBot, setSelectedBot] = useState<any>(null);

  useEffect(() => {
    supabase.from('categories').select('*').then(({ data }) => setCategories(data || []));
  }, []);

  const icons: Record<string, string> = {
    'Weltgeschichte': '🌍', 'Antike Geschichte': '🏛️', 'Schweizer Geschichte': '🇨🇭',
    'Philosophie & Denker': '💭', 'Biografien': '📖', 'Wirtschaftsgeschichte': '📈',
  };

  if (view === 'quiz') return <Quiz category={selectedCategory} userId={user.id} bot={selectedBot} onFinish={() => setView('home')} />;
  if (view === 'highscores') return <Highscores onBack={() => setView('home')} />;

  if (view === 'selectBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('selectCategory')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '6px', fontWeight: 'normal' }}>Wähle deinen Gegner</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '24px' }}>{selectedCategory?.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bots.map(bot => (
            <div key={bot.name} onClick={() => { setSelectedBot(bot); setView('quiz'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '32px', flexShrink: 0 }}>{bot.emoji}</div>
              <div>
                <div style={{ color: colors.text, fontSize: '16px', marginBottom: '4px' }}>{bot.name}</div>
                <div style={{ color: colors.muted, fontSize: '13px' }}>
                  {bot.level === 1 ? 'Einfach — ca. 30% richtig' : bot.level === 2 ? 'Mittel — ca. 55% richtig' : 'Schwer — ca. 80% richtig'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (view === 'selectCategory') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '24px', padding: '8px 0' }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: 'clamp(18px, 4vw, 22px)', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setView('selectBot'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '20px 16px', cursor: 'pointer', borderRadius: '4px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icons[cat.name] || '📚'}</div>
              <div style={{ color: colors.text, fontSize: 'clamp(13px, 3vw, 15px)' }}>{cat.name}</div>
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
          <div onClick={() => setView('selectCategory')} style={{ backgroundColor: colors.primary, padding: '28px 20px', cursor: 'pointer', borderRadius: '4px', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚔️</div>
            <div style={{ color: '#F5F0E8', fontSize: 'clamp(14px, 3.5vw, 17px)', letterSpacing: '1px', marginBottom: '6px' }}>DUELL STARTEN</div>
            <div style={{ color: '#C9A0AC', fontSize: '12px' }}>Tritt gegen einen Bot an</div>
          </div>
          <div onClick={() => setView('highscores')} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '28px 20px', borderRadius: '4px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
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
        <p style={{ marginTop: '48px', fontSize: '12px', color: '#A0896E', letterSpacing: '1px', lineHeight: '1.8' }}>Weltgeschichte · Antike · Schweizer Geschichte<br />Philosophie · Biografien · Wirtschaft</p>
      </div>
    </div>
  );
}

export default App;