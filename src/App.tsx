import React from 'react';
import './App.css';

function App() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F5F0E8',
      fontFamily: 'Georgia, serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '600px'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '8px'
        }}>📚</div>

        <h1 style={{
          fontSize: '52px',
          fontWeight: 'bold',
          color: '#6B1E2E',
          margin: '0 0 8px 0',
          letterSpacing: '2px'
        }}>BOOKSMART</h1>

        <p style={{
          fontSize: '16px',
          color: '#8B6F5E',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          marginBottom: '48px'
        }}>Wissen aus Büchern</p>

        <div style={{
          backgroundColor: '#6B1E2E',
          color: '#F5F0E8',
          padding: '16px 48px',
          fontSize: '18px',
          border: 'none',
          cursor: 'pointer',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '16px',
          display: 'inline-block',
          borderRadius: '2px'
        }}>Anmelden</div>

        <br />

        <div style={{
          backgroundColor: 'transparent',
          color: '#6B1E2E',
          padding: '16px 48px',
          fontSize: '18px',
          border: '2px solid #6B1E2E',
          cursor: 'pointer',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          display: 'inline-block',
          borderRadius: '2px'
        }}>Registrieren</div>

        <p style={{
          marginTop: '64px',
          fontSize: '13px',
          color: '#A0896E',
          letterSpacing: '1px'
        }}>KATEGORIEN: Weltgeschichte · Antike · Schweizer Geschichte · Philosophie · Biografien · Wirtschaft</p>
      </div>
    </div>
  );
}

export default App;