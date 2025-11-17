import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Footer from '../Footer';

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return (
    <section className='home-panel modern-home'>
      <header className='home-header'>
        <h1>
          {t('home.title')}
        </h1>
        <p className='subtitle'>{t('home.subtitle')}</p>
      </header>
      <main className='home-main'>
        <div className='feature-grid'>
          <button className='feature-card' onClick={() => navigate('/questionnaire')}>
            <span className='feature-icon'>📝</span>
            <h2>{t('navigation.questionnaire')}</h2>
            <p>{t('home.questionnaireDescription')}</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/domain')}>
            <span className='feature-icon'>🔍</span>
            <h2>{t('navigation.domainScan')}</h2>
            <p>{t('home.domainScanDescription')}</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/report')}>
            <span className='feature-icon'>📊</span>
            <h2>{t('navigation.report')}</h2>
            <p>{t('home.reportDescription')}</p>
          </button>
          <button className='feature-card' onClick={() => navigate('/data')}>
            <span className='feature-icon'>⏎</span>
            <h2>{t('buttons.import')}</h2>
            <p>{t('home.importDescription')}</p>
          </button>
        </div>
        <div className='home-notes'>
          <div className='note'>
            <span className='note-icon'>🔒</span>
            <span className='note-text'>
              {t('home.privacyNote')}
            </span>
          </div>
        </div>
      </main>
      <Footer />
    </section>
  );
};

export default Home;
