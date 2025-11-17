import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../../context/AppStateContext';
import CategoryRadarChart from '../CategoryRadarChart';
import Footer from '../Footer';
import Dropdown from '../Dropdown';

const Questionnaire: React.FC = () => {
  const { questions, answers, setAnswer, score } = useAppState();
  const { t } = useTranslation('common');

  // Calculate progress metrics
  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter((key) => answers[key] !== '').length;
  }, [answers]);

  const totalQuestions = questions.length;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  // Determine color based on score
  const getScoreColor = (percent: number) => {
    if (percent >= 80) return 'score-excellent';
    if (percent >= 60) return 'score-good';
    if (percent >= 40) return 'score-fair';
    return 'score-poor';
  };

  return (
    <div className='panel questionnaire-panel'>
      <div className='questionnaire-header'>
        <div className='questionnaire-header-content'>
          <h2>{t('questionnaire.title')}</h2>
        </div>
        <p className='questionnaire-subtitle'>
          {t('questionnaire.subtitle')}
        </p>
      </div>

      {/* Progress Section */}
      <div className='progress-section'>
        <div className='progress-stats'>
          <div className='stat-card'>
            <div className='stat-label'>{t('questionnaire.questionsAnswered')}</div>
            <div className='stat-value'>{answeredCount} / {totalQuestions}</div>
            <div className='stat-subtitle'>{t('questionnaire.complete', { percent: progressPercent })}</div>
          </div>
          <div className={`stat-card score-card ${getScoreColor(score.percent)}`}>
            <div className='stat-label'>{t('questionnaire.overallScore')}</div>
            <div className='stat-value-large'>{score.percent}%</div>
            <div className='stat-subtitle'>
              {score.percent >= 80 ? t('status.excellent') :
               score.percent >= 60 ? t('status.good') :
               score.percent >= 40 ? t('status.fair') : t('status.needsImprovement')}
            </div>
          </div>
        </div>
        <div className='progress-bar-container'>
          <div className='progress-bar' style={{ '--progress-width': `${progressPercent}%` } as React.CSSProperties} />
        </div>
      </div>

      {/* Questions */}
      <form className='question-list'>
        {questions.map((q, index) => (
          <div key={q.id} className='question-item-modern'>
            <div className='question-header'>
              <span className='question-number'>Q{index + 1}</span>
              <label htmlFor={q.id} className='question-text'>{q.text}</label>
            </div>
            <Dropdown
              id={q.id}
              value={answers[q.id] || ''}
              onChange={(value) => setAnswer(q.id, value)}
              options={q.options}
              placeholder={t('questionnaire.selectAnswer')}
            />
          </div>
        ))}
      </form>

      {/* Category Breakdown with Radar Chart */}
      <div className='category-breakdown-modern'>
        <h3>{t('questionnaire.categoryAnalysis')}</h3>
        <p className='section-subtitle'>
          {t('questionnaire.categoryBreakdown')}
        </p>
        <CategoryRadarChart categories={score.categories} />

        <div className='category-details'>
          {score.categories.map((c) => (
            <div key={c.category} className='category-detail-card'>
              <div className='category-detail-header'>
                <span className='category-name'>{c.category}</span>
                <span className={`category-score ${getScoreColor(c.percent)}`}>{c.percent}%</span>
              </div>
              <div className='category-progress-bar'>
                <div
                  className={`category-progress-fill ${getScoreColor(c.percent)}`}
                  style={{ '--progress-width': `${c.percent}%` } as React.CSSProperties}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Questionnaire;
