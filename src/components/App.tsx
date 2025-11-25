import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Home from './Home';
import PageNotFound from './NotFound';
import Questionnaire from './Questionnaire';
import DomainScanner from './DomainScanner';
import Report from './Report';
import Import from './Import';
import { AppStateProvider, useAppState } from '../context/AppStateContext';
import { TrackedButton } from './TrackedButton';
import ResetDialog from './ResetDialog';
import '../styles.css';


const AppContent = () => {
  const { resetAll, exportJSON, answers, domainScanAggregate } = useAppState();
  const { t } = useTranslation('common');
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Dark mode state and persistence
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      // Default to light mode on first visit
      return false;
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const hasData = Object.keys(answers).length > 0 || !!domainScanAggregate;

  const handleExportAndReset = () => {
    // Export JSON
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `risk-assessment-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Then reset
    resetAll();
  };

  const handleReset = () => {
    resetAll();
  };

  return (
    <Router>
      <section className='app-panel panel'>
        <div className='toggle-row'>
          {hasData && (
            <TrackedButton
              className='reset-btn'
              trackingName='reset_all_click'
              trackingProperties={{ has_answers: Object.keys(answers).length > 0, has_scans: !!domainScanAggregate }}
              onClick={() => setShowResetDialog(true)}
              title='Reset all data'
              style={{ marginRight: '0.5rem' }}
            >
              🔄 {t('buttons.reset')}
            </TrackedButton>
          )}
          <TrackedButton
            className='toggle-btn'
            trackingName='toggle_theme'
            trackingProperties={{ mode: darkMode ? 'light' : 'dark' }}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDarkMode((prev) => !prev)}
          >
            {darkMode ? t('navigation.themeLight') : t('navigation.themeDark')}
          </TrackedButton>
        </div>

        <ResetDialog
          isOpen={showResetDialog}
          onCancel={() => setShowResetDialog(false)}
          onReset={handleReset}
          onExportAndReset={handleExportAndReset}
          hasData={hasData}
        />

        <nav>
          <NavLink to='/' end>{t('navigation.home')}</NavLink>
          <NavLink to='/questionnaire'>{t('navigation.questionnaire')}</NavLink>
          <NavLink to='/domain'>{t('navigation.domainScan')}</NavLink>
          <NavLink to='/report'>{t('navigation.report')}</NavLink>
          <NavLink to='/data'>Import</NavLink>
        </nav>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/questionnaire' element={<Questionnaire />} />
          <Route path='/domain' element={<DomainScanner />} />
          <Route path='/report' element={<Report />} />
          <Route path='/data' element={<Import />} />
          <Route path='*' element={<PageNotFound />} />
        </Routes>
      </section>
    </Router>
  );
};

const App = () => {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
};

export default App;
