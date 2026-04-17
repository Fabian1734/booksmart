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
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '16px',
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
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  backgroundColor: 'transparent',
  color: '#6B1E2E',
  border: '2px solid #6B1E2E',
};

const bots = [
  { name: 'Lernender Leo', level: 1, accuracy: 0.3, emoji: '🐣' },
  { name: 'Wissbegierige Mia', level: 2, accuracy: 0.55, emoji: '📖' },
  { name: 'Professor Max', level: 3, accuracy: 0.8, emoji: '🎓' },
];

function BotDuelResult({ userCorrect, botCorrect, total, botName, botEmoji, category, onBack }: any) {
  const userPct = Math.round((userCorrect / total) * 100);
  const botPct = Math.round((botCorrect / total) * 100);
  const won = userCorrect > botCorrect;
  const draw = userCorrect === botCorrect;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Georgia, serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>{won ? '🏆' : draw ? '🤝' : '📚'}</div>
        <h2 style={{ color: colors.primary, letterSpacing: '2px', marginBottom: '8px' }}>
          {won ? 'GEWONNEN!' : draw ? 'UNENTSCHIEDEN' : 'VERLOREN'}
        </h2>
        <p style={{ color: colors.muted, marginBottom: '32px', fontSize: '14px', letterSpacing: '1px' }}>{category.name.toUpperCase()}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${won || draw ? colors.primary : '#C9B99A'}`, padding: '24px', borderRadius: '4px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>👤</div>
            <div style={{ fontSize: '13px', color: colors.muted, letterSpacing: '1px', marginBottom: '8px' }}>DU</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: colors.primary }}>{userPct}%</div>
            <div style={{ fontSize: '13px', color: colors.muted }}>{userCorrect}/{total} richtig</div>
          </div>
          <div style={{ backgroundColor: '#FDFAF5', border: `2px solid ${!won && !draw ? colors.primary : '#C9B99A'}`, padding: '24px', borderRadius: '4px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{botEmoji}</div>
            <div style={{ fontSize: '13px', color: colors.muted, letterSpacing: '1px', marginBottom: '8px' }}>{botName.toUpperCase()}</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: colors.primary }}>{botPct}%</div>
            <div style={{ fontSize: '13px', color: colors.muted }}>{botCorrect}/{total} richtig</div>
          </div>
        </div>

        <button style={btnPrimary} onClick={onBack}>Zurück zum Dashboard</button>
      </div>
    </div>
  );
}

function Quiz({ category, userId, botAccuracy, botName, botEmoji, onFinish }: any) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [botCorrect, setBotCorrect] = useState(0);

  useEffect(() => {
    supabase.from('questions').select('*').eq('category_id', category.id).limit(10).then(({ data }) => {
      setQuestions(data || []);
      setLoading(false);
    });
  }, [category]);

  const handleAnswer = async (answer: string) => {
    if (selected) return;
    setSelected(answer);
    const isCorrect = answer === questions[current].correct_answer;
    const newCorrect = isCorrect ? correct + 1 : correct;
    if (isCorrect) setCorrect(newCorrect);

    setTimeout(async () => {
      if (current + 1 >= questions.length) {
        const botScore = questions.reduce((acc) => acc + (Math.random() < botAccuracy ? 1 : 0), 0);
        setBotCorrect(botScore);
        await supabase.from('scores').insert({
          user_id: userId,
          category_id: category.id,
          points: newCorrect * 10,
          correct_count: newCorrect,
          total_questions: questions.length,
        });
        setDone(true);
      } else {
        setCurrent(c => c + 1);
        setSelected(null);
      }
    }, 1000);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', letterSpacing: '2px' }}>LADEN...</p>
    </div>
  );

  if (questions.length === 0) return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <p style={{ color: colors.muted, fontFamily: 'Georgia, serif', marginBottom: '24px' }}>Noch keine Fragen in dieser Kategorie.</p>
      <button style={{ ...btnSecondary, width: 'auto', padding: '12px 32px' }} onClick={onFinish}>Zurück</button>
    </div>
  );

  if (done) return (
    <BotDuelResult
      userCorrect={correct}
      botCorrect={botCorrect}
      total={questions.length}
      botName={botName}
      botEmoji={botEmoji}
      category={category}
      onBack={onFinish}
    />
  );

  const q = questions[current];
  const options = q.type === 'true_false'
    ? [{ key: 'Wahr', label: 'Wahr' }, { key: 'Falsch', label: 'Falsch' }]
    : [{ key: 'A', label: q.option_a }, { key: 'B', label: q.option_b }, { key: 'C', label: q.option_c }, { key: 'D', label: q.option_d }].filter(o => o.label);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: colors.muted, fontSize: '13px', letterSpacing: '1px' }}>DUELL vs. {botName.toUpperCase()}</span>
          <span style={{ color: colors.muted, fontSize: '13px' }}>{current + 1} / {questions.length}</span>
        </div>
        <div style={{ height: '4px', backgroundColor: colors.light, borderRadius: '2px', marginBottom: '40px' }}>
          <div style={{ height: '4px', backgroundColor: colors.primary, borderRadius: '2px', width: `${((current + 1) / questions.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: '20px', color: colors.text, lineHeight: '1.6', marginBottom: '32px' }}>{q.question_text}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {options.map(opt => {
            let bg = '#FDFAF5', border = '1px solid #C9B99A', color = colors.text;
            if (selected) {
              if (opt.key === q.correct_answer) { bg = '#E8F5E9'; border = '1px solid #4CAF50'; color = '#2E7D32'; }
              else if (opt.key === selected) { bg = '#FDECEA'; border = '1px solid #E53935'; color = '#B71C1C'; }
            }
            return (
              <button key={opt.key} onClick={() => handleAnswer(opt.key)} style={{ padding: '16px 20px', backgroundColor: bg, border, color, fontSize: '16px', fontFamily: 'Georgia, serif', cursor: selected ? 'default' : 'pointer', borderRadius: '4px', textAlign: 'left', transition: 'all 0.2s' }}>
                <span style={{ fontWeight: 'bold', marginRight: '12px' }}>{opt.key}.</span>{opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [view, setView] = useState<'home' | 'selectCategory' | 'selectBot' | 'quiz'>('home');
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

  if (view === 'quiz') return (
    <Quiz
      category={selectedCategory}
      userId={user.id}
      botAccuracy={selectedBot.accuracy}
      botName={selectedBot.name}
      botEmoji={selectedBot.emoji}
      onFinish={() => setView('home')}
    />
  );

  if (view === 'selectBot') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif', padding: '20px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', paddingTop: '40px' }}>
        <button onClick={() => setView('selectCategory')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '32px', padding: 0 }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: '20px', marginBottom: '8px', fontWeight: 'normal' }}>Wähle deinen Gegner</h2>
        <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '32px' }}>{selectedCategory?.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bots.map(bot => (
            <div key={bot.name} onClick={() => { setSelectedBot(bot); setView('quiz'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '24px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '20px' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = colors.primary)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#C9B99A')}>
              <div style={{ fontSize: '36px' }}>{bot.emoji}</div>
              <div>
                <div style={{ color: colors.text, fontSize: '17px', marginBottom: '4px' }}>{bot.name}</div>
                <div style={{ color: colors.muted, fontSize: '13px' }}>
                  {bot.level === 1 ? 'Einfach — ca. 30% richtige Antworten' : bot.level === 2 ? 'Mittel — ca. 55% richtige Antworten' : 'Schwer — ca. 80% richtige Antworten'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (view === 'selectCategory') return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif', padding: '20px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto', paddingTop: '40px' }}>
        <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', marginBottom: '32px', padding: 0 }}>← Zurück</button>
        <h2 style={{ color: colors.text, fontSize: '20px', marginBottom: '24px', fontWeight: 'normal' }}>Wähle eine Kategorie</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {categories.map(cat => (
            <div key={cat.id} onClick={() => { setSelectedCategory(cat); setView('selectBot'); }} style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '24px', cursor: 'pointer', borderRadius: '4px' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = colors.primary)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#C9B99A')}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icons[cat.name] || '📚'}</div>
              <div style={{ color: colors.text, fontSize: '15px' }}>{cat.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.bg, fontFamily: 'Georgia, serif', padding: '20px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', paddingTop: '20px' }}>
          <h1 style={{ color: colors.primary, letterSpacing: '2px', margin: 0, fontSize: '28px' }}>BOOKSMART</h1>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px' }}>Abmelden</button>
        </div>
        <p style={{ color: colors.muted, fontSize: '14px', letterSpacing: '1px', marginBottom: '40px' }}>WILLKOMMEN ZURÜCK</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div onClick={() => setView('selectCategory')} style={{ backgroundColor: colors.primary, padding: '32px 24px', cursor: 'pointer', borderRadius: '4px' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚔️</div>
            <div style={{ color: '#F5F0E8', fontSize: '17px', letterSpacing: '1px', marginBottom: '8px' }}>DUELL STARTEN</div>
            <div style={{ color: '#C9A0AC', fontSize: '13px' }}>Tritt gegen einen Bot an</div>
          </div>

          <div style={{ backgroundColor: '#FDFAF5', border: '1px solid #C9B99A', padding: '32px 24px', borderRadius: '4px', opacity: 0.5 }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏆</div>
            <div style={{ color: colors.text, fontSize: '17px', letterSpacing: '1px', marginBottom: '8px' }}>HIGHSCORES</div>
            <div style={{ color: colors.muted, fontSize: '13px' }}>Bald verfügbar</div>
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
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📚</div>
        <h1 style={{ fontSize: '52px', fontWeight: 'bold', color: colors.primary, margin: '0 0 8px 0', letterSpacing: '2px' }}>BOOKSMART</h1>
        <p style={{ fontSize: '16px', color: colors.muted, letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '48px' }}>Wissen aus Büchern</p>
        <button style={btnPrimary} onClick={() => setMode('login')}>Anmelden</button>
        <button style={btnSecondary} onClick={() => setMode('register')}>Registrieren</button>
        <p style={{ marginTop: '64px', fontSize: '13px', color: '#A0896E', letterSpacing: '1px' }}>KATEGORIEN: Weltgeschichte · Antike · Schweizer Geschichte · Philosophie · Biografien · Wirtschaft</p>
      </div>
    </div>
  );
}

export default App;