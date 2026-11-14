import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { Layout, type AppRoute } from './components/Layout';
import { CommandCenter } from './components/CommandCenter';
import { IngestionWorkspace } from './components/IngestionWorkspace';
import { EvidenceMap } from './components/EvidenceMap';
import { BriefingWorkspace } from './components/BriefingWorkspace';
import { AdvisoryStudio } from './components/AdvisoryStudio';
import { ActionBoard } from './components/ActionBoard';
import { LoginPage } from './pages/LoginPage';
import { RadarPage } from './pages/RadarPage';
import { QAEvaluatorPage } from './pages/QAEvaluatorPage';

const WorkspaceRouter: React.FC = () => {
  const { activeRole, bootLoading } = useStudio();
  const [route, setRoute] = useState<AppRoute>('/command-center');
  const prevRoleRef = useRef<typeof activeRole>(null);

  useEffect(() => {
    if (!prevRoleRef.current && activeRole) {
      setRoute('/command-center');
    } else if (activeRole !== 'EVALUATOR' && route === '/qa-evaluator') {
      setRoute('/command-center');
    }
    prevRoleRef.current = activeRole;
  }, [activeRole, route]);

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700 text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-700" aria-hidden="true" />
        <span>Loading workspace...</span>
      </div>
    );
  }

  if (!activeRole) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (route) {
      case '/command-center':
        return <CommandCenter onNavigate={setRoute} />;
      case '/ingest':
        return <IngestionWorkspace />;
      case '/map':
        return <EvidenceMap />;
      case '/radar':
        return <RadarPage />;
      case '/briefing-studio':
        return <BriefingWorkspace onNavigate={setRoute} />;
      case '/citizen-advisory':
        return <AdvisoryStudio onNavigate={setRoute} />;
      case '/tasks':
        return <ActionBoard onNavigate={setRoute} />;
      case '/qa-evaluator':
        return <QAEvaluatorPage />;
      default:
        return <CommandCenter onNavigate={setRoute} />;
    }
  };

  return (
    <Layout activeRoute={route} onNavigate={setRoute}>
      {renderPage()}
    </Layout>
  );
};

export default function App() {
  return (
    <StudioProvider>
      <WorkspaceRouter />
    </StudioProvider>
  );
}
