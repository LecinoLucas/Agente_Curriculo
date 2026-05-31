import React, { useState } from 'react';
import { mockJobs, mockCandidateArea } from './mockData';

const App = () => {
  const [view, setView] = useState('vacancy-list');

  const renderView = () => {
    switch (view) {
      case 'vacancy-list':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-6 text-marajo-red">Vagas Disponíveis</h1>
            {mockJobs.map(job => (
              <div key={job.id} className="bg-white p-4 rounded shadow mb-4">
                <h2 className="text-xl font-semibold">{job.title}</h2>
                <p className="text-gray-600 mb-4">{job.description}</p>
                <button 
                  onClick={() => setView('apply')}
                  className="bg-marajo-red text-white px-4 py-2 rounded"
                >
                  Candidatar-se
                </button>
              </div>
            ))}
          </div>
        );
      case 'apply':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Candidatura</h1>
            <p>Formulário de candidatura (mockado).</p>
            <button 
              onClick={() => setView('confirmation')}
              className="bg-marajo-red text-white px-4 py-2 rounded mt-4"
            >
              Enviar candidatura
            </button>
          </div>
        );
      case 'confirmation':
        return (
          <div className="p-6 text-center">
            <h1 className="text-3xl font-bold mb-4">Candidatura Enviada!</h1>
            <button 
              onClick={() => setView('candidate-area')}
              className="bg-gray-800 text-white px-4 py-2 rounded"
            >
              Ir para minha área
            </button>
          </div>
        );
      case 'candidate-area':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Bem-vindo, {mockCandidateArea.name}</h1>
            <div className="bg-white p-4 rounded shadow">
              <h2 className="font-semibold">Vagas em processo</h2>
              {mockCandidateArea.jobs.map(job => (
                <div key={job.id} className="mt-2 flex justify-between">
                  <span>{job.title}</span>
                  <span className="text-sm text-gray-500">{job.progress}</span>
                  <button 
                    onClick={() => setView('assessment')}
                    className="text-marajo-red underline text-sm"
                  >
                    Ver/Avaliar
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'assessment':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Avaliação</h1>
            <p>Protótipo da avaliação comportamental.</p>
            <button 
              onClick={() => setView('pre-admission')}
              className="bg-marajo-red text-white px-4 py-2 rounded mt-4"
            >
              Finalizar Avaliação
            </button>
          </div>
        );
      case 'pre-admission':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Pré-admissão</h1>
            <p>Upload de documentos (mockado).</p>
            <button 
              onClick={() => alert('Documentos enviados!')}
              className="bg-green-600 text-white px-4 py-2 rounded mt-4"
            >
              Enviar Documentos
            </button>
          </div>
        );
      default:
        return <div>Not found</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
        <span className="text-xl font-bold text-marajo-red">ATS RH</span>
        <div className="space-x-4">
          <button onClick={() => setView('vacancy-list')}>Vagas</button>
          <button onClick={() => setView('candidate-area')}>Área do Candidato</button>
        </div>
      </nav>
      {renderView()}
    </div>
  );
};

export default App;
