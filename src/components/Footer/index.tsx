import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrackedLink } from '../TrackedLink';

const Footer: React.FC = () => {
  const { t, i18n } = useTranslation('common');

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <footer className='app-footer'>
      <div className='footer-content'>
        <div className='footer-text'>
          {t('footer.builtBy')}{' '}
          <TrackedLink
            className='footer-link'
            href='https://auxiom.com'
            rel='noopener noreferrer'
            target='_blank'
          >
            {t('footer.blacksmith')}
          </TrackedLink>
          . {t('footer.freeAndOpenSource')}{' '}
          <TrackedLink
            className='footer-link'
            href='https://github.com/blacksmith-infosec/risk-assessments'
            target='_blank'
            rel='noopener noreferrer'
          >
            {t('footer.openSource')}
          </TrackedLink>
          . {t('footer.haveSuggestion')}{' '}
          <TrackedLink
            className='footer-link'
            href='https://github.com/blacksmith-infosec/risk-assessments/issues'
            target='_blank'
            rel='noopener noreferrer'
          >
            {t('footer.letUsKnow')}
          </TrackedLink>
          !
        </div>
        <div className='footer-language-selector'>
          <select
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
            className='language-dropdown'
            aria-label={t('footer.selectLanguage')}
            title={t('footer.selectLanguage')}
          >
            <option value='en'>{t('footer.languageEnglish')}</option>
            <option value='es'>{t('footer.languageSpanish')}</option>
          </select>
          <TrackedLink
            href='https://auxiom.com'
            target='_blank'
            rel='noopener noreferrer'
            className='footer-logo-link'
          >
            <img
              alt='Auxiom'
              src='https://auxiom.com/wp-content/uploads/2025/05/auxiom-logo-gold.svg'
              className='footer-logo'
            />
          </TrackedLink>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
